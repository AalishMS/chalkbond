// A12 shots (tasks/todo-app-shell.md): the Keyboard shortcuts dialog over the scheme, at 1280×800
// and at the 960×640 minimum, and scrolled to its end. Compare with docs/mockups/shell A12.
import { expect, test } from '@playwright/test';
import { loadScheme } from '../fixtures';
import { openApp, shot } from '../harness';

for (const [name, size] of [
  ['shortcuts', [1280, 800]],
  ['shortcuts-960', [960, 640]],
] as const) {
  test(`A12 ${name}`, async () => {
    const { app, page } = await openApp({ size: [...size] });
    try {
      await loadScheme(page);
      await page.getByTestId('canvas').focus();
      await page.keyboard.press('F1');
      const dialog = page.getByTestId('shortcuts-dialog');
      await expect(dialog).toBeVisible();
      await page.mouse.move(size[0] - 10, size[1] - 10);
      await shot(page, 'A12', name);
      if (name === 'shortcuts') {
        await dialog.locator('.dialog-body').evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        await shot(page, 'A12', 'shortcuts-scrolled');
      }
    } finally {
      await app.close();
    }
  });
}
