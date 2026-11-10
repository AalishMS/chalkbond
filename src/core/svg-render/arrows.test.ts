import { describe, expect, it } from 'vitest';
import type { ArrowKind, Point } from '../doc-model';
import { inkScan } from './__fixtures__/ink-scan';
import { pathPoints, polygonPoints } from './__fixtures__/markup';
import { layoutArrow, layoutPlus } from './arrows';
import { resolveStyle } from './style';

// slides, bond length 40: head 8.8 x 3.6 half-width, equilibrium gap 4.8, no-go half 4.8, line 2.
const style = resolveStyle({ preset: 'slides', overrides: {} });
const near = (actual: number, expected: number, digits = 2) =>
  expect(actual).toBeCloseTo(expected, digits);
const P = (x: number, y: number): Point => ({ x, y });
const KINDS: ArrowKind[] = ['forward', 'equilibrium', 'retro', 'resonance', 'no-go'];
const sorted = (pts: Point[]) => pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).sort();

const draw = (kind: ArrowKind, from = P(0, 0), to = P(100, 0)) =>
  layoutArrow(kind, from, to, style)!;

describe('layoutArrow: forward', () => {
  it('a shaft to the head base and a solid triangular head at the tip', () => {
    const out = draw('forward');
    expect(pathPoints(out.svg)).toEqual([[P(0, 0), P(91.2, 0)]]);
    const [head] = polygonPoints(out.svg);
    expect(sorted(head!)).toEqual(sorted([P(100, 0), P(91.2, -3.6), P(91.2, 3.6)]));
    expect(out.svg).toContain('stroke-width="2"');
  });

  it('the ink box is the shaft grown by half the line width, plus the head', () => {
    const out = draw('forward');
    near(out.ink.x, -1);
    near(out.ink.w, 101);
    near(out.ink.y, -3.6);
    near(out.ink.h, 7.2);
  });

  it('points along the stated direction (right to left, and diagonal)', () => {
    const [head] = polygonPoints(draw('forward', P(100, 0), P(0, 0)).svg);
    expect(head!.some((p) => p.x === 0 && p.y === 0)).toBe(true);
    const [dh] = polygonPoints(draw('forward', P(0, 0), P(30, 40)).svg);
    expect(dh!.some((p) => Math.abs(p.x - 30) < 1e-6 && Math.abs(p.y - 40) < 1e-6)).toBe(true);
  });

  it('clamps the head to half the length', () => {
    const out = draw('forward', P(0, 0), P(10, 0));
    expect(pathPoints(out.svg)).toEqual([[P(0, 0), P(5, 0)]]);
    const [head] = polygonPoints(out.svg);
    expect(sorted(head!)).toEqual(sorted([P(10, 0), P(5, -3.6), P(5, 3.6)]));
  });
});

describe('layoutArrow: equilibrium', () => {
  const out = draw('equilibrium');
  const paths = pathPoints(out.svg);
  const heads = polygonPoints(out.svg);

  it('two parallel shafts equilibriumGap apart', () => {
    expect(paths).toHaveLength(2);
    near(Math.abs(paths[0]![0]!.y - paths[1]![0]!.y), 4.8);
  });

  it('the harpoon on the left of travel points to `to`, barb on the outer (left) side', () => {
    // Travelling east, the visual left is up (negative y).
    const left = paths.find((p) => p[0]!.y < 0)!;
    near(left[0]!.x, 0);
    near(left[1]!.x, 91.2);
    const head = heads.find((h) => h.some((p) => p.x === 100))!;
    expect(sorted(head)).toEqual(sorted([P(100, -2.4), P(91.2, -2.4), P(91.2, -6)]));
  });

  it('the other harpoon points to `from`, barb on its outer (right) side', () => {
    const right = paths.find((p) => p[0]!.y > 0)!;
    near(right[0]!.x, 100);
    near(right[1]!.x, 8.8);
    const head = heads.find((h) => h.some((p) => p.x === 0))!;
    expect(sorted(head)).toEqual(sorted([P(0, 2.4), P(8.8, 2.4), P(8.8, 6)]));
  });
});

describe('layoutArrow: retro', () => {
  const out = draw('retro');

  it('two lines gap apart ending on an open chevron at `to`', () => {
    const paths = pathPoints(out.svg);
    const lines = paths.filter((p) => p.length === 2);
    const chevron = paths.find((p) => p.length === 3)!;
    expect(lines).toHaveLength(2);
    near(Math.abs(lines[0]![0]!.y - lines[1]![0]!.y), 4.8);
    expect(chevron).toEqual([P(91.2, -3.6), P(100, 0), P(91.2, 3.6)]);
    expect(polygonPoints(out.svg)).toEqual([]);
  });

  it('the lines end where they meet the chevron arms', () => {
    const lines = pathPoints(out.svg).filter((p) => p.length === 2);
    for (const l of lines) near(l[1]!.x, 91.2 + 8.8 / 3, 2);
  });
});

describe('layoutArrow: resonance', () => {
  it('one shaft with a solid head at each end', () => {
    const out = draw('resonance');
    expect(pathPoints(out.svg)).toEqual([[P(8.8, 0), P(91.2, 0)]]);
    const heads = polygonPoints(out.svg);
    expect(heads).toHaveLength(2);
    expect(heads.some((h) => h.some((p) => p.x === 100))).toBe(true);
    expect(heads.some((h) => h.some((p) => p.x === 0))).toBe(true);
  });

  it('clamps each head to a quarter of the length', () => {
    const out = draw('resonance', P(0, 0), P(20, 0));
    expect(pathPoints(out.svg)).toEqual([[P(5, 0), P(15, 0)]]);
  });
});

describe('layoutArrow: no-go', () => {
  it('a forward arrow plus a cross of half-size noGoHalf at the shaft midpoint', () => {
    const out = draw('no-go');
    const paths = pathPoints(out.svg);
    expect(paths).toHaveLength(3);
    for (const [p, q] of paths.slice(1) as [Point, Point][]) {
      near((p.x + q.x) / 2, 50);
      near((p.y + q.y) / 2, 0);
      near(Math.sqrt((p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y)), 9.6);
      near(Math.abs(p.x - q.x), Math.abs(p.y - q.y));
    }
    expect(polygonPoints(out.svg)).toHaveLength(1);
  });
});

describe('layoutArrow: all kinds', () => {
  it.each(KINDS)('%s: zero length draws nothing', (kind) => {
    expect(layoutArrow(kind, P(5, 5), P(5, 5), style)).toBeNull();
  });

  it.each(KINDS)('%s: the ink box equals an independent scan', (kind) => {
    for (const [from, to] of [
      [P(0, 0), P(100, 0)],
      [P(10, 80), P(70, 20)],
      [P(0, 0), P(12, 0)],
    ] as [Point, Point][]) {
      const out = layoutArrow(kind, from, to, style)!;
      const scan = inkScan(out.svg)!;
      expect(Math.abs(out.ink.x - scan.x)).toBeLessThan(0.01);
      expect(Math.abs(out.ink.y - scan.y)).toBeLessThan(0.01);
      expect(Math.abs(out.ink.w - scan.w)).toBeLessThan(0.01);
      expect(Math.abs(out.ink.h - scan.h)).toBeLessThan(0.01);
    }
  });

  it.each(KINDS)('%s: is deterministic', (kind) => {
    expect(draw(kind, P(1, 2), P(77, 31)).svg).toBe(draw(kind, P(1, 2), P(77, 31)).svg);
  });
});

describe('layoutPlus', () => {
  it('two lines crossing at the point, arm plusArm', () => {
    const out = layoutPlus(P(50, 20), style);
    expect(pathPoints(out.svg)).toEqual([[P(44, 20), P(56, 20), P(50, 14), P(50, 26)]]);
  });

  it('the ink box is the arms grown by half the line width, and matches the scan', () => {
    const out = layoutPlus(P(50, 20), style);
    near(out.ink.x, 43);
    near(out.ink.y, 13);
    near(out.ink.w, 14);
    near(out.ink.h, 14);
    const scan = inkScan(out.svg)!;
    near(scan.x, out.ink.x);
    near(scan.w, out.ink.w);
  });
});
