import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { expectBlockedRequests, launchApp } from './launch';

test('named bridge logs errors and denies windows and permissions', async () => {
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    expect(await page.evaluate(() => Object.keys(window.chalkbond).sort())).toEqual([
      'ask',
      'chooseOpen',
      'chooseSave',
      'clipboardRead',
      'clipboardWrite',
      'closeOk',
      'logError',
      'onMainEvent',
      'platform',
      'readFile',
      'sessionFile',
      'showFileError',
      'startup',
      'updateSession',
      'writeFile',
    ]);
    expect(await page.evaluate(() => Notification.requestPermission())).toBe('denied');
    const prefs = await app.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0]?.webContents as unknown as {
        getLastWebPreferences(): Electron.WebPreferences;
      };
      const p = contents.getLastWebPreferences();
      return {
        sandbox: p.sandbox,
        contextIsolation: p.contextIsolation,
        nodeIntegration: p.nodeIntegration,
        webSecurity: p.webSecurity,
        webviewTag: p.webviewTag,
        devTools: contents.getLastWebPreferences().devTools !== false,
      };
    });
    expect(prefs).toEqual({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
      devTools: true,
    });
    await page.evaluate(() => window.chalkbond.logError('security-test-marker'));
    const logPath = await app.evaluate(({ app }) => app.getPath('userData') + '/logs/main.log');
    await expect
      .poll(() => readFileSync(logPath, 'utf8'))
      .toContain('renderer security-test-marker');
    const original = page.url();
    await app.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0]?.webContents;
      contents?.executeJavaScript("location.href = 'https://example.com'").catch(() => undefined);
    });
    await expect(page).toHaveURL(original);
    await page.evaluate(() => {
      window.open('https://example.com');
    });
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  } finally {
    await app.close();
  }
});

test('SEC4 counts a deliberately blocked nonlocal request', async () => {
  const app = await launchApp();
  expectBlockedRequests(app, 1);
  try {
    const page = await app.firstWindow();
    expect(
      await page.evaluate(() =>
        fetch('https://example.com').then(
          () => false,
          () => true,
        ),
      ),
    ).toBe(true);
    // The page CSP denies fetch before webRequest. Probe the same session filter directly too.
    const result = await app.evaluate(async ({ session }) =>
      session.defaultSession.fetch('https://example.com').then(
        () => false,
        () => true,
      ),
    );
    expect(result).toBe(true);
  } finally {
    await app.close();
  }
});
