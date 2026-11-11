import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { emptyDoc } from '../../src/core/doc-model';
import { drawingPayload, extractDrawing, withPdfDrawing } from '../../src/core/clipboard-export';
test('PDF-A file opening returns embedded payload without interpreting PDF content', () => {
  const bytes = new Uint8Array(
    readFileSync(
      new URL('../../src/core/clipboard-export/__fixtures__/chromium-45.pdf', import.meta.url),
    ),
  );
  const payload = drawingPayload(emptyDoc('2026-11-11T00:00:00.000Z'));
  const result = withPdfDrawing(bytes, payload);
  expect(result.ok).toBe(true);
  if (result.ok)
    expect(
      extractDrawing('pdf', result.pdf, () => {
        throw new Error('PDF is not UTF8');
      }),
    ).toEqual({ ok: true, text: payload });
  expect(extractDrawing('pdf', bytes, () => null)).toEqual({ ok: false, problem: 'no-drawing' });
});
