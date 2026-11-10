/** Where a tooltip sits relative to its anchor (SPEC-editor.md "Tooltips"). */
export type TipSide = 'right' | 'below' | 'above';
export type PlacedSide = TipSide | 'left';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Placement {
  x: number;
  y: number;
  side: PlacedSide;
}

/** Distance between the anchor and the tooltip. */
export const TOOLTIP_GAP = 8;
/** Smallest distance between a tooltip and the window edge. */
export const TOOLTIP_MARGIN = 8;

const OPPOSITE: Record<PlacedSide, PlacedSide> = {
  right: 'left',
  left: 'right',
  below: 'above',
  above: 'below',
};

/** Keeps `v` in [margin, limit - margin - size]; the margin wins when the range is empty. */
function clamp(v: number, size: number, limit: number): number {
  return Math.min(
    Math.max(v, TOOLTIP_MARGIN),
    Math.max(TOOLTIP_MARGIN, limit - TOOLTIP_MARGIN - size),
  );
}

function origin(side: PlacedSide, a: Box, tip: Size): { x: number; y: number } {
  switch (side) {
    case 'right':
      return { x: a.x + a.width + TOOLTIP_GAP, y: a.y + (a.height - tip.height) / 2 };
    case 'left':
      return { x: a.x - TOOLTIP_GAP - tip.width, y: a.y + (a.height - tip.height) / 2 };
    case 'below':
      return { x: a.x + (a.width - tip.width) / 2, y: a.y + a.height + TOOLTIP_GAP };
    case 'above':
      return { x: a.x + (a.width - tip.width) / 2, y: a.y - TOOLTIP_GAP - tip.height };
  }
}

function fits(side: PlacedSide, a: Box, tip: Size, bounds: Size): boolean {
  const o = origin(side, a, tip);
  switch (side) {
    case 'right':
      return o.x + tip.width <= bounds.width - TOOLTIP_MARGIN;
    case 'left':
      return o.x >= TOOLTIP_MARGIN;
    case 'below':
      return o.y + tip.height <= bounds.height - TOOLTIP_MARGIN;
    case 'above':
      return o.y >= TOOLTIP_MARGIN;
  }
}

/**
 * Top-left corner (whole pixels) of a tooltip of size `tip` beside `anchor` inside a window of
 * size `bounds`. The preferred side is used unless it is clipped and the opposite side is not;
 * the cross axis is shifted to keep the margin.
 */
export function placeTooltip(anchor: Box, tip: Size, bounds: Size, preferred: TipSide): Placement {
  const side: PlacedSide =
    !fits(preferred, anchor, tip, bounds) && fits(OPPOSITE[preferred], anchor, tip, bounds)
      ? OPPOSITE[preferred]
      : preferred;
  const o = origin(side, anchor, tip);
  return {
    x: Math.round(clamp(o.x, tip.width, bounds.width)),
    y: Math.round(clamp(o.y, tip.height, bounds.height)),
    side,
  };
}
