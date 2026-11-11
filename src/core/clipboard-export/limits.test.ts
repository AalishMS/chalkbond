// Picture-carrier limits (SPEC-clipboard-export.md Decision C9, E1, E4): the editable payload stays
// at MAX_FILE_BYTES (20 MiB); a picture carrier may be up to MAX_PICTURE_BYTES (64 MiB) UTF-8 bytes.
import { expect, test } from 'vitest';
import { addObject, emptyDoc, MAX_FILE_BYTES, parse } from '../doc-model';
import {
  crc32,
  drawingPayload,
  exportSvg,
  extractDrawing,
  MAX_PICTURE_BYTES,
  readSvgDrawing,
  withPictureChunks,
} from './index';
import { exportSvgWithin, utf8ByteLength } from './picture';

const now = '2026-11-11T00:00:00.000Z';
const MiB = 1024 * 1024;
const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));
/** A test-only UTF-8 encoder (core has no TextEncoder); a lone surrogate takes 3 bytes, as U+FFFD. */
function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}
const decode = (b: Uint8Array): string | null => {
  let s = '';
  for (let i = 0; i < b.length; i += 65536)
    s += String.fromCharCode(...Array.from(b.subarray(i, i + 65536)));
  return s;
};
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
function chunk(type: string, data: Uint8Array): Uint8Array {
  const b = new Uint8Array(data.length + 12);
  new DataView(b.buffer).setUint32(0, data.length);
  b.set(ascii(type), 4);
  b.set(data, 8);
  new DataView(b.buffer).setUint32(b.length - 4, crc32(b.subarray(4, -4)));
  return b;
}
function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
/** A PNG of IHDR, an ancillary private chunk of `filler` bytes, and IEND (never decoded). */
function pngWithFiller(filler: number): Uint8Array {
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, 1);
  new DataView(ihdr.buffer).setUint32(4, 1);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return concat([
    Uint8Array.from(PNG_SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('flLr', new Uint8Array(filler)),
    chunk('IEND', new Uint8Array()),
  ]);
}

/** A valid document whose payload is mostly `\"` (escaped as `\&quot;` in SVG metadata). */
function quoteHeavy(quotes: number) {
  // emptyDoc puts the string in meta.created and meta.modified.
  return emptyDoc('"'.repeat(quotes));
}

test('the limits: 20 MiB editable payload, 64 MiB picture carrier', () => {
  expect(MAX_FILE_BYTES).toBe(20 * MiB);
  expect(MAX_PICTURE_BYTES).toBe(64 * MiB);
});

test.each([
  ['', 0],
  ['a', 1],
  ['é', 2],
  ['€', 3],
  ['😀', 4],
  ['\ud83d', 3], // lone high surrogate: U+FFFD
  ['\ude00', 3], // lone low surrogate: U+FFFD
  ['\ud83dx', 4],
  ['\ud83d\ud83d', 6],
  ['\ude00\ud83d', 6],
  ['a😀é€߿ࠀ￿', 1 + 4 + 2 + 3 + 2 + 3 + 3],
])('utf8ByteLength(%j) = %i, as the UTF-8 encoder writes it', (s, bytes) => {
  expect(utf8ByteLength(s)).toBe(bytes);
  expect(utf8(s).length).toBe(bytes);
});

test('utf8ByteLength may stop counting once past the limit', () => {
  expect(utf8ByteLength('ééé', 3)).toBeGreaterThan(3);
  expect(utf8ByteLength('ééé', 6)).toBe(6);
  expect(utf8ByteLength('é'.repeat(10), 100)).toBe(20);
});

/**
 * Limits scaled down from 20 MiB : 64 MiB (same ratio, same code path) so a quote-heavy document
 * near the payload cap renders in a unit-test budget. The real-size case runs with the production
 * constants in e2e/picture-limits.spec.ts (svg-render's escaping alone takes ~3 s there).
 */
const SCALED = { payload: 1 * MiB, picture: 3.2 * MiB };

test('quote-heavy valid payload near the payload cap: metadata past the carrier cap is omitted', () => {
  const base = drawingPayload(emptyDoc('')).length;
  const d = quoteHeavy(Math.floor((SCALED.payload - base) / 4));
  const payload = drawingPayload(d);
  expect(payload.length).toBeLessThanOrEqual(SCALED.payload);
  expect(payload.length).toBeGreaterThan(SCALED.payload - 8);
  expect(parse(payload).ok).toBe(true);
  const svg = exportSvgWithin(d, null, undefined, SCALED);
  const plain = exportSvg(d, null, { embed: false });
  expect(svg).toEqual(plain);
  expect(svg.svg).not.toContain('<metadata');
  expect(readSvgDrawing(svg.svg)).toBeNull();
  // Each `"` is escaped as `&quot;`: the metadata alone would pass the carrier cap.
  const quotes = payload.split('"').length - 1;
  const metadata = '<metadata id="chalkbond"></metadata>\n'.length + payload.length + 5 * quotes;
  expect(utf8ByteLength(plain.svg) + metadata).toBeGreaterThan(SCALED.picture);
  // Without a carrier cap the same call embeds it.
  const unbounded = exportSvgWithin(d, null, undefined, { payload: SCALED.payload, picture: 1e9 });
  expect(readSvgDrawing(unbounded.svg)).toBe(payload);
  expect(utf8ByteLength(unbounded.svg)).toBe(utf8ByteLength(plain.svg) + metadata);
});

test('quote-heavy payload whose escaped metadata passes the payload cap but fits the carrier: kept', () => {
  const d = quoteHeavy(Math.floor((0.8 * MiB) / 4));
  const payload = drawingPayload(d);
  const svg = exportSvgWithin(d, null, undefined, SCALED).svg;
  expect(utf8ByteLength(svg)).toBeGreaterThan(SCALED.payload);
  expect(utf8ByteLength(svg)).toBeLessThanOrEqual(SCALED.picture);
  expect(readSvgDrawing(svg)).toBe(payload);
});

test('exportSvg is exportSvgWithin at the production limits', () => {
  let d = emptyDoc(now);
  [d] = addObject(d, {
    type: 'text',
    at: { x: 0, y: 0 },
    align: 'center',
    runs: [{ text: 'a"b' }],
  });
  expect(exportSvg(d, null)).toEqual(
    exportSvgWithin(d, null, undefined, { payload: MAX_FILE_BYTES, picture: MAX_PICTURE_BYTES }),
  );
  expect(readSvgDrawing(exportSvg(d, null).svg)).toBe(drawingPayload(d));
});

test('carrier boundary (injected limits): kept at the cap, at one byte over only metadata goes', () => {
  let d = emptyDoc(now);
  [d] = addObject(d, {
    type: 'text',
    at: { x: 0, y: 0 },
    align: 'center',
    runs: [{ text: 'नेपाल😀 "quoted" & <tag>' }],
  });
  const payload = drawingPayload(d);
  const limits = (picture: number) => ({ payload: MAX_FILE_BYTES, picture });
  const full = exportSvg(d, null);
  const plain = exportSvg(d, null, { embed: false });
  const bytes = utf8ByteLength(full.svg);
  expect(bytes).toBeGreaterThan(full.svg.length); // the text is not ASCII: bytes, not characters
  expect(exportSvgWithin(d, null, undefined, limits(bytes))).toEqual(full);
  expect(readSvgDrawing(full.svg)).toBe(payload);
  for (const cap of [bytes - 1, full.svg.length]) {
    const cut = exportSvgWithin(d, null, undefined, limits(cap));
    expect(cut).toEqual(plain);
    expect(readSvgDrawing(cut.svg)).toBeNull();
  }
  // The payload limit still applies first; embed: false never embeds.
  expect(
    exportSvgWithin(d, null, undefined, { payload: payload.length - 1, picture: bytes }),
  ).toEqual(plain);
  expect(exportSvgWithin(d, null, { embed: false }, limits(bytes))).toEqual(plain);
  // A picture over the cap even without metadata is returned as it is (C1 / C4 refuse it).
  expect(exportSvgWithin(d, null, undefined, limits(1))).toEqual(plain);
});

/** Stands in for the UTF-8 decoder: the bytes' length is what extractDrawing judges first. */
const decoded = (text: string) => () => text;

test('extractDrawing: .chalk over 20 MiB is too large; a picture only over 64 MiB', () => {
  expect(extractDrawing('chalk', new Uint8Array(MAX_FILE_BYTES + 1), decode)).toEqual({
    ok: false,
    problem: 'too-large',
  });
  // Judged as pictures: no PNG or PDF signature, no SVG metadata.
  const expected = { png: 'damaged', svg: 'no-drawing', pdf: 'damaged' } as const;
  for (const k of ['png', 'svg', 'pdf'] as const) {
    expect(extractDrawing(k, new Uint8Array(MAX_FILE_BYTES + 1), decoded(''))).toEqual({
      ok: false,
      problem: expected[k],
    });
    expect(extractDrawing(k, new Uint8Array(MAX_PICTURE_BYTES + 1), decoded(''))).toEqual({
      ok: false,
      problem: 'too-large',
    });
  }
});

test('a PNG carrier with a payload reads back; a PNG at the 64 MiB cap is judged, not refused', () => {
  const payload = drawingPayload(emptyDoc(now));
  const png = withPictureChunks(pngWithFiller(16), { dpi: 300, payload });
  expect(extractDrawing('png', png, decode)).toEqual({ ok: true, text: payload });
  const edge = new Uint8Array(MAX_PICTURE_BYTES);
  expect(extractDrawing('png', edge, decode)).toEqual({ ok: false, problem: 'damaged' });
});

test('an SVG carrier over 20 MiB with a small payload opens; an oversize payload reaches parse', () => {
  const payload = drawingPayload(emptyDoc(now));
  const svg = exportSvg(emptyDoc(now), null).svg.replace(
    '</svg>',
    `<!--${'x'.repeat(21 * MiB)}--></svg>`,
  );
  expect(svg.length).toBeGreaterThan(MAX_FILE_BYTES);
  expect(extractDrawing('svg', new Uint8Array(svg.length), decoded(svg))).toEqual({
    ok: true,
    text: payload,
  });
  // The text inside is always checked by parse's 20 MiB rule in the caller.
  const huge = '{' + ' '.repeat(MAX_FILE_BYTES) + '}';
  const carrier = `<svg><metadata id="chalkbond">${huge}</metadata></svg>`;
  const text = extractDrawing('svg', new Uint8Array(carrier.length), decoded(carrier));
  expect(text.ok && text.text.length).toBe(MAX_FILE_BYTES + 2);
  const parsed = parse(text.ok ? text.text : '');
  expect(!parsed.ok && parsed.error.code).toBe('too-large');
});
