// Perception: implicit H, aromaticity, valence, formula and warnings for a doc.
import {
  DocError,
  PERIODIC_SYMBOLS,
  fragments,
  type AtomId,
  type BondId,
  type Doc,
} from '../doc-model/index';
import { makeFormula, sumFormulas } from './formula';
import { buildMolecule } from './molecule';
import { STANDARD_ATOMIC_WEIGHTS } from './atomic-weights';
import { atomWeight, molFormula, readMol } from './ocl';
import type { AtomInfo, BondInfo, ChemWarning, Formula, Perception } from './types';

/** Perception of one fragment — the unit `createPerceiver` caches. */
export interface FragmentResult {
  readonly atoms: readonly AtomId[];
  readonly atomInfo: ReadonlyMap<AtomId, AtomInfo>;
  readonly bondInfo: ReadonlyMap<BondId, BondInfo>;
  readonly formula: Formula;
  readonly warnings: readonly ChemWarning[];
}

/** Perceives one fragment (a connected component, atoms in id order). */
export function perceiveFragment(doc: Doc, atoms: readonly AtomId[]): FragmentResult {
  const built = buildMolecule(doc, atoms, { stereo: false });
  const data = readMol(built.mol);

  // H per molecule atom: OCL's, except a drawn atom's fixed `explicitH`, which wins even where
  // OCL cannot hold it (e.g. a bare N⁺), so AtomInfo, formula and masses always agree.
  const hydrogens = data.atoms.map((a) => a.implicitH);
  const atomInfo = new Map<AtomId, AtomInfo>();
  for (const id of atoms) {
    const index = built.atomIndex.get(id) as number;
    const ocl = data.atoms[index];
    const labelled = built.kinds.get(id) !== 'element';
    const fixed = labelled ? undefined : doc.atoms[id]?.explicitH;
    if (fixed !== undefined) hydrogens[index] = fixed;
    atomInfo.set(id, {
      implicitH: labelled ? 0 : (hydrogens[index] ?? 0),
      aromatic: !labelled && ocl?.aromatic === true,
      valence: built.over.has(id) ? 'over' : 'ok',
    });
  }
  const bondInfo = new Map<BondId, BondInfo>();
  for (const [id, index] of built.bondIndex) {
    bondInfo.set(id, { aromatic: data.bonds[index]?.aromatic === true });
  }

  const counts: Record<string, number> = {};
  let charge = 0;
  let pseudo = false;
  let mw = 0;
  let extraH = 0; // fixed H beyond OCL's count (corrects OCL's exact mass)
  data.atoms.forEach((a, index) => {
    const h = hydrogens[index] ?? 0;
    extraH += h - a.implicitH;
    const symbol = atomSymbol(a.atomicNo, a.mass, a.customLabel);
    counts[symbol] = (counts[symbol] ?? 0) + 1;
    if (h > 0) counts['H'] = (counts['H'] ?? 0) + h;
    charge += a.charge;
    if (a.atomicNo === 0) pseudo = true;
    else mw += averageWeight(a.atomicNo, a.mass) + h * HYDROGEN;
  });
  const formula = makeFormula(
    counts,
    charge,
    pseudo ? null : mw,
    pseudo ? null : molFormula(built.mol).absoluteWeight + extraH * HYDROGEN_EXACT,
  );
  return { atoms, atomInfo, bondInfo, formula, warnings: built.warnings };
}

const HYDROGEN = STANDARD_ATOMIC_WEIGHTS['H'] as number;
/** Monoisotopic mass of ¹H (AME2020). */
const HYDROGEN_EXACT = 1.00782503223;

/** Average atomic weight: chem-core's IUPAC table, else OCL's; isotopes take OCL's mass. */
function averageWeight(atomicNo: number, mass: number): number {
  if (mass !== 0) return atomWeight(atomicNo, mass);
  return (
    STANDARD_ATOMIC_WEIGHTS[PERIODIC_SYMBOLS[atomicNo - 1] as string] ?? atomWeight(atomicNo, 0)
  );
}

function atomSymbol(atomicNo: number, mass: number, customLabel: string | null): string {
  if (atomicNo === 0) return customLabel ?? '*';
  if (atomicNo === 1 && mass === 2) return 'D';
  if (atomicNo === 1 && mass === 3) return 'T';
  return PERIODIC_SYMBOLS[atomicNo - 1] as string;
}

/** Assembles a doc's perception from per-fragment results (in `fragments()` order). */
export function combine(results: readonly FragmentResult[]): Perception {
  const atoms: Record<AtomId, AtomInfo> = {};
  const bonds: Record<BondId, BondInfo> = {};
  const warnings: ChemWarning[] = [];
  for (const r of results) {
    for (const [id, info] of r.atomInfo) atoms[id] = info;
    for (const [id, info] of r.bondInfo) bonds[id] = info;
    warnings.push(...r.warnings);
  }
  return {
    atoms,
    bonds,
    fragments: results.map((r) => ({ atoms: r.atoms, formula: r.formula })),
    warnings,
  };
}

/** Implicit H, aromaticity, valence warnings and formula of every fragment in the doc. */
export function perceive(doc: Doc): Perception {
  return combine(fragments(doc).map((frag) => perceiveFragment(doc, frag)));
}

/**
 * Formula of the whole fragments touched by `atoms`, summed (SPEC.md decision: a selection's
 * formula/MW covers every fragment it touches). Throws DocError for unknown atom ids.
 */
export function formulaOf(doc: Doc, atoms: Iterable<AtomId>): Formula {
  const wanted = new Set(atoms);
  for (const id of wanted) if (!doc.atoms[id]) throw new DocError('unknown-atom', id);
  const touched = fragments(doc).filter((frag) => frag.some((a) => wanted.has(a)));
  return sumFormulas(touched.map((frag) => perceiveFragment(doc, frag).formula));
}
