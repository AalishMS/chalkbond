import { describe, expect, it } from 'vitest';
import { textElements } from './__fixtures__/markup';
import { inkScan } from './__fixtures__/ink-scan';
import { ADVANCE_REGULAR } from './font-metrics';
import { resolveStyle } from './style';
import { placeRuns } from './text-run';

const style = resolveStyle({ preset: 'slides', overrides: { fontSize: 100 } });
const near = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 3);

describe('placeRuns', () => {
  it('an empty run list draws nothing', () => {
    expect(placeRuns([], style, { x: 0, y: 0 })).toBeNull();
    expect(placeRuns([{ text: '' }], style, { x: 0, y: 0 })).toBeNull();
  });

  it('places one run with its left edge and baseline at the origin', () => {
    const out = placeRuns([{ text: 'n' }], style, { x: 10, y: 50 })!;
    const [t] = textElements(out.svg);
    near(t!.x, 10);
    near(t!.y, 50);
    near(out.box.x, 10);
    near(out.box.w, ADVANCE_REGULAR[0x6e]! / 10);
    near(out.box.y, 50 - 71.6);
    near(out.box.h, 71.6);
    expect(t!.fill).toBe('#000000');
  });

  it('runs follow each other; sub and sup are smaller and shifted', () => {
    const out = placeRuns(
      [{ text: 'H' }, { text: '2', script: 'sub' }, { text: '+', script: 'sup' }],
      style,
      { x: 0, y: 0 },
    )!;
    const [h, two, plus] = textElements(out.svg) as [
      ReturnType<typeof textElements>[number],
      ReturnType<typeof textElements>[number],
      ReturnType<typeof textElements>[number],
    ];
    near(two.x, ADVANCE_REGULAR[0x48]! / 10);
    expect(two.size).toBeCloseTo(70, 6);
    near(two.y, style.subShift);
    near(plus.y, -style.supShift);
    expect(h.y).toBe(0);
    // The box covers the superscript.
    near(out.box.y, -style.supShift - 0.7 * 71.6);
  });

  it('run colour, bold and italic reach the markup; the default colour is ink', () => {
    const out = placeRuns(
      [
        { text: 'a', color: '#ff0000', bold: true },
        { text: 'b', italic: true },
      ],
      style,
      { x: 0, y: 0 },
    )!;
    const [a, b] = textElements(out.svg) as [
      ReturnType<typeof textElements>[number],
      ReturnType<typeof textElements>[number],
    ];
    expect(a.fill).toBe('#ff0000');
    expect(a.weight).toBe('bold');
    expect(b.fill).toBe('#000000');
    expect(b.style).toBe('italic');
  });

  it('empty runs in the middle do not shift colours onto the wrong run', () => {
    const out = placeRuns(
      [{ text: 'a', color: '#ff0000' }, { text: '' }, { text: 'b', color: '#00ff00' }],
      style,
      { x: 0, y: 0 },
    )!;
    expect(textElements(out.svg).map((t) => t.fill)).toEqual(['#ff0000', '#00ff00']);
  });

  it('line breaks become spaces (single line)', () => {
    const out = placeRuns([{ text: 'a\nb' }], style, { x: 0, y: 0 })!;
    expect(
      textElements(out.svg)
        .map((t) => t.text)
        .join(''),
    ).toBe('a b');
  });

  it('the ink box equals an independent scan of the markup and contains the text box', () => {
    const out = placeRuns([{ text: 'Hg' }, { text: '2', script: 'sub' }], style, { x: 3, y: 9 })!;
    const scan = inkScan(out.svg)!;
    near(out.ink.x, scan.x);
    near(out.ink.y, scan.y);
    near(out.ink.w, scan.w);
    near(out.ink.h, scan.h);
    expect(out.box.y).toBeGreaterThanOrEqual(out.ink.y - 1e-9);
    expect(out.box.y + out.box.h).toBeLessThanOrEqual(out.ink.y + out.ink.h + 1e-9);
  });

  it('reports unmeasured glyphs', () => {
    const out = placeRuns([{ text: '中' }], style, { x: 0, y: 0 })!;
    expect(out.notices).toEqual([{ code: 'unmeasured-glyph', chars: '中' }]);
  });
});
