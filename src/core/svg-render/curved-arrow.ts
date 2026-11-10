// Curved electron-pushing arrows (SPEC-svg-render.md "Objects", `curved-arrow`): a quadratic
// Bezier between two resolved anchors, cut out of label boxes by bisection, ending in a full
// triangular head or a fishhook (one barb). Pure geometry in pt; the caller resolves the anchors
// and checks that they are finite.
import type { Point, Rect } from '../doc-model';
import { halfHead, triangle } from './arrows';
import { pathD, polygonEl, strokeEl, type Drawn } from './draw';
import {
  add,
  dist,
  growRect,
  leftNormal,
  length,
  lerp,
  normalize,
  quadAt,
  quadBounds,
  rectContains,
  rectFromPoints,
  rectUnion,
  scale,
  sub,
} from './geom';
import { INK, type ResolvedStyle } from './style';

/** Bisection steps for the label clip and the shaft stop: fixed, so the output is deterministic. */
const STEPS = 40;

/** Head length is at most this fraction of the (clipped) arrow's length. */
const HEAD_FRACTION = 0.5;

/** One end of a curve: where it is attached and the box (if any) the curve is cut out of. */
export interface CurveEnd {
  readonly point: Point;
  readonly clip: Rect | null;
}

/**
 * The parameter range `[t0, t1]` of a curve (`point(0)` to `point(1)`) that lies outside the
 * start and end boxes: the start is cut where the curve leaves `startBox`, the end where it enters
 * `endBox`, both by 40-step bisection. A box that does not contain its end changes nothing.
 * `null` when nothing is left (the other end is in the same box, or the cuts meet).
 */
export function clipRange(
  point: (t: number) => Point,
  startBox: Rect | null,
  endBox: Rect | null,
): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  if (startBox && rectContains(startBox, point(0))) {
    if (rectContains(startBox, point(1))) return null;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < STEPS; i++) {
      const mid = (lo + hi) / 2;
      if (rectContains(startBox, point(mid))) lo = mid;
      else hi = mid;
    }
    t0 = hi;
  }
  if (endBox && rectContains(endBox, point(1))) {
    if (rectContains(endBox, point(t0))) return null;
    let lo = t0;
    let hi = 1;
    for (let i = 0; i < STEPS; i++) {
      const mid = (lo + hi) / 2;
      if (rectContains(endBox, point(mid))) hi = mid;
      else lo = mid;
    }
    t1 = lo;
  }
  return t1 > t0 ? [t0, t1] : null;
}

const finite = (pts: readonly Point[]): boolean =>
  pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

/**
 * Draws a curved arrow from `from` to `to`. The control point is the chord midpoint plus
 * `bend x chordLength x n`, `n` the left normal of `from -> to` (a positive bend bulges to the
 * visual left; 0 is a straight line). The curve is cut out of the end boxes, the shaft stops at the
 * base of the head, and the head length is at most half the cut chord. A fishhook has only the
 * barb on the convex side, the side the curve bulges toward (on the right of travel when the bend is 0). `null` when
 * nothing is drawn: no chord, nothing left after the cut, or a non-finite result.
 */
export function layoutCurvedArrow(
  head: 'full' | 'fishhook',
  from: CurveEnd,
  to: CurveEnd,
  bend: number,
  style: ResolvedStyle,
): Drawn | null {
  const chord = sub(to.point, from.point);
  const n = leftNormal(chord);
  if (!n) return null;
  const p0 = from.point;
  const p2 = to.point;
  const p1 = add(lerp(p0, p2, 0.5), scale(n, bend * length(chord)));
  if (!finite([p1])) return null;
  const at = (t: number): Point => quadAt(p0, p1, p2, t);

  const range = clipRange(at, from.clip, to.clip);
  if (!range) return null;
  const [a, b] = range;
  const start = at(a);
  const tip = at(b);
  const span = dist(start, tip);
  if (!(span > 1e-9)) return null;
  const headLength = Math.min(style.arrowHeadLength, HEAD_FRACTION * span);

  // The shaft ends where the curve is `headLength` from the tip; the head is built on that chord.
  let lo = a;
  let hi = b;
  for (let i = 0; i < STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (dist(at(mid), tip) > headLength) lo = mid;
    else hi = mid;
  }
  const stopT = (lo + hi) / 2;
  const base = at(stopT);
  const u = normalize(sub(tip, base));
  if (!u) return null;

  // The part of the curve from a to stopT is again a quadratic: its control point lies on the
  // start tangent, `(stopT - a)` of the way along the derivative.
  const control = add(
    start,
    scale(add(scale(sub(p1, p0), 1 - a), scale(sub(p2, p1), a)), stopT - a),
  );
  const straight = bend === 0;
  const shaftPoints = straight ? [start, base] : [start, control, base];
  const d = straight ? pathD(shaftPoints, ['M']) : pathD(shaftPoints, ['M', 'Q', ' ']);

  const normal = { x: u.y, y: -u.x };
  const back = sub(tip, base);
  const headPoints =
    head === 'full'
      ? triangle(tip, back, normal, style.arrowHeadHalfWidth)
      : halfHead(
          tip,
          back,
          scale(normal, bend > 0 ? style.arrowHeadHalfWidth : -style.arrowHeadHalfWidth),
        );
  if (!finite([...shaftPoints, ...headPoints])) return null;

  const half = style.lineWidth / 2;
  const shaftBox = straight
    ? (rectFromPoints([start, base]) as Rect)
    : quadBounds(start, control, base);
  return {
    svg: [strokeEl(d, INK, style), polygonEl(headPoints, INK)].join('\n'),
    ink: rectUnion(growRect(shaftBox, half), rectFromPoints(headPoints) as Rect),
  };
}
