// UNVERIFIED preferred keys: P1–P7 need Windows. Never select from Linux observations.
export const BITMAP_KEY = 'image/png';
export const PNG_KEY = 'electron application/osclipboard;format="PNG"';
export const SVG_KEY = 'electron application/osclipboard;format="image/svg+xml"';
export const DRAWING_KEY = 'electron application/osclipboard;format="application/x-chalkbond"';

export interface FormatSelection {
  bitmap: typeof BITMAP_KEY;
  png: typeof PNG_KEY | null;
  svg: typeof SVG_KEY | 'image/svg+xml' | null;
  drawing: typeof DRAWING_KEY | 'web application/x-chalkbond';
}
export function selectFormats(
  options: {
    png?: 'raw' | 'omit';
    svg?: 'raw' | 'mime' | 'omit';
    drawing?: 'raw' | 'web';
  } = {},
): FormatSelection {
  return {
    bitmap: BITMAP_KEY,
    png: options.png === 'omit' ? null : PNG_KEY,
    svg: options.svg === 'omit' ? null : options.svg === 'mime' ? 'image/svg+xml' : SVG_KEY,
    drawing: options.drawing === 'web' ? 'web application/x-chalkbond' : DRAWING_KEY,
  };
}
export const preferredFormats = selectFormats();
