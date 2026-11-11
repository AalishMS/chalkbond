import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import fc from 'fast-check';
import { withPdfDrawing, readPdfDrawing } from '../../src/core/clipboard-export';
import { oracleReadPdfDrawing, oracleWithPdfDrawing } from './pdf-embed-oracle';
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

// Decision C10: the bounded parser keeps every result of the C12 parser (the oracle, which decoded
// the whole file to one string). Generated files are near-valid classic-xref PDFs with variant
// whitespace (including the Latin-1 NBSP that JavaScript's \s matches, and the bytes it does not),
// optional and duplicate trailer keys, wrong offsets, xref-stream objects, then an optional byte
// mutation; each is compared before and after the oracle's own update.
/** Mostly `good`, sometimes one of `bad`: enough valid files to reach the update and the reader. */
function mostly<T>(good: fc.Arbitrary<T>, bad: fc.Arbitrary<T>): fc.Arbitrary<T> {
  return fc.oneof({ arbitrary: good, weight: 9 }, { arbitrary: bad, weight: 1 });
}
const SEP = mostly(
  fc.constantFrom(' ', '\n', '\r\n', '\r', '\t', '\f', '\v', '\xa0'),
  fc.constantFrom('', '\x85', '\0'),
);
const EOL = mostly(fc.constantFrom('\n', '\r\n'), fc.constantFrom('\r', ' \n'));
const TOKENS = [
  'xref',
  'trailer',
  'startxref',
  '%%EOF',
  '<<',
  '>>',
  ' obj',
  'endobj',
  'stream\n',
  '\nendstream',
  '/Type /XRef',
  '/Encrypt 1 0 R',
  '/Root 1 0 R',
  '/Size 9',
  '/ChalkbondDrawing 3 0 R',
  '0000000009 00000 n ',
  '0 1',
  '\xa0',
  '\r',
  '7',
];
const generatedPdf = fc
  .record({
    head: mostly(fc.constantFrom('%PDF-1.7\n', '%PDF-1.4\n%\xe2\xe3\n'), fc.constant('%PDF1.7\n')),
    payload: fc.string({
      unit: fc.integer({ min: 32, max: 126 }).map((c) => String.fromCharCode(c)),
      maxLength: 12,
    }),
    lengthDelta: mostly(fc.constant(0), fc.constantFrom(-1, 1)),
    xrefStream: mostly(fc.constant(false), fc.constant(true)),
    sepAfterXref: SEP,
    eol: EOL,
    splitAt: fc.integer({ min: 0, max: 4 }),
    firstShift: mostly(fc.constant(0), fc.constantFrom(1, -1)),
    badOffset: mostly(fc.constant(false), fc.constant(true)),
    keys: fc.subarray([
      '/Info 2 0 R',
      '/ID [<0a1B><ff00>]',
      '/ID[ <01> <02> ]',
      '/ChalkbondDrawing 3 0 R',
      '/ChalkbondDrawing 2 0 R',
      '/Nested << /A 1 >>',
      '/Size 99999999999999999999',
    ]),
    trailerSep: SEP,
    endSep: SEP,
    encrypt: mostly(
      fc.constant<readonly string[]>([]),
      fc.constant<readonly string[]>(['/Encrypt 2 0 R']),
    ),
    required: mostly(
      fc.constant<readonly string[]>(['/Size 4', '/Root 1 0 R']),
      fc.subarray(['/Size 4', '/Root 1 0 R']),
    ),
    xShift: mostly(fc.constant(0), fc.constantFrom(1, -1, 1e6)),
    trailing: fc.constantFrom('', '\n', '\r\n', '  \n', '\xa0'),
    mutation: fc.oneof(
      { arbitrary: fc.constant(null), weight: 2 },
      {
        arbitrary: fc.record({
          at: fc.nat(),
          kind: fc.constantFrom('delete', 'insert', 'replace'),
          token: fc.constantFrom(...TOKENS),
        }),
        weight: 1,
      },
    ),
    embedFirst: fc.boolean(),
  })
  .map((g) => {
    const objects = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
      '2 0 obj\n<< /Producer (x) >>\nendobj\n',
      `3 0 obj\n<< /Type /EmbeddedFile /Subtype /application#2Fx-chalkbond /Length ${g.payload.length + g.lengthDelta} >>\nstream\n${g.payload}\nendstream\nendobj\n`,
    ];
    const offsets: number[] = [];
    let body = g.head;
    for (const o of objects) {
      offsets.push(body.length);
      body += o;
    }
    const x = body.length;
    let section: string;
    if (g.xrefStream) {
      section = '4 0 obj\n<< /Type /XRef /Size 5 /W [1 4 2] >>\nstream\n\nendstream\nendobj\n';
    } else {
      const entries = [
        '0000000000 65535 f',
        ...offsets.map(
          (o) => String(g.badOffset && o === offsets[2] ? x : o).padStart(10, '0') + ' 00000 n',
        ),
      ].map((e) => e + ' ');
      const first = entries.slice(0, g.splitAt);
      const rest = entries.slice(g.splitAt);
      const sub = (start: number, list: string[]) =>
        list.length === 0
          ? ''
          : `${start + g.firstShift} ${list.length}${g.eol}${list.join(g.eol)}${g.eol}`;
      section =
        'xref' +
        g.sepAfterXref +
        sub(0, first) +
        sub(first.length, rest) +
        'trailer' +
        g.trailerSep +
        '<< ' +
        [...g.required, ...g.keys, ...g.encrypt].join(' ') +
        ' >>' +
        g.endSep;
    }
    let text = `${body}${section}startxref\n${x + g.xShift}\n%%EOF${g.trailing}`;
    if (g.mutation) {
      const at = g.mutation.at % (text.length + 1);
      const { kind, token } = g.mutation;
      text =
        kind === 'delete'
          ? text.slice(0, at) + text.slice(at + 1)
          : kind === 'insert'
            ? text.slice(0, at) + token + text.slice(at)
            : text.slice(0, at) + token + text.slice(at + token.length);
    }
    const bytes = new Uint8Array(Buffer.from(text, 'latin1'));
    if (!g.embedFirst) return bytes;
    const embedded = oracleWithPdfDrawing(bytes, '{"a":1}');
    return embedded.ok ? embedded.pdf : bytes;
  });

test('the bounded parser agrees with the C12 parser on generated and mutated PDFs', () => {
  fc.assert(
    fc.property(generatedPdf, fc.boolean(), (pdf, asciiPayload) => {
      const payload = asciiPayload ? '{"b":[1,2]}' : 'caf\xe9';
      expect(withPdfDrawing(pdf, payload)).toEqual(oracleWithPdfDrawing(pdf, payload));
      expect(readPdfDrawing(pdf)).toBe(oracleReadPdfDrawing(pdf));
    }),
    { numRuns: 2000 },
  );
});

test('the bounded parser agrees with the C12 parser on the fixture, its update and their truncations', () => {
  const updated = oracleWithPdfDrawing(pdf, '{"drawing":true}');
  if (!updated.ok) throw new Error(updated.reason);
  for (const file of [pdf, updated.pdf]) {
    for (let i = Math.max(0, file.length - 1400); i <= file.length; i++) {
      const cut = file.subarray(0, i);
      expect(readPdfDrawing(cut)).toBe(oracleReadPdfDrawing(cut));
      expect(withPdfDrawing(cut, 'x')).toEqual(oracleWithPdfDrawing(cut, 'x'));
    }
  }
});
