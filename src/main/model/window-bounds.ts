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
