// Bond drawing (SPEC-svg-render.md "Bonds"): single, double (side rule, end shortening), triple,
// 1.5, wedge, hash, bold and wavy, clipped at label boxes. Pure: the caller (render) supplies the
// geometry in pt, the clip boxes of labelled atoms and the neighbour directions of both ends.
import type { Bond, Point, Rect } from '../doc-model';
import {
  add,
  cross,
  dot,
  growRect,
  lerp,
  leftNormal,
  length,
  normalize,
  quadBounds,
  rectFromPoints,
  segmentBoxInterval,
  scale,
  sub,
  unionAll,
} from './geom';
import { exhaustive } from './order';
import { fmt } from './fmt';
import { el } from './svg-write';
import { INK, type ResolvedStyle } from './style';

/** One end of a bond. */
export interface BondEnd {
  /** The atom's position, pt (finite). */
  readonly pos: Point;
  /** The boxes the bond is clipped against (`bondClipBoxes`), or `null` at a skeleton vertex. */
  readonly clip: readonly Rect[] | null;
  /** Vectors from this atom to its other neighbours (not this bond's other end), any length. */
  readonly others: readonly Point[];
}

export interface BondInput {
  readonly bond: Bond;
  /** The `a1` end; the bond runs from `a` to `b` ("left" is the visual left of that travel). */
  readonly a: BondEnd;
  readonly b: BondEnd;
  /** Centroid (pt) of the smallest ring through this bond, or `null` outside a ring. */
  readonly ringCentroid: Point | null;
  /** The bond is order 1.5 and lies in a circled ring: it is drawn as one plain line. */
  readonly circled: boolean;
}

export interface BondLayout {
  readonly svg: string;
  /** Ink box, pt: geometry grown by half the stroke width for stroked parts. */
  readonly ink: Rect;
}

export type DoubleSide = 'left' | 'right' | 'center';

/** Neighbour directions closer than this to the bond axis count for neither side. */
const SIDE_EPS = 1e-6;
const MIN_ANGLE = Math.PI / 6;
const MAX_ANGLE = (5 * Math.PI) / 6;

/** Which side the second line of a double (or 1.5) bond goes to, or `center` for two centred lines. */
export function doubleSide(input: BondInput): DoubleSide {
  const { bond, a, b } = input;
  const placement = bond.doublePlacement;
  if (placement !== 'auto') return placement;
  if (bond.order === 1.5) return 'center';
  const d = sub(b.pos, a.pos);
  const n = leftNormal(d);
  if (!n) return 'center';
  if (input.ringCentroid) {
    const mid = scale(add(a.pos, b.pos), 0.5);
    const s = dot(sub(input.ringCentroid, mid), n);
    return s > 0 ? 'left' : s < 0 ? 'right' : 'center';
  }
  let left = 0;
  let right = 0;
  for (const v of [...a.others, ...b.others]) {
    const w = normalize(v);
    if (!w) continue;
    const s = dot(w, n);
    if (s > SIDE_EPS) left++;
    else if (s < -SIDE_EPS) right++;
  }
  return left > right ? 'left' : right > left ? 'right' : 'center';
}

/** `doubleGap * cot(phi / 2)` for each end of the line shifted towards `sideVec`. */
function shortening(
  input: BondInput,
  u: Point,
  sideVec: Point,
  style: ResolvedStyle,
): [number, number] {
  const cot = (phi: number): number => {
    const half = Math.min(MAX_ANGLE, Math.max(MIN_ANGLE, phi)) / 2;
    return Math.cos(half) / Math.sin(half);
  };
  const forEnd = (end: BondEnd, dir: Point): number => {
    let nearest: number | null = null;
    for (const v of end.others) {
      const w = normalize(v);
      if (!w || dot(w, sideVec) <= SIDE_EPS) continue;
      const angle = Math.atan2(Math.abs(cross(dir, w)), dot(dir, w));
      if (nearest === null || angle < nearest) nearest = angle;
    }
    return nearest === null ? 0 : style.doubleGap * cot(nearest);
  };
  let s1 = forEnd(input.a, u);
  let s2 = forEnd(input.b, { x: -u.x, y: -u.y });
  const cap = 0.5 * style.bondLength;
  if (s1 + s2 > cap) {
    const k = cap / (s1 + s2);
    s1 *= k;
    s2 *= k;
  }
  return [s1, s2];
}

const pathD = (pts: readonly Point[], prefix: readonly string[] = []): string =>
  pts.map((p, i) => `${prefix[i] ?? 'L'}${fmt(p.x)} ${fmt(p.y)}`).join('');

interface LineSpec {
  /** Offset along the left normal, pt. */
  readonly offset: number;
  readonly dashed: boolean;
  /** Shortening at each end (the second line of a double bond). */
  readonly short?: readonly [number, number];
}

/**
 * The part of segment `a`-`b` left after the clip boxes of its two ends: it starts at the
 * farthest exit among the boxes of the `a` end that the segment intersects, and stops at the
 * nearest entry of the `b` end's boxes. `[t0, t1]` are fractions of the segment; `null` when
 * nothing is left.
 */
function clipSpan(
  a: Point,
  b: Point,
  ca: readonly Rect[] | null,
  cb: readonly Rect[] | null,
): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  for (const box of ca ?? []) t0 = Math.max(t0, segmentBoxInterval(a, b, box)?.[1] ?? 0);
  for (const box of cb ?? []) t1 = Math.min(t1, segmentBoxInterval(a, b, box)?.[0] ?? 1);
  return t1 - t0 > 1e-9 ? [t0, t1] : null;
}

/** The line from `a` to `b` cut at both ends' clip boxes (see `clipSpan`), or `null`. */
function clipSegment(
  a: Point,
  b: Point,
  ca: readonly Rect[] | null,
  cb: readonly Rect[] | null,
): [Point, Point] | null {
  const span = clipSpan(a, b, ca, cb);
  if (!span) return null;
  const start = span[0] > 0 ? lerp(a, b, span[0]) : a;
  // The far end is measured from the cut start, like a second cut of the remaining piece.
  let t = 1;
  for (const box of cb ?? []) t = Math.min(t, segmentBoxInterval(start, b, box)?.[0] ?? 1);
  return [start, t < 1 ? lerp(start, b, t) : b];
}

function lineSpecs(
  input: BondInput,
  u: Point,
  n: Point,
  style: ResolvedStyle,
): readonly LineSpec[] {
  const { bond } = input;
  const gap = style.doubleGap;
  const shifted = (side: 'left' | 'right', dashed: boolean): LineSpec[] => {
    const sign = side === 'left' ? 1 : -1;
    return [
      { offset: 0, dashed: false },
      { offset: sign * gap, dashed, short: shortening(input, u, scale(n, sign), style) },
    ];
  };
  switch (bond.order) {
    case 3:
      return [-gap, 0, gap].map((offset) => ({ offset, dashed: false }));
    case 2: {
      const side = doubleSide(input);
      return side === 'center'
        ? [gap / 2, -gap / 2].map((offset) => ({ offset, dashed: false }))
        : shifted(side, false);
    }
    case 1.5: {
      if (input.circled) return [{ offset: 0, dashed: false }];
      const side = doubleSide(input);
      return side === 'center'
        ? [
            { offset: gap / 2, dashed: false },
            { offset: -gap / 2, dashed: true },
          ]
        : shifted(side, true);
    }
    case 1:
      return [{ offset: 0, dashed: false }];
    default:
      exhaustive(bond.order);
      return [{ offset: 0, dashed: false }];
  }
}

function strokedLines(
  input: BondInput,
  u: Point,
  n: Point,
  color: string,
  style: ResolvedStyle,
): BondLayout | null {
  const { a, b } = input;
  const len = length(sub(b.pos, a.pos));
  const half = style.lineWidth / 2;
  const svg: string[] = [];
  const ink: Rect[] = [];
  for (const spec of lineSpecs(input, u, n, style)) {
    const [s1, s2] = spec.short ?? [0, 0];
    if (s1 + s2 >= len) continue;
    const shift = scale(n, spec.offset);
    const from = add(add(a.pos, shift), scale(u, s1));
    const to = sub(add(b.pos, shift), scale(u, s2));
    const piece = clipSegment(from, to, a.clip, b.clip);
    for (const [p, q] of piece ? [piece] : []) {
      svg.push(
        el('path', {
          d: pathD([p, q], ['M', 'L']),
          stroke: color,
          'stroke-width': style.lineWidth,
          'stroke-dasharray': spec.dashed
            ? `${fmt(style.dashOn)} ${fmt(style.dashOff)}`
            : undefined,
        }),
      );
      ink.push(growRect(rectFromPoints([p, q]) as Rect, half));
    }
  }
  const box = unionAll(ink);
  return box ? { svg: svg.join('\n'), ink: box } : null;
}

/** The part of the axis outside both ends' label boxes, as distances from `a`; `null` if none is left. */
function axisSpan(input: BondInput, len: number): [number, number] | null {
  const { a, b } = input;
  const span = clipSpan(a.pos, b.pos, a.clip, b.clip);
  return span ? [span[0] * len, span[1] * len] : null;
}

function filled(points: readonly Point[], color: string): BondLayout {
  return {
    svg: el('polygon', {
      points: points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' '),
      fill: color,
      stroke: 'none',
    }),
    ink: rectFromPoints(points) as Rect,
  };
}

/**
 * Lays out one bond. `null` when nothing is visible: coincident atoms, or the label boxes cover
 * the whole bond. Stereo flags apply to single bonds only; elsewhere they are ignored.
 */
export function layoutBond(input: BondInput, style: ResolvedStyle): BondLayout | null {
  const { bond, a, b } = input;
  const d = sub(b.pos, a.pos);
  const len = length(d);
  const u = normalize(d);
  const n = leftNormal(d);
  if (!u || !n) return null;
  const color = bond.color ?? INK;
  const at = (s: number, h = 0): Point => add(add(a.pos, scale(u, s)), scale(n, h));
  const stereo = bond.order === 1 ? bond.stereo : 'none';

  switch (stereo) {
    case 'wedge': {
      const span = axisSpan(input, len);
      if (!span) return null;
      const [t0, t1] = span;
      const h0 = (style.wedgeWide / 2) * (t0 / len);
      const h1 = (style.wedgeWide / 2) * (t1 / len);
      return filled(
        t0 === 0
          ? [at(0), at(t1, h1), at(t1, -h1)]
          : [at(t0, h0), at(t1, h1), at(t1, -h1), at(t0, -h0)],
        color,
      );
    }
    case 'bold': {
      const span = axisSpan(input, len);
      if (!span) return null;
      const h = style.boldWidth / 2;
      return filled([at(span[0], h), at(span[1], h), at(span[1], -h), at(span[0], -h)], color);
    }
    case 'hash': {
      const span = axisSpan(input, len);
      if (!span) return null;
      const count = Math.max(3, Math.round(len / style.hashSpacing));
      const svg: string[] = [];
      const ink: Rect[] = [];
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const s = t * len;
        if (s < span[0] || s > span[1]) continue;
        const h = (style.wedgeWide / 2) * t;
        const p = at(s, h);
        const q = at(s, -h);
        svg.push(
          el('path', {
            d: pathD([p, q], ['M', 'L']),
            stroke: color,
            'stroke-width': style.lineWidth,
          }),
        );
        ink.push(growRect(rectFromPoints([p, q]) as Rect, style.lineWidth / 2));
      }
      const box = unionAll(ink);
      return box ? { svg: svg.join('\n'), ink: box } : null;
    }
    case 'wavy': {
      const span = axisSpan(input, len);
      if (!span) return null;
      const [t0, t1] = span;
      const waves = Math.max(2, 2 * Math.round((t1 - t0) / style.wavyLength / 2));
      const step = (t1 - t0) / waves;
      const pts: Point[] = [at(t0)];
      const ink: Rect[] = [];
      for (let k = 0; k < waves; k++) {
        const from = pts[pts.length - 1] as Point;
        const control = at(t0 + (k + 0.5) * step, (k % 2 === 0 ? -1 : 1) * 2 * style.wavyAmplitude);
        const to = at(t0 + (k + 1) * step);
        pts.push(control, to);
        ink.push(quadBounds(from, control, to));
      }
      const box = unionAll(ink) as Rect;
      return {
        svg: el('path', {
          d: pathD(pts, ['M', ...pts.slice(1).map((_, i) => (i % 2 === 0 ? 'Q' : ' '))]),
          stroke: color,
          'stroke-width': style.lineWidth,
        }),
        ink: growRect(box, style.lineWidth / 2),
      };
    }
    case 'none':
      return strokedLines(input, u, n, color, style);
    default:
      exhaustive(stereo);
      return strokedLines(input, u, n, color, style);
  }
}
