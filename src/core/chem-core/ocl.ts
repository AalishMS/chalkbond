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

/**
 * OCL moves "simple" hydrogen atoms (H, no isotope/charge/radical/label) and their bonds to the
 * end of its lists during helper perception (verified). `buildMol` puts them last itself and
 * keeps the caller → OCL index maps here, so callers' indexes stay valid. `null` = identity
 * (molecules OCL created itself, read in OCL's own order).
 */
interface Handle {
  readonly m: Molecule;
  readonly atomAt: readonly number[] | null;
  readonly bondAt: readonly number[] | null;
}

const wrap = (h: Handle): Mol => h as unknown as Mol;
const unwrap = (mol: Mol): Handle => mol as unknown as Handle;
const own = (m: Molecule): Mol => wrap({ m, atomAt: null, bondAt: null });

const RADICAL_TO_OCL = [0, Molecule.cAtomRadicalStateD, Molecule.cAtomRadicalStateT] as const;
const MAX_ABNORMAL_VALENCE = 15;

const isSimpleHydrogen = (a: MolAtom): boolean =>
  a.atomicNo === 1 && a.mass === 0 && a.charge === 0 && a.radical === 0 && a.customLabel === null;

/** Puts the items `last` picks after the others (stable); returns item index → new position. */
function positions(n: number, last: (i: number) => boolean): number[] {
  const order = [...Array(n).keys()].sort((p, q) => Number(last(p)) - Number(last(q)) || p - q);
  const at = new Array<number>(n);
  order.forEach((item, k) => (at[item] = k));
  return at;
}

/** Builds an OCL molecule. Callers keep their atom and bond indexes (see `Handle`). */
export function buildMol(spec: MolSpec): Mol {
  const simple = spec.atoms.map(isSimpleHydrogen);
  const atomAt = positions(spec.atoms.length, (i) => simple[i] === true);
  const bondAt = positions(spec.bonds.length, (b) => {
    const bond = spec.bonds[b] as MolBond;
    return simple[bond.a1] === true || simple[bond.a2] === true;
  });
  const atomOf = new Array<number>(spec.atoms.length);
  atomAt.forEach((k, i) => (atomOf[k] = i));
  const bondOf = new Array<number>(spec.bonds.length);
  bondAt.forEach((k, b) => (bondOf[k] = b));

  const m = new Molecule(Math.max(spec.atoms.length, 1), Math.max(spec.bonds.length, 1));
  for (const i of atomOf) {
    const atom = spec.atoms[i] as MolSpec['atoms'][number];
    const k = m.addAtom(atom.atomicNo);
    m.setAtomX(k, atom.x);
    m.setAtomY(k, atom.y);
    if (atom.charge !== 0) m.setAtomCharge(k, atom.charge);
    if (atom.mass !== 0) m.setAtomMass(k, atom.mass);
    if (atom.radical !== 0) m.setAtomRadical(k, RADICAL_TO_OCL[atom.radical]);
    if (atom.customLabel !== null) m.setAtomCustomLabel(k, atom.customLabel);
  }
  for (const b of bondOf) {
    const bond = spec.bonds[b] as MolBond;
    const k = m.addBond(atomAt[bond.a1] as number, atomAt[bond.a2] as number);
    m.setBondType(k, bondTypeToOcl(bond.kind));
  }
  spec.atoms.forEach((atom, i) => {
    if (atom.hCount !== undefined) fixHydrogens(m, atomAt[i] as number, atom.hCount);
  });
  m.ensureHelperArrays(Molecule.cHelperRings);
  spec.atoms.forEach((atom, i) => {
    const k = atomAt[i] as number;
    if (m.getAtomicNo(k) !== atom.atomicNo || m.getAtomX(k) !== atom.x) {
      throw new Error('openchemlib reordered atoms unexpectedly');
    }
  });
  return wrap({ m, atomAt, bondAt });
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

/** Reads a molecule back (in the caller's indexes): atoms, bonds, implicit H, aromaticity. */
export function readMol(mol: Mol): MolData {
  const { m, atomAt, bondAt } = unwrap(mol);
  m.ensureHelperArrays(Molecule.cHelperRings);
  const nAtoms = m.getAllAtoms();
  const nBonds = m.getAllBonds();
  const oclAtom = (i: number): number => (atomAt ? (atomAt[i] as number) : i);
  const callerAtom = new Array<number>(nAtoms);
  for (let i = 0; i < nAtoms; i++) callerAtom[oclAtom(i)] = i;

  const atoms = [];
  for (let i = 0; i < nAtoms; i++) {
    const k = oclAtom(i);
    atoms.push({
      atomicNo: m.getAtomicNo(k),
      x: m.getAtomX(k),
      y: m.getAtomY(k),
      charge: m.getAtomCharge(k),
      mass: m.getAtomMass(k),
      radical: radicalFromOcl(m.getAtomRadical(k)),
      customLabel: m.getAtomCustomLabel(k),
      implicitH: m.getImplicitHydrogens(k),
      aromatic: m.isAromaticAtom(k),
    });
  }
  const bonds = [];
  for (let b = 0; b < nBonds; b++) {
    const k = bondAt ? (bondAt[b] as number) : b;
    bonds.push({
      a1: callerAtom[m.getBondAtom(0, k)] as number,
      a2: callerAtom[m.getBondAtom(1, k)] as number,
      kind: bondKindFromOcl(m, k),
      aromatic: m.isAromaticBond(k),
    });
  }
  return { atoms, bonds };
}

/** OCL's free valence of an atom (negative = over its maximum valence). */
export function freeValence(mol: Mol, atom: number): number {
  const { m, atomAt } = unwrap(mol);
  m.ensureHelperArrays(Molecule.cHelperNeighbours);
  return m.getFreeValence(atomAt ? (atomAt[atom] as number) : atom);
}

export function molFormula(mol: Mol): MolFormula {
  const { formula, relativeWeight, absoluteWeight } = unwrap(mol).m.getMolecularFormula();
  return { formula, relativeWeight, absoluteWeight };
}

const OCL_HYDROGEN_WEIGHT = 1.00794;
const weightCache = new Map<string, number>();

/**
 * OCL's average weight of one atom: the natural element (`mass` 0) or the isotope `mass`.
 * Used for elements outside chem-core's own table and for isotope masses.
 */
export function atomWeight(atomicNo: number, mass: number): number {
  const key = `${atomicNo}/${mass}`;
  let weight = weightCache.get(key);
  if (weight === undefined) {
    const m = new Molecule(1, 1);
    const a = m.addAtom(atomicNo);
    if (mass !== 0) m.setAtomMass(a, mass);
    m.setAtomAbnormalValence(a, 0);
    m.ensureHelperArrays(Molecule.cHelperNeighbours);
    weight =
      m.getMolecularFormula().relativeWeight - m.getImplicitHydrogens(a) * OCL_HYDROGEN_WEIGHT;
    weightCache.set(key, weight);
  }
  return weight;
}

export function atomCount(mol: Mol): number {
  return unwrap(mol).m.getAllAtoms();
}

/**
 * Parses SMILES. With `coordinates: false` no 2D layout is invented (cheap; use it to check
 * the size before paying for layout). Throws OCL's parse error for invalid text.
 */
export function smilesToMol(text: string, opts: { coordinates: boolean }): Mol {
  return own(Molecule.fromSmiles(text, { noCoordinates: !opts.coordinates }));
}

/** Parses a V2000/V3000 Molfile. OCL returns an empty molecule for unreadable text. */
export function molfileToMol(text: string): Mol {
  return own(Molecule.fromMolfile(text));
}

/** A copy with fresh 2D coordinates (OCL coordinate invention, fixed seed, bond length 1.0). */
export function withInventedCoordinates(mol: Mol): Mol {
  const handle = unwrap(mol);
  const copy = handle.m.getCompactCopy();
  // Parities must be perceived from the old layout first; invention then re-chooses up/down
  // bonds that express the same configuration in the new one.
  copy.ensureHelperArrays(Molecule.cHelperParities);
  // keepHydrogens: drawn H atoms are atoms of the doc; by default OCL would delete them.
  copy.inventCoordinates({ keepHydrogens: true });
  if (copy.getAllAtoms() !== handle.m.getAllAtoms()) {
    throw new Error('openchemlib changed the atom count while inventing coordinates');
  }
  // The copy keeps OCL's atom/bond order, so the caller's index maps still apply.
  return wrap({ ...handle, m: copy });
}

/** Isomeric SMILES (aromatic lowercase). Pseudo-atoms come out as OCL's `[?]`. */
export function molToSmiles(mol: Mol): string {
  return unwrap(mol).m.toIsomericSmiles();
}

export function molToMolfile(mol: Mol, version: 'V2000' | 'V3000'): string {
  const { m } = unwrap(mol);
  return version === 'V3000' ? m.toMolfileV3() : m.toMolfile();
}

/** OCL's canonical IDCode, stereo included: equal for the same structure however drawn. */
export function molIdCode(mol: Mol, opts: { stereo?: boolean } = {}): string {
  const { m } = unwrap(mol);
  return opts.stereo === false
    ? m.getCanonizedIDCode(Molecule.CANONIZER_NEGLECT_ANY_STEREO_INFORMATION)
    : m.getIDCode();
}
