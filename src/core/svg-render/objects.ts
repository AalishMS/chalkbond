// The rule for each drawing object (SPEC-svg-render.md "Objects"): converts BLU to pt, checks that
// the geometry is finite, and hands over to the per-type layout. A skipped object returns the
// reason (the caller turns it into a `skipped-item` notice).
import type { DrawObject, Point, Rect } from '../doc-model';
import { layoutArrow, layoutPlus } from './arrows';
import { layoutBracket } from './brackets';
import type { Drawn } from './draw';
import { exhaustive } from './order';
import { layoutShape } from './shapes';
import { bluToPt, type ResolvedStyle } from './style';

const finite = (p: Point): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);

/** A BLU box as pt; `null` when any part is not finite. */
function rectToPt(r: Rect, style: ResolvedStyle): Rect | null {
  const o = bluToPt({ x: r.x, y: r.y }, style);
  const s = bluToPt({ x: r.w, y: r.h }, style);
  return finite(o) && finite(s) ? { x: o.x, y: o.y, w: s.x, h: s.y } : null;
}

/**
 * The drawing of one object, or the reason it is skipped. Exhaustive over `DrawObject`; the types
 * that have no rule yet are skipped with a notice (removed as S10 lands).
 */
export function drawObject(obj: DrawObject, style: ResolvedStyle): Drawn | string {
  switch (obj.type) {
    case 'arrow': {
      const from = bluToPt(obj.from, style);
      const to = bluToPt(obj.to, style);
      if (!finite(from) || !finite(to)) return 'non-finite coordinate';
      return layoutArrow(obj.kind, from, to, style) ?? 'arrow has no length';
    }
    case 'plus': {
      const at = bluToPt(obj.at, style);
      return finite(at) ? layoutPlus(at, style) : 'non-finite coordinate';
    }
    case 'bracket': {
      const rect = rectToPt(obj.rect, style);
      return rect ? layoutBracket(obj.shape, rect, obj.corner, style) : 'non-finite coordinate';
    }
    case 'shape': {
      const rect = rectToPt(obj.rect, style);
      if (!rect) return 'non-finite coordinate';
      return (
        layoutShape(
          obj.shape,
          rect,
          { fill: obj.fill, stroke: obj.stroke, fillOpacity: obj.fillOpacity },
          style,
        ) ?? 'shape has neither fill nor stroke'
      );
    }
    case 'curved-arrow':
    case 'text':
    case 'caption':
    case 'callout':
      return `${obj.type} is not rendered yet`;
    default:
      exhaustive(obj);
      return 'unknown object type';
  }
}
