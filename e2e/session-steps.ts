// Session-store e2e steps (SPEC-app-shell.md SS2-SS7, SS10; R35). A launch draws, waits until the
// active tab's record in `userData/session/tabs/` holds the drawing, checks the network counter,
// then kills the process; nothing queries the dead app afterwards. Relaunches reuse the same
// user-data folder. Records are read as the renderer writes them (SS3): the drawing is the
// `.chalk` text in `editor.file`.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type ElectronApplication, type Page } from '@playwright/test';
import { parse, type Doc } from '../src/core/doc-model';
import {
  expectNoNetwork,
  insertName,
  isRunning,
  openApp,
  readDocument,
  readTabs,
  type HookTab,
} from './harness';
import type { LaunchOptions } from './launch';

export const sessionFolder = (userData: string): string => join(userData, 'session');
export const recordFile = (userData: string, tabId: string): string =>
  join(sessionFolder(userData), 'tabs', `${tabId}.json`);
export const indexFile = (userData: string): string => join(sessionFolder(userData), 'index.json');

/** The drawing in tab `tabId`'s record, or null while there is none (or it is not a record). */
export function recordDoc(userData: string, tabId: string): Doc | null {
  const file = recordFile(userData, tabId);
  if (!existsSync(file)) return null;
  try {
    const record = JSON.parse(readFileSync(file, 'utf8')) as { editor?: { file?: unknown } };
    const parsed = parse(String(record.editor?.file));
    return parsed.ok ? parsed.value : null;
  } catch {
    return null;
  }
}

/** The ids of the records in the store (no temp files). */
export function recordIds(userData: string): string[] {
  const folder = join(sessionFolder(userData), 'tabs');
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => /^[0-9a-f-]{36}\.json$/.test(name))
    .map((name) => name.slice(0, -'.json'.length))
    .sort();
}

/** The active tab, through the test hook. */
export async function activeTabOf(page: Page): Promise<HookTab> {
  const tab = (await readTabs(page)).find((t) => t.active);
  if (tab === undefined) throw new Error('no active tab');
  return tab;
}

/** Launches with `userData` (and the given options), the test hook ready. */
export async function launchIn(
  userData: string,
  launch: LaunchOptions = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  const opened = await openApp({ launch: { ...launch, userData } });
  await opened.page.waitForFunction(() => '__chalkbondTest' in window);
  return opened;
}

/** Waits (at most `timeout` ms) until the active tab's record holds the drawing on screen. */
export async function expectRecorded(
  page: Page,
  userData: string,
  timeout = 12_000,
): Promise<{ tabId: string; doc: Doc }> {
  const tabId = (await activeTabOf(page)).id;
  const doc = await readDocument(page);
  await expect
    .poll(() => recordDoc(userData, tabId)?.atoms ?? null, { timeout })
    .toEqual(doc.atoms);
  return { tabId, doc };
}

/** Kills the app's main process (no close event, no flush) and waits until it is gone. */
export async function kill(app: ElectronApplication): Promise<void> {
  await expectNoNetwork(app);
  // Playwright starts Electron through a shell on Windows, so `app.process()` is that wrapper
  // there and killing it leaves the app alive (it keeps the single-instance lock and the folder).
  // The pid taken inside the app is the real main process on every platform.
  const mainPid = await app.evaluate(() => process.pid);
  const wrapperExited = new Promise<void>((resolve) => app.process().once('exit', () => resolve()));
  process.kill(mainPid, 'SIGKILL');
  await wrapperExited;
  await expect.poll(() => isRunning(mainPid), { timeout: 10_000 }).toBe(false);
}

/**
 * Inserts `name` by the name field, waits (≤ 12 s: AS2's 10 s cap and a margin) until the active
 * tab's record holds it, asserts no blocked request, then kills the process.
 */
export async function drawThenKill(
  userData: string,
  name: string,
): Promise<{ tabId: string; doc: Doc }> {
  const { app, page } = await launchIn(userData);
  let recorded: { tabId: string; doc: Doc };
  try {
    await insertName(page, name);
    recorded = await expectRecorded(page, userData);
  } catch (error) {
    await app.close();
    throw error;
  }
  await kill(app);
  return recorded;
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
