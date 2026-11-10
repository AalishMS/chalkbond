import { expect, test, type Locator, type Page } from '@playwright/test';
import { openApp, type Size } from './harness';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  if (!b) throw new Error('element has no box');
  return b;
}

const px = (page: Page, testId: string, prop: string): Promise<string> =>
  page.getByTestId(testId).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

async function checkRegions(page: Page, [w, h]: Size): Promise<void> {
  const top = await box(page.getByTestId('topbar'));
  const rail = await box(page.getByTestId('rail'));
  const status = await box(page.getByTestId('statusbar'));
  const canvas = await box(page.getByTestId('canvas'));
  const near = (actual: number, expected: number): void => {
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
  };

  // Top bar: 48 px plus a 1 px line, full width.
  near(top.x, 0);
  near(top.y, 0);
  near(top.width, w);
  near(top.height, 49);
  expect(await px(page, 'topbar', 'border-bottom-width')).toBe('1px');

  // Rail: 64 px plus a 1 px line, between top bar and status bar.
  near(rail.x, 0);
  near(rail.y, 49);
  near(rail.width, 65);
  near(rail.height, h - 49 - 29);
  expect(await px(page, 'rail', 'border-right-width')).toBe('1px');

  // Status bar: a 1 px line plus 28 px, full width, at the bottom.
  near(status.x, 0);
  near(status.y, h - 29);
  near(status.width, w);
  near(status.height, 29);
  expect(await px(page, 'statusbar', 'border-top-width')).toBe('1px');

  // Canvas fills the rest.
  near(canvas.x, 65);
  near(canvas.y, 49);
  near(canvas.width, w - 65);
  near(canvas.height, h - 49 - 29);

  // Token colours and the UI font stack, not browser defaults.
  expect(await px(page, 'canvas', 'background-color')).toBe('rgb(255, 255, 255)');
  // The bars are transparent over the chrome background of the editor root.
  expect(
    await page.getByTestId('topbar').evaluate((el) => {
      const root = el.parentElement;
      return root ? getComputedStyle(root).backgroundColor : '';
    }),
  ).toBe('rgb(245, 246, 248)');
  expect(await px(page, 'topbar', 'border-bottom-color')).toBe('rgb(218, 221, 227)');
  expect(await px(page, 'statusbar', 'font-family')).toContain('Segoe UI');
}

for (const size of [
  [1280, 800],
  [960, 640],
] as const satisfies readonly Size[]) {
  test(`region boxes at ${size[0]}x${size[1]}`, async () => {
    const { app, page } = await openApp({ size: [...size] });
    try {
      await checkRegions(page, [...size]);
      // The editor fills the window: no page scroll.
      const overflow = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        sh: document.documentElement.scrollHeight,
      }));
      expect(overflow).toEqual({ sw: size[0], sh: size[1] });
    } finally {
      await app.close();
    }
  });
}
