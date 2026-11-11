// PDF-A at the production size (SPEC-clipboard-export.md PDF-A1–PDF-A3, Decision C10): real PDFs
// of nearly MAX_PICTURE_BYTES, with tens of MiB of opaque content-stream bytes before a classic
// cross-reference table, go through withPdfDrawing and readPdfDrawing under the default timeout.
// No cap is injected. Large byte arrays are compared with Buffer.equals (memcmp), never deep
// equality. The opaque stream holds decoy tokens (a trailer, an xref, a chalkbond object, /XRef):
// only the last startxref's section may be read, so none of them may change a result.
import { describe, expect, it } from 'vitest';
import { MAX_PICTURE_BYTES, readPdfDrawing, withPdfDrawing } from '../../src/core/clipboard-export';
import { MAX_FILE_BYTES } from '../../src/core/doc-model';

const MiB = 1024 * 1024;
const ID = '[<0123abcd4567ef01><89abcdef01234567>]';
const DECOYS = [
  'xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 /Root 9 0 R /ChalkbondDrawing 4 0 R /Encrypt 7 0 R >>\nstartxref\n0\n%%EOF\n',
  '6 0 obj\n<< /Type /EmbeddedFile /Subtype /application#2Fx-chalkbond /Length 5 >>\nstream\nDECOY\nendstream\nendobj\n',
  '7 0 obj << /Type /XRef /Size 8 /W [1 4 2] >> endobj trailer << >> startxref 12 %%EOF',
];

const latin1 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'latin1'));
const view = (b: Uint8Array): Buffer => Buffer.from(b.buffer, b.byteOffset, b.length);
const same = (a: Uint8Array, b: Uint8Array): boolean => view(a).equals(view(b));
const text = (b: Uint8Array, from: number, to = b.length): string =>
  view(b).toString('latin1', from, to);

/** `n` deterministic pseudo-random bytes (xorshift32), with the decoys written at fixed places. */
function opaque(n: number, seed = 0x9e3779b9, decoys = true): Uint8Array {
  const bytes = new Uint8Array(n);
  const words = new Uint32Array(bytes.buffer, 0, n >>> 2);
  let s = seed >>> 0;
  for (let i = 0; i < words.length; i++) {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    words[i] = s;
  }
  if (decoys)
    DECOYS.forEach((decoy, i) => {
      bytes.set(latin1(decoy), Math.floor(((i + 1) * n) / (DECOYS.length + 2)));
    });
  return bytes;
}

interface Built {
  pdf: Uint8Array;
  /** Offset of the `xref` keyword (the original startxref). */
  xref: number;
  /** Offset of each object by number. */
  offsets: number[];
}

/**
 * A one-page PDF as Chromium prints it: catalog, pages, page, an opaque content stream holding
 * `content`, an Info dictionary, then a classic xref table and trailer. `tail` replaces the text
 * from the xref keyword on (it gets the xref offset and the object offsets).
 */
function bigPdf(content: Uint8Array, tail?: (xref: number, offsets: number[]) => string): Built {
  const head = latin1('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 20 20] /Contents 4 0 R >>\nendobj\n',
  ].map(latin1);
  const streamHead = latin1(`4 0 obj\n<< /Length ${content.length} >>\nstream\n`);
  const streamTail = latin1('\nendstream\nendobj\n');
  const info = latin1('5 0 obj\n<< /Producer (Skia/PDF m140) >>\nendobj\n');
  const offsets = [0];
  let at = head.length;
  for (const o of objects) {
    offsets.push(at);
    at += o.length;
  }
  offsets.push(at);
  at += streamHead.length + content.length + streamTail.length;
  offsets.push(at);
  at += info.length;
  const xref = at;
  const table =
    tail?.(xref, offsets) ??
    'xref\n0 6\n0000000000 65535 f \n' +
      offsets
        .slice(1)
        .map((o) => String(o).padStart(10, '0') + ' 00000 n \n')
        .join('') +
      `trailer\n<< /Size 6 /Root 1 0 R /Info 5 0 R /ID ${ID} >>\nstartxref\n${xref}\n%%EOF\n`;
  const end = latin1(table);
  const pdf = new Uint8Array(xref + end.length);
  let w = 0;
  for (const part of [head, ...objects, streamHead, content, streamTail, info, end]) {
    pdf.set(part, w);
    w += part.length;
  }
  return { pdf, xref, offsets };
}

/** A printable-ASCII drawing-like payload of exactly `n` characters. */
function payloadOf(n: number): string {
  const body = '0123456789abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ-_.,:;!?';
  return ('{"d":"' + body.repeat(Math.ceil(n / body.length))).slice(0, n - 2) + '"}';
}

describe('PDF-A1/A3 on near-64 MiB PDFs (no injected cap)', () => {
  it('an update that lands exactly on MAX_PICTURE_BYTES: prefix, offsets, trailer, read back', () => {
    const payload = payloadOf(MiB);
    // Every offset has 8 digits from 16 MiB to 64 MiB, so the update's size is constant there.
    const probe = bigPdf(new Uint8Array(16 * MiB));
    const small = withPdfDrawing(probe.pdf, payload);
    if (!small.ok) throw new Error(small.reason);
    const overhead = small.pdf.length - 16 * MiB;
    const { pdf, xref, offsets } = bigPdf(opaque(MAX_PICTURE_BYTES - overhead));
    expect(pdf.length).toBeGreaterThan(62 * MiB);

    const result = withPdfDrawing(pdf, payload);
    if (!result.ok) throw new Error(result.reason);
    expect(result.pdf.length).toBe(MAX_PICTURE_BYTES);
    // The original bytes are untouched and come first.
    expect(same(result.pdf.subarray(0, pdf.length), pdf)).toBe(true);

    const appended = text(result.pdf, pdf.length);
    const update = new RegExp(
      '^6 0 obj\\n<< /Type /EmbeddedFile /Subtype /application#2Fx-chalkbond /Length 1048576 >>\\n' +
        'stream\\n[^]{1048576}\\nendstream\\nendobj\\n' +
        'xref\\n6 1\\n(\\d{10}) 00000 n \\ntrailer\\n<< /Size 7 /Root 1 0 R /Info 5 0 R /ID ' +
        ID.replace(/[[\]]/g, '\\$&') +
        ' /Prev ' +
        xref +
        ' /ChalkbondDrawing 6 0 R >>\\nstartxref\\n(\\d+)\\n%%EOF\\n$',
    ).exec(appended);
    expect(update).not.toBeNull();
    expect(Number(update?.[1])).toBe(pdf.length);
    const newXref = Number(update?.[2]);
    expect(text(result.pdf, newXref, newXref + 9)).toBe('xref\n6 1\n');
    // The original table still points at the original objects.
    for (let n = 1; n <= 5; n++)
      expect(text(result.pdf, offsets[n] ?? -1, (offsets[n] ?? -1) + 8)).toBe(`${n} 0 obj\n`);

    expect(readPdfDrawing(result.pdf) === payload).toBe(true);
    expect(readPdfDrawing(pdf)).toBeNull();
  });

  it('a MAX_FILE_BYTES payload in a 64 MiB PDF round trips', () => {
    const payload = payloadOf(MAX_FILE_BYTES);
    const { pdf } = bigPdf(opaque(43 * MiB, 7));
    const result = withPdfDrawing(pdf, payload);
    if (!result.ok) throw new Error(result.reason);
    expect(result.pdf.length).toBeGreaterThan(63 * MiB);
    expect(result.pdf.length).toBeLessThanOrEqual(MAX_PICTURE_BYTES);
    expect(same(result.pdf.subarray(0, pdf.length), pdf)).toBe(true);
    expect(readPdfDrawing(result.pdf) === payload).toBe(true);
  });

  it('refuses near-64 MiB xref-stream, encrypted and unrecognised files as before', () => {
    const content = opaque(62 * MiB, 3);
    const refusal = (built: Built) => {
      const r = withPdfDrawing(built.pdf, 'x');
      expect(readPdfDrawing(built.pdf)).toBeNull();
      return r.ok ? 'ok' : r.reason;
    };
    const table = (x: number, offsets: number[], trailer: string, startxref: number = x) =>
      'xref\n0 6\n0000000000 65535 f \n' +
      offsets
        .slice(1)
        .map((o) => String(o).padStart(10, '0') + ' 00000 n \n')
        .join('') +
      `trailer\n<< ${trailer} >>\nstartxref\n${startxref}\n%%EOF\n`;

    expect(
      refusal(
        bigPdf(
          content,
          (x) =>
            `6 0 obj\n<< /Type /XRef /Size 7 /W [1 4 2] /Root 1 0 R /Length 0 >>\nstream\n\nendstream\nendobj\nstartxref\n${x}\n%%EOF\n`,
        ),
      ),
    ).toBe('xref-stream');
    expect(
      refusal(bigPdf(content, (x, o) => table(x, o, '/Size 6 /Root 1 0 R /Encrypt 5 0 R'))),
    ).toBe('encrypted');
    expect(refusal(bigPdf(content, (x, o) => table(x, o, '/Size 6')))).toBe('unrecognised');
    // An entry at or past the table, a startxref past the end, no %%EOF.
    expect(
      refusal(bigPdf(content, (x) => table(x, [0, 9, 9, 9, 9, x], '/Size 6 /Root 1 0 R'))),
    ).toBe('unrecognised');
    expect(
      refusal(
        bigPdf(content, (x, o) => table(x, o, '/Size 6 /Root 1 0 R').replace('%%EOF', '%%EO')),
      ),
    ).toBe('unrecognised');
    expect(refusal(bigPdf(content, (x, o) => table(x, o, '/Size 6 /Root 1 0 R', 70 * MiB)))).toBe(
      'unrecognised',
    );
  });

  it('scans, never decodes, 62 MiB of opaque bytes after a startxref at an object', () => {
    // No decoys here: the scan for /Type /XRef runs over the opaque bytes.
    const content = opaque(62 * MiB, 3, false);
    const refusal = (built: Built) => {
      const r = withPdfDrawing(built.pdf, 'x');
      expect(readPdfDrawing(built.pdf)).toBeNull();
      return r.ok ? 'ok' : r.reason;
    };
    const table = (x: number, offsets: number[], startxref: number) =>
      'xref\n0 6\n0000000000 65535 f \n' +
      offsets
        .slice(1)
        .map((o) => String(o).padStart(10, '0') + ' 00000 n \n')
        .join('') +
      `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
    // startxref at the content stream: the whole 62 MiB after it is scanned for /XRef, not decoded.
    expect(refusal(bigPdf(content, (x, o) => table(x, o, o[4] ?? -1)))).toBe('unrecognised');
    // ... and at the catalog, with /Type /XRef written after the opaque stream: as the old
    // pattern did, a /Type /XRef anywhere after the object's << names an xref stream.
    expect(
      refusal(bigPdf(content, (x, o) => '% /Type /XRef\n' + table(x + 14, o, o[1] ?? -1))),
    ).toBe('xref-stream');
  });

  it('random bytes and truncations of a near-64 MiB file never throw', () => {
    const noise = opaque(MAX_PICTURE_BYTES, 11);
    expect(withPdfDrawing(noise, 'x')).toEqual({ ok: false, reason: 'unrecognised' });
    expect(readPdfDrawing(noise)).toBeNull();
    // %PDF- and a tail whose startxref points into the noise.
    noise.set(latin1('%PDF-1.7\n'), 0);
    noise.set(latin1('\nstartxref\n4096\n%%EOF\n'), noise.length - 22);
    expect(withPdfDrawing(noise, 'x')).toEqual({ ok: false, reason: 'unrecognised' });
    expect(readPdfDrawing(noise)).toBeNull();

    const { pdf, xref } = bigPdf(opaque(60 * MiB, 5));
    const payload = payloadOf(4096);
    const result = withPdfDrawing(pdf, payload);
    if (!result.ok) throw new Error(result.reason);
    const full = result.pdf;
    const at = (n: number) => full.subarray(0, n);
    // Still valid without the final EOL; every other cut loses the drawing and never throws.
    expect(readPdfDrawing(at(full.length - 1))).toBe(payload);
    for (const n of [
      full.length - 3,
      full.length - 7,
      full.length - 40,
      pdf.length + 3000,
      pdf.length + 10,
      pdf.length,
      xref + 30,
      xref,
      xref - 1,
      12,
      4,
      0,
    ]) {
      expect(() => readPdfDrawing(at(n))).not.toThrow();
      expect(() => withPdfDrawing(at(n), 'x')).not.toThrow();
      expect(readPdfDrawing(at(n))).toBeNull();
    }
    expect(withPdfDrawing(at(pdf.length), 'x').ok).toBe(true);
  });
});
