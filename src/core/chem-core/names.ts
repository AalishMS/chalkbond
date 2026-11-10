// Offline name → structure lookup (SPEC-chem-core.md "Name lookup"). chem-core never reads
// files: the editor imports resources/compounds/compounds.json and passes it in.
import { z } from 'zod';
import type { Result, SubDoc } from '../doc-model/index';
import { parseMolfile, parseSmiles, type ImportOptions } from './convert';
import { ChemError } from './errors';

export interface CompoundEntry {
  /** Display name, e.g. 'acetic acid'. */
  readonly name: string;
  /** e.g. ['ethanoic acid', 'AcOH']. */
  readonly synonyms: readonly string[];
  readonly smiles: string;
  /** Hill formula, from the source. */
  readonly formula: string;
  /** Average molecular weight, from the source (PubChem rounds it to the element precision). */
  readonly mw: number;
  /** PubChem CID when the source is PubChem. */
  readonly cid?: number;
}

export interface NameIndex {
  /** Exact match on a name or synonym (normalised), or null. */
  lookup(query: string): CompoundEntry | null;
  /** Entries with a name or synonym starting with `prefix` (normalised); display-name matches
   * first, then shorter names. */
  suggest(prefix: string, limit?: number): CompoundEntry[];
  /** Best guesses for a query that matched nothing: prefix matches, then near spellings, closest
   * first (distance, display name before synonym, omission typos, then name). */
  closest(query: string, limit?: number): CompoundEntry[];
}

const ENTRY = z
  .object({
    name: z.string().min(1),
    synonyms: z.array(z.string().min(1)),
    smiles: z.string().min(1),
    formula: z.string().min(1),
    mw: z.number().positive(),
    cid: z.number().int().positive().optional(),
  })
  .strict();

const DICTIONARY = z
  .object({
    format: z.literal('chalkbond-compounds'),
    version: z.literal(1),
    source: z.string(),
    entries: z.array(ENTRY),
  })
  .strict();

/**
 * Matching form of a name: Unicode NFC, lower case, and spaces, hyphens, commas, brackets and
 * apostrophes ignored ('Acetic-acid' = 'acetic acid', "Brady's reagent" = 'bradys reagent').
 */
export function normaliseName(name: string): string {
  return name
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s\-,()[\]'’]/g, '');
}

type Rank = readonly [number, number, number];

function compareRank(a: Rank, b: Rank): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** True when `q` can be read off `key` by deleting characters (a pure omission typo). */
function isSubsequence(q: string, key: string): boolean {
  let i = 0;
  for (let j = 0; j < key.length && i < q.length; j++) if (key[j] === q[i]) i++;
  return i === q.length;
}

/** Validates the dictionary JSON (Zod) and indexes it. Throws on invalid or ambiguous data. */
export function createNameIndex(data: unknown): NameIndex {
  const parsed = DICTIONARY.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Invalid compound dictionary: ${parsed.error.issues[0]?.message ?? ''}`);
  }
  const entries: CompoundEntry[] = parsed.data.entries;
  const byKey = new Map<string, CompoundEntry>();
  /** [normalised key, entry, is the display name] in entry order. */
  const keys: [string, CompoundEntry, boolean][] = [];
  for (const entry of entries) {
    for (const [i, key] of [entry.name, ...entry.synonyms].entries()) {
      const n = normaliseName(key);
      if (n === '') throw new Error(`Invalid compound dictionary: empty name in "${entry.name}"`);
      const other = byKey.get(n);
      if (other && other !== entry) {
        throw new Error(
          `Invalid compound dictionary: "${key}" names both "${other.name}" and "${entry.name}"`,
        );
      }
      byKey.set(n, entry);
      keys.push([n, entry, i === 0]);
    }
  }

  const suggest = (prefix: string, limit = 10): CompoundEntry[] => {
    const p = normaliseName(prefix);
    if (p === '' || limit <= 0) return [];
    const hits = new Map<CompoundEntry, number>(); // entry → rank (lower is better)
    for (const [key, entry, isName] of keys) {
      if (!key.startsWith(p)) continue;
      const rank = key === p ? 0 : isName ? 1 : 2;
      hits.set(entry, Math.min(rank, hits.get(entry) ?? Infinity));
    }
    return [...hits]
      .sort(
        ([p1, r1], [p2, r2]) =>
          r1 - r2 || p1.name.length - p2.name.length || (p1.name < p2.name ? -1 : 1),
      )
      .slice(0, limit)
      .map(([entry]) => entry);
  };

  const closest = (query: string, limit = 5): CompoundEntry[] => {
    const q = normaliseName(query);
    if (q === '' || limit <= 0) return [];
    const out = suggest(query, limit);
    const maxDistance = Math.max(1, Math.floor(q.length / 4));
    // Best (distance, synonym-only, not-a-subsequence) over an entry's keys; lower is better.
    const near = new Map<CompoundEntry, [number, number, number]>();
    for (const [key, entry, isName] of keys) {
      if (Math.abs(key.length - q.length) > maxDistance) continue;
      const d = editDistance(q, key, maxDistance);
      if (d > maxDistance) continue;
      const cand: [number, number, number] = [d, isName ? 0 : 1, isSubsequence(q, key) ? 0 : 1];
      const best = near.get(entry);
      if (!best || compareRank(cand, best) < 0) near.set(entry, cand);
    }
    const ranked = [...near]
      .sort(([e1, r1], [e2, r2]) => compareRank(r1, r2) || (e1.name < e2.name ? -1 : 1))
      .map(([entry]) => entry);
    for (const entry of ranked) if (!out.includes(entry)) out.push(entry);
    return out.slice(0, limit);
  };

  return {
    lookup: (query) => byKey.get(normaliseName(query)) ?? null,
    suggest,
    closest,
  };
}

/** Optimal-string-alignment distance (edits incl. adjacent swaps); > `max` returns max + 1. */
function editDistance(a: string, b: string, max: number): number {
  const prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(
        (prev[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, (prev2[j - 2] as number) + 1);
      }
      row.push(v);
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prev2.splice(0, prev2.length, ...prev);
    prev = row;
  }
  return prev[b.length] as number;
}

export interface TextStructure {
  readonly sub: SubDoc;
  readonly source: 'name' | 'smiles' | 'molfile';
  readonly entry?: CompoundEntry;
}

/**
 * A structure from what the user typed or pasted: Molfile (text containing V2000/V3000) →
 * dictionary name → SMILES → `not-found` with suggestions. Dictionary before SMILES, so 'CO'
 * finds no name and parses as methanol SMILES, while 'acetone' never reaches the SMILES parser.
 */
export function structureFromText(
  text: string,
  names: NameIndex,
  opts: ImportOptions = {},
): Result<TextStructure, ChemError> {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: new ChemError('empty', 'Nothing to insert.') };

  if (/V[23]000/.test(text)) {
    const r = parseMolfile(text, opts);
    return r.ok ? { ok: true, value: { sub: r.value, source: 'molfile' } } : r;
  }

  const entry = names.lookup(trimmed);
  if (entry) {
    const r = parseSmiles(entry.smiles, opts);
    return r.ok ? { ok: true, value: { sub: r.value, source: 'name', entry } } : r;
  }

  const smiles = parseSmiles(trimmed, opts);
  if (smiles.ok) return { ok: true, value: { sub: smiles.value, source: 'smiles' } };
  if (smiles.error.code === 'too-large') return smiles;

  const suggestions = names.closest(trimmed).map((e) => e.name);
  const hint = suggestions.length > 0 ? ` Did you mean ${suggestions[0]}?` : '';
  return {
    ok: false,
    error: new ChemError(
      'not-found',
      `"${trimmed}" is not a compound name Chalkbond knows, nor valid SMILES.${hint}`,
      suggestions,
    ),
  };
}
