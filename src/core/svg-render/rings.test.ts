import { describe, expect, it } from 'vitest';
import {
  addAtom,
  addBond,
  emptyDoc,
  type AtomId,
  type Bond,
  type BondId,
  type BondOrder,
  type Doc,
  type Point,
} from '../doc-model';
import { findRings, isCircled, ringCentroid, ringKey, ringsByBond, type Ring } from './rings';

type Edge = [number, number, BondOrder?];

/** Atoms a1..an (positions from `at`, default on a line) and bonds b1.. in edge order. */
function graph(
  n: number,
  edges: readonly Edge[],
  at: (i: number) => Point = (i) => ({ x: i, y: 0 }),
) {
  let doc = emptyDoc('2026-01-01T00:00:00Z');
  for (let i = 1; i <= n; i++) [doc] = addAtom(doc, at(i));
  for (const [a, b, order] of edges) {
    [doc] = addBond(doc, `a${a}` as AtomId, `a${b}` as AtomId, order ? { order } : {});
  }
  return doc;
}

const cycleEdges = (n: number, order?: BondOrder): Edge[] =>
  Array.from({ length: n }, (_, i): Edge => [i + 1, ((i + 1) % n) + 1, order]);

const bondOf = (doc: Doc, a: number, b: number): BondId =>
  Object.values(doc.bonds).find(
    (x) => (x.a1 === `a${a}` && x.a2 === `a${b}`) || (x.a1 === `a${b}` && x.a2 === `a${a}`),
  )!.id;

const ids = (r: Ring) => r.atoms.join(',');
const sets = (doc: Doc) => findRings(doc).map(ids);

const NAPHTHALENE: Edge[] = [
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 9],
  [9, 10],
  [10, 1],
  [9, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 10],
];
const CUBANE: Edge[] = [
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 1],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 5],
  [1, 5],
  [2, 6],
  [3, 7],
  [4, 8],
];
const SPIRO: Edge[] = [
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 1],
  [1, 6],
  [6, 7],
  [7, 8],
  [8, 9],
  [9, 1],
];
const NORBORNANE: Edge[] = [
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 1],
  [1, 7],
  [7, 4],
];

describe('findRings', () => {
  it('finds benzene as one 6-ring, in cycle order', () => {
    const rings = findRings(graph(6, cycleEdges(6)));
    expect(rings).toHaveLength(1);
    expect(ids(rings[0]!)).toBe('a1,a2,a3,a4,a5,a6');
    expect(rings[0]!.bonds).toHaveLength(6);
    expect(rings[0]!.cycle).toHaveLength(6);
  });

  it('finds naphthalene as two 6-rings, never the 10-ring', () => {
    expect(sets(graph(10, NAPHTHALENE))).toEqual(['a1,a2,a3,a4,a9,a10', 'a5,a6,a7,a8,a9,a10']);
  });

  it('finds cubane as its six faces', () => {
    const faces = sets(graph(8, CUBANE));
    expect(faces).toHaveLength(6);
    expect(faces).toEqual([
      'a1,a2,a3,a4',
      'a1,a2,a5,a6',
      'a1,a4,a5,a8',
      'a2,a3,a6,a7',
      'a3,a4,a7,a8',
      'a5,a6,a7,a8',
    ]);
  });

  it('finds the two 5-rings of a spiro compound', () => {
    expect(sets(graph(9, SPIRO))).toEqual(['a1,a2,a3,a4,a5', 'a1,a6,a7,a8,a9']);
  });

  it('finds the two 5-rings of norbornane, not the 6-ring around the outside', () => {
    expect(sets(graph(7, NORBORNANE))).toEqual(['a1,a2,a3,a4,a7', 'a1,a4,a5,a6,a7']);
  });

  it('finds rings of size 3 and 8 but not 9 or 10', () => {
    expect(sets(graph(3, cycleEdges(3)))).toEqual(['a1,a2,a3']);
    expect(sets(graph(8, cycleEdges(8)))).toHaveLength(1);
    expect(findRings(graph(9, cycleEdges(9)))).toEqual([]);
    expect(findRings(graph(10, cycleEdges(10)))).toEqual([]);
  });

  it('finds nothing in a chain, and nothing in an empty doc', () => {
    expect(
      findRings(
        graph(5, [
          [1, 2],
          [2, 3],
          [3, 4],
          [4, 5],
        ]),
      ),
    ).toEqual([]);
    expect(findRings(emptyDoc('2026-01-01T00:00:00Z'))).toEqual([]);
  });

  it('orders atom ids by number (a2 before a10) and sorts rings by those lists', () => {
    const rings = findRings(
      graph(12, [...cycleEdges(6), [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 7]]),
    );
    expect(rings.map(ids)).toEqual(['a1,a2,a3,a4,a5,a6', 'a7,a8,a9,a10,a11,a12']);
    const big = graph(12, [
      [2, 10],
      [10, 11],
      [11, 12],
      [12, 2],
    ]);
    expect(ids(findRings(big)[0]!)).toBe('a2,a10,a11,a12');
  });

  it('gives the same rings when records are stored in reversed order', () => {
    for (const [n, edges] of [
      [10, NAPHTHALENE],
      [8, CUBANE],
      [7, NORBORNANE],
      [9, SPIRO],
    ] as [number, Edge[]][]) {
      const doc = graph(n, edges);
      const reversed: Doc = {
        ...doc,
        atoms: Object.fromEntries(Object.entries(doc.atoms).reverse()),
        bonds: Object.fromEntries(Object.entries(doc.bonds).reverse()),
      };
      expect(findRings(reversed)).toEqual(findRings(doc));
      expect([...ringsByBond(reversed)]).toEqual([...ringsByBond(doc)]);
    }
  });

  it('ignores bonds that point at missing atoms', () => {
    const doc = graph(3, cycleEdges(3));
    const broken: Doc = {
      ...doc,
      bonds: {
        ...doc.bonds,
        ['b99' as BondId]: {
          ...(Object.values(doc.bonds)[0] as Bond),
          id: 'b99' as BondId,
          a2: 'a77' as AtomId,
        },
      },
    };
    expect(sets(broken)).toEqual(['a1,a2,a3']);
  });
});

describe('ringsByBond', () => {
  it('gives each bond its smallest ring, ties to the lowest sorted atom ids', () => {
    const doc = graph(10, NAPHTHALENE);
    const by = ringsByBond(doc);
    // Fusion bond b5 (a9-a10) lies in both 6-rings: the lower id list wins.
    expect(ids(by.get(bondOf(doc, 9, 10))!)).toBe('a1,a2,a3,a4,a9,a10');
    expect(ids(by.get(bondOf(doc, 1, 2))!)).toBe('a1,a2,a3,a4,a9,a10');
    expect(ids(by.get(bondOf(doc, 5, 6))!)).toBe('a5,a6,a7,a8,a9,a10');
  });

  it('prefers the smaller ring over the larger (norbornane bridge bonds)', () => {
    const doc = graph(7, NORBORNANE);
    const by = ringsByBond(doc);
    expect(by.get(bondOf(doc, 1, 2))!.atoms).toHaveLength(5);
    expect(by.get(bondOf(doc, 4, 5))!.atoms).toHaveLength(5);
    expect(ids(by.get(bondOf(doc, 1, 7))!)).toBe('a1,a2,a3,a4,a7'); // tie: lower list
  });

  it('has no entry for chain bonds or bonds only in a ring larger than 8', () => {
    const doc = graph(5, [
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ]);
    expect(ringsByBond(doc).size).toBe(0);
    expect(ringsByBond(graph(10, cycleEdges(10))).size).toBe(0);
    const tail = graph(7, [...cycleEdges(6), [1, 7]]);
    expect(ringsByBond(tail).has(bondOf(tail, 1, 7))).toBe(false);
    expect(ringsByBond(tail).size).toBe(6);
  });
});

describe('ringKey, isCircled and ringCentroid', () => {
  it('keys a ring by its atom ids sorted by number', () => {
    const rings = findRings(
      graph(12, [
        [2, 10],
        [10, 11],
        [11, 12],
        [12, 2],
      ]),
    );
    expect(ringKey(rings[0]!)).toBe('a2,a10,a11,a12');
  });

  it('circles a ring only when every one of its bonds is 1.5', () => {
    expect(
      findRings(graph(6, cycleEdges(6, 1.5))).map((r) =>
        isCircled(graph(6, cycleEdges(6, 1.5)), r),
      ),
    ).toEqual([true]);
    const kekule: Edge[] = [
      [1, 2, 2],
      [2, 3, 1],
      [3, 4, 2],
      [4, 5, 1],
      [5, 6, 2],
      [6, 1, 1],
    ];
    const k = graph(6, kekule);
    expect(isCircled(k, findRings(k)[0]!)).toBe(false);
    const almost = graph(6, [...cycleEdges(6, 1.5).slice(0, 5), [6, 1, 1]]);
    expect(isCircled(almost, findRings(almost)[0]!)).toBe(false);
    const single = graph(6, cycleEdges(6));
    expect(isCircled(single, findRings(single)[0]!)).toBe(false);
  });

  it('ignores a chord bond between ring atoms when deciding', () => {
    // Cyclopropane-like 3-ring all 1.5 is circled; a non-ring 1.5 bond does not matter.
    const doc = graph(4, [
      [1, 2, 1.5],
      [2, 3, 1.5],
      [3, 1, 1.5],
      [3, 4, 1],
    ]);
    expect(isCircled(doc, findRings(doc)[0]!)).toBe(true);
  });

  it('circles both rings of an all-1.5 naphthalene and neither of a half-Kekulé one', () => {
    const arom = NAPHTHALENE.map(([a, b]): Edge => [a, b, 1.5]);
    const doc = graph(10, arom);
    expect(findRings(doc).map((r) => isCircled(doc, r))).toEqual([true, true]);
    const half = graph(
      10,
      NAPHTHALENE.map(([a, b], i): Edge => [a, b, i < 5 ? 1.5 : 1]),
    );
    expect(findRings(half).map((r) => isCircled(half, r))).toEqual([false, false]);
  });

  it('computes the centroid as the mean of the ring atoms', () => {
    const pos: Point[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 0, y: 2 },
    ];
    const doc = graph(4, cycleEdges(4), (i) => pos[i - 1]!);
    expect(ringCentroid(doc, findRings(doc)[0]!)).toEqual({ x: 2, y: 1 });
  });
});
