// The rule for each drawing object (SPEC-svg-render.md "Objects"): converts BLU to pt, checks that
// the geometry is finite, and hands over to the per-type layout. A skipped object returns the
// reason (the caller turns it into a `skipped-item` notice).
import {
  resolveAnchor,
  type Anchor,
  type AtomId,
  type Doc,
  type DrawObject,
  type Point,
  type Rect,
} from '../doc-model';
import { layoutArrow, layoutPlus } from './arrows';
import type { AtomLabel } from './atom-label';
import { layoutBracket } from './brackets';
import { layoutCurvedArrow, type CurveEnd } from './curved-arrow';
import type { Drawn } from './draw';
import { growRect, unionAll } from './geom';
import { exhaustive } from './order';
import { layoutShape } from './shapes';
import { bluToPt, type ResolvedStyle } from './style';
import { layoutCallout, layoutCaption, layoutTextObject } from './text-objects';

/**
 * What the objects need to know about the structures they point at. Built over the whole
 * document, drawn or not, so an object looks the same in a subset render as in the full one.
 */
export interface ObjectContext {
  readonly doc: Doc;
  readonly style: ResolvedStyle;
  /** Pt positions of the atoms whose coordinates are finite. */
  readonly pos: ReadonlyMap<AtomId, Point>;
  /** The labelled atoms' labels. */
  readonly labels: ReadonlyMap<AtomId, AtomLabel>;
  /** Ink boxes (label and satellites) of the atoms that have any. */
  readonly atomInk: ReadonlyMap<AtomId, Rect>;
}

const finite = (p: Point): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);

/** A BLU box as pt; `null` when any part is not finite. */
function rectToPt(r: Rect, style: ResolvedStyle): Rect | null {
  const o = bluToPt({ x: r.x, y: r.y }, style);
  const s = bluToPt({ x: r.w, y: r.h }, style);
  return finite(o) && finite(s) ? { x: o.x, y: o.y, w: s.x, h: s.y } : null;
}

/**
 * An anchor as a curve end in pt, or the reason it cannot be resolved. An atom anchor without an
 * offset on a labelled atom carries the box to be cut out of (the label's anchor box grown by
 * `curvedGap`); a vertex, an offset (lone pair), a bond and a point are used as given.
 */
function resolveEnd(anchor: Anchor, ctx: ObjectContext): CurveEnd | string {
  let blu: Point;
  try {
    blu = resolveAnchor(ctx.doc, anchor);
  } catch {
    return 'anchor refers to a missing atom or bond';
  }
  const point = bluToPt(blu, ctx.style);
  if (!finite(point)) return 'non-finite coordinate';
  const label = anchor.kind === 'atom' && !anchor.offset ? ctx.labels.get(anchor.atom) : undefined;
  return { point, clip: label ? growRect(label.anchorBox, ctx.style.curvedGap) : null };
}

/** The union of the ink of the caption's target atoms (a bare vertex is a point), if any exist. */
function captionTarget(targets: readonly AtomId[], ctx: ObjectContext): Rect | null {
  const boxes: Rect[] = [];
  for (const id of targets) {
    const p = ctx.pos.get(id);
    if (!p || !(id in ctx.doc.atoms)) continue;
    boxes.push(ctx.atomInk.get(id) ?? { x: p.x, y: p.y, w: 0, h: 0 });
  }
  return unionAll(boxes);
}

/** The drawing of one object, or the reason it is skipped. Exhaustive over `DrawObject`. */
export function drawObject(obj: DrawObject, ctx: ObjectContext): Drawn | string {
  const { style } = ctx;
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
    case 'curved-arrow': {
      const from = resolveEnd(obj.from, ctx);
      if (typeof from === 'string') return from;
      const to = resolveEnd(obj.to, ctx);
      if (typeof to === 'string') return to;
      if (!Number.isFinite(obj.bend)) return 'non-finite bend';
      return layoutCurvedArrow(obj.head, from, to, obj.bend, style) ?? 'arrow has no length';
    }
    case 'text': {
      const at = bluToPt(obj.at, style);
      if (!finite(at)) return 'non-finite coordinate';
      return layoutTextObject(obj.runs, obj.align, at, style) ?? 'text has no content';
    }
    case 'caption': {
      const target = captionTarget(obj.target, ctx);
      if (!target) return 'caption has no target atoms';
      return layoutCaption(obj.runs, target, style) ?? 'text has no content';
    }
    case 'callout': {
      const at = bluToPt(obj.at, style);
      if (!finite(at)) return 'non-finite coordinate';
      const anchor = resolveEnd(obj.anchor, ctx);
      if (typeof anchor === 'string') return anchor;
      return layoutCallout(obj.runs, at, anchor, style) ?? 'text has no content';
    }
    default:
      exhaustive(obj);
      return 'unknown object type';
  }
}
