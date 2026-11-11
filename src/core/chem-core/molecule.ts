// Builds an OCL molecule from doc-model atoms, following SPEC-chem-core.md "Mapping doc-model ↔
// OpenChemLib": pseudo-atoms, abbreviations expanded, Kekulé-resolved 1.5 bonds, charges,
// isotopes, radicals, explicit H; H counts and over-valence from chem-core's valence model.
import {
  DocError,
  PERIODIC_SYMBOLS,
  PSEUDO_SYMBOLS,
  type Atom,
  type AtomId,
  type Bond,
  type BondId,
  type Doc,
} from '../doc-model/index';
import { ABBREVIATIONS } from './abbreviations';
import { assignKekule } from './kekule';
import { interpretLabel } from './labels';
import {
  buildMol,
  freeValence,
  readMol,
  smilesToMol,
  type Mol,
  type MolAtom,
  type MolBond,
  type MolBondKind,
  type MolData,
} from './ocl';
import type { ChemWarning } from './types';
import { allowedValences, fillHydrogens, isOverValence } from './valence';

/** How a doc atom was mapped. */
export type AtomKind = 'element' | 'pseudo' | 'abbreviation' | 'unknown';

export interface BuiltMolecule {
  readonly mol: Mol;
  /** OCL atom index of each doc atom (an abbreviation's attachment atom). */
  readonly atomIndex: ReadonlyMap<AtomId, number>;
  readonly bondIndex: ReadonlyMap<BondId, number>;
  readonly kinds: ReadonlyMap<AtomId, AtomKind>;
  /** Doc atoms over their allowed valence. */
  readonly over: ReadonlySet<AtomId>;
  readonly warnings: readonly ChemWarning[];
}

export interface BuildOptions {
  /** Map wedge/hash bonds to OCL up/down bonds (needed for SMILES/Molfile, not perception). */
  readonly stereo: boolean;
}

const PSEUDO = new Set(PSEUDO_SYMBOLS);
const byIdNumber = (p: string, q: string): number => Number(p.slice(1)) - Number(q.slice(1));

const groupCache = new Map<string, MolData>();
/** The abbreviation's group as parsed atoms/bonds, with a 2D layout (parsed once). */
function groupData(key: string): MolData {
  let data = groupCache.get(key);
  if (!data) {
    const def = ABBREVIATIONS[key];
    if (!def) throw new Error(`no abbreviation ${key}`);
    data = readMol(smilesToMol(def.smiles, { coordinates: true }));
    groupCache.set(key, data);
  }
  return data;
}

export function atomicNumber(symbol: string): number {
  return PERIODIC_SYMBOLS.indexOf(symbol) + 1;
}

/**
 * Builds one OCL molecule from `atomIds` (normally one fragment) and the bonds among them.
 * Bonds to atoms outside the set are dropped (their atoms simply get more H).
 */
export function buildMolecule(
  doc: Doc,
  atomIds: readonly AtomId[],
  opts: BuildOptions,
): BuiltMolecule {
  const ids = [...atomIds].sort(byIdNumber);
  const inSet = new Set(ids);
  for (const id of ids) if (!doc.atoms[id]) throw new DocError('unknown-atom', id);

  const kekule = assignKekule(doc, ids);
  const bonds: Bond[] = Object.values(doc.bonds)
    .filter((b) => inSet.has(b.a1) && inSet.has(b.a2))
    .sort((p, q) => byIdNumber(p.id, q.id));
  const orderOf = (b: Bond): 1 | 2 | 3 =>
    b.order === 1.5 ? (kekule.orders.get(b.id) ?? 1) : (b.order as 1 | 2 | 3);
  const used = new Map<AtomId, number>();
  const degree = new Map<AtomId, number>();
  for (const b of bonds) {
    for (const a of [b.a1, b.a2]) {
      used.set(a, (used.get(a) ?? 0) + orderOf(b));
      degree.set(a, (degree.get(a) ?? 0) + 1);
    }
  }

  const specAtoms: (MolAtom & { hCount?: number })[] = [];
  const specBonds: MolBond[] = [];
  const atomIndex = new Map<AtomId, number>();
  const kinds = new Map<AtomId, AtomKind>();
  const over = new Set<AtomId>();
  const askOcl: AtomId[] = [];
  const warnings: ChemWarning[] = [];
  const base = { charge: 0, mass: 0, radical: 0 as const, customLabel: null };

  for (const id of ids) {
    const atom = doc.atoms[id] as Atom;
    const interp = atom.label === undefined ? null : interpretLabel(atom.label);
    atomIndex.set(id, specAtoms.length);

    if (interp?.kind === 'abbreviation') {
      kinds.set(id, 'abbreviation');
      // The v1 groups are monovalent: exactly one single bond. A double or triple bond would
      // overfill the attachment atom, and the hidden group atoms (laid out by the group, not the
      // drawing) would then decide its E/Z.
      const n = degree.get(id) ?? 0;
      const order = used.get(id) ?? 0;
      if (n !== 1 || order !== 1) {
        warnings.push({
          code: 'abbreviation-bonds',
          atoms: [id],
          bonds: [],
          message:
            n === 1
              ? `"${interp.key}" needs exactly one single bond (it has a ${order === 2 ? 'double' : 'triple'} bond).`
              : `"${interp.key}" needs exactly one bond (it has ${n}).`,
        });
      }
      const group = groupData(interp.key);
      const first = specAtoms.length;
      const origin = group.atoms[0] as MolData['atoms'][number];
      for (const g of group.atoms) {
        specAtoms.push({
          ...base,
          atomicNo: g.atomicNo,
          charge: g.charge,
          x: atom.x + g.x - origin.x,
          y: atom.y + g.y - origin.y,
        });
      }
      for (const g of group.bonds) {
        specBonds.push({ a1: first + g.a1, a2: first + g.a2, kind: g.kind });
      }
      continue;
    }

    if (interp?.kind === 'unknown' || PSEUDO.has(atom.element)) {
      const label = interp?.kind === 'unknown' ? (atom.label as string) : atom.element;
      kinds.set(id, interp?.kind === 'unknown' ? 'unknown' : 'pseudo');
      if (interp?.kind === 'unknown') {
        warnings.push({
          code: 'unknown-label',
          atoms: [id],
          bonds: [],
          message: `Unknown label "${label}".`,
        });
      }
      specAtoms.push({ ...base, atomicNo: 0, x: atom.x, y: atom.y, customLabel: label });
      continue;
    }

    kinds.set(id, 'element');
    const valence = used.get(id) ?? 0;
    const allowed = allowedValences(atom.element, atom.charge, atom.radical);
    let hCount: number | undefined = atom.explicitH;
    if (allowed === null) {
      askOcl.push(id);
    } else if (hCount !== undefined) {
      if (isOverValence(allowed, valence + hCount)) over.add(id);
    } else {
      const fill = fillHydrogens(allowed, valence);
      if (fill.over) over.add(id);
      hCount = fill.h;
    }
    specAtoms.push({
      ...base,
      atomicNo: atomicNumber(atom.element),
      x: atom.x,
      y: atom.y,
      charge: atom.charge,
      mass: atom.isotope ?? 0,
      radical: atom.radical,
      ...(hCount === undefined ? {} : { hCount }),
    });
  }

  const bondIndex = new Map<BondId, number>();
  for (const b of bonds) {
    bondIndex.set(b.id, specBonds.length);
    specBonds.push({
      a1: atomIndex.get(b.a1) as number,
      a2: atomIndex.get(b.a2) as number,
      kind: bondKind(orderOf(b), opts.stereo ? b.stereo : 'none'),
    });
  }

  for (const failed of kekule.failures) {
    const atoms = new Set<AtomId>();
    for (const bid of failed) {
      const b = doc.bonds[bid] as Bond;
      atoms.add(b.a1).add(b.a2);
    }
    warnings.push({
      code: 'cannot-kekulize',
      atoms: [...atoms].sort(byIdNumber),
      bonds: failed,
      message: 'These aromatic (1.5) bonds have no valid single/double pattern.',
    });
  }

  const mol = buildMol({ atoms: specAtoms, bonds: specBonds });
  for (const id of askOcl) {
    if (
      doc.atoms[id]?.explicitH === undefined &&
      freeValence(mol, atomIndex.get(id) as number) < 0
    ) {
      over.add(id);
    }
  }
  for (const id of [...over].sort(byIdNumber)) {
    warnings.push({
      code: 'over-valence',
      atoms: [id],
      bonds: [],
      message: `${doc.atoms[id]?.element ?? '?'} has too many bonds.`,
    });
  }

  return { mol, atomIndex, bondIndex, kinds, over, warnings };
}

function bondKind(order: 1 | 2 | 3, stereo: Bond['stereo']): MolBondKind {
  if (order === 2) return 'double';
  if (order === 3) return 'triple';
  if (stereo === 'wedge') return 'up';
  if (stereo === 'hash') return 'down';
  return 'single';
}
