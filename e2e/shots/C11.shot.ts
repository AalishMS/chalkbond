// C11 shot (tasks/todo-clipboard-export.md): the scheme saved as esterification.chalk through the
// stubbed Save dialog, then Export PNG through the real dialog, rasteriser and C4 write: the status
// bar shows "Exported esterification.png." (A17's N-E1 row). The file goes to a temp folder.
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { exportWith, saveTo } from '../export-steps';
import { loadScheme } from '../fixtures';
import { openApp, shot } from '../harness';
import { windowTitle } from '../relaunch';

const away = { x: 640, y: 760 }; // the status bar's empty middle: no hover, no tooltip

test('C11 exported: A17 N-E1 after Export PNG of esterification.chalk', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chalkbond-shot-c11-'));
  const { app, page } = await openApp({
    launch: {
      dialogs: [saveTo(join(dir, 'esterification.chalk')), saveTo(join(dir, 'esterification.png'))],
    },
  });
  try {
    await loadScheme(page);
    await page.keyboard.press('Control+s');
    await expect.poll(() => windowTitle(app)).toBe('esterification - Chalkbond');
    await exportWith(page, { format: 'png', size: 'print', white: false });
    await expect(page.getByRole('status')).toHaveText('Exported esterification.png.');
    expect(statSync(join(dir, 'esterification.png')).size).toBeGreaterThan(0);
    await page.mouse.move(away.x, away.y);
    await shot(page, 'C11', 'exported');
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
