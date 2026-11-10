// Satellites (SPEC-svg-render.md "Atoms and labels", Satellites): the charge sign of a skeleton
// vertex, lone pairs, radical dots, partial charge and atom number, placed in the angular gaps
// between the atom's bond directions (every bond of the whole document).
//
// Assignment order: charge, lone pairs, radical dots, partial charge, number. Gaps are sorted by
// size (descending, ties by smaller start angle), satellites are dealt round-robin, and the `k`
// satellites of one gap sit at fractions (j+1)/(k+1) of it. A bare atom has the slots up, down,
// left, right. Angles are screen angles in radians (y down: 90 degrees points down).
import type { Atom, Point, Rect } from '../doc-model';
import { normalize, rayExitBox, unionAll } from './geom';
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
}

export interface SatelliteLayout {
  /** Dots and `<text>` elements in assignment order, separated by `\n`. */
  readonly svg: string;
  readonly ink: Rect;
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
  const parts: string[] = [];
  const inks: Rect[] = [];
  const notices: UnmeasuredGlyphNotice[] = [];

  const dot = (c: Point): void => {
    const r = style.dotRadius;
    parts.push(el('circle', { cx: c.x, cy: c.y, r, fill, stroke: 'none' }));
    inks.push({ x: c.x - r, y: c.y - r, w: 2 * r, h: 2 * r });
  };

  list.forEach((sat, i) => {
    const angle = angles[i] as number;
    const u: Point = { x: Math.cos(angle), y: Math.sin(angle) };
    const edge = labelBox ? rayExitBox(position, u, labelBox) : null;
    const d = (edge ?? style.vertexGap) + style.satelliteGap;
    const point: Point = { x: position.x + u.x * d, y: position.y + u.y * d };

    if (sat.kind === 'dot') {
      dot(point);
    } else if (sat.kind === 'pair') {
      const n: Point = { x: -u.y, y: u.x };
      const h = style.pairSeparation / 2;
      dot({ x: point.x - n.x * h, y: point.y - n.y * h });
      dot({ x: point.x + n.x * h, y: point.y + n.y * h });
    } else {
      const m = measureRuns([{ text: sat.text }], style, size);
      notices.push(...m.notices);
      const w = m.width;
      const h = m.ascent + m.descent;
      // The box is tangent to the point: its centre is one half-extent further along `u`.
      const t = rayExitBox({ x: 0, y: 0 }, u, { x: -w / 2, y: -h / 2, w, h }) ?? 0;
      const centre: Point = { x: point.x + u.x * t, y: point.y + u.y * t };
      const box: Rect = { x: centre.x - w / 2, y: centre.y - h / 2, w, h };
      inks.push(box);
      for (const seg of m.lines[0]?.segments ?? []) {
        parts.push(
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
      }
    }
  });

  const ink = unionAll(inks);
  if (!ink) return null;
  return { svg: parts.join('\n'), ink, notices };
}
