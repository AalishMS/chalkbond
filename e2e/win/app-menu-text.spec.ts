// A11 M3 and K1 on the real Windows clipboard with the native menu installed (Windows only;
// e2e/win is ignored elsewhere). NOT RUN YET: written on Linux. The menu registers no accelerator
// (M2), so Ctrl+C / Ctrl+V / Ctrl+Z in the name field stay the field's native text keys, and
// Edit > Copy with the field focused runs webContents.copy() in main.
import { expect, test, type ElectronApplication } from '@playwright/test';
import { clickEnabled as clickMenu, menuItem } from '../app-menu';
import { openApp, readDocument } from '../harness';

const clipboardText = (app: ElectronApplication) =>
  app.evaluate(({ clipboard }) => clipboard.readText());
const setClipboardText = (app: ElectronApplication, text: string) =>
  app.evaluate(({ clipboard }, value) => clipboard.writeText(value), text);

test('Edit > Copy and Select all act on the focused name field (M3)', async () => {
  const { app, page } = await openApp();
  try {
    const input = page.getByTestId('namefield-input');
    await input.click();
    await page.keyboard.type('ethanol');
    await expect.poll(async () => (await menuItem(app, 'edit.duplicate')).enabled).toBe(false);
    await setClipboardText(app, '');
    await clickMenu(app, 'edit.select-all');
    await expect
      .poll(() => input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]))
      .toEqual([0, 7]);
    await clickMenu(app, 'edit.copy');
    await expect.poll(() => clipboardText(app)).toBe('ethanol');
    await clickMenu(app, 'edit.cut');
    await expect(input).toHaveValue('');
    await clickMenu(app, 'edit.paste');
    await expect(input).toHaveValue('ethanol');
    await clickMenu(app, 'edit.undo');
    await expect(input).toHaveValue('');
  } finally {
    await app.close();
  }
});

test('native Ctrl+C / Ctrl+V / Ctrl+Z in the name field with the menu installed', async () => {
  const { app, page } = await openApp();
  try {
    const input = page.getByTestId('namefield-input');
    await input.click();
    await page.keyboard.type('ethanol');
    await setClipboardText(app, '');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+c');
    await expect.poll(() => clipboardText(app)).toBe('ethanol');
    await page.keyboard.press('End');
    await page.keyboard.press('Control+v');
    await expect(input).toHaveValue('ethanolethanol');
    await page.keyboard.press('Control+z');
    await expect(input).toHaveValue('ethanol');
    // None of it reached the drawing.
    expect(Object.keys((await readDocument(page)).atoms)).toHaveLength(0);
  } finally {
    await app.close();
  }
});
