import { expect, test } from '@playwright/test';
import { expectNoNetwork, openApp } from './harness';

test('startup defaults, native title, minimum content, and isolated editor zoom', async () => {
  const { app, page } = await openApp();
  try {
    expect(await page.evaluate(() => window.chalkbond.startup())).toEqual({
      settings: {
        newDrawingStyle: 'slides',
        export: { format: 'png', pngDpi: 300, pngWhite: false },
      },
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

test('W6/R32: no menu bar; content 960 x 640 keeps the rail’s last button visible', async () => {
  const { app, page } = await openApp({ size: [960, 640] });
  try {
    await page.getByTestId('canvas').waitFor();
    const measured = await app.evaluate(({ BrowserWindow, Menu }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.unmaximize();
      win?.setContentSize(960, 640);
      return {
        content: win?.getContentSize(),
        outer: win?.getSize(),
        bar: win?.isMenuBarVisible(),
        menu: Menu.getApplicationMenu(),
      };
    });
    console.info('W6 outer window', JSON.stringify(measured));
    expect(measured.content).toEqual([960, 640]);
    expect(measured.bar).toBe(false);
    expect(measured.menu).toBeNull();
    // The frame is the title bar and the borders only (A21: 960 x 671 at 100 % display scale; the
    // development laptop runs at 125 %): never room for a title bar and a menu bar as well.
    const extra = (measured.outer?.[1] ?? 0) - 640;
    expect(extra).toBeGreaterThanOrEqual(24);
    // The rail's last button is fully inside the rail (no row of chrome took its room).
    await page.waitForFunction(() => window.innerWidth >= 960 && window.innerHeight >= 640);
    const text = await page.getByTestId('tool-text').boundingBox();
    const rail = await page.getByTestId('rail').boundingBox();
    if (!text || !rail) throw new Error('no rail');
    expect(text.y + text.height).toBeLessThanOrEqual(rail.y + rail.height);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});
