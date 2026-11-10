// Hit-testing (SPEC-editor.md "Hit-testing", rules H1-H4): pure, a linear scan, tolerances in
// screen px so they are the same at every zoom.
import {
  resolveAnchor,
  type AtomId,
  type BondId,
  type Doc,
  type DrawObject,
  type DrawObjectType,
  type ObjectId,
  type Selection,
} from '@core/doc-model';
import { resolveStyle, type Scene } from '@core/svg-render';
import type { ToolId } from '../state/editor-state';
import {
  distToQuad,
  distToSegment,
  distance,
  growRect,
  length,
  normalize,
  rectContains,
  rectInside,
  sub,
  type Point,
  type Rect,
} from './geometry';
import { sideOf } from './conditions';
import { bluToScreen, ptToScreen, screenToBlu, type Viewport } from './viewport';

/** What the pointer is over. */
export type Hit =
  | { readonly kind: 'atom'; readonly id: AtomId }
  | { readonly kind: 'bond'; readonly id: BondId }
  | { readonly kind: 'object'; readonly id: ObjectId; readonly type: DrawObjectType }
  | {
      readonly kind: 'handle';
      readonly handle:
        'rotate' | 'arrow-from' | 'arrow-to' | 'curve-from' | 'curve-to' | 'curve-bend';
      readonly id?: ObjectId;
    }
  | { readonly kind: 'slot'; readonly arrow: ObjectId; readonly slot: 'above' | 'below' };

/** H1: px around an atom's vertex. */
export const ATOM_PX = 10;
/** H1: px an atom label's `extents` box is grown by. */
export const LABEL_GROW = 4;
/** H1: px from a bond segment, a straight arrow or a curved arrow. */
export const LINE_PX = 6;
/** H1: px the `extents` of text, plus, bracket, shape and callout are grown by. */
export const BOX_GROW = 4;
/** T1: how far from an arrow's shaft (BLU) the Text tool shows its condition slot. */
export const SLOT_REACH_BLU = 1.0;

/** H3: px, or `MERGE_BLU` if larger in screen px. */
export const MERGE_PX = 12;
export const MERGE_BLU = 0.3;

/** Which kinds of item a test may return. */
export interface HitFilter {
  readonly atoms: boolean;
  readonly bonds: boolean;
  /** `text`: texts only (the Text tool). */
  readonly objects: 'all' | 'text' | 'arrows' | 'none';
}

export const HIT_ALL: HitFilter = { atoms: true, bonds: true, objects: 'all' };
const STRUCTURE: HitFilter = { atoms: true, bonds: true, objects: 'none' };
const TEXT_ONLY: HitFilter = { atoms: false, bonds: false, objects: 'text' };
/** The Arrow tool's click on an existing arrow (R1): straight arrows only. */
export const ARROWS_ONLY: HitFilter = { atoms: false, bonds: false, objects: 'arrows' };

/**
 * HV1: what each tool highlights. Select and Erase see everything; the Text tool only texts; the
 * drawing tools atoms and bonds.
 */
export function hoverFilter(tool: ToolId): HitFilter {
  switch (tool) {
    case 'select':
    case 'erase':
      return HIT_ALL;
    case 'text':
      return TEXT_ONLY;
    default:
      return STRUCTURE;
  }
}

/** H2: the object classes, highest priority first. */
const OBJECT_CLASSES: readonly (readonly DrawObjectType[])[] = [
  ['text', 'caption', 'callout'],
  ['arrow'],
  ['curved-arrow'],
  ['plus'],
  ['bracket'],
  ['shape'],
];

const idNumber = (id: string): number => Number(id.slice(1));

interface Candidate<T> {
  readonly value: T;
  readonly dist: number;
}

/** Keeps the nearer candidate; a tie goes to the lower id number. */
function keepBetter<T extends { id: string }>(
  best: Candidate<T> | null,
  value: T,
  dist: number,
): Candidate<T> {
  if (
    best === null ||
    dist < best.dist ||
    (dist === best.dist && idNumber(value.id) < idNumber(best.value.id))
  ) {
    return { value, dist };
  }
  return best;
}

/** An `extents` box (pt) in screen px. */
function screenRect(v: Viewport, r: Rect): Rect {
  const a = ptToScreen(v, { x: r.x, y: r.y });
  const b = ptToScreen(v, { x: r.x + r.w, y: r.y + r.h });
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

const centre = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** The control point of a curved arrow, as svg-render lays it out: chord midpoint + bend x chord x left normal. */
export function curveControl(from: Point, to: Point, bend: number): Point {
  const chord = sub(to, from);
  const u = normalize(chord);
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const k = bend * length(chord);
  return { x: mid.x + u.y * k, y: mid.y - u.x * k };
}

/** Screen end points of an arrow, or of a curved arrow with its control point. */
function pathOf(
  doc: Doc,
  obj: DrawObject,
  v: Viewport,
  bondLength: number,
): { from: Point; to: Point; control?: Point } | null {
  if (obj.type === 'arrow') {
    return {
      from: bluToScreen(v, obj.from, bondLength),
      to: bluToScreen(v, obj.to, bondLength),
    };
  }
  if (obj.type === 'curved-arrow') {
    const from = bluToScreen(v, resolveAnchor(doc, obj.from), bondLength);
    const to = bluToScreen(v, resolveAnchor(doc, obj.to), bondLength);
    return { from, to, control: curveControl(from, to, obj.bend) };
  }
  return null;
}

/** The distance for object `obj` when `p` is within its H1 tolerance, else null. */
function objectDistance(
  doc: Doc,
  scene: Scene,
  v: Viewport,
  p: Point,
  obj: DrawObject,
): number | null {
  const path = pathOf(doc, obj, v, scene.style.bondLength);
  if (path !== null) {
    const d =
      path.control === undefined
        ? distToSegment(p, path.from, path.to)
        : distToQuad(p, path.from, path.control, path.to);
    return d <= LINE_PX ? d : null;
  }
  const ink = scene.extents[`obj:${obj.id}`];
  if (ink === undefined) return null;
  const box = screenRect(v, ink);
  return rectContains(growRect(box, BOX_GROW), p) ? distance(p, centre(box)) : null;
}

function objectHit(doc: Doc, scene: Scene, v: Viewport, p: Point, filter: HitFilter): Hit | null {
  if (filter.objects === 'none') return null;
  const best: (Candidate<DrawObject> | null)[] = OBJECT_CLASSES.map(() => null);
  for (const obj of Object.values(doc.objects)) {
    if (filter.objects === 'text' && obj.type !== 'text') continue;
    if (filter.objects === 'arrows' && obj.type !== 'arrow') continue;
    const cls = OBJECT_CLASSES.findIndex((types) => types.includes(obj.type));
    const d = objectDistance(doc, scene, v, p, obj);
    if (d !== null) best[cls] = keepBetter(best[cls] ?? null, obj, d);
  }
  for (const found of best) {
    if (found) return { kind: 'object', id: found.value.id, type: found.value.type };
  }
  return null;
}

/**
 * T1: the condition slot of the arrow nearest to `p` within `SLOT_REACH_BLU` of its shaft and
 * between its ends, on the side `p` is on; null when there is none. The nearest arrow wins, a tie
 * goes to the lower id.
 */
export function slotHit(doc: Doc, scene: Scene, v: Viewport, p: Point): Hit | null {
  const bl = scene.style.bondLength;
  let best: Candidate<{ id: ObjectId; slot: 'above' | 'below' }> | null = null;
  for (const obj of Object.values(doc.objects)) {
    if (obj.type !== 'arrow') continue;
    const a = bluToScreen(v, obj.from, bl);
    const b = bluToScreen(v, obj.to, bl);
    const shaft = sub(b, a);
    const len2 = shaft.x * shaft.x + shaft.y * shaft.y;
    if (len2 === 0) continue;
    const t = ((p.x - a.x) * shaft.x + (p.y - a.y) * shaft.y) / len2;
    if (t < 0 || t > 1) continue;
    const d = distToSegment(p, a, b);
    const reach =
      SLOT_REACH_BLU *
      distance(bluToScreen(v, { x: 0, y: 0 }, bl), bluToScreen(v, { x: 1, y: 0 }, bl));
    if (d > reach) continue;
    best = keepBetter(best, { id: obj.id, slot: sideOf(obj, screenToBlu(v, p, bl)) }, d);
  }
  return best === null ? null : { kind: 'slot', arrow: best.value.id, slot: best.value.slot };
}

/**
 * H1 and H2: the item under screen point `p` (canvas px), or null. Atoms beat bonds beat
 * objects; within a class the nearest wins, a tie goes to the lower id. `filter` limits the
 * kinds (HV1). Handles of the selection, first in H2, arrive with E17.
 */
export function hitTest(
  doc: Doc,
  scene: Scene,
  viewport: Viewport,
  p: Point,
  filter: HitFilter = HIT_ALL,
): Hit | null {
  const bondLength = scene.style.bondLength;
  if (filter.atoms) {
    let best: Candidate<{ id: AtomId }> | null = null;
    for (const atom of Object.values(doc.atoms)) {
      const d = distance(p, bluToScreen(viewport, atom, bondLength));
      const ink = scene.extents[`atom:${atom.id}`];
      const inside =
        ink !== undefined && rectContains(growRect(screenRect(viewport, ink), LABEL_GROW), p);
      if (d <= ATOM_PX || inside) best = keepBetter(best, atom, d);
    }
    if (best) return { kind: 'atom', id: best.value.id };
  }
  if (filter.bonds) {
    let best: Candidate<{ id: BondId }> | null = null;
    for (const bond of Object.values(doc.bonds)) {
      const a1 = doc.atoms[bond.a1];
      const a2 = doc.atoms[bond.a2];
      if (!a1 || !a2) continue;
      const d = distToSegment(
        p,
        bluToScreen(viewport, a1, bondLength),
        bluToScreen(viewport, a2, bondLength),
      );
      if (d <= LINE_PX) best = keepBetter(best, bond, d);
    }
    if (best) return { kind: 'bond', id: best.value.id };
  }
  const object = objectHit(doc, scene, viewport, p, filter);
  // The Text tool also sees the condition slots of arrows (T1), after the texts.
  if (object === null && filter.objects === 'text') return slotHit(doc, scene, viewport, p);
  return object;
}

/** What the pointer over `p` would highlight with `tool` active (HV1). */
export const hoverHit = (
  tool: ToolId,
  doc: Doc,
  scene: Scene,
  viewport: Viewport,
  p: Point,
): Hit | null => hitTest(doc, scene, viewport, p, hoverFilter(tool));

/**
 * H3: the nearest atom, other than `exclude`, within 12 px or 0.3 BLU (whichever is larger in
 * screen px) of screen point `p`.
 */
export function mergeTarget(
  doc: Doc,
  viewport: Viewport,
  p: Point,
  exclude: ReadonlySet<AtomId>,
): AtomId | null {
  const bondLength = resolveStyle(doc.style).bondLength;
  const bluPx = distance(
    bluToScreen(viewport, { x: 0, y: 0 }, bondLength),
    bluToScreen(viewport, { x: MERGE_BLU, y: 0 }, bondLength),
  );
  const reach = Math.max(MERGE_PX, bluPx);
  let best: Candidate<{ id: AtomId }> | null = null;
  for (const atom of Object.values(doc.atoms)) {
    if (exclude.has(atom.id)) continue;
    const d = distance(p, bluToScreen(viewport, atom, bondLength));
    if (d <= reach) best = keepBetter(best, atom, d);
  }
  return best === null ? null : best.value.id;
}

/**
 * H4: what a marquee `rect` (BLU) selects: atoms whose position is inside, bonds whose two
 * atoms are inside, objects whose `extents` box is entirely inside.
 */
export function marqueeSelection(doc: Doc, scene: Scene, rect: Rect): Selection {
  const atoms = new Set<AtomId>();
  for (const atom of Object.values(doc.atoms)) {
    if (rectContains(rect, atom)) atoms.add(atom.id);
  }
  const bonds = new Set<BondId>();
  for (const bond of Object.values(doc.bonds)) {
    if (atoms.has(bond.a1) && atoms.has(bond.a2)) bonds.add(bond.id);
  }
  const objects = new Set<ObjectId>();
  const k = 1 / scene.style.bondLength;
  for (const obj of Object.values(doc.objects)) {
    const ink = scene.extents[`obj:${obj.id}`];
    if (ink === undefined) continue;
    const box = { x: ink.x * k, y: ink.y * k, w: ink.w * k, h: ink.h * k };
    if (rectInside(box, rect)) objects.add(obj.id);
  }
  return { atoms, bonds, objects };
}
