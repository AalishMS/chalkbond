import { test } from '@playwright/test';
import { openApp, resizeContent, shot } from '../harness';

test('E7 tool rail and options bars', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('rail').waitFor();
    await shot(page, 'E7', 'bond-options');

    await page.getByTestId('tool-ring').click();
    await page.getByTestId('opt-cyclopentane').click();
    await page.mouse.move(700, 400);
    await shot(page, 'E7', 'ring-options');

    await page.getByTestId('tool-atom').click();
    await page.getByTestId('opt-N').click();
    await page.getByTestId('opt-Cl').hover();
    await shot(page, 'E7', 'atom-options');

    await page.getByTestId('tool-select').click();
    await page.mouse.move(700, 400);
    await shot(page, 'E7', 'select-actions');

    // Hover and pressed states of rail buttons.
    await page.getByTestId('tool-erase').hover();
    await shot(page, 'E7', 'rail-hover');
    await page.getByTestId('tool-chain').hover();
    await page.mouse.down();
    await shot(page, 'E7', 'rail-pressed');
    await page.mouse.up();
    // Release elsewhere so the click lands on nothing.
    await page.mouse.move(700, 400);

    await page.getByTestId('tool-atom').click();
    await page.mouse.move(700, 400);
    await resizeContent(app, [960, 640]);
    await page.waitForFunction(() => window.innerWidth === 960 && window.innerHeight === 640);
    await shot(page, 'E7', 'atom-options-960');
  } finally {
    await app.close();
  }
});
