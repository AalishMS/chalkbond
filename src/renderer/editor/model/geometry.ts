// Plain 2-D geometry for the editor: vectors, angles, distances and rectangles. y points down.
import type { Point, Rect } from '@core/doc-model';

export type { Point, Rect };

/** A size in whatever unit the caller works in (the canvas in screen px). */
export interface Size {
  readonly w: number;
  readonly h: number;
}

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
export const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;
export const length = (a: Point): number => Math.hypot(a.x, a.y);
export const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

/** The unit vector, or the zero vector for a zero-length input. */
export function normalize(a: Point): Point {
  const n = length(a);
  return n === 0 ? { x: 0, y: 0 } : { x: a.x / n, y: a.y / n };
}

export const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Rotates `p` by `deg` degrees about `about` (clockwise on screen, because y points down). */
export function rotate(p: Point, deg: number, about: Point = { x: 0, y: 0 }): Point {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const d = sub(p, about);
  return { x: about.x + d.x * c - d.y * s, y: about.y + d.x * s + d.y * c };
}

/** Direction from `from` to `to` in degrees, from +x, positive towards +y (down): -180..180. */
export function angleDeg(from: Point, to: Point): number {
  const a = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  return a === 0 ? 0 : a;
}

/** `to` moved onto the nearest multiple of `stepDeg` about `from`, at the same distance. */
export function snapAngle(from: Point, to: Point, stepDeg: number): Point {
  const d = distance(from, to);
  if (d === 0) return { x: to.x, y: to.y };
  const snapped = Math.round(angleDeg(from, to) / stepDeg) * stepDeg;
  return rotate({ x: from.x + d, y: from.y }, snapped, from);
}

/** Distance from `p` to the segment `a`–`b`. */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (len2 === 0) return distance(p, a);
  const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / len2));
  return distance(p, { x: a.x + ab.x * t, y: a.y + ab.y * t });
}

/** The point at `t` of the quadratic Bézier `p0`, control `c`, `p1`. */
export function quadAt(p0: Point, c: Point, p1: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
  };
}

/** Samples of a curve used for hit-testing (H1). */
const CURVE_STEPS = 32;

/** Distance from `p` to the quadratic sampled at 32 steps (the polyline through the samples). */
export function distToQuad(p: Point, p0: Point, c: Point, p1: Point): number {
  let best = Infinity;
  let prev = p0;
  for (let i = 1; i <= CURVE_STEPS; i++) {
    const next = quadAt(p0, c, p1, i / CURVE_STEPS);
    best = Math.min(best, distToSegment(p, prev, next));
    prev = next;
  }
  return best;
}

/** Inclusive. */
export const rectContains = (r: Rect, p: Point): boolean =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** `inner` lies entirely within `outer`. */
export const rectInside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

/** Overlap or touch. */
export const rectIntersects = (a: Rect, b: Rect): boolean =>
  a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;

export function rectUnion(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

export const growRect = (r: Rect, d: number): Rect => ({
  x: r.x - d,
  y: r.y - d,
  w: r.w + 2 * d,
  h: r.h + 2 * d,
});

export const rectCenter = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** The rectangle with corners `a` and `b`, in either order (a marquee). */
export function rectFromPoints(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x, b.x) - x, h: Math.max(a.y, b.y) - y };
}
