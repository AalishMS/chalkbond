// TB30: opening files into tabs (SPEC-app-shell.md R37, T17, F2, F3, F10, F11, F12, R22). Every
// way to open (a second launch, several requests at once, Open, Open recent, a drop) adds a tab at
// the end, focuses the tab that already holds the file (compared case-insensitively on Windows),
// reuses an empty untouched Untitled tab, keeps the order in which files were asked for, and waits
// in a queue of at most 20 while a dialog is open. Nothing here asks about unsaved changes.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { drawingPayload, exportSvg, withPictureChunks } from '../src/core/clipboard-export';
import { serialize } from '../src/core/doc-model';
import { clickEnabled, menuItems } from './app-menu';
import { dropStaged, mainLog, requestOpens, stageFiles, writeChalkFiles } from './drop-steps';
import { dialogLog, openFrom } from './export-steps';
import {
  activateTab,
  expectNoNetwork,
  goldenDoc,
  insertName,
  loadDocument,
  openTab,
  readDocument,
  readTabs,
  tabKeys,
} from './harness';
import { launchSecondInstance } from './launch';
import { windowTitle } from './relaunch';
import { launchIn } from './session-steps';

const labels = async (page: Page) => (await readTabs(page)).map((t) => t.label);
const activeLabel = async (page: Page) => (await readTabs(page)).find((t) => t.active)?.label;
const windowCount = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
const atomCount = async (page: Page) => Object.keys((await readDocument(page)).atoms).length;

/** A 1x1 transparent PNG from another program, the carrier of a picture made in Chalkbond. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

let dir: string;
let userData: string;
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chalkbond-open-tabs-'));
  userData = mkdtempSync(join(tmpdir(), 'chalkbond-open-tabs-data-'));
});
test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(userData, { recursive: true, force: true });
});

test('R37, F11: a second launch with a new path opens a tab at the end and exits; one already open focuses its tab', async () => {
  const [a, b] = writeChalkFiles(dir, ['alpha', 'beta']);
  if (a === undefined || b === undefined) throw new Error('files');
  const { app, page } = await launchIn(userData, { dialogs: [] });
  try {
    await insertName(page, 'benzene'); // the Untitled tab holds a drawing: it is not reused
    const untitled = (await readTabs(page))[0]?.id ?? '';
    expect(await launchSecondInstance({ userData, extraArgs: [a] })).toEqual({
      code: 0,
      signal: null,
    });
    expect(await launchSecondInstance({ userData, extraArgs: [b] })).toEqual({
      code: 0,
      signal: null,
    });
    await expect.poll(() => labels(page)).toEqual(['Untitled', 'alpha', 'beta']);
    expect(await activeLabel(page)).toBe('beta');
    expect((await readTabs(page))[0]?.id).toBe(untitled);

    // Already open: the tab is focused, no tab is added, nothing is read again.
    expect(await launchSecondInstance({ userData, extraArgs: [a] })).toEqual({
      code: 0,
      signal: null,
    });
    await expect.poll(() => activeLabel(page)).toBe('alpha');
    expect(await labels(page)).toEqual(['Untitled', 'alpha', 'beta']);
    await expect.poll(() => windowTitle(app)).toBe('alpha - Chalkbond');

    if (process.platform === 'win32') {
      // The match is by real path, case-insensitive: BETA.CHALK is beta.chalk.
      expect(
        await launchSecondInstance({ userData, extraArgs: [join(dir, 'BETA.CHALK')] }),
      ).toEqual({ code: 0, signal: null });
      await expect.poll(() => activeLabel(page)).toBe('beta');
      expect(await labels(page)).toEqual(['Untitled', 'alpha', 'beta']);
    }
    expect(await windowCount(app)).toBe(1);
    expect(await dialogLog(app)).toEqual([]);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('R37: three requests at once (Explorer, three files selected) open three tabs in order; the empty Untitled holds the first', async () => {
  const [c, a, b] = writeChalkFiles(dir, ['third', 'first', 'second']);
  if (c === undefined || a === undefined || b === undefined) throw new Error('files');
  const { app, page } = await launchIn(userData, { dialogs: [] });
  try {
    const untitled = (await readTabs(page))[0]?.id;
    await requestOpens(app, [c, a, b]);
    await expect.poll(() => labels(page)).toEqual(['third', 'first', 'second']);
    expect(await activeLabel(page)).toBe('second');
    // The empty Untitled tab kept its id and became the first file's tab (T17).
    expect((await readTabs(page))[0]?.id).toBe(untitled);
    expect((await readTabs(page)).map((t) => t.kind)).toEqual(['chalk', 'chalk', 'chalk']);
    for (const tab of await readTabs(page)) {
      await activateTab(page, tab.id);
      expect(await atomCount(page)).toBe(3);
    }
    expect(await dialogLog(app)).toEqual([]);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('R37: the queue holds 20 waiting requests; the one after them is dropped and logged without its path', async () => {
  const names = Array.from({ length: 22 }, (_, i) => `f${String(i + 1).padStart(2, '0')}`);
  const files = writeChalkFiles(dir, names);
  const { app, page } = await launchIn(userData, { dialogs: [] });
  try {
    // One request is being delivered at once and 20 wait; the 22nd finds 20 waiting.
    await requestOpens(app, files);
    await expect.poll(async () => (await readTabs(page)).length).toBe(21);
    expect(await labels(page)).toEqual(names.slice(0, 21));
    await expect
      .poll(() => mainLog(userData))
      .toContain('Open request dropped: 20 already waiting');
    const log = mainLog(userData);
    expect(log).not.toContain(dir);
    expect(log).not.toContain('f22');
    expect(await labels(page)).not.toContain('f22');
    expect(await dialogLog(app)).toEqual([]);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('T17: only an Untitled tab with an empty drawing and no undo or redo step is reused', async () => {
  const [a, b, c] = writeChalkFiles(dir, ['alpha', 'beta', 'gamma']);
  if (a === undefined || b === undefined || c === undefined) throw new Error('files');
  const { app, page } = await launchIn(userData, { dialogs: [] });
  try {
    // A drawing that was undone is empty but has a redo step: the file gets a new tab.
    await insertName(page, 'benzene');
    await expect.poll(() => atomCount(page)).toBe(6);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+z');
    await expect.poll(() => atomCount(page)).toBe(0);
    await requestOpens(app, [a]);
    await expect.poll(() => labels(page)).toEqual(['Untitled', 'alpha']);

    // A drawing: also a new tab. The empty untouched tab beside them is used when it is active.
    await activateTab(page, (await readTabs(page))[0]?.id ?? '');
    await loadDocument(page, goldenDoc('toluene'));
    await requestOpens(app, [b]);
    await expect.poll(() => labels(page)).toEqual(['Untitled', 'alpha', 'beta']);
    await expect.poll(async () => (await tabKeys(page)).length).toBe(3); // the strip has caught up
    const fresh = await openTab(page);
    await requestOpens(app, [c]);
    await expect.poll(() => labels(page)).toEqual(['Untitled', 'alpha', 'beta', 'gamma']);
    expect((await readTabs(page))[3]?.id).toBe(fresh);
    expect(await activeLabel(page)).toBe('gamma');
    expect(await dialogLog(app)).toEqual([]);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('R37, F2, F10: Open opens a tab; a file already open focuses its tab; an Open recent entry for an open file focuses it', async () => {
  const [a, b] = writeChalkFiles(dir, ['alpha', 'beta']);
  if (a === undefined || b === undefined) throw new Error('files');
  const { app, page } = await launchIn(userData, {
    dialogs: [openFrom(a), openFrom(b), openFrom(a)],
  });
  try {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+o');
    await expect.poll(() => labels(page)).toEqual(['alpha']); // the empty Untitled held it
    await page.keyboard.press('Control+o');
    await expect.poll(() => labels(page)).toEqual(['alpha', 'beta']);
    expect(await activeLabel(page)).toBe('beta');
    // The chosen file is already open: its tab is focused, nothing is added.
    await page.keyboard.press('Control+o');
    await expect.poll(() => activeLabel(page)).toBe('alpha');
    expect(await labels(page)).toEqual(['alpha', 'beta']);
    expect((await dialogLog(app)).map((d) => d.method)).toEqual([
      'showOpenDialog',
      'showOpenDialog',
      'showOpenDialog',
    ]);

    // Open recent: the entry for beta.chalk focuses beta's tab.
    const entry = (await menuItems(app)).find(
      (i) => i.id.startsWith('file.recent.') && i.label.includes('beta.chalk'),
    );
    if (entry === undefined) throw new Error('no recent entry for beta.chalk');
    await clickEnabled(app, entry.id);
    await expect.poll(() => activeLabel(page)).toBe('beta');
    expect(await labels(page)).toEqual(['alpha', 'beta']);
    await expect.poll(() => windowTitle(app)).toBe('beta - Chalkbond');
    expect((await dialogLog(app)).length).toBe(3);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('R37: Open recent opens a closed file in a new tab', async () => {
  const [a, b] = writeChalkFiles(dir, ['alpha', 'beta']);
  if (a === undefined || b === undefined) throw new Error('files');
  const { app, page } = await launchIn(userData, { dialogs: [openFrom(a), openFrom(b)] });
  try {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+o');
    await expect.poll(() => labels(page)).toEqual(['alpha']);
    await page.keyboard.press('Control+o');
    await expect.poll(() => labels(page)).toEqual(['alpha', 'beta']);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+w'); // beta is written: it closes without a box
    await expect.poll(() => labels(page)).toEqual(['alpha']);
    const entry = (await menuItems(app)).find(
      (i) => i.id.startsWith('file.recent.') && i.label.includes('beta.chalk'),
    );
    if (entry === undefined) throw new Error('no recent entry for beta.chalk');
    await clickEnabled(app, entry.id);
    await expect.poll(() => labels(page)).toEqual(['alpha', 'beta']);
    expect(await activeLabel(page)).toBe('beta');
    expect(await atomCount(page)).toBe(3);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('F12, R37: a drop opens every file with an Open extension in drop order, each in its own tab', async () => {
  const [c, a, b, d] = writeChalkFiles(dir, ['third', 'first', 'second', 'fourth']);
  if (c === undefined || a === undefined || b === undefined || d === undefined) {
    throw new Error('files');
  }
  const notes = join(dir, 'notes.docx');
  writeFileSync(notes, 'not a drawing');
  const { app, page } = await launchIn(userData, { dialogs: [{ response: 0 }] });
  try {
    const untitled = (await readTabs(page))[0]?.id;
    // The .docx among them is ignored without a box; the empty Untitled holds the first file.
    await stageFiles(page, [c, notes, a, b]);
    await dropStaged(page);
    await expect.poll(() => labels(page)).toEqual(['third', 'first', 'second']);
    expect((await readTabs(page))[0]?.id).toBe(untitled);
    expect(await activeLabel(page)).toBe('second');
    expect(await dialogLog(app)).toEqual([]);

    // A file already open is focused, the new one opens after the others.
    await stageFiles(page, [a, d]);
    await dropStaged(page);
    await expect.poll(() => labels(page)).toEqual(['third', 'first', 'second', 'fourth']);
    expect(await activeLabel(page)).toBe('fourth');
    // Only an open file: its tab is focused and nothing is added.
    await stageFiles(page, [a]);
    await dropStaged(page);
    await expect.poll(() => activeLabel(page)).toBe('first');
    expect(await labels(page)).toEqual(['third', 'first', 'second', 'fourth']);
    expect(await dialogLog(app)).toEqual([]);

    // `unsupported` is shown only when no dropped file had an Open extension.
    await stageFiles(page, [notes]);
    await dropStaged(page);
    await expect.poll(async () => (await dialogLog(app)).length).toBe(1);
    expect((await dialogLog(app))[0]?.options['message']).toBe(
      "Chalkbond can't open “notes.docx”.",
    );
    expect(await labels(page)).toEqual(['third', 'first', 'second', 'fourth']);
    expect(await activeLabel(page)).toBe('first');
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('F12, R37: a drop opens the file running and 20 waiting; the rest are dropped and logged without a name', async () => {
  // The first file runs at once and 20 more wait (R37's queue of 20): 21 tabs; the 22nd is dropped.
  const names = Array.from({ length: 22 }, (_, i) => `d${String(i + 1).padStart(2, '0')}`);
  const files = writeChalkFiles(dir, names);
  const { app, page } = await launchIn(userData, { dialogs: [] });
  try {
    await stageFiles(page, files);
    await dropStaged(page);
    await expect.poll(async () => (await readTabs(page)).length).toBe(21);
    expect(await labels(page)).toEqual(names.slice(0, 21));
    expect(await activeLabel(page)).toBe('d21');
    await expect.poll(() => mainLog(userData)).toContain('Open request dropped: the queue is full');
    expect(mainLog(userData)).not.toContain('d22');
    expect(mainLog(userData)).not.toContain(dir);
    // Settled: the 22nd never opens.
    await page.waitForTimeout(500);
    expect(await labels(page)).toEqual(names.slice(0, 21));
    expect(await dialogLog(app)).toEqual([]);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('F3, R37: pictures made in Chalkbond open as picture tabs, each in its own tab', async () => {
  const folder = join(dir, 'Lessons');
  mkdirSync(folder);
  const toluene = goldenDoc('toluene');
  const png = join(folder, 'toluene.png');
  const svg = join(folder, 'toluene.svg');
  writeFileSync(png, withPictureChunks(PIXEL, { dpi: 300, payload: drawingPayload(toluene) }));
  writeFileSync(svg, new TextEncoder().encode(exportSvg(toluene, null).svg));
  const { app, page } = await launchIn(userData, { dialogs: [] });
  try {
    await insertName(page, 'ethanol');
    await requestOpens(app, [png, svg]);
    await expect.poll(async () => (await readTabs(page)).length).toBe(3);
    const tabs = await readTabs(page);
    expect(tabs.map((t) => t.kind)).toEqual(['untitled', 'picture', 'picture']);
    expect(tabs.map((t) => t.label)).toEqual(['Untitled', 'toluene.png', 'toluene.svg']);
    expect(await activeLabel(page)).toBe('toluene.svg');
    expect(serialize(await readDocument(page))).toBe(serialize(toluene));
    // An already open picture is focused, not opened again.
    await requestOpens(app, [png]);
    await expect.poll(() => activeLabel(page)).toBe('toluene.png');
    expect((await readTabs(page)).length).toBe(3);
    expect(await dialogLog(app)).toEqual([]);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('R22, R37: opens that arrive while Export or Keyboard shortcuts is open wait, leave the dialog alone, then open in order', async () => {
  const [a, b, c, d] = writeChalkFiles(dir, ['alpha', 'beta', 'gamma', 'delta']);
  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    throw new Error('files');
  }
  const { app, page } = await launchIn(userData, { dialogs: [] });
  try {
    await loadDocument(page, goldenDoc('toluene'));
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+e');
    await expect(page.getByTestId('export-dialog')).toBeVisible();
    await requestOpens(app, [a, b]);
    await page.waitForTimeout(500); // an (unwanted) open would have happened by now
    await expect(page.getByTestId('export-dialog')).toBeVisible();
    expect(await labels(page)).toEqual(['Untitled']);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('export-dialog')).toHaveCount(0);
    await expect.poll(() => labels(page)).toEqual(['Untitled', 'alpha', 'beta']);
    expect(await activeLabel(page)).toBe('beta');

    await page.getByTestId('canvas').focus();
    await page.keyboard.press('F1');
    await expect(page.getByTestId('shortcuts-dialog')).toBeVisible();
    await requestOpens(app, [c, d]);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('shortcuts-dialog')).toBeVisible();
    expect(await labels(page)).toEqual(['Untitled', 'alpha', 'beta']);
    await page.getByTestId('shortcuts-dialog').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('shortcuts-dialog')).toHaveCount(0);
    await expect.poll(() => labels(page)).toEqual(['Untitled', 'alpha', 'beta', 'gamma', 'delta']);
    expect(await activeLabel(page)).toBe('delta');
    expect(await dialogLog(app)).toEqual([]);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});
