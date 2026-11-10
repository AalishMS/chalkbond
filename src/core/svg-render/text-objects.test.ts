import { describe, expect, it } from 'vitest';
import type { Point, Rect, TextRun } from '../doc-model';
import { inkScan } from './__fixtures__/ink-scan';
import { pathPoints, textElements } from './__fixtures__/markup';
import { ADVANCE_REGULAR } from './font-metrics';
import { resolveStyle } from './style';
import { layoutCallout, layoutCaption, layoutTextObject } from './text-objects';

// slides: font 28 (cap 20.048, line height 33.6), captionGap 20, calloutPad 5.6, line 2.
const style = resolveStyle({ preset: 'slides', overrides: {} });
const near = (actual: number, expected: number, digits = 3) =>
  expect(actual).toBeCloseTo(expected, digits);
const P = (x: number, y: number): Point => ({ x, y });
const adv = (s: string): number =>
  [...s].reduce((sum, ch) => sum + ADVANCE_REGULAR[ch.codePointAt(0) ?? 0]! / 1000, 0) * 28;
const sameBox = (a: Rect, b: Rect) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(0.01);
  expect(Math.abs(a.y - b.y)).toBeLessThan(0.01);
  expect(Math.abs(a.w - b.w)).toBeLessThan(0.01);
  expect(Math.abs(a.h - b.h)).toBeLessThan(0.01);
};

describe('layoutTextObject', () => {
  it('draws the runs at `at` with the given alignment', () => {
    const out = layoutTextObject([{ text: 'PCC' }], 'center', P(100, 50), style)!;
    const [t] = textElements(out.svg);
    near(t!.x, 100 - adv('PCC') / 2);
    near(t!.y, 50 + style.capHeight / 2);
    sameBox(out.ink, inkScan(out.svg)!);
  });

  it('nothing to draw gives null', () => {
    expect(layoutTextObject([], 'left', P(0, 0), style)).toBeNull();
  });

  it('carries the unmeasured-glyph notices', () => {
    expect(layoutTextObject([{ text: '中' }], 'left', P(0, 0), style)!.notices).toEqual([
      { code: 'unmeasured-glyph', chars: '中' },
    ]);
  });
});

describe('layoutCaption', () => {
  const target: Rect = { x: 100, y: 0, w: 80, h: 50 };

  it('is centred on the target box, its top edge captionGap below it', () => {
    const out = layoutCaption([{ text: 'W', bold: true }], target, style)!;
    const [t] = textElements(out.svg);
    near(out.ink.x + out.ink.w / 2, 140);
    near(out.ink.y, 50 + 20);
    near(t!.y, 50 + 20 + style.capHeight);
  });

  it('a superscript first pushes the baseline down so the top edge stays put', () => {
    const out = layoutCaption([{ text: '1' }, { text: '+', script: 'sup' }], target, style)!;
    near(out.ink.y, 70);
  });

  it('several lines: every line is centred on the target; the block hangs below', () => {
    const out = layoutCaption([{ text: 'W\nWWW' }], target, style)!;
    const [a, b] = textElements(out.svg) as [
      ReturnType<typeof textElements>[number],
      ReturnType<typeof textElements>[number],
    ];
    near(a.x, 140 - adv('W') / 2);
    near(b.x, 140 - adv('WWW') / 2);
    near(b.y - a.y, style.lineHeight);
    near(out.ink.y, 70);
  });

  it('nothing to draw gives null', () => {
    expect(layoutCaption([{ text: '' }], target, style)).toBeNull();
  });

  it('ink equals an independent scan', () => {
    const runs: TextRun[] = [{ text: 'Hg' }, { text: '2', script: 'sub' }];
    const out = layoutCaption(runs, target, style)!;
    sameBox(out.ink, inkScan(out.svg)!);
  });
});

describe('layoutCallout', () => {
  const at = P(100, 100);
  const runs: TextRun[] = [{ text: 'nucleophile', italic: true }];
  const text = (out: { svg: string }) => textElements(out.svg);

  it('the text is centred on `at`', () => {
    const out = layoutCallout(runs, at, { point: P(400, 100), clip: null }, style)!;
    const [t] = text(out);
    near(t!.x, 100 - adv('nucleophile') / 2);
    // The text box (cap height above the baseline, descender below) is centred vertically.
    const top = t!.y - style.capHeight;
    const bottom = t!.y + 0.212 * 28; // 'p' descends
    near((top + bottom) / 2, 100);
  });

  it('a leader line goes from the nearest point of the grown text box to the anchor', () => {
    const out = layoutCallout(runs, at, { point: P(400, 100), clip: null }, style)!;
    const [leader] = pathPoints(out.svg) as [Point[]];
    const [t] = text(out);
    const right = t!.x + adv('nucleophile');
    near(leader![0]!.x, right + 5.6);
    near(leader![0]!.y, 100);
    expect(leader![1]).toEqual(P(400, 100));
  });

  it('the leader leaves a corner of the box for a diagonal anchor', () => {
    const out = layoutCallout(runs, at, { point: P(400, 300), clip: null }, style)!;
    const [leader] = pathPoints(out.svg) as [Point[]];
    const [t] = text(out);
    near(leader![0]!.x, t!.x + adv('nucleophile') + 5.6);
    near(leader![0]!.y, 100 + (t!.y + 0.212 * 28 - (t!.y - style.capHeight)) / 2 + 5.6);
  });

  it('a leader is clipped out of the anchor atom label box', () => {
    const clip: Rect = { x: 380, y: 80, w: 40, h: 40 };
    const out = layoutCallout(runs, at, { point: P(400, 100), clip }, style)!;
    const [leader] = pathPoints(out.svg) as [Point[]];
    near(leader![1]!.x, 380, 4);
    near(leader![1]!.y, 100, 4);
  });

  it('is a stroked line with the style width and no head', () => {
    const out = layoutCallout(runs, at, { point: P(400, 100), clip: null }, style)!;
    expect(out.svg).toMatch(/<path d="[^"]+" stroke="#000000" stroke-width="2"\/>/);
    expect(out.svg).not.toContain('<polygon');
  });

  it('an anchor inside the grown box draws the text only', () => {
    const out = layoutCallout(runs, at, { point: P(100, 100), clip: null }, style)!;
    expect(out.svg).not.toContain('<path');
    expect(text(out)).toHaveLength(1);
  });

  it('a leader that the clip leaves no length is dropped, the text stays', () => {
    const clip: Rect = { x: 90, y: 80, w: 400, h: 40 }; // holds both ends of the leader
    const out = layoutCallout(runs, at, { point: P(200, 100), clip }, style)!;
    expect(out.svg).not.toContain('<path');
  });

  it('ink covers the text and the leader, and equals an independent scan', () => {
    const out = layoutCallout(runs, at, { point: P(400, 300), clip: null }, style)!;
    sameBox(out.ink, inkScan(out.svg)!);
    expect(out.ink.x + out.ink.w).toBeGreaterThan(400);
    expect(out.ink.y + out.ink.h).toBeGreaterThan(300);
  });

  it('nothing to draw gives null (no text, no leader)', () => {
    expect(layoutCallout([{ text: '' }], at, { point: P(400, 100), clip: null }, style)).toBeNull();
  });

  it('several lines are centred on `at` as a block', () => {
    const out = layoutCallout(
      [{ text: 'ab\ncdef' }],
      at,
      { point: P(400, 100), clip: null },
      style,
    )!;
    const [a, b] = text(out) as [
      ReturnType<typeof textElements>[number],
      ReturnType<typeof textElements>[number],
    ];
    near(a.x, 100 - adv('ab') / 2);
    near(b.x, 100 - adv('cdef') / 2);
    near(b.y - a.y, style.lineHeight);
  });
});
