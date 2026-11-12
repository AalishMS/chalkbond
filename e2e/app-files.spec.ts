// A8 with tabs (SPEC-app-shell.md F2, F5, F6, F7 as amended, T7, T8, T17, AS1, AS4, R33-R35, R41;
// TB20): file flows through the real main process with scripted native dialogs
// (e2e/stub-dialogs.mjs). New is a new tab and is skeletal; Save then Open round trip in tabs; Save
// as binds the tab and it auto-saves from then on; Ctrl+S on Untitled is Save as; no prompt anywhere
// (a named or empty tab closes silently, the window close never asks). Paths stay in main.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { addAtom, serialize, setStyle } from '../src/core/doc-model';
import { loadScheme } from './fixtures';
import { dialogLog } from './export-steps';
import { expectNoNetwork, loadDocument, openApp, readDocument, readTabs } from './harness';

const title = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle());
const hint = (page: Page) => page.getByTestId('statusbar').getByRole('status');
const labels = async (page: Page) => (await readTabs(page)).map((t) => t.label);

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

test('SC3: Ctrl+S on Untitled is Save as and binds the tab; an edit auto-saves; Ctrl+N is a new tab; Ctrl+O focuses the open file', async () => {
  const file = join(dir, 'esterification.chalk');
  const { app, page } = await openApp({
    launch: {
      dialogs: [
        { canceled: false, filePath: file }, // Ctrl+S → Save as (Untitled)
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
    await expect(hint(page)).toHaveText('Saved esterification.chalk.');
    const save = (await dialogLog(app))[0];
    expect(save?.method).toBe('showSaveDialog');
    expect(String(save?.options['defaultPath'])).toMatch(/[\\/]Untitled\.chalk$/);
    expect(save?.options['filters']).toEqual([
      { name: 'Chalkbond drawing', extensions: ['chalk'] },
    ]);
    expect(await readTabs(page)).toEqual([
      expect.objectContaining({ label: 'esterification', kind: 'chalk', marker: 'none' }),
    ]);

    // R33, R41: an edit of a named file writes itself (AS1, AS2); the title never shows `*`.
    await edit(page);
    const edited = await readDocument(page);
    await expect.poll(() => title(app)).toBe('esterification - Chalkbond');
    await expect
      .poll(() => readFileSync(file, 'utf8'), { timeout: 12_000 })
      .toBe(serialize(edited));

    // T7: a new tab, empty and skeletal; nothing asked.
    await page.keyboard.press('Control+n');
    await expect.poll(() => labels(page)).toEqual(['esterification', 'Untitled']);
    await expect.poll(() => title(app)).toBe('Untitled - Chalkbond');
    expect(Object.keys((await readDocument(page)).atoms)).toHaveLength(0);

    // T17: the file is open in a tab: Open focuses that tab and opens nothing new.
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+o');
    await expect.poll(() => title(app)).toBe('esterification - Chalkbond');
    expect(await labels(page)).toEqual(['esterification', 'Untitled']);
    expect(serialize(await readDocument(page))).toBe(serialize(edited));
    const log = await dialogLog(app);
    expect(log.map((e) => e.method)).toEqual(['showSaveDialog', 'showOpenDialog']);
    expect(log[1]?.options['filters']).toEqual([
      { name: 'Chalkbond drawings', extensions: ['chalk', 'png', 'svg', 'pdf'] },
    ]);
  } finally {
    await app.close();
  }
});

test('T8, T17: a saved file closes with Ctrl+W without a box; Ctrl+O opens it back into the empty tab', async () => {
  const file = join(dir, 'scheme.chalk');
  const { app, page } = await openApp({
    launch: {
      dialogs: [
        { canceled: false, filePath: file }, // Ctrl+S → Save as
        { canceled: false, filePaths: [file] }, // Ctrl+O
      ],
    },
  });
  try {
    await loadScheme(page);
    const scheme = await readDocument(page);
    await page.keyboard.press('Control+s');
    await expect.poll(() => title(app)).toBe('scheme - Chalkbond');
    await page.keyboard.press('Control+w');
    // R39: the last tab closed leaves one empty Untitled.
    await expect.poll(() => labels(page)).toEqual(['Untitled']);
    await expect.poll(() => title(app)).toBe('Untitled - Chalkbond');
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+o');
    await expect.poll(() => title(app)).toBe('scheme - Chalkbond');
    expect(await labels(page)).toEqual(['scheme']);
    expect(serialize(await readDocument(page))).toBe(serialize(scheme));
    expect((await dialogLog(app)).map((e) => e.method)).toEqual([
      'showSaveDialog',
      'showOpenDialog',
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

test('R35: the window close never asks, also for an Untitled drawing with content', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  let closed = false;
  try {
    await edit(page);
    await expect.poll(() => title(app)).toBe('*Untitled - Chalkbond');
    await expectNoNetwork(app);
    const exited = app.waitForEvent('close');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
    await exited;
    closed = true;
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

test('a save into a deleted folder: the folder-gone box, the tab stays Untitled with its *', async () => {
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
    expect(await labels(page)).toEqual(['Untitled']);
    expect(serialize(await readDocument(page))).toBe(before);
  } finally {
    await app.close();
  }
});

test('N10: a structural drawing is saved as v2 and reopens structural; a skeletal one in a new tab is v1', async () => {
  const structural = join(dir, 'structural.chalk');
  const skeletal = join(dir, 'skeletal.chalk');
  const { app, page } = await openApp({
    launch: {
      dialogs: [
        { canceled: false, filePath: structural }, // Ctrl+S on the structural drawing
        { canceled: false, filePath: skeletal }, // Ctrl+S on the skeletal one (a new tab)
        { canceled: false, filePaths: [structural] }, // Ctrl+O, after closing its tab
      ],
    },
  });
  try {
    const base = await readDocument(page);
    const [withAtom] = addAtom(base, { element: 'C', x: 0, y: 0 });
    const structuralDoc = setStyle(withAtom, { formula: 'structural' });
    await loadDocument(page, structuralDoc);
    await expect.poll(async () => (await readDocument(page)).style.formula).toBe('structural');
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+s');
    await expect.poll(() => title(app)).toBe('structural - Chalkbond');
    const text = readFileSync(structural, 'utf8');
    expect(text).toContain('"schemaVersion": 2');
    expect(text).toContain('"formula": "structural"');
    expect(text).toBe(serialize(structuralDoc));

    await page.keyboard.press('Control+t');
    await expect.poll(() => labels(page)).toEqual(['structural', 'Untitled']);
    await loadDocument(page, setStyle(withAtom, { formula: 'skeletal' }));
    await expect.poll(async () => (await readDocument(page)).style.formula).toBeUndefined();
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+s');
    await expect.poll(() => title(app)).toBe('skeletal - Chalkbond');
    const v1 = readFileSync(skeletal, 'utf8');
    expect(v1).toContain('"schemaVersion": 1');
    expect(v1).not.toContain('formula');

    // Close the structural tab (named, written: no box), then open its file again.
    await page.keyboard.press('Control+1');
    await expect.poll(() => title(app)).toBe('structural - Chalkbond');
    await page.keyboard.press('Control+w');
    await expect.poll(() => labels(page)).toEqual(['skeletal']);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+o');
    await expect.poll(() => title(app)).toBe('structural - Chalkbond');
    expect(await labels(page)).toEqual(['skeletal', 'structural']);
    expect((await readDocument(page)).style.formula).toBe('structural');
    expect((await dialogLog(app)).map((e) => e.method)).toEqual([
      'showSaveDialog',
      'showSaveDialog',
      'showOpenDialog',
    ]);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('N10 R28: New (Ctrl+N) with a structural drawing open gives a new skeletal empty tab, no box', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    await loadDocument(page, setStyle(await readDocument(page), { formula: 'structural' }));
    await expect.poll(async () => (await readDocument(page)).style.formula).toBe('structural');
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+n');
    await expect.poll(async () => (await readTabs(page)).length).toBe(2);
    await expect.poll(() => title(app)).toBe('Untitled 2 - Chalkbond');
    const fresh = await readDocument(page);
    expect(Object.keys(fresh.atoms)).toHaveLength(0);
    expect('formula' in fresh.style).toBe(false);
    expect((await dialogLog(app)).length).toBe(0);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});
