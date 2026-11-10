import { describe, expect, it } from 'vitest';
import type { Atom, AtomId, Doc, Point, Rect } from '../doc-model';
import { layoutAtom } from './__fixtures__/atom-satellites';
import type { AtomLabel } from './atom-label';
import type { Slot } from './satellites';
import { resolveStyle } from './style';

// SPEC-svg-render.md "Satellites": the satellites of one atom never overlap each other, the
// label's own ink or a bond leaving the atom; lone pairs and radicals hug the element symbol.
const style = resolveStyle({ preset: 'slides', overrides: { fontSize: 100 } } as Doc['style']);
const POS: Point = { x: 300, y: 200 };
const BOND = 120;
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

const glyphBoxes = (label: AtomLabel): Rect[] => [
  label.symbolBox,
  ...label.obstacles,
  ...(label.chargeBox ? [label.chargeBox] : []),
];

const SLOT_DIRECTION: Record<Slot, Point> = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
  NE: { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  NW: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  SE: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  SW: { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
};

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Does the segment `a`-`b`, thickened by `half`, touch the box? (slab test on a grown box.) */
function segmentHits(a: Point, b: Point, box: Rect, half: number): boolean {
  const g = { x: box.x - half, y: box.y - half, w: box.w + 2 * half, h: box.h + 2 * half };
  let t0 = 0;
  let t1 = 1;
  const d = { x: b.x - a.x, y: b.y - a.y };
  for (const [p, q] of [
    [-d.x, a.x - g.x],
    [d.x, g.x + g.w - a.x],
    [-d.y, a.y - g.y],
    [d.y, g.y + g.h - a.y],
  ] as const) {
    if (p === 0) {
      if (q <= 0) return false;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
    }
  }
  return t0 < t1;
}

interface Case {
  readonly name?: string;
  readonly atom: Partial<Atom>;
  /** Bond directions in degrees (screen angles). */
  readonly bonds: readonly number[];
  readonly implicitH?: number;
  /** Skeleton vertex: no label drawn. */
  readonly vertex?: boolean;
}

function run(c: Case) {
  const atom = mk(c.atom);
  const directions = c.bonds.map((d) => {
    const u = unit(d);
    return { x: u.x * BOND, y: u.y * BOND };
  });
  const { label, sats } = layoutAtom(atom, POS, directions, style, {
    implicitH: c.implicitH ?? 0,
    vertex: c.vertex ?? false,
  });
  return { atom, directions, label, sats };
}

function assertCollisionFree(c: Case): void {
  const { directions, label, sats } = run(c);
  expect(sats).not.toBeNull();
  // Dot by dot (a diagonal pair's one box covers the corner it hangs off, its dots do not).
  const rects = sats!.rects;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      for (const a of rects[i]!) {
        for (const b of rects[j]!) {
          expect(overlaps(a, b), `satellites ${i} and ${j} overlap`).toBe(false);
        }
      }
    }
    // Glyph by glyph: the label's bounding box is not a rectangle's worth of ink (the sign sits
    // up beside the H, a subscript hangs below it, and the O's own top and bottom are free).
    for (const glyph of label ? glyphBoxes(label) : []) {
      for (const a of rects[i]!) {
        expect(overlaps(a, glyph), `satellite ${i} overlaps the label`).toBe(false);
      }
    }
    const isDots = rects[i]!.every((a) => Math.abs(a.w - 2 * style.dotRadius) < 1e-9);
    for (const d of directions) {
      if (isDots) {
        const end = { x: POS.x + d.x, y: POS.y + d.y };
        for (const a of rects[i]!) {
          expect(
            segmentHits(POS, end, a, style.lineWidth / 2),
            `satellite ${i} sits on a bond`,
          ).toBe(false);
        }
      } else {
        // A sign or number is a cap-height box, much taller than its ink, so a wide-angle bond
        // may graze the box; it is kept off the bond by the 45 degree rule instead.
        const slot = SLOT_DIRECTION[sats!.placements[i]!.slot];
        const bond = unit((Math.atan2(d.y, d.x) * 180) / Math.PI);
        const angle = Math.acos(Math.max(-1, Math.min(1, slot.x * bond.x + slot.y * bond.y)));
        expect(angle, `text satellite ${i} is within 45 degrees of a bond`).toBeGreaterThan(
          Math.PI / 4 - 1e-6,
        );
      }
    }
  }
}

const CASES: Case[] = [];
for (const bond of [0, 180, 30, 210, 90, 270, 135]) {
  const hcl = {
    atom: { element: 'Cl', lonePairs: 3, partialCharge: 'δ-' as const },
    bonds: [bond],
  };
  CASES.push(
    { name: `H-Cl, Cl with 3 lone pairs and δ-, bond at ${bond}`, ...hcl },
    {
      name: `C-Br, Br with 3 lone pairs and δ-, bond at ${bond}`,
      atom: { element: 'Br', lonePairs: 3, partialCharge: 'δ-' as const },
      bonds: [bond],
    },
    {
      name: `H-Cl, H with δ+, bond at ${bond}`,
      atom: { element: 'H', partialCharge: 'δ+' as const },
      bonds: [bond],
    },
  );
}
CASES.push(
  {
    name: 'hydroxide as OH-, bare, 3 lone pairs',
    atom: { element: 'O', charge: -1, lonePairs: 3 },
    bonds: [],
    implicitH: 1,
  },
  {
    name: 'hydroxide typed HO, bare, 3 lone pairs',
    atom: { element: 'O', label: 'HO', charge: -1, lonePairs: 3 },
    bonds: [],
  },
  {
    name: 'hydroxide typed OH, bare, 3 lone pairs',
    atom: { element: 'O', label: 'OH', charge: -1, lonePairs: 3 },
    bonds: [],
  },
  {
    name: 'hydroxide bonded on the right: HO-, 3 lone pairs',
    atom: { element: 'O', charge: -1, lonePairs: 3 },
    bonds: [0],
    implicitH: 1,
  },
  {
    name: 'hydroxide bonded on the left: -OH, 3 lone pairs',
    atom: { element: 'O', charge: -1, lonePairs: 3 },
    bonds: [180],
    implicitH: 1,
  },
  {
    name: 'water, 2 lone pairs',
    atom: { element: 'O', lonePairs: 2 },
    bonds: [],
    implicitH: 2,
  },
  {
    name: 'ammonia, 1 lone pair',
    atom: { element: 'N', lonePairs: 1 },
    bonds: [],
    implicitH: 3,
  },
  {
    name: 'ammonia drawn with a bond, 1 lone pair',
    atom: { element: 'N', lonePairs: 1 },
    bonds: [210],
    implicitH: 2,
  },
  {
    name: 'carbanion, skeleton vertex, 2 bonds',
    atom: { element: 'C', charge: -1, lonePairs: 1 },
    bonds: [210, 330],
    vertex: true,
  },
  {
    name: 'carbanion, skeleton vertex, 3 bonds',
    atom: { element: 'C', charge: -1, lonePairs: 1 },
    bonds: [90, 210, 330],
    vertex: true,
  },
  {
    name: 'carbanion, bare CH3-',
    atom: { element: 'C', charge: -1, lonePairs: 1 },
    bonds: [],
    implicitH: 3,
  },
  {
    name: 'radical cation, skeleton vertex',
    atom: { element: 'C', charge: 1, radical: 1 },
    bonds: [210, 330],
    vertex: true,
  },
  {
    name: 'radical cation, bare NH3.+',
    atom: { element: 'N', charge: 1, radical: 1 },
    bonds: [],
    implicitH: 3,
  },
  {
    name: 'radical cation, labelled O with one bond',
    atom: { element: 'O', charge: 1, radical: 1, lonePairs: 1 },
    bonds: [0],
    implicitH: 0,
  },
  {
    name: 'crowded: charge, 2 lone pairs, radical, δ-, number on a vertex with 3 bonds',
    atom: {
      element: 'C',
      charge: -1,
      lonePairs: 2,
      radical: 1,
      partialCharge: 'δ-' as const,
      number: '12',
    },
    bonds: [90, 210, 330],
    vertex: true,
  },
  {
    name: 'crowded bare atom: 3 lone pairs, radical, δ-, number',
    atom: { element: 'Cl', lonePairs: 3, radical: 1, partialCharge: 'δ-' as const, number: '7' },
    bonds: [],
  },
);

describe('satellites never collide', () => {
  it.each(CASES.map((c) => [c.name ?? '', c] as const))('%s', (_name, c) => {
    assertCollisionFree(c);
  });

  it('is deterministic', () => {
    const c = CASES[0]!;
    expect(run(c).sats).toEqual(run(c).sats);
  });
});

describe('lone pairs hug the element symbol', () => {
  const pairs = (c: Case) => {
    const { label, sats } = run(c);
    return { label: label!, boxes: sats!.boxes.slice(0, c.atom.lonePairs ?? 0) };
  };

  it('typed HO: no lone pair left of the H, i.e. none left of the label', () => {
    const { label, boxes } = pairs({
      atom: { element: 'O', label: 'HO', charge: -1, lonePairs: 3 },
      bonds: [],
    });
    expect(label.symbolBox.x).toBeGreaterThan(label.textBox.x);
    for (const b of boxes) expect(b.x + b.w / 2).toBeGreaterThan(label.symbolBox.x);
  });

  it('OH-, bare: lone pairs are above, below and before the O, not beside the H', () => {
    const { label, boxes } = pairs({
      atom: { element: 'O', charge: -1, lonePairs: 3 },
      bonds: [],
      implicitH: 1,
    });
    const { symbolBox: o } = label;
    for (const b of boxes) {
      const beside = b.y + b.h > o.y && b.y < o.y + o.h;
      // Level with the symbol is only allowed on its left, never over the H part to the right.
      if (beside) expect(b.x + b.w / 2).toBeLessThan(o.x + o.w / 2);
    }
  });

  it('a label with no reversed form and no element symbol in it keeps the anchor box', () => {
    const { label } = run({ atom: { element: 'O', label: 'R1' }, bonds: [] });
    expect(label!.symbolBox).toEqual(label!.anchorBox);
  });
});
