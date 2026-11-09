// Test-support builders for chem-core: small molecules drawn atom by atom with doc-model ops.
import {
  addAtom,
  addBond,
  emptyDoc,
  type AtomId,
  type AtomInit,
  type BondId,
  type BondOrder,
  type BondStereo,
  type Doc,
} from '../../doc-model/index';

export const NOW = '2026-11-09T00:00:00.000Z';

/** An element symbol, or atom fields (element defaults to C; x/y default to a circle layout). */
export type AtomSpec = string | Partial<AtomInit>;
/** [atom index, atom index, order = 1, stereo = 'none'] */
export type BondSpec = readonly [number, number, BondOrder?, BondStereo?];

export interface Built {
  readonly doc: Doc;
  readonly atoms: AtomId[];
  readonly bonds: BondId[];
}

/**
 * Adds a molecule to `doc` (default: a new empty doc). Atoms without coordinates go on a circle
 * of radius ~ n/6 around `at`, so bond lengths are roughly 1 for rings.
 */
export function build(
  atoms: readonly AtomSpec[],
  bonds: readonly BondSpec[],
  opts: { doc?: Doc; at?: { x: number; y: number } } = {},
): Built {
  let doc = opts.doc ?? emptyDoc(NOW);
  const at = opts.at ?? { x: 0, y: 0 };
  const n = atoms.length;
  const r = n > 1 ? 1 / (2 * Math.sin(Math.PI / n)) : 0;
  const atomIds: AtomId[] = [];
  atoms.forEach((spec, i) => {
    const init = typeof spec === 'string' ? { element: spec } : spec;
    const angle = (2 * Math.PI * i) / n;
    let id: AtomId;
    [doc, id] = addAtom(doc, {
      x: at.x + r * Math.cos(angle),
      y: at.y + r * Math.sin(angle),
      ...init,
    });
    atomIds.push(id);
  });
  const bondIds: BondId[] = [];
  for (const [i, j, order = 1, stereo = 'none'] of bonds) {
    let id: BondId;
    [doc, id] = addBond(doc, atomIds[i]!, atomIds[j]!, { order, stereo });
    bondIds.push(id);
  }
  return { doc, atoms: atomIds, bonds: bondIds };
}

/** Bonds closing a ring through the given atom indexes, all of one order. */
export function ringBonds(indexes: readonly number[], order: BondOrder = 1.5): BondSpec[] {
  return indexes.map((a, k) => [a, indexes[(k + 1) % indexes.length]!, order] as const);
}

const range = (n: number, from = 0): number[] => Array.from({ length: n }, (_, i) => from + i);

/** Aromatic test systems drawn with all ring bonds 1.5 (`ArAtoms` → element specs). */
export const AROMATICS: Record<string, { atoms: AtomSpec[]; bonds: BondSpec[]; formula: string }> =
  {
    benzene: { atoms: Array(6).fill('C'), bonds: ringBonds(range(6)), formula: 'C6H6' },
    naphthalene: {
      atoms: Array(10).fill('C'),
      bonds: [...ringBonds(range(6)), ...ringBonds([4, 6, 7, 8, 9, 5]).slice(0, 5)],
      formula: 'C10H8',
    },
    anthracene: {
      atoms: Array(14).fill('C'),
      bonds: [
        ...ringBonds(range(6)),
        ...ringBonds([4, 6, 7, 8, 9, 5]).slice(0, 5),
        ...ringBonds([7, 10, 11, 12, 13, 8]).slice(0, 5),
      ],
      formula: 'C14H10',
    },
    azulene: {
      atoms: Array(10).fill('C'),
      bonds: [...ringBonds(range(7)), ...ringBonds([6, 7, 8, 9, 0]).slice(0, 4)],
      formula: 'C10H8',
    },
    pyridine: {
      atoms: ['N', 'C', 'C', 'C', 'C', 'C'],
      bonds: ringBonds(range(6)),
      formula: 'C5H5N',
    },
    pyrrole: { atoms: ['N', 'C', 'C', 'C', 'C'], bonds: ringBonds(range(5)), formula: 'C4H5N' },
    furan: { atoms: ['O', 'C', 'C', 'C', 'C'], bonds: ringBonds(range(5)), formula: 'C4H4O' },
    thiophene: { atoms: ['S', 'C', 'C', 'C', 'C'], bonds: ringBonds(range(5)), formula: 'C4H4S' },
    indole: {
      // benzene 0-5 fused with the pyrrole ring 4-6(N)-7-8-5
      atoms: ['C', 'C', 'C', 'C', 'C', 'C', 'N', 'C', 'C'],
      bonds: [...ringBonds(range(6)), ...ringBonds([4, 6, 7, 8, 5]).slice(0, 4)],
      formula: 'C8H7N',
    },
    imidazole: {
      atoms: ['N', 'C', 'N', 'C', 'C'],
      bonds: ringBonds(range(5)),
      formula: 'C3H4N2',
    },
    carboxylate: {
      // CH3–C(1.5 O)(1.5 O⁻): acetate
      atoms: ['C', 'C', 'O', { element: 'O', charge: -1 }],
      bonds: [
        [0, 1, 1],
        [1, 2, 1.5],
        [1, 3, 1.5],
      ],
      formula: 'C2H3O2',
    },
  };
