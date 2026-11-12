// The handle gestures of the Select tool (SPEC-editor.md S5, S6): turning the selection about its
// frame centre, moving one end of an arrow, re-anchoring one end of a curved arrow, bending it.
// Each previews the changed document every frame and commits once on release.
import {
  rotation,
  transformItems,
  updateObject,
  type Anchor,
  type Doc,
  type ObjectId,
  type ObjectPatch,
  type Selection,
} from '@core/doc-model';
import { placeConditions } from '../model/conditions';
import type { CanvasEvent } from '../model/canvas-event';
import { selectionCentre } from '../model/frame';
import { distance, snapAngle, type Point } from '../model/geometry';
import type { HandleHit } from '../model/handles';
import { hitTest, hoverFilter } from '../model/hit-test';
import { anchorBlu } from '../model/structural-offsets';
import type { Scene } from '@core/svg-render';
import type { GestureState } from '../state/editor-state';
import type { ToolContext, ToolStep } from './tool';

type PointerEv = Extract<CanvasEvent, { type: 'down' | 'move' | 'up' }>;

/** S5: the rotation snaps to this many degrees; Shift turns freely. */
export const ROTATE_STEP = 15;
/** S6: the angle of an arrow snaps to this many degrees; Shift leaves it free. */
export const ARROW_STEP = 15;

/** Turning the selection; `angle` is radians, clockwise on screen. */
export interface Rotate extends GestureState {
  readonly kind: 'select-rotate';
  /** Frame centre, BLU. */
  readonly centre: Point;
  /** Direction from the centre to the press, radians. */
  readonly from: number;
  readonly angle: number;
}

/** Moving one end of a straight arrow. */
export interface ArrowEnd extends GestureState {
  readonly kind: 'select-arrow';
  readonly id: ObjectId;
  readonly end: 'from' | 'to';
  /** Where the end is now, BLU; null until the pointer has moved. */
  readonly point: Point | null;
}

/** Re-anchoring an end of a curved arrow, or bending it. */
export interface CurveHandle extends GestureState {
  readonly kind: 'select-curve';
  readonly id: ObjectId;
  readonly handle: 'curve-from' | 'curve-to' | 'curve-bend';
  /** The change so far; null until the pointer has moved. */
  readonly patch: ObjectPatch | null;
}

export type HandleGesture = Rotate | ArrowEnd | CurveHandle;

export function isHandleGesture(g: GestureState | null): g is HandleGesture {
  return (
    g !== null &&
    (g.kind === 'select-rotate' || g.kind === 'select-arrow' || g.kind === 'select-curve')
  );
}

/** A press on a handle: the gesture it starts, or null when the handle has nothing to act on. */
export function startHandle(hit: HandleHit, ev: PointerEv, ctx: ToolContext): HandleGesture | null {
  if (hit.handle === 'rotate') {
    const centre = selectionCentre(ctx.doc, ctx.scene, ctx.selection);
    if (centre === null) return null;
    const ppb = ctx.scene.style.ptPerBlu;
    const c = { x: centre.x / ppb, y: centre.y / ppb };
    return {
      kind: 'select-rotate',
      centre: c,
      from: Math.atan2(ev.p.y - c.y, ev.p.x - c.x),
      angle: 0,
    };
  }
  const obj = hit.id === undefined ? undefined : ctx.doc.objects[hit.id];
  if (hit.id === undefined || obj === undefined) return null;
  if (hit.handle === 'arrow-from' || hit.handle === 'arrow-to') {
    if (obj.type !== 'arrow') return null;
    return {
      kind: 'select-arrow',
      id: hit.id,
      end: hit.handle === 'arrow-from' ? 'from' : 'to',
      point: null,
    };
  }
  if (obj.type !== 'curved-arrow') return null;
  return { kind: 'select-curve', id: hit.id, handle: hit.handle, patch: null };
}

/** The turn (radians) for a pointer at `p`: snapped to 15 degrees unless `free`. */
function turn(g: Rotate, p: Point, free: boolean): number {
  let d = Math.atan2(p.y - g.centre.y, p.x - g.centre.x) - g.from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  if (free) return d;
  return (Math.round((d * 180) / Math.PI / ROTATE_STEP) * ROTATE_STEP * Math.PI) / 180 + 0;
}

/**
 * `doc` with object `id` changed by `patch`. A straight arrow's condition texts are placed again
 * by T3 (`placeConditions`) in the same change.
 */
export function adjustArrow(doc: Doc, id: ObjectId, patch: ObjectPatch): Doc {
  const next = updateObject(doc, id, patch);
  return next.objects[id]?.type === 'arrow' ? placeConditions(next, new Set([id])) : next;
}

/** The anchor for a curved-arrow end dropped at `ev`: an atom, a bond at its middle, or a point. */
function anchorAt(ev: PointerEv, ctx: ToolContext): Anchor {
  const hit = hitTest(ctx.doc, ctx.scene, ctx.viewport, ev.screen, hoverFilter('bond'));
  if (hit?.kind === 'atom') return { kind: 'atom', atom: hit.id };
  if (hit?.kind === 'bond') return { kind: 'bond', bond: hit.id, t: 0.5 };
  return { kind: 'point', p: ev.p };
}

/** S6: the bend that puts the curve's middle at the pointer (d off the chord, left normal). */
function bendFor(doc: Doc, style: Scene['style'], id: ObjectId, p: Point): number | null {
  const obj = doc.objects[id];
  if (obj?.type !== 'curved-arrow') return null;
  const from = anchorBlu(doc, obj.from, style);
  const to = anchorBlu(doc, obj.to, style);
  const chord = distance(from, to);
  if (chord === 0) return null;
  const u = { x: (to.x - from.x) / chord, y: (to.y - from.y) / chord };
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const d = (p.x - mid.x) * u.y - (p.y - mid.y) * u.x;
  return (2 * d) / chord + 0;
}

function arrowPoint(g: ArrowEnd, ev: PointerEv, ctx: ToolContext): Point | null {
  const obj = ctx.doc.objects[g.id];
  if (obj?.type !== 'arrow') return null;
  const other = g.end === 'from' ? obj.to : obj.from;
  if (distance(other, ev.p) === 0) return null;
  const p = ev.mods.shift ? ev.p : snapAngle(other, ev.p, ARROW_STEP);
  return { x: p.x + 0, y: p.y + 0 };
}

/** The change for `ev`, or null when there is none to make. */
function curvePatch(g: CurveHandle, ev: PointerEv, ctx: ToolContext): ObjectPatch | null {
  if (g.handle === 'curve-bend') {
    const bend = bendFor(ctx.doc, ctx.scene.style, g.id, ev.p);
    return bend === null ? null : { bend };
  }
  return g.handle === 'curve-from' ? { from: anchorAt(ev, ctx) } : { to: anchorAt(ev, ctx) };
}

/** The straight arrows of `sel`: their condition texts are placed again after a turn. */
function selectedArrows(doc: Doc, sel: Selection): Set<ObjectId> {
  return new Set([...sel.objects].filter((id) => doc.objects[id]?.type === 'arrow'));
}

/** Moves and releases of a handle gesture. */
export function stepHandle(g: HandleGesture, ev: PointerEv, ctx: ToolContext): ToolStep {
  const preview = (doc: Doc): { doc: Doc; added: ReadonlySet<string> } => ({
    doc,
    added: new Set<string>(),
  });
  if (g.kind === 'select-rotate') {
    const angle = turn(g, ev.p, ev.mods.shift);
    const next: Rotate = { ...g, angle };
    const apply = (doc: Doc): Doc =>
      placeConditions(
        transformItems(doc, ctx.selection, rotation(angle, g.centre)),
        selectedArrows(doc, ctx.selection),
      );
    if (ev.type === 'up') {
      if (angle === 0) return { gesture: null, preview: null };
      return { gesture: null, preview: null, commit: { label: 'Rotate', recipe: apply } };
    }
    return { gesture: next, preview: preview(apply(ctx.doc)) };
  }
  if (g.kind === 'select-arrow') {
    const point = arrowPoint(g, ev, ctx) ?? g.point;
    const patch: ObjectPatch | null = point === null ? null : { [g.end]: point };
    if (ev.type === 'up') {
      if (patch === null) return { gesture: null, preview: null };
      return {
        gesture: null,
        preview: null,
        commit: { label: 'Adjust arrow', recipe: (doc) => adjustArrow(doc, g.id, patch) },
      };
    }
    const next: ArrowEnd = { ...g, point };
    return {
      gesture: next,
      ...(patch === null ? {} : { preview: preview(adjustArrow(ctx.doc, g.id, patch)) }),
    };
  }
  const patch = curvePatch(g, ev, ctx) ?? g.patch;
  if (ev.type === 'up') {
    if (patch === null) return { gesture: null, preview: null };
    return {
      gesture: null,
      preview: null,
      commit: { label: 'Adjust arrow', recipe: (doc) => adjustArrow(doc, g.id, patch) },
    };
  }
  const next: CurveHandle = { ...g, patch };
  return {
    gesture: next,
    ...(patch === null ? {} : { preview: preview(adjustArrow(ctx.doc, g.id, patch)) }),
  };
}
