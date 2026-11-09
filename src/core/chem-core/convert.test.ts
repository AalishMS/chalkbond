import { describe, expect, it } from 'vitest';
import {
  DocError,
  emptyDoc,
  insert,
  scaling,
  transformItems,
  everything,
  type AtomId,
  type Doc,
  type SubDoc,
} from '../doc-model/index';
import { NOW, build } from './__fixtures__/build';
import {
  canonicalId,
  parseMolfile,
  parseSmiles,
  toMolfile,
  toSmiles,
  MAX_IMPORT_ATOMS,
} from './convert';
import { ChemError } from './errors';
import { molIdCode, smilesToMol } from './ocl';
import { perceive } from './perceive';

/** Inserts a parsed sub-document into an empty doc. */
function docOf(sub: SubDoc): Doc {
  return insert(emptyDoc(NOW), sub, { x: 0, y: 0 })[0];
}
function parsed(smiles: string, opts?: Parameters<typeof parseSmiles>[1]): Doc {
  const r = parseSmiles(smiles, opts);
  if (!r.ok) throw r.error;
  return docOf(r.value);
}
const idOf = (smiles: string) => molIdCode(smilesToMol(smiles, { coordinates: true }));
const hill = (doc: Doc) =>
  perceive(doc)
    .fragments.map((f) => f.formula.text)
    .join('.');
const errorOf = (r: { ok: boolean; error?: ChemError }) => (r.ok ? null : r.error?.code);

const ROUND_TRIP = [
  'CCO',
  'CC(=O)Oc1ccccc1C(O)=O', // aspirin
  'C[C@@H](N)C(O)=O', // (R)-alanine
  'N[C@@H](C)C(=O)O', // (S)-alanine
  'C/C=C/C', // (E)-but-2-ene
  'C/C=C\\C', // (Z)-but-2-ene
  'c1c[nH]cn1', // imidazole (tautomer fixed by explicit H)
  'Cc1cnc[nH]1',
  '[O-][n+]1ccccc1', // pyridine N-oxide
  'C[N+](=O)[O-]',
  'CC(=O)[O-]',
  '[NH4+]',
  'Oc1ccccc1',
  'Cn1cnc2c1c(=O)n(C)c(=O)n2C', // caffeine
  'C1=CCCCC1',
  '[2H]C(Cl)(Cl)Cl',
  '[13CH3]O',
  '[CH3]', // methyl radical
  'c1ccc2ccccc2c1',
  'O=C1C=CC(=O)C=C1', // benzoquinone (not aromatic)
  'CCO.O', // two fragments
];

describe('parseSmiles', () => {
  it('parses into a centred sub-document with local ids', () => {
    const r = parseSmiles('CCO');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.value.atoms)).toEqual(['a1', 'a2', 'a3']);
    expect(Object.keys(r.value.bonds)).toEqual(['b4', 'b5']);
    const xs = Object.values(r.value.atoms).map((a) => a.x);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 9);
    expect(hill(docOf(r.value))).toBe('C2H6O');
  });

  it('draws aromatic rings as circles (1.5) by default, Kekulé on request', () => {
    const circle = parsed('c1ccccc1');
    expect(Object.values(circle.bonds).map((b) => b.order)).toEqual(Array(6).fill(1.5));
    const kek = parsed('c1ccccc1', { aromatic: 'kekule' });
    expect(
      Object.values(kek.bonds)
        .map((b) => b.order)
        .sort(),
    ).toEqual([1, 1, 1, 2, 2, 2]);
    expect(hill(kek)).toBe('C6H6');
  });

  it('keeps bond length 1.0 and y-down coordinates', () => {
    const doc = parsed('CCCC');
    for (const b of Object.values(doc.bonds)) {
      const p = doc.atoms[b.a1]!;
      const q = doc.atoms[b.a2]!;
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeCloseTo(1, 6);
    }
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['C1CC', 'invalid-smiles'],
    ['xyz', 'invalid-smiles'],
    ['[C+5]', 'invalid-smiles'],
    ['C'.repeat(MAX_IMPORT_ATOMS + 1), 'too-large'],
    ['C'.repeat(1_000_001), 'too-large'],
  ])('%j → %s', (text, code) => {
    const r = parseSmiles(text);
    expect(errorOf(r)).toBe(code);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(ChemError);
      expect(r.error.message).not.toMatch(/Class\$/);
    }
  });

  it('maps * to a pseudo-atom and keeps the neighbours’ hydrogens', () => {
    const doc = parsed('*c1ccccc1');
    expect(Object.values(doc.atoms).map((a) => a.element)).toContain('*');
    expect(hill(doc)).toBe('C6H5*');
    expect(hill(parsed('[*]CC'))).toBe('C2H5*');
    // a placeholder element already in the text is skipped
    expect(hill(parsed('[Xe]*'))).toBe('Xe*');
  });

  it('keeps the tautomer a SMILES specifies via explicit H', () => {
    const doc = parsed('c1c[nH]cn1');
    const ns = Object.values(doc.atoms).filter((a) => a.element === 'N');
    const p = perceive(doc);
    expect(ns.map((n) => p.atoms[n.id]!.implicitH).sort()).toEqual([0, 1]);
    expect(canonicalId(doc)).toBe(idOf('c1c[nH]cn1'));
    expect(hill(doc)).toBe('C3H4N2');
  });

  it('maps wedge/hash with the narrow end at the stereo centre', () => {
    const doc = parsed('C[C@@H](N)C(O)=O');
    const wedges = Object.values(doc.bonds).filter((b) => b.stereo !== 'none');
    expect(wedges).toHaveLength(1);
    const centre = wedges[0]!.a1;
    expect(Object.values(doc.bonds).filter((b) => b.a1 === centre || b.a2 === centre)).toHaveLength(
      3,
    );
  });

  it.each(ROUND_TRIP)('round-trips %s through toSmiles (same IDCode)', (smiles) => {
    const doc = parsed(smiles);
    expect(canonicalId(doc)).toBe(idOf(smiles));
    expect(idOf(toSmiles(doc))).toBe(idOf(smiles));
    const kek = parsed(smiles, { aromatic: 'kekule' });
    expect(canonicalId(kek)).toBe(idOf(smiles));
  });
});

describe('stereo from a drawing', () => {
  /** (R)-alanine: Cα at the origin, N up, COOH lower right, CH3 lower left on a wedge. */
  function alanine(stereo: 'wedge' | 'hash') {
    return build(
      [
        { element: 'C', x: 0, y: 0 },
        { element: 'N', x: 0, y: -1 },
        { element: 'C', x: 0.866, y: 0.5 },
        { element: 'C', x: -0.866, y: 0.5 },
        { element: 'O', x: 1.732, y: 0 },
        { element: 'O', x: 0.866, y: 1.5 },
      ],
      [
        [0, 1],
        [0, 2],
        [0, 3, 1, stereo],
        [2, 4, 2],
        [2, 5],
      ],
    ).doc;
  }

  it('(R)-alanine drawn with a wedge exports C[C@@H](N)C(O)=O', () => {
    expect(idOf(toSmiles(alanine('wedge')))).toBe(idOf('C[C@@H](N)C(O)=O'));
  });

  it('the mirror drawing (or a hash) gives the enantiomer', () => {
    const doc = alanine('wedge');
    const mirror = transformItems(doc, everything(doc), scaling(-1, 1));
    expect(idOf(toSmiles(mirror))).toBe(idOf('C[C@H](N)C(O)=O'));
    expect(idOf(toSmiles(alanine('hash')))).toBe(idOf('C[C@H](N)C(O)=O'));
  });

  it('no wedge → no stereo', () => {
    const plain = build(
      ['C', 'C', 'N', 'C'],
      [
        [0, 1],
        [1, 2],
        [1, 3],
      ],
    ).doc;
    expect(toSmiles(plain)).not.toMatch(/@/);
  });
});

describe('Molfile', () => {
  it.each(['V2000', 'V3000'] as const)('%s round-trips the test set (same IDCode)', (version) => {
    for (const smiles of ROUND_TRIP) {
      const doc = parsed(smiles);
      const text = toMolfile(doc, undefined, { version });
      expect(text).toContain(version);
      const back = parseMolfile(text);
      expect(back.ok, smiles).toBe(true);
      if (back.ok) expect(canonicalId(docOf(back.value)), smiles).toBe(idOf(smiles));
    }
  });

  it('rescales to bond length 1.0', () => {
    const v2 = toMolfile(parsed('CCCC'));
    const scaled = v2.replace(/^(\s+-?\d+\.\d+)(\s+-?\d+\.\d+)/gm, (_, x: string, y: string) =>
      [x, y].map((v) => (Number(v) * 1.54).toFixed(4).padStart(10)).join(''),
    );
    const r = parseMolfile(scaled);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const doc = docOf(r.value);
    for (const b of Object.values(doc.bonds)) {
      const p = doc.atoms[b.a1]!;
      const q = doc.atoms[b.a2]!;
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeCloseTo(1, 4);
    }
  });

  it('reads aromatic bond type 4 as 1.5 (or Kekulé on request)', () => {
    const v2 = toMolfile(parsed('c1ccccc1', { aromatic: 'kekule' })).replace(
      /^(\s+\d+\s+\d+\s+)[12](\s+0)/gm,
      '$14$2',
    );
    const circle = parseMolfile(v2);
    const kek = parseMolfile(v2, { aromatic: 'kekule' });
    expect(circle.ok && kek.ok).toBe(true);
    if (!circle.ok || !kek.ok) return;
    expect(Object.values(circle.value.bonds).map((b) => b.order)).toEqual(Array(6).fill(1.5));
    expect(
      Object.values(kek.value.bonds)
        .map((b) => b.order)
        .sort(),
    ).toEqual([1, 1, 1, 2, 2, 2]);
    expect(hill(docOf(circle.value))).toBe('C6H6');
  });

  it.each([
    ['', 'empty'],
    ['garbage', 'invalid-molfile'],
    ['\n  test\n\n  0  0  0  0  0  0  0  0  0  0999 V2000\nM  END\n', 'empty'],
    [`x${' '.repeat(1_000_001)}`, 'too-large'],
  ])('%j → %s', (text, code) => {
    expect(errorOf(parseMolfile(text))).toBe(code);
  });
});

describe('toSmiles / toMolfile', () => {
  it('expands abbreviations and writes pseudo-atoms / unknown labels as *', () => {
    const toluene = build(['C', { label: 'Ph' }], [[0, 1]]).doc;
    expect(idOf(toSmiles(toluene))).toBe(idOf('Cc1ccccc1'));
    const r = build(
      ['C', 'R', { label: 'Boc' }],
      [
        [0, 1],
        [0, 2],
      ],
    ).doc;
    expect(toSmiles(r).match(/\*/g)).toHaveLength(2);
  });

  it('writes aromatic rings drawn with 1.5 bonds in lowercase', () => {
    const doc = parsed('c1ccccc1O');
    expect(toSmiles(doc)).toMatch(/c1ccccc1|c1ccc/);
  });

  it('exports a subset (bonds among the atoms only) and joins fragments with "."', () => {
    const doc = parsed('CCO.N');
    expect(toSmiles(doc).split('.')).toHaveLength(2);
    const ids = Object.keys(doc.atoms) as AtomId[];
    expect(idOf(toSmiles(doc, ids.slice(0, 2)))).toBe(idOf('CC'));
    expect(toSmiles(doc, [])).toBe('');
  });

  it('rejects unknown atoms', () => {
    const doc = parsed('C');
    expect(() => toSmiles(doc, ['a99' as AtomId])).toThrow(DocError);
    expect(() => toMolfile(doc, ['a99' as AtomId])).toThrow(DocError);
  });
});
