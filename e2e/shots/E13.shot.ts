import { test } from '@playwright/test';
import { insertName, openApp, shot } from '../harness';

test('E13 name field: dropdown, not found, inserted', async () => {
  const { app, page } = await openApp();
  try {
    const input = page.getByTestId('namefield-input');
    await page.getByTestId('canvas').waitFor();
    await input.click();
    await input.fill('eth');
    await page.getByTestId('name-row').first().waitFor();
    await page.mouse.move(640, 500);
    await shot(page, 'E13', 'dropdown-eth');

    await input.fill('ethanl');
    await page.keyboard.press('Enter');
    await page.getByTestId('name-notfound').waitFor();
    await page.mouse.move(640, 500);
    await shot(page, 'E13', 'notfound-ethanl');

    await page.getByTestId('name-chip').first().click();
    await page.getByTestId('formula').waitFor();
    await page.mouse.move(640, 700);
    await shot(page, 'E13', 'ethanol-inserted');

    await insertName(page, 'benzene');
    await page.mouse.move(640, 700);
    await shot(page, 'E13', 'ethanol-benzene');

    await insertName(page, 'acetic acid');
    await page.mouse.move(640, 700);
    await shot(page, 'E13', 'three-inserted');
  } finally {
    await app.close();
  }
});
