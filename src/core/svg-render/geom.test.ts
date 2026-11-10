import { describe, expect, it } from 'vitest';
import {
  add,
  clipSegmentOutsideBox,
  clipSegmentToBox,
  cross,
  cubicAt,
  cubicBounds,
  dist,
  dot,
  growRect,
  leftNormal,
  length,
  lerp,
  normalize,
  quadAt,
  quadBounds,
  rayExitBox,
  rayExitPoint,
  rectCenter,
  rectContains,
  rectFromPoints,
  rectUnion,
  scale,
  sub,
  unionAll,
} from './geom';

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);
const box = { x: -2, y: -1, w: 4, h: 2 }; // centre at the origin

describe('vectors', () => {
  it('does basic arithmetic', () => {
    expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    expect(sub({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: -2, y: -2 });
    expect(scale({ x: 1, y: -2 }, 3)).toEqual({ x: 3, y: -6 });
    expect(dot({ x: 1, y: 2 }, { x: 3, y: 4 })).toBe(11);
    expect(cross({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(1);
    expect(length({ x: 3, y: 4 })).toBe(5);
    expect(dist({ x: 1, y: 1 }, { x: 4, y: 5 })).toBe(5);
    expect(lerp({ x: 0, y: 0 }, { x: 4, y: 8 }, 0.25)).toEqual({ x: 1, y: 2 });
  });

  it('normalises, and rejects a zero or non-finite vector', () => {
    const u = normalize({ x: 3, y: 4 })!;
    near(u.x, 0.6);
    near(u.y, 0.8);
    expect(normalize({ x: 0, y: 0 })).toBeNull();
    expect(normalize({ x: Infinity, y: 0 })).toBeNull();
    expect(normalize({ x: NaN, y: 1 })).toBeNull();
  });

  it('puts the left normal on the visual left of travel (y down)', () => {
    const east = leftNormal({ x: 5, y: 0 })!;
    near(east.x, 0);
    near(east.y, -1); // travelling east, "left" is up the screen
    const south = leftNormal({ x: 0, y: 2 })!;
    near(south.x, 1); // travelling down, "left" is screen right
    near(south.y, 0);
    const west = leftNormal({ x: -1, y: 0 })!;
    near(west.y, 1);
    expect(leftNormal({ x: 0, y: 0 })).toBeNull();
  });
});

describe('boxes', () => {
  it('builds, unions, grows and queries boxes', () => {
    expect(rectFromPoints([])).toBeNull();
    expect(
      rectFromPoints([
        { x: 1, y: 5 },
        { x: -1, y: 2 },
        { x: 3, y: 4 },
      ]),
    ).toEqual({ x: -1, y: 2, w: 4, h: 3 });
    expect(rectUnion({ x: 0, y: 0, w: 1, h: 1 }, { x: 2, y: -1, w: 1, h: 1 })).toEqual({
      x: 0,
      y: -1,
      w: 3,
      h: 2,
    });
    expect(unionAll([])).toBeNull();
    expect(
      unionAll([
        { x: 0, y: 0, w: 1, h: 1 },
        { x: 5, y: 5, w: 1, h: 1 },
        { x: -1, y: 2, w: 0, h: 0 },
      ]),
    ).toEqual({ x: -1, y: 0, w: 7, h: 6 });
    expect(growRect({ x: 0, y: 0, w: 2, h: 4 }, 1)).toEqual({ x: -1, y: -1, w: 4, h: 6 });
    expect(growRect({ x: 0, y: 0, w: 2, h: 2 }, -5)).toEqual({ x: 1, y: 1, w: 0, h: 0 });
    expect(rectCenter(box)).toEqual({ x: 0, y: 0 });
    expect(rectContains(box, { x: 2, y: 1 })).toBe(true);
    expect(rectContains(box, { x: 2.01, y: 0 })).toBe(false);
  });
});

describe('ray exit from a box', () => {
  // Eight compass directions from the centre of a 4 x 2 box: [dx, dy, exit x, exit y].
  const cases: [string, number, number, number, number][] = [
    ['E', 1, 0, 2, 0],
    ['W', -1, 0, -2, 0],
    ['S', 0, 1, 0, 1],
    ['N', 0, -1, 0, -1],
    ['SE (hits the bottom)', 1, 1, 1, 1],
    ['NE (hits the top)', 3, -3, 1, -1],
    ['SW (hits the bottom)', -5, 5, -1, 1],
    ['NW (hits the left edge)', -4, -1, -2, -0.5],
  ];
  it.each(cases)('leaves through the right edge going %s', (_n, dx, dy, ex, ey) => {
    const p = rayExitPoint({ x: 0, y: 0 }, { x: dx, y: dy }, box)!;
    near(p.x, ex);
    near(p.y, ey);
  });

  it('works from an off-centre origin and scales with the direction length', () => {
    near(rayExitBox({ x: 1, y: 0 }, { x: 1, y: 0 }, box)!, 1);
    near(rayExitBox({ x: 1, y: 0 }, { x: 2, y: 0 }, box)!, 0.5);
  });

  it('returns null for a zero direction or an origin outside', () => {
    expect(rayExitBox({ x: 0, y: 0 }, { x: 0, y: 0 }, box)).toBeNull();
    expect(rayExitBox({ x: 9, y: 0 }, { x: 1, y: 0 }, box)).toBeNull();
    expect(rayExitPoint({ x: 9, y: 0 }, { x: 1, y: 0 }, box)).toBeNull();
  });
});

describe('segment against a box', () => {
  it('clips a crossing segment to the part inside', () => {
    const [p, q] = clipSegmentToBox({ x: -5, y: 0 }, { x: 5, y: 0 }, box)!;
    expect(p).toEqual({ x: -2, y: 0 });
    expect(q).toEqual({ x: 2, y: 0 });
  });

  it('keeps a segment entirely inside and misses one that is outside', () => {
    const a = { x: -1, y: 0 };
    const b = { x: 1, y: 0.5 };
    expect(clipSegmentToBox(a, b, box)).toEqual([a, b]);
    expect(clipSegmentToBox({ x: -5, y: 3 }, { x: 5, y: 3 }, box)).toBeNull();
    expect(clipSegmentToBox({ x: 3, y: -5 }, { x: 3, y: 5 }, box)).toBeNull();
    expect(clipSegmentToBox({ x: -5, y: -5 }, { x: -3, y: 5 }, box)).toBeNull();
  });

  it('clips a diagonal exactly', () => {
    const [p, q] = clipSegmentToBox({ x: -4, y: -2 }, { x: 4, y: 2 }, box)!;
    near(p.x, -2);
    near(p.y, -1);
    near(q.x, 2);
    near(q.y, 1);
  });

  it('removes the box interior from the ends or the middle of a segment', () => {
    // Starts inside: one piece beyond the box.
    expect(clipSegmentOutsideBox({ x: 0, y: 0 }, { x: 6, y: 0 }, box)).toEqual([
      [
        { x: 2, y: 0 },
        { x: 6, y: 0 },
      ],
    ]);
    // Ends inside.
    expect(clipSegmentOutsideBox({ x: -6, y: 0 }, { x: 0, y: 0 }, box)).toEqual([
      [
        { x: -6, y: 0 },
        { x: -2, y: 0 },
      ],
    ]);
    // Across the middle: two pieces.
    expect(clipSegmentOutsideBox({ x: -6, y: 0 }, { x: 6, y: 0 }, box)).toEqual([
      [
        { x: -6, y: 0 },
        { x: -2, y: 0 },
      ],
      [
        { x: 2, y: 0 },
        { x: 6, y: 0 },
      ],
    ]);
    // Missing the box keeps it whole; wholly inside leaves nothing.
    const away: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: -6, y: 5 },
      { x: 6, y: 5 },
    ];
    expect(clipSegmentOutsideBox(away[0], away[1], box)).toEqual([away]);
    expect(clipSegmentOutsideBox({ x: -1, y: 0 }, { x: 1, y: 0 }, box)).toEqual([]);
  });
});

// Dense sampling reference for the extrema tests.
function sampledBounds(f: (t: number) => { x: number; y: number }, steps = 200000) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i <= steps; i++) {
    const p = f(i / steps);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}

describe('Bezier evaluation and extrema', () => {
  it('evaluates ends and midpoints', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 2, y: 4 };
    const p2 = { x: 4, y: 0 };
    expect(quadAt(p0, p1, p2, 0)).toEqual(p0);
    expect(quadAt(p0, p1, p2, 1)).toEqual(p2);
    expect(quadAt(p0, p1, p2, 0.5)).toEqual({ x: 2, y: 2 });
    const c = cubicAt(p0, { x: 0, y: 4 }, { x: 4, y: 4 }, p2, 0.5);
    near(c.x, 2);
    near(c.y, 3);
  });

  it('gives the exact quadratic extremum (analytic case)', () => {
    // y(t) = 8·t·(1-t) peaks at t = 0.5, y = 2; x is monotone.
    const b = quadBounds({ x: 0, y: 0 }, { x: 2, y: 4 }, { x: 4, y: 0 });
    near(b.x, 0);
    near(b.w, 4);
    near(b.y, 0);
    near(b.h, 2);
  });

  it('gives the exact cubic extrema (analytic case)', () => {
    // y(t) = 12·t·(1-t)·... with control y = (0, 4, 4, 0): 12·t·(1-t); peak 3 at t = 0.5.
    const b = cubicBounds({ x: 0, y: 0 }, { x: 0, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 0 });
    near(b.x, 0);
    near(b.w, 4);
    near(b.y, 0);
    near(b.h, 3);
  });

  it('excludes the control points and handles degenerate (straight) curves', () => {
    const q = quadBounds({ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 });
    expect(q).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    const c = cubicBounds({ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 }, { x: 9, y: 0 });
    expect(c).toEqual({ x: 0, y: 0, w: 9, h: 0 });
  });

  it('agrees with dense sampling on a set of quadratics (overshoot on both axes)', () => {
    const sets: [number, number, number, number, number, number][] = [
      [0, 0, 10, -6, 4, 3],
      [1, 5, -7, 9, 2, -4],
      [3, 3, 3, 3, 3, 3],
      [-2, 1, 6, 8, 0, 0],
    ];
    for (const [a, b, c, d, e, f] of sets) {
      const p0 = { x: a, y: b };
      const p1 = { x: c, y: d };
      const p2 = { x: e, y: f };
      const r = quadBounds(p0, p1, p2);
      const s = sampledBounds((t) => quadAt(p0, p1, p2, t));
      expect(Math.abs(r.x - s.minX)).toBeLessThan(1e-7);
      expect(Math.abs(r.x + r.w - s.maxX)).toBeLessThan(1e-7);
      expect(Math.abs(r.y - s.minY)).toBeLessThan(1e-7);
      expect(Math.abs(r.y + r.h - s.maxY)).toBeLessThan(1e-7);
    }
  });

  it('agrees with dense sampling on a set of cubics (S-curves, loops, near-quadratic)', () => {
    const sets: [number, number, number, number, number, number, number, number][] = [
      [0, 0, 10, 8, -6, 9, 4, 1],
      [0, 0, 0, 5, 5, -5, 5, 0],
      [1, 1, 4, 4, 7, 7, 10, 10],
      [-3, 2, 8, -9, -8, 7, 3, 3],
      [0, 0, 3, 6, 6, 6, 9, 0],
    ];
    for (const [a, b, c, d, e, f, g, h] of sets) {
      const p0 = { x: a, y: b };
      const p1 = { x: c, y: d };
      const p2 = { x: e, y: f };
      const p3 = { x: g, y: h };
      const r = cubicBounds(p0, p1, p2, p3);
      const s = sampledBounds((t) => cubicAt(p0, p1, p2, p3, t));
      expect(Math.abs(r.x - s.minX)).toBeLessThan(1e-7);
      expect(Math.abs(r.x + r.w - s.maxX)).toBeLessThan(1e-7);
      expect(Math.abs(r.y - s.minY)).toBeLessThan(1e-7);
      expect(Math.abs(r.y + r.h - s.maxY)).toBeLessThan(1e-7);
      // Never smaller than the sampled hull: the extrema are attained on the curve.
      expect(r.x).toBeLessThanOrEqual(s.minX + 1e-12);
      expect(r.x + r.w).toBeGreaterThanOrEqual(s.maxX - 1e-12);
    }
  });
});
