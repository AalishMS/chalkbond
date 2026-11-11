// SC3, SC4 and R4 on the real Windows clipboard (Windows only; e2e/win is ignored elsewhere).
// The Windows side is read through .NET (windows-clipboard.ts): that is what Office sees. The
// native PNG is Chromium's re-encoding (same pixels, no pHYs: SPEC-clipboard-export.md R9).
import { expect, test, type ElectronApplication } from '@playwright/test';
import { drawingPayload, exportSvg, pictureDoc } from '../../src/core/clipboard-export';
import {
  parse,
  serialize,
  type AtomId,
  type BondId,
  type ObjectId,
} from '../../src/core/doc-model';
import { preferredFormats } from '../../src/main/clipboard-export/formats';
import { expectBlockedRequests } from '../launch';
import { openApp, readDocument, readSelection } from '../harness';
import { loadScheme, selectEthanol } from '../fixtures';
import { pngSize, readElectronClipboard, readWindowsClipboard } from './windows-clipboard';

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
    // The bitmap has the 300 dpi pixel size (its pHYs is dropped by Chromium, Decision R9).
    expect(pngSize(native.streams['PNG'] ?? Buffer.alloc(24))).toEqual({
      width: Math.ceil((svg.width * 300) / 72),
      height: Math.ceil((svg.height * 300) / 72),
    });
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
