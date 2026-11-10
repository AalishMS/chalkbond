import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import fc from 'fast-check';
import { withPdfDrawing, readPdfDrawing } from '../../src/core/clipboard-export';
const pdf = new Uint8Array(
  readFileSync(
    new URL('../../src/core/clipboard-export/__fixtures__/chromium-45.pdf', import.meta.url),
  ),
);
test('printable ASCII round trips', () => {
  fc.assert(
    fc.property(fc.array(fc.integer({ min: 32, max: 126 })), (codes) => {
      const payload = String.fromCharCode(...codes);
      const result = withPdfDrawing(pdf, payload);
      expect(result.ok).toBe(true);
      if (result.ok) expect(readPdfDrawing(result.pdf)).toBe(payload);
    }),
  );
});
test('arbitrary bytes and every fixture truncation never throw', () => {
  fc.assert(
    fc.property(fc.uint8Array(), (bytes) => {
      expect(() => readPdfDrawing(bytes)).not.toThrow();
      expect(() => withPdfDrawing(bytes, 'x')).not.toThrow();
    }),
  );
  for (let i = 0; i < pdf.length; i++) expect(() => readPdfDrawing(pdf.slice(0, i))).not.toThrow();
});
