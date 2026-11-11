// The PNG carrier rule of R1 (SPEC-clipboard-export.md Decision C9): chunks are added as usual;
// when the chalkbond payload alone pushes the PNG over MAX_PICTURE_BYTES, the PNG is rebuilt from
// the raw one without the payload, keeping pHYs. The 64 MiB case is proven with an injected cap
// (a real 64 MiB PNG costs ~10 s of CRC); the default cap is the production constant.
import { describe, expect, it } from 'vitest';
import {
  MAX_PICTURE_BYTES,
  crc32,
  drawingPayload,
  readPngDrawing,
  withPictureChunks,
} from '@core/clipboard-export';
import { emptyDoc } from '@core/doc-model';
import { withPictureChunksCapped } from './rasterise';

const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));
function chunk(type: string, data: Uint8Array): Uint8Array {
  const b = new Uint8Array(data.length + 12);
  new DataView(b.buffer).setUint32(0, data.length);
  b.set(ascii(type), 4);
  b.set(data, 8);
  new DataView(b.buffer).setUint32(b.length - 4, crc32(b.subarray(4, -4)));
  return b;
}
/** The canvas's PNG: signature, IHDR, one IDAT (never decoded here), IEND. */
function rawPng(): Uint8Array {
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, 2);
  new DataView(ihdr.buffer).setUint32(4, 2);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', Uint8Array.from([1, 2, 3, 4, 5])),
    chunk('IEND', new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
/** Whether a chunk of `type` follows a length field in `png` (a plain byte search). */
const has = (png: Uint8Array, type: string): boolean =>
  new TextDecoder('latin1').decode(png).includes(type);

describe('withPictureChunksCapped (R1, C9)', () => {
  const raw = rawPng();
  const payload = drawingPayload(emptyDoc('2026-11-11T00:00:00.000Z'));
  const full = withPictureChunks(raw, { dpi: 300, payload });
  const plain = withPictureChunks(raw, { dpi: 300, payload: null });

  it('defaults to the production cap: 64 MiB', () => {
    expect(MAX_PICTURE_BYTES).toBe(64 * 1024 * 1024);
    expect(withPictureChunksCapped(raw, { dpi: 300, payload })).toEqual(full);
  });

  it('keeps the payload at the cap exactly', () => {
    expect(withPictureChunksCapped(raw, { dpi: 300, payload }, full.length)).toEqual(full);
    expect(readPngDrawing(full)).toBe(payload);
  });

  it('one byte over: drops only the payload, keeps the picture and pHYs', () => {
    const cut = withPictureChunksCapped(raw, { dpi: 300, payload }, full.length - 1);
    expect(cut).toEqual(plain);
    expect(readPngDrawing(cut)).toBeNull();
    expect(has(cut, 'pHYs') && has(cut, 'IDAT')).toBe(true);
    expect(new DataView(cut.buffer, cut.byteOffset).getUint32(41)).toBe(11811); // 300 dpi
    // Over the cap even without the payload: returned as it is (the write refuses it).
    expect(withPictureChunksCapped(raw, { dpi: 300, payload }, 1)).toEqual(plain);
    expect(withPictureChunksCapped(raw, { dpi: 300, payload: null }, 1)).toEqual(plain);
  });
});
