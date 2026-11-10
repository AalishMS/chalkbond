// Highlight shapes (SPEC-svg-render.md "Objects", `shape`): a rectangle or ellipse with an optional
// translucent fill and an optional outline. Painted in the beneath layer by the caller.
import type { Color, Rect } from '../doc-model';
import { normRect, type Drawn } from './draw';
import { growRect } from './geom';
import { el } from './svg-write';
import type { ResolvedStyle } from './style';

export interface ShapePaint {
  readonly fill?: Color;
  readonly stroke?: Color;
  /** 0..1; clamped, and ignored (opaque) when not finite. */
  readonly fillOpacity: number;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

/** The shape, or `null` when neither fill nor stroke is set. `rect` is in pt. */
export function layoutShape(
  shape: 'rect' | 'ellipse',
  rect: Rect,
  paint: ShapePaint,
  style: ResolvedStyle,
): Drawn | null {
  const { fill, stroke } = paint;
  if (fill === undefined && stroke === undefined) return null;
  const r = normRect(rect);
  const look = {
    fill: fill ?? 'none',
    'fill-opacity': fill === undefined ? undefined : clamp01(paint.fillOpacity),
    stroke: stroke ?? 'none',
    'stroke-width': stroke === undefined ? undefined : style.lineWidth,
  };
  const svg =
    shape === 'rect'
      ? el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, ...look })
      : el('ellipse', {
          cx: r.x + r.w / 2,
          cy: r.y + r.h / 2,
          rx: r.w / 2,
          ry: r.h / 2,
          ...look,
        });
  return { svg, ink: stroke === undefined ? r : growRect(r, style.lineWidth / 2) };
}
