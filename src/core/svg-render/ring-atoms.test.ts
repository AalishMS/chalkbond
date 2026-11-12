import { describe, expect, it } from 'vitest';
import { emptyDoc, type AtomId, type BondId, type Doc } from '../doc-model';
import { benzene, hexagon, molecule, naphthalene, type BondSpec } from './__fixtures__/molecules';
import { ringAtoms } from './ring-atoms';

/** The atoms of `m` at the given indices, as a sorted list of ids. */
const ids = (m: { atoms: AtomId[] }, ...index: number[]): AtomId[] =>
  index.map((i) => m.atoms[i] as AtomId).sort();
const members = (doc: Doc): AtomId[] => [...ringAtoms(doc)].sort();

/** A polygon with `n` carbons and the bonds around it. */
function polygon(n: number) {
  const atoms = Array.from({ length: n }, (_, i) => ({
    x: Math.cos((2 * Math.PI * i) / n),
    y: Math.sin((2 * Math.PI * i) / n),
  }));
  const bonds = Array.from({ length: n }, (_, i): BondSpec => [i, (i + 1) % n]);
  return molecule(atoms, bonds);
}

describe('ringAtoms', () => {
  it('benzene: all six atoms', () => {
    const m = benzene();
    expect(members(m.doc)).toEqual(ids(m, 0, 1, 2, 3, 4, 5));
  });

  it('toluene: the six ring atoms, not the methyl', () => {
    const hex = hexagon();
    const m = molecule(
      [...hex, { x: 0, y: -2 }],
      [...Array.from({ length: 6 }, (_, i): BondSpec => [i, (i + 1) % 6]), [0, 6]],
    );
    expect(members(m.doc)).toEqual(ids(m, 0, 1, 2, 3, 4, 5));
  });

  it('naphthalene: every atom, the shared ones included', () => {
    const m = naphthalene();
    expect(members(m.doc)).toEqual(ids(m, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9));
  });

  it('decalin: every atom of the fused saturated rings', () => {
    const m = molecule(
      Array.from({ length: 10 }, (_, i) => ({ x: i, y: i % 2 })),
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
        [5, 0],
        [2, 6],
        [6, 7],
        [7, 8],
        [8, 9],
        [9, 3],
      ],
    );
    expect(members(m.doc)).toEqual(ids(m, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9));
  });

  it('spiro compound: the spiro atom is a ring atom', () => {
    // Atoms 0-2 a triangle, 0,3,4 a second triangle sharing only atom 0.
    const m = molecule(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 0, y: -1 },
      ],
      [
        [0, 1],
        [1, 2],
        [2, 0],
        [0, 3],
        [3, 4],
        [4, 0],
      ],
    );
    expect(members(m.doc)).toEqual(ids(m, 0, 1, 2, 3, 4));
  });

  it('an 18-ring counts although rings.ts draws no circle for it', () => {
    const m = polygon(18);
    expect(members(m.doc)).toEqual(ids(m, ...Array.from({ length: 18 }, (_, i) => i)));
  });

  it('diphenylmethane: the CH2 between the rings is not a member', () => {
    const left = hexagon(0, 0);
    const right = hexagon(5, 0);
    const m = molecule(
      [...left, ...right, { x: 2.5, y: 0 }],
      [
        ...Array.from({ length: 6 }, (_, i): BondSpec => [i, (i + 1) % 6]),
        ...Array.from({ length: 6 }, (_, i): BondSpec => [6 + i, 6 + ((i + 1) % 6)]),
        [2, 12],
        [12, 11],
      ],
    );
    expect(members(m.doc)).toEqual(ids(m, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11));
    expect(ringAtoms(m.doc).has(m.atoms[12] as AtomId)).toBe(false);
  });

  it('a chain has no ring atoms', () => {
    const m = molecule(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      [
        [0, 1],
        [1, 2],
      ],
    );
    expect(members(m.doc)).toEqual([]);
  });

  it('a self-bond and a bond to a missing atom are ignored', () => {
    const m = molecule(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      [[0, 1]],
    );
    const a = m.atoms[0] as AtomId;
    const b = m.atoms[1] as AtomId;
    const bond = Object.values(m.doc.bonds)[0]!;
    const doc = {
      ...m.doc,
      bonds: {
        ...m.doc.bonds,
        ['b90' as BondId]: { ...bond, id: 'b90' as BondId, a1: a, a2: a },
        ['b91' as BondId]: { ...bond, id: 'b91' as BondId, a1: b, a2: 'a99' as AtomId },
        ['b92' as BondId]: {
          ...bond,
          id: 'b92' as BondId,
          a1: 'a98' as AtomId,
          a2: 'a99' as AtomId,
        },
      },
    } as Doc;
    expect(members(doc)).toEqual([]);
  });

  it('an empty document and a lone atom have none', () => {
    expect(members(emptyDoc('2026-01-01T00:00:00Z'))).toEqual([]);
    expect(members(molecule([{ x: 0, y: 0 }], []).doc)).toEqual([]);
  });

  it('does not depend on the key order of atoms and bonds', () => {
    const m = naphthalene();
    const flip = <T>(rec: Readonly<Record<string, T>>): Record<string, T> =>
      Object.fromEntries(Object.entries(rec).reverse());
    const flipped = { ...m.doc, atoms: flip(m.doc.atoms), bonds: flip(m.doc.bonds) } as Doc;
    expect([...ringAtoms(flipped)]).toHaveLength(10);
    expect(members(flipped)).toEqual(members(m.doc));
  });

  it('a ring with a long tail: only the ring is marked, however deep the tail', () => {
    // Built as a literal (addAtom copies the document each time); 30000 deep would overflow a
    // recursive search.
    const tail = 30_000;
    const atoms: Record<string, unknown> = {};
    const bonds: Record<string, unknown> = {};
    const atom = (n: number) => ({ id: `a${n}`, element: 'C', charge: 0, radical: 0, x: n, y: 0 });
    let bond = 0;
    const join = (p: number, q: number) => {
      bond += 1;
      bonds[`b${bond}`] = {
        id: `b${bond}`,
        a1: `a${p}`,
        a2: `a${q}`,
        order: 1,
        stereo: 'none',
        doublePlacement: 'auto',
      };
    };
    for (let n = 1; n <= 3 + tail; n++) atoms[`a${n}`] = atom(n);
    join(1, 2);
    join(2, 3);
    join(3, 1);
    join(1, 4);
    for (let n = 4; n < 3 + tail; n++) join(n, n + 1);
    const doc = { ...emptyDoc('2026-01-01T00:00:00Z'), atoms, bonds } as unknown as Doc;
    expect(members(doc)).toEqual(['a1', 'a2', 'a3']);
  });
});
