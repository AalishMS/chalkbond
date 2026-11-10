// Plain 2D geometry for svg-render: vectors, boxes, clipping and Bezier extrema. Pure functions
// over `Point` / `Rect`; y points down. Only `sqrt` and the four operations (no `pow`, `hypot`,
// `tan`: SPEC-svg-render.md "Determinism").
import type { Point, Rect } from '../doc-model';

// --- vectors ----------------------------------------------------------------------------------

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Point, k: number): Point {
  return { x: a.x * k, y: a.y * k };
}

export function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

/** z component of the 3D cross product (positive: `b` is clockwise from `a` on screen). */
export function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

export function length(a: Point): number {
  return Math.sqrt(a.x * a.x + a.y * a.y);
}

export function dist(a: Point, b: Point): number {
  return length(sub(a, b));
}

/** Point `t` of the way from `a` to `b`. */
export function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Unit vector, or `null` for a zero or non-finite vector. */
export function normalize(a: Point): Point | null {
  const len = length(a);
  return len > 0 && Number.isFinite(len) ? { x: a.x / len, y: a.y / len } : null;
}

/**
 * Unit normal on the visual left of travel along `d` (y down): travelling east, left is up
 * (0, -1). `null` for a zero vector.
 */
export function leftNormal(d: Point): Point | null {
  const u = normalize(d);
  return u ? { x: u.y, y: -u.x } : null;
}

// --- boxes ------------------------------------------------------------------------------------

export function rectFromPoints(points: readonly Point[]): Rect | null {
  const first = points[0];
  if (!first) return null;
  let minX = first.x;
  let maxX = first.x;
  let minY = first.y;
  let maxY = first.y;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

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

/** Union of any number of boxes; `null` for none. */
export function unionAll(rects: readonly Rect[]): Rect | null {
  let out: Rect | null = null;
  for (const r of rects) out = out ? rectUnion(out, r) : r;
  return out;
}

/** Grows (or, for negative `m`, shrinks to at least a point) a box by `m` on every side. */
export function growRect(r: Rect, m: number): Rect {
  const w = Math.max(0, r.w + 2 * m);
  const h = Math.max(0, r.h + 2 * m);
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function rectContains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

// --- rays and segments against a box ------------------------------------------------------------

/**
 * Distance `t >= 0` along the unit-or-not direction `dir` (point = origin + t·dir) at which a
 * ray from a point inside `box` leaves it. `null` for a zero direction or an origin outside the
 * box.
 */
export function rayExitBox(origin: Point, dir: Point, box: Rect): number | null {
  if (!rectContains(box, origin)) return null;
  if (dir.x === 0 && dir.y === 0) return null;
  let t = Infinity;
  if (dir.x > 0) t = Math.min(t, (box.x + box.w - origin.x) / dir.x);
  else if (dir.x < 0) t = Math.min(t, (box.x - origin.x) / dir.x);
  if (dir.y > 0) t = Math.min(t, (box.y + box.h - origin.y) / dir.y);
  else if (dir.y < 0) t = Math.min(t, (box.y - origin.y) / dir.y);
  return t;
}

/** The point where a ray from inside `box` along `dir` leaves it. */
export function rayExitPoint(origin: Point, dir: Point, box: Rect): Point | null {
  const t = rayExitBox(origin, dir, box);
  return t === null ? null : { x: origin.x + dir.x * t, y: origin.y + dir.y * t };
}

/**
 * Liang-Barsky: the parameter interval `[t0, t1]` within `[0, 1]` of segment `a`-`b` that lies
 * inside the (closed) box, or `null` when the segment misses it.
 */
export function segmentBoxInterval(a: Point, b: Point, box: Rect): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const d = sub(b, a);
  const checks: [number, number][] = [
    [-d.x, a.x - box.x],
    [d.x, box.x + box.w - a.x],
    [-d.y, a.y - box.y],
    [d.y, box.y + box.h - a.y],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return null;
        t0 = Math.max(t0, r);
      } else {
        if (r < t0) return null;
        t1 = Math.min(t1, r);
      }
    }
  }
  return t0 <= t1 ? [t0, t1] : null;
}

/** The part of segment `a`-`b` inside `box`, or `null`. */
export function clipSegmentToBox(a: Point, b: Point, box: Rect): [Point, Point] | null {
  const iv = segmentBoxInterval(a, b, box);
  return iv ? [lerp(a, b, iv[0]), lerp(a, b, iv[1])] : null;
}

/**
 * The parts of segment `a`-`b` outside `box`: the whole segment when it misses the box, none
 * when it is entirely inside, otherwise one piece (box at an end) or two (box across the middle).
 */
export function clipSegmentOutsideBox(a: Point, b: Point, box: Rect): [Point, Point][] {
  const iv = segmentBoxInterval(a, b, box);
  if (!iv) return [[a, b]];
  const [t0, t1] = iv;
  const out: [Point, Point][] = [];
  if (t0 > 0) out.push([a, lerp(a, b, t0)]);
  if (t1 < 1) out.push([lerp(a, b, t1), b]);
  return out;
}

// --- Bezier curves ----------------------------------------------------------------------------------

export function quadAt(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

export function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Roots in the open interval (0, 1) of `a·t² + b·t + c`. */
function rootsInUnit(a: number, b: number, c: number): number[] {
  const eps = 1e-12;
  const roots: number[] = [];
  if (Math.abs(a) < eps) {
    if (Math.abs(b) >= eps) roots.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      roots.push((-b - s) / (2 * a), (-b + s) / (2 * a));
    }
  }
  return roots.filter((t) => t > 0 && t < 1);
}

/** Exact bounding box of a quadratic Bezier (its extrema, not the control polygon). */
export function quadBounds(p0: Point, p1: Point, p2: Point): Rect {
  const pts: Point[] = [p0, p2];
  // B'(t) / 2 = (p1 - p0) + t·(p0 - 2·p1 + p2), per axis.
  for (const axis of ['x', 'y'] as const) {
    const d = p0[axis] - 2 * p1[axis] + p2[axis];
    if (d !== 0) {
      const t = (p0[axis] - p1[axis]) / d;
      if (t > 0 && t < 1) pts.push(quadAt(p0, p1, p2, t));
    }
  }
  return rectFromPoints(pts) as Rect;
}

/** Exact bounding box of a cubic Bezier (its extrema, not the control polygon). */
export function cubicBounds(p0: Point, p1: Point, p2: Point, p3: Point): Rect {
  const pts: Point[] = [p0, p3];
  for (const axis of ['x', 'y'] as const) {
    // B'(t) / 3 = d0·(1-t)² + 2·d1·(1-t)·t + d2·t², expanded as a·t² + b·t + c.
    const d0 = p1[axis] - p0[axis];
    const d1 = p2[axis] - p1[axis];
    const d2 = p3[axis] - p2[axis];
    for (const t of rootsInUnit(d0 - 2 * d1 + d2, 2 * (d1 - d0), d0)) {
      pts.push(cubicAt(p0, p1, p2, p3, t));
    }
  }
  return rectFromPoints(pts) as Rect;
}
