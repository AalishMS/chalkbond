// Test helper: small molecules built through doc-model's public operations (BLU, bond length
// 1.0, y down). Atom ids are allocated by doc-model (they share a counter with bonds), so tests
// look ids up through the returned lists instead of hard-coding them.
import {
  addAtom,
  addBond,
  emptyDoc,
  type AtomId,
  type AtomInit,
  type BondId,
  type BondInit,
  type Doc,
} from '../../doc-model';

export interface Molecule {
  doc: Doc;
  /** In the order given. */
  atoms: AtomId[];
  bonds: BondId[];
}

export type BondSpec = [from: number, to: number, init?: BondInit];

/** Atoms and bonds (by atom index) added in the order given. */
export function molecule(atoms: readonly AtomInit[], bonds: readonly BondSpec[]): Molecule {
  let doc = emptyDoc('2026-01-01T00:00:00Z');
  const atomIds: AtomId[] = [];
  for (const a of atoms) {
    let id: AtomId;
    [doc, id] = addAtom(doc, a);
    atomIds.push(id);
  }
  const bondIds: BondId[] = [];
  for (const [i, j, init] of bonds) {
    let id: BondId;
    [doc, id] = addBond(doc, atomIds[i] as AtomId, atomIds[j] as AtomId, init);
    bondIds.push(id);
  }
  return { doc, atoms: atomIds, bonds: bondIds };
}

const SQ3_2 = Math.sqrt(3) / 2;

/** Pointy-top hexagon vertices of circumradius 1 around `(cx, cy)`, clockwise from the top. */
export function hexagon(cx = 0, cy = 0): { x: number; y: number }[] {
  return [
    { x: cx, y: cy - 1 },
    { x: cx + SQ3_2, y: cy - 0.5 },
    { x: cx + SQ3_2, y: cy + 0.5 },
    { x: cx, y: cy + 1 },
    { x: cx - SQ3_2, y: cy + 0.5 },
    { x: cx - SQ3_2, y: cy - 0.5 },
  ];
}

/** Benzene: six carbons, stored orders 1.5 (circle) or Kekule 2,1,2,1,2,1. */
export function benzene(kind: 'aromatic' | 'kekule' = 'aromatic'): Molecule {
  return molecule(
    hexagon(),
    Array.from({ length: 6 }, (_, i): BondSpec => {
      const order = kind === 'aromatic' ? 1.5 : i % 2 === 0 ? 2 : 1;
      return [i, (i + 1) % 6, { order }];
    }),
  );
}

/** Naphthalene: two fused hexagons, all bonds 1.5. */
export function naphthalene(): Molecule {
  const a = hexagon(0, 0);
  const b = hexagon(2 * SQ3_2, 0);
  // Atoms 0-5 ring A; 6-9 are ring B's atoms 0..3 (its 4 and 5 are ring A's 2 and 1).
  const atoms = [...a, b[0]!, b[1]!, b[2]!, b[3]!];
  const pairs: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 0],
    [1, 6],
    [6, 7],
    [7, 8],
    [8, 9],
    [9, 2],
  ];
  return molecule(
    atoms,
    pairs.map(([i, j]): BondSpec => [i, j, { order: 1.5 }]),
  );
}

/** Ethanol C-C-O zigzag; the OH points right-down (`mirror`: left-down, so it reads `HO`). */
export function ethanol(mirror = false): Molecule {
  const s = mirror ? -1 : 1;
  return molecule(
    [
      { x: 0, y: 0 },
      { x: s * SQ3_2, y: 0.5 },
      { x: s * 2 * SQ3_2, y: 0, element: 'O' },
    ],
    [
      [0, 1],
      [1, 2],
    ],
  );
}

/** Acetic acid CH3-C(=O)-OH with the carbonyl pointing down. */
export function aceticAcid(): Molecule {
  return molecule(
    [
      { x: 0, y: 0 },
      { x: SQ3_2, y: 0.5 },
      { x: SQ3_2, y: 1.5, element: 'O' },
      { x: 2 * SQ3_2, y: 0, element: 'O' },
    ],
    [
      [0, 1],
      [1, 2, { order: 2 }],
      [1, 3],
    ],
  );
}

/** A carbon with a wedge, a hash, a bold and a wavy bond to four substituents. */
export function stereoCentre(): Molecule {
  return molecule(
    [
      { x: 0, y: 0 },
      { x: 0.9, y: -0.5, element: 'N' },
      { x: -0.9, y: -0.5, element: 'O' },
      { x: 0.9, y: 0.5 },
      { x: -0.9, y: 0.5 },
    ],
    [
      [0, 1, { stereo: 'wedge' }],
      [0, 2, { stereo: 'hash' }],
      [0, 3, { stereo: 'bold' }],
      [0, 4, { stereo: 'wavy' }],
    ],
  );
}
