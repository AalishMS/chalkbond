import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { withPdfDrawing, readPdfDrawing } from '../../src/core/clipboard-export';
const fixture = new Uint8Array(
  readFileSync(
    new URL('../../src/core/clipboard-export/__fixtures__/chromium-45.pdf', import.meta.url),
  ),
);
test('incremental update preserves prefix and round trips', () => {
  const result = withPdfDrawing(fixture, '{"drawing":true}');
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.pdf.slice(0, fixture.length)).toEqual(fixture);
  expect(readPdfDrawing(result.pdf)).toBe('{"drawing":true}');
  expect(readPdfDrawing(fixture)).toBeNull();
  const old = Buffer.from(fixture).toString('latin1');
  const text = Buffer.from(result.pdf).toString('latin1');
  const prev = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(old)?.[1];
  expect(text).toContain('/Prev ' + prev);
  const size = Number(/\/Size\s+(\d+)/.exec(old)?.[1]);
  expect(text).toContain('/Size ' + (size + 1));
  expect(text).toContain('/Root ' + /\/Root\s+(\d+\s+\d+\s+R)/.exec(old)?.[1]);
  const offset = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(text)?.[1]);
  const section = text.slice(offset);
  const objectOffset = Number(/xref\n\d+ 1\n(\d+)/.exec(section)?.[1]);
  expect(text.slice(objectOffset)).toMatch(new RegExp('^' + size + ' 0 obj'));
});
test('refuses malformed, encrypted and xref stream inputs', () => {
  const text = Buffer.from(fixture).toString('latin1');
  const bytes = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'));
  expect(withPdfDrawing(bytes(text.replace('%%EOF', '')), 'x')).toEqual({
    ok: false,
    reason: 'unrecognised',
  });
  expect(withPdfDrawing(bytes(text.replace('/Size', '/Encrypt 1 0 R /Size')), 'x')).toEqual({
    ok: false,
    reason: 'encrypted',
  });
  const offset = Number(/startxref\s+(\d+)/.exec(text)?.[1]);
  expect(
    withPdfDrawing(
      bytes(text.slice(0, offset) + '1 0 obj << /Type /XRef >>' + text.slice(offset + 4)),
      'x',
    ),
  ).toEqual({ ok: false, reason: 'xref-stream' });
});

test('copies optional trailer ID and Info and inserts an EOL after a bare EOF', () => {
  const text = Buffer.from(fixture).toString('latin1').trimEnd();
  const withId = text.replace(/trailer\s*<</, 'trailer\n<< /ID [<0123><abcd>]');
  const result = withPdfDrawing(new Uint8Array(Buffer.from(withId, 'latin1')), 'ascii');
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const updated = Buffer.from(result.pdf).toString('latin1');
  const appended = updated.slice(withId.length);
  expect(appended).toMatch(/^\n\d+ 0 obj/);
  expect(appended).toContain('/ID [<0123><abcd>]');
  const info = /\/Info\s+(\d+\s+\d+\s+R)/.exec(text)?.[1];
  expect(info).toBeDefined();
  expect(appended).toContain('/Info ' + info);
  expect(readPdfDrawing(result.pdf)).toBe('ascii');
});
