import { expect, test, type Locator, type Page } from '@playwright/test';
import { canvasPoint, insertName, openApp, readDocument } from './harness';

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
    expect(await focused(page)).toBe('namefield-input');
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
    // status controls. The preset switch is a radio group with one tab stop (the selected
    // option); the chips do not carry test ids.
    const forward = await tab(page, 8);
    expect(forward).toEqual([
      'button',
      'button',
      'button',
      'preset-slides',
      'zoom-out',
      'zoom-reset',
      'zoom-in',
      'zoom-fit',
    ]);
    // Wrap-around: name field, the options bar (one stop: the selected option), Undo, Redo,
    // the host's actions (app-shell: Copy), the rail (one stop: the active tool), the canvas.
    expect(await tab(page, 7)).toEqual([
      'namefield-input',
      'opt-single',
      'undo',
      'redo',
      'copy',
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
    expect(await tab(page, 6, true)).toEqual([
      'tool-bond',
      'copy',
      'redo',
      'undo',
      'opt-single',
      'namefield-input',
    ]);
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
    expect(await focused(page)).toBe('namefield-input');
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
    await expect(tooltip(page).locator('kbd')).toHaveText(['3', 'B']);
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

test('number keys 1 .. 0 select Select .. Text in turn with the canvas focused (R50)', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').focus();
    const tools = [
      'select',
      'erase',
      'bond',
      'chain',
      'ring',
      'atom',
      'arrow',
      'plus',
      'curved',
      'text',
    ];
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    for (const [i, id] of tools.entries()) {
      await page.keyboard.press(keys[i] as string);
      await expect(page.getByTestId(`tool-${id}`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('rail').locator('[aria-pressed="true"]')).toHaveCount(1);
      expect(await focused(page)).toBe('canvas');
    }
  } finally {
    await app.close();
  }
});

test('with Ring active, hovering a ring atom and pressing 1 sprouts a bond: toluene (R5, SC2)', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('5');
    await expect(page.getByTestId('tool-ring')).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.click(600, 400);
    const doc = await readDocument(page);
    const first = Object.values(doc.atoms)[0];
    if (!first) throw new Error('no ring atom');
    const at = await canvasPoint(page, first);
    await page.mouse.move(at.x, at.y);
    await page.keyboard.press('1');
    await expect(page.getByTestId('formula')).toHaveText('C7H8 · 92.14 g/mol');
    await expect(page.getByTestId('tool-ring')).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await app.close();
  }
});

/** Dispatches a keydown on the canvas the way the browser does for an auto-repeating key. */
const repeatKey = (page: Page, key: string): Promise<void> =>
  page.getByTestId('canvas').dispatchEvent('keydown', { key, repeat: true });

const pressedTool = (page: Page): Promise<string> =>
  page.evaluate(
    () =>
      document
        .querySelector('[data-testid^="tool-"][aria-pressed="true"]')
        ?.getAttribute('data-testid') ?? '',
  );

test('a held digit picks its tool once; a repeated digit does nothing (R50, SC13)', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').focus();
    const before = await pressedTool(page);
    expect(before).not.toBe('tool-ring');
    // Auto-repeat events alone never pick a tool.
    await repeatKey(page, '5');
    expect(await pressedTool(page)).toBe(before);
    // A real key down picks Ring; the held key's repeats then change nothing.
    await page.keyboard.down('5');
    await expect(page.getByTestId('tool-ring')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.down('5');
    await page.keyboard.down('5');
    await page.keyboard.up('5');
    await expect(page.getByTestId('tool-ring')).toHaveAttribute('aria-pressed', 'true');
    // A second digit that arrives as a repeat does nothing either.
    await repeatKey(page, '7');
    await repeatKey(page, '0');
    expect(await pressedTool(page)).toBe('tool-ring');
    await page.keyboard.press('7');
    await expect(page.getByTestId('tool-arrow')).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await app.close();
  }
});

test('digits typed in the name field are text and leave the tool unchanged (R50, SC13)', async () => {
  const { app, page } = await openApp();
  try {
    const before = await pressedTool(page);
    const input = page.getByTestId('namefield-input');
    await input.focus();
    await page.keyboard.type('1234567890');
    await expect(input).toHaveValue('1234567890');
    expect(await pressedTool(page)).toBe(before);
  } finally {
    await app.close();
  }
});

test('digits typed in the label editor are text and leave the tool unchanged (R50, SC13)', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanol');
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Escape');
    const doc = await readDocument(page);
    const o = Object.values(doc.atoms).find((a) => a.element === 'O');
    if (!o) throw new Error('no oxygen');
    const at = await canvasPoint(page, o);
    await page.mouse.move(at.x, at.y);
    const before = await pressedTool(page);
    await page.keyboard.press('Enter');
    const edit = page.getByTestId('textbox-edit');
    await expect(edit).toBeFocused();
    await page.keyboard.type('R1234567890');
    await expect(edit).toHaveText('R1234567890');
    expect(await pressedTool(page)).toBe(before);
    await page.keyboard.press('Escape');
    await expect(edit).toHaveCount(0);
    expect(await pressedTool(page)).toBe(before);
  } finally {
    await app.close();
  }
});

test('digits typed in the text editor are text and leave the tool unchanged (R50, SC13)', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('0');
    await expect(page.getByTestId('tool-text')).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.click(600, 400);
    const edit = page.getByTestId('textbox-edit');
    await expect(edit).toBeFocused();
    await page.keyboard.type('1234567890');
    await expect(edit).toHaveText('1234567890');
    await expect(page.getByTestId('tool-text')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('rail').locator('[aria-pressed="true"]')).toHaveCount(1);
  } finally {
    await app.close();
  }
});

test('a number-pad digit with Num Lock on picks its tool; Num Lock off does nothing (R50, SC13)', async () => {
  const { app, page } = await openApp();
  try {
    const canvas = page.getByTestId('canvas');
    await canvas.focus();
    // The exact event a Num Lock-on number pad sends: key is the digit, code and location say pad.
    await canvas.dispatchEvent('keydown', { key: '5', code: 'Numpad5', location: 3 });
    await expect(page.getByTestId('tool-ring')).toHaveAttribute('aria-pressed', 'true');
    // Playwright's model of Num Lock on: Shift+NumpadN gives the digit (Shift is ignored, R6).
    await page.keyboard.press('Shift+Numpad7');
    await expect(page.getByTestId('tool-arrow')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Shift+Numpad2');
    await expect(page.getByTestId('tool-erase')).toHaveAttribute('aria-pressed', 'true');
    // Num Lock off: the pad sends End, ArrowDown, Clear ... and none of them is a digit.
    await page.keyboard.press('Numpad5');
    await page.keyboard.press('Numpad1');
    await expect(page.getByTestId('tool-erase')).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await app.close();
  }
});
