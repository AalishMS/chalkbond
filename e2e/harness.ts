import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, type ElectronApplication, type Page } from '@playwright/test';
import { parse, type Doc } from '../src/core/doc-model';
import { launchApp, type LaunchOptions } from './launch';

const ROOT = resolve(__dirname, '..');

export type Size = [number, number];

export interface OpenedApp {
  app: ElectronApplication;
  page: Page;
}

/** Sets the window's content (page) size; the page is that size because there is no menu bar. */
export async function resizeContent(app: ElectronApplication, size: Size): Promise<void> {
  await app.evaluate(({ BrowserWindow }, [w, h]) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(w, h);
  }, size);
}

/**
 * Launches the built app at a fixed device scale factor and content size (default 1280x800)
 * and waits until the page has that size and has loaded.
 */
export async function openApp(
  opts: { size?: Size; launch?: LaunchOptions } = {},
): Promise<OpenedApp> {
  if (!existsSync(resolve(ROOT, 'out/main/index.js'))) {
    throw new Error('The app is not built: run npm run build first (npm run shots does it).');
  }
  const size = opts.size ?? [1280, 800];
  const app = await launchApp({
    ...opts.launch,
    extraArgs: ['--force-device-scale-factor=1', ...(opts.launch?.extraArgs ?? [])],
  });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('load');
    await resizeContent(app, size);
    await page.waitForFunction(
      ([w, h]) => window.innerWidth === w && window.innerHeight === h,
      size,
    );
    return { app, page };
  } catch (error) {
    await app.close();
    throw error;
  }
}

/** Saves out/shots/<taskId>/<name>.png (folders created) and returns its absolute path. */
export async function shot(page: Page, taskId: string, name: string): Promise<string> {
  const file = resolve(ROOT, 'out', 'shots', taskId, `${name}.png`);
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({ path: file });
  return file;
}

/** The frozen golden inputs of svg-render: real `.chalk` documents, e.g. `ethanol`. */
export function goldenDoc(name: string): Doc {
  const text = readFileSync(
    resolve(ROOT, 'src/core/svg-render/__golden__/inputs', `${name}.chalk`),
    'utf8',
  );
  const parsed = parse(text);
  if (!parsed.ok) throw new Error(`cannot parse golden input ${name}`);
  return parsed.value;
}

/** The page side of `src/renderer/app/model/test-hook.ts` (TH2), as the specs use it. */
interface PageHook {
  load(doc: unknown): void;
  getDoc(): unknown;
  getSelection(): { atoms: string[]; bonds: string[]; objects: string[] };
  events(): unknown[];
  clearEvents(): void;
  notices(): { kind: string; text: string }[];
  commands(): string[];
}
type HookWindow = Window & { __chalkbondTest?: PageHook };

/** Waits until the page has defined `window.__chalkbondTest` (every launch has the hook on). */
async function waitForHook(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as HookWindow).__chalkbondTest !== undefined);
}

/** Puts a document into the running editor as an Untitled document, through the test hook. */
export async function loadDocument(page: Page, doc: Doc): Promise<void> {
  await waitForHook(page);
  await page.evaluate((payload) => {
    (window as HookWindow).__chalkbondTest?.load(payload);
  }, doc);
}

/** The editor's current document, read through the test hook. */
export async function readDocument(page: Page): Promise<Doc> {
  await waitForHook(page);
  return page.evaluate(() => (window as HookWindow).__chalkbondTest?.getDoc() as never);
}

/** The ids the editor has selected, through the test hook. */
export async function readSelection(
  page: Page,
): Promise<{ atoms: string[]; bonds: string[]; objects: string[] }> {
  await waitForHook(page);
  return page.evaluate(
    () =>
      (window as HookWindow).__chalkbondTest?.getSelection() ?? {
        atoms: [],
        bonds: [],
        objects: [],
      },
  );
}

/** The host notices the test hook has collected (empty until the shell produces some). */
export async function heardNotices(page: Page): Promise<{ kind: string; text: string }[]> {
  await waitForHook(page);
  return page.evaluate(() => (window as HookWindow).__chalkbondTest?.notices() ?? []);
}

/** The `main:event` commands the test hook has collected (empty until the shell receives some). */
export async function heardCommands(page: Page): Promise<string[]> {
  await waitForHook(page);
  return page.evaluate(() => (window as HookWindow).__chalkbondTest?.commands() ?? []);
}

/** Types `text` into the name field and presses Enter (the field keeps focus after an insert). */
export async function insertName(page: Page, text: string): Promise<void> {
  const input = page.getByTestId('namefield-input');
  await input.click();
  await input.fill(text);
  await page.keyboard.press('Enter');
}

/** The content layer's viewport transform: zoom `k`, translation `e`, `f` in canvas px. */
export interface ContentView {
  k: number;
  e: number;
  f: number;
}

/** The content layer's current viewport transform (`matrix(k 0 0 k e f)`). */
export async function readContentView(page: Page): Promise<ContentView> {
  const attr = await page.locator('[data-layer="content"]').getAttribute('transform');
  const m = /^matrix\(([^ ]+) 0 0 ([^ ]+) ([^ ]+) ([^)]+)\)$/.exec(attr ?? '');
  if (!m) throw new Error(`unexpected content transform ${attr}`);
  return { k: Number(m[1]), e: Number(m[3]), f: Number(m[4]) };
}

/**
 * Where a document point (BLU) is on the page, in client px: the canvas origin plus the content
 * layer's `matrix(k 0 0 k x y)` applied to the point in pt (`bondLength` pt per BLU, 40 for the
 * Slides preset). `view` is the transform to use (one read earlier); the default is the current one.
 */
export async function canvasPoint(
  page: Page,
  blu: { x: number; y: number },
  bondLength = 40,
  view?: ContentView,
): Promise<{ x: number; y: number }> {
  const { k, e, f } = view ?? (await readContentView(page));
  const canvas = await page.getByTestId('canvas').boundingBox();
  if (!canvas) throw new Error('canvas has no box');
  return {
    x: canvas.x + e + blu.x * bondLength * k,
    y: canvas.y + f + blu.y * bondLength * k,
  };
}

/** Whether a process with this pid exists (signal 0 only checks; it sends nothing). */
export function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // ESRCH: gone. EPERM would mean it exists but is not ours to signal.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** What the host seam reported through `subscribe`, as `listenEvents` collected it. */
export type SeamEvent =
  | { type: string }
  | { type: 'context-menu'; target: { kind: string; id: string } | null; screen: Point };
type Point = { x: number; y: number };

/**
 * Starts collecting editor events afresh: the hook has heard them since start, so this clears
 * what came before; read them with `heardEvents`.
 */
export async function listenEvents(page: Page): Promise<void> {
  await waitForHook(page);
  await page.evaluate(() => {
    (window as HookWindow).__chalkbondTest?.clearEvents();
  });
}

/** The events the editor has emitted since start or the last `listenEvents`. */
export async function heardEvents(page: Page): Promise<SeamEvent[]> {
  await waitForHook(page);
  return page.evaluate(() => ((window as HookWindow).__chalkbondTest?.events() ?? []) as never);
}

/** SEC4: every launch must finish without unexpected nonlocal requests. */
export async function expectNoNetwork(app: ElectronApplication, expected = 0): Promise<void> {
  expect(
    await app.evaluate(
      () =>
        (globalThis as { __chalkbondTestMain?: { blockedRequests: number } }).__chalkbondTestMain
          ?.blockedRequests ?? 0,
    ),
  ).toBe(expected);
}
