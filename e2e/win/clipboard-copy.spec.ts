// SC3, SC4 and R4 on the real Windows clipboard (Windows only; e2e/win is ignored elsewhere).
// NOT RUN YET: written on Linux for C8; the format keys are the unverified preferred ones of
// formats.ts until probe C3 runs on Windows.
import { execFileSync } from 'node:child_process';
import { expect, test, type ElectronApplication } from '@playwright/test';
import {
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
import { openApp, readDocument, readSelection } from '../harness';
import { loadScheme, selectEthanol } from '../fixtures';

/** The bytes of each CB-W1 entry on the clipboard, read in main. */
const readEntries = (app: ElectronApplication) =>
  app.evaluate(async ({ clipboard }, formats) => {
    const items = await clipboard.read();
    const values: Record<string, number[]> = {};
    for (const key of [formats.png, formats.svg, formats.drawing]) {
      if (!key) continue;
      const item = items.find((entry) => entry.types.includes(key));
      if (!item) continue;
      const blob = await item.getType(key);
      if (!('arrayBuffer' in blob)) throw Error('Expected Blob');
      values[key] = Array.from(new Uint8Array(await blob.arrayBuffer()));
    }
    return values;
  }, preferredFormats);

/** P2b: the Windows clipboard format names. */
const windowsFormats = (): string =>
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-STA',
      '-Command',
      'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetDataObject().GetFormats()',
    ],
    { encoding: 'utf8' },
  );

test('SC3: Copy with nothing selected writes the CB-W1 formats, the SVG, the drawing and a 300 dpi PNG', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await loadScheme(page);
    await page.getByTestId('copy').click();
    await expect(page.getByTestId('copy')).toHaveText('Copied');
    const formats = windowsFormats();
    for (const key of ['PNG', 'image/svg+xml', 'application/x-chalkbond'])
      expect(formats).toContain(key);
    expect(formats).not.toMatch(/UnicodeText|^Text$/m);

    const entries = await readEntries(app);
    const svg = exportSvg(doc, null);
    expect(Buffer.from(entries[preferredFormats.svg ?? ''] ?? []).toString()).toBe(svg.svg);
    const drawing = Buffer.from(entries[preferredFormats.drawing] ?? []).toString();
    const parsed = parse(drawing);
    if (!parsed.ok) throw new Error('the drawing entry does not parse');
    expect(serialize(parsed.value)).toBe(serialize(doc));
    const png = new Uint8Array(entries[preferredFormats.png ?? ''] ?? []);
    const view = new DataView(png.buffer);
    expect(view.getUint32(16)).toBe(Math.ceil((svg.width * 300) / 72));
    expect(view.getUint32(20)).toBe(Math.ceil((svg.height * 300) / 72));
    const phys = Buffer.from(png).indexOf('pHYs');
    expect(view.getUint32(phys + 4)).toBe(11811);
    expect(view.getUint32(phys + 8)).toBe(11811);
    expect(readPngDrawing(png)).toBe(drawing);
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
    await expect
      .poll(async () =>
        Buffer.from((await readEntries(app))[preferredFormats.drawing] ?? []).toString(),
      )
      .toBe(expected);
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
