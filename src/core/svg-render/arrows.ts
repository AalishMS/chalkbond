// Arrows and plus signs (SPEC-svg-render.md "Objects"). Pure geometry in pt: the caller converts
// from BLU and checks that every coordinate is finite.
import type { ArrowKind, Point, Rect } from '../doc-model';
import { exhaustive } from './order';
import { pathD, polygonEl, strokeEl, type Drawn } from './draw';
import { add, growRect, leftNormal, length, rectFromPoints, scale, sub, unionAll } from './geom';
import { INK, type ResolvedStyle } from './style';

/** Head length is at most this fraction of the arrow's length (a quarter for two heads). */
const HEAD_FRACTION = 0.5;
const HEAD_FRACTION_BOTH = 0.25;

interface Frame {
  readonly from: Point;
  readonly to: Point;
  /** Unit vector from `from` to `to`. */
  readonly u: Point;
  /** Unit normal on the visual left of travel. */
  readonly n: Point;
  readonly len: number;
  readonly headLength: number;
  readonly headHalf: number;
}

/** Accumulates elements and their ink boxes. */
class Canvas {
  readonly svg: string[] = [];
  readonly ink: Rect[] = [];
  constructor(private readonly style: ResolvedStyle) {}

  /** A stroked polyline (round caps: grown by half the line width). */
  line(points: readonly Point[]): void {
    this.svg.push(strokeEl(pathD(points, ['M']), INK, this.style));
    this.ink.push(growRect(rectFromPoints(points) as Rect, this.style.lineWidth / 2));
  }

  /** A filled polygon. */
  fill(points: readonly Point[]): void {
    this.svg.push(polygonEl(points, INK));
    this.ink.push(rectFromPoints(points) as Rect);
  }

  done(): Drawn | null {
    const ink = unionAll(this.ink);
    return ink ? { svg: this.svg.join('\n'), ink } : null;
  }
}

const at = (origin: Point, u: Point, s: number, n: Point, t: number): Point =>
  add(add(origin, scale(u, s)), scale(n, t));

/** A triangular head: the tip, then the two base corners. */
export function triangle(tip: Point, back: Point, n: Point, half: number): Point[] {
  const base = sub(tip, back);
  return [tip, add(base, scale(n, half)), sub(base, scale(n, half))];
}

/**
 * Draws an arrow from `from` to `to` (pt). `null` when it has no length. The head length is
 * clamped to half the length (a quarter for the two heads of a resonance arrow).
 */
export function layoutArrow(
  kind: ArrowKind,
  from: Point,
  to: Point,
  style: ResolvedStyle,
): Drawn | null {
  const len = length(sub(to, from));
  const n = leftNormal(sub(to, from));
  if (!(len > 1e-9) || !n) return null;
  const u = scale(sub(to, from), 1 / len);
  const fraction = kind === 'resonance' ? HEAD_FRACTION_BOTH : HEAD_FRACTION;
  const f: Frame = {
    from,
    to,
    u,
    n,
    len,
    headLength: Math.min(style.arrowHeadLength, fraction * len),
    headHalf: style.arrowHeadHalfWidth,
  };
  const c = new Canvas(style);
  switch (kind) {
    case 'forward':
      forward(c, f);
      break;
    case 'no-go':
      forward(c, f);
      cross(c, f, style);
      break;
    case 'resonance':
      resonance(c, f);
      break;
    case 'equilibrium':
      equilibrium(c, f, style);
      break;
    case 'retro':
      retro(c, f, style);
      break;
    default:
      exhaustive(kind);
      forward(c, f);
  }
  return c.done();
}

function forward(c: Canvas, f: Frame): void {
  const base = sub(f.to, scale(f.u, f.headLength));
  c.line([f.from, base]);
  c.fill(triangle(f.to, scale(f.u, f.headLength), f.n, f.headHalf));
}

function resonance(c: Canvas, f: Frame): void {
  c.line([add(f.from, scale(f.u, f.headLength)), sub(f.to, scale(f.u, f.headLength))]);
  c.fill(triangle(f.to, scale(f.u, f.headLength), f.n, f.headHalf));
  c.fill(triangle(f.from, scale(f.u, -f.headLength), f.n, f.headHalf));
}

/** The forward arrow plus a cross (two diagonals, half-length `noGoHalf`) on the shaft midpoint. */
function cross(c: Canvas, f: Frame, style: ResolvedStyle): void {
  const mid = scale(add(f.from, f.to), 0.5);
  const k = style.noGoHalf * Math.SQRT1_2;
  for (const d of [add(f.u, f.n), sub(f.u, f.n)]) {
    const v = scale(d, k);
    c.line([sub(mid, v), add(mid, v)]);
  }
}

/** Two harpoons: the left of travel points to `to`, the right one to `from`; barbs outside. */
function equilibrium(c: Canvas, f: Frame, style: ResolvedStyle): void {
  const half = style.equilibriumGap / 2;
  const hl = scale(f.u, f.headLength);
  const upper = scale(f.n, half);
  const lower = scale(f.n, -half);

  const tipA = add(f.to, upper);
  c.line([add(f.from, upper), sub(tipA, hl)]);
  c.fill(halfHead(tipA, hl, scale(f.n, f.headHalf)));

  const tipB = add(f.from, lower);
  c.line([add(f.to, lower), add(tipB, hl)]);
  c.fill(halfHead(tipB, scale(hl, -1), scale(f.n, -f.headHalf)));
}

/** A one-sided head: the tip, the base point on the shaft and the barb. */
export function halfHead(tip: Point, back: Point, barb: Point): Point[] {
  const base = sub(tip, back);
  return [tip, base, add(base, barb)];
}

/** Two parallel lines ending on an open chevron (the retrosynthetic arrow). */
function retro(c: Canvas, f: Frame, style: ResolvedStyle): void {
  const half = style.equilibriumGap / 2;
  const base = sub(f.to, scale(f.u, f.headLength));
  // Where a line at lateral offset `half` meets a chevron arm: a fraction `t` of the head length
  // from the base (0 at the base, 1 at the tip).
  const t = Math.max(0, 1 - half / f.headHalf);
  const end = add(base, scale(f.u, t * f.headLength));
  for (const side of [1, -1]) {
    const shift = scale(f.n, side * half);
    c.line([add(f.from, shift), add(end, shift)]);
  }
  c.line([at(base, f.u, 0, f.n, f.headHalf), f.to, at(base, f.u, 0, f.n, -f.headHalf)]);
}

/** A plus sign: two lines crossing at `p`, arm `plusArm`. */
export function layoutPlus(p: Point, style: ResolvedStyle): Drawn {
  const a = style.plusArm;
  const pts: Point[] = [
    { x: p.x - a, y: p.y },
    { x: p.x + a, y: p.y },
    { x: p.x, y: p.y - a },
    { x: p.x, y: p.y + a },
  ];
  return {
    svg: strokeEl(pathD(pts, ['M', 'L', 'M', 'L']), INK, style),
    ink: growRect(rectFromPoints(pts) as Rect, style.lineWidth / 2),
  };
}
