// Overlay shapes (SPEC-editor.md "Canvas appearance", "Rendering" step 5): pure data in screen
// px, drawn by `view/Overlay.tsx`. Only the hover group exists so far; selection, ghosts,
// guides and warnings arrive with their tasks.
import { resolveAnchor, type Doc } from '@core/doc-model';
import type { Scene } from '@core/svg-render';
import { curveControl, type Hit } from './hit-test';
import { growRect, type Point, type Rect } from './geometry';
import { bluToScreen, ptToScreen, type Viewport } from './viewport';

/** Hover: a skeleton vertex gets a circle of diameter 18. */
export const HOVER_CIRCLE_R = 9;
/** Hover: width of the band along a bond or an arrow. */
export const HOVER_BAND = 8;
/** Hover: px an `extents` box is grown by. */
export const HOVER_GROW = 3;
/** Hover: corner radius of a box. */
export const HOVER_RADIUS = 4;

export type OverlayShape =
  | { readonly kind: 'circle'; readonly c: Point; readonly r: number }
  /** A round-capped stroke from `from` to `to`, straight or bent through `control`. */
  | {
      readonly kind: 'band';
      readonly from: Point;
      readonly to: Point;
      readonly control?: Point;
      readonly width: number;
    }
  | { readonly kind: 'box'; readonly rect: Rect; readonly radius: number };

/** Shapes drawn together at one group opacity. */
export interface OverlayGroup {
  readonly kind: 'hover';
  readonly shapes: readonly OverlayShape[];
}

/** An `extents` box (pt) in screen px. */
function boxShape(v: Viewport, ink: Rect): OverlayShape {
  const a = ptToScreen(v, { x: ink.x, y: ink.y });
  const b = ptToScreen(v, { x: ink.x + ink.w, y: ink.y + ink.h });
  const rect = growRect({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }, HOVER_GROW);
  return { kind: 'box', rect, radius: HOVER_RADIUS };
}

/** The shape that highlights `hit`, or null when the item is gone or has none. */
function hoverShape(hit: Hit, doc: Doc, scene: Scene, v: Viewport): OverlayShape | null {
  const bl = scene.style.bondLength;
  switch (hit.kind) {
    case 'atom': {
      const atom = doc.atoms[hit.id];
      if (!atom) return null;
      const ink = scene.extents[`atom:${hit.id}`];
      return ink === undefined
        ? { kind: 'circle', c: bluToScreen(v, atom, bl), r: HOVER_CIRCLE_R }
        : boxShape(v, ink);
    }
    case 'bond': {
      const bond = doc.bonds[hit.id];
      const a1 = bond && doc.atoms[bond.a1];
      const a2 = bond && doc.atoms[bond.a2];
      if (!a1 || !a2) return null;
      return {
        kind: 'band',
        from: bluToScreen(v, a1, bl),
        to: bluToScreen(v, a2, bl),
        width: HOVER_BAND,
      };
    }
    case 'object': {
      const obj = doc.objects[hit.id];
      if (!obj) return null;
      if (obj.type === 'arrow') {
        return {
          kind: 'band',
          from: bluToScreen(v, obj.from, bl),
          to: bluToScreen(v, obj.to, bl),
          width: HOVER_BAND,
        };
      }
      if (obj.type === 'curved-arrow') {
        const from = bluToScreen(v, resolveAnchor(doc, obj.from), bl);
        const to = bluToScreen(v, resolveAnchor(doc, obj.to), bl);
        return {
          kind: 'band',
          from,
          to,
          control: curveControl(from, to, obj.bend),
          width: HOVER_BAND,
        };
      }
      const ink = scene.extents[`obj:${hit.id}`];
      return ink === undefined ? null : boxShape(v, ink);
    }
    default:
      return null;
  }
}

/** The overlay groups for the current state: the hover highlight. */
export function overlayGroups(
  hover: Hit | null,
  doc: Doc,
  scene: Scene,
  viewport: Viewport,
): OverlayGroup[] {
  if (hover === null) return [];
  const shape = hoverShape(hover, doc, scene, viewport);
  return shape === null ? [] : [{ kind: 'hover', shapes: [shape] }];
}
