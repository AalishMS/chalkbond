// Curved electron-pushing arrows (SPEC-svg-render.md "Objects", `curved-arrow`): a quadratic
// Bezier (a symmetric cubic above |bend| 0.5) between two resolved anchors, cut out of label
// boxes by bisection, ending in a full triangular head or a fishhook (one barb). Pure geometry in
// pt; the caller resolves the anchors and checks that they are finite.
import type { Point, Rect } from '../doc-model';
import { halfHead, triangle } from './arrows';
import { pathD, polygonEl, strokeEl, type Drawn } from './draw';
import {
  add,
  cubicAt,
  cubicBounds,
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

/**
 * Larger than any page; beyond it a coordinate is not drawable (and `String` would print an
 * exponent). A huge `bend` over a near-zero chord (a stored file or a property test can make
 * one) puts the control points out here, so it draws nothing, like a non-finite result.
 */
const MAX_COORD = 1e9;

const finite = (pts: readonly Point[]): boolean =>
  pts.every((p) => Math.abs(p.x) <= MAX_COORD && Math.abs(p.y) <= MAX_COORD);

/** Up to this |bend| the curve is the quadratic; above it, the symmetric cubic (Decision 13). */
export const QUADRATIC_MAX_BEND = 0.5;

/**
 * The cubic control points of a curved arrow's whole curve for `bend` over `p0 -> p3`, in any one
 * unit: `c1 = p0 + a·chord + (2/3)·bend·|chord|·n`, `c2 = p3 - a·chord + (2/3)·bend·|chord|·n`,
 * `n` the left normal, `a = (1/3)·clamp(2 - 2|bend|, 0, 1)`. Up to |bend| 0.5 this is the
 * degree-raised quadratic (control `midpoint + bend·|chord|·n`); from |bend| 1 the handles are
 * square to the chord. The `t = 0.5` point is `midpoint + bend·|chord|/2·n` for every bend.
 */
export function curveControls(p0: Point, p3: Point, bend: number): [Point, Point, Point, Point] {
  const chord = sub(p3, p0);
  const n = leftNormal(chord) ?? { x: 0, y: 0 };
  const a = Math.min(1, Math.max(0, 2 - 2 * Math.abs(bend))) / 3;
  const up = scale(n, (2 / 3) * bend * length(chord));
  return [p0, add(add(p0, scale(chord, a)), up), add(sub(p3, scale(chord, a)), up), p3];
}

/** The piece `[a, b]` of the cubic `q`, again a cubic (de Casteljau, twice). */
function cubicPiece(q: readonly [Point, Point, Point, Point], a: number, b: number): Point[] {
  const split = (p: readonly Point[], t: number): [Point[], Point[]] => {
    const [p0, p1, p2, p3] = p as [Point, Point, Point, Point];
    const p01 = lerp(p0, p1, t);
    const p12 = lerp(p1, p2, t);
    const p23 = lerp(p2, p3, t);
    const p012 = lerp(p01, p12, t);
    const p123 = lerp(p12, p23, t);
    const mid = lerp(p012, p123, t);
    return [
      [p0, p01, p012, mid],
      [mid, p123, p23, p3],
    ];
  };
  const right = split(q, a)[1];
  return split(right, a < 1 ? (b - a) / (1 - a) : 0)[0];
}

/** The whole curve: a point at `t`, and the shaft from `a` to `stop` as path points. */
interface Curve {
  readonly at: (t: number) => Point;
  readonly shaft: (a: number, stop: number) => { points: Point[]; d: string; box: Rect };
}

/** The quadratic of |bend| ≤ 0.5 (a straight line at 0), exactly as drawn before Decision 13. */
function quadratic(
  p0: Point,
  p2: Point,
  n: Point,
  bend: number,
  chordLength: number,
): Curve | null {
  const p1 = add(lerp(p0, p2, 0.5), scale(n, bend * chordLength));
  if (!finite([p1])) return null;
  const at = (t: number): Point => quadAt(p0, p1, p2, t);
  return {
    at,
    shaft: (a, stopT) => {
      const start = at(a);
      const base = at(stopT);
      // The part of the curve from a to stopT is again a quadratic: its control point lies on the
      // start tangent, `(stopT - a)` of the way along the derivative.
      const control = add(
        start,
        scale(add(scale(sub(p1, p0), 1 - a), scale(sub(p2, p1), a)), stopT - a),
      );
      if (bend === 0) {
        return {
          points: [start, base],
          d: pathD([start, base], ['M']),
          box: rectFromPoints([start, base]) as Rect,
        };
      }
      return {
        points: [start, control, base],
        d: pathD([start, control, base], ['M', 'Q', ' ']),
        box: quadBounds(start, control, base),
      };
    },
  };
}

/** The symmetric cubic of |bend| > 0.5. */
function cubic(p0: Point, p3: Point, bend: number): Curve | null {
  const q = curveControls(p0, p3, bend);
  if (!finite(q)) return null;
  return {
    at: (t) => cubicAt(q[0], q[1], q[2], q[3], t),
    shaft: (a, stopT) => {
      const points = cubicPiece(q, a, stopT);
      const [s0, s1, s2, s3] = points as [Point, Point, Point, Point];
      return { points, d: pathD(points, ['M', 'C', ' ', ' ']), box: cubicBounds(s0, s1, s2, s3) };
    },
  };
}

/**
 * Draws a curved arrow from `from` to `to` (SPEC-svg-render.md, `curved-arrow`). Up to |bend| 0.5
 * the curve is a quadratic whose control point is the chord midpoint plus `bend x chordLength x
 * n`, `n` the left normal of `from -> to` (a positive bend bulges to the visual left; 0 is a
 * straight line); above it, the cubic of `curveControls`. The curve is cut out of the end boxes,
 * the shaft stops at the base of the head, and the head length is at most half the cut chord. A
 * fishhook has only the barb on the convex side, the side the curve bulges toward (on the right
 * of travel when the bend is 0). `null` when nothing is drawn: no chord, nothing left after the
 * cut, or a non-finite result.
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
  const curve =
    Math.abs(bend) > QUADRATIC_MAX_BEND
      ? cubic(from.point, to.point, bend)
      : quadratic(from.point, to.point, n, bend, length(chord));
  if (!curve) return null;
  const { at } = curve;

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
  const shaft = curve.shaft(a, stopT);

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
  if (!finite([...shaft.points, ...headPoints])) return null;

  const half = style.lineWidth / 2;
  return {
    svg: [strokeEl(shaft.d, INK, style), polygonEl(headPoints, INK)].join('\n'),
    ink: rectUnion(growRect(shaft.box, half), rectFromPoints(headPoints) as Rect),
  };
}
