// A8 (SPEC-app-shell.md F1–F7, F13, N-A1; SC3, SC4 for New, Open and close): file flows through
// the real main process with scripted native dialogs (e2e/stub-dialogs.mjs). Paths stay in main.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { serialize } from '../src/core/doc-model';
import { loadScheme } from './fixtures';
import { expectNoNetwork, openApp, readDocument } from './harness';

type DialogLog = { method: string; options: Record<string, unknown> }[];
const dialogLog = async (app: ElectronApplication): Promise<DialogLog> =>
  (await app.evaluate(
    () => (globalThis as { __chalkbondDialogLog?: DialogLog }).__chalkbondDialogLog ?? [],
  )) as DialogLog;
const title = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle());
const hint = (page: Page) => page.getByTestId('statusbar').getByRole('status');
const saveChanges = (name: string) => ({
  type: 'warning',
  title: 'Chalkbond',
  message: `Do you want to save changes to “${name}”?`,
  detail: "If you don't save, your changes will be lost.",
  buttons: ['Save', "Don't save", 'Cancel'],
  defaultId: 0,
  cancelId: 2,
  noLink: true,
});

async function edit(page: Page): Promise<void> {
  const before = Object.keys((await readDocument(page)).atoms).length;
  await page.getByTestId('tool-atom').click();
  await page.getByTestId('canvas').click({ position: { x: 900, y: 600 } });
  await expect
    .poll(async () => Object.keys((await readDocument(page)).atoms).length)
    .toBeGreaterThan(before);
  await page.getByTestId('canvas').focus();
}

let dir: string;
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chalkbond-files-'));
});
test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("SC3: Ctrl+S saves a scheme, New with Don't save, Ctrl+O opens it back", async () => {
  const file = join(dir, 'esterification.chalk');
  const { app, page } = await openApp({
    launch: {
      dialogs: [
        { canceled: false, filePath: file }, // Ctrl+S → Save as (Untitled)
        { response: 1 }, // edit + Ctrl+N → Don't save
        { canceled: false, filePaths: [file] }, // Ctrl+O
      ],
    },
  });
  try {
    await loadScheme(page);
    await expect.poll(() => title(app)).toBe('*Untitled - Chalkbond');
    const scheme = await readDocument(page);
    await page.keyboard.press('Control+s');
    await expect.poll(() => title(app)).toBe('esterification - Chalkbond');
    expect(readFileSync(file, 'utf8')).toBe(serialize(scheme));
    expect(serialize(await readDocument(page))).toBe(serialize(scheme));
    await expect(hint(page)).toHaveText('Saved esterification.chalk.');
    const save = (await dialogLog(app))[0];
    expect(save?.method).toBe('showSaveDialog');
    expect(String(save?.options['defaultPath'])).toMatch(/[\\/]Untitled\.chalk$/);
    expect(save?.options['filters']).toEqual([
      { name: 'Chalkbond drawing', extensions: ['chalk'] },
    ]);

    await edit(page);
    await expect.poll(() => title(app)).toBe('*esterification - Chalkbond');
    await page.keyboard.press('Control+n');
    await expect.poll(async () => Object.keys((await readDocument(page)).atoms).length).toBe(0);
    await expect.poll(() => title(app)).toBe('Untitled - Chalkbond');
    expect((await dialogLog(app))[1]?.options).toEqual(saveChanges('esterification'));
    expect(readFileSync(file, 'utf8')).toBe(serialize(scheme)); // Don't save wrote nothing

    await page.keyboard.press('Control+o');
    await expect.poll(() => title(app)).toBe('esterification - Chalkbond');
    expect(serialize(await readDocument(page))).toBe(serialize(scheme));
    const log = await dialogLog(app);
    expect(log.map((e) => e.method)).toEqual([
      'showSaveDialog',
      'showMessageBox',
      'showOpenDialog',
    ]);
    expect(log[2]?.options['filters']).toEqual([
      { name: 'Chalkbond drawings', extensions: ['chalk', 'png', 'svg', 'pdf'] },
    ]);
  } finally {
    await app.close();
  }
});

test('SC4 New: the A09 prompt; Cancel keeps the drawing, Save writes then clears', async () => {
  const file = join(dir, 'scheme.chalk');
  const { app, page } = await openApp({
    launch: {
      dialogs: [
        { response: 2 }, // Ctrl+N → Cancel
        { response: 0 }, // Ctrl+N → Save
        { canceled: false, filePath: file }, // → Save as
      ],
    },
  });
  try {
    await loadScheme(page);
    const scheme = await readDocument(page);
    await page.keyboard.press('Control+n');
    await expect.poll(async () => (await dialogLog(app)).length).toBe(1);
    expect((await dialogLog(app))[0]?.options).toEqual(saveChanges('Untitled'));
    expect(serialize(await readDocument(page))).toBe(serialize(scheme));
    await expect.poll(() => title(app)).toBe('*Untitled - Chalkbond');

    await page.keyboard.press('Control+n');
    await expect.poll(async () => Object.keys((await readDocument(page)).atoms).length).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(serialize(scheme));
    await expect.poll(() => title(app)).toBe('Untitled - Chalkbond');
    // New takes the startup style (slides until A10 remembers the last switch).
    expect((await readDocument(page)).style.preset).toBe('slides');
    expect((await dialogLog(app)).map((e) => e.method)).toEqual([
      'showMessageBox',
      'showMessageBox',
      'showSaveDialog',
    ]);
  } finally {
    await app.close();
  }
});

test('Ctrl+Shift+S on a saved drawing suggests its name in the last save folder', async () => {
  const first = join(dir, 'esterification.chalk');
  const { app, page } = await openApp({
    launch: { dialogs: [{ canceled: false, filePath: first }, { canceled: true }] },
  });
  try {
    await edit(page);
    await page.keyboard.press('Control+s');
    await expect.poll(() => title(app)).toBe('esterification - Chalkbond');
    await page.keyboard.press('Control+Shift+s');
    await expect.poll(async () => (await dialogLog(app)).length).toBe(2);
    expect((await dialogLog(app))[1]?.options['defaultPath']).toBe(first);
    await expect.poll(() => title(app)).toBe('esterification - Chalkbond');
  } finally {
    await app.close();
  }
});

test("SC4 close: the prompt; Cancel keeps the window, Don't save closes the app", async () => {
  const { app, page } = await openApp({ launch: { dialogs: [{ response: 2 }, { response: 1 }] } });
  let closed = false;
  app.once('close', () => {
    closed = true;
  });
  try {
    await edit(page);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
    await expect.poll(async () => (await dialogLog(app)).length).toBe(1);
    expect((await dialogLog(app))[0]?.options).toEqual(saveChanges('Untitled'));
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    await expect.poll(() => title(app)).toBe('*Untitled - Chalkbond');
    await expectNoNetwork(app);
    const exited = app.waitForEvent('close');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
    await exited;
    expect(closed).toBe(true);
  } finally {
    if (!closed) await app.close();
  }
});

test('F13: a clean drawing closes without a prompt; a gone renderer never blocks closing', async () => {
  const clean = await openApp({ launch: { dialogs: [] } });
  const exitedClean = clean.app.waitForEvent('close');
  await expectNoNetwork(clean.app);
  await clean.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await exitedClean;

  const { app, page } = await openApp({ launch: { dialogs: [] } });
  let closed = false;
  app.once('close', () => {
    closed = true;
  });
  try {
    await edit(page);
    await expect.poll(() => title(app)).toBe('*Untitled - Chalkbond');
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.webContents.forcefullyCrashRenderer(),
    );
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.webContents.isCrashed(),
        ),
      )
      .toBe(true);
    await expectNoNetwork(app);
    const exited = app.waitForEvent('close');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
    await exited;
    expect(closed).toBe(true);
  } finally {
    if (!closed) await app.close();
  }
});

test('a save into a deleted folder: the folder-gone box, the title keeps its *', async () => {
  const gone = join(dir, 'gone');
  mkdirSync(gone);
  rmSync(gone, { recursive: true });
  const { app, page } = await openApp({
    launch: { dialogs: [{ canceled: false, filePath: join(gone, 'x.chalk') }, { response: 0 }] },
  });
  try {
    await edit(page);
    const before = serialize(await readDocument(page));
    await page.keyboard.press('Control+s');
    await expect.poll(async () => (await dialogLog(app)).length).toBe(2);
    expect((await dialogLog(app))[1]?.options).toEqual({
      type: 'error',
      title: 'Chalkbond',
      message: "Couldn't save “x.chalk”.",
      detail: 'The folder no longer exists. Choose another folder.',
      buttons: ['OK'],
    });
    await expect.poll(() => title(app)).toBe('*Untitled - Chalkbond');
    expect(serialize(await readDocument(page))).toBe(before);
  } finally {
    await app.close();
  }
});
