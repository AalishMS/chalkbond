import { test } from '@playwright/test';
import { openApp, shot } from '../harness';

test('N5 rail badges and the two-key tooltip', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('1');
    await page.mouse.move(700, 600);
    await shot(page, 'N5', 'rail-badges');

    await page.getByTestId('tool-bond').hover();
    await page.getByRole('tooltip').waitFor();
    await page.waitForTimeout(250);
    await shot(page, 'N5', 'rail-tooltip');
  } finally {
    await app.close();
  }
});
