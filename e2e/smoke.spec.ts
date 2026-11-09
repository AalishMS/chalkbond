import { expect, test } from '@playwright/test';
import { launchApp } from './launch';

test('launches one secure window titled Chalkbond', async () => {
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    await expect(page).toHaveTitle('Chalkbond');
    await expect(page.getByTestId('canvas-area')).toBeVisible();

    // Preload exposes only the typed API; no Node in the page.
    const pageGlobals = await page.evaluate(() => ({
      platform: window.chalkbond.platform,
      hasRequire: typeof (globalThis as { require?: unknown }).require !== 'undefined',
      hasProcess: typeof (globalThis as { process?: unknown }).process !== 'undefined',
    }));
    expect(pageGlobals.platform).toBe(process.platform);
    expect(pageGlobals.hasRequire).toBe(false);
    expect(pageGlobals.hasProcess).toBe(false);

    const prefs = await app.evaluate(({ BrowserWindow }) => {
      const wins = BrowserWindow.getAllWindows();
      // getLastWebPreferences exists at runtime but is missing from Electron's typings.
      const wc = wins[0]?.webContents as unknown as
        { getLastWebPreferences(): Electron.WebPreferences } | undefined;
      const p = wc?.getLastWebPreferences();
      return {
        count: wins.length,
        contextIsolation: p?.contextIsolation,
        sandbox: p?.sandbox,
        nodeIntegration: p?.nodeIntegration,
      };
    });
    expect(prefs).toEqual({
      count: 1,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    });
  } finally {
    await app.close();
  }
});
