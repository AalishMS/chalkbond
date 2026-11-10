import { expect, test } from '@playwright/test';
import { openApp, shot } from '../harness';
for (const width of [1280, 960]) {
  test(`A6 untitled at ${width}`, async () => {
    const { app, page } = await openApp({ size: [width, width === 1280 ? 800 : 640] });
    try {
      await expect(page.getByTestId('tool-text')).toBeVisible();
      const rail = page.getByTestId('tool-text');
      const box = await rail.boundingBox();
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
        (width === 1280 ? 800 : 640) - 28,
      );
      await shot(page, 'A6', width === 1280 ? 'untitled' : 'untitled-960');
    } finally {
      await app.close();
    }
  });
}
