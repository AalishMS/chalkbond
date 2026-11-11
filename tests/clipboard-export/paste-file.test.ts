import { expect, test } from 'vitest';
import fc from 'fast-check';
import { emptyDoc, extract, everything, MAX_FILE_BYTES } from '../../src/core/doc-model';
import {
  crc32,
  pasteAction,
  extractDrawing,
  fileKindOf,
  exportFileName,
  drawingPayload,
  exportSvg,
  withPictureChunks,
} from '../../src/core/clipboard-export';
const png = Uint8Array.from([
  137,
  80,
  78,
  71,
  13,
  10,
  26,
  10,
  ...makeChunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
  ...makeChunk('IEND', []),
]);
function makeChunk(type: string, data: number[]) {
  const b = new Uint8Array(data.length + 12);
  const v = new DataView(b.buffer);
  v.setUint32(0, data.length);
  b.set(
    Array.from(type, (c) => c.charCodeAt(0)),
    4,
  );
  b.set(data, 8);
  v.setUint32(b.length - 4, crc32(b.slice(4, -4)));
  return b;
}
const d = emptyDoc('2026-11-11T00:00:00.000Z');
const payload = drawingPayload(d);
const encode = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return null;
  }
};
const clip = { drawing: null, text: null, textTooLong: false, image: false };
test('drawing precedence and validated cascade', () => {
  expect(pasteAction({ ...clip, drawing: payload }, payload, true)).toEqual({ kind: 'in-app' });
  for (const [last, ready] of [
    [payload, false],
    [null, true],
  ] as const)
    expect(pasteAction({ ...clip, drawing: payload }, last, ready)).toEqual({
      kind: 'fragment',
      sub: extract(d, everything(d)),
    });
  for (const [drawing, notice] of [
    ['{', 'damaged'],
    [payload.replace('"schemaVersion":1', '"schemaVersion":999'), 'newer'],
  ] as const)
    expect(
      pasteAction(
        { ...clip, drawing, text: 'ethanol', image: true, textTooLong: true },
        drawing,
        true,
      ),
    ).toEqual({ kind: 'notice', notice });
  expect(pasteAction({ ...clip, textTooLong: true, text: 'x' }, null, false)).toEqual({
    kind: 'notice',
    notice: 'text-too-long',
  });
  expect(pasteAction({ ...clip, text: 'ethanol', image: true }, null, false)).toEqual({
    kind: 'text',
    text: 'ethanol',
  });
  expect(pasteAction({ ...clip, image: true }, null, false)).toEqual({
    kind: 'notice',
    notice: 'picture-only',
  });
  expect(pasteAction(clip, null, false)).toEqual({ kind: 'notice', notice: 'empty' });
});
test('all file classifications, fatal UTF8, BOM and errors', () => {
  for (const k of ['chalk', 'png', 'svg', 'pdf'] as const) {
    expect(fileKindOf('A.' + k.toUpperCase())).toBe(k);
    expect(extractDrawing(k, new Uint8Array(MAX_FILE_BYTES + 1), decode)).toEqual({
      ok: false,
      problem: 'too-large',
    });
  }
  expect(fileKindOf('x.docx')).toBeNull();
  expect(extractDrawing('chalk', encode('\ufeff' + payload), decode)).toEqual({
    ok: true,
    text: payload,
  });
  expect(extractDrawing('chalk', new Uint8Array([255]), decode)).toEqual({
    ok: false,
    problem: 'damaged',
  });
  expect(extractDrawing('svg', new Uint8Array([255]), decode)).toEqual({
    ok: false,
    problem: 'damaged',
  });
  expect(extractDrawing('png', encode('x'), decode)).toEqual({ ok: false, problem: 'damaged' });
  expect(extractDrawing('pdf', encode('x'), decode)).toEqual({ ok: false, problem: 'damaged' });
  expect(extractDrawing('pdf', encode('%PDF-1.7'), decode)).toEqual({
    ok: false,
    problem: 'no-drawing',
  });
  expect(extractDrawing('png', png, decode)).toEqual({ ok: false, problem: 'no-drawing' });
  expect(extractDrawing('svg', encode('<svg/>'), decode)).toEqual({
    ok: false,
    problem: 'no-drawing',
  });
  expect(extractDrawing('svg', encode(exportSvg(d, null).svg), decode)).toEqual({
    ok: true,
    text: payload,
  });
  expect(extractDrawing('png', withPictureChunks(png, { dpi: 300, payload }), decode)).toEqual({
    ok: true,
    text: payload,
  });
  expect(extractDrawing('chalk', encode('{'), decode)).toEqual({ ok: true, text: '{' });
});
test('names have exact extensions and safe capped stems', () => {
  expect(exportFileName(null, 'png')).toBe('Untitled.png');
  for (const name of ['', '...', ' . ']) expect(exportFileName(name, 'png')).toBe('Untitled.png');
  expect(exportFileName('<>:"/\\|?*\u0000\u001f', 'svg')).toBe('-----------.svg');
  expect(exportFileName('x'.repeat(200), 'pdf')).toBe('x'.repeat(120) + '.pdf');
  expect(exportFileName('ethanol.chalk', 'png')).toBe('ethanol.png');
  expect(exportFileName('a.PNG', 'png')).toBe('a.png');
  expect(exportFileName('a.docx', 'svg')).toBe('a.docx.svg');
});
test('every file kind handles random bytes and throwing decoders', () => {
  fc.assert(
    fc.property(fc.uint8Array(), (b) => {
      for (const k of ['chalk', 'png', 'svg', 'pdf'] as const) {
        expect(() => extractDrawing(k, b, decode)).not.toThrow();
        expect(() =>
          extractDrawing(k, b, () => {
            throw new Error('decode');
          }),
        ).not.toThrow();
      }
    }),
  );
});
