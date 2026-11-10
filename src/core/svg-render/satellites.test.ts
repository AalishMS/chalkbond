import { describe, expect, it } from 'vitest';
import type { Atom, AtomId, Doc, Point } from '../doc-model';
import { inkScan } from './__fixtures__/ink-scan';
import { ADVANCE_REGULAR } from './font-metrics';
import { buildAtomLabel } from './atom-label';
import { layoutSatellites } from './satellites';
import { resolveStyle } from './style';

const style = resolveStyle({ preset: 'slides', overrides: { fontSize: 100 } } as Doc['style']);
const near = (actual: number, expected: number, digits = 6) =>
  expect(actual).toBeCloseTo(expected, digits);
const deg = (d: number) => (d * Math.PI) / 180;
const unit = (d: number): Point => ({ x: Math.cos(deg(d)), y: Math.sin(deg(d)) });

const mk = (over: Partial<Atom> = {}): Atom => ({
  id: 'a1' as AtomId,
  x: 0,
  y: 0,
  element: 'C',
  charge: 0,
  radical: 0,
  ...over,
});
const POS = { x: 200, y: 100 };
const FS = 100;

describe('layoutSatellites', () => {
  /** A skeleton vertex when `labelled` is false, else the atom's label (implicit H `h`). */
  const layout = (atom: Partial<Atom>, directions: Point[], labelled = false, h = 0) => {
    const a = mk(atom);
    const label = labelled
      ? buildAtomLabel({ atom: a, implicitH: h, neighbors: directions, position: POS }, style)
      : null;
    return layoutSatellites({ atom: a, position: POS, directions, label }, style);
  };

  /** `<circle>` centres in order. */
  const dots = (svg: string): Point[] =>
    [...svg.matchAll(/<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
    }));
  const texts = (svg: string) =>
    [
      ...svg.matchAll(
        /<text x="([^"]+)" y="([^"]+)"[^>]*font-size="([^"]+)"[^>]*>([^<]*)<\/text>/g,
      ),
    ].map((m) => ({ x: Number(m[1]), y: Number(m[2]), size: Number(m[3]), text: m[4]! }));

  it('nothing to draw gives null', () => {
    expect(layout({}, [unit(0)])).toBeNull();
    expect(layout({ element: 'N', charge: 1 }, [unit(0)], true)).toBeNull();
  });

  it('a charge on a vertex is a sign satellite, magnitude first when above 1', () => {
    expect(texts(layout({ charge: 1 }, [unit(0)])!.svg).map((t) => t.text)).toEqual(['+']);
    expect(texts(layout({ charge: -1 }, [unit(0)])!.svg).map((t) => t.text)).toEqual(['−']);
    expect(texts(layout({ charge: 2 }, [unit(0)])!.svg).map((t) => t.text)).toEqual(['2+']);
    expect(texts(layout({ charge: -3 }, [unit(0)])!.svg).map((t) => t.text)).toEqual(['3−']);
  });

  it('a charge on a labelled atom is not a satellite (it is in the label text)', () => {
    expect(layout({ element: 'N', charge: 1 }, [unit(0)], true, 2)).toBeNull();
  });

  it('a lone vertex charge is text at N of the point: its box is tangent, `satelliteGap` above it', () => {
    const out = layout({ charge: 1 }, [])!;
    const t = texts(out.svg)[0]!;
    expect(t.size).toBeCloseTo(70, 6);
    const w = (ADVANCE_REGULAR[0x2b]! * 70) / 1000;
    const box = out.boxes[0]!;
    near(box.x + box.w / 2, POS.x);
    near(box.w, w);
    near(box.y + box.h, POS.y - style.satelliteGap);
    // The baseline is the box's bottom edge; the cap-height box is the satellite scale's.
    near(t.y, box.y + box.h);
    near(box.h, 0.716 * 70);
  });

  it('a lone pair is two dots pairSeparation apart, along the box edge', () => {
    // Bond to the east: the pair takes the west, its dots stacked vertically on the point's edge.
    const out = layout({ lonePairs: 1 }, [unit(0)])!;
    const [p, q] = dots(out.svg) as [Point, Point];
    const apart = Math.sqrt((p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y));
    near(apart, style.pairSeparation, 6);
    near(p.x, q.x, 6);
    near(p.y + q.y, 2 * POS.y, 6);
    near(p.x, POS.x - (style.satelliteGap + style.dotRadius), 6);
  });

  it('radical 1 is one dot, radical 2 two dots in two slots', () => {
    expect(dots(layout({ radical: 1 }, [unit(0)])!.svg)).toHaveLength(1);
    const two = dots(layout({ radical: 2 }, [unit(0)])!.svg);
    expect(two).toHaveLength(2);
    expect(two[0]).not.toEqual(two[1]);
  });

  it('assignment order is lone pairs, radical, vertex charge, partial charge, number', () => {
    const out = layout({ charge: 1, lonePairs: 1, radical: 1, partialCharge: 'δ+', number: '7' }, [
      unit(0),
    ])!;
    // Draw order in the markup follows assignment order: 2 dots, 1 dot, text, text, text.
    const tags = [...out.svg.matchAll(/<(text|circle)\b/g)].map((m) => m[1]);
    expect(tags).toEqual(['circle', 'circle', 'circle', 'text', 'text', 'text']);
    expect(texts(out.svg).map((t) => t.text)).toEqual(['+', 'δ+', '7']);
  });

  it('partial charges use U+2212 for the minus', () => {
    expect(texts(layout({ partialCharge: 'δ-' }, [unit(0)])!.svg).map((t) => t.text)).toEqual([
      'δ−',
    ]);
    expect(texts(layout({ partialCharge: 'δδ-' }, [unit(0)])!.svg).map((t) => t.text)).toEqual([
      'δδ−',
    ]);
    expect(texts(layout({ partialCharge: 'δδ+' }, [unit(0)])!.svg).map((t) => t.text)).toEqual([
      'δδ+',
    ]);
  });

  it('an atom number is text at the satellite scale', () => {
    const t = texts(layout({ number: 'α' }, [unit(0)])!.svg)[0]!;
    expect(t.text).toBe('α');
    expect(t.size).toBeCloseTo(70, 6);
  });

  it('colours every satellite with the atom colour, else ink', () => {
    const coloured = layout({ lonePairs: 1, number: '1', color: '#ff0000' }, [unit(0)])!;
    expect(coloured.svg).not.toContain('#000000');
    expect(coloured.svg).toContain('fill="#ff0000"');
    expect(layout({ number: '1' }, [unit(0)])!.svg).toContain('fill="#000000"');
  });

  it('with a label, the pair hangs off the symbol, not the whole text (NH2: N of the N)', () => {
    // Bond to the west: W is the bond, E the H2; the pair takes N, centred on the N glyph.
    const atom = mk({ element: 'N', lonePairs: 1 });
    const label = buildAtomLabel(
      { atom, implicitH: 2, neighbors: [unit(180)], position: POS },
      style,
    );
    expect(label.text).toBe('NH2');
    const out = layoutSatellites({ atom, position: POS, directions: [unit(180)], label }, style)!;
    expect(out.placements).toEqual([{ slot: 'N', ring: 0 }]);
    const [p, q] = dots(out.svg) as [Point, Point];
    near((p.x + q.x) / 2, label.symbolBox.x + label.symbolBox.w / 2, 6);
    near(p.y, label.symbolBox.y - style.satelliteGap - style.dotRadius, 6);
  });

  it('a bare atom puts the first pair above the symbol, the second below', () => {
    const out = layout({ element: 'Cl', lonePairs: 2 }, [], true)!;
    const d = dots(out.svg);
    expect(d).toHaveLength(4);
    const capTop = POS.y - (0.716 * FS) / 2;
    near(d[0]!.y, capTop - style.satelliteGap - style.dotRadius, 6);
    near(d[2]!.y, POS.y + (0.716 * FS) / 2 + style.satelliteGap + style.dotRadius, 6);
  });

  it('the ink box equals an independent scan of the markup', () => {
    const out = layout(
      { lonePairs: 1, radical: 1, charge: -2, partialCharge: 'δδ-', number: '12' },
      [unit(0), unit(120)],
    )!;
    const scan = inkScan(out.svg)!;
    expect(Math.abs(out.ink.x - scan.x)).toBeLessThan(0.01);
    expect(Math.abs(out.ink.y - scan.y)).toBeLessThan(0.01);
    expect(Math.abs(out.ink.w - scan.w)).toBeLessThan(0.01);
    expect(Math.abs(out.ink.h - scan.h)).toBeLessThan(0.01);
  });

  it('text satellites are tangent to the slot, nearest edge satelliteGap away', () => {
    // Bond down: the number takes N, its box's bottom edge `satelliteGap` above the vertex.
    const out = layout({ number: '1' }, [unit(90)])!;
    near(out.boxes[0]!.y + out.boxes[0]!.h, POS.y - style.satelliteGap, 6);
    near(out.boxes[0]!.x + out.boxes[0]!.w / 2, POS.x, 6);
  });

  it('text ink is the font box: full ascent above and descent below the baseline, so δ fits', () => {
    const out = layout({ partialCharge: 'δ-' }, [unit(0)])!;
    const t = texts(out.svg)[0]!;
    expect(out.ink.y).toBeCloseTo(t.y - 0.905 * 70, 6);
    expect(out.ink.y + out.ink.h).toBeCloseTo(t.y + 0.212 * 70, 6);
  });

  it('reports unmeasured glyphs of satellite text', () => {
    const out = layout({ number: '中' }, [unit(0)])!;
    expect(out.notices).toEqual([{ code: 'unmeasured-glyph', chars: '中' }]);
  });

  it('is deterministic', () => {
    const a = layout({ lonePairs: 2, radical: 1 }, [unit(0), unit(100), unit(250)])!;
    const b = layout({ lonePairs: 2, radical: 1 }, [unit(0), unit(100), unit(250)])!;
    expect(a.svg).toBe(b.svg);
  });

  it('an atom number with line breaks is drawn whole on one line, like a label', () => {
    const out = layout({ number: 'a\r\nb\nc' }, [unit(0)])!;
    const texts = [...out.svg.matchAll(/>([^<]*)<\/text>/g)].map((m) => m[1]);
    expect(texts.join('')).toBe('a b c');
  });
});
