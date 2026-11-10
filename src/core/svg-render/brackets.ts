// Brackets (SPEC-svg-render.md "Objects", `bracket`): square with inward serifs, round arcs,
// curly braces, and optional corner runs (a charge, `n`, a double dagger) at the right bracket.
import type { Point, Rect, TextRun } from '../doc-model';
import { normRect, pathD, strokeEl, type Drawn } from './draw';
import { fmt } from './fmt';
import { cubicBounds, growRect, quadBounds, rectUnion } from './geom';
import { exhaustive } from './order';
import { INK, type ResolvedStyle } from './style';
import type { UnmeasuredGlyphNotice } from './text-measure';
import { placeRuns } from './text-run';

type Shape = 'square' | 'round' | 'curly';
/** Which bracket of the pair: `-1` stands on the left edge, `+1` on the right edge. */
type Side = -1 | 1;

/** Handle length of the quarter curves of a brace, as a fraction of the span. */
const KAPPA = 0.55;

interface Piece {
  readonly svg: string;
  /** Geometry of the centre line (the stroke is added by the caller). */
  readonly geometry: Rect;
}

const pt = (x: number, y: number): Point => ({ x, y });

function squareSide(r: Rect, side: Side, style: ResolvedStyle): Piece {
  const x = side < 0 ? r.x : r.x + r.w;
  const serif = Math.min(style.bracketSerif, r.w / 2);
  const inner = x - side * serif;
  const pts = [pt(inner, r.y), pt(x, r.y), pt(x, r.y + r.h), pt(inner, r.y + r.h)];
  return {
    svg: strokeEl(pathD(pts, ['M']), INK, style),
    geometry: { x: Math.min(x, inner), y: r.y, w: serif, h: r.h },
  };
}

function roundSide(r: Rect, side: Side, style: ResolvedStyle): Piece {
  const x = side < 0 ? r.x : r.x + r.w;
  const p0 = pt(x, r.y);
  // A quadratic curve peaks halfway to its control point, so the control is twice the bulge out.
  const p1 = pt(x + side * 2 * style.roundBulge, r.y + r.h / 2);
  const p2 = pt(x, r.y + r.h);
  return {
    svg: strokeEl(pathD([p0, p1, p2], ['M', 'Q', ' ']), INK, style),
    geometry: quadBounds(p0, p1, p2),
  };
}

/** A brace: end, quarter curve to the stem, stem, curve to the tip, and the mirror image. */
function curlySide(r: Rect, side: Side, style: ResolvedStyle): Piece {
  const x = side < 0 ? r.x : r.x + r.w;
  const depth = style.curlyDepth;
  const xs = x + (side * depth) / 2;
  const xt = x + side * depth;
  const yc = r.y + r.h / 2;
  const k = Math.min(depth / 2, r.h / 4);
  const top = r.y;
  const bottom = r.y + r.h;
  const near = x + (xs - x) * KAPPA;
  const tipHandle = xs + (xt - xs) * KAPPA;
  const rest = k * (1 - KAPPA);
  const cubics: [Point, Point, Point, Point][] = [
    [pt(x, top), pt(near, top), pt(xs, top + rest), pt(xs, top + k)],
    [pt(xs, yc - k), pt(xs, yc - rest), pt(tipHandle, yc), pt(xt, yc)],
    [pt(xt, yc), pt(tipHandle, yc), pt(xs, yc + rest), pt(xs, yc + k)],
    [pt(xs, bottom - k), pt(xs, bottom - rest), pt(near, bottom), pt(x, bottom)],
  ];
  const num = (p: Point): string => `${fmt(p.x)} ${fmt(p.y)}`;
  const curve = ([, a, b, c]: [Point, Point, Point, Point]): string =>
    `C${num(a)} ${num(b)} ${num(c)}`;
  const [c1, c2, c3, c4] = cubics as [
    [Point, Point, Point, Point],
    [Point, Point, Point, Point],
    [Point, Point, Point, Point],
    [Point, Point, Point, Point],
  ];
  const d = `M${num(c1[0])}${curve(c1)}L${num(c2[0])}${curve(c2)}${curve(c3)}L${num(c4[0])}${curve(c4)}`;
  const geometry = cubics
    .map(([a, b, c, e]) => cubicBounds(a, b, c, e))
    .reduce((acc, box) => rectUnion(acc, box));
  return { svg: strokeEl(d, INK, style), geometry };
}

function drawSide(shape: Shape, r: Rect, side: Side, style: ResolvedStyle): Piece {
  switch (shape) {
    case 'square':
      return squareSide(r, side, style);
    case 'round':
      return roundSide(r, side, style);
    case 'curly':
      return curlySide(r, side, style);
    default:
      exhaustive(shape);
      return squareSide(r, side, style);
  }
}

/**
 * A bracket pair around `rect` (pt). Corner runs start `cornerGap` right of the right bracket's
 * outer ink edge, with the baseline on the bottom edge; when the first run is a superscript the
 * top of the text box sits on the top edge instead.
 */
export function layoutBracket(
  shape: Shape,
  rect: Rect,
  corner: readonly TextRun[] | undefined,
  style: ResolvedStyle,
): Drawn {
  const r = normRect(rect);
  const half = style.lineWidth / 2;
  const left = drawSide(shape, r, -1, style);
  const right = drawSide(shape, r, 1, style);
  const svg = [left.svg, right.svg];
  let ink = rectUnion(growRect(left.geometry, half), growRect(right.geometry, half));
  const notices: UnmeasuredGlyphNotice[] = [];

  const first = corner?.find((run) => run.text !== '');
  if (corner && first) {
    const x = ink.x + ink.w + style.cornerGap;
    let placed = placeRuns(corner, style, { x, y: r.y + r.h });
    if (placed && first.script === 'sup') {
      const ascent = r.y + r.h - placed.box.y;
      placed = placeRuns(corner, style, { x, y: r.y + ascent });
    }
    if (placed) {
      svg.push(placed.svg);
      ink = rectUnion(ink, placed.box);
      notices.push(...placed.notices);
    }
  }
  return { svg: svg.join('\n'), ink, ...(notices.length > 0 ? { notices } : {}) };
}
