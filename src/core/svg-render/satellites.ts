// Satellites (SPEC-svg-render.md "Atoms and labels", Satellites): the charge sign of a skeleton
// vertex, lone pairs, radical dots, partial charge and atom number, placed in the angular gaps
// between the atom's bond directions (every bond of the whole document).
//
// Assignment order: charge, lone pairs, radical dots, partial charge, number. Gaps are sorted by
// size (descending, ties by smaller start angle), satellites are dealt round-robin, and the `k`
// satellites of one gap sit at fractions (j+1)/(k+1) of it. A bare atom has the slots up, down,
// left, right. Angles are screen angles in radians (y down: 90 degrees points down).
import type { Atom, Point, Rect } from '../doc-model';
import {
  growRect,
  normalize,
  rayExitBox,
  rectCenter,
  rectContains,
  rectUnion,
  segmentBoxInterval,
  unionAll,
} from './geom';
import { el, svgText } from './svg-write';
import { INK, type ResolvedStyle } from './style';
import { measureRuns, type UnmeasuredGlyphNotice } from './text-measure';

const TAU = 2 * Math.PI;
/** Gap sizes (and angles) closer than this are equal. */
const EPS = 1e-6;
const MINUS = '−';
/** Spread between satellites that share a bare-atom slot (more than four satellites). */
const SLOT_SPREAD = Math.PI / 6;
/** Bare atom slots in dealing order: up, down, left, right. */
const BARE_SLOTS = [1.5 * Math.PI, 0.5 * Math.PI, Math.PI, 0] as const;

/** Candidate directions tried per ring when a satellite's dealt slot is taken. */
const SLOTS = 24;
const SLOT_STEP = TAU / SLOTS;
/** How many rings outward a satellite may move before it gives up and keeps its dealt slot. */
const MAX_RINGS = 8;

const overlapsRect = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export interface Gap {
  /** Start angle, radians in [0, 2π). */
  readonly start: number;
  /** Angular size, radians (2π for the single gap of one bond). */
  readonly size: number;
}

const wrap = (a: number): number => ((a % TAU) + TAU) % TAU;

/** The gaps between bond directions, largest first (ties by the smaller start angle). */
export function bondGaps(directions: readonly Point[]): Gap[] {
  const angles = directions
    .flatMap((v) => normalize(v) ?? [])
    .map((u) => wrap(Math.atan2(u.y, u.x)))
    .sort((a, b) => a - b);
  const distinct: number[] = [];
  for (const a of angles) {
    const last = distinct[distinct.length - 1];
    if (last === undefined || a - last > EPS) distinct.push(a);
  }
  // An angle just below 2π and one at 0 are the same direction.
  const first = distinct[0];
  const end = distinct[distinct.length - 1];
  if (distinct.length > 1 && first !== undefined && end !== undefined && first + TAU - end <= EPS) {
    distinct.pop();
  }
  const gaps: Gap[] = distinct.map((start, i) => {
    const next = distinct[i + 1];
    return { start, size: (next ?? (distinct[0] as number) + TAU) - start };
  });
  return gaps.sort((a, b) =>
    Math.abs(a.size - b.size) > EPS ? b.size - a.size : a.start - b.start,
  );
}

/** The direction angle of each of `count` satellites, in assignment order. */
export function satelliteAngles(count: number, directions: readonly Point[]): number[] {
  const gaps = bondGaps(directions);
  const slots = gaps.length;
  if (slots === 0) {
    const per = BARE_SLOTS.map((_, s) => Math.floor((count - s + 3) / 4));
    const seen = [0, 0, 0, 0];
    return Array.from({ length: count }, (_, i) => {
      const s = i % 4;
      const j = seen[s] as number;
      seen[s] = j + 1;
      return (BARE_SLOTS[s] as number) + (j - ((per[s] as number) - 1) / 2) * SLOT_SPREAD;
    });
  }
  const per = new Array<number>(slots).fill(0);
  for (let i = 0; i < count; i++) per[i % slots] = (per[i % slots] as number) + 1;
  const seen = new Array<number>(slots).fill(0);
  return Array.from({ length: count }, (_, i) => {
    const g = gaps[i % slots] as Gap;
    const j = seen[i % slots] as number;
    seen[i % slots] = j + 1;
    return g.start + (g.size * (j + 1)) / ((per[i % slots] as number) + 1);
  });
}

export interface SatelliteInput {
  readonly atom: Atom;
  /** The atom's position, pt (finite). */
  readonly position: Point;
  /** Vectors to every neighbour in the whole document (any length). */
  readonly directions: readonly Point[];
  /** The label's full text box, or `null` for a skeleton vertex. */
  readonly labelBox: Rect | null;
  /**
   * The element symbol's own glyph box (`AtomLabel.symbolBox`): lone pairs and radical dots sit
   * round it. Defaults to `labelBox`.
   */
  readonly glyphBox?: Rect | null;
}

export interface SatelliteLayout {
  /** Dots and `<text>` elements in assignment order, separated by `
`. */
  readonly svg: string;
  readonly ink: Rect;
  /** The ink box of each satellite in assignment order (a lone pair is one box round both dots). */
  readonly boxes: readonly Rect[];
  readonly notices: UnmeasuredGlyphNotice[];
}

type Satellite =
  | { readonly kind: 'pair' }
  | { readonly kind: 'dot' }
  | { readonly kind: 'text'; readonly text: string };

function satelliteList(atom: Atom, vertex: boolean): Satellite[] {
  const out: Satellite[] = [];
  if (vertex && atom.charge !== 0) {
    const magnitude = Math.abs(atom.charge) > 1 ? String(Math.abs(atom.charge)) : '';
    out.push({ kind: 'text', text: `${magnitude}${atom.charge > 0 ? '+' : MINUS}` });
  }
  for (let i = 0; i < (atom.lonePairs ?? 0); i++) out.push({ kind: 'pair' });
  for (let i = 0; i < atom.radical; i++) out.push({ kind: 'dot' });
  if (atom.partialCharge !== undefined) {
    out.push({ kind: 'text', text: atom.partialCharge.replace('-', MINUS) });
  }
  if (atom.number !== undefined && atom.number !== '') {
    out.push({ kind: 'text', text: atom.number });
  }
  return out;
}

/** One satellite put down at an angle and distance: its markup and ink box. */
interface Placed {
  readonly parts: string[];
  readonly box: Rect;
  readonly notices: UnmeasuredGlyphNotice[];
}

/** Lays out the atom's satellites; `null` when it has none. */
export function layoutSatellites(
  input: SatelliteInput,
  style: ResolvedStyle,
): SatelliteLayout | null {
  const { atom, position, labelBox } = input;
  const list = satelliteList(atom, labelBox === null);
  if (list.length === 0) return null;
  const angles = satelliteAngles(list.length, input.directions);
  const fill = atom.color ?? INK;
  const size = style.satelliteScale * style.fontSize;
  const glyphBox = input.glyphBox === undefined ? labelBox : input.glyphBox;

  const dotAt = (c: Point): { svg: string; box: Rect } => {
    const r = style.dotRadius;
    return {
      svg: el('circle', { cx: c.x, cy: c.y, r, fill, stroke: 'none' }),
      box: { x: c.x - r, y: c.y - r, w: 2 * r, h: 2 * r },
    };
  };

  /** Satellite `sat` at `angle`, `extra` further out than its home distance. */
  const place = (sat: Satellite, angle: number, extra: number): Placed => {
    const u: Point = { x: Math.cos(angle), y: Math.sin(angle) };
    // Dots and pairs hug the element symbol; text goes round the whole label.
    const round = sat.kind === 'text' ? labelBox : glyphBox;
    const origin =
      round && rectContains(round, position) ? position : round ? rectCenter(round) : position;
    const edge = round ? rayExitBox(origin, u, round) : null;
    const d = (edge ?? style.vertexGap) + style.satelliteGap + extra;
    const point: Point = { x: origin.x + u.x * d, y: origin.y + u.y * d };

    if (sat.kind === 'dot') {
      const one = dotAt(point);
      return { parts: [one.svg], box: one.box, notices: [] };
    }
    if (sat.kind === 'pair') {
      const n: Point = { x: -u.y, y: u.x };
      const h = style.pairSeparation / 2;
      const a = dotAt({ x: point.x - n.x * h, y: point.y - n.y * h });
      const b = dotAt({ x: point.x + n.x * h, y: point.y + n.y * h });
      return { parts: [a.svg, b.svg], box: rectUnion(a.box, b.box), notices: [] };
    }
    const m = measureRuns([{ text: sat.text }], style, size);
    const w = m.width;
    const h = m.ascent + m.descent;
    // The box is tangent to the point: its centre is one half-extent further along `u`.
    const t = rayExitBox({ x: 0, y: 0 }, u, { x: -w / 2, y: -h / 2, w, h }) ?? 0;
    const centre: Point = { x: point.x + u.x * t, y: point.y + u.y * t };
    const box: Rect = { x: centre.x - w / 2, y: centre.y - h / 2, w, h };
    const parts = (m.lines[0]?.segments ?? []).map((seg) =>
      svgText(
        {
          x: box.x + seg.x,
          y: box.y + m.ascent + seg.dy,
          'font-family': style.fontFamily,
          'font-size': seg.fontSize,
          fill,
          stroke: 'none',
        },
        seg.text,
      ),
    );
    return { parts, box, notices: m.notices };
  };

  // Obstacles: the label's ink, every bond leaving the atom (a thickened segment) and the
  // satellites already placed. A satellite takes its dealt angle if that is free, else the next
  // free slot (15 degree steps, alternating either side), and only when the whole turn is blocked
  // does it move outward one ring and try again.
  const bondHalf = style.lineWidth / 2 + style.dotRadius;
  const bonds = input.directions.map((d): [Point, Point] => [
    position,
    { x: position.x + d.x, y: position.y + d.y },
  ]);
  const placedBoxes: Rect[] = [];
  const free = (box: Rect): boolean =>
    !(labelBox && overlapsRect(box, labelBox)) &&
    !bonds.some(([a, b]) => segmentBoxInterval(a, b, growRect(box, bondHalf)) !== null) &&
    !placedBoxes.some((other) => overlapsRect(box, growRect(other, style.dotRadius)));

  const choose = (sat: Satellite, preferred: number): Placed => {
    for (let ring = 0; ring <= MAX_RINGS; ring++) {
      for (let k = 0; k < SLOTS; k++) {
        const step = Math.ceil(k / 2) * (k % 2 === 1 ? 1 : -1);
        const placed = place(sat, preferred + step * SLOT_STEP, ring * style.satelliteGap * 2);
        if (free(placed.box)) return placed;
      }
    }
    return place(sat, preferred, 0);
  };

  const parts: string[] = [];
  const boxes: Rect[] = [];
  const notices: UnmeasuredGlyphNotice[] = [];
  list.forEach((sat, i) => {
    const placed = choose(sat, angles[i] as number);
    placedBoxes.push(placed.box);
    parts.push(...placed.parts);
    boxes.push(placed.box);
    notices.push(...placed.notices);
  });

  const ink = unionAll(boxes);
  if (!ink) return null;
  return { svg: parts.join('\n'), ink, boxes, notices };
}
