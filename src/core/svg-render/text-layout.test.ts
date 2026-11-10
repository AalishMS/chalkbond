import { describe, expect, it } from 'vitest';
import type { TextRun } from '../doc-model';
import { inkScan } from './__fixtures__/ink-scan';
import { textElements, type TextEl } from './__fixtures__/markup';
import { ADVANCE_BOLD, ADVANCE_REGULAR } from './font-metrics';
import { resolveStyle } from './style';
import { layoutText, layoutTextAt } from './text-layout';

// fontSize 100: cap height 71.6, line height 120, subScale 0.7, subShift 20, supShift 40.
const style = resolveStyle({ preset: 'slides', overrides: { fontSize: 100 } });
const near = (actual: number, expected: number, digits = 3) =>
  expect(actual).toBeCloseTo(expected, digits);
const adv = (s: string, bold = false): number =>
  [...s].reduce(
    (sum, ch) => sum + (bold ? ADVANCE_BOLD : ADVANCE_REGULAR)[ch.codePointAt(0) ?? 0]! / 10,
    0,
  );
const at = { x: 100, y: 50 };
const els = (svg: string): TextEl[] => textElements(svg);
const sub = (text: string): TextRun => ({ text, script: 'sub' });
const sup = (text: string): TextRun => ({ text, script: 'sup' });

describe('layoutTextAt: nothing to draw', () => {
  it('no runs, or only empty runs, draw nothing', () => {
    expect(layoutTextAt([], style, 'left', at)).toBeNull();
    expect(layoutTextAt([{ text: '' }, { text: '' }], style, 'center', at)).toBeNull();
    expect(layoutTextAt([{ text: '\n' }], style, 'left', at)).toBeNull();
  });
});

describe('layoutTextAt: align', () => {
  const runs: TextRun[] = [{ text: 'Wi' }];
  const width = adv('Wi');

  it('left: the line starts at at.x', () => {
    near(els(layoutTextAt(runs, style, 'left', at)!.svg)[0]!.x, 100);
  });

  it('center: the line is centred on at.x', () => {
    near(els(layoutTextAt(runs, style, 'center', at)!.svg)[0]!.x, 100 - width / 2);
  });

  it('right: the line ends at at.x', () => {
    near(els(layoutTextAt(runs, style, 'right', at)!.svg)[0]!.x, 100 - width);
  });

  it('centres on the whole line, not on each run', () => {
    const out = layoutTextAt([{ text: 'W' }, { text: 'i', bold: true }], style, 'center', at)!;
    const [w, i] = els(out.svg) as [TextEl, TextEl];
    const total = adv('W') + adv('i', true);
    near(w.x, 100 - total / 2);
    near(i.x, 100 - total / 2 + adv('W'));
  });
});

describe('layoutTextAt: vertical placement', () => {
  it('the first line cap-height box is centred on at.y', () => {
    const out = layoutTextAt([{ text: 'H' }], style, 'left', at)!;
    near(els(out.svg)[0]!.y, 50 + 71.6 / 2);
    // The ink box is the font's full ascent (0.905 em) and descent (0.212 em) round that baseline.
    near(out.ink.y, 50 + 71.6 / 2 - 90.5);
    near(out.ink.h, 90.5 + 21.2);
  });
});

describe('layoutTextAt: runs', () => {
  it('H2SO4: subscripts are smaller and drop by subShift; positions are absolute', () => {
    const out = layoutTextAt(
      [{ text: 'H' }, sub('2'), { text: 'SO' }, sub('4')],
      style,
      'left',
      at,
    )!;
    const t = els(out.svg);
    expect(t.map((e) => e.text)).toEqual(['H', '2', 'SO', '4']);
    expect(t.map((e) => e.size)).toEqual([100, 70, 100, 70]);
    const base = 50 + 35.8;
    near(t[0]!.y, base);
    near(t[1]!.y, base + 20);
    near(t[2]!.y, base);
    near(t[3]!.y, base + 20);
    near(t[1]!.x, 100 + adv('H'));
    near(t[2]!.x, 100 + adv('H') + adv('2') * 0.7);
    near(t[3]!.x, 100 + adv('HSO') + adv('2') * 0.7);
  });

  it('superscripts rise by supShift; the box grows upwards', () => {
    const out = layoutTextAt(
      [{ text: 'H' }, sub('3'), { text: 'O' }, sup('+')],
      style,
      'left',
      at,
    )!;
    const plus = els(out.svg)[3]!;
    near(plus.y, 50 + 35.8 - 40);
    near(out.ink.y, 50 + 35.8 - 40 - 0.905 * 70);
  });

  it.each([
    ['Δ', 'Δ'],
    ['hν', 'hν'],
    ['δ+', 'δ+'],
  ])('%s is measured without a notice', (_label, text) => {
    const out = layoutTextAt([{ text }], style, 'left', at)!;
    expect(out.notices).toEqual([]);
    near(out.ink.w, adv(text));
  });

  it('δ followed by a superscript plus keeps the glyph widths', () => {
    const out = layoutTextAt([{ text: 'δ' }, sup('+')], style, 'left', at)!;
    expect(out.notices).toEqual([]);
    near(els(out.svg)[1]!.x, 100 + adv('δ'));
  });

  it('bold and italic reach the markup, with bold widths for bold runs', () => {
    const out = layoutTextAt(
      [
        { text: 'W', bold: true },
        { text: 'i', italic: true },
      ],
      style,
      'left',
      at,
    )!;
    const [b, i] = els(out.svg) as [TextEl, TextEl];
    expect(b.weight).toBe('bold');
    expect(b.style).toBeUndefined();
    expect(i.style).toBe('italic');
    expect(i.weight).toBeUndefined();
    near(i.x, 100 + adv('W', true));
  });

  it('colours: the run colour, else ink; empty runs do not shift them', () => {
    const out = layoutTextAt(
      [
        { text: 'a', color: '#ff0000' },
        { text: '' },
        { text: 'b' },
        { text: 'c', color: '#0000ff' },
      ],
      style,
      'left',
      at,
    )!;
    expect(els(out.svg).map((e) => e.fill)).toEqual(['#ff0000', '#000000', '#0000ff']);
  });

  it('colours follow their runs across a line break', () => {
    const out = layoutTextAt(
      [
        { text: 'a\nb', color: '#ff0000' },
        { text: 'c', color: '#00ff00' },
      ],
      style,
      'left',
      at,
    )!;
    expect(els(out.svg).map((e) => [e.text, e.fill])).toEqual([
      ['a', '#ff0000'],
      ['b', '#ff0000'],
      ['c', '#00ff00'],
    ]);
  });

  it('user text never becomes markup', () => {
    const out = layoutTextAt([{ text: '<b>&"\'' }], style, 'left', at)!;
    expect(out.svg).toContain('&lt;b&gt;&amp;&quot;&apos;');
    expect(out.svg.match(/</g)).toHaveLength(2); // only <text ...> and </text>
  });

  it('reports glyphs outside the table', () => {
    expect(layoutTextAt([{ text: '中' }], style, 'left', at)!.notices).toEqual([
      { code: 'unmeasured-glyph', chars: '中' },
    ]);
  });
});

describe('layoutTextAt: several lines', () => {
  it('a line break starts a new line lineHeight below, each element on its own baseline', () => {
    const out = layoutTextAt([{ text: 'ab\ncd\nef' }], style, 'left', at)!;
    const t = els(out.svg);
    expect(t.map((e) => e.text)).toEqual(['ab', 'cd', 'ef']);
    near(t[1]!.y - t[0]!.y, 120);
    near(t[2]!.y - t[0]!.y, 240);
    for (const e of t) near(e.x, 100);
  });

  it('the first line stays centred on at.y; the block extends below', () => {
    const out = layoutTextAt([{ text: 'H\nH' }], style, 'left', at)!;
    near(out.ink.y, 50 + 35.8 - 90.5);
    near(out.ink.y + out.ink.h, 50 + 35.8 + 120 + 21.2);
  });

  it.each([
    ['left', (w: number) => 100 - 0 * w],
    ['center', (w: number) => 100 - w / 2],
    ['right', (w: number) => 100 - w],
  ] as const)('%s: every line is aligned on its own width', (align, startOf) => {
    const out = layoutTextAt([{ text: 'W\nWWW' }], style, align, at)!;
    const [a, b] = els(out.svg) as [TextEl, TextEl];
    near(a.x, startOf(adv('W')));
    near(b.x, startOf(adv('WWW')));
  });

  it('a run continues on the line where the previous one stopped', () => {
    const out = layoutTextAt([{ text: 'a\n' }, { text: 'b', bold: true }], style, 'left', at)!;
    const t = els(out.svg);
    expect(t.map((e) => e.text)).toEqual(['a', 'b']);
    near(t[1]!.x, 100);
    near(t[1]!.y - t[0]!.y, 120);
  });

  it('a blank line leaves a gap and no element', () => {
    const out = layoutTextAt([{ text: 'a\n\nb' }], style, 'left', at)!;
    const t = els(out.svg);
    expect(t).toHaveLength(2);
    near(t[1]!.y - t[0]!.y, 240);
  });

  it('subscripts on a later line are measured from that line', () => {
    const out = layoutTextAt([{ text: 'x\nH' }, sub('2')], style, 'left', at)!;
    const t = els(out.svg);
    near(t[2]!.y - t[1]!.y, 20);
  });
});

describe('layoutText: caller-chosen anchor', () => {
  it('passes the block size to `place`, which returns the anchor x and first baseline', () => {
    let seen: { width: number; ascent: number; descent: number } | undefined;
    const out = layoutText([{ text: 'Wg\nW' }], style, 'left', (size) => {
      seen = size;
      return { x: 7, y: 11 };
    })!;
    near(seen!.width, adv('Wg'));
    near(seen!.ascent, 90.5); // the font's full ascent, not the cap height
    near(seen!.descent, 120 + 21.2); // and its full descent below the last baseline
    near(els(out.svg)[0]!.x, 7);
    near(els(out.svg)[0]!.y, 11);
  });

  it('the box spans all lines, from the first ascent to the last descent', () => {
    const out = layoutText([{ text: 'H\nHg' }], style, 'center', () => ({ x: 0, y: 0 }))!;
    near(out.box.x, -adv('Hg') / 2);
    near(out.box.w, adv('Hg'));
    near(out.box.y, -90.5);
    near(out.box.h, 90.5 + 120 + 21.2);
  });
});

describe('layoutTextAt: ink', () => {
  it.each([
    ['left', [{ text: 'Hg' }, sub('2'), sup('+')]],
    ['center', [{ text: 'a\nbc\n' }, { text: 'jD', bold: true }]],
    ['right', [{ text: 'Wi' }, { text: '\n' }, { text: 'δ', italic: true }, sup('2−')]],
  ] as const)('%s: ink equals an independent scan of the markup', (align, runs) => {
    const out = layoutTextAt(runs, style, align, at)!;
    const scan = inkScan(out.svg)!;
    near(out.ink.x, scan.x, 2);
    near(out.ink.y, scan.y, 2);
    near(out.ink.w, scan.w, 2);
    near(out.ink.h, scan.h, 2);
  });
});
