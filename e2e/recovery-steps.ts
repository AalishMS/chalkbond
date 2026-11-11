// Recovery e2e steps (A14; SPEC-app-shell.md RC1–RC5, SC7). A launch draws, waits until the
// recovery file exists, checks the network counter, then kills the process; nothing queries the
// dead app afterwards. Relaunches reuse the same user-data folder.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type ElectronApplication, type Page } from '@playwright/test';
import type { Doc } from '../src/core/doc-model';
import { expectNoNetwork, insertName, isRunning, openApp, readDocument } from './harness';
import type { LaunchOptions } from './launch';

export const recoveryFile = (userData: string): string =>
  join(userData, 'recovery', 'drawing.chalk');
export const recoveryMeta = (userData: string): string =>
  join(userData, 'recovery', 'recovery.json');

/** RC3 (A11): the box main shows, as the stubbed `showMessageBox` received it. */
export const RECOVER_BOX = {
  type: 'info',
  title: 'Chalkbond',
  message: 'Chalkbond closed before your drawing was saved.',
  detail: "Do you want to recover it? If you delete it, it can't be brought back.",
  buttons: ['Recover', 'Delete'],
  defaultId: 0,
  cancelId: 0,
  noLink: true,
};
export const RECOVER = { response: 0, checkboxChecked: false };
export const DELETE = { response: 1, checkboxChecked: false };

/** Launches with `userData` (and the given options), the test hook ready. */
export async function launchIn(
  userData: string,
  launch: LaunchOptions = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  const opened = await openApp({ launch: { ...launch, userData } });
  await opened.page.waitForFunction(() => '__chalkbondTest' in window);
  return opened;
}

/**
 * Inserts `name` by the name field, waits (≤ 12 s, RC1's 10 s and a margin) until the recovery file
 * exists, asserts no blocked request, then kills the process (no close event, no clear).
 */
export async function drawThenKill(userData: string, name: string): Promise<Doc> {
  const { app, page } = await launchIn(userData);
  await insertName(page, name);
  const doc = await readDocument(page);
  await expect.poll(() => existsSync(recoveryFile(userData)), { timeout: 12_000 }).toBe(true);
  await expectNoNetwork(app);
  // Playwright starts Electron through a shell on Windows, so `app.process()` is that wrapper
  // there and killing it leaves the app alive (it keeps the single-instance lock and the folder).
  // The pid taken inside the app is the real main process on every platform.
  const mainPid = await app.evaluate(() => process.pid);
  const wrapperExited = new Promise<void>((resolve) => app.process().once('exit', () => resolve()));
  process.kill(mainPid, 'SIGKILL');
  await wrapperExited;
  await expect.poll(() => isRunning(mainPid), { timeout: 10_000 }).toBe(false);
  return doc;
}

/** A real close of the first window (F13), awaited until the app process has exited. */
export async function closeWindowForReal(app: ElectronApplication): Promise<void> {
  await expectNoNetwork(app);
  const exited = new Promise<void>((resolve) => app.process().once('exit', () => resolve()));
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close();
  });
  await exited;
}
