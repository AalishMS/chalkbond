export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** W1 uses measured native frame dimensions, and returns outer normal bounds. */
export function firstWindowBounds(
  area: WorkArea,
  frame: readonly [number, number],
): WorkArea & { maximized: boolean } {
  const wantedWidth = 1280 + frame[0];
  const wantedHeight = 800 + frame[1];
  const width = Math.min(wantedWidth, area.width);
  const height = Math.min(wantedHeight, area.height);
  return {
    x: area.x + Math.floor((area.width - width) / 2),
    y: area.y + Math.floor((area.height - height) / 2),
    width,
    height,
    maximized: wantedWidth > area.width || wantedHeight > area.height,
  };
}

/** The stored window of W2 (outer normal bounds and the maximized flag). */
export interface RememberedWindow extends WorkArea {
  maximized: boolean;
}

/**
 * W2: the stored window if at least half of its rectangle lies inside `area`, the work area of
 * `screen.getDisplayMatching(rect)`; null means W1. Maximize is applied after these bounds.
 */
export function restoredWindowBounds(
  stored: RememberedWindow | null,
  area: WorkArea,
): RememberedWindow | null {
  if (stored === null || stored.width <= 0 || stored.height <= 0) return null;
  if (area.width <= 0 || area.height <= 0) return null;
  const overlap = (a: number, aSize: number, b: number, bSize: number): number =>
    Math.max(0, Math.min(a + aSize, b + bSize) - Math.max(a, b));
  const inside =
    overlap(stored.x, stored.width, area.x, area.width) *
    overlap(stored.y, stored.height, area.y, area.height);
  return inside * 2 >= stored.width * stored.height ? { ...stored } : null;
}
