// CB-W1 keys, verified on Windows 11 with Electron 45.2.3 by probe C3 on 2026-11-11
// (`e2e/win/clipboard-facts.spec.ts`; SPEC-clipboard-export.md Decision R9). Never choose keys from Linux observations.
export const BITMAP_KEY = 'image/png';
export const SVG_KEY = 'electron application/osclipboard;format="image/svg+xml"';
export const DRAWING_KEY = 'electron application/osclipboard;format="application/x-chalkbond"';

export const preferredFormats = {
  bitmap: BITMAP_KEY,
  svg: SVG_KEY,
  drawing: DRAWING_KEY,
} as const;
