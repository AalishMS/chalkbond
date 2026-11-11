// A18 shots (tasks/todo-app-shell.md): keyboard focus rings on the new UI. `focus-copy`: Tab from
// Redo lands on Copy (A03's focus cell: 2 px accent ring, offset 2 px). `focus-export-card`:
// Ctrl+E, the PNG card focused (A08a). Compare with docs/mockups/shell (A03, A08a).
import { expect, test } from '@playwright/test';
import { loadScheme } from '../fixtures';
import { openApp, shot } from '../harness';

test('A18 focus-copy', async () => {
  const { app, page } = await openApp();
  try {
    await loadScheme(page);
    await page.getByTestId('redo').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('copy')).toBeFocused();
    await page.mouse.move(640, 600);
    await shot(page, 'A18', 'focus-copy');
  } finally {
    await app.close();
  }
});

test('A18 focus-export-card', async () => {
  const { app, page } = await openApp();
  try {
    await loadScheme(page);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+e');
    await expect(page.getByTestId('export-format-png')).toBeFocused();
    await page.mouse.move(1270, 790);
    await shot(page, 'A18', 'focus-export-card');
  } finally {
    await app.close();
  }
});
