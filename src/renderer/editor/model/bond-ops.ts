// The document edits of the Bond tool and of the hover keys (SPEC-editor.md B1-B5, P1, R5): pure
// functions from a document to a document. A tool runs them outside history for the ghost preview
// and inside `transact` for the commit, so both issue the same ids.
import {
  addAtom,
  addBond,
  deleteItems,
  findBond,
  updateBond,
  updateObject,
  type Anchor,
  type AtomId,
  type BondId,
  type BondOrder,
  type Doc,
  type ObjectId,
  type Point,
} from '@core/doc-model';
import { distance, normalize, snapAngle } from './geometry';
import { sproutDirections } from './placement';

/** B3: a sprouted bond that ends within this many BLU of an unbonded atom closes onto it. */
export const CLOSE_BLU = 0.25;
/** G4: every drawing tool places atoms this far from the atom a bond starts at. */
export const BOND_LEN = 1;
/** B2: drag directions snap to multiples of this many degrees. */
export const SNAP_DEG = 30;
/** B1: the default direction of a lone bond, degrees up from +x. */
const FIRST_BOND_DEG = 30;

/** What a new bond is: the option's order and stereo (wedge and hash are order 1). */
export interface BondSpec {
  readonly order: 1 | 2 | 3;
  readonly stereo: 'none' | 'wedge' | 'hash';
}

/** The `BondSpec` of a Bond tool option id (`single`, `double`, `triple`, `wedge`, `hash`). */
export function bondSpec(variant: string): BondSpec {
  switch (variant) {
    case 'double':
      return { order: 2, stereo: 'none' };
    case 'triple':
      return { order: 3, stereo: 'none' };
    case 'wedge':
      return { order: 1, stereo: 'wedge' };
    case 'hash':
      return { order: 1, stereo: 'hash' };
    default:
      return { order: 1, stereo: 'none' };
  }
}

/** A document edit and, when it ends on an existing atom, that atom (for the merge circle). */
export interface BondEdit {
  readonly doc: Doc;
  readonly merge?: AtomId;
}

/** Where a drag begins: an existing atom, or a point of empty canvas that becomes an atom. */
export type BondStart = { readonly atom: AtomId } | { readonly point: Point };
/** Where it ends: a new atom at a point, or an existing atom. */
export type BondEnd = { readonly at: Point } | { readonly atom: AtomId };

/** The keys (`atom:a1`, `bond:b3`) of the atoms and bonds `after` has that `before` did not. */
export function addedKeys(before: Doc, after: Doc): Set<string> {
  const keys = new Set<string>();
  for (const id of Object.keys(after.atoms)) if (!(id in before.atoms)) keys.add(`atom:${id}`);
  for (const id of Object.keys(after.bonds)) if (!(id in before.bonds)) keys.add(`bond:${id}`);
  return keys;
}

const init = (spec: BondSpec): { order: BondOrder; stereo: BondSpec['stereo'] } => ({
  order: spec.order,
  stereo: spec.stereo,
});

/** B1: a bond from a new carbon at `at` to a new carbon 30 degrees up and to the right. */
export function newBond(doc: Doc, at: Point, spec: BondSpec): BondEdit {
  const k = (FIRST_BOND_DEG * Math.PI) / 180;
  const end = { x: at.x + Math.cos(k) * BOND_LEN, y: at.y - Math.sin(k) * BOND_LEN };
  const edit = joinBond(doc, { point: at }, { at: end }, spec);
  // Two new atoms can never be "already bonded".
  return edit ?? { doc };
}

/** The atom (other than `except`) within `reach` BLU of `p`, nearest first. */
function atomNear(doc: Doc, p: Point, reach: number, except: AtomId | null): AtomId | null {
  let best: { id: AtomId; d: number } | null = null;
  for (const atom of Object.values(doc.atoms)) {
    if (atom.id === except) continue;
    const d = distance(p, atom);
    if (d <= reach && (best === null || d < best.d)) best = { id: atom.id, d };
  }
  return best === null ? null : best.id;
}

/**
 * B3 / R5: a bond from `from` in the default direction (P1). If the place is within 0.25 BLU of an
 * atom `from` is not bonded to, the bond closes onto that atom (`merge`); if `from` is bonded to
 * it already, the next candidate is tried. Null when no candidate is left.
 */
export function sprout(doc: Doc, from: AtomId, spec: BondSpec): BondEdit | null {
  const origin = doc.atoms[from];
  if (!origin) return null;
  for (const dir of sproutDirections(doc, from)) {
    const place = { x: origin.x + dir.x * BOND_LEN, y: origin.y + dir.y * BOND_LEN };
    const near = atomNear(doc, place, CLOSE_BLU, from);
    if (near !== null) {
      if (findBond(doc, from, near) !== undefined) continue;
      const edit = joinBond(doc, { atom: from }, { atom: near }, spec);
      return edit === null ? null : { ...edit, merge: near };
    }
    return joinBond(doc, { atom: from }, { at: place }, spec);
  }
  return null;
}

/**
 * B2 / B4: a bond from `start` to `end`, creating the atoms that are points. Null when it would
 * join an atom to itself or to an atom it is already bonded to.
 */
export function joinBond(
  doc: Doc,
  start: BondStart,
  end: BondEnd,
  spec: BondSpec,
): BondEdit | null {
  if ('atom' in start && 'atom' in end) {
    if (start.atom === end.atom || findBond(doc, start.atom, end.atom) !== undefined) return null;
  }
  let d = doc;
  let a: AtomId;
  if ('atom' in start) a = start.atom;
  else [d, a] = addAtom(d, { element: 'C', x: start.point.x, y: start.point.y });
  let b: AtomId;
  if ('atom' in end) b = end.atom;
  else [d, b] = addAtom(d, { element: 'C', x: end.at.x, y: end.at.y });
  const next = addBond(d, a, b, init(spec))[0];
  return 'atom' in end ? { doc: next, merge: end.atom } : { doc: next };
}

/**
 * B2: where the new atom of a drag from `from` goes: 1.0 BLU away towards `pointer`, the direction
 * snapped to 30 degrees unless `free` (Shift).
 */
export function dragEnd(from: Point, pointer: Point, free: boolean): Point {
  const aimed = free ? pointer : snapAngle(from, pointer, SNAP_DEG);
  const u = normalize({ x: aimed.x - from.x, y: aimed.y - from.y });
  return { x: from.x + u.x * BOND_LEN, y: from.y + u.y * BOND_LEN };
}

/**
 * B2 / B4: the bond a drag from `start` to `pointer` (BLU) makes. It ends on `target` (the atom
 * under the pointer, H3) if there is one, else 1.0 BLU away towards the pointer, snapped to 30
 * degrees unless `free`; an end within 0.25 BLU of an atom closes onto it, as B3 does. Null when
 * nothing would be added: no direction yet, or the atoms are already bonded.
 */
export function dragBond(
  doc: Doc,
  start: BondStart,
  pointer: Point,
  free: boolean,
  target: AtomId | null,
  spec: BondSpec,
): BondEdit | null {
  const from = 'atom' in start ? doc.atoms[start.atom] : start.point;
  if (!from) return null;
  if (target !== null) return joinBond(doc, start, { atom: target }, spec);
  if (distance(from, pointer) < 1e-9) return null;
  const end = dragEnd(from, pointer, free);
  const near = atomNear(doc, end, CLOSE_BLU, 'atom' in start ? start.atom : null);
  return joinBond(doc, start, near === null ? { at: end } : { atom: near }, spec);
}

const PLACEMENTS = ['auto', 'left', 'right', 'center'] as const;

/**
 * Deletes bond `id` and adds it back with its two atoms swapped and the same fields (B5
 * "reverse"). Curved arrows and callouts anchored on the bond follow it, with `t` becoming
 * `1 - t`. The bond gets a new id.
 */
export function reverseBond(doc: Doc, id: BondId): Doc {
  const bond = doc.bonds[id];
  if (!bond) return doc;
  const refs: { object: ObjectId; field: 'from' | 'to' | 'anchor'; t: number }[] = [];
  for (const obj of Object.values(doc.objects)) {
    const fields: ('from' | 'to' | 'anchor')[] =
      obj.type === 'curved-arrow' ? ['from', 'to'] : obj.type === 'callout' ? ['anchor'] : [];
    for (const field of fields) {
      const anchor = (obj as unknown as Record<string, Anchor>)[field] as Anchor;
      if (anchor.kind === 'bond' && anchor.bond === id) {
        refs.push({ object: obj.id, field, t: anchor.t ?? 0.5 });
      }
    }
  }
  const stripped = deleteItems(doc, { atoms: new Set(), bonds: new Set([id]), objects: new Set() });
  const [added, fresh] = addBond(stripped, bond.a2, bond.a1, {
    order: bond.order,
    stereo: bond.stereo,
    doublePlacement: bond.doublePlacement,
    ...(bond.color === undefined ? {} : { color: bond.color }),
  });
  let next = added;
  for (const ref of refs) {
    const anchor: Anchor = { kind: 'bond', bond: fresh, t: 1 - ref.t };
    next = updateObject(next, ref.object, { [ref.field]: anchor } as never);
  }
  return next;
}

/** Sets bond order and clears stereo; null when the bond is already that. */
export function setBondOrder(doc: Doc, id: BondId, order: BondOrder): Doc | null {
  const bond = doc.bonds[id];
  if (!bond || (bond.order === order && bond.stereo === 'none')) return null;
  return updateBond(doc, id, { order, stereo: 'none' });
}

/**
 * Wedge / hash on a bond: another stereo is set (order 1, direction kept); the same one reverses
 * the direction (B5, K2).
 */
export function setBondStereo(doc: Doc, id: BondId, stereo: 'wedge' | 'hash'): Doc {
  const bond = doc.bonds[id];
  if (!bond) return doc;
  if (bond.stereo === stereo) return reverseBond(doc, id);
  return updateBond(doc, id, { order: 1, stereo });
}

/**
 * B5: the result of clicking bond `id` with the Bond option `variant`, `p` the click (BLU); null
 * when nothing would change. Single: clears stereo, else cycles the order 1, 2, 3 (1.5 goes to 2).
 * Double: sets 2, else cycles where the second line goes. Triple: sets 3. Wedge / hash: sets it
 * with the narrow end at the atom nearer the click, or reverses it if it is already set.
 */
export function clickBond(doc: Doc, id: BondId, variant: string, p: Point): Doc | null {
  const bond = doc.bonds[id];
  const a1 = bond && doc.atoms[bond.a1];
  const a2 = bond && doc.atoms[bond.a2];
  if (!bond || !a1 || !a2) return null;
  switch (variant) {
    case 'double': {
      if (bond.order !== 2 || bond.stereo !== 'none') return setBondOrder(doc, id, 2);
      const at = PLACEMENTS.indexOf(bond.doublePlacement);
      const next = PLACEMENTS[(at + 1) % PLACEMENTS.length] ?? 'auto';
      return updateBond(doc, id, { doublePlacement: next });
    }
    case 'triple':
      return setBondOrder(doc, id, 3);
    case 'wedge':
    case 'hash': {
      if (bond.stereo === variant) return reverseBond(doc, id);
      const set = updateBond(doc, id, { order: 1, stereo: variant });
      // The narrow end is a1: it must be the atom nearer the click.
      return distance(p, a2) < distance(p, a1) ? reverseBond(set, id) : set;
    }
    default: {
      if (bond.stereo !== 'none') return updateBond(doc, id, { stereo: 'none' });
      const order = bond.order === 1 ? 2 : bond.order === 2 ? 3 : bond.order === 3 ? 1 : 2;
      return updateBond(doc, id, { order });
    }
  }
}
