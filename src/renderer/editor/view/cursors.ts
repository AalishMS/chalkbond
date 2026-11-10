import type { CanvasCursor } from '../model/cursor';
import sprite from './icons.svg?raw';

/** Ink of the erase cursor: the `--text` token. */
const INK = '#1f2328';

/** Erase: the icon's paths as a 20 x 20 `data:` SVG, hotspot at the eraser's corner. */
function eraseCursor(): string {
  const symbol = /<symbol id="erase"[^>]*>([\s\S]*?)<\/symbol>/.exec(sprite);
  const inner = (symbol?.[1] ?? '').replaceAll('currentColor', INK);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">${inner}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 18, crosshair`;
}

let erase: string | undefined;

/** The CSS `cursor` value for a canvas cursor. */
export function cssCursor(cursor: CanvasCursor): string {
  if (cursor !== 'erase') return cursor;
  erase ??= eraseCursor();
  return erase;
}
