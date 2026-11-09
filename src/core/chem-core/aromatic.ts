// The editor's Kekulé ↔ circle toggle: rewrites bond orders through doc-model ops, so both work
// inside `History.transact` as one undo step.
import {
  DocError,
  fragments,
  updateBond,
  type AtomId,
  type Bond,
  type BondId,
  type Doc,
} from '../doc-model/index';
import { ChemError } from './errors';
import { assignKekule } from './kekule';
import { perceiveFragment } from './perceive';

/**
 * The fragments touched by `atoms` (default: all) and a test for "bond is in scope" (both of its
 * atoms selected). Chemistry is always judged on whole fragments.
 */
function scope(doc: Doc, atoms?: Iterable<AtomId>) {
  const wanted = atoms === undefined ? null : new Set(atoms);
  if (wanted) for (const id of wanted) if (!doc.atoms[id]) throw new DocError('unknown-atom', id);
  const frags = wanted
    ? fragments(doc).filter((f) => f.some((a) => wanted.has(a)))
    : fragments(doc);
  const inScope = (b: Bond): boolean => !wanted || (wanted.has(b.a1) && wanted.has(b.a2));
  return { frags, inScope };
}

/** Bonds OpenChemLib perceives as aromatic become order 1.5 (circle-in-ring). Idempotent. */
export function aromatize(doc: Doc, atoms?: Iterable<AtomId>): Doc {
  const { frags, inScope } = scope(doc, atoms);
  const toChange: BondId[] = [];
  for (const frag of frags) {
    const { bondInfo } = perceiveFragment(doc, frag);
    for (const [id, info] of bondInfo) {
      const bond = doc.bonds[id] as Bond;
      if (info.aromatic && bond.order !== 1.5 && inScope(bond)) toChange.push(id);
    }
  }
  let out = doc;
  for (const id of toChange) out = updateBond(out, id, { order: 1.5 });
  return out;
}

/**
 * Every order-1.5 bond (both atoms in `atoms`, default all) becomes single or double by
 * chem-core's Kekulé assignment. Throws ChemError('cannot-kekulize') if one of them belongs to
 * a 1.5 system with no valid assignment (and changes nothing).
 */
export function kekulize(doc: Doc, atoms?: Iterable<AtomId>): Doc {
  const { frags, inScope } = scope(doc, atoms);
  const changes: [BondId, 1 | 2][] = [];
  for (const frag of frags) {
    const { orders, failures } = assignKekule(doc, frag);
    const failed = failures.flat().filter((id) => inScope(doc.bonds[id] as Bond));
    if (failed.length > 0) {
      throw new ChemError(
        'cannot-kekulize',
        `No single/double pattern exists for aromatic bonds ${failed.join(', ')}.`,
      );
    }
    for (const [id, order] of orders) if (inScope(doc.bonds[id] as Bond)) changes.push([id, order]);
  }
  let out = doc;
  for (const [id, order] of changes) out = updateBond(out, id, { order });
  return out;
}
