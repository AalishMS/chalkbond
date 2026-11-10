import { describe, expect, it } from 'vitest';
import type { Point, Rect } from '../doc-model';
import { inkScan } from './__fixtures__/ink-scan';
import { pathPoints, textElements } from './__fixtures__/markup';
import { layoutBracket } from './brackets';
import { resolveStyle } from './style';

// slides: line 2, serif 8, round bulge 4.8, curly depth 8, font 28 (cap 20.048), corner gap 4.2.
const style = resolveStyle({ preset: 'slides', overrides: {} });
const near = (actual: number, expected: number, digits = 3) =>
  expect(actual).toBeCloseTo(expected, digits);
const R: Rect = { x: 100, y: 50, w: 80, h: 120 };
const P = (x: number, y: number): Point => ({ x, y });
const sameBox = (a: Rect, b: Rect) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(0.01);
  expect(Math.abs(a.y - b.y)).toBeLessThan(0.01);
  expect(Math.abs(a.w - b.w)).toBeLessThan(0.01);
  expect(Math.abs(a.h - b.h)).toBeLessThan(0.01);
};

describe('layoutBracket: square', () => {
  it('two sides with inward serifs', () => {
    const out = layoutBracket('square', R, undefined, style);
    expect(pathPoints(out.svg)).toEqual([
      [P(108, 50), P(100, 50), P(100, 170), P(108, 170)],
      [P(172, 50), P(180, 50), P(180, 170), P(172, 170)],
    ]);
  });

  it('serifs are clamped to half the width', () => {
    const out = layoutBracket('square', { x: 0, y: 0, w: 6, h: 20 }, undefined, style);
    expect(pathPoints(out.svg)[0]).toEqual([P(3, 0), P(0, 0), P(0, 20), P(3, 20)]);
  });

  it('ink: the sides grown by half the line width', () => {
    expect(layoutBracket('square', R, undefined, style).ink).toEqual({
      x: 99,
      y: 49,
      w: 82,
      h: 122,
    });
  });
});

describe('layoutBracket: round', () => {
  const out = layoutBracket('round', R, undefined, style);

  it('two quadratic arcs bulging outwards', () => {
    const [left, right] = pathPoints(out.svg) as [Point[], Point[]];
    expect(left[0]).toEqual(P(100, 50));
    expect(left[2]).toEqual(P(100, 170));
    // The control point is twice the bulge outside, so the curve peaks `roundBulge` outside.
    near(left[1]!.x, 100 - 2 * 4.8);
    near(right[1]!.x, 180 + 2 * 4.8);
    near(left[1]!.y, 110);
    expect(out.svg).toContain('Q');
  });

  it('ink reaches the exact peak of the curve plus half the line width', () => {
    near(out.ink.x, 100 - 4.8 - 1);
    near(out.ink.x + out.ink.w, 180 + 4.8 + 1);
    near(out.ink.y, 49);
    near(out.ink.h, 122);
  });
});

describe('layoutBracket: curly', () => {
  const out = layoutBracket('curly', R, undefined, style);

  it('each brace is four cubic segments with its tip curlyDepth outside', () => {
    expect(pathPoints(out.svg)).toHaveLength(2);
    expect(out.svg.match(/C/g)).toHaveLength(8);
    near(out.ink.x, 100 - 8 - 1);
    near(out.ink.x + out.ink.w, 180 + 8 + 1);
  });

  it('the tip is at mid-height', () => {
    const [left] = pathPoints(out.svg) as [Point[]];
    const tip = left.find((p) => Math.abs(p.x - (100 - 8)) < 1e-6)!;
    near(tip.y, 110);
  });

  it('a short bracket still draws (the curve radius shrinks)', () => {
    const small = layoutBracket('curly', { x: 0, y: 0, w: 10, h: 8 }, undefined, style);
    expect(pathPoints(small.svg)).toHaveLength(2);
  });
});

describe('layoutBracket: all shapes', () => {
  it.each(['square', 'round', 'curly'] as const)('%s: ink equals an independent scan', (shape) => {
    const plain = layoutBracket(shape, R, undefined, style);
    sameBox(plain.ink, inkScan(plain.svg)!);
    const withText = layoutBracket(shape, R, [{ text: 'n' }], style);
    sameBox(withText.ink, inkScan(withText.svg)!);
  });

  it('a negative size is normalised', () => {
    const a = layoutBracket('square', { x: 180, y: 170, w: -80, h: -120 }, undefined, style);
    expect(a.svg).toBe(layoutBracket('square', R, undefined, style).svg);
  });
});

describe('layoutBracket: corner runs', () => {
  it('start cornerGap right of the right bracket, baseline at the bottom edge', () => {
    const out = layoutBracket('square', R, [{ text: 'n' }], style);
    const t = textElements(out.svg)[0]!;
    // The right side's outer ink edge is 180 + 1.
    near(t.x, 181 + style.cornerGap);
    near(t.y, 170);
  });

  it('a round bracket is measured from its bulge, a curly one from its tip', () => {
    const round = textElements(layoutBracket('round', R, [{ text: 'n' }], style).svg)[0]!;
    near(round.x, 180 + style.roundBulge + 1 + style.cornerGap);
    const curly = textElements(layoutBracket('curly', R, [{ text: 'n' }], style).svg)[0]!;
    near(curly.x, 180 + style.curlyDepth + 1 + style.cornerGap);
  });

  it('a first run that is a superscript puts the top of the glyphs at the top edge', () => {
    const out = layoutBracket('square', R, [{ text: '2+', script: 'sup' }], style);
    const t = textElements(out.svg)[0]!;
    // Superscript glyphs are 0.7 of the font size; their cap top is one cap height above the baseline.
    near(t.size, 0.7 * style.fontSize);
    near(t.y - 0.7 * style.capHeight, R.y);
  });

  it('keeps run formatting and reports unmeasured glyphs', () => {
    const out = layoutBracket('square', R, [{ text: '中', bold: true, color: '#ff0000' }], style);
    expect(out.notices).toEqual([{ code: 'unmeasured-glyph', chars: '中' }]);
    expect(textElements(out.svg)[0]!.fill).toBe('#ff0000');
  });

  it('empty corner runs draw only the bracket', () => {
    expect(layoutBracket('square', R, [], style).svg).toBe(
      layoutBracket('square', R, undefined, style).svg,
    );
    expect(layoutBracket('square', R, [{ text: '' }], style).svg).toBe(
      layoutBracket('square', R, undefined, style).svg,
    );
  });

  it('the ink includes the corner text', () => {
    const plain = layoutBracket('square', R, undefined, style);
    const withText = layoutBracket('square', R, [{ text: 'n' }], style);
    expect(withText.ink.x + withText.ink.w).toBeGreaterThan(plain.ink.x + plain.ink.w);
  });
});
