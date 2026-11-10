// Centre snapping while moving (SPEC-editor.md S3, R4): the moving ink box's centre x or y is
// pulled onto another item's centre when it comes within 6 screen px.
import type { Guide } from '../state/editor-state';
import type { Point, Rect } from './geometry';

/** Screen px within which a centre is pulled onto another. */
export const SNAP_PX = 6;

export interface SnapResult {
  /** The translation to apply, pt, after snapping. */
  readonly d: Point;
  readonly guides: readonly Guide[];
}

/**
 * One axis: the nearest centre of `others` to `centre + d` within `SNAP_PX`, as the adjusted
 * `d` and the centre it aligned to; null when none is close enough.
 */
function pull(
  centre: number,
  d: number,
  others: readonly number[],
  pxPerPt: number,
): { d: number; to: number } | null {
  let best: { d: number; to: number; gap: number } | null = null;
  for (const to of others) {
    const gap = Math.abs(centre + d - to);
    if (gap * pxPerPt <= SNAP_PX && (best === null || gap < best.gap)) {
      best = { d: to - centre, to, gap };
    }
  }
  return best;
}

/**
 * Snaps a move of the ink box `moving` (pt) by `d` (pt) against the ink boxes `others`. `pxPerPt`
 * converts to screen px. `locked` axes (the Shift constraint pinned them at zero) are left alone.
 */
export function snapMove(
  moving: Rect,
  others: readonly Rect[],
  d: Point,
  pxPerPt: number,
  locked: { readonly x: boolean; readonly y: boolean },
): SnapResult {
  const guides: Guide[] = [];
  let { x, y } = d;
  if (!locked.x) {
    const hit = pull(
      moving.x + moving.w / 2,
      d.x,
      others.map((o) => o.x + o.w / 2),
      pxPerPt,
    );
    if (hit !== null) {
      x = hit.d;
      guides.push({ axis: 'x', pt: hit.to });
    }
  }
  if (!locked.y) {
    const hit = pull(
      moving.y + moving.h / 2,
      d.y,
      others.map((o) => o.y + o.h / 2),
      pxPerPt,
    );
    if (hit !== null) {
      y = hit.d;
      guides.push({ axis: 'y', pt: hit.to });
    }
  }
  return { d: { x, y }, guides };
}
