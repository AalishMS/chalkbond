import { describe, expect, it } from 'vitest';
import {
  addAtom,
  addBond,
  emptyDoc,
  type Atom,
  type AtomId,
  type AtomInit,
  type Doc,
  type Point,
  type Rect,
} from '../doc-model';
import { inkScan } from './__fixtures__/ink-scan';
import { layoutAtom, type AtomLayout } from './__fixtures__/atom-satellites';
import { render } from './render';
import type { Slot } from './satellites';
import { resolveStyle } from './style';

// SPEC-svg-render.md "Satellites": eight slots round the element symbol's glyph box (cap height
// tall, advance wide; a skeleton vertex's box is the point). These tests assert which slot each
// satellite takes and where its ink lies, not just that nothing overlaps.
const FS = 100;
const style = resolveStyle({ preset: 'slides', overrides: { fontSize: FS } } as Doc['style']);
const GAP = 0.1 * FS;
const R = 0.05 * FS;
const SEP = 0.24 * FS;
const EPS = 1e-6;
const POS: Point = { x: 300, y: 200 };
const BOND = 120;
const S2 = Math.SQRT1_2;

const unit = (deg: number): Point => ({
  x: Math.cos((deg * Math.PI) / 180),
  y: Math.sin((deg * Math.PI) / 180),
});
const mk = (over: Partial<Atom>): Atom => ({
  id: 'a1' as AtomId,
  x: 0,
  y: 0,
  element: 'C',
  charge: 0,
  radical: 0,
  ...over,
});

interface Case {
  readonly atom: Partial<Atom>;
  /** Bond directions, screen degrees. */
  readonly bonds?: readonly number[];
  readonly implicitH?: number;
  readonly vertex?: boolean;
}

function lay(c: Case): AtomLayout & { ref: Rect; slots: Slot[]; dots: Point[][] } {
  const directions = (c.bonds ?? []).map((d) => ({ x: unit(d).x * BOND, y: unit(d).y * BOND }));
  const out = layoutAtom(mk(c.atom), POS, directions, style, {
    implicitH: c.implicitH ?? 0,
    vertex: c.vertex ?? false,
  });
  expect(out.sats).not.toBeNull();
  const ref = out.label ? out.label.symbolBox : { x: POS.x, y: POS.y, w: 0, h: 0 };
  const dots = out.sats!.rects.map((rs) => rs.map((r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })));
  return { ...out, ref, slots: out.sats!.placements.map((p) => p.slot), dots };
}

const near = (a: number, b: number, msg?: string) =>
  expect(Math.abs(a - b), msg).toBeLessThan(EPS * 1e3);

/** Expected centre of a pair (or dot) at a cardinal slot of `ref`. */
function cardinalCentre(slot: 'N' | 'E' | 'S' | 'W', ref: Rect): Point {
  const cx = ref.x + ref.w / 2;
  const cy = ref.y + ref.h / 2;
  switch (slot) {
    case 'N':
      return { x: cx, y: ref.y - GAP - R };
    case 'S':
      return { x: cx, y: ref.y + ref.h + GAP + R };
    case 'E':
      return { x: ref.x + ref.w + GAP + R, y: cy };
    case 'W':
      return { x: ref.x - GAP - R, y: cy };
  }
}

/** The two dots of a pair at a cardinal slot lie along the box edge, `SEP` apart, centred. */
function expectPairAt(l: ReturnType<typeof lay>, index: number, slot: 'N' | 'E' | 'S' | 'W') {
  expect(l.slots[index], `satellite ${index} slot`).toBe(slot);
  const [a, b] = l.dots[index] as [Point, Point];
  const c = cardinalCentre(slot, l.ref);
  near((a.x + b.x) / 2, c.x, `pair ${index} centre x`);
  near((a.y + b.y) / 2, c.y, `pair ${index} centre y`);
  if (slot === 'N' || slot === 'S') {
    near(a.y, b.y);
    near(Math.abs(a.x - b.x), SEP);
  } else {
    near(a.x, b.x);
    near(Math.abs(a.y - b.y), SEP);
  }
}

const slotSet = (l: { slots: Slot[] }, from: number, to: number) => l.slots.slice(from, to).sort();

describe('lone pairs of bare atoms', () => {
  const pairs3 = { element: 'O', charge: -1, lonePairs: 3 };

  it('OH-, typed label: pairs at N, S, W of the O (the H holds the east)', () => {
    const l = lay({ atom: { ...pairs3, label: 'OH' } });
    expect(l.slots).toEqual(['N', 'S', 'W']);
    expectPairAt(l, 0, 'N');
    expectPairAt(l, 1, 'S');
    expectPairAt(l, 2, 'W');
    // The reference box is the O alone, cap height tall.
    near(l.ref.h, 0.716 * FS);
    expect(l.ref.w).toBeLessThan(l.label!.textBox.w);
  });

  it('OH-, element O with one implicit H: the same slots', () => {
    const l = lay({ atom: pairs3, implicitH: 1 });
    expect(l.label!.text).toBe('OH−');
    expect(l.slots).toEqual(['N', 'S', 'W']);
  });

  it('HO-, H on the left: pairs at N, S, E; the charge starts a gap beyond the E pair', () => {
    const l = lay({ atom: { ...pairs3, label: 'HO' } });
    expect(l.slots).toEqual(['N', 'S', 'E']);
    expectPairAt(l, 2, 'E');
    const pairRight = l.ref.x + l.ref.w + GAP + 2 * R;
    const charge = l.label!.chargeBox!;
    near(charge.x, pairRight + GAP, 'charge starts gap beyond the pair');
    expect(l.sats!.chargeShift).toBeGreaterThan(0);
    // The shifted charge lies inside the label's text and ink boxes.
    expect(charge.x + charge.w).toBeLessThanOrEqual(l.label!.textBox.x + l.label!.textBox.w + EPS);
    expect(charge.x + charge.w).toBeLessThanOrEqual(l.label!.inkBox.x + l.label!.inkBox.w + EPS);
  });

  it('H2O: lone pairs at N and S of the O', () => {
    const l = lay({ atom: { element: 'O', lonePairs: 2 }, implicitH: 2 });
    expect(l.label!.text).toBe('H2O');
    expect(l.slots).toEqual(['N', 'S']);
    expectPairAt(l, 0, 'N');
    expectPairAt(l, 1, 'S');
  });

  it('NH3: the lone pair at N of the N', () => {
    const l = lay({ atom: { element: 'N', lonePairs: 1 }, implicitH: 3 });
    expect(l.slots).toEqual(['N']);
    expectPairAt(l, 0, 'N');
  });

  it('without bonds the third pair goes opposite the H part, the fourth to the remaining cardinal', () => {
    // The remaining cardinal is the H's own side: blocked, so the fourth pair takes a diagonal.
    expect(lay({ atom: { element: 'O', label: 'OH', lonePairs: 4 } }).slots).toEqual([
      'N',
      'S',
      'W',
      'NW',
    ]);
    expect(lay({ atom: { element: 'O', label: 'HO', lonePairs: 4 } }).slots).toEqual([
      'N',
      'S',
      'E',
      'NE',
    ]);
    // A bare symbol with no H part: E before W.
    expect(lay({ atom: { element: 'Cl', lonePairs: 3 } }).slots).toEqual(['N', 'S', 'E']);
  });

  it('N and S pairs are centred horizontally on the element symbol, not the whole label', () => {
    for (const label of ['OH', 'HO']) {
      const l = lay({ atom: { element: 'O', label, lonePairs: 2 } });
      for (const dots of l.dots) {
        near((dots[0]!.x + dots[1]!.x) / 2, l.ref.x + l.ref.w / 2);
      }
    }
  });
});

describe('satellites of bonded atoms', () => {
  const hcl = (partial: 'δ-' | 'δ+') =>
    lay({
      atom: { element: 'Cl', lonePairs: 3, partialCharge: partial },
      bonds: [180],
    });

  it('H-Cl, bond to the west: Cl pairs at E, N, S (farthest from the bond first), δ- at NE', () => {
    const l = hcl('δ-');
    expect(l.slots).toEqual(['E', 'N', 'S', 'NE']);
    expectPairAt(l, 0, 'E');
    expectPairAt(l, 1, 'N');
    expectPairAt(l, 2, 'S');
    // δ- hangs off the NE corner: its nearest corner is `gap` away along the diagonal.
    const box = l.sats!.boxes[3] as Rect;
    near(box.x - (l.ref.x + l.ref.w), GAP * S2, 'δ- right of the corner');
    near(l.ref.y - (box.y + box.h), GAP * S2, 'δ- above the corner');
  });

  it('H-Cl: δ+ on the H sits at N of the H, bond to the east', () => {
    const l = lay({ atom: { element: 'H', partialCharge: 'δ+' }, bonds: [0] });
    expect(l.slots).toEqual(['N']);
    const box = l.sats!.boxes[0] as Rect;
    near(l.ref.y - (box.y + box.h), GAP);
    near(box.x + box.w / 2, l.ref.x + l.ref.w / 2);
  });

  it('C-Br: Br pairs at E, N, S and δ- at NE; the carbon vertex has δ+ at N of the point', () => {
    const br = lay({
      atom: { element: 'Br', lonePairs: 3, partialCharge: 'δ-' },
      bonds: [180],
    });
    expect(br.slots).toEqual(['E', 'N', 'S', 'NE']);
    const c = lay({ atom: { partialCharge: 'δ+' }, bonds: [0], vertex: true });
    expect(c.slots).toEqual(['N']);
    const box = c.sats!.boxes[0] as Rect;
    near(POS.y - (box.y + box.h), GAP, 'gap from the point');
    near(box.x + box.w / 2, POS.x);
  });

  it('methyl radical on a vertex with two bonds: the dot is on the side opposite them', () => {
    const down = lay({ atom: { radical: 1 }, bonds: [210, 330], vertex: true });
    expect(down.slots).toEqual(['S']);
    near(down.dots[0]![0]!.x, POS.x);
    near(down.dots[0]![0]!.y, POS.y + GAP + R);
    const up = lay({ atom: { radical: 1 }, bonds: [30, 150], vertex: true });
    expect(up.slots).toEqual(['N']);
    near(up.dots[0]![0]!.y, POS.y - GAP - R);
    const right = lay({ atom: { radical: 1 }, bonds: [135, 225], vertex: true });
    expect(right.slots).toEqual(['E']);
  });

  it('carbanion on a vertex: the lone pair opposite the bonds, the charge sign at SE, not in the notch', () => {
    const l = lay({ atom: { charge: -1, lonePairs: 1 }, bonds: [210, 330], vertex: true });
    expect(l.slots).toEqual(['S', 'SE']);
    expectPairAt(l, 0, 'S');
    expect(l.sats!.svg).toContain('−');
    const box = l.sats!.boxes[1] as Rect;
    // Slid out along the diagonal in whole gaps until it clears the pair's dots.
    near(box.x - POS.x, box.y - POS.y);
    const steps = (box.x - POS.x) / (GAP * Math.SQRT1_2);
    near(steps, Math.round(steps));
    expect(steps).toBeGreaterThanOrEqual(1);
    const pair = l.sats!.rects[0] as Rect[];
    for (const d of pair) {
      expect(
        box.x < d.x + d.w && d.x < box.x + box.w && box.y < d.y + d.h && d.y < box.y + box.h,
      ).toBe(false);
    }
  });

  it('a vertex charge takes the free slot farthest from any bond, ties N, NE, E, SE, S, SW, W, NW', () => {
    expect(lay({ atom: { charge: 1 }, vertex: true }).slots).toEqual(['N']);
    expect(lay({ atom: { charge: 1 }, bonds: [0], vertex: true }).slots).toEqual(['W']);
    expect(lay({ atom: { charge: 1 }, bonds: [90, 270], vertex: true }).slots).toEqual(['E']);
  });

  it('a bond blocks a slot only when strictly closer than 45 degrees', () => {
    // Cardinal bonds on all four sides leave the four diagonals, each exactly 45 degrees away.
    const four = lay({ atom: { element: 'Cl', lonePairs: 4 }, bonds: [0, 90, 180, 270] });
    expect(four.slots).toEqual(['NE', 'NW', 'SE', 'SW']);
    // A bond 5 degrees off NE blocks NE (and E, 40 degrees away) but not NW.
    const near45 = lay({ atom: { element: 'Cl', lonePairs: 4 }, bonds: [320] });
    expect(near45.slots).toEqual(['W', 'S', 'N', 'NW']);
  });

  it('the H part blocks its side: no pair on the E of OH, with or without a bond', () => {
    const l = lay({ atom: { element: 'O', lonePairs: 3 }, bonds: [180], implicitH: 1 });
    expect(l.label!.text).toBe('OH');
    expect(l.slots).not.toContain('E');
    expect(l.slots).not.toContain('W');
    expect(slotSet(l, 0, 2)).toEqual(['N', 'S']);
  });

  it('partial charge prefers N, then NE, NW, S, SE, SW, E, W; never a taken or blocked slot', () => {
    const base = { element: 'Cl', lonePairs: 1 };
    // Bond to the south: the pair goes N, so δ- takes NE.
    expect(lay({ atom: { ...base, partialCharge: 'δ-' }, bonds: [90] }).slots).toEqual(['N', 'NE']);
    // Bond to the north-east: N is 45 degrees away (free), the pair goes W..S, δ- takes N.
    const l = lay({ atom: { ...base, partialCharge: 'δ-' }, bonds: [270] });
    expect(l.slots[0]).toBe('S');
    expect(l.slots[1]).toBe('NE');
  });
});

describe('crowded atoms', () => {
  it('with all eight slots used the next satellite goes one ring out, deterministically', () => {
    const c = { atom: { element: 'Cl', lonePairs: 9 } } as const;
    const a = lay(c);
    expect(a.slots.slice(0, 8)).toEqual(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);
    const last = a.sats!.placements[8]!;
    expect(last.slot).toBe('N');
    expect(last.ring).toBeGreaterThanOrEqual(1);
    expect(lay(c).sats!.svg).toBe(a.sats!.svg);
    // Further out than the first N pair.
    expect(a.dots[8]![0]!.y).toBeLessThan(a.dots[0]![0]!.y - 2 * R);
  });
});

describe('every satellite keeps its distance', () => {
  const dist = (a: Point, b: Point) =>
    Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
  const rectDist = (p: Point, b: Rect) => {
    const dx = Math.max(b.x - p.x, 0, p.x - b.x - b.w);
    const dy = Math.max(b.y - p.y, 0, p.y - b.y - b.h);
    return Math.sqrt(dx * dx + dy * dy);
  };

  const cases: [string, Case][] = [
    ['OH- typed', { atom: { element: 'O', label: 'OH', charge: -1, lonePairs: 3 } }],
    ['HO- typed', { atom: { element: 'O', label: 'HO', charge: -1, lonePairs: 3 } }],
    ['OH- element', { atom: { element: 'O', charge: -1, lonePairs: 3 }, implicitH: 1 }],
    ['H2O', { atom: { element: 'O', lonePairs: 2 }, implicitH: 2 }],
    ['NH3', { atom: { element: 'N', lonePairs: 1 }, implicitH: 3 }],
    ['Cl-', { atom: { element: 'Cl', charge: -1, lonePairs: 4 } }],
    ['H-Cl, Cl', { atom: { element: 'Cl', lonePairs: 3, partialCharge: 'δ-' }, bonds: [180] }],
    ['H-Cl, H', { atom: { element: 'H', partialCharge: 'δ+' }, bonds: [0] }],
    ['C-Br, Br', { atom: { element: 'Br', lonePairs: 3, partialCharge: 'δ-' }, bonds: [180] }],
    ['C-Br, C', { atom: { partialCharge: 'δ+' }, bonds: [0], vertex: true }],
    ['methyl radical', { atom: { radical: 1 }, bonds: [210, 330], vertex: true }],
    ['carbanion', { atom: { charge: -1, lonePairs: 1 }, bonds: [210, 330], vertex: true }],
    [
      'crowded vertex',
      {
        atom: { charge: -1, lonePairs: 2, radical: 1, partialCharge: 'δ-', number: '12' },
        bonds: [90, 210, 330],
        vertex: true,
      },
    ],
    [
      'crowded bare Cl',
      { atom: { element: 'Cl', lonePairs: 3, radical: 1, partialCharge: 'δ-', number: '7' } },
    ],
    ['ring of pairs', { atom: { element: 'Cl', lonePairs: 9 } }],
  ];

  it.each(cases)('%s', (_name, c) => {
    const l = lay(c);
    const sats = l.sats!;
    const all: { sat: number; centre: Point }[] = [];
    sats.rects.forEach((rs, i) => {
      rs.forEach((r, k) => {
        const circle = Math.abs(r.w - 2 * R) < EPS && Math.abs(r.h - 2 * R) < EPS;
        if (circle) all.push({ sat: i, centre: l.dots[i]![k]! });
      });
    });
    // Text (signs, numbers) keeps `gap` from the box too: the distance between the two rects.
    for (const rs of sats.rects) {
      for (const t of rs.filter((r) => Math.abs(r.w - 2 * R) > EPS)) {
        const dx = Math.max(l.ref.x - (t.x + t.w), 0, t.x - (l.ref.x + l.ref.w));
        const dy = Math.max(l.ref.y - (t.y + t.h), 0, t.y - (l.ref.y + l.ref.h));
        expect(Math.sqrt(dx * dx + dy * dy)).toBeGreaterThanOrEqual(GAP - EPS * 1e3);
      }
    }
    for (const d of all) {
      // Every dot is `gap` or more from the symbol box.
      expect(rectDist(d.centre, l.ref) - R).toBeGreaterThanOrEqual(GAP - EPS * 1e3);
      for (const o of l.label?.obstacles ?? [])
        expect(rectDist(d.centre, o) - R).toBeGreaterThan(0);
      if (l.label?.chargeBox) expect(rectDist(d.centre, l.label.chargeBox) - R).toBeGreaterThan(0);
    }
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const gapBetween = dist(all[i]!.centre, all[j]!.centre) - 2 * R;
        expect(gapBetween, `dots ${i} and ${j}`).toBeGreaterThan(0);
        // The two dots of one pair are SEP apart centre to centre.
        if (all[i]!.sat === all[j]!.sat) near(gapBetween, SEP - 2 * R);
        else expect(gapBetween).toBeGreaterThanOrEqual(R - EPS * 1e3);
      }
    }
    // Every satellite box lies in the satellites' ink box.
    for (const b of sats.boxes) {
      expect(b.x).toBeGreaterThanOrEqual(sats.ink.x - EPS);
      expect(b.y).toBeGreaterThanOrEqual(sats.ink.y - EPS);
      expect(b.x + b.w).toBeLessThanOrEqual(sats.ink.x + sats.ink.w + EPS);
      expect(b.y + b.h).toBeLessThanOrEqual(sats.ink.y + sats.ink.h + EPS);
    }
  });
});

describe('extents contain every satellite as the browser draws it', () => {
  const scene = (atoms: AtomInit[], bonds: [number, number][]) => {
    let doc = emptyDoc('2026-01-01T00:00:00Z');
    const ids: AtomId[] = [];
    for (const a of atoms) {
      let id: AtomId;
      [doc, id] = addAtom(doc, a);
      ids.push(id);
    }
    for (const [i, j] of bonds) [doc] = addBond(doc, ids[i]!, ids[j]!);
    return render({ ...doc, style: { preset: 'slides', overrides: { fontSize: FS } } } as Doc);
  };

  const scenes: [string, ReturnType<typeof scene>][] = [
    [
      'H-Cl with δ+ and δ-',
      scene(
        [
          { x: 0, y: 0, element: 'H', partialCharge: 'δ+' },
          { x: 1, y: 0, element: 'Cl', partialCharge: 'δ-', lonePairs: 3 },
        ],
        [[0, 1]],
      ),
    ],
    [
      'C-Br with δ-',
      scene(
        [
          { x: 0, y: 0, partialCharge: 'δ+' },
          { x: 1, y: 0, element: 'Br', partialCharge: 'δ-', lonePairs: 3 },
        ],
        [[0, 1]],
      ),
    ],
    ['OH-', scene([{ x: 0, y: 0, element: 'O', charge: -1, lonePairs: 3 }], [])],
    ['HO-', scene([{ x: 0, y: 0, element: 'O', label: 'HO', charge: -1, lonePairs: 3 }], [])],
    ['H2O', scene([{ x: 0, y: 0, element: 'O', lonePairs: 2 }], [])],
    ['NH3', scene([{ x: 0, y: 0, element: 'N', lonePairs: 1 }], [])],
    [
      'δδ- alone (Greek, overshoot, descender-free)',
      scene([{ x: 0, y: 0, element: 'Cl', partialCharge: 'δδ-' }], []),
    ],
    [
      'methyl radical and carbanion',
      scene(
        [
          { x: 0, y: 0, radical: 1 },
          { x: 1, y: 0.5 },
          { x: -1, y: 0.5 },
        ],
        [
          [0, 1],
          [0, 2],
        ],
      ),
    ],
  ];

  it.each(scenes)('%s: no ink outside its extents, none outside the scene bounds', (_n, sc) => {
    const bounds = sc.bounds!;
    for (const part of sc.parts) {
      const extent = sc.extents[part.key]!;
      const ink = inkScan(part.svg)!;
      // `inkScan` shares no layout code with the renderer: it boxes every text as the browser may
      // draw it (full ascent and descent) and every dot as its circle.
      expect(ink.x).toBeGreaterThanOrEqual(extent.x - 0.01);
      expect(ink.y).toBeGreaterThanOrEqual(extent.y - 0.01);
      expect(ink.x + ink.w).toBeLessThanOrEqual(extent.x + extent.w + 0.01);
      expect(ink.y + ink.h).toBeLessThanOrEqual(extent.y + extent.h + 0.01);
      expect(extent.x).toBeGreaterThanOrEqual(bounds.x - EPS);
      expect(extent.y).toBeGreaterThanOrEqual(bounds.y - EPS);
      expect(extent.x + extent.w).toBeLessThanOrEqual(bounds.x + bounds.w + EPS);
      expect(extent.y + extent.h).toBeLessThanOrEqual(bounds.y + bounds.h + EPS);
    }
  });

  it('a δ- below the baseline is not clipped: the extents reach the font descent', () => {
    const sc = scenes[0]![1];
    const cl = sc.parts.find((p) => p.key.startsWith('atom:') && p.svg.includes('Cl'))!;
    const delta = [...cl.svg.matchAll(/<text x="[^"]+" y="([^"]+)"[^>]*>δ−/g)][0]!;
    const baseline = Number(delta[1]);
    const extent = sc.extents[cl.key]!;
    expect(extent.y + extent.h).toBeGreaterThanOrEqual(baseline + 0.212 * 0.7 * FS - 0.01);
    expect(extent.y).toBeLessThanOrEqual(baseline - 0.905 * 0.7 * FS + 0.01);
  });
});
