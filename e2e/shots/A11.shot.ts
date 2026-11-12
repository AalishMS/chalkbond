// A11 shot (tasks/todo-app-shell.md): 960×640 content. The page shows all ten rail buttons and the
// ☰ button (A19, A21; R32: there is no menu bar any more; the popup is native and outside the shot,
// its look is on the Windows checklist).
import { expect, test } from '@playwright/test';
import { menuItem } from '../app-menu';
import { loadScheme } from '../fixtures';
import { openApp, shot } from '../harness';

test('A11 menu-960: the scheme at the minimum content size with the ☰ button', async () => {
  const { app, page } = await openApp({ size: [960, 640] });
  try {
    await loadScheme(page);
    await expect.poll(async () => (await menuItem(app, 'edit.copy')).enabled).toBe(true);
    await expect(page.getByTestId('tool-text')).toBeInViewport({ ratio: 1 });
    await page.mouse.move(480, 630);
    await shot(page, 'A11', 'menu-960');
  } finally {
    await app.close();
  }
});
