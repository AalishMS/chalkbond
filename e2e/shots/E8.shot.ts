import { test } from '@playwright/test';
import { openApp, resizeContent, shot } from '../harness';

test('E8 top bar, status bar and empty state', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').waitFor();
    await page.mouse.move(700, 600);
    await shot(page, 'E8', 'empty');
    await page.getByTestId('tool-ring').click();
    await page.mouse.move(700, 600);
    await shot(page, 'E8', 'hint-ring');
    await page.getByTestId('tool-atom').click();
    await page.mouse.move(700, 600);
    await resizeContent(app, [960, 640]);
    await page.waitForFunction(() => window.innerWidth === 960 && window.innerHeight === 640);
    await shot(page, 'E8', 'empty-960');
  } finally {
    await app.close();
  }
});
