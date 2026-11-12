// N10 shot (tasks/todo-features-2026-11.md; shell mock-up A12): the Keyboard shortcuts dialog with
// the digit-then-letter Tools rows. Compare with out/mockups-shell/A12-shortcuts.png.
import { expect, test } from '@playwright/test';
import { loadScheme } from '../fixtures';
import { openApp, shot } from '../harness';

test('N10 shortcuts dialog', async () => {
  const { app, page } = await openApp({ size: [1280, 800] });
  try {
    await loadScheme(page);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('F1');
    await expect(page.getByTestId('shortcuts-dialog')).toBeVisible();
    await page.mouse.move(1270, 790);
    await shot(page, 'N10', 'shortcuts-dialog');
  } finally {
    await app.close();
  }
});
