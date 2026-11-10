import { test } from '@playwright/test';
import { openApp, resizeContent, shot } from '../harness';

test('E6 editor shell at 1280x800 and 960x640', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').waitFor();
    await shot(page, 'E6', 'shell');
    await resizeContent(app, [960, 640]);
    await page.waitForFunction(() => window.innerWidth === 960 && window.innerHeight === 640);
    await shot(page, 'E6', 'shell-960');
  } finally {
    await app.close();
  }
});
