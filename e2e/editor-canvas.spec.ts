import { expect, test, type Locator, type Page } from '@playwright/test';
import { render } from '../src/core/svg-render';
import { goldenDoc, loadDocument, openApp, resizeContent } from './harness';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Content {
  k: number;
  x: number;
  y: number;
}

async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  if (!b) throw new Error('element has no box');
  return b;
}

/** The content layer's transform: `matrix(k 0 0 k x y)`. */
async function content(page: Page): Promise<Content> {
  const attr = await page.locator('[data-layer="content"]').getAttribute('transform');
  const m = /^matrix\(([^ ]+) 0 0 ([^ ]+) ([^ ]+) ([^)]+)\)$/.exec(attr ?? '');
  if (!m) throw new Error(`unexpected transform ${attr}`);
  return { k: Number(m[1]), x: Number(m[3]), y: Number(m[4]) };
}

const readout = (page: Page): Locator => page.getByTestId('zoom-reset');

const near = (actual: number, expected: number, tol = 1): void => {
  expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(tol);
};

/** The union of every mounted part's on-screen box. */
async function ink(page: Page): Promise<Box> {
  return page.evaluate(() => {
    const rects = [...document.querySelectorAll('[data-layer="content"] > [data-key]')].map((g) =>
      g.getBoundingClientRect(),
    );
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return { x: left, y: top, width: right - left, height: bottom - top };
  });
}

test('launch: 150 %, the origin at the canvas centre, empty state shown', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').waitFor();
    await expect(readout(page)).toHaveText('150%');
    const c = await box(page.getByTestId('canvas'));
    const t = await content(page);
    expect(t.k).toBe(2);
    near(t.x, c.width / 2, 0.5);
    near(t.y, c.height / 2, 0.5);
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.locator('[data-layer="content"] > [data-key]')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('a loaded document is mounted in paint order, centred, with 80 px bonds', async () => {
  const { app, page } = await openApp();
  try {
    const doc = goldenDoc('ethanol');
    await loadDocument(page, doc);
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
    await expect(readout(page)).toHaveText('150%');
    const keys = await page
      .locator('[data-layer="content"] > [data-key]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-key')));
    // Paint order: the DOM order is svg-render's part order.
    expect(keys).toEqual(render(doc).parts.map((p) => p.key));
    expect(keys.length).toBeGreaterThanOrEqual(3);
    // Every bond has a part; a skeleton carbon has none, a labelled atom (the O) does.
    for (const id of Object.keys(doc.bonds)) expect(keys).toContain(`bond:${id}`);
    const labelled = Object.entries(doc.atoms).filter(([, a]) => a.element !== 'C');
    expect(labelled.length).toBeGreaterThan(0);
    for (const [id] of labelled) expect(keys).toContain(`atom:${id}`);

    // The ink box is centred in the canvas.
    const c = await box(page.getByTestId('canvas'));
    const i = await ink(page);
    near(i.x + i.width / 2, c.x + c.width / 2, 2);
    near(i.y + i.height / 2, c.y + c.height / 2, 2);

    // A bond between two carbons is 80 px long on screen (path length times the CTM scale).
    const cc = Object.entries(doc.bonds).find(
      ([, bond]) => doc.atoms[bond.a1]?.element === 'C' && doc.atoms[bond.a2]?.element === 'C',
    );
    if (!cc) throw new Error('ethanol has no C-C bond');
    const length = await page.evaluate((key) => {
      const path = document.querySelector(`[data-key="${key}"] path`) as SVGGeometryElement | null;
      const ctm = path?.getScreenCTM();
      if (!path || !ctm) throw new Error('no bond path');
      return path.getTotalLength() * ctm.a;
    }, `bond:${cc[0]}`);
    near(length, 80, 0.1);
  } finally {
    await app.close();
  }
});

test('zoom keys and buttons step through the V1 steps; the readout and fit reset', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').waitFor();
    await page.keyboard.press('Control+=');
    await expect(readout(page)).toHaveText('200%');
    expect((await content(page)).k).toBeCloseTo((2 * 4) / 3, 6);
    await page.getByTestId('zoom-in').click();
    await expect(readout(page)).toHaveText('250%');
    await page.getByTestId('zoom-out').click();
    await page.keyboard.press('Control+-');
    await expect(readout(page)).toHaveText('150%');
    await page.keyboard.press('Control+-');
    await expect(readout(page)).toHaveText('125%');
    await readout(page).click();
    await expect(readout(page)).toHaveText('150%');
    await page.keyboard.press('Control+-');
    await page.keyboard.press('Control+1');
    await expect(readout(page)).toHaveText('150%');
    await page.keyboard.press('Control+-');
    await page.getByTestId('zoom-fit').click();
    await expect(readout(page)).toHaveText('150%');
    await page.keyboard.press('Control+-');
    await page.keyboard.press('Control+0');
    await expect(readout(page)).toHaveText('150%');
  } finally {
    await app.close();
  }
});

test('zoom is clamped to 25-800 %; the buttons grey out at the ends', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').waitFor();
    for (let i = 0; i < 12; i++) await page.keyboard.press('Control+-');
    await expect(readout(page)).toHaveText('25%');
    await expect(page.getByTestId('zoom-out')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('zoom-in')).not.toHaveAttribute('aria-disabled', 'true');
    for (let i = 0; i < 20; i++) await page.keyboard.press('Control+=');
    await expect(readout(page)).toHaveText('800%');
    await expect(page.getByTestId('zoom-in')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('zoom-out')).not.toHaveAttribute('aria-disabled', 'true');
    // The wheel clamps too.
    await page.mouse.move(600, 400);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 20000);
    await page.keyboard.up('Control');
    await expect(readout(page)).toHaveText('25%');
  } finally {
    await app.close();
  }
});

test('Ctrl+wheel zooms about the pointer: the point under it stays put', async () => {
  const { app, page } = await openApp();
  try {
    await loadDocument(page, goldenDoc('ethanol'));
    const before = await content(page);
    const part = await box(page.locator('[data-layer="content"] > [data-key^="bond:"]').first());
    const px = part.x + part.width / 2;
    const py = part.y + part.height / 2;
    const c = await box(page.getByTestId('canvas'));
    await page.mouse.move(px, py);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
    await expect.poll(async () => (await content(page)).k).toBeGreaterThan(before.k);
    const after = await content(page);
    expect(after.k / before.k).toBeCloseTo(Math.pow(1.0015, 300), 3);
    // Document point under the pointer, in pt, before and after.
    const sx = px - c.x;
    const sy = py - c.y;
    near((sx - after.x) / after.k, (sx - before.x) / before.k, 1 / after.k);
    near((sy - after.y) / after.k, (sy - before.y) / before.k, 1 / after.k);
    // And the part itself grew about that point.
    const grown = await box(page.locator('[data-layer="content"] > [data-key^="bond:"]').first());
    const ratio = after.k / before.k;
    near(grown.x + grown.width / 2, px + (part.x + part.width / 2 - px) * ratio, 1);
    near(grown.y + grown.height / 2, py + (part.y + part.height / 2 - py) * ratio, 1);
  } finally {
    await app.close();
  }
});

test('wheel scrolls vertically, Shift+wheel horizontally', async () => {
  const { app, page } = await openApp();
  try {
    await loadDocument(page, goldenDoc('ethanol'));
    await page.mouse.move(600, 400);
    const a = await content(page);
    await page.mouse.wheel(0, 100);
    await expect.poll(async () => (await content(page)).y).toBeCloseTo(a.y - 100, 3);
    expect((await content(page)).x).toBeCloseTo(a.x, 3);
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 60);
    await page.keyboard.up('Shift');
    await expect.poll(async () => (await content(page)).x).toBeCloseTo(a.x - 60, 3);
    expect((await content(page)).y).toBeCloseTo(a.y - 100, 3);
  } finally {
    await app.close();
  }
});

test('Space+drag and middle-drag pan by the drag; the parts keep their elements', async () => {
  const { app, page } = await openApp();
  try {
    await loadDocument(page, goldenDoc('ethanol'));
    // Mark a part's element: panning and zooming must not replace it.
    await page.evaluate(() => {
      const g = document.querySelector('[data-layer="content"] > [data-key]');
      (g as unknown as { mark: string }).mark = 'kept';
    });
    const a = await content(page);
    await page.mouse.move(400, 300);
    await page.keyboard.down('Space');
    await expect(page.getByTestId('canvas')).toHaveAttribute('data-space', '');
    await page.mouse.down();
    await page.mouse.move(450, 325, { steps: 4 });
    await page.mouse.move(500, 350, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    await expect.poll(async () => (await content(page)).x).toBeCloseTo(a.x + 100, 3);
    expect((await content(page)).y).toBeCloseTo(a.y + 50, 3);

    const b = await content(page);
    await page.mouse.move(400, 300);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(380, 330, { steps: 3 });
    await page.mouse.up({ button: 'middle' });
    await expect.poll(async () => (await content(page)).x).toBeCloseTo(b.x - 20, 3);
    expect((await content(page)).y).toBeCloseTo(b.y + 30, 3);

    await page.keyboard.press('Control+=');
    const kept = await page.evaluate(() => {
      const g = document.querySelector('[data-layer="content"] > [data-key]');
      return (g as unknown as { mark?: string }).mark;
    });
    expect(kept).toBe('kept');
  } finally {
    await app.close();
  }
});

test('a plain drag does not pan', async () => {
  const { app, page } = await openApp();
  try {
    await loadDocument(page, goldenDoc('ethanol'));
    const a = await content(page);
    await page.mouse.move(400, 300);
    await page.mouse.down();
    await page.mouse.move(500, 350, { steps: 3 });
    await page.mouse.up();
    expect(await content(page)).toEqual(a);
  } finally {
    await app.close();
  }
});

test('fit shrinks a large drawing with a 48 px margin and never zooms past 150 %', async () => {
  const { app, page } = await openApp();
  try {
    await loadDocument(page, goldenDoc('reaction-conditions'));
    await page.keyboard.press('Control+=');
    await page.keyboard.press('Control+=');
    await page.getByTestId('zoom-fit').click();
    const percent = Number((await readout(page).innerText()).replace('%', ''));
    expect(percent).toBeLessThanOrEqual(150);
    const c = await box(page.getByTestId('canvas'));
    const i = await ink(page);
    near(i.x + i.width / 2, c.x + c.width / 2, 2);
    near(i.y + i.height / 2, c.y + c.height / 2, 2);
    if (percent < 150) {
      // Fits with the margin: the ink box plus 48 px is inside the canvas.
      expect(i.x - c.x).toBeGreaterThanOrEqual(47);
      expect(c.x + c.width - (i.x + i.width)).toBeGreaterThanOrEqual(47);
      expect(i.y - c.y).toBeGreaterThanOrEqual(47);
      expect(c.y + c.height - (i.y + i.height)).toBeGreaterThanOrEqual(47);
    }
  } finally {
    await app.close();
  }
});

test('resizing the window keeps the document point under the canvas centre', async () => {
  const { app, page } = await openApp();
  try {
    await loadDocument(page, goldenDoc('ethanol'));
    const before = await content(page);
    const c0 = await box(page.getByTestId('canvas'));
    await resizeContent(app, [960, 640]);
    await page.waitForFunction(() => window.innerWidth === 960 && window.innerHeight === 640);
    await expect
      .poll(async () => (await box(page.getByTestId('canvas'))).width)
      .toBeCloseTo(960 - 65, 0);
    const c1 = await box(page.getByTestId('canvas'));
    const after = await content(page);
    expect(after.k).toBe(before.k);
    near((c1.width / 2 - after.x) / after.k, (c0.width / 2 - before.x) / before.k, 0.01);
    near((c1.height / 2 - after.y) / after.k, (c0.height / 2 - before.y) / before.k, 0.01);
  } finally {
    await app.close();
  }
});
