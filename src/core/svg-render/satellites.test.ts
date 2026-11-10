import { describe, expect, it } from 'vitest';
import type { Atom, AtomId, Doc, Point, Rect } from '../doc-model';
import { inkScan } from './__fixtures__/ink-scan';
import { ADVANCE_REGULAR } from './font-metrics';
import { bondGaps, layoutSatellites, satelliteAngles } from './satellites';
import { resolveStyle } from './style';

const style = resolveStyle({ preset: 'slides', overrides: { fontSize: 100 } } as Doc['style']);
const near = (actual: number, expected: number, digits = 6) =>
  expect(actual).toBeCloseTo(expected, digits);
const deg = (d: number) => (d * Math.PI) / 180;
const unit = (d: number): Point => ({ x: Math.cos(deg(d)), y: Math.sin(deg(d)) });
/** Direction angle in degrees, 0..360 (screen, y down). */
const norm360 = (rad: number) => ((((rad * 180) / Math.PI) % 360) + 360) % 360;

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

describe('bondGaps', () => {
  it('no bonds: no gaps', () => {
    expect(bondGaps([])).toEqual([]);
  });

  it('one bond: the gap is the full turn, starting at the bond', () => {
    const [g] = bondGaps([unit(30)]);
    near(norm360(g!.start), 30);
    near(g!.size, 2 * Math.PI);
  });

  it('sorts by size, largest first', () => {
    // Bonds at 0, 90, 270: gaps 0->90 (90), 90->270 (180), 270->360 (90).
    const gaps = bondGaps([unit(0), unit(90), unit(270)]);
    expect(gaps).toHaveLength(3);
    near(gaps[0]!.size, Math.PI);
    near(norm360(gaps[0]!.start), 90);
  });

  it('ties go to the smaller start angle', () => {
    // Three bonds 120 apart: all gaps equal; order by start angle ascending.
    const gaps = bondGaps([unit(270), unit(30), unit(150)]);
    expect(gaps.map((g) => Math.round(norm360(g.start)))).toEqual([30, 150, 270]);
  });

  it('coincident bond directions make no empty gap', () => {
    const gaps = bondGaps([unit(0), unit(0), unit(180)]);
    expect(gaps).toHaveLength(2);
    near(gaps[0]!.size, Math.PI);
  });

  it('ignores zero vectors', () => {
    expect(bondGaps([{ x: 0, y: 0 }])).toEqual([]);
  });
});

describe('satelliteAngles', () => {
  const angles = (count: number, dirs: Point[]) =>
    satelliteAngles(count, dirs).map((a) => Math.round(norm360(a)));

  it('one bond: one satellite opposite', () => {
    expect(angles(1, [unit(0)])).toEqual([180]);
    expect(angles(1, [unit(90)])).toEqual([270]);
  });

  it('one bond, two satellites: thirds of the full turn', () => {
    expect(angles(2, [unit(0)])).toEqual([120, 240]);
  });

  it('two bonds: the largest gap first, then round-robin into the other', () => {
    // Bonds at 0 and 120: gaps 120->360 (240) and 0->120 (120).
    expect(angles(1, [unit(0), unit(120)])).toEqual([240]);
    expect(angles(2, [unit(0), unit(120)])).toEqual([240, 60]);
    // Third satellite goes back to the big gap: 2 in it at thirds.
    expect(angles(3, [unit(0), unit(120)])).toEqual([200, 60, 280]);
  });

  it('three bonds: gaps used in descending size', () => {
    // Bonds at 0, 90, 180: gaps 180->360 (180), 0->90, 90->180 (90 each; ties by start).
    expect(angles(3, [unit(0), unit(90), unit(180)])).toEqual([270, 45, 135]);
  });

  it('four bonds: a satellite sits in the first of the equal gaps', () => {
    expect(angles(1, [unit(0), unit(90), unit(180), unit(270)])).toEqual([45]);
  });

  it('k satellites in one gap sit at (j+1)/(k+1) of it', () => {
    // Bonds at 0 and 90 only; a single big gap 90->360 holds 3 of 4... use 2 gaps: sizes 270, 90.
    // 3 satellites: gap A (270) gets #0 and #2, gap B (90) gets #1.
    const a = satelliteAngles(3, [unit(0), unit(90)]).map((x) => norm360(x));
    near(a[0]!, 90 + 270 / 3);
    near(a[2]!, 90 + (2 * 270) / 3);
    near(a[1]!, 45);
  });

  it('a bare atom uses up, down, left, right', () => {
    expect(angles(4, [])).toEqual([270, 90, 180, 0]);
    expect(angles(1, [])).toEqual([270]);
    expect(angles(2, [])).toEqual([270, 90]);
  });

  it('a bare atom with more than four satellites spreads the extras within a slot', () => {
    const a = angles(5, []);
    expect(a).toHaveLength(5);
    // Slot "up" holds satellites 0 and 4, on either side of 270.
    expect(a[0]).not.toBe(a[4]);
    expect((a[0]! + a[4]!) / 2).toBeCloseTo(270, 0);
    expect(new Set(a).size).toBe(5);
  });

  it('is deterministic', () => {
    const dirs = [unit(10), unit(130), unit(250)];
    expect(satelliteAngles(5, dirs)).toEqual(satelliteAngles(5, dirs));
  });
});

describe('layoutSatellites', () => {
  const layout = (atom: Partial<Atom>, directions: Point[], labelBox: Rect | null = null) =>
    layoutSatellites({ atom: mk(atom), position: POS, directions, labelBox }, style);

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
    expect(layout({ charge: 1 }, [unit(0)], { x: 180, y: 70, w: 40, h: 60 })).toBeNull();
  });

  it('a charge on a vertex is a sign satellite, magnitude first when above 1', () => {
    expect(texts(layout({ charge: 1 }, [unit(0)])!.svg).map((t) => t.text)).toEqual(['+']);
    expect(texts(layout({ charge: -1 }, [unit(0)])!.svg).map((t) => t.text)).toEqual(['−']);
    expect(texts(layout({ charge: 2 }, [unit(0)])!.svg).map((t) => t.text)).toEqual(['2+']);
    expect(texts(layout({ charge: -3 }, [unit(0)])!.svg).map((t) => t.text)).toEqual(['3−']);
  });

  it('a charge on a labelled atom is not a satellite (it is in the label text)', () => {
    const box = { x: 180, y: 70, w: 40, h: 60 };
    expect(layout({ element: 'N', charge: 1 }, [unit(0)], box)).toBeNull();
  });

  it('charge sits in the large gap, at vertexGap + satelliteGap from the atom, box tangent', () => {
    const out = layout({ charge: 1 }, [unit(0)])!;
    const t = texts(out.svg)[0]!;
    expect(t.size).toBeCloseTo(70, 6);
    // Opposite the bond: to the left of the atom. The box's right edge is at the point.
    const w = (ADVANCE_REGULAR[0x2b]! * 70) / 1000;
    const right = t.x + w;
    near(right, POS.x - (style.vertexGap + style.satelliteGap), 4);
  });

  it('a lone pair is two dots pairSeparation apart, perpendicular to the direction', () => {
    const out = layout({ lonePairs: 1 }, [unit(0)])!;
    const [p, q] = dots(out.svg) as [Point, Point];
    const apart = Math.sqrt((p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y));
    near(apart, style.pairSeparation, 6);
    // Direction is left (180): the dots are stacked vertically.
    near(p.x, q.x, 6);
    near(p.y + q.y, 2 * POS.y, 6);
    near(p.x, POS.x - (style.vertexGap + style.satelliteGap), 6);
  });

  it('radical 1 is one dot, radical 2 two dots in two gaps', () => {
    expect(dots(layout({ radical: 1 }, [unit(0)])!.svg)).toHaveLength(1);
    const two = dots(layout({ radical: 2 }, [unit(0)])!.svg);
    expect(two).toHaveLength(2);
    expect(two[0]).not.toEqual(two[1]);
  });

  it('assignment order is charge, lone pairs, radical, partial charge, number', () => {
    const out = layout({ charge: 1, lonePairs: 1, radical: 1, partialCharge: 'δ+', number: '7' }, [
      unit(0),
    ])!;
    // Draw order in the markup follows assignment order: text, 2 dots, 1 dot, text, text.
    const tags = [...out.svg.matchAll(/<(text|circle)\b/g)].map((m) => m[1]);
    expect(tags).toEqual(['text', 'circle', 'circle', 'circle', 'text', 'text']);
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

  it('with a label, the distance starts at the full text box edge (past the H2 of NH2)', () => {
    // A wide label box centred on the atom: x 160..290 (as if "NH2": extra width to the right).
    const box = { x: 160, y: 64, w: 130, h: 72 };
    // Bond to the left; the satellite goes right, beyond the box.
    const out = layout({ element: 'N', lonePairs: 1 }, [unit(180)], box)!;
    const [p] = dots(out.svg) as [Point];
    near(p.x, 290 + style.satelliteGap, 6);
    near(p.y, POS.y - style.pairSeparation / 2, 6);
  });

  it('a bare atom puts the first satellite above, the second below', () => {
    const box = { x: 170, y: 64, w: 60, h: 72 };
    const out = layout({ element: 'Cl', lonePairs: 2 }, [], box)!;
    const d = dots(out.svg);
    expect(d).toHaveLength(4);
    // First pair above the atom, second below.
    expect(d[0]!.y).toBeLessThan(POS.y);
    expect(d[2]!.y).toBeGreaterThan(POS.y);
    near(d[0]!.y, box.y - style.satelliteGap, 6);
    near(d[2]!.y, box.y + box.h + style.satelliteGap, 6);
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

  it('text satellites are tangent to the point at the distance d', () => {
    // Direction up (270): the box's bottom edge touches the point above the vertex.
    const out = layout({ number: '1' }, [unit(90)])!;
    const d = style.vertexGap + style.satelliteGap;
    near(out.ink.y + out.ink.h, POS.y - d, 6);
    near(out.ink.x + out.ink.w / 2, POS.x, 6);
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
});
