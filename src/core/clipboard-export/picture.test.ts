import { expect, test } from 'vitest';
import { addObject, emptyDoc, setStyle, type Doc } from '../doc-model';
import { renderSvg } from '../svg-render';
import {
  CLIPBOARD_MARGIN,
  clipboardBitmapPadding,
  drawingPayload,
  exportSvg,
  groupDigits,
  pictureDoc,
  pngPixelSize,
} from './index';

const NOW = '2026-11-12T00:00:00.000Z';
/** A document with some ink: one forward arrow. */
const withArrow = (doc: Doc): Doc =>
  addObject(doc, { type: 'arrow', kind: 'forward', from: { x: 0, y: 0 }, to: { x: 3, y: 0 } })[0];

test('exportSvg padding (R10): equals renderSvg with that padding; the default stays tight', () => {
  const doc = withArrow(emptyDoc(NOW));
  const payload = drawingPayload(pictureDoc(doc, null));
  expect(exportSvg(doc, null, { padding: 10 }).svg).toBe(
    renderSvg(doc, { padding: 10, metadata: payload }).svg,
  );
  expect(exportSvg(doc, null, { embed: false, padding: 10 }).svg).toBe(
    renderSvg(doc, { padding: 10 }).svg,
  );
  expect(exportSvg(doc, null).svg).toBe(renderSvg(doc, { padding: 0, metadata: payload }).svg);
  const tight = exportSvg(doc, null);
  const padded = exportSvg(doc, null, { embed: false, padding: 10 });
  expect(padded.width).toBeCloseTo(tight.width + 20, 3);
  expect(padded.height).toBeCloseTo(tight.height + 20, 3);
  expect(padded.origin).toEqual({ x: tight.origin.x - 10, y: tight.origin.y - 10 });
});

test('exportSvg with embed: false does not serialise the drawing again (SC12): no <metadata>, same output', () => {
  const doc = withArrow(emptyDoc(NOW));
  const svg = exportSvg(doc, null, { embed: false, padding: 3.6 }).svg;
  expect(svg).not.toContain('<metadata');
  expect(svg).toBe(renderSvg(doc, { padding: 3.6 }).svg);
});

test('clipboardBitmapPadding is 0.25 x the bond length: Slides 10, Handout 3.6, an override', () => {
  expect(CLIPBOARD_MARGIN).toBe(0.25);
  const slides = emptyDoc(NOW);
  expect(slides.style.preset).toBe('slides');
  expect(clipboardBitmapPadding(slides)).toBe(10);
  expect(clipboardBitmapPadding(setStyle(slides, { preset: 'journal' }))).toBeCloseTo(3.6, 10);
  expect(clipboardBitmapPadding(setStyle(slides, { overrides: { bondLength: 80 } }))).toBe(20);
});
test('ordinary size and grouping', () => {
  expect(pngPixelSize(800, 200, 300)).toEqual({
    width: 3334,
    height: 834,
    dpi: 300,
    reduced: false,
  });
  expect([999, 2984, 1234567].map(groupDigits)).toEqual(['999', '2,984', '1,234,567']);
});
test.each([
  [720001, 1],
  [720000, 720000],
  [1e308, 1e308],
  [4000, 4000],
])('caps %s × %s', (w, h) => {
  const s = pngPixelSize(w, h, 300);
  expect(s.dpi).toBeGreaterThan(0);
  expect(s.reduced).toBe(true);
  expect(s.width).toBe(Math.max(1, Math.ceil((w * s.dpi) / 72)));
  expect(s.height).toBe(Math.max(1, Math.ceil((h * s.dpi) / 72)));
  expect(s.width).toBeLessThanOrEqual(10000);
  expect(s.height).toBeLessThanOrEqual(10000);
  expect(s.width * s.height).toBeLessThanOrEqual(50000000);
  if (w >= 720000) expect(s.dpi).toBeLessThan(1);
});
