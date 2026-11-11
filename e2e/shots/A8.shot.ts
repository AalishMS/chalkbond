// A8 shot (tasks/todo-app-shell.md): the scheme saved with Ctrl+S through the stubbed Save dialog;
// the status bar shows N-A1 "Saved esterification.chalk." as an info hint (A17's row, no icon).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { heardNotices, openApp, shot } from '../harness';
import { loadScheme } from '../fixtures';

const away = { x: 640, y: 760 }; // the status bar's empty middle: no hover, no tooltip

test('A8 saved: Ctrl+S, hint "Saved esterification.chalk."', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chalkbond-a8-shot-'));
  const { app, page } = await openApp({
    launch: { dialogs: [{ canceled: false, filePath: join(dir, 'esterification.chalk') }] },
  });
  try {
    await loadScheme(page);
    await page.keyboard.press('Control+s');
    await expect(page.getByRole('status')).toHaveText('Saved esterification.chalk.');
    expect(await heardNotices(page)).toContainEqual({
      kind: 'info',
      text: 'Saved esterification.chalk.',
    });
    await expect
      .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle()))
      .toBe('esterification - Chalkbond');
    await page.mouse.move(away.x, away.y);
    await shot(page, 'A8', 'saved');
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
