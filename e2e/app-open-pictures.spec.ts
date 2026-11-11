// A9 (SPEC-app-shell.md F3, A6; clipboard-export E1–E4, CS4, PDF-A; SC5 part): exported pictures
// reopen as editable drawings; a picture session's Save goes to Save as with `<name>.chalk` in the
// picture's folder (main decides the folder from the session ref); the picture is never written.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, type ElectronApplication } from '@playwright/test';
import {
  crc32,
  drawingPayload,
  exportSvg,
  withPdfDrawing,
  withPictureChunks,
} from '../src/core/clipboard-export';
import { serialize } from '../src/core/doc-model';
import { expectNoNetwork, goldenDoc, openApp, readDocument } from './harness';

/** A 1×1 transparent PNG from another program. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
type DialogLog = { method: string; options: Record<string, unknown> }[];
const dialogLog = async (app: ElectronApplication): Promise<DialogLog> =>
  (await app.evaluate(
    () => (globalThis as { __chalkbondDialogLog?: DialogLog }).__chalkbondDialogLog ?? [],
  )) as DialogLog;
const title = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle());

let dir: string;
let folder: string;
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chalkbond-pictures-'));
  folder = join(dir, 'Lessons');
  mkdirSync(folder);
});
test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const toluene = goldenDoc('toluene');
const pictures: [string, () => Uint8Array][] = [
  ['toluene.png', () => withPictureChunks(PIXEL, { dpi: 300, payload: drawingPayload(toluene) })],
  ['toluene.svg', () => new TextEncoder().encode(exportSvg(toluene, null).svg)],
  [
    'toluene.pdf',
    () => {
      const fixture = readFileSync(
        resolve(__dirname, '../src/core/clipboard-export/__fixtures__/chromium-45.pdf'),
      );
      const embedded = withPdfDrawing(new Uint8Array(fixture), drawingPayload(toluene));
      if (!embedded.ok) throw new Error(`PDF-A embedding failed: ${embedded.reason}`);
      return embedded.pdf;
    },
  ],
];

for (const [name, make] of pictures) {
  test(`SC5: ${name} reopens editable; Save goes to Save as toluene.chalk in its folder`, async () => {
    const file = join(folder, name);
    const data = make();
    writeFileSync(file, data);
    const { app, page } = await openApp({
      launch: { dialogs: [{ canceled: false, filePaths: [file] }, { canceled: true }] },
    });
    try {
      await page.getByTestId('canvas').focus();
      await page.keyboard.press('Control+o');
      await expect.poll(() => title(app)).toBe(`${name} - Chalkbond`);
      expect(serialize(await readDocument(page))).toBe(serialize(toluene));
      await expect(page.getByTestId('copy')).toBeEnabled();

      await page.keyboard.press('Control+s');
      await expect.poll(async () => (await dialogLog(app)).length).toBe(2);
      const save = (await dialogLog(app))[1];
      expect(save?.method).toBe('showSaveDialog');
      expect(save?.options).toEqual({
        defaultPath: join(folder, 'toluene.chalk'),
        filters: [{ name: 'Chalkbond drawing', extensions: ['chalk'] }],
      });
      expect(await title(app)).toBe(`${name} - Chalkbond`);
      expect(Buffer.compare(readFileSync(file), Buffer.from(data))).toBe(0);
    } finally {
      await app.close();
    }
  });
}

/** `png` with an ancillary private chunk of `size` zero bytes after IHDR (a picture over 20 MiB). */
function padded(png: Uint8Array, size: number): Uint8Array {
  const chunk = Buffer.alloc(size + 12);
  chunk.writeUInt32BE(size, 0);
  chunk.write('flLr', 4, 'latin1');
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), size + 8);
  return Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]);
}

test('C9: a 21 MiB PNG made in Chalkbond with a small drawing reopens editable', async () => {
  const file = join(folder, 'big.png');
  const data = padded(
    withPictureChunks(PIXEL, { dpi: 300, payload: drawingPayload(toluene) }),
    21 * 1024 * 1024,
  );
  expect(data.length).toBeGreaterThan(20 * 1024 * 1024);
  writeFileSync(file, data);
  const { app, page } = await openApp({
    launch: { dialogs: [{ canceled: false, filePaths: [file] }] },
  });
  try {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+o');
    await expect.poll(() => title(app)).toBe('big.png - Chalkbond');
    expect(serialize(await readDocument(page))).toBe(serialize(toluene));
    expect((await dialogLog(app)).map((d) => d.method)).toEqual(['showOpenDialog']);
  } finally {
    await app.close();
  }
});

test('CS4: an opened SVG with a remote image and a script is scanned, never loaded', async () => {
  const file = join(folder, 'trap.svg');
  const svg = exportSvg(toluene, null).svg.replace(
    '</svg>',
    '<image href="http://example.com/x.png" width="10" height="10"/>' +
      '<script>fetch("https://example.com/leak")</script></svg>',
  );
  writeFileSync(file, svg);
  const { app, page } = await openApp({
    launch: { dialogs: [{ canceled: false, filePaths: [file] }] },
  });
  try {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+o');
    await expect.poll(() => title(app)).toBe('trap.svg - Chalkbond');
    expect(serialize(await readDocument(page))).toBe(serialize(toluene));
    await page.waitForTimeout(500); // a fetch from a rendered SVG would have been blocked by now
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});
