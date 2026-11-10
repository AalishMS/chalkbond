// `render`: lays out a whole document (or a subset of it) into keyed, paint-ordered SVG parts with
// ink extents (SPEC-svg-render.md "Rendering rules", "Subsets", "Extents").
//
// Layout is computed on the whole document and filtered afterwards: implicit H, label sides,
// double-bond sides and clip boxes see the full neighbourhood, so a part of a subset render is
// byte-identical to the same-key part of the full render.
//
// Paint order: beneath objects, ring circles, bonds, atoms, above objects. Later tasks plug in
// here: satellites join an atom's part; `drawObject` gains the real object rules (S9, S10).
import { perceive } from '../chem-core';
import {
  paintLayers,
  type AtomId,
  type BondId,
  type Doc,
  type DrawObject,
  type ObjectId,
  type Point,
  type Rect,
} from '../doc-model';
import { bondClipBox, buildAtomLabel, isLabelled, type AtomLabel } from './atom-label';
import { layoutBond } from './bonds';
import { circledRings, ringCircle } from './circles';
import { rectUnion, unionAll } from './geom';
import { exhaustive, sortedIds } from './order';
import { ringCentroid, ringsByBond } from './rings';
import { layoutSatellites } from './satellites';
import { bluToPt, resolveStyle } from './style';
import type { UnmeasuredGlyphNotice } from './text-measure';
import type { ItemKey, RenderNotice, RenderOptions, RenderPart, Scene } from './types';

interface Item {
  readonly key: ItemKey;
  readonly svg: string;
  readonly ink: Rect;
}

interface Neighbour {
  readonly bond: BondId;
  readonly other: AtomId;
}

const finite = (p: Point): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);

/**
 * The rule for one object, or the reason it is skipped. Exhaustive over `DrawObject`; the cases
 * that have no rule yet are skipped with a notice (removed as S9 and S10 land).
 */
function drawObject(obj: DrawObject): Item | string {
  switch (obj.type) {
    case 'arrow':
    case 'curved-arrow':
    case 'plus':
    case 'text':
    case 'caption':
    case 'callout':
    case 'bracket':
    case 'shape':
      return `${obj.type} is not rendered yet`;
    default:
      exhaustive(obj);
      return 'unknown object type';
  }
}

/** Merges the labels' unmeasured-glyph notices into one (deduplicated, sorted by code point). */
function mergeGlyphNotices(all: readonly UnmeasuredGlyphNotice[]): RenderNotice[] {
  const codes = new Set<number>();
  for (const n of all) for (const ch of n.chars) codes.add(ch.codePointAt(0) ?? 0);
  if (codes.size === 0) return [];
  const chars = [...codes]
    .sort((a, b) => a - b)
    .map((cp) => String.fromCodePoint(cp))
    .join('');
  return [{ code: 'unmeasured-glyph', chars }];
}

export function render(doc: Doc, opts: RenderOptions = {}): Scene {
  const style = resolveStyle(doc.style);
  const sel = opts.only;
  const atomIds = sortedIds(doc.atoms);
  const bondIds = sortedIds(doc.bonds);

  // The subset: selected atoms, plus the atoms of selected bonds. `null` draws everything.
  let closure: Set<AtomId> | null = null;
  if (sel) {
    closure = new Set();
    for (const id of sel.atoms) if (id in doc.atoms) closure.add(id);
    for (const id of sel.bonds) {
      const bond = doc.bonds[id];
      if (!bond) continue;
      for (const a of [bond.a1, bond.a2]) if (a in doc.atoms) closure.add(a);
    }
  }
  const atomInScope = (id: AtomId): boolean => closure === null || closure.has(id);

  // Positions (pt) and adjacency over the whole document.
  const pos = new Map<AtomId, Point>();
  for (const id of atomIds) {
    const atom = doc.atoms[id];
    if (!atom) continue;
    const p = bluToPt({ x: atom.x, y: atom.y }, style);
    if (finite(p)) pos.set(id, p);
  }
  const adjacency = new Map<AtomId, Neighbour[]>();
  for (const id of bondIds) {
    const bond = doc.bonds[id];
    if (!bond || bond.a1 === bond.a2 || !(bond.a1 in doc.atoms) || !(bond.a2 in doc.atoms)) {
      continue;
    }
    for (const [from, to] of [
      [bond.a1, bond.a2],
      [bond.a2, bond.a1],
    ] as const) {
      const list = adjacency.get(from);
      if (list) list.push({ bond: id, other: to });
      else adjacency.set(from, [{ bond: id, other: to }]);
    }
  }
  const vectorsFrom = (id: AtomId, except?: BondId): Point[] => {
    const here = pos.get(id);
    if (!here) return [];
    const out: Point[] = [];
    for (const n of adjacency.get(id) ?? []) {
      const there = pos.get(n.other);
      if (n.bond !== except && there) out.push({ x: there.x - here.x, y: there.y - here.y });
    }
    return out;
  };

  const perception = atomIds.length > 0 ? (opts.perception ?? perceive(doc)) : null;

  // Labels of the atoms in scope (layout sees every neighbour, drawn or not).
  const labels = new Map<AtomId, AtomLabel>();
  const glyphNotices: UnmeasuredGlyphNotice[] = [];
  for (const id of atomIds) {
    const atom = doc.atoms[id];
    const position = pos.get(id);
    if (!atom || !position || !atomInScope(id)) continue;
    if (!isLabelled(atom, adjacency.get(id)?.length ?? 0)) continue;
    const label = buildAtomLabel(
      {
        atom,
        implicitH: perception?.atoms[id]?.implicitH ?? 0,
        neighbors: vectorsFrom(id),
        position,
      },
      style,
    );
    labels.set(id, label);
    glyphNotices.push(...label.notices);
  }

  // Rings, found once.
  const smallestRing = ringsByBond(doc);
  const circled = circledRings(doc);
  const circledBonds = new Set<BondId>();
  for (const ring of circled) for (const b of ring.bonds) circledBonds.add(b);

  const notices: RenderNotice[] = [];
  const skip = (key: ItemKey, reason: string): void => {
    notices.push({ code: 'skipped-item', key, reason });
  };
  const items: Item[] = [];
  const objectItems = (ids: readonly ObjectId[]): void => {
    for (const id of ids) {
      const obj = doc.objects[id];
      if (!obj || (sel && !sel.objects.has(id))) continue;
      const out = drawObject(obj);
      if (typeof out === 'string') skip(`obj:${id}`, out);
      else items.push(out);
    }
  };

  const layers = paintLayers(doc);
  objectItems(layers.beneath);

  for (const ring of circled) {
    if (closure && !ring.atoms.every((a) => closure.has(a))) continue;
    const circle = ringCircle(doc, ring, style);
    if (circle) items.push({ key: circle.key, svg: circle.svg, ink: circle.ink });
    else skip(`ring:${ring.atoms.join(',')}`, 'non-finite coordinate');
  }

  for (const id of bondIds) {
    const bond = doc.bonds[id];
    if (!bond) continue;
    const key: ItemKey = `bond:${id}`;
    if (!(bond.a1 in doc.atoms) || !(bond.a2 in doc.atoms)) {
      if (!closure) skip(key, 'bond references a missing atom');
      continue;
    }
    if (closure && !(closure.has(bond.a1) && closure.has(bond.a2))) continue;
    const p1 = pos.get(bond.a1);
    const p2 = pos.get(bond.a2);
    if (!p1 || !p2) {
      skip(key, 'bond has an atom with a non-finite coordinate');
      continue;
    }
    const clipAt = (atom: AtomId, from: Point, to: Point) => {
      const label = labels.get(atom);
      return label ? bondClipBox(label, { x: to.x - from.x, y: to.y - from.y }, style) : null;
    };
    const ring = smallestRing.get(id);
    const centroid = ring ? bluToPt(ringCentroid(doc, ring), style) : null;
    const layout = layoutBond(
      {
        bond,
        a: { pos: p1, clip: clipAt(bond.a1, p1, p2), others: vectorsFrom(bond.a1, id) },
        b: { pos: p2, clip: clipAt(bond.a2, p2, p1), others: vectorsFrom(bond.a2, id) },
        ringCentroid: centroid && finite(centroid) ? centroid : null,
        circled: bond.order === 1.5 && circledBonds.has(id),
      },
      style,
    );
    if (layout) items.push({ key, svg: layout.svg, ink: layout.ink });
    else skip(key, 'bond has no visible length');
  }

  for (const id of atomIds) {
    if (!atomInScope(id)) continue;
    if (!pos.has(id)) {
      skip(`atom:${id}`, 'non-finite coordinate');
      continue;
    }
    const label = labels.get(id);
    const atom = doc.atoms[id];
    const sats = atom
      ? layoutSatellites(
          {
            atom,
            position: pos.get(id) as Point,
            directions: vectorsFrom(id),
            labelBox: label ? label.textBox : null,
          },
          style,
        )
      : null;
    if (sats) glyphNotices.push(...sats.notices);
    if (label || sats) {
      items.push({
        key: `atom:${id}`,
        svg: [label?.svg, sats?.svg]
          .filter((x): x is string => x !== undefined && x !== '')
          .join('\n'),
        ink:
          label && sats
            ? rectUnion(label.textBox, sats.ink)
            : ((label?.textBox ?? sats?.ink) as Rect),
      });
    }
  }

  objectItems(layers.above);

  const parts: RenderPart[] = items.map(({ key, svg }) => ({ key, svg }));
  const extents: Partial<Record<ItemKey, Rect>> = {};
  for (const item of items) extents[item.key] = item.ink;
  return {
    parts,
    bounds: unionAll(items.map((i) => i.ink)),
    extents: extents as Readonly<Record<ItemKey, Rect>>,
    style,
    notices: [...mergeGlyphNotices(glyphNotices), ...notices],
  };
}
