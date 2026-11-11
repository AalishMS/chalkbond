// Close-and-relaunch helpers for settings tests (A10). launch.ts's teardown destroys windows, which
// skips the close event and the settings flush; these close for real (F13) and wait for the exit.
import { expect, type ElectronApplication, type Page } from '@playwright/test';
import { expectNoNetwork, resizeContent, type Size } from './harness';
import { launchApp, type LaunchOptions } from './launch';

export type Bounds = { x: number; y: number; width: number; height: number };

export const windowTitle = (app: ElectronApplication): Promise<string> =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle() ?? '');

/**
 * Launches with `userData` and waits until the renderer sent its first N1 (main intercepts a close
 * from then on). `size` sets the content size first (leave it out to keep the restored bounds).
 */
export async function launchWith(
  userData: string,
  opts: { size?: Size; launch?: LaunchOptions } = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await launchApp({ ...opts.launch, userData });
  const page = await app.firstWindow();
  await page.waitForLoadState('load');
  if (opts.size) {
    const size = opts.size;
    await resizeContent(app, size);
    await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, size);
  }
  await page.waitForFunction(() => '__chalkbondTest' in window);
  await expect.poll(() => windowTitle(app)).toMatch(/Chalkbond$/);
  return { app, page };
}

/** A real close (F13 with a clean drawing), awaited until the app has exited. */
export async function closeForReal(app: ElectronApplication): Promise<void> {
  await expectNoNetwork(app);
  const exited = app.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await exited;
}

export const windowState = (
  app: ElectronApplication,
): Promise<{ normal: Bounds; maximized: boolean } | undefined> =>
  app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win && { normal: win.getNormalBounds(), maximized: win.isMaximized() };
  });

export const workArea = (app: ElectronApplication): Promise<Bounds> =>
  app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
