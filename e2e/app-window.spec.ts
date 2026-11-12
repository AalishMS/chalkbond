import { expect, test } from '@playwright/test';
import { openApp } from './harness';

test('startup defaults, native title, minimum content, and isolated editor zoom', async () => {
  const { app, page } = await openApp();
  try {
    expect(await page.evaluate(() => window.chalkbond.startup())).toEqual({
      settings: {
        newDrawingStyle: 'slides',
        export: { format: 'png', pngDpi: 300, pngWhite: false },
      },
      recovery: null,
      // SS7 (TB12): a first run restores no session.
      session: null,
      open: null,
    });
    const title = () =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle());
    await expect.poll(title).toBe('Untitled - Chalkbond');
    await page.getByTestId('canvas').click({ position: { x: 350, y: 250 } });
    await expect.poll(title).toBe('*Untitled - Chalkbond');
    await page.evaluate(() => {
      document.title = 'Untrusted page title';
    });
    expect(await title()).toBe('*Untitled - Chalkbond');
    const size = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.unmaximize();
      win?.setSize(200, 200);
      return win?.getContentSize();
    });
    console.info(
      'W6 measured',
      JSON.stringify({
        content: size,
        minimum: await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.getMinimumSize(),
        ),
      }),
    );
    expect(size?.[0]).toBeGreaterThanOrEqual(960);
    expect(size?.[1]).toBeGreaterThanOrEqual(640);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+=');
    const readout = page.getByTestId('zoom-reset');
    const before = await readout.innerText();
    await page.getByTestId('canvas').hover();
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await expect(readout).not.toHaveText(before);
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.webContents.getZoomFactor(),
      ),
    ).toBe(1);
  } finally {
    await app.close();
  }
});
