// C12 shot (tasks/todo-clipboard-export.md): the scheme saved as esterification.chalk through the
// stubbed Save dialog; the Export dialog with PDF chosen shows outcome A's reopen line; Save… prints
// in main (C5), embeds the drawing and writes through C4: "Exported esterification.pdf." (A17).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { saveTo } from '../export-steps';
import { loadScheme } from '../fixtures';
import { openApp, shot } from '../harness';
import { windowTitle } from '../relaunch';

const away = { x: 640, y: 760 }; // the status bar's empty middle: no hover, no tooltip

test('C12 exported-pdf: A17 N-E1 after Export PDF of esterification.chalk', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chalkbond-shot-c12-'));
  const { app, page } = await openApp({
    launch: {
      dialogs: [saveTo(join(dir, 'esterification.chalk')), saveTo(join(dir, 'esterification.pdf'))],
    },
  });
  try {
    await loadScheme(page);
    await page.keyboard.press('Control+s');
    await expect.poll(() => windowTitle(app)).toBe('esterification - Chalkbond');
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+e');
    await page.getByTestId('export-format-pdf').click();
    await expect(page.getByTestId('export-reopen')).toHaveText(
      'You can open this file in Chalkbond again to change the drawing.',
    );
    await page.getByTestId('export-save').click();
    await expect(page.getByRole('status')).toHaveText('Exported esterification.pdf.');
    expect(readFileSync(join(dir, 'esterification.pdf')).subarray(0, 5).toString()).toBe('%PDF-');
    await page.mouse.move(away.x, away.y);
    await shot(page, 'C12', 'exported-pdf');
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
