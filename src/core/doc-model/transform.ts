import { castDraft } from 'immer';
import { anchorsOf, resolveAnchor } from './anchors';
import { assertNever } from './assert-never';
import { edit } from './edit';
import { DocError } from './errors';
import { applyAffine, boundingRect, determinant, transformRect } from './geometry';
import type {
  Affine,
  Anchor,
  AtomId,
  Doc,
  DrawObject,
  ObjectId,
  Point,
  Rect,
  Selection,
} from './types';
import { checkFinite, invalid } from './validate';

/**
 * Transforms the selected items by `m` (move / rotate / flip / scale). Selected bonds bring
 * their atoms; selected arrows bring their attached texts. Atom/bond anchors are untouched
 * (they follow their atom); point anchors, points and arrow ends map exactly; rects stay
 * axis-aligned (see `transformRect`); a mirroring transform negates curved-arrow `bend`.
 */
export function transformItems(doc: Doc, sel: Selection, m: Affine): Doc {
  if (m.length !== 6) invalid('affine must have 6 numbers');
  checkFinite('affine', ...m);
  const { atoms, objects } = expand(doc, sel);
  if (atoms.size + objects.size === 0) return doc;
  const mirror = determinant(m) < 0;
  const map = (p: Point): Point => applyAffine(m, p);
  const mapAnchor = (a: Anchor): Anchor =>
    a.kind === 'point' ? { kind: 'point', p: map(a.p) } : a;

  return edit(doc, (d) => {
    for (const id of atoms) {
      const atom = d.atoms[id];
      if (!atom) continue;
      const p = map(atom);
      atom.x = p.x;
      atom.y = p.y;
    }
    for (const id of objects) {
      const obj = doc.objects[id];
      if (obj) d.objects[id] = castDraft(transformObject(obj, map, mapAnchor, m, mirror));
    }
  })[0];
}

function transformObject(
  obj: DrawObject,
  map: (p: Point) => Point,
  mapAnchor: (a: Anchor) => Anchor,
  m: Affine,
  mirror: boolean,
): DrawObject {
  switch (obj.type) {
    case 'arrow':
      return { ...obj, from: map(obj.from), to: map(obj.to) };
    case 'curved-arrow':
      return {
        ...obj,
        from: mapAnchor(obj.from),
        to: mapAnchor(obj.to),
        bend: mirror ? -obj.bend : obj.bend,
      };
    case 'plus':
    case 'text':
      return { ...obj, at: map(obj.at) };
    case 'callout':
      return { ...obj, at: map(obj.at), anchor: mapAnchor(obj.anchor) };
    case 'caption':
      return obj; // positioned under its target atoms
    case 'bracket':
    case 'shape':
      return { ...obj, rect: transformRect(m, obj.rect) };
    default:
      return assertNever(obj);
  }
}

/** Geometric bounds (BLU) of the selection, or of the whole doc; `null` if nothing has extent. */
export function bounds(doc: Doc, sel?: Selection): Rect | null {
  const { atoms, objects } = sel
    ? expand(doc, sel)
    : {
        atoms: new Set(Object.keys(doc.atoms) as AtomId[]),
        objects: new Set(Object.keys(doc.objects) as ObjectId[]),
      };
  const points: Point[] = [];
  const rects: Rect[] = [];
  for (const id of atoms) {
    const atom = doc.atoms[id];
    if (atom) points.push({ x: atom.x, y: atom.y });
  }
  for (const id of objects) {
    const obj = doc.objects[id];
    if (!obj) continue;
    switch (obj.type) {
      case 'arrow':
        points.push(obj.from, obj.to);
        break;
      case 'plus':
      case 'text':
      case 'callout':
        points.push(obj.at);
        break;
      case 'caption':
        for (const a of obj.target) {
          const atom = doc.atoms[a];
          if (atom) points.push({ x: atom.x, y: atom.y });
        }
        break;
      case 'bracket':
      case 'shape':
        rects.push(obj.rect);
        break;
      case 'curved-arrow':
        break; // endpoints added below with all anchors
      default:
        assertNever(obj);
    }
    for (const [, anchor] of anchorsOf(obj)) points.push(resolveAnchor(doc, anchor));
  }
  return boundingRect(points, rects);
}

/** Selection plus implied items: endpoints of selected bonds, texts attached to selected arrows. */
function expand(doc: Doc, sel: Selection): { atoms: Set<AtomId>; objects: Set<ObjectId> } {
  for (const id of sel.atoms) if (!(id in doc.atoms)) throw new DocError('unknown-atom', id);
  for (const id of sel.objects) {
    if (!(id in doc.objects)) throw new DocError('unknown-object', id);
  }
  const atoms = new Set<AtomId>(sel.atoms);
  for (const id of sel.bonds) {
    const bond = doc.bonds[id];
    if (!bond) throw new DocError('unknown-bond', id);
    atoms.add(bond.a1);
    atoms.add(bond.a2);
  }
  const objects = new Set<ObjectId>(sel.objects);
  for (const obj of Object.values(doc.objects)) {
    if (obj.type === 'text' && obj.attachedTo && sel.objects.has(obj.attachedTo.arrow)) {
      objects.add(obj.id);
    }
  }
  return { atoms, objects };
}
