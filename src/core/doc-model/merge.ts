import { castDraft } from 'immer';
import { anchorsOf, resolveAnchor } from './anchors';
import { findBond } from './bonds';
import { pruneGroups } from './delete';
import { edit } from './edit';
import { DocError } from './errors';
import type { Anchor, AtomId, BondId, Doc } from './types';
import { invalid } from './validate';

type BondFate =
  { kind: 'moved' } | { kind: 'deleted' } | { kind: 'merged'; into: BondId; flip: boolean };

/**
 * Merges `drop` into `keep` (e.g. an atom dragged onto another). `drop`'s bonds are re-pointed
 * to `keep`; a bond that would duplicate one of `keep`'s merges into it, and the keep–drop
 * bond (now a self-bond) is deleted. References follow: atom anchors and caption targets move
 * to `keep`; bond anchors move to the surviving bond (with `t` flipped when its direction is
 * reversed) or, for the deleted keep–drop bond, become point anchors. `keep`'s fields win.
 */
export function mergeAtoms(doc: Doc, keep: AtomId, drop: AtomId): Doc {
  if (!(keep in doc.atoms)) throw new DocError('unknown-atom', keep);
  if (!(drop in doc.atoms)) throw new DocError('unknown-atom', drop);
  if (keep === drop) invalid('cannot merge an atom with itself');

  const fates = new Map<BondId, BondFate>();
  for (const bond of Object.values(doc.bonds)) {
    if (bond.a1 !== drop && bond.a2 !== drop) continue;
    const other = bond.a1 === drop ? bond.a2 : bond.a1;
    if (other === keep) {
      fates.set(bond.id, { kind: 'deleted' });
      continue;
    }
    const existing = findBond(doc, keep, other);
    if (existing === undefined) {
      fates.set(bond.id, { kind: 'moved' });
    } else {
      const mappedA1 = bond.a1 === drop ? keep : bond.a1;
      fates.set(bond.id, {
        kind: 'merged',
        into: existing,
        flip: doc.bonds[existing]?.a1 !== mappedA1,
      });
    }
  }

  // Anchor fixes are computed against the doc before the merge.
  const anchorFixes: [string, string, Anchor][] = [];
  for (const obj of Object.values(doc.objects)) {
    for (const [field, anchor] of anchorsOf(obj)) {
      const fixed = remapAnchor(doc, anchor, keep, drop, fates);
      if (fixed) anchorFixes.push([obj.id, field, fixed]);
    }
  }

  return edit(doc, (d) => {
    for (const [id, fate] of fates) {
      const bond = d.bonds[id];
      if (!bond) continue;
      if (fate.kind === 'moved') {
        if (bond.a1 === drop) bond.a1 = keep;
        else bond.a2 = keep;
      } else {
        Reflect.deleteProperty(d.bonds, id);
      }
    }
    for (const [id, field, anchor] of anchorFixes) {
      (d.objects[id as keyof typeof d.objects] as unknown as Record<string, unknown>)[field] =
        castDraft(anchor);
    }
    for (const obj of Object.values(d.objects)) {
      if (obj.type === 'caption' && obj.target.includes(drop)) {
        const target = obj.target.map((a) => (a === drop ? keep : a));
        obj.target = target.filter((a, i) => target.indexOf(a) === i);
      }
    }
    Reflect.deleteProperty(d.atoms, drop);
    pruneGroups(d, new Set([drop]));
  })[0];
}

function remapAnchor(
  doc: Doc,
  anchor: Anchor,
  keep: AtomId,
  drop: AtomId,
  fates: ReadonlyMap<BondId, BondFate>,
): Anchor | undefined {
  if (anchor.kind === 'atom') {
    return anchor.atom === drop ? { ...anchor, atom: keep } : undefined;
  }
  if (anchor.kind !== 'bond') return undefined;
  const fate = fates.get(anchor.bond);
  if (!fate || fate.kind === 'moved') return undefined;
  if (fate.kind === 'deleted') return { kind: 'point', p: resolveAnchor(doc, anchor) };
  const t = anchor.t ?? 0.5;
  const next: Anchor = { kind: 'bond', bond: fate.into };
  return anchor.t === undefined && !fate.flip ? next : { ...next, t: fate.flip ? 1 - t : t };
}
