// The only file in the app that imports OpenChemLib (lint-enforced). Everything it exports is a
// plain type or an opaque handle, so OCL objects and types cannot leak into chem-core's API.
import { Molecule } from 'openchemlib';

/** Bond kinds chem-core exchanges with OCL. `up`/`down` are single bonds whose narrow end is a1. */
export type MolBondKind = 'single' | 'double' | 'triple' | 'up' | 'down' | 'delocalized';

export interface MolAtom {
  /** 0 = pseudo-atom (then `customLabel` names it: 'R', 'X', '*'). */
  readonly atomicNo: number;
  readonly x: number;
  readonly y: number;
  readonly charge: number;
  /** Isotope mass number; 0 = natural abundance. */
  readonly mass: number;
  /** 0 none, 1 doublet, 2 triplet. */
  readonly radical: 0 | 1 | 2;
  readonly customLabel: string | null;
}

export interface MolBond {
  readonly a1: number;
  readonly a2: number;
  readonly kind: MolBondKind;
}

export interface MolSpec {
  /** `hCount` fixes the atom's hydrogen count (else OCL's default valence model decides). */
  readonly atoms: readonly (MolAtom & { readonly hCount?: number })[];
  readonly bonds: readonly MolBond[];
}

/** What OCL perceives about a molecule, by atom / bond index. */
export interface MolData {
  readonly atoms: readonly (MolAtom & { readonly implicitH: number; readonly aromatic: boolean })[];
  readonly bonds: readonly (MolBond & { readonly aromatic: boolean })[];
}

export interface MolFormula {
  /** OCL's formula string (Hill order; isotopes folded in, except D/T). */
  readonly formula: string;
  /** Average molecular weight, g/mol. */
  readonly relativeWeight: number;
  /** Monoisotopic mass. */
  readonly absoluteWeight: number;
}

declare const MOL: unique symbol;
/** Opaque handle to an OCL molecule. Only this file can look inside. */
export interface Mol {
  readonly [MOL]: true;
}

const wrap = (m: Molecule): Mol => m as unknown as Mol;
const unwrap = (mol: Mol): Molecule => mol as unknown as Molecule;

const RADICAL_TO_OCL = [0, Molecule.cAtomRadicalStateD, Molecule.cAtomRadicalStateT] as const;
const MAX_ABNORMAL_VALENCE = 15;

/** Builds an OCL molecule. Atoms and bonds keep their indexes. */
export function buildMol(spec: MolSpec): Mol {
  const m = new Molecule(Math.max(spec.atoms.length, 1), Math.max(spec.bonds.length, 1));
  for (const atom of spec.atoms) {
    const i = m.addAtom(atom.atomicNo);
    m.setAtomX(i, atom.x);
    m.setAtomY(i, atom.y);
    if (atom.charge !== 0) m.setAtomCharge(i, atom.charge);
    if (atom.mass !== 0) m.setAtomMass(i, atom.mass);
    if (atom.radical !== 0) m.setAtomRadical(i, RADICAL_TO_OCL[atom.radical]);
    if (atom.customLabel !== null) m.setAtomCustomLabel(i, atom.customLabel);
  }
  for (const bond of spec.bonds) {
    const b = m.addBond(bond.a1, bond.a2);
    m.setBondType(b, bondTypeToOcl(bond.kind));
  }
  spec.atoms.forEach((atom, i) => {
    if (atom.hCount !== undefined) fixHydrogens(m, i, atom.hCount);
  });
  m.ensureHelperArrays(Molecule.cHelperRings);
  return wrap(m);
}

/**
 * Makes OCL give atom `i` exactly `target` implicit hydrogens by choosing its abnormal valence
 * (OCL's H count rises monotonically with it). Left at OCL's default when that already matches,
 * so SMILES output carries no needless brackets. If no value reaches `target` (e.g. an isolated
 * N⁺ with no H), the closest one is kept and readMol reports what OCL actually did.
 */
function fixHydrogens(m: Molecule, i: number, target: number): void {
  m.ensureHelperArrays(Molecule.cHelperNeighbours);
  if (m.getImplicitHydrogens(i) === target) return;
  let best = -1;
  let bestDiff = Infinity;
  for (let v = 0; v <= MAX_ABNORMAL_VALENCE; v++) {
    m.setAtomAbnormalValence(i, v);
    m.ensureHelperArrays(Molecule.cHelperNeighbours);
    const diff = Math.abs(m.getImplicitHydrogens(i) - target);
    if (diff < bestDiff) {
      best = v;
      bestDiff = diff;
      if (diff === 0) break;
    }
  }
  m.setAtomAbnormalValence(i, best);
}

function bondTypeToOcl(kind: MolBondKind): number {
  switch (kind) {
    case 'single':
      return Molecule.cBondTypeSingle;
    case 'double':
      return Molecule.cBondTypeDouble;
    case 'triple':
      return Molecule.cBondTypeTriple;
    case 'up':
      return Molecule.cBondTypeUp;
    case 'down':
      return Molecule.cBondTypeDown;
    case 'delocalized':
      return Molecule.cBondTypeDelocalized;
  }
}

function bondKindFromOcl(m: Molecule, b: number): MolBondKind {
  const type = m.getBondType(b);
  if (type === Molecule.cBondTypeUp) return 'up';
  if (type === Molecule.cBondTypeDown) return 'down';
  if (type === Molecule.cBondTypeDelocalized) return 'delocalized';
  const order = m.getBondOrder(b);
  return order >= 3 ? 'triple' : order === 2 ? 'double' : 'single';
}

function radicalFromOcl(state: number): 0 | 1 | 2 {
  if (state === Molecule.cAtomRadicalStateD) return 1;
  if (state === Molecule.cAtomRadicalStateT) return 2;
  return 0;
}

/** Reads a molecule back: atoms, bonds, implicit H and aromaticity. */
export function readMol(mol: Mol): MolData {
  const m = unwrap(mol);
  m.ensureHelperArrays(Molecule.cHelperRings);
  const atoms = [];
  for (let i = 0; i < m.getAllAtoms(); i++) {
    atoms.push({
      atomicNo: m.getAtomicNo(i),
      x: m.getAtomX(i),
      y: m.getAtomY(i),
      charge: m.getAtomCharge(i),
      mass: m.getAtomMass(i),
      radical: radicalFromOcl(m.getAtomRadical(i)),
      customLabel: m.getAtomCustomLabel(i),
      implicitH: m.getImplicitHydrogens(i),
      aromatic: m.isAromaticAtom(i),
    });
  }
  const bonds = [];
  for (let b = 0; b < m.getAllBonds(); b++) {
    bonds.push({
      a1: m.getBondAtom(0, b),
      a2: m.getBondAtom(1, b),
      kind: bondKindFromOcl(m, b),
      aromatic: m.isAromaticBond(b),
    });
  }
  return { atoms, bonds };
}

/** OCL's free valence of an atom (negative = over its maximum valence). */
export function freeValence(mol: Mol, atom: number): number {
  const m = unwrap(mol);
  m.ensureHelperArrays(Molecule.cHelperNeighbours);
  return m.getFreeValence(atom);
}

export function molFormula(mol: Mol): MolFormula {
  const { formula, relativeWeight, absoluteWeight } = unwrap(mol).getMolecularFormula();
  return { formula, relativeWeight, absoluteWeight };
}

export function atomCount(mol: Mol): number {
  return unwrap(mol).getAllAtoms();
}

/**
 * Parses SMILES. With `coordinates: false` no 2D layout is invented (cheap; use it to check
 * the size before paying for layout). Throws OCL's parse error for invalid text.
 */
export function smilesToMol(text: string, opts: { coordinates: boolean }): Mol {
  return wrap(Molecule.fromSmiles(text, { noCoordinates: !opts.coordinates }));
}

/** Parses a V2000/V3000 Molfile. OCL returns an empty molecule for unreadable text. */
export function molfileToMol(text: string): Mol {
  return wrap(Molecule.fromMolfile(text));
}

/** A copy with fresh 2D coordinates (OCL coordinate invention, fixed seed, bond length 1.0). */
export function withInventedCoordinates(mol: Mol): Mol {
  const copy = unwrap(mol).getCompactCopy();
  // Parities must be perceived from the old layout first; invention then re-chooses up/down
  // bonds that express the same configuration in the new one.
  copy.ensureHelperArrays(Molecule.cHelperParities);
  copy.inventCoordinates();
  return wrap(copy);
}

/** Isomeric SMILES (aromatic lowercase). Pseudo-atoms come out as OCL's `[?]`. */
export function molToSmiles(mol: Mol): string {
  return unwrap(mol).toIsomericSmiles();
}

export function molToMolfile(mol: Mol, version: 'V2000' | 'V3000'): string {
  const m = unwrap(mol);
  return version === 'V3000' ? m.toMolfileV3() : m.toMolfile();
}

/** OCL's canonical IDCode, stereo included: equal for the same structure however drawn. */
export function molIdCode(mol: Mol): string {
  return unwrap(mol).getIDCode();
}
