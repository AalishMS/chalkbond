import { describe, expect, it } from 'vitest';
import type { Point, Rect } from '../doc-model';
import { inkScan } from './__fixtures__/ink-scan';
import { pathPoints, polygonPoints } from './__fixtures__/markup';
import { clipRange, layoutCurvedArrow, type CurveEnd } from './curved-arrow';
import { dist } from './geom';
import { resolveStyle } from './style';

// slides: line 2, head 8.8 x 3.6 (half width), font 28.
const style = resolveStyle({ preset: 'slides', overrides: {} });
const near = (actual: number, expected: number, digits = 3) =>
  expect(actual).toBeCloseTo(expected, digits);
const P = (x: number, y: number): Point => ({ x, y });
const end = (p: Point, clip: Rect | null = null): CurveEnd => ({ point: p, clip });
const A = end(P(0, 0));
const B = end(P(100, 0));
const sameBox = (a: Rect, b: Rect) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(0.01);
  expect(Math.abs(a.y - b.y)).toBeLessThan(0.01);
  expect(Math.abs(a.w - b.w)).toBeLessThan(0.01);
  expect(Math.abs(a.h - b.h)).toBeLessThan(0.01);
};
const onBoundary = (p: Point, r: Rect): boolean =>
  [
    Math.abs(p.x - r.x),
    Math.abs(p.x - r.x - r.w),
    Math.abs(p.y - r.y),
    Math.abs(p.y - r.y - r.h),
  ].some((d) => d < 1e-6);

describe('layoutCurvedArrow: shape of the shaft', () => {
  it('bend 0 is a straight line that stops at the head base', () => {
    const out = layoutCurvedArrow('full', A, B, 0, style)!;
    expect(out.svg).not.toContain('Q');
    expect(pathPoints(out.svg)).toEqual([[P(0, 0), P(91.2, 0)]]);
    const [head] = polygonPoints(out.svg) as [Point[]];
    expect(head[0]).toEqual(P(100, 0));
    near(head[1]!.x, 91.2);
    near(head[2]!.x, 91.2);
    near(Math.abs(head[1]!.y), 3.6);
    near(head[1]!.y, -head[2]!.y);
  });

  it('a positive bend bulges to the visual left of travel (up when travelling east)', () => {
    const out = layoutCurvedArrow('full', A, B, 0.3, style)!;
    const [shaft] = pathPoints(out.svg) as [Point[]];
    expect(out.svg).toContain('Q');
    expect(shaft).toHaveLength(3);
    expect(shaft[0]).toEqual(P(0, 0));
    // The control of the whole curve is (50, -30) (chord midpoint + bend x chord x left normal);
    // the shaft is its first part, so its control lies on the start tangent towards it.
    expect(shaft[1]!.y).toBeLessThan(0);
    near(shaft[1]!.y / shaft[1]!.x, -30 / 50, 2); // printed to 3 decimals
    // The apex of the whole curve is (50, -15); the ink reaches it plus half the line width.
    near(out.ink.y, -15 - 1);
  });

  it('a negative bend bulges to the right (down when travelling east)', () => {
    const out = layoutCurvedArrow('full', A, B, -0.3, style)!;
    const [shaft] = pathPoints(out.svg) as [Point[]];
    expect(shaft[1]!.y).toBeGreaterThan(0);
    near(out.ink.y + out.ink.h, 15 + 1);
  });

  it('the bend scales with the chord length', () => {
    const short = layoutCurvedArrow('full', end(P(0, 0)), end(P(50, 0)), 0.3, style)!;
    near(short.ink.y, -7.5 - 1);
  });

  it('a vertical chord bulges left of travel too (travelling south, left is east)', () => {
    const out = layoutCurvedArrow('full', end(P(0, 0)), end(P(0, 100)), 0.3, style)!;
    near(out.ink.x + out.ink.w, 15 + 1);
  });

  it('the head tip is exactly the end point and the shaft meets the head base', () => {
    for (const bend of [0, 0.3, -0.5]) {
      const out = layoutCurvedArrow('full', A, B, bend, style)!;
      const [shaft] = pathPoints(out.svg) as [Point[]];
      const [head] = polygonPoints(out.svg) as [Point[]];
      expect(head[0]).toEqual(P(100, 0));
      const stop = shaft[shaft.length - 1]!;
      near(dist(stop, head[0]!), 8.8, 2);
      // The shaft ends at the middle of the head base.
      near(stop.x, (head[1]!.x + head[2]!.x) / 2, 2);
      near(stop.y, (head[1]!.y + head[2]!.y) / 2, 2);
    }
  });

  it('the head is clamped to half the (clipped) length', () => {
    const out = layoutCurvedArrow('full', end(P(0, 0)), end(P(10, 0)), 0, style)!;
    expect(pathPoints(out.svg)).toEqual([[P(0, 0), P(5, 0)]]);
  });

  it('from = to draws nothing', () => {
    expect(layoutCurvedArrow('full', A, A, 0.3, style)).toBeNull();
    expect(layoutCurvedArrow('fishhook', A, end(P(0, 0)), 0, style)).toBeNull();
  });
});

describe('layoutCurvedArrow: heads', () => {
  it('full: a symmetric triangle', () => {
    const out = layoutCurvedArrow('full', A, B, 0.3, style)!;
    const [head] = polygonPoints(out.svg) as [Point[]];
    expect(head).toHaveLength(3);
    const mid = P((head[1]!.x + head[2]!.x) / 2, (head[1]!.y + head[2]!.y) / 2);
    near(dist(head[1]!, head[2]!), 7.2, 2);
    near(dist(mid, head[0]!), 8.8, 2);
  });

  it('fishhook: one barb only, on the side away from the bulge', () => {
    const up = layoutCurvedArrow('fishhook', A, B, 0.3, style)!; // bulges up: barb below
    const down = layoutCurvedArrow('fishhook', A, B, -0.3, style)!; // bulges down: barb above
    for (const [out, side] of [
      [up, 1],
      [down, -1],
    ] as const) {
      const [head] = polygonPoints(out.svg) as [Point[]];
      expect(head).toHaveLength(3);
      const [tip, base, barb] = head as [Point, Point, Point];
      expect(tip).toEqual(P(100, 0));
      near(dist(base, barb), 3.6, 2);
      expect(Math.sign(barb.y - base.y)).toBe(side);
      // The base point is the end of the shaft.
      const [shaft] = pathPoints(out.svg) as [Point[]];
      const stop = shaft[shaft.length - 1]!;
      near(stop.x, base.x, 2);
      near(stop.y, base.y, 2);
    }
  });

  it('fishhook with bend 0: the barb is on the right of travel', () => {
    const [head] = polygonPoints(layoutCurvedArrow('fishhook', A, B, 0, style)!.svg) as [Point[]];
    near(head[2]!.y, 3.6); // travelling east, right is south (y down)
    near(head[2]!.x, 91.2);
  });

  it('fishhook ink: the half head only', () => {
    const full = layoutCurvedArrow('full', A, B, 0, style)!;
    const hook = layoutCurvedArrow('fishhook', A, B, 0, style)!;
    expect(hook.ink.h).toBeLessThan(full.ink.h);
  });
});

describe('clipRange', () => {
  const line = (t: number): Point => P(100 * t, 0);
  const box = (x: number): Rect => ({ x, y: -10, w: 20, h: 20 });

  it('no boxes: the whole curve', () => {
    expect(clipRange(line, null, null)).toEqual([0, 1]);
  });

  it('cuts the start out of a box centred on it and the end out of one centred on it', () => {
    const [t0, t1] = clipRange(line, box(-10), box(90))!;
    near(t0, 0.1, 6);
    near(t1, 0.9, 6);
  });

  it('either box alone', () => {
    near(clipRange(line, box(-10), null)![0], 0.1, 6);
    near(clipRange(line, null, box(90))![1], 0.9, 6);
  });

  it('a box that does not contain its end changes nothing', () => {
    expect(clipRange(line, box(500), box(500))).toEqual([0, 1]);
  });

  it('nothing is left when the other end is inside the same box', () => {
    expect(clipRange((t) => P(5 * t, 0), box(-10), box(-10))).toBeNull();
    expect(clipRange(line, { x: -10, y: -10, w: 200, h: 20 }, null)).toBeNull();
  });

  it('nothing is left when the two boxes meet', () => {
    expect(
      clipRange(line, { x: -10, y: -10, w: 70, h: 20 }, { x: 40, y: -10, w: 70, h: 20 }),
    ).toBeNull();
  });
});

describe('layoutCurvedArrow: clipping out of label boxes', () => {
  const left: Rect = { x: -10, y: -10, w: 20, h: 20 };
  const right: Rect = { x: 90, y: -10, w: 20, h: 20 };

  it('a straight arrow starts on the edge of the start box and its tip is on the end box', () => {
    const out = layoutCurvedArrow('full', end(P(0, 0), left), end(P(100, 0), right), 0, style)!;
    const [shaft] = pathPoints(out.svg) as [Point[]];
    const [head] = polygonPoints(out.svg) as [Point[]];
    near(shaft[0]!.x, 10, 4);
    near(head[0]!.x, 90, 4);
    // The head is clamped against the clipped length (80), so it keeps its full length.
    near(dist(shaft[shaft.length - 1]!, head[0]!), 8.8, 2);
  });

  it('a curved arrow ends exactly on the boundary of the box', () => {
    const box: Rect = { x: 80, y: -20, w: 40, h: 40 };
    const out = layoutCurvedArrow('full', A, end(P(100, 0), box), 0.4, style)!;
    const [head] = polygonPoints(out.svg) as [Point[]];
    expect(onBoundary(head[0]!, box)).toBe(true);
    const startBox: Rect = { x: -20, y: -20, w: 40, h: 40 };
    const both = layoutCurvedArrow(
      'full',
      end(P(0, 0), startBox),
      end(P(100, 0), box),
      0.4,
      style,
    )!;
    const [first] = pathPoints(both.svg) as [Point[]];
    expect(onBoundary(first[0]!, startBox)).toBe(true);
  });

  it('the clipped curve is a piece of the original: it stays on it', () => {
    const full = layoutCurvedArrow('full', A, B, 0.4, style)!;
    const cut = layoutCurvedArrow('full', end(P(0, 0), left), end(P(100, 0), right), 0.4, style)!;
    // The apex of the unclipped curve (50, -20) is kept by the cut curve.
    near(full.ink.y, -20 - 1);
    near(cut.ink.y, -20 - 1);
  });

  it('nothing is drawn when the clip leaves no length', () => {
    const big: Rect = { x: -50, y: -50, w: 300, h: 100 };
    expect(
      layoutCurvedArrow('full', end(P(0, 0), big), end(P(100, 0), big), 0.3, style),
    ).toBeNull();
  });
});

describe('layoutCurvedArrow: ink', () => {
  it.each([
    ['full, straight', 'full', 0],
    ['full, left bend', 'full', 0.4],
    ['full, right bend', 'full', -0.4],
    ['fishhook, left bend', 'fishhook', 0.4],
    ['fishhook, right bend', 'fishhook', -0.4],
  ] as const)('%s: ink equals an independent scan of the markup', (_name, head, bend) => {
    const out = layoutCurvedArrow(head, end(P(10, 20)), end(P(90, 70)), bend, style)!;
    sameBox(out.ink, inkScan(out.svg)!);
  });

  it('a clipped arrow too', () => {
    const out = layoutCurvedArrow(
      'full',
      end(P(0, 0), { x: -10, y: -10, w: 20, h: 20 }),
      end(P(100, 40), { x: 85, y: 25, w: 30, h: 30 }),
      0.3,
      style,
    )!;
    sameBox(out.ink, inkScan(out.svg)!);
  });
});
