#!/usr/bin/env node
// Builds resources/compounds/compounds.json from scripts/compound-names.txt by looking each
// display name (or pinned CID) up in PubChem PUG-REST. DEV-TIME ONLY — the app never goes
// online (SPEC.md: network use at development time approved for this script).
//
//   node scripts/build-compounds.mjs            fetch lines not yet in the JSON (reuses its
//                                               records for the others), write the JSON
//   node scripts/build-compounds.mjs --refresh  refetch every line
//   node scripts/build-compounds.mjs --check    offline: validate the list/JSON pair
//
// A line may end with `cid=NNN` (pin the PubChem record) and/or `smiles=...` (curated SMILES
// replacing PubChem's, e.g. Grignard reagents that PubChem stores as separate ions; formula and
// MW still come from PubChem, and chem-core's tests check the SMILES against them).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIST = join(ROOT, 'scripts', 'compound-names.txt');
const OUT = join(ROOT, 'resources', 'compounds', 'compounds.json');
const PUG = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound';
// PubChem renamed IsomericSMILES → SMILES in 2025; ask for both, use whichever comes back.
const PROPS = 'SMILES,IsomericSMILES,MolecularFormula,MolecularWeight';
const MIN_INTERVAL_MS = 220; // ≤ 5 requests per second (PubChem usage policy)
const RETRIES = 5;

/** Same rule as chem-core's names.ts: NFC, lower case, ignore spaces - , ( ) [ ] ' ’. */
export function normalise(name) {
  return name
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s\-,()[\]'’]/g, '');
}

/** Parses the curated list: [{ name, synonyms, cid?, smiles?, line }]. Throws if malformed. */
export function readList(text) {
  const out = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const parts = line.split('|').map((p) => p.trim());
    const fields = {};
    while (parts.length > 1 && /^(cid=\d+|smiles=\S+)$/.test(parts[parts.length - 1])) {
      const field = parts.pop();
      const eq = field.indexOf('=');
      fields[field.slice(0, eq)] = field.slice(eq + 1);
    }
    if (parts.some((p) => p === '' || /^(cid|smiles)=/.test(p))) {
      throw new Error(`line ${i + 1}: empty name or misplaced field`);
    }
    const [name, ...synonyms] = parts;
    out.push({
      name,
      synonyms,
      ...(fields.cid === undefined ? {} : { cid: Number(fields.cid) }),
      ...(fields.smiles === undefined ? {} : { smiles: fields.smiles }),
      line: i + 1,
    });
  });
  return out;
}

/** Problems with a list/JSON pair (empty array = consistent). */
export function checkPair(list, json) {
  const problems = [];
  if (json?.format !== 'chalkbond-compounds' || json?.version !== 1) {
    problems.push('compounds.json: wrong format/version');
    return problems;
  }
  if (!Array.isArray(json.entries)) return [...problems, 'compounds.json: no entries array'];
  if (json.entries.length !== list.length) {
    problems.push(`list has ${list.length} compounds, JSON has ${json.entries.length}`);
  }
  list.forEach((item, i) => {
    const e = json.entries[i];
    if (!e) return;
    if (e.name !== item.name || JSON.stringify(e.synonyms) !== JSON.stringify(item.synonyms)) {
      problems.push(`line ${item.line}: "${item.name}" differs from JSON entry ${i} ("${e.name}")`);
    }
    if (item.cid !== undefined && e.cid !== item.cid) {
      problems.push(`line ${item.line}: pinned cid ${item.cid}, JSON has ${e.cid}`);
    }
    if (item.smiles !== undefined && e.smiles !== item.smiles) {
      problems.push(`line ${item.line}: curated SMILES ${item.smiles}, JSON has ${e.smiles}`);
    }
    for (const key of ['smiles', 'formula']) {
      if (typeof e[key] !== 'string' || e[key] === '') {
        problems.push(`"${e.name}": missing ${key}`);
      }
    }
    if (typeof e.mw !== 'number' || !(e.mw > 0)) problems.push(`"${e.name}": bad mw`);
  });
  const seen = new Map();
  for (const item of list) {
    for (const key of [item.name, ...item.synonyms]) {
      const n = normalise(key);
      const prev = seen.get(n);
      if (prev !== undefined) problems.push(`"${key}" (line ${item.line}) collides with "${prev}"`);
      else seen.set(n, key);
    }
  }
  return problems;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastRequest = 0;

async function pubchem(item) {
  const path = item.cid !== undefined ? `cid/${item.cid}` : `name/${encodeURIComponent(item.name)}`;
  const url = `${PUG}/${path}/property/${PROPS}/JSON`;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': 'chalkbond-build-compounds' } });
    if (res.status === 503 || res.status === 504) {
      await sleep(1000 * (attempt + 1)); // PUGREST.ServerBusy / timeout: back off and retry
      continue;
    }
    const body = await res.json();
    if (!res.ok) throw new Error(body?.Fault?.Message ?? `HTTP ${res.status}`);
    const p = body?.PropertyTable?.Properties?.[0];
    const smiles = p?.SMILES ?? p?.IsomericSMILES;
    if (!p || !smiles) throw new Error('no properties returned');
    return { smiles, formula: p.MolecularFormula, mw: Number(p.MolecularWeight), cid: p.CID };
  }
  throw new Error('PubChem kept answering "busy"');
}

/** Fetches each line, or reuses a `previous` record with the same name (and pinned cid). */
async function build(list, previous) {
  const entries = [];
  const failures = [];
  let fetched = 0;
  for (const item of list) {
    try {
      const old = previous.get(item.name);
      const reuse = old !== undefined && (item.cid === undefined || old.cid === item.cid);
      const found = reuse
        ? { smiles: old.smiles, formula: old.formula, mw: old.mw, cid: old.cid }
        : await pubchem(item);
      if (!reuse && ++fetched % 25 === 0) console.log(`fetched ${fetched}…`);
      entries.push({
        name: item.name,
        synonyms: item.synonyms,
        ...found,
        ...(item.smiles === undefined ? {} : { smiles: item.smiles }),
      });
    } catch (e) {
      failures.push(`line ${item.line} "${item.name}": ${e.message}`);
    }
  }
  console.log(`fetched ${fetched}, reused ${entries.length - fetched}`);
  return { entries, failures, fetched };
}

async function main() {
  const list = readList(readFileSync(LIST, 'utf8'));
  if (process.argv.includes('--check')) {
    const problems = checkPair(list, JSON.parse(readFileSync(OUT, 'utf8')));
    for (const p of problems) console.error(p);
    console.log(problems.length === 0 ? `ok: ${list.length} compounds` : 'check failed');
    process.exit(problems.length === 0 ? 0 : 1);
  }

  const listProblems = checkPair(list, {
    format: 'chalkbond-compounds',
    version: 1,
    entries: [],
  }).filter((p) => p.includes('collides'));
  if (listProblems.length > 0) {
    for (const p of listProblems) console.error(p);
    process.exit(1);
  }
  const previous = new Map();
  let previousSource;
  if (!process.argv.includes('--refresh')) {
    try {
      const old = JSON.parse(readFileSync(OUT, 'utf8'));
      previousSource = old.source;
      for (const e of old.entries) previous.set(e.name, e);
    } catch {
      // no usable previous JSON: fetch everything
    }
  }
  const { entries, failures, fetched } = await build(list, previous);
  if (failures.length > 0) {
    for (const f of failures) console.error(f);
    console.error(`${failures.length} lookups failed; nothing written.`);
    process.exit(1);
  }
  const date = new Date().toISOString().slice(0, 10);
  const json = {
    format: 'chalkbond-compounds',
    version: 1,
    source:
      fetched === 0 && previousSource
        ? previousSource
        : `PubChem PUG-REST (pubchem.ncbi.nlm.nih.gov), retrieved ${date}; names curated in scripts/compound-names.txt`,
    entries,
  };
  const { format, resolveConfig } = await import('prettier');
  const config = (await resolveConfig(OUT)) ?? {};
  writeFileSync(OUT, await format(JSON.stringify(json), { ...config, parser: 'json' }));
  console.log(`wrote ${entries.length} compounds to ${OUT}`);
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  await main();
}
