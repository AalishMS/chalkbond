// A11 shot (tasks/todo-app-shell.md): 960×640 content with the native menu bar present. The page
// shows all ten rail buttons; the native menu bar is outside the shot (its look is on the Windows
// checklist, A04–A06).
import { expect, test } from '@playwright/test';
import { menuItem } from '../app-menu';
import { loadScheme } from '../fixtures';
import { openApp, shot } from '../harness';

test('A11 menu-960: the scheme at the minimum content size with the menu installed', async () => {
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
