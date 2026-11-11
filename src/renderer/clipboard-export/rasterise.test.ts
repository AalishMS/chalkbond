// The PNG carrier rule of R1 (SPEC-clipboard-export.md Decision C9): chunks are added as usual;
// when the chalkbond payload alone pushes the PNG over MAX_PICTURE_BYTES, the PNG is rebuilt from
// the raw one without the payload, keeping pHYs. The 64 MiB case is proven with an injected cap
// (a real 64 MiB PNG costs ~10 s of CRC); the default cap is the production constant.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_PICTURE_BYTES,
  crc32,
  drawingPayload,
  readPngDrawing,
  withPictureChunks,
} from '@core/clipboard-export';
import { emptyDoc } from '@core/doc-model';
import { exportSvg, pngPixelSize } from '@core/clipboard-export';
import { addAtom } from '@core/doc-model';
import { pngFromDataUrl, rasterise, withPictureChunksCapped } from './rasterise';

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

// Decision C11: the canvas's PNG comes from `toDataURL('image/png')`, decoded here; `toBlob` is
// never called. The decoder takes only a PNG data URL, works out the decoded size before any
// `atob` and refuses one over MAX_PICTURE_BYTES; every failure rejects rasterise (the callers'
// existing N-C6 notice / write-failed box), and the object URL is revoked on every path.
const PREFIX = 'data:image/png;base64,';
function dataUrl(png: Uint8Array): string {
  let binary = '';
  for (const byte of png) binary += String.fromCharCode(byte);
  return PREFIX + btoa(binary);
}

describe('pngFromDataUrl (C11)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('decodes a PNG data URL to the exact bytes (every padding length)', () => {
    const raw = rawPng();
    expect(pngFromDataUrl(dataUrl(raw))).toEqual(raw);
    for (const extra of [0, 1, 2]) {
      const bytes = Uint8Array.from({ length: 70000 + extra }, (_, i) => (i * 7919) & 255);
      expect(pngFromDataUrl(dataUrl(bytes))).toEqual(bytes);
    }
  });

  it('refuses anything but a PNG base64 data URL', () => {
    for (const url of [
      'data:,', // Chromium's answer when it cannot encode (an empty or too large canvas)
      '',
      'data:image/jpeg;base64,/9j/',
      'data:image/png,iVBORw0KGgo=',
      PREFIX,
      PREFIX + 'iVBORw0', // not a multiple of 4
      PREFIX + 'iVBO*w0K', // not base64
      PREFIX + 'iV==w0KG', // padding inside
    ]) {
      expect(() => pngFromDataUrl(url), url).toThrow();
    }
  });

  it('refuses a PNG over MAX_PICTURE_BYTES from its length alone, before any atob', () => {
    const atob = vi.spyOn(globalThis, 'atob');
    const over = Math.ceil((MAX_PICTURE_BYTES + 1) / 3) * 4; // decodes to > 64 MiB
    expect(() => pngFromDataUrl(PREFIX + 'A'.repeat(over))).toThrow(/limit/);
    expect(atob).not.toHaveBeenCalled();
    // The cap is inclusive: exactly `cap` decoded bytes pass.
    const bytes = Uint8Array.from({ length: 3000 }, (_, i) => i & 255);
    expect(pngFromDataUrl(dataUrl(bytes), 3000)).toEqual(bytes);
    expect(() => pngFromDataUrl(dataUrl(bytes), 2999)).toThrow(/limit/);
  });

  it('decodes in bounded chunks: no atob call sees more than 64 KiB of base64', () => {
    const atob = vi.spyOn(globalThis, 'atob');
    const bytes = Uint8Array.from({ length: 300000 }, (_, i) => (i * 31) & 255);
    expect(pngFromDataUrl(dataUrl(bytes))).toEqual(bytes);
    expect(atob.mock.calls.length).toBeGreaterThan(1);
    for (const [chunk] of atob.mock.calls) expect(chunk.length).toBeLessThanOrEqual(65536);
  });
});

/** A fake canvas, image and object URL: the page parts rasterise uses, recorded. */
function fakePage(opts: { dataUrl?: string; decode?: 'fail'; noContext?: boolean } = {}) {
  const calls: string[] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: (kind: string) =>
      opts.noContext
        ? null
        : {
            kind,
            fillStyle: '',
            fillRect: (...a: number[]) => calls.push(`fillRect ${a.join(' ')}`),
            drawImage: () => calls.push('drawImage'),
          },
    toDataURL: (type?: string) => {
      calls.push(`toDataURL ${type ?? ''}`);
      return opts.dataUrl ?? dataUrl(rawPng());
    },
    toBlob: () => {
      calls.push('toBlob');
      throw new Error('toBlob must not be used (C11)');
    },
  };
  class FakeImage {
    src = '';
    decode(): Promise<void> {
      calls.push(`decode ${this.src}`);
      return opts.decode === 'fail' ? Promise.reject(new Error('bad svg')) : Promise.resolve();
    }
  }
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('document', { createElement: (tag: string) => (tag === 'canvas' ? canvas : null) });
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    calls.push('create');
    return 'blob:chalkbond-test';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
    calls.push(`revoke ${url}`);
  });
  return { calls, canvas };
}

describe('rasterise (R1, C11)', () => {
  const [doc] = addAtom(emptyDoc('2026-11-11T00:00:00.000Z'), { element: 'C', x: 0, y: 0 });
  const svg = exportSvg(doc, null);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('encodes with toDataURL("image/png"), never toBlob; size, white, chunks and cleanup as R1', async () => {
    const { calls, canvas } = fakePage();
    const size = pngPixelSize(svg.width, svg.height, 300);
    const out = await rasterise(svg, 300, true);
    expect(canvas.width).toBe(size.width);
    expect(canvas.height).toBe(size.height);
    expect(calls).toEqual([
      'create',
      'decode blob:chalkbond-test',
      `fillRect 0 0 ${size.width} ${size.height}`,
      'drawImage',
      'toDataURL image/png',
      'revoke blob:chalkbond-test',
    ]);
    expect(out).toEqual({
      png: withPictureChunks(rawPng(), { dpi: size.dpi, payload: drawingPayload(doc) }),
      dpi: size.dpi,
      reduced: false,
    });
    expect(readPngDrawing(out.png)).toBe(drawingPayload(doc));
  });

  it('transparent: no fill', async () => {
    const { calls } = fakePage();
    await rasterise(svg, 300, false);
    expect(calls.some((c) => c.startsWith('fillRect'))).toBe(false);
  });

  it('an encoding failure rejects (the caller shows its notice or box) and still revokes the URL', async () => {
    for (const url of ['data:,', PREFIX + 'iVBO*w0K', dataUrl(Uint8Array.from([1, 2, 3, 4]))]) {
      const { calls } = fakePage({ dataUrl: url });
      await expect(rasterise(svg, 300, false)).rejects.toThrow();
      expect(calls.at(-1)).toBe('revoke blob:chalkbond-test');
      expect(calls).not.toContain('toBlob');
    }
  });

  it('a decode failure or a missing 2D context rejects and still revokes the URL', async () => {
    for (const opts of [{ decode: 'fail' as const }, { noContext: true }]) {
      const { calls } = fakePage(opts);
      await expect(rasterise(svg, 300, false)).rejects.toThrow();
      expect(calls.at(-1)).toBe('revoke blob:chalkbond-test');
    }
  });
});
