// A9 (SPEC-app-shell.md F3, F14, A10 wording; SC6): files that cannot be opened show the native
// error box; the current drawing, the session and the file's bytes are unchanged, and no
// unsaved-changes prompt is shown (the drawing is dirty, so a prompt would appear as a box).
import { mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication } from '@playwright/test';
import { serialize } from '../src/core/doc-model';
import { goldenDoc, openApp, readDocument } from './harness';

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
const box = (message: string, detail: string) => ({
  type: 'error',
  title: 'Chalkbond',
  message,
  detail,
  buttons: ['OK'],
});

test('SC6: newer, damaged, no drawing and missing files: wording, nothing changed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chalkbond-open-errors-'));
  const newer = join(dir, 'newer.chalk');
  const damaged = join(dir, 'damaged.chalk');
  const photo = join(dir, 'photo.png');
  const missing = join(dir, 'ethanol.chalk');
  writeFileSync(
    newer,
    serialize(goldenDoc('ethanol')).replace('"schemaVersion": 1', '"schemaVersion": 999'),
  );
  writeFileSync(damaged, '{"format":"chalkbond"');
  writeFileSync(photo, PIXEL);
  writeFileSync(missing, serialize(goldenDoc('ethanol')));
  const cases: [string, ReturnType<typeof box>][] = [
    [
      newer,
      box(
        '“newer.chalk” was made with a newer version of Chalkbond.',
        'Install the newer Chalkbond to open it. The file has not been changed.',
      ),
    ],
    [
      damaged,
      box(
        "Chalkbond can't open “damaged.chalk”.",
        'The file is damaged or is not a Chalkbond drawing. The file has not been changed.',
      ),
    ],
    [
      photo,
      box(
        '“photo.png” has no Chalkbond drawing inside.',
        'Only pictures exported or copied from Chalkbond can be opened and changed.',
      ),
    ],
    [
      missing,
      box("“ethanol.chalk” can't be found.", 'It may have been moved, renamed or deleted.'),
    ],
  ];
  const { app, page } = await openApp({
    launch: {
      dialogs: cases.flatMap(([path]) => [{ canceled: false, filePaths: [path] }, { response: 0 }]),
    },
  });
  try {
    await page.getByTestId('tool-atom').click();
    await page.getByTestId('canvas').click({ position: { x: 600, y: 400 } });
    await expect.poll(() => title(app)).toBe('*Untitled - Chalkbond');
    await page.getByTestId('canvas').focus();
    const drawing = serialize(await readDocument(page));
    const bytes = new Map(
      [newer, damaged, photo].map((path) => [path, readFileSync(path)] as const),
    );
    rmSync(missing); // chosen, then deleted before it is read
    for (const [i, [path, expected]] of cases.entries()) {
      await page.keyboard.press('Control+o');
      await expect.poll(async () => (await dialogLog(app)).length).toBe(2 * i + 2);
      const log = await dialogLog(app);
      expect(log[2 * i]?.method, path).toBe('showOpenDialog');
      expect(log[2 * i + 1]?.method, path).toBe('showMessageBox');
      expect(log[2 * i + 1]?.options, path).toEqual(expected);
      expect(serialize(await readDocument(page)), path).toBe(drawing);
      expect(await title(app), path).toBe('*Untitled - Chalkbond');
    }
    for (const [path, before] of bytes) expect(Buffer.compare(readFileSync(path), before)).toBe(0);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C9: a .chalk over 20 MiB and a picture over 64 MiB are too large (F14 wording)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chalkbond-open-large-'));
  const chalk = join(dir, 'big.chalk');
  const png = join(dir, 'huge.png');
  writeFileSync(chalk, '');
  truncateSync(chalk, 20 * 1024 * 1024 + 1);
  writeFileSync(png, PIXEL);
  truncateSync(png, 64 * 1024 * 1024 + 1);
  const detail = 'Drawings can be up to 20 MB. Pictures made in Chalkbond can be up to 64 MB.';
  const cases: [string, ReturnType<typeof box>][] = [
    [chalk, box('“big.chalk” is too large to open.', detail)],
    [png, box('“huge.png” is too large to open.', detail)],
  ];
  const { app, page } = await openApp({
    launch: {
      dialogs: cases.flatMap(([path]) => [{ canceled: false, filePaths: [path] }, { response: 0 }]),
    },
  });
  try {
    await page.getByTestId('canvas').focus();
    const drawing = serialize(await readDocument(page));
    for (const [i, [path, expected]] of cases.entries()) {
      await page.keyboard.press('Control+o');
      await expect.poll(async () => (await dialogLog(app)).length).toBe(2 * i + 2);
      const log = await dialogLog(app);
      expect(log[2 * i + 1]?.method, path).toBe('showMessageBox');
      expect(log[2 * i + 1]?.options, path).toEqual(expected);
      expect(serialize(await readDocument(page)), path).toBe(drawing);
      expect(await title(app), path).toBe('Untitled - Chalkbond');
    }
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
