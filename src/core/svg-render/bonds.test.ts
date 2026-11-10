import { describe, expect, it } from 'vitest';
import type { Atom, AtomId, Bond, BondId, Doc, Point, Rect } from '../doc-model';
import { buildAtomLabel, bondClipBoxes } from './atom-label';
import { length, normalize, rayExitBox } from './geom';
import { doubleSide, layoutBond, type BondEnd, type BondInput } from './bonds';
import { checkXml } from './__fixtures__/xml-check';
import { resolveStyle } from './style';

// Slides preset: L = 40, lineWidth 2, doubleGap 7.2, wedgeWide 5.6, hashSpacing 6.8.
const style = resolveStyle({ preset: 'slides', overrides: {} } as Doc['style']);
const L = 40;
const GAP = 7.2;
const near = (actual: number, expected: number, digits = 2) =>
  expect(actual).toBeCloseTo(expected, digits);

const bondOf = (over: Partial<Bond> = {}): Bond => ({
  id: 'b1' as BondId,
  a1: 'a1' as AtomId,
  a2: 'a2' as AtomId,
  order: 1,
  stereo: 'none',
  doublePlacement: 'auto',
  ...over,
});

const end = (
  pos: Point,
  others: Point[] = [],
  clip: Rect | readonly Rect[] | null = null,
): BondEnd => ({
  pos,
  clip: clip === null ? null : 'x' in clip ? [clip] : clip,
  others,
});

/** A bond along +x from (0,0) to (40,0); "left" is up (-y). */
function input(over: Partial<Bond> = {}, extra: Partial<BondInput> = {}): BondInput {
  return {
    bond: bondOf(over),
    a: end({ x: 0, y: 0 }),
    b: end({ x: L, y: 0 }),
    ringCentroid: null,
    circled: false,
    ...extra,
  };
}

interface Line {
  pts: Point[];
  width: number;
  stroke: string;
  dash: string | undefined;
}

function numbers(s: string): number[] {
  return (s.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

function lines(svg: string): Line[] {
  return [...svg.matchAll(/<path d="([^"]+)"([^>]*)\/>/g)].map((m) => {
    const nums = numbers(m[1]!);
    const pts: Point[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i]!, y: nums[i + 1]! });
    const attrs = m[2]!;
    return {
      pts,
      width: Number(/stroke-width="([^"]+)"/.exec(attrs)?.[1]),
      stroke: /stroke="([^"]+)"/.exec(attrs)?.[1] ?? '',
      dash: /stroke-dasharray="([^"]+)"/.exec(attrs)?.[1],
    };
  });
}

function polygons(svg: string): Point[][] {
  return [...svg.matchAll(/<polygon points="([^"]+)"/g)].map((m) => {
    const nums = numbers(m[1]!);
    const pts: Point[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i]!, y: nums[i + 1]! });
    return pts;
  });
}

function layout(i: BondInput) {
  const out = layoutBond(i, style);
  if (!out) throw new Error('bond not drawn');
  return out;
}

const ys = (l: Line) => l.pts.map((p) => p.y);
const xs = (l: Line) => l.pts.map((p) => p.x);
const sortedByY = (ls: Line[]) => [...ls].sort((p, q) => p.pts[0]!.y - q.pts[0]!.y);

describe('single bond', () => {
  it('is one round-capped line at lineWidth in ink black', () => {
    const out = layout(input());
    const ls = lines(out.svg);
    expect(ls).toHaveLength(1);
    expect(ls[0]!.pts).toEqual([
      { x: 0, y: 0 },
      { x: L, y: 0 },
    ]);
    expect(ls[0]!.width).toBe(2);
    expect(ls[0]!.stroke).toBe('#000000');
    expect(ls[0]!.dash).toBeUndefined();
  });

  it('uses the bond colour, lower-cased, never an atom colour', () => {
    const out = layout(input({ color: '#AA00FF' }));
    expect(lines(out.svg)[0]!.stroke).toBe('#aa00ff');
  });

  it('has an ink box grown by half the stroke width', () => {
    const out = layout(input());
    expect(out.ink).toEqual({ x: -1, y: -1, w: L + 2, h: 2 });
  });

  it('is well-formed markup with only allow-listed elements', () => {
    const out = layout(input({ order: 2 }));
    const { elements } = checkXml(`<g>${out.svg}</g>`);
    expect(elements.slice(1).every((e) => e.name === 'path')).toBe(true);
  });

  it('draws nothing for a zero-length bond or one hidden inside its label boxes', () => {
    expect(layoutBond(input({}, { b: end({ x: 0, y: 0 }) }), style)).toBeNull();
    const big: Rect = { x: -50, y: -50, w: 200, h: 100 };
    expect(layoutBond(input({}, { a: end({ x: 0, y: 0 }, [], big) }), style)).toBeNull();
  });
});

describe('double bond', () => {
  it('center: two lines at +-doubleGap/2', () => {
    const ls = sortedByY(lines(layout(input({ order: 2, doublePlacement: 'center' })).svg));
    expect(ls).toHaveLength(2);
    near(ls[0]!.pts[0]!.y, -GAP / 2);
    near(ls[1]!.pts[0]!.y, GAP / 2);
    expect(xs(ls[0]!)).toEqual([0, L]);
  });

  it('left: main line on the axis, second doubleGap to the visual left (up when east)', () => {
    const ls = lines(layout(input({ order: 2, doublePlacement: 'left' })).svg);
    expect(ys(ls[0]!)).toEqual([0, 0]);
    near(ls[1]!.pts[0]!.y, -GAP);
  });

  it('right: second line to the visual right (down when east)', () => {
    const ls = lines(layout(input({ order: 2, doublePlacement: 'right' })).svg);
    near(ls[1]!.pts[0]!.y, GAP);
  });

  it('left/right follow the direction of travel', () => {
    const west = input(
      { order: 2, doublePlacement: 'left' },
      { a: end({ x: L, y: 0 }), b: end({ x: 0, y: 0 }) },
    );
    near(lines(layout(west).svg)[1]!.pts[0]!.y, GAP); // travelling west, left is down
  });

  it('ink covers both lines', () => {
    const out = layout(input({ order: 2, doublePlacement: 'center' }));
    near(out.ink.y, -GAP / 2 - 1);
    near(out.ink.h, GAP + 2);
  });
});

describe('double-bond side decision table', () => {
  const up: Point = { x: 10, y: -20 };
  const down: Point = { x: 10, y: 20 };
  const side = (extra: Partial<BondInput>, over: Partial<Bond> = { order: 2 }) =>
    doubleSide(input(over, extra));

  it('explicit placements win', () => {
    expect(side({}, { order: 2, doublePlacement: 'left' })).toBe('left');
    expect(side({}, { order: 2, doublePlacement: 'right' })).toBe('right');
    expect(side({}, { order: 2, doublePlacement: 'center' })).toBe('center');
  });

  it('auto in a ring: towards the ring centroid', () => {
    expect(side({ ringCentroid: { x: 20, y: 30 } })).toBe('right'); // below when east
    expect(side({ ringCentroid: { x: 20, y: -30 } })).toBe('left');
  });

  it('auto in a chain: more neighbours on one side puts the second line there', () => {
    expect(side({ a: end({ x: 0, y: 0 }, [up]) })).toBe('left');
    expect(side({ b: end({ x: L, y: 0 }, [down, { x: 30, y: 30 }]) })).toBe('right');
    expect(side({ a: end({ x: 0, y: 0 }, [up, down]), b: end({ x: L, y: 0 }, [up]) })).toBe('left');
  });

  it('auto in a chain: equal counts, including none, centre both lines', () => {
    expect(side({})).toBe('center');
    expect(side({ a: end({ x: 0, y: 0 }, [up, down]) })).toBe('center');
    expect(side({ a: end({ x: 0, y: 0 }, [up]), b: end({ x: L, y: 0 }, [down]) })).toBe('center');
  });

  it('auto, terminal C=O: the carbon has one neighbour on each side', () => {
    // C at the left end with a methyl up and a hydroxyl down; the oxygen end is bare.
    expect(side({ a: end({ x: 0, y: 0 }, [up, down]) })).toBe('center');
  });

  it('neighbours exactly on the axis count for neither side', () => {
    expect(side({ a: end({ x: 0, y: 0 }, [{ x: -30, y: 0 }]) })).toBe('center');
  });

  it('a 1.5 bond with auto is centred', () => {
    expect(side({ ringCentroid: { x: 20, y: 30 } }, { order: 1.5 })).toBe('center');
    expect(side({}, { order: 1.5, doublePlacement: 'right' })).toBe('right');
  });
});

describe('end shortening of a shifted second line', () => {
  // Hexagon bond along +x: the ring lies below, neighbours leave at 120 degrees.
  const ring = (extra: Partial<BondInput> = {}): BondInput =>
    input(
      { order: 2 },
      {
        a: end({ x: 0, y: 0 }, [{ x: -20, y: 34.641 }]),
        b: end({ x: L, y: 0 }, [{ x: 20, y: 34.641 }]),
        ringCentroid: { x: 20, y: 34.641 },
        ...extra,
      },
    );

  it('benzene: 0.104 L at both ends of the inside line', () => {
    const ls = lines(layout(ring()).svg);
    const inner = ls.find((l) => l.pts[0]!.y > 1)!;
    near(inner.pts[0]!.y, GAP);
    near(inner.pts[0]!.x, 0.104 * L, 2);
    near(inner.pts[1]!.x, L - 0.104 * L, 2);
    const outer = ls.find((l) => l.pts[0]!.y === 0)!;
    expect(xs(outer)).toEqual([0, L]); // the main line is not shortened
  });

  it('no neighbour on that side: no shortening', () => {
    const ls = lines(
      layout(input({ order: 2, doublePlacement: 'right' }, { ringCentroid: null })).svg,
    );
    expect(xs(ls[1]!)).toEqual([0, L]);
  });

  it('neighbours only on the other side do not shorten', () => {
    const i = input(
      { order: 2, doublePlacement: 'right' },
      { a: end({ x: 0, y: 0 }, [{ x: -20, y: -34 }]), b: end({ x: L, y: 0 }, [{ x: 20, y: -34 }]) },
    );
    expect(xs(lines(layout(i).svg)[1]!)).toEqual([0, L]);
  });

  it('uses the nearest neighbour on that side', () => {
    // Two neighbours at the first atom: 120 degrees and 90 degrees; the nearer one (90) rules.
    const i = ring({
      a: end({ x: 0, y: 0 }, [
        { x: -20, y: 34.641 },
        { x: 0, y: 30 },
      ]),
    });
    const inner = lines(layout(i).svg).find((l) => l.pts[0]!.y > 1)!;
    near(inner.pts[0]!.x, GAP * (Math.cos(Math.PI / 4) / Math.sin(Math.PI / 4)), 2);
  });

  it('clamps the angle to 30..150 degrees', () => {
    // A neighbour 170 degrees from the bond clamps to 150: cot(75) * gap = 1.93.
    const i = input(
      { order: 2, doublePlacement: 'right' },
      { a: end({ x: 0, y: 0 }, [{ x: -30, y: 5.29 }]) },
    );
    const inner = lines(layout(i).svg)[1]!;
    near(inner.pts[0]!.x, GAP * (Math.cos((5 * Math.PI) / 12) / Math.sin((5 * Math.PI) / 12)), 2);
  });

  it('total shortening is at most half a bond length', () => {
    // 10 degrees clamps to 30: cot(15) * gap = 26.9 per end; both ends are capped to 0.5 L total.
    const i = input(
      { order: 2, doublePlacement: 'right' },
      {
        a: end({ x: 0, y: 0 }, [{ x: 30, y: 5.29 }]),
        b: end({ x: L, y: 0 }, [{ x: -30, y: 5.29 }]),
      },
    );
    const inner = lines(layout(i).svg)[1]!;
    near(inner.pts[1]!.x - inner.pts[0]!.x, L - 0.5 * L);
  });

  it('drops a second line that shortening would consume (very short bond)', () => {
    const i = input(
      { order: 2, doublePlacement: 'right' },
      {
        a: end({ x: 0, y: 0 }, [{ x: 30, y: 5.29 }]),
        b: end({ x: 4, y: 0 }, [{ x: -30, y: 5.29 }]),
      },
    );
    expect(lines(layout(i).svg)).toHaveLength(1);
  });
});

describe('triple bond', () => {
  it('is the axis line plus lines at +-doubleGap, whatever the placement', () => {
    for (const p of ['auto', 'left', 'right', 'center'] as const) {
      const ls = sortedByY(lines(layout(input({ order: 3, doublePlacement: p })).svg));
      expect(ls).toHaveLength(3);
      near(ls[0]!.pts[0]!.y, -GAP);
      near(ls[1]!.pts[0]!.y, 0);
      near(ls[2]!.pts[0]!.y, GAP);
    }
  });
});

describe('1.5 bonds', () => {
  it('in a circled ring: one plain line', () => {
    const ls = lines(layout(input({ order: 1.5 }, { circled: true })).svg);
    expect(ls).toHaveLength(1);
    expect(ls[0]!.dash).toBeUndefined();
  });

  it('elsewhere, auto: solid line on the left, dashed on the right, centred', () => {
    const ls = lines(layout(input({ order: 1.5 })).svg);
    expect(ls).toHaveLength(2);
    const solid = ls.find((l) => l.dash === undefined)!;
    const dashed = ls.find((l) => l.dash !== undefined)!;
    near(solid.pts[0]!.y, -GAP / 2);
    near(dashed.pts[0]!.y, GAP / 2);
    expect(dashed.dash).toBe('10 6');
  });

  it('left/right: solid on the axis, dashed doubleGap to that side', () => {
    const left = lines(layout(input({ order: 1.5, doublePlacement: 'left' })).svg);
    near(left.find((l) => l.dash !== undefined)!.pts[0]!.y, -GAP);
    expect(ys(left.find((l) => l.dash === undefined)!)).toEqual([0, 0]);
    const right = lines(layout(input({ order: 1.5, doublePlacement: 'right' })).svg);
    near(right.find((l) => l.dash !== undefined)!.pts[0]!.y, GAP);
  });

  it('a shifted dashed line is shortened like a double bond second line', () => {
    const i = input(
      { order: 1.5, doublePlacement: 'right' },
      { a: end({ x: 0, y: 0 }, [{ x: -20, y: 34.641 }]) },
    );
    const dashed = lines(layout(i).svg).find((l) => l.dash !== undefined)!;
    near(dashed.pts[0]!.x, 0.104 * L, 2);
  });

  it('a stereo flag is ignored on a 1.5 bond', () => {
    const ls = lines(layout(input({ order: 1.5, stereo: 'wedge' })).svg);
    expect(ls).toHaveLength(2);
  });
});

describe('stereo bonds', () => {
  it('wedge: point at the first atom, wedgeWide at the second', () => {
    const polys = polygons(layout(input({ stereo: 'wedge' })).svg);
    expect(polys).toHaveLength(1);
    const p = polys[0]!;
    expect(p[0]).toEqual({ x: 0, y: 0 });
    const wide = p.filter((q) => q.x === L);
    expect(wide.map((q) => q.y).sort((a, b) => a - b)).toEqual([-2.8, 2.8]);
  });

  it('wedge is filled with no stroke, in the bond colour', () => {
    const svg = layout(input({ stereo: 'wedge', color: '#ff0000' })).svg;
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('stroke="none"');
  });

  it('wedge ink is the polygon box', () => {
    const ink = layout(input({ stereo: 'wedge' })).ink;
    near(ink.x, 0);
    near(ink.y, -2.8);
    near(ink.w, L);
    near(ink.h, 5.6);
  });

  it('hash: round(len / hashSpacing) lines at t = (i + 0.5) / n, growing to wedgeWide', () => {
    const ls = lines(layout(input({ stereo: 'hash' })).svg);
    const n = Math.max(3, Math.round(L / 6.8));
    expect(ls).toHaveLength(n);
    ls.forEach((l, i) => {
      const t = (i + 0.5) / n;
      near(l.pts[0]!.x, t * L, 2);
      near(l.pts[1]!.x, t * L, 2);
      near(Math.abs(l.pts[0]!.y), 2.8 * t, 2);
      near(l.pts[0]!.y, -l.pts[1]!.y, 2);
    });
  });

  it('hash has at least three lines on a short bond', () => {
    const i = input({ stereo: 'hash' }, { b: end({ x: 8, y: 0 }) });
    expect(lines(layout(i).svg)).toHaveLength(3);
  });

  it('bold: a filled rectangle boldWidth wide', () => {
    const polys = polygons(layout(input({ stereo: 'bold' })).svg);
    expect(polys).toHaveLength(1);
    expect(polys[0]!.map((p) => p.y).sort((a, b) => a - b)).toEqual([-2.8, -2.8, 2.8, 2.8]);
    expect(polys[0]!.map((p) => p.x).sort((a, b) => a - b)).toEqual([0, 0, L, L]);
  });

  it('wavy: a quadratic path of 2*round(len/wavyLength/2) half-waves, amplitude 0.07 L', () => {
    const svg = layout(input({ stereo: 'wavy' })).svg;
    expect(svg).toMatch(/^<path d="M0 0(?:Q[^Q]+){6}"/);
    const ls = lines(svg);
    expect(ls).toHaveLength(1);
    const last = ls[0]!.pts[ls[0]!.pts.length - 1]!;
    near(last.x, L);
    near(last.y, 0);
    // Control points alternate sides at twice the amplitude.
    const controls = ls[0]!.pts.filter((_, i) => i % 2 === 1);
    expect(controls.map((c) => Math.sign(c.y))).toEqual([1, -1, 1, -1, 1, -1]);
    near(Math.abs(controls[0]!.y), 2 * 2.8);
  });

  it('wavy ink uses the exact curve extrema (peak = amplitude), not the control points', () => {
    const out = layout(input({ stereo: 'wavy' }));
    near(out.ink.y, -2.8 - 1, 2);
    near(out.ink.h, 2 * (2.8 + 1), 2);
  });

  it('wavy has at least two half-waves on a short bond', () => {
    const svg = layout(input({ stereo: 'wavy' }, { b: end({ x: 3, y: 0 }) })).svg;
    expect(svg.match(/Q/g)).toHaveLength(2);
  });

  it.each(['wedge', 'hash', 'bold', 'wavy'] as const)(
    '%s on a double bond is ignored: drawn as its order',
    (stereo) => {
      const svg = layout(input({ order: 2, stereo, doublePlacement: 'center' })).svg;
      expect(lines(svg)).toHaveLength(2);
      expect(svg).not.toContain('<polygon');
      expect(svg).not.toContain('Q');
    },
  );

  it('stereo is ignored on a triple bond too', () => {
    expect(lines(layout(input({ order: 3, stereo: 'wedge' })).svg)).toHaveLength(3);
  });
});

describe('clipping at label boxes', () => {
  const boxAtB: Rect = { x: 30, y: -10, w: 30, h: 20 }; // contains (40, 0)
  const boxAtA: Rect = { x: -20, y: -10, w: 30, h: 20 }; // contains (0, 0), right edge x = 10

  it('a single bond stops at the box edges', () => {
    const i = input({}, { a: end({ x: 0, y: 0 }, [], boxAtA), b: end({ x: L, y: 0 }, [], boxAtB) });
    expect(lines(layout(i).svg)[0]!.pts).toEqual([
      { x: 10, y: 0 },
      { x: 30, y: 0 },
    ]);
  });

  it('double lines are both clipped out of the box', () => {
    const i = input(
      { order: 2, doublePlacement: 'center' },
      { b: end({ x: L, y: 0 }, [], boxAtB) },
    );
    for (const l of lines(layout(i).svg)) near(l.pts[1]!.x, 30);
  });

  it('a wedge is clipped along the axis and keeps its width profile', () => {
    const i = input({ stereo: 'wedge' }, { b: end({ x: L, y: 0 }, [], boxAtB) });
    const p = polygons(layout(i).svg)[0]!;
    const xsAt = p.map((q) => q.x);
    expect(Math.max(...xsAt)).toBeCloseTo(30, 6);
    const wideY = p.filter((q) => Math.abs(q.x - 30) < 1e-6).map((q) => Math.abs(q.y));
    near(wideY[0]!, 2.8 * (30 / L), 3); // 2.1, not 2.8
  });

  it('a wedge clipped at its narrow end starts with a flat edge at the profile width', () => {
    const i = input({ stereo: 'wedge' }, { a: end({ x: 0, y: 0 }, [], boxAtA) });
    const p = polygons(layout(i).svg)[0]!;
    expect(p).toHaveLength(4);
    near(Math.min(...p.map((q) => q.x)), 10);
    near(Math.abs(p.find((q) => Math.abs(q.x - 10) < 1e-6)!.y), 2.8 * (10 / L), 3);
  });

  it('hash lines whose centre falls inside a box are dropped', () => {
    const i = input({ stereo: 'hash' }, { b: end({ x: L, y: 0 }, [], boxAtB) });
    const ls = lines(layout(i).svg);
    const n = Math.max(3, Math.round(L / 6.8));
    expect(ls.length).toBeLessThan(n);
    expect(Math.max(...ls.map((l) => l.pts[0]!.x))).toBeLessThanOrEqual(30);
  });

  it('bold and wavy are clipped along the axis', () => {
    const bold = polygons(
      layout(input({ stereo: 'bold' }, { b: end({ x: L, y: 0 }, [], boxAtB) })).svg,
    )[0]!;
    near(Math.max(...bold.map((q) => q.x)), 30);
    const wavy = lines(
      layout(input({ stereo: 'wavy' }, { b: end({ x: L, y: 0 }, [], boxAtB) })).svg,
    )[0]!;
    near(wavy.pts[wavy.pts.length - 1]!.x, 30);
  });

  it('a wedge at an OH label ends before the label text', () => {
    const fs100 = resolveStyle({ preset: 'slides', overrides: { fontSize: 100 } } as Doc['style']);
    const atom: Atom = {
      id: 'a2' as AtomId,
      x: 0,
      y: 0,
      element: 'O',
      charge: 0,
      radical: 0,
    };
    const pos = { x: 200, y: 100 };
    const label = buildAtomLabel(
      { atom, implicitH: 1, neighbors: [{ x: -140, y: 0 }], position: pos },
      fs100,
    );
    const clip = bondClipBoxes(label, fs100);
    const i: BondInput = {
      bond: bondOf({ stereo: 'wedge' }),
      a: end({ x: 60, y: 100 }),
      b: end(pos, [], clip),
      ringCentroid: null,
      circled: false,
    };
    const out = layoutBond(i, fs100)!;
    const maxX = Math.max(...polygons(out.svg)[0]!.map((q) => q.x));
    near(maxX, label.anchorBox.x - fs100.labelMargin, 6);
    expect(maxX).toBeLessThan(label.textBox.x);
  });
});

describe('bond ends at abbreviation labels', () => {
  const fs100 = resolveStyle({ preset: 'slides', overrides: { fontSize: 100 } } as Doc['style']);
  const pos = { x: 200, y: 100 };
  const atom = (label: string): Atom => ({
    id: 'a2' as AtomId,
    x: 0,
    y: 0,
    element: 'C',
    label,
    charge: 0,
    radical: 0,
  });

  /** The x where a horizontal single bond from `from` stops at the labelled atom at `pos`. */
  function stopX(label: string, from: Point): number {
    const toward = { x: from.x - pos.x, y: from.y - pos.y };
    const built = buildAtomLabel(
      { atom: atom(label), implicitH: 0, neighbors: [toward], position: pos },
      fs100,
    );
    const clip = bondClipBoxes(built, fs100);
    const i: BondInput = {
      bond: bondOf(),
      a: end(from),
      b: end(pos, [], clip),
      ringCentroid: null,
      circled: false,
    };
    const l = lines(layoutBond(i, fs100)!.svg)[0]!;
    return l.pts[1]!.x;
  }

  const rows: [string, 'left' | 'right', string][] = [
    ['CO2H', 'left', 'C'],
    ['CO2H', 'right', 'C'],
    ['OMe', 'left', 'O'],
    ['OMe', 'right', 'O'],
    ['NO2', 'left', 'N'],
    ['NO2', 'right', 'N'],
  ];
  it.each(rows)(
    '%s with the bond on the %s attaches through the %s glyph',
    (label, where, glyph) => {
      const from = where === 'left' ? { x: 0, y: 100 } : { x: 400, y: 100 };
      const built = buildAtomLabel(
        {
          atom: atom(label),
          implicitH: 0,
          neighbors: [{ x: from.x - pos.x, y: 0 }],
          position: pos,
        },
        fs100,
      );
      const stop = stopX(label, from);
      const a = built.anchorBox;
      if (where === 'left') near(stop, a.x - fs100.labelMargin, 6);
      else near(stop, a.x + a.w + fs100.labelMargin, 6);
      // The anchor box is the attachment glyph only: its width is that glyph's advance.
      const glyphWidth: Record<string, number> = { C: 72.2, O: 77.8, N: 72.2 };
      near(a.w, glyphWidth[glyph]!, 1);
    },
  );
});

describe('determinism and safety', () => {
  it('is byte-identical for equal input', () => {
    const a = layout(input({ order: 2, stereo: 'none' })).svg;
    const b = layout(input({ order: 2, stereo: 'none' })).svg;
    expect(a).toBe(b);
  });

  it('writes numbers with at most three decimals', () => {
    const svg = layout(
      input(
        { stereo: 'wavy' },
        { a: end({ x: 0.123456789, y: 0.987654321 }), b: end({ x: 33.3333333, y: 17.7777777 }) },
      ),
    ).svg;
    for (const n of svg.match(/-?\d+(?:\.\d+)?/g) ?? []) expect(n).toMatch(/^-?\d+(\.\d{1,3})?$/);
  });
});

describe('clipping per glyph box', () => {
  const st = resolveStyle({ preset: 'slides', overrides: { fontSize: 24 } } as Doc['style']);
  const pos = { x: 200, y: 100 };
  const atomOf = (over: Partial<Atom>): Atom => ({
    id: 'a2' as AtomId,
    x: 0,
    y: 0,
    element: 'C',
    charge: 0,
    radical: 0,
    ...over,
  });

  /** The bond from a skeleton atom `len` away (towards `dir`) to the labelled atom at `pos`. */
  function stopDistance(
    atom: Atom,
    implicitH: number,
    neighbors: Point[],
    dir: Point,
    len = 40,
  ): { stop: number; label: ReturnType<typeof buildAtomLabel> } {
    const u = normalize(dir)!;
    const label = buildAtomLabel({ atom, implicitH, neighbors, position: pos }, st);
    const from = { x: pos.x + u.x * len, y: pos.y + u.y * len };
    const i: BondInput = {
      bond: bondOf(),
      a: end(from),
      b: end(pos, [], bondClipBoxes(label, st)),
      ringCentroid: null,
      circled: false,
    };
    const out = layoutBond(i, st);
    const l = out ? lines(out.svg)[0] : undefined;
    // Distance from the labelled atom to where the drawn line stops.
    const stop = l ? length({ x: l.pts[1]!.x - pos.x, y: l.pts[1]!.y - pos.y }) : len;
    return { stop, label };
  }

  /** Distance from the atom to where its ray leaves the anchor box grown by the margin. */
  const symbolExit = (label: ReturnType<typeof buildAtomLabel>, dir: Point): number => {
    const box = {
      x: label.anchorBox.x - st.labelMargin,
      y: label.anchorBox.y - st.labelMargin,
      w: label.anchorBox.w + 2 * st.labelMargin,
      h: label.anchorBox.h + 2 * st.labelMargin,
    };
    return rayExitBox(pos, normalize(dir)!, box)!;
  };

  it('nitromethane: the N+ to CH3 bond lower right is not shortened by the + sign', () => {
    const toC = { x: 1, y: 0.7 };
    const n = atomOf({ element: 'N', charge: 1 });
    const { stop, label } = stopDistance(n, 0, [toC, { x: -1, y: -0.8 }, { x: -1, y: 0.8 }], toC);
    expect(label.chargeBox).not.toBeNull();
    near(stop, symbolExit(label, toC));
    expect(40 - stop).toBeGreaterThanOrEqual(0.6 * (40 - symbolExit(label, toC)));
  });

  it('a bond passing under a superscript charge stops at the symbol box', () => {
    const dir = { x: 1, y: 0.35 };
    const { stop, label } = stopDistance(atomOf({ element: 'O', charge: -1 }), 0, [dir], dir);
    expect(label.chargeBox).not.toBeNull();
    near(stop, symbolExit(label, dir));
  });

  it('a bond passing over a subscript count stops at the symbol box', () => {
    // NH2, bond to the left, so the H2 stands on the right; a steep bond up-right leaves through
    // the top of the N and clears both the H and the lowered subscript.
    const steep = { x: 1, y: -3 };
    const { stop, label } = stopDistance(atomOf({ element: 'N' }), 2, [{ x: -1, y: 0 }], steep);
    expect(label.obstacles.length).toBeGreaterThan(1);
    near(stop, symbolExit(label, steep));
  });

  it('NH2: a bond leaving up-right still stops before the H2', () => {
    const dir = { x: 1, y: -0.3 };
    const { stop, label } = stopDistance(atomOf({ element: 'N' }), 2, [{ x: -1, y: 0 }], dir);
    const lastX = pos.x + normalize(dir)!.x * stop;
    const h = label.obstacles[0]!; // the H; the raised bond clears the lowered 2
    near(lastX, h.x + h.w + st.labelMargin);
  });
});
