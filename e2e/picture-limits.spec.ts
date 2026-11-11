// Decision C9 at the production limits (SPEC-clipboard-export.md E1, R1). No window: these are the
// real-size cases the unit tests prove with scaled limits (limits.test.ts, rasterise.test.ts),
// too slow for a unit-test budget (svg-render escapes ~10 M quotes; CRC-32 over 64 MiB).
import { expect, test } from '@playwright/test';
import {
  crc32,
  drawingPayload,
  exportSvg,
  MAX_PICTURE_BYTES,
  readPngDrawing,
  readSvgDrawing,
  withPictureChunks,
} from '../src/core/clipboard-export';
import { emptyDoc, MAX_FILE_BYTES, parse } from '../src/core/doc-model';
import { withPictureChunksCapped } from '../src/renderer/clipboard-export/rasterise';

const MiB = 1024 * 1024;

test('SVG: a quote-heavy valid payload near 20 MiB embeds no metadata past 64 MiB', () => {
  expect(MAX_FILE_BYTES).toBe(20 * MiB);
  expect(MAX_PICTURE_BYTES).toBe(64 * MiB);
  const base = drawingPayload(emptyDoc('')).length;
  // emptyDoc puts the string in meta.created and meta.modified: each `"` is `\"` in the payload.
  const d = emptyDoc('"'.repeat(Math.floor((MAX_FILE_BYTES - base) / 4)));
  const payload = drawingPayload(d);
  expect(payload.length).toBeLessThanOrEqual(MAX_FILE_BYTES);
  expect(payload.length).toBeGreaterThan(MAX_FILE_BYTES - 8);
  expect(parse(payload).ok).toBe(true);
  const svg = exportSvg(d, null);
  const plain = exportSvg(d, null, { embed: false });
  expect(svg).toEqual(plain);
  expect(readSvgDrawing(svg.svg)).toBeNull();
  // `\"` escapes to `\&quot;`: the metadata alone would be about 70 MiB.
  const quotes = payload.split('"').length - 1;
  const metadata = '<metadata id="chalkbond"></metadata>\n'.length + payload.length + 5 * quotes;
  expect(Buffer.byteLength(plain.svg) + metadata).toBeGreaterThan(MAX_PICTURE_BYTES);
});

test('PNG: a payload that pushes the PNG past 64 MiB is dropped; pHYs and the picture stay', () => {
  // A canvas PNG of 50 MiB (one big private ancillary chunk stands in for IDAT) and a 15 MiB payload.
  const filler = 50 * MiB;
  const big = Buffer.alloc(filler + 12);
  big.writeUInt32BE(filler, 0);
  big.write('flLr', 4, 'latin1');
  big.writeUInt32BE(crc32(big.subarray(4, -4)), filler + 8);
  const ihdr = Buffer.from('0000000d49484452000000010000000108060000001f15c489', 'hex');
  const iend = Buffer.from('0000000049454e44ae426082', 'hex');
  const raw = new Uint8Array(
    Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ihdr, big, iend]),
  );
  const payload = drawingPayload(emptyDoc('x'.repeat(Math.floor((15 * MiB) / 2))));
  expect(payload.length).toBeLessThanOrEqual(MAX_FILE_BYTES);
  const png = withPictureChunksCapped(raw, { dpi: 300, payload });
  expect(png.length).toBeLessThanOrEqual(MAX_PICTURE_BYTES);
  expect(raw.length + payload.length).toBeGreaterThan(MAX_PICTURE_BYTES);
  expect(Buffer.from(png.subarray(37, 41)).toString('latin1')).toBe('pHYs');
  expect(new DataView(png.buffer, png.byteOffset).getUint32(41)).toBe(11811);
  expect(png.length).toBe(raw.length + 21); // pHYs only: 9 bytes of data + 12
  expect(readPngDrawing(png)).toBeNull();
  // A payload that fits is embedded as usual.
  const small = drawingPayload(emptyDoc('2026-11-11T00:00:00.000Z'));
  const kept = withPictureChunksCapped(raw, { dpi: 300, payload: small });
  const expected = withPictureChunks(raw, { dpi: 300, payload: small });
  expect(Buffer.compare(kept, expected)).toBe(0); // byte compare: toEqual on 50 MiB runs out of heap
  expect(readPngDrawing(kept)).toBe(small);
});
