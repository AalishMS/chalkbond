import { castDraft, current, isDraft } from 'immer';
import { resolveAnchor } from './anchors';
import { byIdNumber } from './atoms';
import { assertNever } from './assert-never';
import { allocId, edit } from './edit';
import { DocError } from './errors';
import { applyAffine, translation } from './geometry';
import { checkInvariants } from './invariants';
import { transformItems, bounds } from './transform';
import type {
  Anchor,
  Atom,
  AtomId,
  Bond,
  BondId,
  Doc,
  DrawObject,
  Group,
  GroupId,
  ObjectId,
  Point,
  Selection,
} from './types';
import { checkPoint } from './validate';
import { addToZOrder } from './z-order';

/**
 * A self-contained piece of a document (clipboard, templates, name insert). Plain JSON; ids are
 * local to the sub-document and replaced on insert. Geometry is centred on the origin.
 */
export interface SubDoc {
  readonly atoms: Readonly<Record<AtomId, Atom>>;
  readonly bonds: Readonly<Record<BondId, Bond>>;
  readonly objects: Readonly<Record<ObjectId, DrawObject>>;
  readonly zOrder: readonly ObjectId[];
  readonly groups: Readonly<Record<GroupId, Group>>;
}

/**
 * Copies the selection out as a closed sub-document. Selected bonds bring their atoms; a bond
 * is kept iff both its atoms are; selected arrows bring their attached texts, and a text whose
 * arrow is not extracted loses `attachedTo`; anchors to atoms/bonds left behind become point
 * anchors; captions keep only extracted targets (and are dropped if none remain); groups keep
 * only extracted members. The result is translated so its bounds are centred on the origin.
 */
export function extract(source: Doc, sel: Selection): SubDoc {
  // Inside transact `source` is a draft; snapshot it so no proxy leaks into the result.
  const doc: Doc = isDraft(source) ? current(castDraft(source)) : source;
  for (const id of sel.atoms) if (!(id in doc.atoms)) throw new DocError('unknown-atom', id);
  for (const id of sel.objects) {
    if (!(id in doc.objects)) throw new DocError('unknown-object', id);
  }
  const atomIds = new Set<AtomId>(sel.atoms);
  for (const id of sel.bonds) {
    const bond = doc.bonds[id];
    if (!bond) throw new DocError('unknown-bond', id);
    atomIds.add(bond.a1);
    atomIds.add(bond.a2);
  }
  const bondIds = new Set<BondId>();
  for (const bond of Object.values(doc.bonds)) {
    if (atomIds.has(bond.a1) && atomIds.has(bond.a2)) bondIds.add(bond.id);
  }
  const objectIds = new Set<ObjectId>(sel.objects);
  for (const obj of Object.values(doc.objects)) {
    if (obj.type === 'text' && obj.attachedTo && sel.objects.has(obj.attachedTo.arrow)) {
      objectIds.add(obj.id);
    }
  }

  const keepAnchor = (a: Anchor): Anchor =>
    (a.kind === 'atom' && !atomIds.has(a.atom)) || (a.kind === 'bond' && !bondIds.has(a.bond))
      ? { kind: 'point', p: resolveAnchor(doc, a) }
      : a;

  const atoms: Record<string, Atom> = {};
  for (const id of sortIds(atomIds)) atoms[id] = doc.atoms[id as AtomId] as Atom;
  const bonds: Record<string, Bond> = {};
  for (const id of sortIds(bondIds)) bonds[id] = doc.bonds[id as BondId] as Bond;

  const objects: Record<string, DrawObject> = {};
  for (const id of sortIds(objectIds)) {
    const obj = doc.objects[id as ObjectId] as DrawObject;
    const kept = extractObject(obj, keepAnchor, atomIds, objectIds);
    if (kept) objects[id] = kept;
  }

  const groups: Record<string, Group> = {};
  for (const g of Object.values(doc.groups)) {
    const members = {
      atoms: g.members.atoms.filter((a) => atomIds.has(a)),
      objects: g.members.objects.filter((o) => o in objects),
    };
    if (members.atoms.length + members.objects.length > 0) groups[g.id] = { id: g.id, members };
  }

  const sub: SubDoc = {
    atoms,
    bonds,
    objects,
    zOrder: doc.zOrder.filter((id) => id in objects),
    groups,
  };
  return centre(sub);
}

function extractObject(
  obj: DrawObject,
  keepAnchor: (a: Anchor) => Anchor,
  atomIds: ReadonlySet<AtomId>,
  objectIds: ReadonlySet<ObjectId>,
): DrawObject | null {
  switch (obj.type) {
    case 'curved-arrow':
      return { ...obj, from: keepAnchor(obj.from), to: keepAnchor(obj.to) };
    case 'callout':
      return { ...obj, anchor: keepAnchor(obj.anchor) };
    case 'caption': {
      const target = obj.target.filter((a) => atomIds.has(a));
      if (target.length === 0) return null;
      return target.length === obj.target.length ? obj : { ...obj, target };
    }
    case 'text': {
      if (!obj.attachedTo || objectIds.has(obj.attachedTo.arrow)) return obj;
      const { attachedTo, ...free } = obj;
      return free;
    }
    case 'arrow':
    case 'plus':
    case 'bracket':
    case 'shape':
      return obj;
    default:
      return assertNever(obj);
  }
}

/** Translates a sub-document so its bounds are centred on the origin. */
function centre(sub: SubDoc): SubDoc {
  const doc = asDoc(sub);
  const box = bounds(doc);
  if (!box) return sub;
  const all = everything(doc);
  const moved = transformItems(doc, all, translation(-(box.x + box.w / 2), -(box.y + box.h / 2)));
  return {
    atoms: moved.atoms,
    bonds: moved.bonds,
    objects: moved.objects,
    zOrder: moved.zOrder,
    groups: moved.groups,
  };
}

/**
 * Inserts a sub-document with fresh ids so that its origin lands at `at`, and returns what was
 * inserted. The sub-document is validated first (it may come from a file or the clipboard).
 */
export function insert(doc: Doc, sub: SubDoc, at: Point): [Doc, Selection] {
  checkPoint('insert position', at);
  const problems = checkInvariants(asDoc(sub)).filter((v) => v.code !== 'id-out-of-range');
  if (problems.length > 0) {
    throw new DocError('invalid-value', `sub-document: ${problems[0]?.message ?? ''}`);
  }
  const shift = translation(at.x, at.y);
  const move = (p: Point): Point => applyAffine(shift, p);

  return edit(doc, (d) => {
    const ids = new Map<string, string>();
    for (const id of sortIds(Object.keys(sub.atoms))) ids.set(id, allocId(d, 'atom'));
    for (const id of sortIds(Object.keys(sub.bonds))) ids.set(id, allocId(d, 'bond'));
    for (const id of sortIds(Object.keys(sub.objects))) ids.set(id, allocId(d, 'object'));
    for (const id of sortIds(Object.keys(sub.groups))) ids.set(id, allocId(d, 'group'));
    const atomId = (id: AtomId) => ids.get(id) as AtomId;
    const bondId = (id: BondId) => ids.get(id) as BondId;
    const objectId = (id: ObjectId) => ids.get(id) as ObjectId;
    const anchor = (a: Anchor): Anchor => {
      switch (a.kind) {
        case 'point':
          return { kind: 'point', p: move(a.p) };
        case 'atom':
          return { ...a, atom: atomId(a.atom) };
        case 'bond':
          return { ...a, bond: bondId(a.bond) };
        default:
          return assertNever(a);
      }
    };

    const inserted = {
      atoms: new Set<AtomId>(),
      bonds: new Set<BondId>(),
      objects: new Set<ObjectId>(),
    };
    for (const atom of Object.values(sub.atoms)) {
      const id = atomId(atom.id);
      d.atoms[id] = castDraft({ ...atom, id, ...move(atom) });
      inserted.atoms.add(id);
    }
    for (const bond of Object.values(sub.bonds)) {
      const id = bondId(bond.id);
      d.bonds[id] = castDraft({ ...bond, id, a1: atomId(bond.a1), a2: atomId(bond.a2) });
      inserted.bonds.add(id);
    }
    for (const obj of Object.values(sub.objects)) {
      const id = objectId(obj.id);
      d.objects[id] = castDraft(insertObject({ ...obj, id }, move, anchor, atomId, objectId));
      inserted.objects.add(id);
    }
    for (const id of sub.zOrder) {
      const obj = d.objects[objectId(id)];
      if (obj) addToZOrder(d, obj as DrawObject);
    }
    for (const g of Object.values(sub.groups)) {
      const id = ids.get(g.id) as GroupId;
      d.groups[id] = castDraft({
        id,
        members: { atoms: g.members.atoms.map(atomId), objects: g.members.objects.map(objectId) },
      });
    }
    return inserted as Selection;
  });
}

function insertObject(
  obj: DrawObject,
  move: (p: Point) => Point,
  anchor: (a: Anchor) => Anchor,
  atomId: (id: AtomId) => AtomId,
  objectId: (id: ObjectId) => ObjectId,
): DrawObject {
  switch (obj.type) {
    case 'arrow':
      return { ...obj, from: move(obj.from), to: move(obj.to) };
    case 'curved-arrow':
      return { ...obj, from: anchor(obj.from), to: anchor(obj.to) };
    case 'plus':
      return { ...obj, at: move(obj.at) };
    case 'text':
      return obj.attachedTo
        ? {
            ...obj,
            at: move(obj.at),
            attachedTo: { ...obj.attachedTo, arrow: objectId(obj.attachedTo.arrow) },
          }
        : { ...obj, at: move(obj.at) };
    case 'caption':
      return { ...obj, target: obj.target.map(atomId) };
    case 'callout':
      return { ...obj, at: move(obj.at), anchor: anchor(obj.anchor) };
    case 'bracket':
    case 'shape':
      return { ...obj, rect: { ...obj.rect, ...move(obj.rect) } };
    default:
      return assertNever(obj);
  }
}

/** A Doc view of a sub-document (for invariant checks and geometry helpers). */
function asDoc(sub: SubDoc): Doc {
  let max = 0;
  for (const rec of [sub.atoms, sub.bonds, sub.objects, sub.groups]) {
    for (const id of Object.keys(rec)) max = Math.max(max, Number(id.slice(1)) || 0);
  }
  return {
    schemaVersion: 1,
    ...sub,
    nextId: max + 1,
    style: { preset: 'slides', overrides: {} },
    meta: { created: '', modified: '' },
  };
}

/** Selection of every atom, bond and object in a doc. */
export function everything(doc: Doc): Selection {
  return {
    atoms: new Set(Object.keys(doc.atoms) as AtomId[]),
    bonds: new Set(Object.keys(doc.bonds) as BondId[]),
    objects: new Set(Object.keys(doc.objects) as ObjectId[]),
  };
}

function sortIds(ids: Iterable<string>): string[] {
  return [...ids].sort(byIdNumber);
}
