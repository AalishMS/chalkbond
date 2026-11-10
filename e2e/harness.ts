import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
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
