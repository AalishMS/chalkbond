import { describe, expect, it } from 'vitest';
import type { Doc, Point } from '../doc-model';
import { bluToPt, INK, ptToBlu, resolveStyle, STYLE_PRESETS } from './style';

type StyleInput = Doc['style'];
const slides = (overrides: Record<string, unknown> = {}): StyleInput =>
  ({ preset: 'slides', overrides }) as StyleInput;
const journal = (overrides: Record<string, unknown> = {}): StyleInput =>
  ({ preset: 'journal', overrides }) as StyleInput;

describe('STYLE_PRESETS', () => {
  it('matches the spec table', () => {
    expect(STYLE_PRESETS.slides).toEqual({
      bondLength: 40,
      lineWidth: 2,
      doubleBondSpacing: 0.18,
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: 24,
    });
    expect(STYLE_PRESETS.journal).toEqual({
      bondLength: 14.4,
      lineWidth: 0.6,
      doubleBondSpacing: 0.18,
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: 10,
    });
  });

  it('has the default ink colour', () => {
    expect(INK).toBe('#000000');
  });
});

describe('resolveStyle: derived values (L = 40, fs = 24)', () => {
  const s = resolveStyle(slides());
  const L = 40;
  const fs = 24;
  const near = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 9);

  it('carries the five settings', () => {
    expect(s.bondLength).toBe(40);
    expect(s.lineWidth).toBe(2);
    expect(s.doubleBondSpacing).toBe(0.18);
    expect(s.fontFamily).toBe('Arial, Helvetica, sans-serif');
    expect(s.fontSize).toBe(24);
  });

  it.each([
    ['doubleGap', 0.18 * L],
    ['boldWidth', 0.14 * L],
    ['wedgeWide', 0.14 * L],
    ['hashSpacing', 0.17 * L],
    ['dashOn', 0.25 * L],
    ['dashOff', 0.15 * L],
    ['labelMargin', 0.11 * L],
    ['wavyAmplitude', 0.07 * L],
    ['wavyLength', 0.2 * L],
    ['arrowHeadLength', 0.22 * L],
    ['arrowHeadHalfWidth', 0.09 * L],
    ['equilibriumGap', 0.12 * L],
    ['noGoHalf', 0.12 * L],
    ['plusArm', 0.15 * L],
    ['curvedGap', 0.08 * L],
    ['circleRatio', 0.65],
    ['bracketSerif', 0.2 * L],
    ['roundBulge', 0.12 * L],
    ['curlyDepth', 0.2 * L],
    ['captionGap', 0.5 * L],
    ['calloutPad', 0.2 * fs],
    ['cornerGap', 0.15 * fs],
    ['subScale', 0.7],
    ['subShift', 0.2 * fs],
    ['supShift', 0.4 * fs],
    ['satelliteScale', 0.7],
    ['satelliteGap', 0.1 * fs],
    ['dotRadius', 0.05 * fs],
    ['pairSeparation', 0.24 * fs],
    ['capHeight', 0.716 * fs],
    ['lineHeight', 1.2 * fs],
  ] as const)('%s', (key, expected) => {
    near(s[key], expected);
  });

  it('derives from the journal preset scale', () => {
    const j = resolveStyle(journal());
    near(j.doubleGap, 0.18 * 14.4);
    near(j.capHeight, 0.716 * 10);
    near(j.labelMargin, 0.11 * 14.4);
  });

  it('rescales every derived value with the overrides', () => {
    const o = resolveStyle(slides({ bondLength: 80, fontSize: 56 }));
    near(o.doubleGap, 0.18 * 80);
    near(o.arrowHeadLength, 0.22 * 80);
    near(o.capHeight, 0.716 * 56);
    near(o.circleRatio, 0.65);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(s)).toBe(true);
  });
});

describe('resolveStyle: overrides', () => {
  it('applies valid overrides over the preset', () => {
    const s = resolveStyle(
      slides({
        bondLength: 20,
        lineWidth: 1,
        doubleBondSpacing: 0.25,
        fontSize: 12,
        fontFamily: 'Times New Roman, serif',
      }),
    );
    expect(s.bondLength).toBe(20);
    expect(s.lineWidth).toBe(1);
    expect(s.doubleBondSpacing).toBe(0.25);
    expect(s.fontSize).toBe(12);
    expect(s.fontFamily).toBe('Times New Roman, serif');
  });

  it('accepts the range boundaries', () => {
    expect(resolveStyle(slides({ bondLength: 4 })).bondLength).toBe(4);
    expect(resolveStyle(slides({ bondLength: 400 })).bondLength).toBe(400);
    expect(resolveStyle(slides({ lineWidth: 0.05 })).lineWidth).toBe(0.05);
    expect(resolveStyle(slides({ lineWidth: 20 })).lineWidth).toBe(20);
    expect(resolveStyle(slides({ doubleBondSpacing: 0.05 })).doubleBondSpacing).toBe(0.05);
    expect(resolveStyle(slides({ doubleBondSpacing: 0.5 })).doubleBondSpacing).toBe(0.5);
    expect(resolveStyle(slides({ fontSize: 2 })).fontSize).toBe(2);
    expect(resolveStyle(slides({ fontSize: 200 })).fontSize).toBe(200);
  });

  const RANGES = {
    bondLength: [3.99, 400.01],
    lineWidth: [0.049, 20.01],
    doubleBondSpacing: [0.049, 0.51],
    fontSize: [1.99, 200.01],
  } as const;

  for (const [key, [low, high]] of Object.entries(RANGES)) {
    const preset = STYLE_PRESETS.slides[key as keyof typeof RANGES];
    it.each([
      ['NaN', NaN],
      ['Infinity', Infinity],
      ['-Infinity', -Infinity],
      ['below range', low],
      ['above range', high],
      ['a string', '12'],
      ['null', null],
      ['an object', {}],
      ['a boolean', true],
    ])(`${key}: %s falls back to the preset`, (_label, bad) => {
      const s = resolveStyle(slides({ [key]: bad }));
      expect(s[key as keyof typeof RANGES]).toBe(preset);
    });
  }

  it.each([
    ['empty', ''],
    ['only stripped characters', '"\';{}'],
    ['a number', 42],
    ['null', null],
  ])('fontFamily: %s falls back to the preset family', (_label, bad) => {
    expect(resolveStyle(slides({ fontFamily: bad })).fontFamily).toBe(
      STYLE_PRESETS.slides.fontFamily,
    );
    expect(resolveStyle(journal({ fontFamily: bad })).fontFamily).toBe(
      STYLE_PRESETS.journal.fontFamily,
    );
  });

  it('sanitises the font family (quotes and markup characters removed, 200 chars max)', () => {
    expect(resolveStyle(slides({ fontFamily: '"Segoe UI", \'Arial\'; }{' })).fontFamily).toBe(
      'Segoe UI, Arial',
    );
    expect(resolveStyle(slides({ fontFamily: 'a<b>&c/url(x)' })).fontFamily).toBe('abcurlx');
    expect(resolveStyle(slides({ fontFamily: 'a'.repeat(300) })).fontFamily).toBe('a'.repeat(200));
  });

  it('one bad override does not spoil the others', () => {
    const s = resolveStyle(slides({ bondLength: NaN, lineWidth: 3 }));
    expect(s.bondLength).toBe(40);
    expect(s.lineWidth).toBe(3);
  });

  it('falls back to the slides preset for an unknown preset name and never mutates', () => {
    const style = { preset: 'nope', overrides: { bondLength: 20 } } as unknown as StyleInput;
    expect(resolveStyle(style).bondLength).toBe(20);
    expect(resolveStyle(style).fontSize).toBe(24);
    expect(style.overrides).toEqual({ bondLength: 20 });
  });

  it('tolerates missing overrides', () => {
    expect(resolveStyle({ preset: 'journal' } as unknown as StyleInput).bondLength).toBe(14.4);
  });
});

describe('bluToPt / ptToBlu', () => {
  const s = resolveStyle(journal());

  it('multiplies by the bond length', () => {
    const p = bluToPt({ x: 1, y: -2 }, s);
    expect(p.x).toBeCloseTo(14.4, 12);
    expect(p.y).toBeCloseTo(-28.8, 12);
  });

  it('are inverse', () => {
    for (const p of [
      { x: 0, y: 0 },
      { x: 1.5, y: -3.25 },
      { x: -100, y: 7e-3 },
    ] satisfies Point[]) {
      const back = ptToBlu(bluToPt(p, s), s);
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });
});
