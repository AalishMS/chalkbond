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
import { molFormula, readMol } from './ocl';
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

  const atomInfo = new Map<AtomId, AtomInfo>();
  for (const id of atoms) {
    const index = built.atomIndex.get(id) as number;
    const ocl = data.atoms[index];
    const labelled = built.kinds.get(id) !== 'element';
    atomInfo.set(id, {
      implicitH: labelled ? 0 : (doc.atoms[id]?.explicitH ?? ocl?.implicitH ?? 0),
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
  for (const a of data.atoms) {
    const symbol = atomSymbol(a.atomicNo, a.mass, a.customLabel);
    counts[symbol] = (counts[symbol] ?? 0) + 1;
    if (a.implicitH > 0) counts['H'] = (counts['H'] ?? 0) + a.implicitH;
    charge += a.charge;
    if (a.atomicNo === 0) pseudo = true;
  }
  const weights = pseudo ? null : molFormula(built.mol);
  const formula = makeFormula(
    counts,
    charge,
    weights?.relativeWeight ?? null,
    weights?.absoluteWeight ?? null,
  );
  return { atoms, atomInfo, bondInfo, formula, warnings: built.warnings };
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
