import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { current, createHistory, emptyDoc, type AtomId, type BondId, type Doc } from '../doc-model';
import { command, run } from '../doc-model/__fixtures__/arbitraries';
import { hexagon, molecule, naphthalene, type BondSpec } from './__fixtures__/molecules';
import { ringAtoms } from './ring-atoms';

// An independent oracle for ring membership (review finding 2026-11-12: the structural oracle
// imports `ringAtoms` itself, so property 8 cannot catch a ring-detection error). The definition
// is the spec's, written as plainly as possible and sharing no code with ring-atoms.ts: an atom
// is a ring atom exactly when it is an end of a bond whose two ends are still connected after
// that bond is removed. A self-bond and a bond to a missing atom are ignored.
function bruteForceRingAtoms(doc: Doc): AtomId[] {
  const bonds = Object.values(doc.bonds).filter(
    (b) => b.a1 !== b.a2 && b.a1 in doc.atoms && b.a2 in doc.atoms,
  );
  const result = new Set<AtomId>();
  for (const removed of bonds) {
    const reached = new Set<AtomId>([removed.a1]);
    const queue: AtomId[] = [removed.a1];
    while (queue.length > 0) {
      const at = queue.shift() as AtomId;
      for (const b of bonds) {
        if (b === removed) continue;
        const next = b.a1 === at ? b.a2 : b.a2 === at ? b.a1 : undefined;
        if (next !== undefined && !reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      }
    }
    if (reached.has(removed.a2)) {
      result.add(removed.a1);
      result.add(removed.a2);
    }
  }
  return [...result].sort();
}

const members = (doc: Doc): AtomId[] => [...ringAtoms(doc)].sort();

const NOW = '2026-11-09T00:00:00.000Z';
function build(cmds: readonly Parameters<typeof run>[1][]): Doc {
  let n = 0;
  const clock = () => `2026-11-09T00:00:00.${String(++n % 1000).padStart(3, '0')}Z`;
  return current(cmds.reduce(run, createHistory(emptyDoc(NOW), { clock })));
}

/** Small random graphs: up to 12 atoms, any pairs (self pairs and repeats are dropped). */
const graph = fc
  .integer({ min: 0, max: 12 })
  .chain((n) =>
    fc.tuple(
      fc.constant(n),
      n < 2
        ? fc.constant([] as [number, number][])
        : fc.array(fc.tuple(fc.nat(n - 1), fc.nat(n - 1)), { maxLength: 24 }),
    ),
  )
  .map(([n, pairs]) => {
    const seen = new Set<string>();
    const bonds: BondSpec[] = [];
    for (const [i, j] of pairs) {
      const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
      if (i === j || seen.has(key)) continue;
      seen.add(key);
      bonds.push([i, j]);
    }
    return molecule(
      Array.from({ length: n }, (_, i) => ({ x: i, y: 0 })),
      bonds,
    ).doc;
  });

const ring = (n: number, offset = 0): BondSpec[] =>
  Array.from({ length: n }, (_, i): BondSpec => [offset + i, offset + ((i + 1) % n)]);
const points = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: i % 2 }));
const agree = (doc: Doc): void => expect(members(doc)).toEqual(bruteForceRingAtoms(doc));

describe('ringAtoms against a brute-force definition', () => {
  it('property: random bond graphs agree with the oracle', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(graph, (doc) => {
        agree(doc);
      }),
      { numRuns: 1000 },
    );
  });

  it(
    'property: documents reached by random edit sequences agree with the oracle',
    { timeout: 120_000 },
    () => {
      const docOf = fc.array(command, { minLength: 1, maxLength: 50, size: 'max' }).map(build);
      fc.assert(
        fc.property(docOf, (doc) => {
          agree(doc);
        }),
        { numRuns: 300 },
      );
    },
  );

  it('fused rings (naphthalene) and a spiro atom', () => {
    const fused = naphthalene().doc;
    agree(fused);
    expect(members(fused)).toHaveLength(10);
    const spiro = molecule(points(5), [...ring(3), [0, 3], [3, 4], [4, 0]]);
    agree(spiro.doc);
    expect(members(spiro.doc)).toHaveLength(5);
  });

  it('a ring with a chain: only the ring atoms', () => {
    const m = molecule(
      [...hexagon(), { x: 0, y: -2 }, { x: 0, y: -3 }],
      [...ring(6), [0, 6], [6, 7]],
    );
    agree(m.doc);
    expect(members(m.doc)).toHaveLength(6);
  });

  it('two rings joined by one bond: the joining bond adds no ring atoms of its own', () => {
    // Two triangles (0-2, 3-5) joined by the bond 2-3.
    const m = molecule(points(6), [...ring(3), ...ring(3, 3), [2, 3]]);
    agree(m.doc);
    expect(members(m.doc)).toHaveLength(6);
    // Two triangles joined by a one-atom bridge: the middle atom is not a ring atom.
    const bridged = molecule(points(7), [...ring(3), ...ring(3, 3), [2, 6], [6, 3]]);
    agree(bridged.doc);
    expect(members(bridged.doc)).toHaveLength(6);
    expect(ringAtoms(bridged.doc).has(bridged.atoms[6] as AtomId)).toBe(false);
  });

  it('a macrocycle', () => {
    const m = molecule(points(24), ring(24));
    agree(m.doc);
    expect(members(m.doc)).toHaveLength(24);
  });

  it('a document with no bonds, and a lone atom', () => {
    agree(emptyDoc(NOW));
    agree(molecule(points(4), []).doc);
    expect(members(molecule(points(4), []).doc)).toEqual([]);
  });

  it('parallel bonds (doc-model refuses them; a literal document is still decided by the definition)', () => {
    const m = molecule(points(3), [
      [0, 1],
      [1, 2],
    ]);
    const first = Object.values(m.doc.bonds)[0]!;
    const doc = {
      ...m.doc,
      bonds: {
        ...m.doc.bonds,
        ['b90' as BondId]: { ...first, id: 'b90' as BondId, a1: first.a2, a2: first.a1 },
      },
    } as Doc;
    agree(doc);
    expect(members(doc)).toEqual([...(m.atoms.slice(0, 2) as AtomId[])].sort());
  });
});
