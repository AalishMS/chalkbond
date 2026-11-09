import { describe, expect, it } from 'vitest';
import { emptyDoc, insert } from '../doc-model/index';
import dictionary from '../../../resources/compounds/compounds.json';
import { NOW } from './__fixtures__/build';
import { toMolfile, parseSmiles } from './convert';
import { createNameIndex, normaliseName, structureFromText, type CompoundEntry } from './names';
import { smilesToMol } from './ocl';
import { perceive } from './perceive';

const names = createNameIndex(dictionary);
const entries = (dictionary as { entries: CompoundEntry[] }).entries;

/** Element counts of a formula string in any order; a trailing charge is ignored. */
function counts(formula: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [, el, n] of formula.replace(/[+-]\d*$/, '').matchAll(/([A-Z][a-z]?)(\d*)/g)) {
    out[el!] = (out[el!] ?? 0) + (n === '' ? 1 : Number(n));
  }
  return out;
}

/** PubChem rounds MW to the element precision ('153.8'): allow half its last digit, ≥ 0.01. */
function mwTolerance(mw: number): number {
  const decimals = (String(mw).split('.')[1] ?? '').length;
  return Math.max(0.01, 0.5 * 10 ** -decimals) + 1e-9;
}

describe('compound dictionary integrity', () => {
  it('has the expected size and source', () => {
    expect(entries.length).toBeGreaterThanOrEqual(350);
    expect((dictionary as { source: string }).source).toMatch(/PubChem/);
  });

  it('every entry parses; formula equals PubChem’s; MW within PubChem’s precision', () => {
    const problems: string[] = [];
    for (const e of entries) {
      const r = parseSmiles(e.smiles);
      if (!r.ok) {
        problems.push(`${e.name}: ${r.error.message}`);
        continue;
      }
      const doc = insert(emptyDoc(NOW), r.value, { x: 0, y: 0 })[0];
      const p = perceive(doc);
      const ours: Record<string, number> = {};
      let mw = 0;
      for (const f of p.fragments) {
        for (const [k, v] of Object.entries(f.formula.counts)) ours[k] = (ours[k] ?? 0) + v;
        mw += f.formula.mw ?? NaN;
      }
      const sorted = (c: Record<string, number>) => JSON.stringify(Object.entries(c).sort());
      if (sorted(ours) !== sorted(counts(e.formula))) {
        problems.push(`${e.name}: formula ${JSON.stringify(ours)} vs ${e.formula}`);
      }
      if (!(Math.abs(mw - e.mw) <= mwTolerance(e.mw))) {
        problems.push(`${e.name}: MW ${mw.toFixed(3)} vs ${e.mw}`);
      }
      if (p.warnings.length > 0) problems.push(`${e.name}: ${p.warnings[0]!.message}`);
    }
    expect(problems).toEqual([]);
  });

  it('no name or synonym is valid SMILES (it would shadow SMILES input)', () => {
    const shadowing: string[] = [];
    for (const e of entries) {
      for (const key of [e.name, ...e.synonyms]) {
        try {
          if (smilesToMol(key.trim(), { coordinates: false })) shadowing.push(key);
        } catch {
          // not SMILES: good
        }
      }
    }
    expect(shadowing).toEqual([]);
  });

  it('names and synonyms are unique after normalisation (createNameIndex would throw)', () => {
    const seen = new Set<string>();
    for (const e of entries) {
      for (const key of [e.name, ...e.synonyms]) {
        const n = normaliseName(key);
        expect(seen.has(n), key).toBe(false);
        seen.add(n);
      }
    }
  });
});

describe('createNameIndex', () => {
  const entry = {
    name: 'ethanol',
    synonyms: ['ethyl alcohol'],
    smiles: 'CCO',
    formula: 'C2H6O',
    mw: 46.07,
  };
  const dict = (list: unknown[]) => ({
    format: 'chalkbond-compounds',
    version: 1,
    source: 't',
    entries: list,
  });

  it('validates the JSON with Zod (format, version, strict keys)', () => {
    expect(() => createNameIndex(null)).toThrow(/Invalid compound dictionary/);
    expect(() => createNameIndex({ ...dict([entry]), format: 'x' })).toThrow();
    expect(() => createNameIndex({ ...dict([entry]), version: 2 })).toThrow();
    expect(() => createNameIndex(dict([{ ...entry, extra: 1 }]))).toThrow();
    expect(() => createNameIndex(dict([{ ...entry, mw: -1 }]))).toThrow();
    expect(createNameIndex(dict([entry])).lookup('Ethanol')?.smiles).toBe('CCO');
  });

  it('rejects names that collide after normalisation or normalise to nothing', () => {
    const other = { ...entry, name: 'ethyl-alcohol', synonyms: [] };
    expect(() => createNameIndex(dict([entry, other]))).toThrow(/names both/);
    expect(() => createNameIndex(dict([{ ...entry, synonyms: [' - '] }]))).toThrow(/empty name/);
  });
});

describe('lookup / suggest / closest', () => {
  it.each([
    ['propan-2-ol', 'propan-2-ol'],
    ['Isopropyl alcohol', 'propan-2-ol'],
    ['ethanoic acid', 'acetic acid'],
    ['acetic-acid', 'acetic acid'],
    ['ACETIC ACID', 'acetic acid'],
    ['  acetone ', 'acetone'],
    ["Brady's reagent", '2,4-dinitrophenylhydrazine'],
    ['bradys reagent', '2,4-dinitrophenylhydrazine'],
    ['(E)-but-2-ene', 'trans-but-2-ene'],
    ['α-naphthol', '1-naphthol'],
    ['NH3', 'ammonia'],
  ])('%j → %s', (query, name) => {
    expect(names.lookup(query)?.name).toBe(name);
  });

  it('matches Unicode in either composition (NFC)', () => {
    expect(normaliseName('é')).toBe(normaliseName('é'));
  });

  it('returns null for unknown names', () => {
    expect(names.lookup('etanol')).toBeNull();
    expect(names.lookup('')).toBeNull();
  });

  it('suggests by prefix: exact first, then display names, then synonyms; limited', () => {
    const s = names.suggest('ethan', 50).map((e) => e.name);
    expect(s[0]).toBe('ethane');
    expect(s).toContain('ethanol');
    expect(s).toContain('acetic acid'); // via 'ethanoic acid'
    expect(s.indexOf('ethanol')).toBeLessThan(s.indexOf('acetic acid'));
    expect(names.suggest('ethan', 3)).toHaveLength(3);
    expect(names.suggest('')).toEqual([]);
    expect(names.suggest('zzz')).toEqual([]);
  });

  it('offers near spellings for typos', () => {
    expect(names.closest('etanol').map((e) => e.name)).toContain('ethanol');
    expect(names.closest('benzne').map((e) => e.name)).toContain('benzene');
    expect(names.closest('aceton').map((e) => e.name)[0]).toBe('acetone');
    expect(names.closest('')).toEqual([]);
    expect(names.closest('qqqqqqqqqqqq')).toEqual([]);
  });
});

describe('structureFromText', () => {
  it.each(['propan-2-ol', 'Isopropyl alcohol', 'ethanoic acid', 'acetic-acid'])(
    '%s resolves by name',
    (text) => {
      const r = structureFromText(text, names);
      expect(r.ok && r.value.source).toBe('name');
      expect(r.ok && r.value.entry?.name).toBeTruthy();
    },
  );

  it('parses CO as methanol SMILES (no such name)', () => {
    const r = structureFromText('CO', names);
    expect(r.ok && r.value.source).toBe('smiles');
    if (r.ok) {
      const doc = insert(emptyDoc(NOW), r.value.sub, { x: 0, y: 0 })[0];
      expect(perceive(doc).fragments[0]!.formula.hill).toBe('CH4O');
    }
  });

  it('typing ethanol, acetic acid or CCO gives the right structure; benzene as a circle', () => {
    const hill = (text: string) => {
      const r = structureFromText(text, names);
      if (!r.ok) throw r.error;
      return perceive(insert(emptyDoc(NOW), r.value.sub, { x: 0, y: 0 })[0]).fragments[0]!.formula
        .hill;
    };
    expect(hill('ethanol')).toBe('C2H6O');
    expect(hill('acetic acid')).toBe('C2H4O2');
    expect(hill('CCO')).toBe('C2H6O');
    const benzene = structureFromText('benzene', names);
    expect(benzene.ok && Object.values(benzene.value.sub.bonds).every((b) => b.order === 1.5)).toBe(
      true,
    );
    const kek = structureFromText('benzene', names, { aromatic: 'kekule' });
    expect(kek.ok && Object.values(kek.value.sub.bonds).some((b) => b.order === 2)).toBe(true);
  });

  it('reads a pasted Molfile', () => {
    const r0 = parseSmiles('CCO');
    if (!r0.ok) throw r0.error;
    const molfile = toMolfile(insert(emptyDoc(NOW), r0.value, { x: 0, y: 0 })[0]);
    const r = structureFromText(molfile, names);
    expect(r.ok && r.value.source).toBe('molfile');
    const bad = structureFromText('junk V2000 junk', names);
    expect(!bad.ok && bad.error.code).toBe('invalid-molfile');
  });

  it('etanol → not-found with ethanol suggested', () => {
    const r = structureFromText('etanol', names);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('not-found');
    expect(r.error.suggestions).toContain('ethanol');
    expect(r.error.message).toMatch(/Did you mean ethanol\?/);
  });

  it('reports empty input, too-large SMILES, and not-found without suggestions', () => {
    const empty = structureFromText('   ', names);
    expect(!empty.ok && empty.error.code).toBe('empty');
    const big = structureFromText('C'.repeat(1001), names);
    expect(!big.ok && big.error.code).toBe('too-large');
    const none = structureFromText('qqqqqqqqqqqq', names);
    expect(!none.ok && none.error.code).toBe('not-found');
    expect(!none.ok && none.error.suggestions).toEqual([]);
  });
});
