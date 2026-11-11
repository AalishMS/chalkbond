import { expect, test } from 'vitest';
import fc from 'fast-check';
import {
  emptyDoc,
  parse,
  createHistory,
  current,
  everything,
  extract,
  addObject,
  setStyle,
  MAX_FILE_BYTES,
} from '../doc-model';
import { command, run } from '../doc-model/__fixtures__/arbitraries';
import { renderSvg } from '../svg-render';
import {
  drawingPayload,
  pictureDoc,
  pictureSelection,
  exportSvg,
  readSvgDrawing,
  crc32,
  withPictureChunks,
  readPngDrawing,
  PngError,
} from './index';
const now = '2026-11-11T00:00:00.000Z';
const minimal = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
function chunk(type: string, data: number[]) {
  const b = new Uint8Array(data.length + 12);
  new DataView(b.buffer).setUint32(0, data.length);
  b.set(
    Array.from(type, (c) => c.charCodeAt(0)),
    4,
  );
  b.set(data, 8);
  new DataView(b.buffer).setUint32(b.length - 4, crc32(b.slice(4, -4)));
  return b;
}
const png = Uint8Array.from([
  ...minimal,
  ...chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
  ...chunk('IDAT', []),
  ...chunk('IEND', []),
]);
export { png };
test('payload preserves Unicode, style, meta and selection attachment', () => {
  let d = setStyle(emptyDoc(now), { preset: 'journal', overrides: {} });
  const [a, id] = addObject(d, {
    type: 'arrow',
    kind: 'forward',
    from: { x: 0, y: 0 },
    to: { x: 3, y: 0 },
  });
  d = a;
  [d] = addObject(d, {
    type: 'text',
    at: { x: 1, y: 0 },
    align: 'center',
    runs: [{ text: 'नेपाल😀' }],
    attachedTo: { arrow: id, slot: 'above' },
  });
  const sel = { atoms: new Set<never>(), bonds: new Set<never>(), objects: new Set([id]) };
  expect(pictureSelection(d, sel).objects.size).toBe(2);
  expect(pictureDoc(d, null)).toBe(d);
  const taken = pictureDoc(d, sel);
  expect(taken.style).toEqual(d.style);
  expect(taken.meta).toEqual(d.meta);
  expect(extract(taken, everything(taken))).toEqual(extract(d, sel));
  const payload = drawingPayload(d);
  expect(payload).toMatch(/^[\x20-\x7e]*$/);
  expect(payload).toContain('\\ud83d\\ude00');
  expect(parse(payload)).toEqual({ ok: true, value: d });
  expect(exportSvg(d, sel).svg).toBe(
    renderSvg(d, { only: pictureSelection(d, sel), padding: 0, metadata: drawingPayload(taken) })
      .svg,
  );
  expect(exportSvg(d, null, { embed: false }).svg).not.toContain('<metadata');
});
test('over-limit metadata is omitted', () => {
  const d = emptyDoc('x'.repeat(MAX_FILE_BYTES));
  expect(exportSvg(d, null).svg).not.toContain('<metadata');
});
test('PNG CRC, replacement, ordering and strict validation', () => {
  expect(crc32(Uint8Array.from([73, 69, 78, 68]))).toBe(0xae426082);
  const first = withPictureChunks(png, { dpi: 300, payload: 'old' });
  const second = withPictureChunks(first, { dpi: 150, payload: 'new' });
  expect(readPngDrawing(second)).toBe('new');
  expect(Array.from(second.slice(37, 41))).toEqual([112, 72, 89, 115]);
  expect(new DataView(second.buffer).getUint32(41)).toBe(5906);
  expect(readPngDrawing(withPictureChunks(second, { dpi: 1, payload: null }))).toBeNull();
  const bad = png.slice();
  bad[20] = 255;
  expect(() => withPictureChunks(bad, { dpi: 300, payload: null })).toThrow(PngError);
  for (const b of [new Uint8Array(), png.slice(0, -1), Uint8Array.from([...png, 0]), minimal])
    expect(readPngDrawing(b)).toBeNull();
  expect(readPngDrawing(png)).toBeNull();
});
test.each([
  [
    '<metadata x="y" id=\'chalkbond\' z="q">&amp;&lt;&gt;&quot;&apos;&#65;&#x1f600;</metadata>',
    '&<>"\'A😀',
  ],
  ['<metadata id="other">x</metadata>', null],
  ['<metadata id="chalkbond">&bad;</metadata>', null],
  ['<metadata id="chalkbond">&oops</metadata>', null],
  ['<metadata id="chalkbond">&#0;</metadata>', null],
  ['<metadata id="chalkbond">&#xD800;</metadata>', null],
])('SVG scan %s', (s, result) => expect(readSvgDrawing(s)).toBe(result));
test('document arbitraries round trip through all payload carriers', () => {
  fc.assert(
    fc.property(fc.array(command, { maxLength: 20 }), (commands) => {
      let h = createHistory(emptyDoc(now));
      for (const c of commands) h = run(h, c);
      const d = current(h);
      const payload = drawingPayload(d);
      expect(parse(payload)).toEqual({ ok: true, value: d });
      expect(readSvgDrawing(exportSvg(d, null).svg)).toBe(payload);
      expect(readPngDrawing(withPictureChunks(png, { dpi: 300, payload }))).toBe(payload);
    }),
  );
});
test('random bytes and all truncations never throw', () => {
  fc.assert(
    fc.property(fc.uint8Array(), (b) => {
      expect(() => readPngDrawing(b)).not.toThrow();
      expect(() =>
        readSvgDrawing(Array.from(b, (c) => String.fromCharCode(c)).join('')),
      ).not.toThrow();
    }),
  );
  const b = withPictureChunks(png, { dpi: 300, payload: drawingPayload(emptyDoc(now)) });
  for (let i = 0; i < b.length; i++) expect(() => readPngDrawing(b.slice(0, i))).not.toThrow();
  const s = exportSvg(emptyDoc(now), null).svg;
  for (let i = 0; i < s.length; i++) expect(() => readSvgDrawing(s.slice(0, i))).not.toThrow();
});
test('id inside another attribute value does not identify metadata', () => {
  expect(readSvgDrawing(`<metadata title=" id='chalkbond' ">x</metadata>`)).toBeNull();
});
