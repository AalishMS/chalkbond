// C10 shots (tasks/todo-clipboard-export.md): the Export dialog as mock-ups A08a (PNG, opened with
// Ctrl+E: the chosen card shows its focus ring), A08b (SVG chosen with the mouse), A08c (PDF under
// outcome A: the PNG reopen line), and the PNG dialog at 960 × 640 (fully usable).
import { expect, test, type Page } from '@playwright/test';
import { loadScheme } from '../fixtures';
import { openApp, shot } from '../harness';

const away = { x: 640, y: 786 }; // outside the dialog, on the scrim: no hover in the box

async function openExport(page: Page): Promise<void> {
  await loadScheme(page);
  await page.getByTestId('tool-select').click();
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+e');
  await expect(page.getByTestId('export-dialog')).toBeVisible();
}

test('C10 export-png: A08a, Ctrl+E, PNG focused, Print, transparent', async () => {
  const { app, page } = await openApp();
  try {
    await openExport(page);
    await expect(page.getByTestId('export-size-print')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('export-size-line')).toHaveText(
      /^Sharp on paper\. [\d,]+ × [\d,]+ pixels\.$/,
    );
    await page.mouse.move(away.x, away.y);
    await shot(page, 'C10', 'export-png');
  } finally {
    await app.close();
  }
});

test('C10 export-svg: A08b, SVG chosen with the mouse', async () => {
  const { app, page } = await openApp();
  try {
    await openExport(page);
    await page.getByTestId('export-format-svg').click();
    await expect(page.getByTestId('export-white')).toHaveCount(0);
    await page.mouse.move(away.x, away.y);
    await shot(page, 'C10', 'export-svg');
  } finally {
    await app.close();
  }
});

test('C10 export-pdf: A08c under outcome A (the PNG reopen line)', async () => {
  const { app, page } = await openApp();
  try {
    await openExport(page);
    await page.getByTestId('export-format-pdf').click();
    await expect(page.getByTestId('export-reopen')).toHaveText(
      'You can open this file in Chalkbond again to change the drawing.',
    );
    await page.mouse.move(away.x, away.y);
    await shot(page, 'C10', 'export-pdf');
  } finally {
    await app.close();
  }
});

test('C10 export-png-960: the PNG dialog at 960 × 640, footer visible', async () => {
  const { app, page } = await openApp({ size: [960, 640] });
  try {
    await openExport(page);
    await expect(page.getByTestId('export-save')).toBeInViewport({ ratio: 1 });
    await page.mouse.move(480, 630);
    await shot(page, 'C10', 'export-png-960');
  } finally {
    await app.close();
  }
});
