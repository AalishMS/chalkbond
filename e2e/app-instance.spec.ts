// A15 single instance (SPEC-app-shell.md F11; SC8, SC4 second-instance part): a second app process
// with the same user-data folder hands its file to the first window and exits with code 0. Both
// processes are launched through e2e/launch.ts (the OS-mouse guard included).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication } from '@playwright/test';
import { serialize } from '../src/core/doc-model';
import { goldenDoc, insertName, readDocument } from './harness';
import { launchSecondInstance } from './launch';
import { launchIn } from './recovery-steps';
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

test("SC8, SC4: a second launch with a .chalk exits 0; the first window restores, prompts, and opens it after Don't save", async () => {
  const file = join(dir, 'ethanol.chalk');
  writeFileSync(file, serialize(goldenDoc('ethanol')));
  const { app, page } = await launchIn(userData, { dialogs: [{ response: 1 }] });
  try {
    await insertName(page, 'benzene');
    await expect.poll(() => windowTitle(app)).toBe('*Untitled - Chalkbond');
    await watchWindow(app);
    const second = await launchSecondInstance({ userData, extraArgs: [file] });
    expect(second).toEqual({ code: 0, signal: null });
    await expect.poll(() => windowTitle(app)).toBe('ethanol - Chalkbond');
    expect((await readDocument(page)).atoms).toEqual(goldenDoc('ethanol').atoms);
    expect((await dialogLog(app)).map((d) => d.options)).toEqual([
      {
        type: 'warning',
        title: 'Chalkbond',
        message: 'Do you want to save changes to “Untitled”?',
        detail: "If you don't save, your changes will be lost.",
        buttons: ['Save', "Don't save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      },
    ]);
    expect(await windowCalls(app)).toEqual(['restore', 'focus']);
    expect(await windowCount(app)).toBe(1);
  } finally {
    await app.close();
  }
});

test('F11: Cancel at the prompt keeps the drawing; a second launch without a file only focuses', async () => {
  const file = join(dir, 'ethanol.chalk');
  writeFileSync(file, serialize(goldenDoc('ethanol')));
  const { app, page } = await launchIn(userData, { dialogs: [{ response: 2 }] });
  try {
    await insertName(page, 'benzene');
    const drawn = await readDocument(page);
    expect(await launchSecondInstance({ userData, extraArgs: [file] })).toEqual({
      code: 0,
      signal: null,
    });
    await expect.poll(async () => (await dialogLog(app)).length).toBe(1);
    await watchWindow(app);
    expect(await launchSecondInstance({ userData, extraArgs: [join(dir, 'notes.docx')] })).toEqual({
      code: 0,
      signal: null,
    });
    await expect.poll(() => windowCalls(app)).toEqual(['restore', 'focus']);
    expect(await windowTitle(app)).toBe('*Untitled - Chalkbond');
    expect(await readDocument(page)).toEqual(drawn);
    expect(await dialogLog(app)).toHaveLength(1);
    expect(await windowCount(app)).toBe(1);
  } finally {
    await app.close();
  }
});
