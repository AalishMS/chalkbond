// Test helper: the oracle of SPEC-svg-render.md Decision 16 (item 4 of "The layout"). The
// structural render of `doc` must equal, part for part, the skeletal render of `structuralOracle(doc)`:
// - every coordinate is doubled (atom `x`, `y`; arrow `from`, `to`; plus, text and callout `at`;
//   bracket and shape `rect`; point anchors `p`); `bend` and a bond anchor's `t` are ratios;
// - S2 (answered B): an atom anchor's `offset` stays as stored, and so does the offset of a
//   condition text from its arrow: its `at` becomes `2 * (m + (at - m) / 2)`, `m` the arrow's
//   midpoint, which is what the renderer draws once its factor is applied (`/ 2` and `* 2` are
//   exact in binary floating point);
// - every written carbon (a carbon outside a ring without `label`, `isotope` or `explicitH`) is
//   given `explicitH` = its perceived `implicitH`, so today's rules write it; so is every other
//   atom the structural render labels (seed 3343550): a fixed H count enters chem-core's Kekulé
//   matching (C2), so pinning only the carbons could change a neighbouring heteroatom's H, which
//   Decision 15 (b) keeps as skeletal mode draws it; plain ring carbons stay unpinned (unlabelled);
// - `style.formula` is removed.
import { perceive } from '../../chem-core';
import type { Anchor, Atom, AtomId, Doc, DrawObject, Point, Rect } from '../../doc-model';
import { ringAtoms } from '../ring-atoms';

const double = (p: Point): Point => ({ x: 2 * p.x, y: 2 * p.y });
const doubleRect = (r: Rect): Rect => ({ x: 2 * r.x, y: 2 * r.y, w: 2 * r.w, h: 2 * r.h });
const doubleAnchor = (a: Anchor): Anchor => (a.kind === 'point' ? { ...a, p: double(a.p) } : a);

/** The skeletal document that draws exactly what the structural document `doc` draws. */
export function structuralOracle(doc: Doc): Doc {
  const ring = ringAtoms(doc);
  const perception = perceive(doc);
  const atoms: Record<string, Atom> = {};
  for (const [id, atom] of Object.entries(doc.atoms)) {
    const skeleton =
      atom.element === 'C' &&
      (atom.label === undefined || atom.label === '') &&
      atom.isotope === undefined &&
      ring.has(id as AtomId);
    const pinned = atom.explicitH === undefined && !skeleton;
    const at = { ...atom, x: 2 * atom.x, y: 2 * atom.y };
    atoms[id] = pinned ? { ...at, explicitH: perception.atoms[id as AtomId]?.implicitH ?? 0 } : at;
  }

  const textAt = (o: Extract<DrawObject, { type: 'text' }>): Point => {
    const target = o.attachedTo ? doc.objects[o.attachedTo.arrow] : undefined;
    if (target?.type !== 'arrow') return double(o.at);
    const m = { x: (target.from.x + target.to.x) / 2, y: (target.from.y + target.to.y) / 2 };
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) return double(o.at);
    return { x: 2 * (m.x + (o.at.x - m.x) / 2), y: 2 * (m.y + (o.at.y - m.y) / 2) };
  };
  const objects: Record<string, DrawObject> = {};
  for (const [id, o] of Object.entries(doc.objects)) {
    switch (o.type) {
      case 'arrow':
        objects[id] = { ...o, from: double(o.from), to: double(o.to) };
        break;
      case 'curved-arrow':
        objects[id] = { ...o, from: doubleAnchor(o.from), to: doubleAnchor(o.to) };
        break;
      case 'plus':
        objects[id] = { ...o, at: double(o.at) };
        break;
      case 'text':
        objects[id] = { ...o, at: textAt(o) };
        break;
      case 'callout':
        objects[id] = { ...o, at: double(o.at), anchor: doubleAnchor(o.anchor) };
        break;
      case 'bracket':
      case 'shape':
        objects[id] = { ...o, rect: doubleRect(o.rect) };
        break;
      case 'caption':
        objects[id] = o;
        break;
    }
  }

  const style = { ...doc.style };
  delete style.formula;
  return { ...doc, atoms, objects, style } as Doc;
}
