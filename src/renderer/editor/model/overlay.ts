// Overlay shapes (SPEC-editor.md "Canvas appearance", "Rendering" step 5): pure data in screen
// px, drawn by `view/Overlay.tsx`. Hover, selection with its frame, marquee, snapping guides and
// the merge target exist so far; ghosts and warnings arrive with their tasks.
import {
  resolveAnchor,
  type AtomId,
  type Doc,
  type ObjectId,
  type Selection,
} from '@core/doc-model';
import type { ItemKey, Scene } from '@core/svg-render';
import type { GestureState, Hit, Preview } from '../state/editor-state';
import { curveControl } from './hit-test';
import { growRect, rectUnion, type Point, type Rect } from './geometry';
import { expandSelection, isEmptySelection } from './selection';
import { bluToScreen, PX_PER_PT, ptToScreen, type Viewport } from './viewport';

/** Hover: a skeleton vertex gets a circle of diameter 18. */
export const HOVER_CIRCLE_R = 9;
/** Hover: width of the band along a bond or an arrow. */
export const HOVER_BAND = 8;
/** Hover: px an `extents` box is grown by. */
export const HOVER_GROW = 3;
/** Hover: corner radius of a box. */
export const HOVER_RADIUS = 4;
/** Selection: circle radius on an atom, width of a bond or arrow band, `extents` growth. */
export const SELECT_CIRCLE_R = 12;
export const SELECT_BAND = 12;
export const SELECT_ATOM_GROW = 3;
export const SELECT_OBJECT_GROW = 4;
/** Selection frame: px the ink box is grown by. */
export const FRAME_GROW = 8;

export type OverlayShape =
  | { readonly kind: 'circle'; readonly c: Point; readonly r: number }
  /** A round-capped stroke from `from` to `to`, straight or bent through `control`. */
  | {
      readonly kind: 'band';
      readonly from: Point;
      readonly to: Point;
      readonly control?: Point;
      readonly width: number;
    }
  | { readonly kind: 'box'; readonly rect: Rect; readonly radius: number }
  | { readonly kind: 'line'; readonly from: Point; readonly to: Point };

/** Shapes drawn together at one group opacity. */
export interface OverlayGroup {
  readonly kind: 'selection' | 'frame' | 'hover' | 'merge' | 'marquee' | 'guide';
  readonly shapes: readonly OverlayShape[];
}

/** A rectangle (pt) in screen px. */
function screenRect(v: Viewport, ink: Rect): Rect {
  const a = ptToScreen(v, { x: ink.x, y: ink.y });
  const b = ptToScreen(v, { x: ink.x + ink.w, y: ink.y + ink.h });
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

/** An `extents` box (pt) in screen px, grown by `grow` px. */
function boxShape(v: Viewport, ink: Rect, grow = HOVER_GROW): OverlayShape {
  return { kind: 'box', rect: growRect(screenRect(v, ink), grow), radius: HOVER_RADIUS };
}

/** The shape that highlights `hit`, or null when the item is gone or has none. */
function hoverShape(hit: Hit, doc: Doc, scene: Scene, v: Viewport): OverlayShape | null {
  const bl = scene.style.bondLength;
  switch (hit.kind) {
    case 'atom': {
      const atom = doc.atoms[hit.id];
      if (!atom) return null;
      const ink = scene.extents[`atom:${hit.id}`];
      return ink === undefined
        ? { kind: 'circle', c: bluToScreen(v, atom, bl), r: HOVER_CIRCLE_R }
        : boxShape(v, ink);
    }
    case 'bond': {
      const bond = doc.bonds[hit.id];
      const a1 = bond && doc.atoms[bond.a1];
      const a2 = bond && doc.atoms[bond.a2];
      if (!a1 || !a2) return null;
      return {
        kind: 'band',
        from: bluToScreen(v, a1, bl),
        to: bluToScreen(v, a2, bl),
        width: HOVER_BAND,
      };
    }
    case 'object': {
      const obj = doc.objects[hit.id];
      if (!obj) return null;
      if (obj.type === 'arrow') {
        return {
          kind: 'band',
          from: bluToScreen(v, obj.from, bl),
          to: bluToScreen(v, obj.to, bl),
          width: HOVER_BAND,
        };
      }
      if (obj.type === 'curved-arrow') {
        const from = bluToScreen(v, resolveAnchor(doc, obj.from), bl);
        const to = bluToScreen(v, resolveAnchor(doc, obj.to), bl);
        return {
          kind: 'band',
          from,
          to,
          control: curveControl(from, to, obj.bend),
          width: HOVER_BAND,
        };
      }
      const ink = scene.extents[`obj:${hit.id}`];
      return ink === undefined ? null : boxShape(v, ink);
    }
    default:
      return null;
  }
}

/** The hover highlight group. */
export function overlayGroups(
  hover: Hit | null,
  doc: Doc,
  scene: Scene,
  viewport: Viewport,
): OverlayGroup[] {
  if (hover === null) return [];
  const shape = hoverShape(hover, doc, scene, viewport);
  return shape === null ? [] : [{ kind: 'hover', shapes: [shape] }];
}

const shiftPoint = (p: Point, by: Point): Point => ({ x: p.x + by.x, y: p.y + by.y });

/** The same shape moved by `by` screen px. */
function shifted(shape: OverlayShape, by: Point): OverlayShape {
  switch (shape.kind) {
    case 'circle':
      return { ...shape, c: shiftPoint(shape.c, by) };
    case 'band':
      return {
        ...shape,
        from: shiftPoint(shape.from, by),
        to: shiftPoint(shape.to, by),
        ...(shape.control === undefined ? {} : { control: shiftPoint(shape.control, by) }),
      };
    case 'box':
      return { ...shape, rect: { ...shape.rect, x: shape.rect.x + by.x, y: shape.rect.y + by.y } };
    case 'line':
      return { ...shape, from: shiftPoint(shape.from, by), to: shiftPoint(shape.to, by) };
  }
}

/**
 * The ink box (pt) of a selection: the union of its items' `extents` and its vertex points,
 * including the atoms of selected bonds; null when it has none.
 */
export function selectionInk(doc: Doc, scene: Scene, sel: Selection): Rect | null {
  const bl = scene.style.bondLength;
  const { atoms, objects } = expandSelection(doc, sel);
  let ink: Rect | null = null;
  const add = (r: Rect | undefined): void => {
    if (r !== undefined) ink = ink === null ? r : rectUnion(ink, r);
  };
  for (const id of atoms) {
    const atom = doc.atoms[id];
    if (atom) add({ x: atom.x * bl, y: atom.y * bl, w: 0, h: 0 });
    add(scene.extents[`atom:${id}`]);
  }
  for (const id of sel.bonds) add(scene.extents[`bond:${id}`]);
  for (const id of objects) add(scene.extents[`obj:${id}` as ItemKey]);
  return ink;
}

/** A crisp 1 px line sits on a half pixel. */
const crisp = (x: number): number => Math.round(x - 0.5) + 0.5;

/** The band that selects an arrow or a curved arrow, a box for any other object. */
function objectSelectShape(id: ObjectId, doc: Doc, scene: Scene, v: Viewport): OverlayShape | null {
  const obj = doc.objects[id];
  if (!obj) return null;
  if (obj.type === 'arrow' || obj.type === 'curved-arrow') {
    const shape = hoverShape({ kind: 'object', id, type: obj.type }, doc, scene, v);
    return shape?.kind === 'band' ? { ...shape, width: SELECT_BAND } : null;
  }
  const ink = scene.extents[`obj:${id}`];
  return ink === undefined ? null : boxShape(v, ink, SELECT_OBJECT_GROW);
}

/**
 * The selection (screen 03): a 12 px band along each selected bond, a circle of r 12 on each
 * selected skeleton vertex no selected bond covers, the `extents` box of a selected label, and
 * the dashed frame around the whole selection's ink box grown 8 px. `offset` (screen px) shifts
 * everything: the drag fast path moves the selection without re-rendering.
 */
export function selectionGroups(
  sel: Selection,
  doc: Doc,
  scene: Scene,
  v: Viewport,
  offset: Point = { x: 0, y: 0 },
): OverlayGroup[] {
  if (isEmptySelection(sel)) return [];
  const bl = scene.style.bondLength;
  const shapes: OverlayShape[] = [];
  const covered = new Set<AtomId>();
  for (const id of sel.bonds) {
    const bond = doc.bonds[id];
    const a1 = bond && doc.atoms[bond.a1];
    const a2 = bond && doc.atoms[bond.a2];
    if (!bond || !a1 || !a2) continue;
    covered.add(bond.a1);
    covered.add(bond.a2);
    shapes.push({
      kind: 'band',
      from: bluToScreen(v, a1, bl),
      to: bluToScreen(v, a2, bl),
      width: SELECT_BAND,
    });
  }
  for (const id of sel.atoms) {
    const atom = doc.atoms[id];
    if (!atom) continue;
    const ink = scene.extents[`atom:${id}`];
    if (ink !== undefined) shapes.push(boxShape(v, ink, SELECT_ATOM_GROW));
    else if (!covered.has(id)) {
      shapes.push({ kind: 'circle', c: bluToScreen(v, atom, bl), r: SELECT_CIRCLE_R });
    }
  }
  for (const id of sel.objects) {
    const shape = objectSelectShape(id, doc, scene, v);
    if (shape !== null) shapes.push(shape);
  }
  const groups: OverlayGroup[] = [
    { kind: 'selection', shapes: shapes.map((s) => shifted(s, offset)) },
  ];
  const ink = selectionInk(doc, scene, sel);
  if (ink !== null) {
    const r = growRect(screenRect(v, ink), FRAME_GROW);
    const x0 = crisp(r.x + offset.x);
    const y0 = crisp(r.y + offset.y);
    const x1 = crisp(r.x + r.w + offset.x);
    const y1 = crisp(r.y + r.h + offset.y);
    groups.push({
      kind: 'frame',
      shapes: [{ kind: 'box', rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, radius: 0 }],
    });
  }
  return groups;
}

/** Everything the overlay is drawn from. `doc` and `scene` are what the canvas shows. */
export interface OverlayView {
  readonly hover: Hit | null;
  readonly selection: Selection;
  readonly gesture: GestureState | null;
  readonly preview: Preview | null;
  readonly doc: Doc;
  readonly scene: Scene;
  readonly viewport: Viewport;
}

/** All overlay groups, back to front: selection, frame, hover, merge target, marquee, guides. */
export function canvasOverlay(view: OverlayView): OverlayGroup[] {
  const { doc, scene, viewport: v, preview, gesture } = view;
  const k = v.zoom * PX_PER_PT;
  const offset =
    preview?.translate === undefined
      ? undefined
      : { x: preview.translate.dx * k, y: preview.translate.dy * k };
  const groups = selectionGroups(view.selection, doc, scene, v, offset);
  groups.push(...overlayGroups(view.hover, doc, scene, v));
  if (preview?.mergeTarget !== undefined) {
    const shape = hoverShape({ kind: 'atom', id: preview.mergeTarget }, doc, scene, v);
    if (shape !== null) groups.push({ kind: 'merge', shapes: [shape] });
  }
  const marquee = gesture?.overlay?.marquee;
  if (marquee !== undefined) {
    const a = bluToScreen(v, marquee.from, scene.style.bondLength);
    const b = bluToScreen(v, marquee.to, scene.style.bondLength);
    const rect = {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
    };
    groups.push({ kind: 'marquee', shapes: [{ kind: 'box', rect, radius: 0 }] });
  }
  const guides = gesture?.overlay?.guides;
  if (guides !== undefined && guides.length > 0) {
    groups.push({
      kind: 'guide',
      shapes: guides.map((g): OverlayShape => {
        if (g.axis === 'x') {
          const x = ptToScreen(v, { x: g.pt, y: 0 }).x;
          return { kind: 'line', from: { x, y: 0 }, to: { x, y: v.size.h } };
        }
        const y = ptToScreen(v, { x: 0, y: g.pt }).y;
        return { kind: 'line', from: { x: 0, y }, to: { x: v.size.w, y } };
      }),
    });
  }
  return groups;
}
