import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import { parse, type Doc } from '../src/core/doc-model';
import { launchApp } from './launch';

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
export async function openApp(opts: { size?: Size } = {}): Promise<OpenedApp> {
  if (!existsSync(resolve(ROOT, 'out/main/index.js'))) {
    throw new Error('The app is not built: run npm run build first (npm run shots does it).');
  }
  const size = opts.size ?? [1280, 800];
  const app = await launchApp(['--force-device-scale-factor=1']);
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

/**
 * Puts a document into the running editor, as the host's `load` does. The spec allows no
 * test-only global, so the controller is found through React's fiber: the `Editor` element is
 * the parent of the `.editor` root and holds `controller` in its props.
 */
export async function loadDocument(page: Page, doc: Doc): Promise<void> {
  await page.evaluate((payload) => {
    interface Fiber {
      return: Fiber | null;
      memoizedProps: unknown;
    }
    const root = document.querySelector('.editor');
    if (!root) throw new Error('no editor root');
    const key = Object.keys(root).find((k) => k.startsWith('__reactFiber$'));
    if (key === undefined) throw new Error('no React fiber on the editor root');
    let fiber: Fiber | null = (root as unknown as Record<string, Fiber>)[key] ?? null;
    for (; fiber; fiber = fiber.return) {
      const props = fiber.memoizedProps as { controller?: { load?: (d: unknown) => void } } | null;
      if (props?.controller && typeof props.controller.load === 'function') {
        props.controller.load(payload);
        return;
      }
    }
    throw new Error('no controller in the React tree');
  }, doc);
}

/** The editor's current document, read through the controller as the host's `getDoc` does. */
export async function readDocument(page: Page): Promise<Doc> {
  return page.evaluate(() => {
    interface Fiber {
      return: Fiber | null;
      memoizedProps: unknown;
    }
    const root = document.querySelector('.editor');
    if (!root) throw new Error('no editor root');
    const key = Object.keys(root).find((k) => k.startsWith('__reactFiber$'));
    if (key === undefined) throw new Error('no React fiber on the editor root');
    let fiber: Fiber | null = (root as unknown as Record<string, Fiber>)[key] ?? null;
    for (; fiber; fiber = fiber.return) {
      const props = fiber.memoizedProps as { controller?: { getDoc?: () => unknown } } | null;
      if (props?.controller && typeof props.controller.getDoc === 'function') {
        return props.controller.getDoc() as never;
      }
    }
    throw new Error('no controller in the React tree');
  });
}

/** Types `text` into the name field and presses Enter (the field keeps focus after an insert). */
export async function insertName(page: Page, text: string): Promise<void> {
  const input = page.getByTestId('namefield-input');
  await input.click();
  await input.fill(text);
  await page.keyboard.press('Enter');
}

/**
 * Where a document point (BLU) is on the page, in client px: the canvas origin plus the content
 * layer's `matrix(k 0 0 k x y)` applied to the point in pt (`bondLength` pt per BLU, 40 for the
 * Slides preset).
 */
export async function canvasPoint(
  page: Page,
  blu: { x: number; y: number },
  bondLength = 40,
): Promise<{ x: number; y: number }> {
  const attr = await page.locator('[data-layer="content"]').getAttribute('transform');
  const m = /^matrix\(([^ ]+) 0 0 ([^ ]+) ([^ ]+) ([^)]+)\)$/.exec(attr ?? '');
  if (!m) throw new Error(`unexpected content transform ${attr}`);
  const canvas = await page.getByTestId('canvas').boundingBox();
  if (!canvas) throw new Error('canvas has no box');
  const k = Number(m[1]);
  return {
    x: canvas.x + Number(m[3]) + blu.x * bondLength * k,
    y: canvas.y + Number(m[4]) + blu.y * bondLength * k,
  };
}

/** What the host seam reported through `subscribe`, as `listenEvents` collected it. */
export type SeamEvent =
  | { type: string }
  | { type: 'context-menu'; target: { kind: string; id: string } | null; screen: Point };
type Point = { x: number; y: number };

/**
 * Subscribes to the controller as a host would and keeps what it hears; read it with
 * `heardEvents`. The collection lives in the page under a name only this helper uses.
 */
export async function listenEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    interface Fiber {
      return: Fiber | null;
      memoizedProps: unknown;
    }
    interface Listening {
      subscribe?: (listener: (e: unknown) => void) => () => void;
    }
    const root = document.querySelector('.editor');
    if (!root) throw new Error('no editor root');
    const key = Object.keys(root).find((k) => k.startsWith('__reactFiber$'));
    if (key === undefined) throw new Error('no React fiber on the editor root');
    let fiber: Fiber | null = (root as unknown as Record<string, Fiber>)[key] ?? null;
    for (; fiber; fiber = fiber.return) {
      const props = fiber.memoizedProps as { controller?: Listening } | null;
      const subscribe = props?.controller?.subscribe;
      if (typeof subscribe === 'function') {
        const heard: unknown[] = [];
        (window as unknown as { heardByHarness: unknown[] }).heardByHarness = heard;
        subscribe.call(props?.controller, (e) => heard.push(e));
        return;
      }
    }
    throw new Error('no controller in the React tree');
  });
}

/** The events `listenEvents` has collected so far. */
export async function heardEvents(page: Page): Promise<SeamEvent[]> {
  return page.evaluate(
    () => (window as unknown as { heardByHarness: SeamEvent[] }).heardByHarness ?? [],
  );
}
