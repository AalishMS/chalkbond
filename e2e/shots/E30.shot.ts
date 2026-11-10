import { test, type Page } from '@playwright/test';
import { openApp, shot } from '../harness';

const ESTER = 'ethanol + acetic acid -> ethyl acetate + water';

async function chip(page: Page, text: string): Promise<void> {
  await page.getByTestId('empty-state').getByRole('button', { name: text, exact: true }).click();
}

/** Moves the pointer off the drawing and the status bar so no hover is in the picture. */
async function parkPointer(page: Page): Promise<void> {
  await page.mouse.move(40, 700);
  await page.waitForTimeout(250);
}

test('E30 the scheme in Slides, in Handout, and back with Ctrl+Z', async () => {
  const { app, page } = await openApp();
  try {
    await chip(page, ESTER);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Escape');
    await parkPointer(page);
    await shot(page, 'E30', 'slides');
    await page.getByTestId('preset-handout').click();
    await parkPointer(page);
    await shot(page, 'E30', 'handout');
    await page.keyboard.press('Control+z');
    await parkPointer(page);
    await shot(page, 'E30', 'slides-again');
  } finally {
    await app.close();
  }
});

test('E30 the switch focused by keyboard, and hovered', async () => {
  const { app, page } = await openApp();
  try {
    await chip(page, ESTER);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Escape');
    // Tab from the canvas: the preset switch is the first status-bar stop.
    await page.keyboard.press('Tab');
    await page.waitForTimeout(250);
    await shot(page, 'E30', 'switch-keyboard-focus');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
    await shot(page, 'E30', 'switch-keyboard-handout');
    await page.getByTestId('canvas').focus();
    await page.getByTestId('preset-slides').hover();
    await page.waitForTimeout(250);
    await shot(page, 'E30', 'switch-hover');
  } finally {
    await app.close();
  }
});
