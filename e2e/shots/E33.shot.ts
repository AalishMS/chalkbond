import { test, type Page } from '@playwright/test';
import { canvasPoint, insertName, openApp, readDocument, shot } from '../harness';

/** Moves the pointer off every control so no hover is in the picture. */
async function parkPointer(page: Page): Promise<void> {
  await page.mouse.move(700, 560);
  await page.waitForTimeout(250);
}

test('E33 keyboard-only walkthrough, one shot per step', async () => {
  const { app, page } = await openApp();
  try {
    await page.keyboard.press('Control+f');
    await page.keyboard.type('ethanol');
    await parkPointer(page);
    await shot(page, 'E33', 'keyboard-walkthrough-1-typed');
    await page.keyboard.press('Enter');
    await parkPointer(page);
    await shot(page, 'E33', 'keyboard-walkthrough-2-inserted');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+a');
    await parkPointer(page);
    await shot(page, 'E33', 'keyboard-walkthrough-3-select-all');
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await parkPointer(page);
    await shot(page, 'E33', 'keyboard-walkthrough-4-pasted');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await parkPointer(page);
    await shot(page, 'E33', 'keyboard-walkthrough-5-nudged');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await parkPointer(page);
    await shot(page, 'E33', 'keyboard-walkthrough-6-undone-twice');
    await page.keyboard.press('b');
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(250);
    await shot(page, 'E33', 'keyboard-walkthrough-7-tool-key-and-tooltip');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
    await shot(page, 'E33', 'keyboard-walkthrough-8-preset');
  } finally {
    await app.close();
  }
});

test('E33 keyboard focus on each kind of control', async () => {
  const { app, page } = await openApp();
  try {
    await page.keyboard.press('Shift');
    // A rail button (the tooltip is part of the picture).
    await page.getByTestId('tool-ring').focus();
    await page.waitForTimeout(300);
    await shot(page, 'E33', 'focus-rail-button');
    // An option.
    await page.getByTestId('tool-bond').focus();
    await page.getByTestId('opt-double').focus();
    await page.waitForTimeout(300);
    await shot(page, 'E33', 'focus-option');
    // A "Did you mean" chip.
    await insertName(page, 'ethanl');
    await page.getByTestId('name-chip').first().waitFor();
    await page.getByTestId('name-chip').nth(1).focus();
    await shot(page, 'E33', 'focus-chip');
    // The name field with the dropdown and its active row.
    await page.getByTestId('namefield-input').fill('eth');
    await page.getByTestId('name-row').first().waitFor();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await shot(page, 'E33', 'focus-name-field-active-row');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    // The preset switch and the zoom controls.
    await page.getByTestId('preset-slides').focus();
    await page.waitForTimeout(300);
    await shot(page, 'E33', 'focus-preset-switch');
    // The canvas.
    await page.getByTestId('tool-bond').focus();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);
    await shot(page, 'E33', 'focus-canvas');
  } finally {
    await app.close();
  }
});

test('E33 keyboard focus on the warnings button', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'water');
    await page.keyboard.press('Escape');
    const doc = await readDocument(page);
    const o = Object.values(doc.atoms).find((a) => a.element === 'O') as { x: number; y: number };
    const p = await canvasPoint(page, o);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
    await page.keyboard.type('H20');
    await page.keyboard.press('Enter');
    await parkPointer(page);
    await page.keyboard.press('Shift');
    await page.getByTestId('warnings').focus();
    await page.waitForTimeout(300);
    await shot(page, 'E33', 'focus-warnings-button');
  } finally {
    await app.close();
  }
});
