// Session-store e2e steps (SPEC-app-shell.md SS2-SS7, SS10; R35). A launch draws, waits until the
// active tab's record in `userData/session/tabs/` holds the drawing, checks the network counter,
// then kills the process; nothing queries the dead app afterwards. Relaunches reuse the same
// user-data folder. Records are read as the renderer writes them (SS3): the drawing is the
// `.chalk` text in `editor.file`.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readdirSync, readFileSync } from 'node:fs';
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

// ---- TB28: the index, the main hold, an unwritable store, undo-step counts ---------------------

/** A tab entry of `index.json` as main writes it (SS3). */
export interface IndexTab {
  id: string;
  kind: 'untitled' | 'chalk' | 'picture' | 'kept';
  name: string;
  path: string | null;
  fileHash: string | null;
  written: string | null;
  writing: string | null;
  unsaved: boolean;
  warning: boolean;
  view: { zoom: number; centre: { x: number; y: number } } | null;
}

/** `userData/session/index.json` parsed, or null while there is none (or it does not parse). */
export function readIndex(
  userData: string,
): { tabs: IndexTab[]; active: string; discarded: string[] } | null {
  const file = indexFile(userData);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as {
      tabs: IndexTab[];
      active: string;
      discarded: string[];
    };
  } catch {
    return null;
  }
}

/** Names in `userData/session/damaged/` (SS11), sorted. */
export function damagedNames(userData: string): string[] {
  const folder = join(sessionFolder(userData), 'damaged');
  return existsSync(folder) ? readdirSync(folder).sort() : [];
}

/** Where main's test hold stops the session store's chain (TH7): after a record or after a file write. */
export type HoldPoint = 'record-written' | 'file-written';

/**
 * Arms main's test hold (TH7, `__chalkbondTestMain.hold`) for `tabId`: the chain stops at `point`
 * the next time it gets there, and `heldCount` says that it did. Main honours it only for an
 * unpackaged build started with `--chalkbond-test-hooks`.
 */
export async function holdStore(
  app: ElectronApplication,
  point: HoldPoint,
  tabId: string,
): Promise<void> {
  await app.evaluate(
    (_electron, hold) => {
      const main = (globalThis as { __chalkbondTestMain?: { hold?: unknown } }).__chalkbondTestMain;
      if (main === undefined) throw new Error('no __chalkbondTestMain');
      main.hold = hold;
    },
    { point, tabId, reached: 0 },
  );
}

/** How often the chain has reached the armed hold (0 when none is armed). */
export const heldCount = (app: ElectronApplication): Promise<number> =>
  app.evaluate(
    () =>
      (globalThis as { __chalkbondTestMain?: { hold?: { reached?: number } } }).__chalkbondTestMain
        ?.hold?.reached ?? 0,
  );

/** The `n` objects of `text` (one commit each) added to the active drawing through the hook. */
export async function addSteps(page: Page, n: number, text = 'methane'): Promise<void> {
  const before = Object.keys((await readDocument(page)).atoms).length;
  await page.evaluate(
    ({ count, name }) => {
      const hook = (
        window as unknown as {
          __chalkbondTest: { run(cmd: { type: 'insert-text'; text: string }): void };
        }
      ).__chalkbondTest;
      for (let i = 0; i < count; i++) hook.run({ type: 'insert-text', text: name });
    },
    { count: n, name: text },
  );
  await expect
    .poll(async () => Object.keys((await readDocument(page)).atoms).length)
    .toBe(before + n);
}

/**
 * How many redo steps and then how many undo steps the active tab holds: each is run until the
 * drawing stops changing. Leaves the tab fully undone (redo steps then exist), so read it last.
 */
export async function countSteps(page: Page): Promise<{ redo: number; undo: number }> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as {
        __chalkbondTest: { run(cmd: 'undo' | 'redo'): void; getDoc(): unknown };
      }
    ).__chalkbondTest;
    const steps = (cmd: 'undo' | 'redo'): number => {
      let n = 0;
      for (;;) {
        const before = hook.getDoc();
        hook.run(cmd);
        if (hook.getDoc() === before) return n;
        n++;
      }
    };
    const redo = steps('redo');
    const undo = steps('undo');
    return { redo, undo };
  });
}

/**
 * R51 / SS6: makes `userData/session` unwritable (a deny ACE with `icacls` on Windows, mode 0500 on
 * `tabs/` elsewhere) and returns the function that undoes it. The folder must exist.
 */
export function lockSession(userData: string): () => void {
  const sessionDir = sessionFolder(userData);
  const win = process.platform === 'win32';
  const user = `${process.env['USERDOMAIN'] ?? ''}\\${process.env['USERNAME'] ?? ''}`;
  if (win) {
    execFileSync('icacls', [sessionDir, '/deny', `${user}:(OI)(CI)(W,DC)`], { stdio: 'ignore' });
  } else {
    chmodSync(join(sessionDir, 'tabs'), 0o500);
  }
  return () => {
    try {
      if (win) execFileSync('icacls', [sessionDir, '/remove:d', user], { stdio: 'ignore' });
      else chmodSync(join(sessionDir, 'tabs'), 0o700);
    } catch {
      // The folder may be gone already.
    }
  };
}
