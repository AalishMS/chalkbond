// A15 single instance (SPEC-app-shell.md F11, R37, T17; SC8): a second app process
// with the same user-data folder hands its file to the first window (a new tab, or the tab that
// already holds it) and exits with code 0. Both
// processes are launched through e2e/launch.ts (the OS-mouse guard included).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication } from '@playwright/test';
import { serialize } from '../src/core/doc-model';
import {
  activateTab,
  expectNoNetwork,
  goldenDoc,
  insertName,
  openTab,
  readDocument,
  readTabs,
} from './harness';
import { launchSecondInstance } from './launch';
import { launchIn } from './session-steps';
import { windowTitle } from './relaunch';

type DialogLog = { method: string; options: Record<string, unknown> }[];
const dialogLog = async (app: ElectronApplication): Promise<DialogLog> =>
  (await app.evaluate(
    () => (globalThis as { __chalkbondDialogLog?: DialogLog }).__chalkbondDialogLog ?? [],
  )) as DialogLog;
const windowCount = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);

let dir: string;
let userData: string;
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chalkbond-instance-'));
  userData = mkdtempSync(join(tmpdir(), 'chalkbond-instance-data-'));
});
test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(userData, { recursive: true, force: true });
});

/** Records restore and focus on the first window, which reports itself minimized. */
async function watchWindow(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('no window');
    const calls: string[] = [];
    (globalThis as { __windowCalls?: string[] }).__windowCalls = calls;
    let minimized = true;
    win.isMinimized = () => minimized;
    win.restore = () => {
      minimized = false;
      calls.push('restore');
    };
    const focus = win.focus.bind(win);
    win.focus = () => {
      calls.push('focus');
      focus();
    };
  });
}
const windowCalls = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as { __windowCalls?: string[] }).__windowCalls ?? []);

test('SC8, R37: a second launch with a .chalk exits 0; the first window restores and opens it in a new tab, no box', async () => {
  const file = join(dir, 'ethanol.chalk');
  writeFileSync(file, serialize(goldenDoc('ethanol')));
  const { app, page } = await launchIn(userData, { dialogs: [] });
  try {
    await insertName(page, 'benzene');
    await expect.poll(() => windowTitle(app)).toBe('*Untitled - Chalkbond');
    const drawn = await readDocument(page);
    await watchWindow(app);
    const second = await launchSecondInstance({ userData, extraArgs: [file] });
    expect(second).toEqual({ code: 0, signal: null });
    await expect.poll(() => windowTitle(app)).toBe('ethanol - Chalkbond');
    expect((await readDocument(page)).atoms).toEqual(goldenDoc('ethanol').atoms);
    expect((await readTabs(page)).map((t) => [t.label, t.active])).toEqual([
      ['Untitled', false],
      ['ethanol', true],
    ]);
    expect(await dialogLog(app)).toEqual([]);
    expect(await windowCalls(app)).toEqual(['restore', 'focus']);
    expect(await windowCount(app)).toBe(1);
    // The Untitled tab kept its drawing.
    await activateTab(page, (await readTabs(page))[0]?.id ?? '');
    expect((await readDocument(page)).atoms).toEqual(drawn.atoms);
  } finally {
    await app.close();
  }
});

test('T17, F11: a second launch with a file open in a tab focuses that tab; without a file it only focuses the window', async () => {
  const file = join(dir, 'ethanol.chalk');
  writeFileSync(file, serialize(goldenDoc('ethanol')));
  const { app, page } = await launchIn(userData, { dialogs: [], extraArgs: [file] });
  try {
    await expect.poll(() => windowTitle(app)).toBe('ethanol - Chalkbond');
    await openTab(page);
    await insertName(page, 'benzene');
    await expect.poll(() => windowTitle(app)).toBe('*Untitled - Chalkbond');
    expect(await launchSecondInstance({ userData, extraArgs: [file] })).toEqual({
      code: 0,
      signal: null,
    });
    await expect.poll(() => windowTitle(app)).toBe('ethanol - Chalkbond');
    expect((await readTabs(page)).map((t) => t.label)).toEqual(['ethanol', 'Untitled']);
    await watchWindow(app);
    expect(await launchSecondInstance({ userData, extraArgs: [join(dir, 'notes.docx')] })).toEqual({
      code: 0,
      signal: null,
    });
    await expect.poll(() => windowCalls(app)).toEqual(['restore', 'focus']);
    expect(await windowTitle(app)).toBe('ethanol - Chalkbond');
    expect((await readTabs(page)).map((t) => t.label)).toEqual(['ethanol', 'Untitled']);
    expect(await dialogLog(app)).toEqual([]);
    expect(await windowCount(app)).toBe(1);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});
