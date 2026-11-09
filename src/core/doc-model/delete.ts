import { castDraft } from 'immer';
import { anchorsOf, resolveAnchor } from './anchors';
import { edit, type DocDraft } from './edit';
import { DocError } from './errors';
import type { Anchor, AtomId, BondId, Doc, ObjectId, Selection } from './types';
import { removeFromZOrder } from './z-order';

/**
 * Deletes the selection with the cascades from SPEC-doc-model.md:
 * atom → its bonds; caption targets lose it (empty captions go); anchors to deleted atoms/bonds
 * become point anchors at their last resolved position; arrow → its attached texts; every
 * deleted object leaves zOrder and groups; empty groups go.
 */
export function deleteItems(doc: Doc, sel: Selection): Doc {
  for (const id of sel.atoms) if (!(id in doc.atoms)) throw new DocError('unknown-atom', id);
  for (const id of sel.bonds) if (!(id in doc.bonds)) throw new DocError('unknown-bond', id);
  for (const id of sel.objects) {
    if (!(id in doc.objects)) throw new DocError('unknown-object', id);
  }

  const atoms = new Set<AtomId>(sel.atoms);
  const bonds = new Set<BondId>(sel.bonds);
  for (const bond of Object.values(doc.bonds)) {
    if (atoms.has(bond.a1) || atoms.has(bond.a2)) bonds.add(bond.id);
  }

  const objects = new Set<ObjectId>(sel.objects);
  const captionTargets = new Map<ObjectId, AtomId[]>();
  for (const obj of Object.values(doc.objects)) {
    if (obj.type === 'text' && obj.attachedTo && objects.has(obj.attachedTo.arrow)) {
      objects.add(obj.id);
    }
    if (obj.type === 'caption' && !objects.has(obj.id)) {
      const target = obj.target.filter((a) => !atoms.has(a));
      if (target.length === 0) objects.add(obj.id);
      else if (target.length !== obj.target.length) captionTargets.set(obj.id, target);
    }
  }

  // Resolve before anything is removed: positions come from the doc as it was.
  const anchorFixes: [ObjectId, string, Anchor][] = [];
  for (const obj of Object.values(doc.objects)) {
    if (objects.has(obj.id)) continue;
    for (const [field, anchor] of anchorsOf(obj)) {
      const lost =
        (anchor.kind === 'atom' && atoms.has(anchor.atom)) ||
        (anchor.kind === 'bond' && bonds.has(anchor.bond));
      if (lost) anchorFixes.push([obj.id, field, { kind: 'point', p: resolveAnchor(doc, anchor) }]);
    }
  }

  if (atoms.size + bonds.size + objects.size === 0) return doc;

  return edit(doc, (d) => {
    for (const id of atoms) Reflect.deleteProperty(d.atoms, id);
    for (const id of bonds) Reflect.deleteProperty(d.bonds, id);
    for (const id of objects) Reflect.deleteProperty(d.objects, id);
    for (const [id, target] of captionTargets) {
      const caption = d.objects[id];
      if (caption?.type === 'caption') caption.target = castDraft(target);
    }
    for (const [id, field, anchor] of anchorFixes) {
      (d.objects[id] as unknown as Record<string, unknown>)[field] = castDraft(anchor);
    }
    removeFromZOrder(d, objects);
    pruneGroups(d, new Set<string>([...atoms, ...objects]));
  })[0];
}

/** Removes ids from group memberships; deletes groups left empty. */
export function pruneGroups(d: DocDraft, removed: ReadonlySet<string>): void {
  if (removed.size === 0) return;
  for (const group of Object.values(d.groups)) {
    const m = group.members;
    if (m.atoms.some((a) => removed.has(a))) m.atoms = m.atoms.filter((a) => !removed.has(a));
    if (m.objects.some((o) => removed.has(o))) {
      m.objects = m.objects.filter((o) => !removed.has(o));
    }
    if (m.atoms.length === 0 && m.objects.length === 0) Reflect.deleteProperty(d.groups, group.id);
  }
}
