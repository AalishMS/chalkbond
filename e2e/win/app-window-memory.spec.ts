// A10 W2 on a real desktop (Windows only, R10): the headless Linux backend reports a 1 × 1 work
// area, so the todo's rectangle can only be checked here. setBounds, a real close, a relaunch with
// the same user-data folder: equal normal bounds; then maximized restored over them.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { closeForReal, launchWith, windowState } from '../relaunch';

test('W2: setBounds(100, 80, 1100, 760), close, relaunch: equal normal bounds; maximize kept', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'chalkbond-e2e-window-'));
  const wanted = { x: 100, y: 80, width: 1100, height: 760 };
  try {
    let { app } = await launchWith(userData);
    await app.evaluate(({ BrowserWindow }, b) => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.unmaximize();
      win?.setBounds(b);
    }, wanted);
    await expect.poll(async () => (await windowState(app))?.normal).toEqual(wanted);
    await closeForReal(app);
    ({ app } = await launchWith(userData));
    expect(await windowState(app)).toEqual({ normal: wanted, maximized: false });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.maximize());
    await expect.poll(async () => (await windowState(app))?.maximized).toBe(true);
    await closeForReal(app);
    ({ app } = await launchWith(userData));
    try {
      expect(await windowState(app)).toEqual({ normal: wanted, maximized: true });
    } finally {
      await closeForReal(app);
    }
  } finally {
    rmSync(userData, { recursive: true, force: true });
  }
});
