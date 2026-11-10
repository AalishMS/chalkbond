import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  add,
  angleDeg,
  cross,
  distance,
  cubicAt,
  distToCubic,
  distToSegment,
  dot,
  growRect,
  length,
  lerp,
  normalize,
  rectCenter,
  rectContains,
  rectFromPoints,
  rectInside,
  rectIntersects,
  rectUnion,
  rotate,
  scale,
  snapAngle,
  sub,
} from './geometry';

const close = (a: number, b: number, digits = 9): void => {
  expect(a).toBeCloseTo(b, digits);
};

describe('vectors', () => {
  it('add, sub, scale, dot, cross, length, distance', () => {
    expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    expect(sub({ x: 3, y: 4 }, { x: 1, y: 2 })).toEqual({ x: 2, y: 2 });
    expect(scale({ x: 1, y: -2 }, 3)).toEqual({ x: 3, y: -6 });
    expect(dot({ x: 1, y: 2 }, { x: 3, y: 4 })).toBe(11);
    expect(cross({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(1);
    expect(length({ x: 3, y: 4 })).toBe(5);
    expect(distance({ x: 1, y: 1 }, { x: 4, y: 5 })).toBe(5);
  });

  it('normalize gives a unit vector and leaves the zero vector alone', () => {
    const n = normalize({ x: 0, y: -8 });
    expect(n).toEqual({ x: 0, y: -1 });
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('lerp and rotate (y down, positive angle clockwise on screen)', () => {
    expect(lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.25)).toEqual({ x: 2.5, y: 5 });
    const r = rotate({ x: 1, y: 0 }, 90);
    close(r.x, 0);
    close(r.y, 1);
    const about = rotate({ x: 3, y: 1 }, 180, { x: 2, y: 1 });
    close(about.x, 1);
    close(about.y, 1);
  });
});

describe('angles', () => {
  it('angleDeg is measured from +x with y down', () => {
    expect(angleDeg({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(0);
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: 1 })).toBe(90);
    expect(angleDeg({ x: 0, y: 0 }, { x: -1, y: 0 })).toBe(180);
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: -1 })).toBe(-90);
  });

  it('snapAngle keeps the distance and lands on a multiple of the step', () => {
    const from = { x: 1, y: 1 };
    const to = { x: 1 + 4, y: 1 + 0.9 }; // about 12.7 degrees
    const s = snapAngle(from, to, 15);
    close(distance(from, s), distance(from, to));
    close(angleDeg(from, s), 15);
  });

  it('snaps to the nearest multiple: 7 degrees to 0, 8 degrees to 15 (step 15)', () => {
    const from = { x: 0, y: 0 };
    const at = (deg: number): { x: number; y: number } => rotate({ x: 10, y: 0 }, deg, from);
    close(angleDeg(from, snapAngle(from, at(7), 15)), 0);
    close(angleDeg(from, snapAngle(from, at(8), 15)), 15);
    close(angleDeg(from, snapAngle(from, at(-98), 30)), -90);
  });

  it('a zero-length drag stays put', () => {
    expect(snapAngle({ x: 2, y: 2 }, { x: 2, y: 2 }, 15)).toEqual({ x: 2, y: 2 });
  });

  it('snapped angles are multiples of the step (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: 50, noNaN: true }),
        fc.double({ min: -50, max: 50, noNaN: true }),
        fc.constantFrom(5, 15, 30, 45),
        (x, y, step) => {
          fc.pre(Math.hypot(x, y) > 1e-3);
          const s = snapAngle({ x: 0, y: 0 }, { x, y }, step);
          const a = angleDeg({ x: 0, y: 0 }, s) / step;
          expect(Math.abs(a - Math.round(a))).toBeLessThan(1e-6);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('distance to a segment', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };
  it('perpendicular foot inside the segment', () => {
    expect(distToSegment({ x: 4, y: 3 }, a, b)).toBe(3);
  });
  it('beyond either end the distance is to the end point', () => {
    expect(distToSegment({ x: -3, y: 4 }, a, b)).toBe(5);
    expect(distToSegment({ x: 13, y: 4 }, a, b)).toBe(5);
  });
  it('a degenerate segment is a point', () => {
    expect(distToSegment({ x: 3, y: 4 }, a, a)).toBe(5);
  });
});

describe('cubic curves', () => {
  // The degree-raised quadratic 0,0 / 5,10 / 10,0: its midpoint is (5, 5).
  const p0 = { x: 0, y: 0 };
  const c1 = { x: 10 / 3, y: 20 / 3 };
  const c2 = { x: 20 / 3, y: 20 / 3 };
  const p1 = { x: 10, y: 0 };

  it('cubicAt hits the end points and the midpoint formula', () => {
    expect(cubicAt(p0, c1, c2, p1, 0)).toEqual(p0);
    expect(cubicAt(p0, c1, c2, p1, 1)).toEqual(p1);
    const mid = cubicAt(p0, c1, c2, p1, 0.5);
    close(mid.x, 5, 9);
    close(mid.y, 5, 9);
  });

  it('distToCubic is 0 on the curve and small near it', () => {
    close(distToCubic({ x: 5, y: 5 }, p0, c1, c2, p1), 0, 6);
    expect(distToCubic({ x: 5, y: 7 }, p0, c1, c2, p1)).toBeCloseTo(2, 1);
  });

  it('straight handles degenerate to a segment', () => {
    close(distToCubic({ x: 5, y: 3 }, p0, { x: 3, y: 0 }, { x: 7, y: 0 }, p1), 3);
  });

  it('is never larger than the distance to the 32 sample points', () => {
    const d = distToCubic({ x: 2, y: 8 }, p0, c1, c2, p1);
    for (let i = 0; i <= 32; i++) {
      expect(d).toBeLessThanOrEqual(
        distance({ x: 2, y: 8 }, cubicAt(p0, c1, c2, p1, i / 32)) + 1e-9,
      );
    }
  });

  it('follows a U-shaped arc (handles square to the chord) round its far side', () => {
    // A short chord with long handles: the far side is 7.5 off the chord, near (5, 7.5).
    const u1 = { x: 0, y: 10 };
    const u2 = { x: 10, y: 10 };
    close(distToCubic({ x: 5, y: 7.5 }, p0, u1, u2, p1), 0, 6);
  });
});

describe('rectangles', () => {
  const r = { x: 0, y: 0, w: 10, h: 20 };

  it('rectContains is inclusive', () => {
    expect(rectContains(r, { x: 0, y: 0 })).toBe(true);
    expect(rectContains(r, { x: 10, y: 20 })).toBe(true);
    expect(rectContains(r, { x: 10.1, y: 5 })).toBe(false);
  });

  it('rectInside needs the whole inner rect inside', () => {
    expect(rectInside({ x: 1, y: 1, w: 2, h: 2 }, r)).toBe(true);
    expect(rectInside({ x: 9, y: 1, w: 2, h: 2 }, r)).toBe(false);
    expect(rectInside(r, r)).toBe(true);
  });

  it('rectIntersects: overlap yes, touching edge yes, apart no', () => {
    expect(rectIntersects(r, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectIntersects(r, { x: 10, y: 0, w: 5, h: 5 })).toBe(true);
    expect(rectIntersects(r, { x: 11, y: 0, w: 5, h: 5 })).toBe(false);
    expect(rectIntersects(r, { x: 0, y: 21, w: 5, h: 5 })).toBe(false);
  });

  it('rectUnion, growRect, rectCenter', () => {
    expect(rectUnion(r, { x: -5, y: 10, w: 3, h: 30 })).toEqual({ x: -5, y: 0, w: 15, h: 40 });
    expect(growRect(r, 3)).toEqual({ x: -3, y: -3, w: 16, h: 26 });
    expect(rectCenter(r)).toEqual({ x: 5, y: 10 });
  });

  it('rectFromPoints normalises a marquee dragged in any direction', () => {
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 4, y: 2 })).toEqual({ x: 4, y: 2, w: 6, h: 18 });
    expect(rectFromPoints({ x: 1, y: 1 }, { x: 3, y: 5 })).toEqual({ x: 1, y: 1, w: 2, h: 4 });
  });
});
