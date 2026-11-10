import { test } from '@playwright/test';
import { goldenDoc, loadDocument, openApp, resizeContent, shot } from '../harness';

test('E12 canvas: default, zoom, fit, pan, small window', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').waitFor();
    await shot(page, 'E12', 'launch-empty');

    await loadDocument(page, goldenDoc('ethanol'));
    await page.mouse.move(700, 600);
    await shot(page, 'E12', 'default');

    // Zoom in about a bond: Ctrl+wheel with the pointer on it.
    const bond = await page.locator('[data-key^="bond:"]').first().boundingBox();
    if (!bond) throw new Error('no bond');
    await page.mouse.move(bond.x + bond.width / 2, bond.y + bond.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -400);
    await page.keyboard.up('Control');
    await page.waitForTimeout(100);
    await shot(page, 'E12', 'zoom-in-about-point');

    await page.getByTestId('zoom-reset').click();
    await page.keyboard.press('Control+=');
    await page.mouse.move(700, 600);
    await shot(page, 'E12', 'zoom-200');

    await page.getByTestId('zoom-reset').click();
    await page.keyboard.press('Control+-');
    await page.keyboard.press('Control+-');
    await page.mouse.move(700, 600);
    await shot(page, 'E12', 'zoom-out');

    for (let i = 0; i < 10; i++) await page.keyboard.press('Control+-');
    await page.mouse.move(700, 600);
    await shot(page, 'E12', 'zoom-25');

    await page.getByTestId('zoom-reset').click();
    await page.mouse.move(400, 300);
    await page.keyboard.down('Space');
    await page.mouse.down();
    await page.mouse.move(500, 350, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    await page.mouse.move(700, 600);
    await shot(page, 'E12', 'pan-space');

    await loadDocument(page, goldenDoc('reaction-conditions'));
    await page.keyboard.press('Control+=');
    await page.keyboard.press('Control+=');
    await page.getByTestId('zoom-fit').click();
    await page.mouse.move(700, 700);
    await shot(page, 'E12', 'fit');

    await resizeContent(app, [960, 640]);
    await page.waitForFunction(() => window.innerWidth === 960 && window.innerHeight === 640);
    await loadDocument(page, goldenDoc('ethanol'));
    await page.mouse.move(600, 500);
    await shot(page, 'E12', 'small-960x640');
  } finally {
    await app.close();
  }
});
