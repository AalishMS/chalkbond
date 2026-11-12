// A15 Open recent (SPEC-app-shell.md F10, R21): saves and opens fill the submenu (newest first,
// duplicate names with their folder), an entry opens its file, a missing file shows F14 and
// leaves the list, Clear empties it. Read through Menu.getApplicationMenu() (TH4, TH5). With tabs
// (TB20): each save binds its own tab; an open or an entry opens a tab.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { serialize, type Doc } from '../src/core/doc-model';
import { clickEnabled, menuItem, menuItems } from './app-menu';
import { goldenDoc, loadDocument, openApp, readDocument, readTabs } from './harness';
import { windowTitle } from './relaunch';

type DialogLog = { method: string; options: Record<string, unknown> }[];
const dialogLog = async (app: ElectronApplication): Promise<DialogLog> =>
  (await app.evaluate(
    () => (globalThis as { __chalkbondDialogLog?: DialogLog }).__chalkbondDialogLog ?? [],
  )) as DialogLog;
/** The Open recent submenu: ids and labels below `file.recent`, in order. */
async function recentMenu(app: ElectronApplication): Promise<string[]> {
  return (await menuItems(app))
    .filter((i) => i.id.startsWith('file.recent.'))
    .map((i) => `${i.id} ${i.label}`);
}

let dir: string;
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chalkbond-recent-'));
  mkdirSync(join(dir, 'Grade 11'));
  mkdirSync(join(dir, 'Grade 12'));
});
test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * Loads `doc` into the active Untitled tab (the test hook) and saves it (Ctrl+S → Save as), which
 * binds the tab to that file (TB20); then a new tab (Ctrl+T) for the next one.
 */
async function saveAs(app: ElectronApplication, page: Page, doc: Doc, base: string) {
  await loadDocument(page, doc);
  await expect.poll(() => windowTitle(app)).toBe('*Untitled - Chalkbond');
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Control+s');
  await expect.poll(() => windowTitle(app)).toBe(`${base} - Chalkbond`);
  await page.keyboard.press('Control+t');
  await expect.poll(() => windowTitle(app)).toBe('Untitled - Chalkbond');
}

/** Closes every tab with Ctrl+W (named, written files and an empty tab close without a box). */
async function closeAll(page: Page): Promise<void> {
  await page.getByTestId('canvas').focus();
  for (let n = (await readTabs(page)).length; n > 1; n--) {
    await page.keyboard.press('Control+w');
    await expect.poll(async () => (await readTabs(page)).length).toBe(n - 1);
  }
  // R39: closing the last tab (a written file) leaves one new empty Untitled.
  await page.keyboard.press('Control+w');
  await expect.poll(async () => (await readTabs(page)).map((t) => t.label)).toEqual(['Untitled']);
}

test('F10: saves and an open fill Open recent; an entry opens; a missing one leaves; Clear empties', async () => {
  const a11 = join(dir, 'Grade 11', 'esterification.chalk');
  const a12 = join(dir, 'Grade 12', 'esterification.chalk');
  const b = join(dir, 'R&D.chalk');
  const { app, page } = await openApp({
    launch: {
      dialogs: [
        { canceled: false, filePath: a11 },
        { canceled: false, filePath: a12 },
        { canceled: false, filePath: b },
        { canceled: false, filePaths: [a11] }, // Ctrl+O
        { response: 0 }, // the missing-file box
      ],
    },
  });
  try {
    // Nothing yet: only the disabled Clear; Open recent disabled.
    expect(await recentMenu(app)).toEqual(['file.recent.clear &Clear recently opened']);
    expect((await menuItem(app, 'file.recent')).enabled).toBe(false);

    await saveAs(app, page, goldenDoc('ethanol'), 'esterification');
    await saveAs(app, page, goldenDoc('acetic-acid'), 'esterification');
    await saveAs(app, page, goldenDoc('ammonium'), 'R&D');
    // Files open in a tab are focused, not opened (T17): close them so Open and the entries open.
    await closeAll(page);
    await page.keyboard.press('Control+o');
    await expect
      .poll(async () => serialize(await readDocument(page)))
      .toBe(readFileSync(a11, 'utf8'));
    await expect
      .poll(() => recentMenu(app))
      .toEqual([
        'file.recent.0 &1 esterification.chalk — Grade 11',
        'file.recent.1 &2 R&&D.chalk',
        'file.recent.2 &3 esterification.chalk — Grade 12',
        'file.recent.clear &Clear recently opened',
      ]);
    expect((await menuItem(app, 'file.recent')).enabled).toBe(true);

    // An entry opens its file (F3), and moves to the top.
    await clickEnabled(app, 'file.recent.2');
    await expect
      .poll(async () => serialize(await readDocument(page)))
      .toBe(readFileSync(a12, 'utf8'));
    await expect
      .poll(() => recentMenu(app))
      .toEqual([
        'file.recent.0 &1 esterification.chalk — Grade 12',
        'file.recent.1 &2 esterification.chalk — Grade 11',
        'file.recent.2 &3 R&&D.chalk',
        'file.recent.clear &Clear recently opened',
      ]);

    // A missing file: F14 "can't be found", the drawing kept, the entry gone.
    rmSync(b);
    const before = await readDocument(page);
    await clickEnabled(app, 'file.recent.2');
    await expect.poll(async () => (await dialogLog(app)).length).toBe(5);
    expect((await dialogLog(app))[4]?.options).toMatchObject({
      type: 'error',
      message: "“R&D.chalk” can't be found.",
      detail: 'It may have been moved, renamed or deleted.',
    });
    await expect
      .poll(() => recentMenu(app))
      .toEqual([
        'file.recent.0 &1 esterification.chalk — Grade 12',
        'file.recent.1 &2 esterification.chalk — Grade 11',
        'file.recent.clear &Clear recently opened',
      ]);
    expect(await readDocument(page)).toEqual(before);

    // Clear empties the submenu; both items disabled.
    await clickEnabled(app, 'file.recent.clear');
    await expect.poll(() => recentMenu(app)).toEqual(['file.recent.clear &Clear recently opened']);
    expect((await menuItem(app, 'file.recent')).enabled).toBe(false);
    expect((await menuItem(app, 'file.recent.clear')).enabled).toBe(false);
  } finally {
    await app.close();
  }
});
