import { expect, test } from 'vitest';
import { BITMAP_KEY, DRAWING_KEY, SVG_KEY, preferredFormats } from './formats';

// CB-W1 / Decision R9: exactly the keys probe C3 verified on Windows; no exact-PNG entry, no fallback.
test('the format keys are exactly the verified three', () => {
  expect(preferredFormats).toEqual({
    bitmap: 'image/png',
    svg: 'electron application/osclipboard;format="image/svg+xml"',
    drawing: 'electron application/osclipboard;format="application/x-chalkbond"',
  });
  expect(Object.keys(preferredFormats)).toEqual(['bitmap', 'svg', 'drawing']);
  expect([BITMAP_KEY, SVG_KEY, DRAWING_KEY]).toEqual(Object.values(preferredFormats));
});
