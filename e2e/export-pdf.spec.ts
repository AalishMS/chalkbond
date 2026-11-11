// C12 (SPEC-clipboard-export.md EX3, PD1, PD2, PDF-A1–A4, CS6; SC9): Export PDF of the scheme
// through the real dialog, C5 print in main and C4 write. PD2 structure checks; the printed PDF
// is a byte prefix of the file (PDF-A1); the C4 viewer shows the exported file as the printed one;
// File > Open (real A9 flow) gives an equal document. The print window ran no script, had no
// preload, and it and its temp folder are gone afterwards. CS6: with printToPDF rejecting, the
// temp folder is gone, one window is left and the error box says "Couldn't save".
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type ElectronApplication } from '@playwright/test';
import { drawingPayload, exportSvg, readPdfDrawing } from '../src/core/clipboard-export';
import { serialize } from '../src/core/doc-model';
import { BOX_OK, dialogLog, exportWith, expectNotice, openFrom, saveTo } from './export-steps';
import { loadScheme } from './fixtures';
import { expectNoNetwork, heardNotices, openApp, readDocument } from './harness';
import { viewerDifferences } from './pdf-viewer';
import { windowTitle } from './relaunch';

let dir: string;
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chalkbond-export-pdf-'));
});
test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface PrintRecord {
  url: string;
  prefs: Record<string, unknown>;
  printed: number[] | null;
  destroyed: () => boolean;
}
type Recorder = { __pdfRecords?: PrintRecord[] };

/**
 * Records every window the app creates from now on: the page it loaded, its web preferences and
 * (wrapping `printToPDF`) the printed bytes; `reject` makes `printToPDF` reject instead (CS6).
 */
async function recordPrintWindows(app: ElectronApplication, reject: boolean): Promise<void> {
  await app.evaluate(({ app }, reject) => {
    const records: PrintRecord[] = [];
    (globalThis as Recorder).__pdfRecords = records;
    app.on('browser-window-created', (_event, win) => {
      const contents = win.webContents;
      const record: PrintRecord = {
        url: '',
        prefs: {},
        printed: null,
        destroyed: () => win.isDestroyed(),
      };
      records.push(record);
      contents.on('did-finish-load', () => {
        record.url = contents.getURL();
        const p = (
          contents as unknown as { getLastWebPreferences(): Record<string, unknown> }
        ).getLastWebPreferences();
        record.prefs = {
          javascript: p['javascript'],
          sandbox: p['sandbox'],
          contextIsolation: p['contextIsolation'],
          nodeIntegration: p['nodeIntegration'],
          preload: p['preload'] ?? null,
        };
      });
      const print = contents.printToPDF.bind(contents);
      contents.printToPDF = async (options) => {
        if (reject) throw new Error('stubbed printToPDF failure');
        const bytes = await print(options);
        record.printed = Array.from(bytes);
        return bytes;
      };
    });
  }, reject);
}

const records = (app: ElectronApplication) =>
  app.evaluate(() =>
    ((globalThis as Recorder).__pdfRecords ?? []).map((r) => ({
      url: r.url,
      prefs: r.prefs,
      printed: r.printed,
      destroyed: r.destroyed(),
    })),
  );
const windowCount = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);

const count = (text: string, re: RegExp) => [...text.matchAll(re)].length;

test('SC9: Export PDF: PD2 structure, the drawing inside, viewer equal, reopens equal', async () => {
  const chalk = join(dir, 'esterification.chalk');
  const file = join(dir, 'esterification.pdf');
  const { app, page } = await openApp({
    launch: { dialogs: [saveTo(chalk), saveTo(file), openFrom(file)] },
  });
  try {
    await loadScheme(page);
    await page.keyboard.press('Control+s');
    await expect.poll(() => windowTitle(app)).toBe('esterification - Chalkbond');
    const doc = await readDocument(page);
    await recordPrintWindows(app, false);

    await exportWith(page, { format: 'pdf' });
    await expectNotice(page, 'Exported esterification.pdf.');
    expect((await dialogLog(app))[1]?.options['defaultPath']).toBe(file);
    expect(serialize(await readDocument(page))).toBe(serialize(doc));
    expect(await windowTitle(app)).toBe('esterification - Chalkbond');

    // The print window: no script, no preload, sandboxed; destroyed; its folder removed.
    const [print, ...others] = await records(app);
    expect(others).toEqual([]);
    expect(print?.prefs).toEqual({
      javascript: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: null,
    });
    expect(print?.url).toMatch(/^file:.*[\\/]chalkbond-pdf-[^\\/]+[\\/]page\.html$/);
    const folder = join(fileURLToPath(print?.url ?? 'file:///'), '..');
    expect(existsSync(folder)).toBe(false);
    expect(print?.destroyed).toBe(true);
    expect(await windowCount(app)).toBe(1);

    // PD2 and PDF-A1.
    const bytes = readFileSync(file);
    const text = bytes.toString('latin1');
    const printed = Buffer.from(print?.printed ?? []);
    expect(printed.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, printed.length).equals(printed)).toBe(true);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(count(text, /\/Type\s*\/Page(?![a-zA-Z])/g)).toBe(1);
    const svg = exportSvg(doc, null, { embed: false });
    const box = /\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/.exec(text);
    const [x0, y0, x1, y1] = (box?.slice(1) ?? []).map(Number);
    expect(Math.abs((x0 ?? NaN) - 0)).toBeLessThanOrEqual(1);
    expect(Math.abs((y0 ?? NaN) - 0)).toBeLessThanOrEqual(1);
    expect(Math.abs((x1 ?? NaN) - svg.width)).toBeLessThanOrEqual(1);
    expect(Math.abs((y1 ?? NaN) - svg.height)).toBeLessThanOrEqual(1);
    expect(text).toContain('/FontFile2');
    expect(text).not.toMatch(/\/Subtype\s*\/Image/);
    expect(readPdfDrawing(new Uint8Array(bytes))).toBe(drawingPayload(doc));

    // The C4 viewer: the exported file looks exactly as the printed one.
    const viewed = await viewerDifferences(app, [
      { name: 'original.pdf', bytes: Array.from(printed), ink: true },
      { name: 'exported.pdf', bytes: Array.from(bytes), ink: true },
    ]);
    expect(viewed.windows).toBe(1);
    expect((viewed.differences[1] ?? Infinity) / viewed.pixels).toBeLessThanOrEqual(0.005);

    // The real A9 flow: File > Open (Ctrl+O, stubbed dialog) of the exported PDF.
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+o');
    await expect.poll(() => windowTitle(app)).toBe('esterification.pdf - Chalkbond');
    expect(serialize(await readDocument(page))).toBe(serialize(doc));
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('CS6: printToPDF rejects: the temp folder is gone, one window, "Couldn\'t save"', async () => {
  const file = join(dir, 'toluene.pdf');
  const { app, page } = await openApp({ launch: { dialogs: [saveTo(file), BOX_OK] } });
  try {
    await loadScheme(page);
    const doc = await readDocument(page);
    const title = await windowTitle(app);
    await recordPrintWindows(app, true);
    await exportWith(page, { format: 'pdf' });
    await expect.poll(async () => (await dialogLog(app)).length).toBe(2);
    const box = (await dialogLog(app))[1];
    expect(box?.method).toBe('showMessageBox');
    expect(String(box?.options['message'])).toBe("Couldn't save “toluene.pdf”.");
    const [print] = await records(app);
    expect(print?.url).toMatch(/[\\/]chalkbond-pdf-[^\\/]+[\\/]page\.html$/);
    expect(existsSync(join(fileURLToPath(print?.url ?? 'file:///'), '..'))).toBe(false);
    expect(print?.destroyed).toBe(true);
    expect(await windowCount(app)).toBe(1);
    expect(existsSync(file)).toBe(false);
    expect((await heardNotices(page)).filter((n) => n.text.startsWith('Exported'))).toEqual([]);
    expect(serialize(await readDocument(page))).toBe(serialize(doc));
    expect(await windowTitle(app)).toBe(title);
  } finally {
    await app.close();
  }
});
