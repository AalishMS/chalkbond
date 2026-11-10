import { expect, test, type Locator, type Page } from '@playwright/test';
import { openApp } from './harness';

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

const near = (actual: number, expected: number, tol = 1): void => {
  expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(tol);
};

/** The test id (or tag) of the focused element. */
const focused = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const el = document.activeElement;
    return el?.getAttribute('data-testid') ?? el?.tagName.toLowerCase() ?? 'none';
  });

async function tab(page: Page, times: number, shift = false): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(shift ? 'Shift+Tab' : 'Tab');
    seen.push(await focused(page));
  }
  return seen;
}

const tooltip = (page: Page): Locator => page.getByRole('tooltip');

test('the canvas has focus at launch and a mouse click on a rail button keeps it there', async () => {
  const { app, page } = await openApp();
  try {
    expect(await focused(page)).toBe('canvas');
    const canvas = page.getByTestId('canvas');
    await expect(canvas).toHaveAttribute('role', 'application');
    await expect(canvas).toHaveAttribute('aria-label', 'Drawing canvas');
    await expect(canvas).toHaveAttribute('aria-describedby', 'editor-hint');
    await page.getByTestId('tool-ring').click();
    expect(await focused(page)).toBe('canvas');
    await expect(page.getByTestId('tool-ring')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('opt-cyclopentane').click();
    expect(await focused(page)).toBe('canvas');
    await page.getByTestId('zoom-in').click();
    expect(await focused(page)).toBe('canvas');
  } finally {
    await app.close();
  }
});

test('a mouse press on a rail button moves focus from the name field to the canvas', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByLabel('Compound name').focus();
    expect(await focused(page)).toBe('input');
    await page.getByTestId('tool-chain').click();
    expect(await focused(page)).toBe('canvas');
  } finally {
    await app.close();
  }
});

test('tab order (K4): canvas, empty-state chips, status controls, then the top bar and the rail', async () => {
  const { app, page } = await openApp();
  try {
    expect(await focused(page)).toBe('canvas');
    // Forward from the canvas: the three chips (shown while the document is empty), then the
    // status controls. The two preset buttons carry test ids; the chips do not.
    const forward = await tab(page, 9);
    expect(forward).toEqual([
      'button',
      'button',
      'button',
      'preset-slides',
      'preset-handout',
      'zoom-out',
      'zoom-reset',
      'zoom-in',
      'zoom-fit',
    ]);
    // Wrap-around: name field, the options bar (one stop: the selected option), Undo, Redo,
    // the rail (one stop: the active tool), the canvas.
    expect(await tab(page, 6)).toEqual([
      'input',
      'opt-single',
      'undo',
      'redo',
      'tool-bond',
      'canvas',
    ]);
  } finally {
    await app.close();
  }
});

test('Shift+Tab walks the same order backwards', async () => {
  const { app, page } = await openApp();
  try {
    expect(await tab(page, 5, true)).toEqual(['tool-bond', 'redo', 'undo', 'opt-single', 'input']);
  } finally {
    await app.close();
  }
});

test('rail: arrows move focus (wrapping), Enter selects, the tab stop follows the tool', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-bond').focus();
    await page.keyboard.press('ArrowDown');
    expect(await focused(page)).toBe('tool-chain');
    await page.keyboard.press('ArrowDown');
    expect(await focused(page)).toBe('tool-ring');
    await page.keyboard.press('ArrowUp');
    expect(await focused(page)).toBe('tool-chain');
    // Arrows only move focus.
    await expect(page.getByTestId('tool-bond')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('tool-chain')).toHaveAttribute('aria-pressed', 'true');
    expect(await focused(page)).toBe('tool-chain');
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    await expect(page.getByTestId('tool-ring')).toHaveAttribute('aria-pressed', 'true');
    // Roving tab stop: only the focused/active button is tabbable.
    await expect(page.locator('[data-testid="rail"] [tabindex="0"]')).toHaveCount(1);
    await expect(page.getByTestId('tool-ring')).toHaveAttribute('tabindex', '0');
    // Wrap at both ends.
    await page.getByTestId('tool-select').focus();
    await page.keyboard.press('ArrowUp');
    expect(await focused(page)).toBe('tool-text');
    await page.keyboard.press('ArrowDown');
    expect(await focused(page)).toBe('tool-select');
  } finally {
    await app.close();
  }
});

test('options bar: left and right move focus; Enter selects', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('opt-single').focus();
    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe('opt-double');
    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe('opt-triple');
    await page.keyboard.press('ArrowLeft');
    expect(await focused(page)).toBe('opt-double');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('opt-double')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('End');
    expect(await focused(page)).toBe('opt-hash');
    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe('opt-single');
    await expect(page.locator('[data-testid="options"] [tabindex="0"]')).toHaveCount(1);
  } finally {
    await app.close();
  }
});

test('focus ring: solid after Tab, none after a mouse click', async () => {
  const { app, page } = await openApp();
  try {
    const style = (testId: string): Promise<{ style: string; width: string; offset: string }> =>
      page.getByTestId(testId).evaluate((el) => {
        const cs = getComputedStyle(el);
        return { style: cs.outlineStyle, width: cs.outlineWidth, offset: cs.outlineOffset };
      });
    await page.getByTestId('tool-ring').click();
    expect((await style('tool-ring')).style).toBe('none');
    await page.getByTestId('tool-select').focus();
    await page.keyboard.press('ArrowDown');
    expect(await focused(page)).toBe('tool-erase');
    expect(await style('tool-erase')).toEqual({ style: 'solid', width: '2px', offset: '0px' });
    await page.getByTestId('undo').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    expect(await style('undo')).toEqual({ style: 'solid', width: '2px', offset: '2px' });
    await page.getByTestId('zoom-out').focus();
    await page.keyboard.press('Tab');
    expect(await focused(page)).toBe('zoom-reset');
    expect(await style('zoom-reset')).toEqual({ style: 'solid', width: '2px', offset: '0px' });
    await page.getByTestId('zoom-fit').click();
    expect((await style('zoom-fit')).style).toBe('none');
  } finally {
    await app.close();
  }
});

test('canvas: keyboard focus shows the 2 px inset ring, a mouse click does not', async () => {
  const { app, page } = await openApp();
  try {
    const ring = (): Promise<string> =>
      page.getByTestId('canvas').evaluate((el) => getComputedStyle(el, '::after').boxShadow);
    // At launch the canvas has focus but no ring.
    expect(await focused(page)).toBe('canvas');
    expect(await ring()).toBe('none');
    await page.getByTestId('tool-bond').focus();
    await page.keyboard.press('Tab');
    expect(await focused(page)).toBe('canvas');
    expect(await ring()).toContain('inset');
    expect(await ring()).toContain('2px');
    // Focus moved to the canvas by the mouse: no ring.
    await page.getByLabel('Compound name').click();
    expect(await focused(page)).toBe('input');
    await page.mouse.click(700, 500);
    expect(await focused(page)).toBe('canvas');
    expect(await ring()).toBe('none');
  } finally {
    await app.close();
  }
});

test('a rail tooltip appears after 500 ms, 8 px right of the button, with name, key and help', async () => {
  const { app, page } = await openApp();
  try {
    const bond = page.getByTestId('tool-bond');
    await bond.hover();
    await page.waitForTimeout(250);
    await expect(tooltip(page)).toHaveCount(0);
    await page.waitForTimeout(350);
    await expect(tooltip(page)).toBeVisible();
    await expect(tooltip(page).locator('.tooltip-title span')).toHaveText('Bond');
    await expect(tooltip(page).locator('kbd')).toHaveText('B');
    await expect(tooltip(page).locator('.tooltip-help')).toHaveText(
      'Click to add a bond. Drag to aim it.',
    );
    await expect(bond).toHaveAttribute('aria-describedby', /.+/);
    const id = await bond.getAttribute('aria-describedby');
    await expect(tooltip(page)).toHaveAttribute('id', id ?? '');
    const a = await box(bond);
    const t = await box(tooltip(page));
    near(t.x - (a.x + a.width), 8);
    near(t.y + t.height / 2, a.y + a.height / 2);
    // Never under the pointer.
    const pointer = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
    expect(t.x).toBeGreaterThan(pointer.x);
    await page.mouse.move(700, 500);
    await expect(tooltip(page)).toHaveCount(0);
    await expect(bond).not.toHaveAttribute('aria-describedby', /.+/);
  } finally {
    await app.close();
  }
});

test('option tooltips open below; disabled controls say why', async () => {
  const { app, page } = await openApp();
  try {
    const opt = page.getByTestId('opt-triple');
    await opt.hover();
    await expect(tooltip(page)).toBeVisible({ timeout: 2000 });
    await expect(tooltip(page).locator('.tooltip-title span')).toHaveText('Triple');
    await expect(tooltip(page).locator('kbd')).toHaveCount(0);
    const a = await box(opt);
    const t = await box(tooltip(page));
    near(t.y - (a.y + a.height), 8);
    near(t.x + t.width / 2, a.x + a.width / 2);

    await page.getByTestId('tool-select').click();
    await page.getByTestId('act-flip-h').hover();
    await expect(tooltip(page).locator('.tooltip-title span')).toHaveText('Flip horizontal', {
      timeout: 2000,
    });
    await expect(tooltip(page).locator('.tooltip-help')).toHaveText('Select a molecule first.');
    await page.getByTestId('undo').hover();
    await expect(tooltip(page).locator('.tooltip-title span')).toHaveText('Undo');
    await expect(tooltip(page).locator('kbd')).toHaveText('Ctrl+Z');
  } finally {
    await app.close();
  }
});

test('a status-bar tooltip opens above the control', async () => {
  const { app, page } = await openApp();
  try {
    const fit = page.getByTestId('zoom-fit');
    await fit.hover();
    await expect(tooltip(page)).toBeVisible({ timeout: 2000 });
    const a = await box(fit);
    const t = await box(tooltip(page));
    near(a.y - (t.y + t.height), 8);
    // Near the right window edge: shifted left, 8 px from the edge.
    near(t.x + t.width, 1280 - 8);
    await expect(tooltip(page).locator('kbd')).toHaveText('Ctrl+0');
  } finally {
    await app.close();
  }
});

test('warm-up: the next tooltip is immediate, until the pointer has been away 300 ms', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-bond').hover();
    await expect(tooltip(page)).toBeVisible({ timeout: 2000 });
    await page.getByTestId('tool-ring').hover();
    await expect(tooltip(page).locator('.tooltip-title span')).toHaveText('Ring', { timeout: 150 });
    await page.mouse.move(700, 500);
    await page.waitForTimeout(450);
    await page.getByTestId('tool-chain').hover();
    await page.waitForTimeout(250);
    await expect(tooltip(page)).toHaveCount(0);
    await expect(tooltip(page)).toBeVisible({ timeout: 2000 });
  } finally {
    await app.close();
  }
});

test('a tooltip goes away on pointer down and on Escape, and shows on keyboard focus', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-erase').hover();
    await expect(tooltip(page)).toBeVisible({ timeout: 2000 });
    await page.mouse.down();
    await expect(tooltip(page)).toHaveCount(0);
    await page.mouse.up();
    // It does not come back while the pointer stays on the pressed button.
    await page.waitForTimeout(700);
    await expect(tooltip(page)).toHaveCount(0);

    await page.mouse.move(700, 500);
    await page.getByTestId('tool-select').focus();
    await page.keyboard.press('ArrowDown');
    await expect(tooltip(page).locator('.tooltip-title span')).toHaveText('Erase');
    await page.keyboard.press('Escape');
    await expect(tooltip(page)).toHaveCount(0);
    await page.keyboard.press('ArrowDown');
    await expect(tooltip(page).locator('.tooltip-title span')).toHaveText('Bond');
    await page.keyboard.press('Tab');
    await expect(tooltip(page)).toHaveCount(0);
  } finally {
    await app.close();
  }
});
