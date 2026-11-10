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
import type { Perception } from '@core/chem-core';
import type { Scene } from '@core/svg-render';
import type { GestureState, Hit, Preview, ToolId } from '../state/editor-state';
import { curveControl } from './hit-test';
import { FRAME_GROW, frameRect, screenRect, selectionInk } from './frame';
import { growRect, type Point, type Rect } from './geometry';
import { selectionHandles } from './handles';
import { isEmptySelection } from './selection';
import { warningGroups } from './warnings';
import { bluToScreen, PX_PER_PT, ptToScreen, type Viewport } from './viewport';

export { FRAME_GROW, selectionInk };

/** Hover: a skeleton vertex gets a circle of diameter 18. */
export const HOVER_CIRCLE_R = 9;
/** Hover: width of the band along a bond or an arrow. */
export const HOVER_BAND = 8;
/** Hover: px an `extents` box is grown by. */
export const HOVER_GROW = 3;
/** Hover of a labelled atom: px its label's `extents` box is grown by (R27). */
export const HOVER_LABEL_GROW = 2;
/** Hover: corner radius of a box. */
export const HOVER_RADIUS = 4;
/** Selection: circle radius on an atom, width of a bond or arrow band, `extents` growth. */
export const SELECT_CIRCLE_R = 12;
export const SELECT_BAND = 12;
export const SELECT_ATOM_GROW = 3;
export const SELECT_OBJECT_GROW = 4;

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
  | { readonly kind: 'line'; readonly from: Point; readonly to: Point }
  /** A square turned 45 degrees, `size` px along each side. */
  | { readonly kind: 'diamond'; readonly c: Point; readonly size: number }
  /** A tooltip-style badge: a rounded `rect` with `text` centred in it (the chain's carbons). */
  | { readonly kind: 'badge'; readonly rect: Rect; readonly text: string };

/** Shapes drawn together at one group opacity. */
export interface OverlayGroup {
  readonly kind:
    | 'selection'
    | 'frame'
    | 'hover'
    | 'hover-label'
    | 'merge'
    | 'marquee'
    | 'guide'
    | 'handle'
    | 'count'
    | 'warning'
    | 'warning-bond';
  readonly shapes: readonly OverlayShape[];
}

/** The count badge: px from the pointer to its corner, text height with padding, side padding. */
export const COUNT_BADGE_OFFSET = 14;
export const COUNT_BADGE_H = 20;
const COUNT_BADGE_PAD_X = 6;
const COUNT_BADGE_DIGIT_W = 7;
export const COUNT_BADGE_RADIUS = 4;

/**
 * R31: the chain count badge for a pointer at `pointer` (canvas px). Its top left is 14 px right
 * of and below the pointer; it flips to the left of / above the pointer where it would cross the
 * canvas edge, and never leaves the canvas.
 */
export function countBadge(
  pointer: Point,
  text: string,
  size: { readonly w: number; readonly h: number },
): Extract<OverlayShape, { kind: 'badge' }> {
  const w = 2 * COUNT_BADGE_PAD_X + COUNT_BADGE_DIGIT_W * text.length;
  const h = COUNT_BADGE_H;
  let x = pointer.x + COUNT_BADGE_OFFSET;
  if (x + w > size.w) x = pointer.x - COUNT_BADGE_OFFSET - w;
  let y = pointer.y + COUNT_BADGE_OFFSET;
  if (y + h > size.h) y = pointer.y - COUNT_BADGE_OFFSET - h;
  x = Math.max(0, Math.min(x, size.w - w));
  y = Math.max(0, Math.min(y, size.h - h));
  return { kind: 'badge', rect: { x, y, w, h }, text };
}

/** An `extents` box (pt) in screen px, grown by `grow` px. */
function boxShape(v: Viewport, ink: Rect, grow = HOVER_GROW): OverlayShape {
  return { kind: 'box', rect: growRect(screenRect(v, ink), grow), radius: HOVER_RADIUS };
}

/** True when the atom's rendered part is text (O, OH, Cl, an abbreviation): it has `extents`. */
export function atomDrawsLabel(scene: Scene, id: AtomId): boolean {
  return scene.extents[`atom:${id}`] !== undefined;
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
        : boxShape(v, ink, HOVER_LABEL_GROW);
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
  if (shape === null) return [];
  // A label keeps its letters legible under a lighter box (R27).
  const label = hover.kind === 'atom' && shape.kind === 'box';
  return [{ kind: label ? 'hover-label' : 'hover', shapes: [shape] }];
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
    case 'diamond':
      return { ...shape, c: shiftPoint(shape.c, by) };
    case 'badge':
      return { ...shape, rect: { ...shape.rect, x: shape.rect.x + by.x, y: shape.rect.y + by.y } };
  }
}

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
    groups.push({
      kind: 'frame',
      shapes: [{ kind: 'box', rect: frameRect(v, ink, offset), radius: 0 }],
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
  /** Its warnings are drawn (E24); none when absent. */
  readonly perception?: Perception;
  /** The active tool; with Select a hovered item that is already selected is not highlighted (HV5). */
  readonly tool?: ToolId;
}

/** True when `hit` is an atom, bond or object of `sel`. */
function isSelectedHit(hit: Hit, sel: Selection): boolean {
  if (hit.kind === 'atom') return sel.atoms.has(hit.id);
  if (hit.kind === 'bond') return sel.bonds.has(hit.id);
  if (hit.kind === 'object') return sel.objects.has(hit.id);
  return false;
}

/**
 * All overlay groups, back to front: selection, frame, hover, merge target, marquee, guides, and
 * the handles of the selection on top.
 */
export function canvasOverlay(view: OverlayView): OverlayGroup[] {
  const { doc, scene, viewport: v, preview, gesture } = view;
  const k = v.zoom * PX_PER_PT;
  const offset =
    preview?.translate === undefined
      ? undefined
      : { x: preview.translate.dx * k, y: preview.translate.dy * k };
  const groups = selectionGroups(view.selection, doc, scene, v, offset);
  const hover =
    view.tool === 'select' && view.hover !== null && isSelectedHit(view.hover, view.selection)
      ? null
      : view.hover;
  groups.push(...overlayGroups(hover, doc, scene, v));
  // A curly arrow's start and end anchors are lit like a hover.
  for (const anchor of gesture?.overlay?.anchors ?? []) {
    groups.push(...overlayGroups(anchor, doc, scene, v));
  }
  if (preview?.mergeTarget !== undefined) {
    const shape = hoverShape({ kind: 'atom', id: preview.mergeTarget }, doc, scene, v);
    if (shape !== null) groups.push({ kind: 'merge', shapes: [shape] });
  }
  if (view.perception !== undefined) {
    groups.push(...warningGroups(doc, view.perception, scene, v));
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
  const count = gesture?.overlay?.count;
  if (count !== undefined) {
    groups.push({ kind: 'count', shapes: [countBadge(count.at, String(count.n), v.size)] });
  }
  const handles = selectionHandles(doc, scene, v, view.selection, offset);
  if (handles.length > 0) {
    groups.push({ kind: 'handle', shapes: handles.flatMap((h) => h.shapes) });
  }
  return groups;
}
