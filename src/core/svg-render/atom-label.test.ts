import { describe, expect, it } from 'vitest';
import type { Atom, AtomId, Doc, Point, Rect, TextRun } from '../doc-model';
import { bondClipBox, buildAtomLabel, isLabelled, type AtomLabel } from './atom-label';
import { ADVANCE_REGULAR } from './font-metrics';
import { resolveStyle } from './style';

// Font size 100 pt: every width reads straight off the 1/1000 em table (capHeight 71.6).
const style = resolveStyle({ preset: 'slides', overrides: { fontSize: 100 } } as Doc['style']);
const CAP = 71.6;
const MINUS = '−';
const near = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 2);
const adv = (s: string) =>
  [...s].reduce((n, ch) => n + ADVANCE_REGULAR[ch.codePointAt(0)!]! / 10, 0);

const mk = (over: Partial<Atom> = {}): Atom => ({
  id: 'a1' as AtomId,
  x: 0,
  y: 0,
  element: 'C',
  charge: 0,
  radical: 0,
  ...over,
});

const LEFT: Point[] = [{ x: -1, y: 0 }];
const RIGHT: Point[] = [{ x: 1, y: 0 }];
const UP: Point[] = [{ x: 0, y: -1 }];
const POS = { x: 200, y: 100 };

function build(atom: Partial<Atom>, neighbors: Point[], implicitH = 0, position: Point = POS) {
  return buildAtomLabel({ atom: mk(atom), implicitH, neighbors, position }, style);
}
const text = (atom: Partial<Atom>, neighbors: Point[], implicitH = 0) =>
  build(atom, neighbors, implicitH).text;

/** `<text>` elements of a label as plain numbers. */
function texts(label: AtomLabel) {
  return [
    ...label.svg.matchAll(
      /<text x="([^"]+)" y="([^"]+)"[^>]*font-size="([^"]+)"[^>]*>([^<]*)<\/text>/g,
    ),
  ].map((m) => ({ x: Number(m[1]), y: Number(m[2]), size: Number(m[3]), content: m[4]! }));
}

describe('isLabelled', () => {
  const rows: [string, Partial<Atom>, number, boolean][] = [
    ['skeleton carbon', {}, 2, false],
    ['terminal carbon', {}, 1, false],
    ['carbon with no bonds', {}, 0, true],
    ['heteroatom', { element: 'O' }, 1, true],
    ['hydrogen', { element: 'H' }, 1, true],
    ['carbon with an abbreviation label', { label: 'Ph' }, 1, true],
    ['carbon with an isotope', { isotope: 13 }, 2, true],
    ['carbon with explicit H', { explicitH: 3 }, 1, true],
    ['carbon with explicit H of 0', { explicitH: 0 }, 2, true],
    ['carbon with a charge only', { charge: 1 }, 3, false],
    ['carbon with a radical only', { radical: 1 }, 3, false],
    ['carbon with lone pairs only', { charge: -1, lonePairs: 1 }, 3, false],
    ['carbon with partial charge', { partialCharge: 'δ+' }, 1, false],
    ['carbon with an atom number', { number: '1' }, 2, false],
    ['pseudo-atom', { element: 'R' }, 1, true],
  ];
  it.each(rows)('%s', (_name, atom, bonds, expected) => {
    expect(isLabelled(mk(atom), bonds)).toBe(expected);
  });
});

describe('side rule for implicit H', () => {
  it('reads OH / HO / OH by neighbour side', () => {
    expect(text({ element: 'O' }, LEFT, 1)).toBe('OH');
    expect(text({ element: 'O' }, RIGHT, 1)).toBe('HO');
    expect(text({ element: 'O' }, UP, 1)).toBe('OH');
  });

  it('reads NH2 / H2N with a subscript 2', () => {
    expect(text({ element: 'N' }, LEFT, 2)).toBe('NH2');
    expect(text({ element: 'N' }, RIGHT, 2)).toBe('H2N');
    expect(build({ element: 'N' }, LEFT, 2).runs).toEqual([
      { text: 'N' },
      { text: 'H' },
      { text: '2', script: 'sub' },
    ]);
    expect(build({ element: 'N' }, RIGHT, 2).runs).toEqual([
      { text: 'H' },
      { text: '2', script: 'sub' },
      { text: 'N' },
    ]);
  });

  it('uses the sum of unit vectors with a 0.1 dead zone', () => {
    // Two bonds up-left and up-right: sx = 0.
    const split: Point[] = [
      { x: -1, y: -1 },
      { x: 1, y: -1 },
    ];
    expect(text({ element: 'O' }, split, 1)).toBe('OH');
    // Unit vectors, not raw lengths: a long right bond and a short left one cancel.
    const unequal: Point[] = [
      { x: 10, y: 0 },
      { x: -0.5, y: 0 },
    ];
    expect(text({ element: 'O' }, unequal, 1)).toBe('OH');
    // sx = 0.1 exactly is still "otherwise"; just beyond puts H first.
    const s = Math.sqrt(1 - 0.1 * 0.1);
    expect(text({ element: 'O' }, [{ x: 0.1, y: s }], 1)).toBe('OH');
    expect(text({ element: 'O' }, [{ x: 0.11, y: Math.sqrt(1 - 0.11 * 0.11) }], 1)).toBe('HO');
    expect(text({ element: 'O' }, [{ x: -0.5, y: 0.8 }], 1)).toBe('OH');
  });

  it('ignores coincident neighbours (zero vector)', () => {
    expect(text({ element: 'O' }, [{ x: 0, y: 0 }, ...RIGHT], 1)).toBe('HO');
  });

  it('draws no H part for implicitH 0 or for labelled atoms', () => {
    expect(text({ element: 'O' }, RIGHT, 0)).toBe('O');
    expect(text({ element: 'C', label: 'Ph' }, RIGHT, 3)).toBe('Ph');
  });
});

describe('abbreviation labels', () => {
  const rows: [string, string, string, string][] = [
    ['CO2H', 'CO2H', 'HO2C', 'C'],
    ['OMe', 'OMe', 'MeO', 'O'],
    ['NO2', 'NO2', 'O2N', 'N'],
    ['SO3H', 'SO3H', 'HO3S', 'S'],
    ['CHO', 'CHO', 'OHC', 'C'],
    ['CN', 'CN', 'NC', 'C'],
    ['CONH2', 'CONH2', 'H2NOC', 'C'],
  ];
  it.each(rows)(
    '%s: typed with neighbours left, reversed with neighbours right',
    (label, typed, rev, attach) => {
      const left = build({ label }, LEFT);
      const right = build({ label }, RIGHT);
      expect(left.text).toBe(typed);
      expect(right.text).toBe(rev);
      // The bond attaches through the anchor glyph: first segment typed, last reversed.
      const lt = texts(left);
      const rt = texts(right);
      near(lt[0]!.x + adv(attach) / 2, POS.x);
      expect(lt[0]!.content).toBe(attach);
      expect(rt[rt.length - 1]!.content).toBe(attach);
      near(rt[rt.length - 1]!.x + adv(attach) / 2, POS.x);
    },
  );

  it('subscripts digits and leaves the order alone with no horizontal neighbours', () => {
    expect(build({ label: 'CO2H' }, LEFT).runs).toEqual([
      { text: 'C' },
      { text: 'O' },
      { text: '2', script: 'sub' },
      { text: 'H' },
    ]);
    expect(text({ label: 'NO2' }, UP)).toBe('NO2');
  });

  it('draws symmetric groups as typed on either side, anchored on the whole text', () => {
    for (const label of ['Me', 'Ph', 'tBu', 'Ac']) {
      for (const side of [LEFT, RIGHT]) {
        const l = build({ label }, side);
        expect(l.text).toBe(label);
        near(l.anchorBox.w, adv(label));
        near(l.anchorBox.x, POS.x - adv(label) / 2);
        for (const k of ['x', 'y', 'w', 'h'] as const) near(l.anchorBox[k], l.textBox[k]);
      }
    }
  });

  it('draws an unknown label as typed, with its digits subscripted', () => {
    expect(text({ label: 'Foo' }, RIGHT)).toBe('Foo');
    expect(build({ label: 'R1', element: 'R' }, RIGHT).runs).toEqual([
      { text: 'R' },
      { text: '1', script: 'sub' },
    ]);
    expect(build({ label: 'Et2N' }, LEFT).runs).toEqual([
      { text: 'Et' },
      { text: '2', script: 'sub' },
      { text: 'N' },
    ]);
  });

  it('turns line breaks in a label into spaces so the label stays on one line', () => {
    const l = build({ label: 'A\nB' }, RIGHT);
    expect(l.text).toBe('A B');
    expect(texts(l)).toHaveLength(1);
  });
});

describe('bare atoms read as formulas', () => {
  const rows: [string, Partial<Atom>, number, string][] = [
    ['water', { element: 'O' }, 2, 'H2O'],
    ['hydronium', { element: 'O', charge: 1 }, 3, 'H3O+'],
    ['hydrogen sulfide', { element: 'S' }, 2, 'H2S'],
    ['hydrogen selenide', { element: 'Se' }, 2, 'H2Se'],
    ['hydrogen chloride', { element: 'Cl' }, 1, 'HCl'],
    ['hydrogen fluoride', { element: 'F' }, 1, 'HF'],
    ['hydrogen bromide', { element: 'Br' }, 1, 'HBr'],
    ['hydrogen iodide', { element: 'I' }, 1, 'HI'],
    ['hydroxide', { element: 'O', charge: -1 }, 1, `OH${MINUS}`],
    ['ammonia', { element: 'N' }, 3, 'NH3'],
    ['ammonium', { element: 'N', charge: 1 }, 4, 'NH4+'],
    ['methane', { element: 'C' }, 4, 'CH4'],
    ['hydrosulfide', { element: 'S', charge: -1 }, 1, `SH${MINUS}`],
    ['chloride', { element: 'Cl', charge: -1 }, 0, `Cl${MINUS}`],
    ['phosphine', { element: 'P' }, 3, 'PH3'],
    ['a lone hydrogen atom', { element: 'H' }, 0, 'H'],
  ];
  it.each(rows)('%s', (_name, atom, h, expected) => {
    expect(text(atom, [], h)).toBe(expected);
  });

  it('places the H part of a bare atom before the symbol only where the rule says', () => {
    expect(build({ element: 'O' }, [], 2).runs).toEqual([
      { text: 'H' },
      { text: '2', script: 'sub' },
      { text: 'O' },
    ]);
    expect(build({ element: 'N' }, [], 3).runs).toEqual([
      { text: 'N' },
      { text: 'H' },
      { text: '3', script: 'sub' },
    ]);
  });
});

describe('isotopes, hydrogen isotopes and charge', () => {
  it('draws an isotope as a superscript before the symbol', () => {
    const l = build({ isotope: 13 }, LEFT, 0);
    expect(l.runs).toEqual([{ text: '13', script: 'sup' }, { text: 'C' }]);
    expect(l.text).toBe('13C');
  });

  it('puts the isotope between a leading H part and the symbol', () => {
    expect(build({ element: 'O', isotope: 18 }, RIGHT, 1).runs).toEqual([
      { text: 'H' },
      { text: '18', script: 'sup' },
      { text: 'O' },
    ]);
  });

  it('draws hydrogen isotopes 2 and 3 as D and T with no superscript', () => {
    expect(build({ element: 'H', isotope: 2 }, LEFT, 0).runs).toEqual([{ text: 'D' }]);
    expect(build({ element: 'H', isotope: 3 }, LEFT, 0).runs).toEqual([{ text: 'T' }]);
    expect(build({ element: 'H', isotope: 1 }, LEFT, 0).runs).toEqual([
      { text: '1', script: 'sup' },
      { text: 'H' },
    ]);
  });

  it('draws the charge as a trailing superscript with U+2212 and magnitude above 1', () => {
    expect(build({ element: 'O', charge: -1 }, LEFT, 0).runs).toEqual([
      { text: 'O' },
      { text: MINUS, script: 'sup' },
    ]);
    expect(build({ element: 'O', charge: -2 }, LEFT, 0).runs).toEqual([
      { text: 'O' },
      { text: `2${MINUS}`, script: 'sup' },
    ]);
    expect(build({ element: 'N', charge: 1 }, LEFT, 3).runs).toEqual([
      { text: 'N' },
      { text: 'H' },
      { text: '3', script: 'sub' },
      { text: '+', script: 'sup' },
    ]);
    expect(build({ element: 'Fe', charge: 3 }, LEFT, 0).runs.at(-1)).toEqual({
      text: '3+',
      script: 'sup',
    });
    expect(text({ element: 'O', charge: 0 }, LEFT, 0)).toBe('O');
  });

  it('puts the charge after a reversed label too', () => {
    expect(text({ label: 'NO2', charge: 1 }, RIGHT)).toBe('O2N+');
  });

  it('keeps the anchor on the symbol, not the isotope or the charge', () => {
    const l = build({ element: 'O', charge: -1, isotope: 18 }, LEFT, 0);
    near(l.anchorBox.w, adv('O'));
    near(l.anchorBox.x + l.anchorBox.w / 2, POS.x);
  });
});

describe('geometry of the label', () => {
  it('centres the anchor box on the atom and sets the baseline at y + capHeight/2', () => {
    const l = build({ element: 'N' }, LEFT, 2);
    near(l.anchorBox.x, POS.x - adv('N') / 2);
    near(l.anchorBox.w, adv('N'));
    near(l.anchorBox.h, CAP);
    near(l.anchorBox.y, POS.y - CAP / 2);
    const [n, h, two] = texts(l);
    near(n!.x, POS.x - adv('N') / 2);
    near(n!.y, POS.y + CAP / 2);
    near(h!.x, n!.x + adv('N'));
    near(h!.y, POS.y + CAP / 2);
    near(two!.x, h!.x + adv('H'));
    near(two!.y, POS.y + CAP / 2 + style.subShift); // subscript shifts down
    near(two!.size, 70);
  });

  it('puts the anchor at the end of a leading H part (HO)', () => {
    const l = build({ element: 'O' }, RIGHT, 1);
    near(l.anchorBox.x, POS.x - adv('O') / 2);
    const [h, o] = texts(l);
    near(o!.x, POS.x - adv('O') / 2);
    near(h!.x, o!.x - adv('H'));
  });

  it('sizes the text box over every run, with sub and superscripts', () => {
    const l = build({ element: 'N', charge: 1 }, LEFT, 2);
    const total = adv('N') + adv('H') + adv('2') * 0.7 + adv('+') * 0.7;
    near(l.textBox.x, POS.x - adv('N') / 2);
    near(l.textBox.w, total);
    // Superscript rises supShift above the cap line; the subscript hangs below the baseline.
    const baseline = POS.y + CAP / 2;
    near(l.textBox.y, baseline - Math.max(CAP, CAP * 0.7 + style.supShift));
    near(l.textBox.y + l.textBox.h, baseline + style.subShift);
  });

  it('writes each run as its own absolutely positioned, escaped text element', () => {
    const l = build({ element: 'N', color: '#FF0000' }, LEFT, 2);
    expect(l.svg.split('\n')).toHaveLength(3);
    for (const line of l.svg.split('\n')) {
      expect(line).toMatch(
        /^<text x="[^"]+" y="[^"]+" font-family="[^"]+" font-size="[^"]+" fill="#ff0000" stroke="none" xml:space="preserve">[^<]+<\/text>$/,
      );
    }
    expect(build({ label: 'A<&B' }, RIGHT).svg).toContain('A&lt;&amp;B');
  });

  it('defaults the colour to ink', () => {
    expect(build({ element: 'O' }, LEFT, 1).svg).toContain('fill="#000000"');
  });

  it('never throws on glyphs outside the table: it reports an unmeasured-glyph notice', () => {
    const l = build({ label: 'Phকখ' }, RIGHT);
    expect(l.notices).toEqual([{ code: 'unmeasured-glyph', chars: 'কখ' }]);
    expect(l.text).toBe('Phকখ');
    expect(build({ element: 'O' }, LEFT, 1).notices).toEqual([]);
  });
});

describe('label geometry for satellites', () => {
  it('inkBox is the font ascent/descent box of every run; textBox keeps the cap-height layout', () => {
    const label = build({ element: 'O', charge: -1 }, [], 1);
    expect(label.text).toBe('OH−');
    near(label.inkBox.w, label.textBox.w);
    // The superscript is the highest run: 0.905 * 70 above its own baseline, 40 above the line's.
    near(label.inkBox.y, POS.y + CAP / 2 - 40 - 0.905 * 70);
    near(label.inkBox.y + label.inkBox.h, POS.y + CAP / 2 + 0.212 * 100);
    expect(label.inkBox.y).toBeLessThan(label.textBox.y + 1e-9);
  });

  it('hPart tells which side of the symbol carries the H part or tail; a charge is not one', () => {
    expect(build({ element: 'O', charge: -1 }, [], 1).hPart).toEqual({ left: false, right: true });
    expect(build({ element: 'O', label: 'HO' }, []).hPart).toEqual({ left: true, right: false });
    expect(build({ element: 'O', label: 'OH' }, []).hPart).toEqual({ left: false, right: true });
    expect(build({ element: 'Cl', charge: -1 }, []).hPart).toEqual({ left: false, right: false });
    expect(build({ element: 'O' }, [], 2).hPart).toEqual({ left: true, right: false }); // H2O
  });

  it('obstacles are the other glyphs, cut away from the symbol (typed HO leaves just the H)', () => {
    const label = build({ element: 'O', label: 'HO' }, []);
    expect(label.obstacles).toHaveLength(1);
    const [h] = label.obstacles as [Rect];
    near(h.x + h.w, label.symbolBox.x);
    near(h.w, adv('H'));
    near(h.h, CAP);
    expect(build({ element: 'Cl' }, []).obstacles).toEqual([]);
  });

  it('chargeBox is the superscript sign; chargeShift moves it and widens the text box', () => {
    const plain = build({ element: 'O', label: 'HO', charge: -1 }, []);
    const moved = buildAtomLabel(
      {
        atom: mk({ element: 'O', label: 'HO', charge: -1 }),
        implicitH: 0,
        neighbors: [],
        position: POS,
        chargeShift: 30,
      },
      style,
    );
    near(moved.chargeBox!.x - plain.chargeBox!.x, 30);
    near(moved.textBox.w - plain.textBox.w, 30);
    near(moved.inkBox.w - plain.inkBox.w, 30);
    // Only the sign moves: the symbol stays centred on the atom.
    expect(moved.symbolBox).toEqual(plain.symbolBox);
    expect(build({ element: 'O' }, []).chargeBox).toBeNull();
  });
});

describe('bondClipBox', () => {
  const m = style.labelMargin;

  it('grows the anchor box by labelMargin for a bond on the symbol side', () => {
    const l = build({ element: 'N' }, LEFT, 2); // NH2: bond arrives from the left
    const box = bondClipBox(l, { x: -1, y: 0 }, style);
    near(box.x, l.anchorBox.x - m);
    near(box.x + box.w, l.anchorBox.x + l.anchorBox.w + m);
    near(box.y, l.anchorBox.y - m);
    near(box.y + box.h, l.anchorBox.y + l.anchorBox.h + m);
  });

  it('extends over the H part first when the bond leaves up-right on NH2', () => {
    const l = build({ element: 'N' }, LEFT, 2);
    const box = bondClipBox(l, { x: 1, y: -1 }, style);
    near(box.x, l.anchorBox.x - m);
    near(box.x + box.w, l.textBox.x + l.textBox.w + m);
    // Covers the subscript's full height on that side.
    expect(box.y + box.h).toBeGreaterThanOrEqual(l.textBox.y + l.textBox.h + m - 1e-9);
  });

  it('extends leftwards over a leading H part (HO with a bond to the left)', () => {
    const l = build({ element: 'O' }, RIGHT, 1);
    const box = bondClipBox(l, { x: -1, y: 0.5 }, style);
    near(box.x, l.textBox.x - m);
    near(box.x + box.w, l.anchorBox.x + l.anchorBox.w + m);
  });

  it('does not extend for a vertical bond or when there is no text on that side', () => {
    const l = build({ element: 'N' }, LEFT, 2);
    const vertical = bondClipBox(l, { x: 0, y: -1 }, style);
    near(vertical.x + vertical.w, l.anchorBox.x + l.anchorBox.w + m);
    const back = bondClipBox(l, { x: -1, y: 1 }, style);
    near(back.x + back.w, l.anchorBox.x + l.anchorBox.w + m);
  });

  it('is just the margin-grown whole text for a label without a reversed form', () => {
    const l = build({ label: 'Ph' }, RIGHT);
    const box = bondClipBox(l, { x: -1, y: 0 }, style);
    near(box.x, l.textBox.x - m);
    near(box.w, l.textBox.w + 2 * m);
  });

  it('leaves a bond on the attachment side of CO2H untouched and extends the far side', () => {
    const l = build({ label: 'CO2H' }, LEFT);
    near(bondClipBox(l, { x: -1, y: 0 }, style).x, l.anchorBox.x - m);
    near(
      bondClipBox(l, { x: 1, y: 0 }, style).x + bondClipBox(l, { x: 1, y: 0 }, style).w,
      l.textBox.x + l.textBox.w + m,
    );
  });
});

describe('text helper types', () => {
  it('exposes runs as plain TextRun data', () => {
    const runs: readonly TextRun[] = build({ element: 'O' }, LEFT, 1).runs;
    expect(runs.map((r) => r.text)).toEqual(['O', 'H']);
  });
});
