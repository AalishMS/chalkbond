import { expect, test, type Locator, type Page } from '@playwright/test';
import { canvasPoint, insertName, openApp, readDocument, readSelection } from './harness';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const near = (actual: number, expected: number, tol = 1): void => {
  expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(tol);
};

const parts = (page: Page, prefix: string): Locator =>
  page.locator(`[data-layer="content"] > [data-key^="${prefix}"]`);

const field = (page: Page): Locator => page.getByTestId('namefield-input');

/** The union box of the mounted parts whose keys are listed. */
async function inkOf(page: Page, keys: string[]): Promise<Box> {
  return page.evaluate((wanted) => {
    const rects = [...document.querySelectorAll('[data-layer="content"] > [data-key]')]
      .filter((g) => wanted.includes(g.getAttribute('data-key') ?? ''))
      .map((g) => g.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }, keys);
}

/** Geometry boxes (getBoundingClientRect: no stroke) of the parts whose key starts with `prefix`. */
async function inkBoxes(page: Page, prefix: string): Promise<Box[]> {
  return page.evaluate((p) => {
    return [...document.querySelectorAll(`[data-layer="content"] > [data-key^="${p}"]`)].map(
      (g) => {
        const r = g.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      },
    );
  }, prefix);
}

const allKeys = (page: Page): Promise<string[]> =>
  page
    .locator('[data-layer="content"] > [data-key]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-key') ?? ''));

const contentTransform = async (page: Page): Promise<string | null> =>
  page.locator('[data-layer="content"]').getAttribute('transform');

/** The drawing's ink box is centred in the canvas (geometry boxes: within 3 px). */
async function expectCentred(page: Page): Promise<void> {
  const canvas = await page.getByTestId('canvas').boundingBox();
  if (!canvas) throw new Error('no canvas');
  const all = await inkOf(page, await allKeys(page));
  near(all.x + all.width / 2, canvas.x + canvas.width / 2, 3);
  near(all.y + all.height / 2, canvas.y + canvas.height / 2, 3);
}

async function expectInView(page: Page): Promise<void> {
  const canvas = await page.getByTestId('canvas').boundingBox();
  if (!canvas) throw new Error('no canvas');
  const all = await inkOf(page, await allKeys(page));
  expect(all.x).toBeGreaterThanOrEqual(canvas.x + 48 - 1.5);
  expect(all.x + all.width).toBeLessThanOrEqual(canvas.x + canvas.width - 48 + 1.5);
}

test('typing ethanol + Enter draws it centred, selected, with its formula', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanol');
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
    expect(await parts(page, 'atom:').count()).toBeGreaterThan(0);
    expect(await parts(page, 'bond:').count()).toBe(2);
    await expect(page.getByTestId('formula')).toHaveText('C2H6O · 46.07 g/mol');
    await expect(field(page)).toHaveValue('');
    await expect(field(page)).toBeFocused();
    await expect(page.getByTestId('undo')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('status')).toContainText('Inserted ethanol');
    // R20: an info notice is plain text, no warning icon.
    await expect(page.getByRole('status').locator('svg')).toHaveCount(0);
    // R21: what was inserted is selected and Select is the active tool.
    await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');

    // Centred on the canvas at 150 %: the C-C bond is 80 px between its atoms.
    const canvas = await page.getByTestId('canvas').boundingBox();
    if (!canvas) throw new Error('no canvas');
    const ink = await inkOf(page, await allKeys(page));
    near(ink.x + ink.width / 2, canvas.x + canvas.width / 2, 2);
    near(ink.y + ink.height / 2, canvas.y + canvas.height / 2, 2);
    await expect(page.getByTestId('zoom-reset')).toHaveText('150%');
    // A zig-zag bond spans 80 cos 30 x 40 px (geometry, without the stroke): its diagonal.
    const [bond] = await inkBoxes(page, 'bond:');
    if (!bond) throw new Error('no bond');
    near(Math.hypot(bond.width, bond.height), 80, 1);

    // R23: the field is empty and focused, so Ctrl+Z undoes the insert and Ctrl+Y brings it back.
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(parts(page, 'atom:')).toHaveCount(0);
    await page.keyboard.press('Control+y');
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
    expect(await parts(page, 'bond:').count()).toBe(2);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+Shift+z');
    expect(await parts(page, 'bond:').count()).toBe(2);
  } finally {
    await app.close();
  }
});

test('inserting benzene next puts it to the right, 1.0 BLU (80 px) clear', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanol');
    const known = new Set(await allKeys(page));
    await insertName(page, 'benzene');
    // The view is re-framed by the insert (V7), so measure ethanol again after it.
    const before = await inkOf(page, [...known]);
    const fresh = (await allKeys(page)).filter((k) => !known.has(k));
    expect(fresh.length).toBeGreaterThan(0);
    const benzene = await inkOf(page, fresh);
    // 1.0 BLU = 80 px between the ink boxes; these are geometry boxes, so each side lacks half
    // the 2 pt stroke (2 px at 150 %): 80 + 2 + 2.
    near(benzene.x - (before.x + before.width), 84, 1.5);
    // The ring's circle has no fill of its own: the layer's presentation attributes give "none".
    const fill = await page
      .locator('[data-key^="ring:"] circle')
      .first()
      .evaluate((c) => getComputedStyle(c).fill);
    expect(fill).toBe('none');
    await expectInView(page);
    // R22: both molecules, as one group, are centred at 150 %.
    await expect(page.getByTestId('zoom-reset')).toHaveText('150%');
    await expectCentred(page);
  } finally {
    await app.close();
  }
});

test('three inserted structures are framed as a group (R22, V7)', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanol');
    await insertName(page, 'benzene');
    await insertName(page, 'acetic acid');
    await expectCentred(page);
    await expectInView(page);
    const percent = Number.parseInt((await page.getByTestId('zoom-reset').textContent()) ?? '', 10);
    expect(percent).toBeLessThanOrEqual(150);
  } finally {
    await app.close();
  }
});

test('a long row of structures zooms out to fit, never above 150 %', async () => {
  const { app, page } = await openApp({ size: [960, 640] });
  try {
    await insertName(page, 'ethanol');
    await insertName(page, 'benzene');
    await insertName(page, 'acetic acid');
    await insertName(page, 'benzene');
    await insertName(page, 'ethanol');
    const text = (await page.getByTestId('zoom-reset').textContent()) ?? '';
    expect(Number.parseInt(text, 10)).toBeLessThan(150);
    await expectInView(page);
  } finally {
    await app.close();
  }
});

test('"eth" shows 8 rows; arrow down once and Enter inserts the second (ethene)', async () => {
  const { app, page } = await openApp();
  try {
    await field(page).click();
    await field(page).fill('eth');
    await expect(page.getByTestId('name-row')).toHaveCount(8);
    await expect(page.getByTestId('name-row').first()).toHaveAttribute('aria-selected', 'true');
    // Screen 06: rows 36 px high, the dropdown at least 320 px wide.
    const row = await page.getByTestId('name-row').first().boundingBox();
    const list = await page.getByRole('listbox').boundingBox();
    expect(row?.height).toBe(36);
    expect(list?.width).toBeGreaterThanOrEqual(320);
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('name-row').nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText('Inserted ethene');
    await expect(page.getByTestId('name-row')).toHaveCount(0);
    await expect(page.getByTestId('formula')).toHaveText('C2H4 · 28.05 g/mol');
  } finally {
    await app.close();
  }
});

test('clicking a dropdown row inserts it and keeps focus in the field', async () => {
  const { app, page } = await openApp();
  try {
    await field(page).click();
    await field(page).fill('eth');
    await page.getByTestId('name-row').nth(3).click();
    await expect(page.getByRole('status')).toContainText('Inserted ethanol');
    await expect(field(page)).toBeFocused();
    await expect(field(page)).toHaveValue('');
  } finally {
    await app.close();
  }
});

test('Esc closes the dropdown, then clears the text, then focuses the canvas', async () => {
  const { app, page } = await openApp();
  try {
    await field(page).click();
    await field(page).fill('eth');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('name-row')).toHaveCount(0);
    await expect(field(page)).toHaveValue('eth');
    await page.keyboard.press('Escape');
    await expect(field(page)).toHaveValue('');
    await expect(field(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('canvas')).toBeFocused();
    await page.keyboard.press('Control+f');
    await expect(field(page)).toBeFocused();
  } finally {
    await app.close();
  }
});

test('"ethanl" + Enter shows the not-found row and chips; a chip inserts ethanol', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanl');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('No compound named “ethanl”.');
    await expect(alert).toContainText('Did you mean');
    await expect(page.getByTestId('name-chip')).toHaveText(['ethanol', 'ethane', 'acetaldehyde']);
    await expect(page.getByTestId('namefield')).toHaveClass(/is-notfound/);
    await expect(parts(page, 'atom:')).toHaveCount(0);
    await page.getByTestId('name-chip').first().click();
    await expect(page.getByRole('status')).toContainText('Inserted ethanol');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(field(page)).toBeFocused();
  } finally {
    await app.close();
  }
});

test('the empty-state chips insert ethanol and benzene', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByRole('button', { name: 'ethanol', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Inserted ethanol');
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await page.getByRole('button', { name: 'benzene', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Inserted benzene');
  } finally {
    await app.close();
  }
});

test('a molecule inserted while zoomed in and panned away frames the drawing (V7)', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanol');
    // Zoom to 400 %, pan the drawing away, then insert.
    for (let i = 0; i < 4; i++) await page.keyboard.press('Control+=');
    await page.getByTestId('canvas').hover();
    await page.mouse.wheel(900, 0);
    const before = await contentTransform(page);
    await insertName(page, 'benzene');
    expect(await contentTransform(page)).not.toBe(before);
    await expectInView(page);
    await expectCentred(page);
    await expect(page.getByTestId('zoom-reset')).toHaveText('150%');
  } finally {
    await app.close();
  }
});

test('host-direct focus requests move focus to the actual name input repeatedly', async () => {
  const { app, page } = await openApp();
  try {
    for (let i = 0; i < 2; i++) {
      await page.getByTestId('canvas').focus();
      await page.evaluate(() =>
        (
          window as Window & { __chalkbondTest?: { run(cmd: 'focus-name-field'): void } }
        ).__chalkbondTest?.run('focus-name-field'),
      );
      await expect(field(page)).toBeFocused();
    }
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+f');
    await expect(field(page)).toBeFocused();
  } finally {
    await app.close();
  }
});

test('right-click selects the whole ethanol fragment and activates Select', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanol');
    await page.keyboard.press('Escape');
    await page.getByTestId('tool-bond').click();
    const doc = await readDocument(page);
    const atom = Object.values(doc.atoms)[0];
    if (!atom) throw new Error('no atom');
    const point = await canvasPoint(page, atom);
    await page.mouse.click(point.x, point.y, { button: 'right' });
    const selection = await readSelection(page);
    expect(selection.atoms).toHaveLength(3);
    expect(selection.bonds).toHaveLength(2);
    await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await app.close();
  }
});
