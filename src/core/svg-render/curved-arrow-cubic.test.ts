// Decision 13 (SPEC-svg-render.md): above |bend| 0.5 a curved arrow is a symmetric cubic whose
// handles turn square to the chord, so short arrows between neighbouring anchors swing wide and
// arrive head-on instead of leaving a stub with a head pointing away from the atom.
import { describe, expect, it } from 'vitest';
import type { Point, Rect } from '../doc-model';
import { inkScan } from './__fixtures__/ink-scan';
import { pathPoints, polygonPoints } from './__fixtures__/markup';
import { curveControls, layoutCurvedArrow, type CurveEnd } from './curved-arrow';
import { dist } from './geom';
import { isLabelled } from './atom-label';
import { curveControls as exportedCurveControls, isLabelled as exportedIsLabelled } from './index';
import { resolveStyle } from './style';

// slides: line 2, head 8.8 x 3.6 (half width).
const style = resolveStyle({ preset: 'slides', overrides: {} });
const near = (actual: number, expected: number, digits = 3) =>
  expect(actual).toBeCloseTo(expected, digits);
const P = (x: number, y: number): Point => ({ x, y });
const end = (p: Point, clip: Rect | null = null): CurveEnd => ({ point: p, clip });
const A = end(P(0, 0));
const B = end(P(100, 0));
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const minus = (a: Point, b: Point) => P(a.x - b.x, a.y - b.y);
const angleDeg = (a: Point, b: Point) =>
  (Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (dist(a, P(0, 0)) * dist(b, P(0, 0)))))) * 180) /
  Math.PI;
const cubic = (q: readonly Point[], t: number): Point => {
  const [p0, p1, p2, p3] = q as [Point, Point, Point, Point];
  const u = 1 - t;
  return P(
    u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  );
};
/** Distance from `p` to the curve `q` (dense sampling). */
const offCurve = (q: readonly Point[], p: Point) => {
  let best = Infinity;
  for (let i = 0; i <= 40000; i++) best = Math.min(best, dist(cubic(q, i / 40000), p));
  return best;
};
const curveLength = (q: readonly Point[]) => {
  let length = 0;
  let prev = q[0] as Point;
  for (let i = 1; i <= 400; i++) {
    const p = cubic(q, i / 400);
    length += dist(prev, p);
    prev = p;
  }
  return length;
};
const sameBox = (a: Rect, b: Rect) => {
  for (const k of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(a[k] - b[k])).toBeLessThan(0.01);
};
const onBoundary = (p: Point, r: Rect): boolean =>
  [
    Math.abs(p.x - r.x),
    Math.abs(p.x - r.x - r.w),
    Math.abs(p.y - r.y),
    Math.abs(p.y - r.y - r.h),
  ].some((d) => d < 1e-6);
const headBase = (head: readonly Point[]): Point =>
  P(
    ((head[1] as Point).x + (head[2] as Point).x) / 2,
    ((head[1] as Point).y + (head[2] as Point).y) / 2,
  );

describe('curveControls', () => {
  const p0 = P(10, 20);
  const p3 = P(90, 80); // chord (80, 60), length 100, left normal (0.6, -0.8)
  const n = P(0.6, -0.8);

  it('up to |bend| 0.5 it is the degree-raised quadratic', () => {
    for (const bend of [0, 0.3, -0.5, 0.5]) {
      const q1 = P(50 + n.x * bend * 100, 50 + n.y * bend * 100);
      const [a, c1, c2, b] = curveControls(p0, p3, bend);
      expect(a).toEqual(p0);
      expect(b).toEqual(p3);
      near(c1.x, p0.x + (2 / 3) * (q1.x - p0.x), 9);
      near(c1.y, p0.y + (2 / 3) * (q1.y - p0.y), 9);
      near(c2.x, p3.x + (2 / 3) * (q1.x - p3.x), 9);
      near(c2.y, p3.y + (2 / 3) * (q1.y - p3.y), 9);
    }
  });

  it('from |bend| 1 the handles are square to the chord, (2/3) x |bend| x chord long', () => {
    for (const bend of [1, 1.8, -2.6]) {
      const [a, c1, c2, b] = curveControls(p0, p3, bend);
      const chord = minus(p3, p0);
      near(dot(minus(c1, a), chord), 0, 9);
      near(dot(minus(c2, b), chord), 0, 9);
      near(dist(c1, a), (2 / 3) * Math.abs(bend) * 100, 9);
      near(dist(c2, b), (2 / 3) * Math.abs(bend) * 100, 9);
      // On the bulge side: the left normal for a positive bend.
      expect(Math.sign(dot(minus(c1, a), n))).toBe(Math.sign(bend));
    }
  });

  it('between 0.5 and 1 the handles turn steadily from the quadratic to square', () => {
    const along = (bend: number) => {
      const [a, c1] = curveControls(p0, p3, bend);
      return dot(minus(c1, a), P(0.8, 0.6)); // the handle's component along the chord
    };
    expect(along(0.5)).toBeGreaterThan(along(0.75));
    expect(along(0.75)).toBeGreaterThan(along(1));
    near(along(0.5 + 1e-9), along(0.5), 6);
    near(along(1), 0, 9);
  });

  it('the t = 0.5 point is the chord midpoint + bend x chord / 2 x n for every bend', () => {
    for (const bend of [0, 0.3, 0.5, 0.7, 1, 1.8, -2.6]) {
      const mid = cubic(curveControls(p0, p3, bend), 0.5);
      near(mid.x, 50 + n.x * bend * 50, 9);
      near(mid.y, 50 + n.y * bend * 50, 9);
    }
  });

  it('is exported for the editor', () => {
    expect(typeof exportedCurveControls).toBe('function');
    expect(exportedCurveControls).toBe(curveControls);
  });

  it('isLabelled is exported for the editor too (which ends are clipped out of a label)', () => {
    expect(typeof exportedIsLabelled).toBe('function');
    expect(exportedIsLabelled).toBe(isLabelled);
  });
});

describe('layoutCurvedArrow above |bend| 0.5', () => {
  it('|bend| 0.5 is still drawn as a quadratic, anything above as a cubic', () => {
    expect(layoutCurvedArrow('full', A, B, 0.5, style)?.svg).toContain('Q');
    expect(layoutCurvedArrow('full', A, B, -0.5, style)?.svg).toContain('Q');
    for (const bend of [0.51, -0.8, 1, 2.6]) {
      const svg = layoutCurvedArrow('full', A, B, bend, style)?.svg ?? '';
      expect(svg).toMatch(/d="M[^"A-Z]*C/);
      expect(svg).not.toContain('Q');
    }
  });

  it('the shaft is a piece of the whole curve and meets the head base', () => {
    for (const bend of [0.8, -1.4, 2.6]) {
      const out = layoutCurvedArrow('full', A, B, bend, style);
      const [shaft] = pathPoints(out?.svg ?? '') as [Point[]];
      expect(shaft).toHaveLength(4);
      expect(shaft[0]).toEqual(P(0, 0));
      const q = curveControls(P(0, 0), P(100, 0), bend);
      for (const t of [0.25, 0.5, 0.75]) expect(offCurve(q, cubic(shaft, t))).toBeLessThan(0.01);
      const [head] = polygonPoints(out?.svg ?? '') as [Point[]];
      expect(head[0]).toEqual(P(100, 0));
      const stop = shaft[3] as Point;
      near(dist(stop, head[0] as Point), 8.8, 2);
      const base = headBase(head);
      near(stop.x, base.x, 2);
      near(stop.y, base.y, 2);
    }
  });

  it('the apex of the unclipped curve is bend x chord / 2 off the chord', () => {
    const up = layoutCurvedArrow('full', A, B, 1.5, style);
    near(up?.ink.y ?? 0, -75 - 1, 2);
    const down = layoutCurvedArrow('full', A, B, -1.5, style);
    near((down?.ink.y ?? 0) + (down?.ink.h ?? 0), 75 + 1, 2);
  });

  it('fishhook: one barb, on the convex side', () => {
    for (const bend of [1.5, -1.5]) {
      const out = layoutCurvedArrow('fishhook', A, B, bend, style);
      const [tip, base, barb] = polygonPoints(out?.svg ?? '')[0] as [Point, Point, Point];
      expect(tip).toEqual(P(100, 0));
      near(dist(base, barb), 3.6, 2);
      // The convex side is away from the centre of curvature: from the barb's foot, the barb
      // points away from the chord midpoint (which the arc curls round).
      const centre = P(50, 0);
      expect(dist(barb, centre)).toBeGreaterThan(dist(base, centre));
    }
  });

  it.each([
    ['full', 0.8],
    ['full', -2.6],
    ['fishhook', 1.4],
    ['fishhook', -1.8],
  ] as const)('%s, bend %s: ink equals an independent scan of the markup', (head, bend) => {
    const out = layoutCurvedArrow(head, end(P(10, 20)), end(P(30, 35)), bend, style);
    sameBox(out?.ink as Rect, inkScan(out?.svg ?? '') as Rect);
  });

  // The E25 failure: a bond-to-own-atom arrow (0.5 BLU = 20 pt in slides) into an O label box.
  // The anchor box of 'O' is about 18.7 x 17.2 pt; grown by curvedGap (3.2 pt).
  const oBox: Rect = { x: -12.5, y: -11.8, w: 25, h: 23.6 };
  const bondMid = end(P(0, 20));
  const atO = end(P(0, 0), oBox);

  it('bond to its own labelled atom: a long arc whose head ends on the box, pointing in', () => {
    for (const bend of [2.6, -2.6]) {
      const out = layoutCurvedArrow('full', bondMid, atO, bend, style);
      sameBox(out?.ink as Rect, inkScan(out?.svg ?? '') as Rect);
      const [shaft] = pathPoints(out?.svg ?? '') as [Point[]];
      const [head] = polygonPoints(out?.svg ?? '') as [Point[]];
      const tip = head[0] as Point;
      const base = headBase(head);
      expect(shaft[0]).toEqual(P(0, 20));
      expect(onBoundary(tip, oBox)).toBe(true);
      expect(angleDeg(minus(tip, base), minus(P(0, 0), tip))).toBeLessThan(30);
      expect(dist(tip, base)).toBeCloseTo(8.8, 2); // the style's head, not shrunk
      expect(curveLength(shaft) + dist(tip, base)).toBeGreaterThan(3 * 8.8);
    }
  });

  it('lone pair to the adjacent bond: the tail leaves the box, the head crosses the bond', () => {
    const out = layoutCurvedArrow('full', atO, bondMid, 2.6, style);
    const [shaft] = pathPoints(out?.svg ?? '') as [Point[]];
    const [head] = polygonPoints(out?.svg ?? '') as [Point[]];
    expect(onBoundary(shaft[0] as Point, oBox)).toBe(true);
    expect(head[0]).toEqual(P(0, 20));
    // The chord lies along the bond here; the head arrives across it, not along it.
    expect(angleDeg(minus(head[0] as Point, headBase(head)), P(0, 1))).toBeGreaterThan(45);
  });
});
