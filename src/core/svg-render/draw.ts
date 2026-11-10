// Small markup helpers shared by the object renderers (arrows, brackets, shapes, text runs).
import type { Point, Rect } from '../doc-model';
import { fmt } from './fmt';
import { el } from './svg-write';
import type { ResolvedStyle } from './style';
import type { UnmeasuredGlyphNotice } from './text-measure';

/** One drawn object: its markup, ink box (pt) and any unmeasured-glyph notices. */
export interface Drawn {
  readonly svg: string;
  readonly ink: Rect;
  readonly notices?: UnmeasuredGlyphNotice[];
}

/** A path `d` from points; `prefix[i]` is the command before point `i` (default `L`). */
export const pathD = (pts: readonly Point[], prefix: readonly string[] = []): string =>
  pts.map((p, i) => `${prefix[i] ?? 'L'}${fmt(p.x)} ${fmt(p.y)}`).join('');

/** A stroked path at the style's line width. */
export const strokeEl = (d: string, color: string, style: ResolvedStyle): string =>
  el('path', { d, stroke: color, 'stroke-width': style.lineWidth });

/** A filled polygon with no outline. */
export const polygonEl = (points: readonly Point[], color: string): string =>
  el('polygon', {
    points: points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' '),
    fill: color,
    stroke: 'none',
  });

/** The same box with non-negative width and height. */
export function normRect(r: Rect): Rect {
  return {
    x: r.w < 0 ? r.x + r.w : r.x,
    y: r.h < 0 ? r.y + r.h : r.y,
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  };
}
