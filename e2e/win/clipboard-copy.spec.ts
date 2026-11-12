// SC3, SC4 and R4 on the real Windows clipboard (Windows only; e2e/win is ignored elsewhere).
// The Windows side is read through .NET (windows-clipboard.ts): that is what Office sees. The
// native PNG is Chromium's re-encoding (same pixels, no pHYs: SPEC-clipboard-export.md R9).
import { expect, test, type ElectronApplication } from '@playwright/test';
import {
  clipboardBitmapPadding,
  drawingPayload,
  exportSvg,
  pictureDoc,
  readPngDrawing,
} from '../../src/core/clipboard-export';
import {
  parse,
  serialize,
  type AtomId,
  type BondId,
  type ObjectId,
} from '../../src/core/doc-model';
import { preferredFormats } from '../../src/main/clipboard-export/formats';
import { expectBlockedRequests } from '../launch';
import { goldenDoc, loadDocument, openApp, readDocument, readSelection } from '../harness';
import { loadScheme, selectEthanol } from '../fixtures';
import { setStyle } from '../../src/core/doc-model';
import {
  decodePng,
  pngSize,
  readElectronClipboard,
  readWindowsClipboard,
} from './windows-clipboard';

/** The drawing entry's text as Electron reads it back in main. */
const readDrawing = async (app: ElectronApplication): Promise<string> =>
  Buffer.from(
    (await readElectronClipboard(app, [preferredFormats.drawing])).bytes[
      preferredFormats.drawing
    ] ?? [],
  ).toString();

test('SC3: Copy with nothing selected writes the CB-W1 formats, the SVG, the drawing and a 300 dpi bitmap', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await loadScheme(page);
    await page.getByTestId('copy').click();
    await expect(page.getByTestId('copy')).toHaveText('Copied');
    const native = readWindowsClipboard();
    expect(native.nativeFormats).toEqual(
      expect.arrayContaining(['PNG', 'image/svg+xml', 'application/x-chalkbond']),
    );
    expect(native.formats).not.toContain('Text');
    expect(native.formats).not.toContain('UnicodeText');

    const svg = exportSvg(doc, null);
    expect(native.streams['image/svg+xml']?.toString()).toBe(svg.svg);
    const drawing = native.streams['application/x-chalkbond']?.toString() ?? '';
    const parsed = parse(drawing);
    if (!parsed.ok) throw new Error('the drawing entry does not parse');
    expect(serialize(parsed.value)).toBe(serialize(doc));
    expect(await readDrawing(app)).toBe(drawing);
    // The bitmap has the 300 dpi pixel size of the padded SVG (R10, SC3; its pHYs is dropped by
    // Chromium, Decision R9). The SVG entry above stays tight.
    const padded = exportSvg(doc, null, { embed: false, padding: clipboardBitmapPadding(doc) });
    expect(pngSize(native.streams['PNG'] ?? Buffer.alloc(24))).toEqual({
      width: Math.max(1, Math.ceil((padded.width * 300) / 72)),
      height: Math.max(1, Math.ceil((padded.height * 300) / 72)),
    });
    // Nor is the drawing readable from the clipboard PNG: Chromium drops the tEXt chunk too (R9).
    expect(readPngDrawing(native.streams['PNG'] ?? Buffer.alloc(0))).toBeNull();
    expectBlockedRequests(app, 0);
  } finally {
    await app.close();
  }
});

test('SC4: Ctrl+C with ethanol selected writes drawingPayload(pictureDoc(doc, selection))', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await loadScheme(page);
    await selectEthanol(page);
    const selection = await readSelection(page);
    await page.keyboard.press('Control+c');
    await expect(page.getByTestId('copy')).toHaveText('Copied');
    const expected = drawingPayload(
      pictureDoc(doc, {
        atoms: new Set(selection.atoms as AtomId[]),
        bonds: new Set(selection.bonds as BondId[]),
        objects: new Set(selection.objects as ObjectId[]),
      }),
    );
    await expect.poll(() => readDrawing(app)).toBe(expected);
    expect(readWindowsClipboard().streams['application/x-chalkbond']?.toString()).toBe(expected);
    expect(await readDocument(page)).toEqual(doc);
  } finally {
    await app.close();
  }
});

test('R4: Ctrl+C in the name field copies the typed text, not the drawing', async () => {
  const { app, page } = await openApp();
  try {
    await loadScheme(page);
    const field = page.getByTestId('namefield-input');
    await field.fill('ethanol');
    await field.selectText();
    await page.keyboard.press('Control+c');
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('ethanol');
    expect(
      await page.evaluate(async () => (await window.chalkbond.clipboardRead()).drawing),
    ).toBeNull();
    await expect(page.getByTestId('copy')).toHaveText('Copy');
  } finally {
    await app.close();
  }
});

for (const preset of ['slides', 'journal'] as const) {
  test(`SC14: the clipboard bitmap is opaque white with a 0.25-bond margin (${preset})`, async () => {
    const { app, page } = await openApp();
    try {
      const doc = setStyle(goldenDoc('toluene'), { preset });
      await loadDocument(page, doc);
      await page.getByTestId('copy').click();
      await expect(page.getByTestId('copy')).toHaveText('Copied');
      const native = readWindowsClipboard();
      const png = native.streams['PNG'];
      if (!png) throw new Error('no PNG on the clipboard');
      const { width, height, rgba } = await decodePng(app, png);
      expect({ width, height }).toEqual(pngSize(png));
      const at = (x: number, y: number): number[] => [
        ...rgba.subarray((y * width + x) * 4).slice(0, 4),
      ];
      for (const [x, y] of [
        [0, 0],
        [width - 1, 0],
        [0, height - 1],
        [width - 1, height - 1],
      ] as const) {
        expect(at(x, y)).toEqual([255, 255, 255, 255]);
      }
      let minAlpha = 255;
      let left = width;
      let top = height;
      let right = -1;
      let bottom = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          minAlpha = Math.min(minAlpha, rgba[i + 3] ?? 0);
          // Ink: a clearly drawn pixel. Alpha is 255 everywhere, so the test is colour.
          if (Math.min(rgba[i] ?? 255, rgba[i + 1] ?? 255, rgba[i + 2] ?? 255) < 128) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      }
      expect(minAlpha).toBe(255);
      // Toluene has no text, so its ink is tight: the margin m (pt) is m * 300 / 72 px.
      const margin = (clipboardBitmapPadding(doc) * 300) / 72;
      expect(Math.abs(left - margin)).toBeLessThanOrEqual(2);
      expect(Math.abs(top - margin)).toBeLessThanOrEqual(2);
      expect(Math.abs(width - 1 - right - margin)).toBeLessThanOrEqual(2);
      expect(Math.abs(height - 1 - bottom - margin)).toBeLessThanOrEqual(2);
      // The SVG entry is still transparent, tight and true size: byte-identical to the picture.
      expect(native.streams['image/svg+xml']?.toString()).toBe(exportSvg(doc, null).svg);
      expectBlockedRequests(app, 0);
    } finally {
      await app.close();
    }
  });
}
