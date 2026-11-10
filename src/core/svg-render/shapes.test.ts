import type { Color } from '../doc-model';
import { describe, expect, it } from 'vitest';
import { inkScan } from './__fixtures__/ink-scan';
import { layoutShape, type ShapePaint } from './shapes';
import { resolveStyle } from './style';

const style = resolveStyle({ preset: 'slides', overrides: {} });
const near = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 3);
const R = { x: 10, y: 20, w: 100, h: 60 };

describe('layoutShape', () => {
  it('a rect with fill and stroke', () => {
    const out = layoutShape(
      'rect',
      R,
      { fill: '#ffee00', stroke: '#112233', fillOpacity: 0.4 },
      style,
    )!;
    expect(out.svg).toBe(
      '<rect x="10" y="20" width="100" height="60" fill="#ffee00" fill-opacity="0.4" stroke="#112233" stroke-width="2"/>',
    );
  });

  it('an ellipse with fill and stroke', () => {
    const out = layoutShape(
      'ellipse',
      R,
      { fill: '#ffee00', stroke: '#112233', fillOpacity: 1 },
      style,
    )!;
    expect(out.svg).toBe(
      '<ellipse cx="60" cy="50" rx="50" ry="30" fill="#ffee00" fill-opacity="1" stroke="#112233" stroke-width="2"/>',
    );
  });

  it('fill only: no outline', () => {
    const out = layoutShape('rect', R, { fill: '#ffee00', fillOpacity: 0.25 }, style)!;
    expect(out.svg).toContain('stroke="none"');
    expect(out.svg).not.toContain('stroke-width');
    expect(out.svg).toContain('fill-opacity="0.25"');
  });

  it('stroke only: no fill', () => {
    const out = layoutShape('ellipse', R, { stroke: '#112233', fillOpacity: 0.5 }, style)!;
    expect(out.svg).toContain('fill="none"');
    expect(out.svg).not.toContain('fill-opacity');
    expect(out.svg).toContain('stroke="#112233"');
  });

  it('neither fill nor stroke draws nothing', () => {
    expect(layoutShape('rect', R, { fillOpacity: 1 }, style)).toBeNull();
    expect(layoutShape('ellipse', R, { fillOpacity: 1 }, style)).toBeNull();
  });

  it('clamps the fill opacity to 0..1 and ignores a non-finite one', () => {
    expect(layoutShape('rect', R, { fill: '#000000', fillOpacity: 7 }, style)!.svg).toContain(
      'fill-opacity="1"',
    );
    expect(layoutShape('rect', R, { fill: '#000000', fillOpacity: -3 }, style)!.svg).toContain(
      'fill-opacity="0"',
    );
    expect(
      layoutShape('rect', R, { fill: '#000000', fillOpacity: Number.NaN }, style)!.svg,
    ).toContain('fill-opacity="1"');
  });

  it('an invalid colour falls back to ink', () => {
    expect(
      layoutShape('rect', R, { fill: 'red' as unknown as Color, fillOpacity: 1 }, style)!.svg,
    ).toContain('fill="#000000"');
  });

  it('a negative size is normalised', () => {
    const out = layoutShape(
      'rect',
      { x: 110, y: 80, w: -100, h: -60 },
      { fill: '#000000', fillOpacity: 1 },
      style,
    )!;
    expect(out.svg).toContain('x="10" y="20" width="100" height="60"');
  });

  it('ink: the box grown by half the stroke when stroked, exact when fill only', () => {
    const both = layoutShape(
      'rect',
      R,
      { fill: '#000000', stroke: '#000000', fillOpacity: 1 },
      style,
    )!;
    expect(both.ink).toEqual({ x: 9, y: 19, w: 102, h: 62 });
    const fillOnly = layoutShape('ellipse', R, { fill: '#000000', fillOpacity: 1 }, style)!;
    expect(fillOnly.ink).toEqual(R);
  });

  it.each(['rect', 'ellipse'] as const)('%s: ink equals an independent scan', (shape) => {
    for (const paint of [
      { fill: '#000000', fillOpacity: 1 },
      { stroke: '#000000', fillOpacity: 1 },
      { fill: '#000000', stroke: '#000000', fillOpacity: 0.5 },
    ] satisfies ShapePaint[]) {
      const out = layoutShape(shape, R, paint, style)!;
      const scan = inkScan(out.svg)!;
      near(out.ink.x, scan.x);
      near(out.ink.y, scan.y);
      near(out.ink.w, scan.w);
      near(out.ink.h, scan.h);
    }
  });
});
