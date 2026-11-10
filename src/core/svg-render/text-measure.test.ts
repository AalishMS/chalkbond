import { describe, expect, it } from 'vitest';
import type { Doc } from '../doc-model';
import { ADVANCE_BOLD, ADVANCE_REGULAR } from './font-metrics';
import { resolveStyle } from './style';
import { advanceWidth, FALLBACK_ADVANCE, measureRuns } from './text-measure';

// Font size 100 pt: every expected number below reads straight off the 1/1000 em table.
const style = resolveStyle({ preset: 'slides', overrides: { fontSize: 100 } } as Doc['style']);
const w = (s: string, table: Readonly<Record<number, number>> = ADVANCE_REGULAR) =>
  [...s].reduce((sum, ch) => sum + table[ch.codePointAt(0)!]! / 10, 0);
const near = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 9);

describe('advanceWidth', () => {
  it('looks up regular, bold and fallback widths (1/1000 em)', () => {
    expect(advanceWidth('W'.codePointAt(0)!, false)).toEqual({ width: 944, measured: true });
    expect(advanceWidth('i'.codePointAt(0)!, true)).toEqual({ width: 278, measured: true });
    expect(advanceWidth(0x995, false)).toEqual({ width: 556, measured: false });
    expect(FALLBACK_ADVANCE).toBe(556);
  });
});

describe('measureRuns: plain, bold, italic', () => {
  it('measures width, cap-height ascent and no descent without a descending glyph', () => {
    const m = measureRuns([{ text: 'Wi' }], style);
    near(m.width, 116.6);
    near(m.ascent, 71.6);
    expect(m.descent).toBe(0);
    expect(m.lines).toHaveLength(1);
    expect(m.notices).toEqual([]);
  });

  it('adds descent 0.212 em only for a descending glyph', () => {
    near(measureRuns([{ text: 'g' }], style).descent, 21.2);
    for (const ch of ['g', 'j', 'p', 'q', 'y', 'Q', ',', ';', '(', ')', '[', ']', '{', '}', '|']) {
      near(measureRuns([{ text: `A${ch}` }], style).descent, 21.2);
    }
    for (const ch of ['A', 'x', 'i', '0', '.', '-', '+']) {
      expect(measureRuns([{ text: `A${ch}` }], style).descent).toBe(0);
    }
  });

  it('uses the bold table for bold runs, the regular one for italic, bold for bold italic', () => {
    near(measureRuns([{ text: 'i', bold: true }], style).width, 27.8);
    near(measureRuns([{ text: 'i', italic: true }], style).width, 22.2);
    near(measureRuns([{ text: 'i', bold: true, italic: true }], style).width, 27.8);
    near(
      measureRuns([{ text: 'Wi' }, { text: 'Wi', bold: true }], style).width,
      w('Wi') + w('Wi', ADVANCE_BOLD),
    );
  });

  it('positions each run absolutely, left to right', () => {
    const m = measureRuns([{ text: 'Wi' }, { text: 'm', bold: true, italic: true }], style);
    const [a, b] = m.lines[0]!.segments;
    expect(a).toMatchObject({ text: 'Wi', x: 0, fontSize: 100, dy: 0, bold: false, italic: false });
    near(a!.width, 116.6);
    expect(b).toMatchObject({ text: 'm', bold: true, italic: true, dy: 0 });
    near(b!.x, 116.6);
    near(b!.width, ADVANCE_BOLD['m'.codePointAt(0)!]! / 10);
  });

  it('scales with the font size argument', () => {
    near(measureRuns([{ text: 'W' }], style, 50).width, 47.2);
    near(measureRuns([{ text: 'W' }], style, 50).ascent, 35.8);
  });

  it('iterates by code point (a surrogate pair is one glyph)', () => {
    const m = measureRuns([{ text: 'a😀' }], style);
    near(m.width, w('a') + 55.6);
    expect(m.notices).toEqual([{ code: 'unmeasured-glyph', chars: '😀' }]);
  });

  it('measures an empty run list and empty text as width 0, one line', () => {
    for (const runs of [[], [{ text: '' }]]) {
      const m = measureRuns(runs, style);
      expect(m.width).toBe(0);
      near(m.ascent, 71.6);
      expect(m.descent).toBe(0);
      expect(m.lines).toHaveLength(1);
      expect(m.lines[0]!.segments).toEqual([]);
    }
  });
});

describe('measureRuns: sub and superscripts', () => {
  it('subscript: 0.7 scale, shifted down by subShift, extends the descent', () => {
    const m = measureRuns([{ text: 'CO' }, { text: '2', script: 'sub' }], style);
    near(m.width, w('CO') + 55.6 * 0.7);
    const sub = m.lines[0]!.segments[1]!;
    expect(sub).toMatchObject({ text: '2', fontSize: 70, dy: 20 });
    near(sub.x, w('CO'));
    near(sub.width, 38.92);
    near(m.ascent, 71.6);
    near(m.descent, 20);
  });

  it('superscript: shifted up by supShift, extends the ascent', () => {
    const m = measureRuns([{ text: 'x' }, { text: '2', script: 'sup' }], style);
    expect(m.lines[0]!.segments[1]).toMatchObject({ fontSize: 70, dy: -40 });
    near(m.ascent, 40 + 0.716 * 70);
    expect(m.descent).toBe(0);
  });

  it('a descending glyph in a superscript does not push the descent below the baseline box', () => {
    const m = measureRuns([{ text: 'x' }, { text: 'y', script: 'sup' }], style);
    expect(m.descent).toBe(0);
  });

  it('a descending glyph in a subscript adds its own descent below the shift', () => {
    const m = measureRuns([{ text: 'x' }, { text: 'y', script: 'sub' }], style);
    near(m.descent, 20 + 0.212 * 70);
  });

  it('shifts follow the font-size argument', () => {
    const m = measureRuns([{ text: 'x' }, { text: '2', script: 'sup' }], style, 50);
    expect(m.lines[0]!.segments[1]).toMatchObject({ fontSize: 35, dy: -20 });
  });
});

describe('measureRuns: lines', () => {
  it('splits on newline, using lineHeight 1.2 em', () => {
    const m = measureRuns([{ text: 'Wi\nm' }], style);
    expect(m.lines).toHaveLength(2);
    near(m.lines[0]!.width, 116.6);
    near(m.lines[1]!.width, 83.3);
    expect(m.lines[0]!.baseline).toBe(0);
    near(m.lines[1]!.baseline, 120);
    near(m.width, 116.6);
    near(m.ascent, 71.6);
    near(m.descent, 120);
  });

  it('a newline inside a later run keeps earlier runs on the first line', () => {
    const m = measureRuns(
      [{ text: 'a' }, { text: 'b\nc', bold: true }, { text: 'd', script: 'sub' }],
      style,
    );
    expect(m.lines.map((l) => l.segments.map((s) => s.text))).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(m.lines[1]!.segments[0]!.x).toBe(0);
    expect(m.lines[1]!.segments[0]!.bold).toBe(true);
  });

  it('descent of the whole text is measured from the first baseline to the last line bottom', () => {
    const m = measureRuns([{ text: 'a\ng' }], style);
    near(m.descent, 120 + 21.2);
  });

  it('keeps blank lines (they take height but no width)', () => {
    const m = measureRuns([{ text: 'a\n\nb' }], style);
    expect(m.lines).toHaveLength(3);
    expect(m.lines[1]!.width).toBe(0);
    near(m.lines[2]!.baseline, 240);
  });
});

describe('measureRuns: unmeasured glyphs', () => {
  it('uses 0.556 em and reports one deduplicated notice sorted by code point', () => {
    const m = measureRuns([{ text: 'কঅক' }, { text: 'ক', bold: true }], style);
    near(m.width, 4 * 55.6);
    expect(m.notices).toEqual([{ code: 'unmeasured-glyph', chars: 'অক' }]);
  });

  it('collects across lines and runs, and does not count newline as unmeasured', () => {
    const m = measureRuns([{ text: 'ক\nऄ' }, { text: '😀', script: 'sup' }], style);
    expect(m.notices).toEqual([{ code: 'unmeasured-glyph', chars: 'ऄক😀' }]);
  });

  it('reports nothing for covered text (Greek, minus, arrows, Latin-1)', () => {
    const m = measureRuns([{ text: 'δ+ δ− → é ° µ' }], style);
    expect(m.notices).toEqual([]);
  });
});
