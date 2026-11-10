// Satellites (SPEC-svg-render.md "Atoms and labels", Satellites): lone pairs, radical dots, the
// charge sign of a skeleton vertex, partial charge and atom number, each in one of eight slots
// round the element symbol's glyph box.
//
// Slots: the four cardinals N, E, S, W (centred on a box edge) and the four diagonals NE, NW, SE,
// SW (off a box corner). A satellite's nearest ink edge is `satelliteGap` from the box. A lone
// pair is two dots along the box edge (the diagonal's tangent for a diagonal slot). Screen
// coordinates: y points down, so N is up.
import type { Atom, Point, Rect } from '../doc-model';
import type { AtomLabel } from './atom-label';
import { growRect, normalize, segmentBoxInterval, unionAll } from './geom';
import { el, svgText } from './svg-write';
import { INK, type ResolvedStyle } from './style';
import { ASCENT_EM, DESCENT_EM, measureRuns, type UnmeasuredGlyphNotice } from './text-measure';

const MINUS = '−';
const S2 = Math.SQRT1_2;
/** A bond blocks the slots strictly closer than this (exactly 45 degrees does not block). */
const BLOCK_ANGLE = Math.PI / 4 - 1e-9;
/** Most rings a satellite is pushed outward before it gives up and keeps the last position. */
const MAX_RINGS = 40;
const BISECTIONS = 60;
/** A vertex's formal charge is slid outward in steps of `satelliteGap`, up to this many. */
const SLIDES = 4;

export type Slot = 'N' | 'E' | 'S' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';

interface SlotGeometry {
  /** The point of the box the slot hangs off: an edge midpoint or a corner. */
  readonly anchor: (box: Rect) => Point;
  /** Outward unit direction (screen). */
  readonly out: Point;
  /** Unit direction along the box edge (a pair's axis). */
  readonly tangent: Point;
}

const SLOTS: Readonly<Record<Slot, SlotGeometry>> = {
  N: {
    anchor: (b) => ({ x: b.x + b.w / 2, y: b.y }),
    out: { x: 0, y: -1 },
    tangent: { x: 1, y: 0 },
  },
  S: {
    anchor: (b) => ({ x: b.x + b.w / 2, y: b.y + b.h }),
    out: { x: 0, y: 1 },
    tangent: { x: 1, y: 0 },
  },
  E: {
    anchor: (b) => ({ x: b.x + b.w, y: b.y + b.h / 2 }),
    out: { x: 1, y: 0 },
    tangent: { x: 0, y: 1 },
  },
  W: {
    anchor: (b) => ({ x: b.x, y: b.y + b.h / 2 }),
    out: { x: -1, y: 0 },
    tangent: { x: 0, y: 1 },
  },
  NE: {
    anchor: (b) => ({ x: b.x + b.w, y: b.y }),
    out: { x: S2, y: -S2 },
    tangent: { x: S2, y: S2 },
  },
  NW: { anchor: (b) => ({ x: b.x, y: b.y }), out: { x: -S2, y: -S2 }, tangent: { x: S2, y: -S2 } },
  SE: {
    anchor: (b) => ({ x: b.x + b.w, y: b.y + b.h }),
    out: { x: S2, y: S2 },
    tangent: { x: S2, y: -S2 },
  },
  SW: {
    anchor: (b) => ({ x: b.x, y: b.y + b.h }),
    out: { x: -S2, y: S2 },
    tangent: { x: S2, y: S2 },
  },
};

const CARDINALS: readonly Slot[] = ['N', 'S', 'E', 'W'];
const DIAGONALS: readonly Slot[] = ['NE', 'NW', 'SE', 'SW'];
/** Partial charge, formal charge of a vertex and atom number. */
const TEXT_ORDER: readonly Slot[] = ['N', 'NE', 'NW', 'S', 'SE', 'SW', 'E', 'W'];
/** Tie-break order of a skeleton vertex's formal charge. */
const CHARGE_ORDER: readonly Slot[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/** The charge of a labelled atom whose superscript position (NE) is taken by a bond. */
const LABEL_CHARGE_ORDER: readonly Slot[] = ['NW', 'N', 'W', 'NE', 'E', 'SW', 'S', 'SE'];

export interface SatelliteInput {
  readonly atom: Atom;
  /** The atom's position, pt (finite). */
  readonly position: Point;
  /** Vectors to every neighbour in the whole document (any length). */
  readonly directions: readonly Point[];
  /** The atom's label, or `null` for a skeleton vertex (whose reference box is the point). */
  readonly label: AtomLabel | null;
}

export interface SatellitePlacement {
  readonly slot: Slot;
  /** Slot depths the satellite was pushed outward (0 unless all eight slots were unusable). */
  readonly ring: number;
}

export interface SatelliteLayout {
  /** Dots and `<text>` elements in assignment order, separated by a line feed. */
  readonly svg: string;
  /** The ink box of all satellites (text in the font's full ascent/descent box). */
  readonly ink: Rect;
  /**
   * The visual box of each satellite in assignment order: a lone pair is one box round both dots,
   * text is the cap-height box.
   */
  readonly boxes: readonly Rect[];
  /**
   * The rects that actually carry each satellite's ink, in assignment order: one per dot (the
   * box of a diagonal pair covers the corner it hangs off, its dots do not), the cap-height box
   * of a text.
   */
  readonly rects: readonly (readonly Rect[])[];
  /** Where each satellite sits, in assignment order. */
  readonly placements: readonly SatellitePlacement[];
  /**
   * Pt the label's formal-charge superscript must move right because a lone pair or radical dot
   * took the E slot (0 otherwise); rebuild the label with it (`AtomLabelInput.chargeShift`).
   */
  readonly chargeShift: number;
  readonly notices: UnmeasuredGlyphNotice[];
}

type Satellite =
  | { readonly kind: 'pair' }
  | { readonly kind: 'dot' }
  | { readonly kind: 'text'; readonly text: string; readonly vertexCharge?: true };

/** Order of assignment: lone pairs, radical dots, vertex charge, partial charge, number. */
function satelliteList(atom: Atom, vertex: boolean): Satellite[] {
  const out: Satellite[] = [];
  for (let i = 0; i < (atom.lonePairs ?? 0); i++) out.push({ kind: 'pair' });
  for (let i = 0; i < atom.radical; i++) out.push({ kind: 'dot' });
  if (vertex && atom.charge !== 0) {
    const magnitude = Math.abs(atom.charge) > 1 ? String(Math.abs(atom.charge)) : '';
    out.push({
      kind: 'text',
      text: `${magnitude}${atom.charge > 0 ? '+' : MINUS}`,
      vertexCharge: true,
    });
  }
  if (atom.partialCharge !== undefined) {
    out.push({ kind: 'text', text: atom.partialCharge.replace('-', MINUS) });
  }
  if (atom.number !== undefined && atom.number !== '') {
    out.push({ kind: 'text', text: atom.number });
  }
  return out;
}

/** Unsigned angle between two unit vectors, radians in [0, π]. */
const angleBetween = (a: Point, b: Point): number =>
  Math.atan2(Math.abs(a.x * b.y - a.y * b.x), a.x * b.x + a.y * b.y);

const overlapsRect = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const pointBoxDistance = (p: Point, b: Rect): number => {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h));
  return Math.sqrt(dx * dx + dy * dy);
};

/** One satellite put down in a slot: its markup and boxes. */
interface Placed {
  readonly parts: string[];
  /** The rects that must stay clear (each dot; the text's cap-height box). */
  readonly rects: Rect[];
  readonly box: Rect;
  readonly ink: Rect;
  readonly notices: UnmeasuredGlyphNotice[];
}

/** Lays out the atom's satellites; `null` when it has none. */
export function layoutSatellites(
  input: SatelliteInput,
  style: ResolvedStyle,
): SatelliteLayout | null {
  const { atom, position, label } = input;
  const list = satelliteList(atom, label === null || label.chargeSatellite);
  if (list.length === 0) return null;

  const fill = atom.color ?? INK;
  const gap = style.satelliteGap;
  const r = style.dotRadius;
  const textSize = style.satelliteScale * style.fontSize;
  const textCap = style.capHeight * style.satelliteScale;
  /** The reference box: the symbol's glyph box, or the point for a skeleton vertex. */
  const ref: Rect = label ? label.symbolBox : { x: position.x, y: position.y, w: 0, h: 0 };
  const bonds = input.directions.flatMap((d) => normalize(d) ?? []);
  const hPart = label?.hPart ?? { left: false, right: false };

  // --- slot rules ------------------------------------------------------------------------------
  const nearestBond = (slot: Slot): number =>
    bonds.reduce((m, b) => Math.min(m, angleBetween(SLOTS[slot].out, b)), Infinity);
  const blocked = (slot: Slot): boolean =>
    nearestBond(slot) < BLOCK_ANGLE ||
    (slot === 'E' && hPart.right) ||
    (slot === 'W' && hPart.left);

  /** Lone pairs and radical dots: away from the bonds, else N, S, opposite the H part, rest. */
  const dotPreference = (): Slot[] => {
    if (bonds.length > 0) {
      const far = [...CARDINALS].sort((a, b) => nearestBond(b) - nearestBond(a));
      return [...far, ...DIAGONALS];
    }
    const third: Slot[] = hPart.right ? ['W', 'E'] : hPart.left ? ['E', 'W'] : ['E', 'W'];
    return ['N', 'S', ...third, ...DIAGONALS];
  };

  /** A vertex's formal charge: the slot farthest from every bond, ties in `CHARGE_ORDER`. */
  const chargePreference = (): Slot[] => {
    if (label) return [...LABEL_CHARGE_ORDER];
    const far = (s: Slot): number => Math.min(nearestBond(s), Math.PI);
    return [...CHARGE_ORDER].sort((a, b) => far(b) - far(a));
  };

  // --- shapes ----------------------------------------------------------------------------------
  const dotRect = (c: Point): Rect => ({ x: c.x - r, y: c.y - r, w: 2 * r, h: 2 * r });
  const dotSvg = (c: Point): string => el('circle', { cx: c.x, cy: c.y, r, fill, stroke: 'none' });

  /** Distance from the anchor along the slot at which the dots are `gap` from the box. */
  const dotDistance = (slot: Slot, pair: boolean): number => {
    const g = SLOTS[slot];
    if (slot.length === 1) return gap + r;
    const a = g.anchor(ref);
    const centres = (d: number): Point[] => {
      const p = { x: a.x + g.out.x * d, y: a.y + g.out.y * d };
      const h = pair ? style.pairSeparation / 2 : 0;
      return [
        { x: p.x - g.tangent.x * h, y: p.y - g.tangent.y * h },
        { x: p.x + g.tangent.x * h, y: p.y + g.tangent.y * h },
      ];
    };
    let lo = 0;
    let hi = 10 * (gap + style.pairSeparation + 2 * r);
    for (let i = 0; i < BISECTIONS; i++) {
      const mid = (lo + hi) / 2;
      const clear = Math.min(...centres(mid).map((c) => pointBoxDistance(c, ref))) - r;
      if (clear >= gap) hi = mid;
      else lo = mid;
    }
    return hi;
  };

  /** Satellite `sat` in `slot`, `ring` slot depths further out than its home. */
  const place = (sat: Satellite, slot: Slot, ring: number, slid = 0): Placed => {
    const g = SLOTS[slot];
    const a = g.anchor(ref);
    if (sat.kind !== 'text') {
      const pair = sat.kind === 'pair';
      const depth = 2 * r;
      const d = dotDistance(slot, pair) + ring * (depth + gap);
      const p = { x: a.x + g.out.x * d, y: a.y + g.out.y * d };
      const h = pair ? style.pairSeparation / 2 : 0;
      const centres = pair
        ? [
            { x: p.x - g.tangent.x * h, y: p.y - g.tangent.y * h },
            { x: p.x + g.tangent.x * h, y: p.y + g.tangent.y * h },
          ]
        : [p];
      const rects = centres.map(dotRect);
      const box = unionAll(rects) as Rect;
      return { parts: centres.map(dotSvg), rects, box, ink: box, notices: [] };
    }
    const m = measureRuns([{ text: sat.text }], style, textSize);
    const w = m.width;
    const depth = Math.abs(g.out.x) * w + Math.abs(g.out.y) * textCap;
    const d = gap * (1 + slid) + ring * (depth + gap);
    const p = { x: a.x + g.out.x * d, y: a.y + g.out.y * d };
    // The text box's nearest corner (or edge midpoint) is the point; it extends away from the atom.
    const sx = Math.sign(g.out.x);
    const sy = Math.sign(g.out.y);
    const cx = p.x + (sx * w) / 2;
    const cy = p.y + (sy * textCap) / 2;
    const box: Rect = { x: cx - w / 2, y: cy - textCap / 2, w, h: textCap };
    const baseline = box.y + textCap;
    const parts = (m.lines[0]?.segments ?? []).map((seg) =>
      svgText(
        {
          x: box.x + seg.x,
          y: baseline + seg.dy,
          'font-family': style.fontFamily,
          'font-size': seg.fontSize,
          fill,
          stroke: 'none',
        },
        seg.text,
      ),
    );
    const ink: Rect = {
      x: box.x,
      y: baseline - ASCENT_EM * textSize,
      w,
      h: (ASCENT_EM + DESCENT_EM) * textSize,
    };
    return { parts, rects: [box], box, ink, notices: m.notices };
  };

  // --- obstacles -------------------------------------------------------------------------------
  // Beyond the slot rules, a satellite never sits on the label's other glyphs, the charge sign,
  // a bond leaving the atom or a satellite already placed.
  const bondHalf = style.lineWidth / 2 + r;
  const bondSegments = input.directions.map((d): [Point, Point] => [
    position,
    { x: position.x + d.x, y: position.y + d.y },
  ]);
  const placedRects: Rect[] = [];
  let charge: Rect | null = label?.chargeBox ?? null;
  let chargeShift = 0;

  /**
   * Is `placed` clear of everything? The charge sign is ignored for an E dot (it will move).
   * Bonds are checked for dots with the dot radius as clearance; for text the cap-height box,
   * grown by the half line width only, must not touch the bond line.
   */
  const clear = (placed: Placed, slot: Slot, movesCharge: boolean): boolean =>
    placed.rects.every(
      (rect) =>
        !(label?.obstacles ?? []).some((o) => overlapsRect(rect, growRect(o, r))) &&
        !(charge && !(movesCharge && slot === 'E') && overlapsRect(rect, growRect(charge, r))) &&
        !bondSegments.some(
          ([p, q]) =>
            segmentBoxInterval(
              p,
              q,
              growRect(rect, movesCharge ? bondHalf : style.lineWidth / 2),
            ) !== null,
        ) &&
        !placedRects.some((other) => overlapsRect(rect, growRect(other, r))),
    );

  const taken = new Set<Slot>();
  const parts: string[] = [];
  const boxes: Rect[] = [];
  const rects: Rect[][] = [];
  const inks: Rect[] = [];
  const placements: SatellitePlacement[] = [];
  const notices: UnmeasuredGlyphNotice[] = [];

  for (const sat of list) {
    const preference =
      sat.kind !== 'text' ? dotPreference() : sat.vertexCharge ? chargePreference() : TEXT_ORDER;
    const movesCharge = sat.kind !== 'text';
    const slide = sat.kind === 'text' && sat.vertexCharge === true ? SLIDES : 0;
    let chosen: { slot: Slot; ring: number; placed: Placed } | null = null;
    for (const slot of preference) {
      if (blocked(slot) || taken.has(slot)) continue;
      for (let slid = 0; slid <= slide && !chosen; slid++) {
        const placed = place(sat, slot, 0, slid);
        if (clear(placed, slot, movesCharge)) chosen = { slot, ring: 0, placed };
      }
      if (chosen) break;
    }
    if (!chosen) {
      // Every slot is blocked, taken or crowded: the first usable preference, one slot depth
      // further out per ring until nothing is in the way.
      const slot = preference.find((s) => !blocked(s)) ?? (preference[0] as Slot);
      for (let ring = 1; ring <= MAX_RINGS; ring++) {
        const placed = place(sat, slot, ring);
        chosen = { slot, ring, placed };
        if (clear(placed, slot, movesCharge)) break;
      }
    }
    const { slot, ring, placed } = chosen as { slot: Slot; ring: number; placed: Placed };
    taken.add(slot);
    placedRects.push(...placed.rects);
    parts.push(...placed.parts);
    boxes.push(placed.box);
    rects.push(placed.rects);
    inks.push(placed.ink);
    placements.push({ slot, ring });
    notices.push(...placed.notices);

    // A dot between the symbol and the charge pushes the charge out: it starts `gap` beyond it.
    if (movesCharge && slot === 'E' && label?.chargeBox) {
      const start = placed.box.x + placed.box.w + gap;
      if (start > label.chargeBox.x + chargeShift) {
        chargeShift = start - label.chargeBox.x;
        charge = { ...label.chargeBox, x: label.chargeBox.x + chargeShift };
      }
    }
  }

  const ink = unionAll(inks);
  if (!ink) return null;
  const svg = parts.join('\n');
  return { svg, ink, boxes, rects, placements, chargeShift, notices };
}
