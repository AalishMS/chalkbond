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

const TOOL_IDS = [
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
] as const;

const near = (actual: number, expected: number, tol = 1): void => {
  expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(tol);
};

async function checkRail(page: Page): Promise<void> {
  const rail = await box(page.getByTestId('rail'));
  const boxes: Box[] = [];
  for (const id of TOOL_IDS) boxes.push(await box(page.getByTestId(`tool-${id}`)));
  const first = boxes[0] as Box;
  for (const b of boxes) {
    near(b.x - rail.x, 4);
    near(b.width, 56);
    near(b.height, 48);
  }
  near(first.y - rail.y, 8);
  // Groups: select/erase, bond/chain/ring/atom, arrow/plus/curved/text.
  const groupEnds = new Set([1, 5]);
  boxes.forEach((b, i) => {
    const prev = boxes[i - 1];
    if (!prev) return;
    const gap = b.y - (prev.y + prev.height);
    near(gap, groupEnds.has(i - 1) ? 17 : 2);
  });
  // Separators 32x1, 8 above and below.
  const seps = page.getByTestId('rail').getByRole('separator');
  expect(await seps.count()).toBe(2);
  for (const [i, afterButton] of [
    [0, 1],
    [1, 5],
  ] as const) {
    const s = await box(seps.nth(i));
    const above = boxes[afterButton] as Box;
    const below = boxes[afterButton + 1] as Box;
    near(s.width, 32);
    near(s.height, 1);
    near(s.x - rail.x, 16);
    near(s.y - (above.y + above.height), 8);
    near(below.y - (s.y + s.height), 8);
  }
  // Captions: 11 px, weight 500, level across all ten buttons.
  for (const [i, id] of TOOL_IDS.entries()) {
    const caption = page.getByTestId(`tool-${id}`).locator('.rail-caption');
    const c = await box(caption);
    const b = boxes[i] as Box;
    near(c.y - b.y, 28);
    near(c.height, 14);
    const style = await caption.evaluate((el) => {
      const s = getComputedStyle(el);
      return { size: s.fontSize, weight: s.fontWeight };
    });
    expect(style).toEqual({ size: '11px', weight: '500' });
  }
  // The icon box (24 px) sits 4 px below the button top.
  for (const [i, id] of TOOL_IDS.entries()) {
    const face = page.getByTestId(`tool-${id}`).locator('.icon, .rail-glyph').first();
    const f = await box(face);
    const b = boxes[i] as Box;
    near(f.y - b.y, 4);
    near(f.height, 24);
  }
}

for (const size of [
  [1280, 800],
  [960, 640],
] as const satisfies readonly Size[]) {
  test(`tool rail boxes and no scrolling at ${size[0]}x${size[1]}`, async () => {
    const { app, page } = await openApp({ size: [...size] });
    try {
      await checkRail(page);
      const scroll = await page
        .getByTestId('rail')
        .evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
      expect(scroll.sh).toBeLessThanOrEqual(scroll.ch);
    } finally {
      await app.close();
    }
  });
}

test('selected tool shows the 3x24 accent bar and the tinted background', async () => {
  const { app, page } = await openApp();
  try {
    const bond = page.getByTestId('tool-bond');
    const bar = await bond.evaluate((el) => {
      const s = getComputedStyle(el, '::before');
      return {
        w: s.width,
        h: s.height,
        left: s.left,
        top: s.top,
        bg: s.backgroundColor,
        host: getComputedStyle(el).backgroundColor,
      };
    });
    expect(bar).toEqual({
      w: '3px',
      h: '24px',
      left: '-4px',
      top: '12px',
      bg: 'rgb(31, 95, 209)',
      host: 'rgb(227, 236, 251)',
    });
    const other = await page.getByTestId('tool-erase').evaluate((el) => {
      return getComputedStyle(el, '::before').content;
    });
    expect(other).toBe('none');
  } finally {
    await app.close();
  }
});

test('clicking tools and options changes tool and variant, not focus', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-ring').click();
    await expect(page.getByTestId('tool-ring')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tool-bond')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('opt-cyclopentane').click();
    await expect(page.getByTestId('opt-cyclopentane')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tool-ring').locator('use')).toHaveAttribute('href', '#ring-5');
    // K5: a mouse press does not take focus; it stays on the canvas, which has it at launch.
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(
      'canvas',
    );
    await page.getByTestId('tool-atom').click();
    await page.getByTestId('opt-N').click();
    await expect(page.getByTestId('tool-atom').locator('.rail-glyph')).toHaveText('N');
  } finally {
    await app.close();
  }
});

test('option buttons are 32x32 and 2 px apart; the Atom bar fits at 960', async () => {
  const { app, page } = await openApp({ size: [960, 640] });
  try {
    await page.getByTestId('tool-bond').click();
    const ids = ['single', 'double', 'triple', 'wedge', 'hash'];
    let prev: Box | undefined;
    for (const id of ids) {
      const b = await box(page.getByTestId(`opt-${id}`));
      near(b.width, 32);
      near(b.height, 32);
      if (prev) near(b.x - (prev.x + prev.width), 2);
      prev = b;
    }
    await page.getByTestId('tool-atom').click();
    const fits = await page
      .getByTestId('options')
      .evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(fits.sw).toBe(fits.cw);
    const c = await box(page.getByTestId('opt-C'));
    near(c.height, 32);
    // Select actions: 32 high, 2 px apart, disabled ones carry aria-disabled.
    await page.getByTestId('tool-select').click();
    const clean = await box(page.getByTestId('act-clean'));
    const kek = await box(page.getByTestId('act-kekule'));
    near(clean.height, 32);
    near(kek.height, 32);
    near(kek.x - (clean.x + clean.width), 2);
    // The toggle reserves the width of its longer label (Show Kekulé, 108.8 px).
    near(kek.width, 109, 0.5);
    const label = await box(page.getByTestId('act-kekule').locator('span'));
    expect(label.x + label.width).toBeLessThanOrEqual(kek.x + kek.width - 4);
    expect(
      await page.getByTestId('act-kekule').evaluate((el) => el.scrollWidth),
    ).toBeLessThanOrEqual(kek.width);
    await expect(page.getByTestId('act-kekule')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('act-expand')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

async function checkTopAndStatus(page: Page, [w]: Size): Promise<void> {
  // Without host actions the original editor clamp and positions stay unchanged.
  const field = await box(page.getByTestId('namefield'));
  near(field.x, 12);
  near(field.height, 32);
  const hasActions = (await page.getByTestId('topbar-actions').count()) > 0;
  if (hasActions) {
    await expect(page.getByTestId('topbar')).toHaveClass(/has-actions/);
    near(field.width, w < 1100 ? 204 : Math.floor(Math.min(360, Math.max(240, 0.26 * w))));
  } else {
    await expect(page.getByTestId('topbar')).not.toHaveClass(/has-actions/);
    await expect(page.getByTestId('topbar-actions')).toHaveCount(0);
    near(field.width, Math.floor(Math.min(360, Math.max(240, 0.26 * w))));
  }
  near(field.y, 8);
  const icon = await box(page.getByTestId('namefield').locator('.icon'));
  near(icon.x - field.x, 8);
  near(icon.y - field.y, 6);
  near(icon.width, 20);
  // Divider 1x24 with 12 px either side; the options bar starts 12 px after it.
  const divider = await box(page.getByTestId('topbar').locator('.divider-v'));
  near(divider.width, 1);
  near(divider.height, 24);
  near(divider.x - (field.x + field.width), 12);
  const options = await box(page.getByTestId('options'));
  near(options.x - (divider.x + divider.width), 12);
  // Undo / Redo: 32x32, 4 apart, 12 px from the right edge.
  const undo = await box(page.getByTestId('undo'));
  const redo = await box(page.getByTestId('redo'));
  for (const b of [undo, redo]) {
    near(b.width, 32);
    near(b.height, 32);
    near(b.y, 8);
  }
  near(redo.x - (undo.x + undo.width), 4);
  if (hasActions) {
    const actions = await box(page.getByTestId('topbar-actions'));
    near(actions.x - (redo.x + redo.width), w < 1100 ? 8 : 12);
    near(w - (actions.x + actions.width), 12);
  } else near(w - (redo.x + redo.width), 12);
  await expect(page.getByTestId('undo')).toHaveAttribute('aria-disabled', 'true');

  // Status bar controls: 24 high, readout 48 wide, preset segments 64x24, 2 px apart.
  const ids = ['zoom-out', 'zoom-reset', 'zoom-in', 'zoom-fit'] as const;
  const zoom: Box[] = [];
  for (const id of ids) zoom.push(await box(page.getByTestId(id)));
  for (const b of zoom) near(b.height, 24);
  near((zoom[1] as Box).width, 48);
  for (let i = 1; i < zoom.length; i++) {
    const a = zoom[i - 1] as Box;
    near((zoom[i] as Box).x - (a.x + a.width), 2);
  }
  const fit = zoom[3] as Box;
  near(w - (fit.x + fit.width), 12);
  const slides = await box(page.getByTestId('preset-slides'));
  const handout = await box(page.getByTestId('preset-handout'));
  for (const b of [slides, handout]) {
    near(b.width, 64);
    near(b.height, 24);
  }
  near(handout.x - (slides.x + slides.width), 0);
  const group = await box(page.getByRole('radiogroup', { name: 'Style' }));
  near(group.height, 28);
  near(group.width, 132);
  // Centred in the 28 px bar, the outline inside it.
  const bar = await box(page.getByTestId('statusbar'));
  near(group.y + group.height / 2, bar.y + 1 + 14);
  expect(group.y).toBeGreaterThanOrEqual(bar.y + 1 - 0.5);
  expect(group.y + group.height).toBeLessThanOrEqual(bar.y + bar.height + 0.5);
  near((zoom[0] as Box).x - (group.x + group.width), 16);
  await expect(page.getByTestId('preset-slides')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('zoom-reset')).toHaveText('150%');
  // The formula slot is not rendered with an empty document, and is hidden below 1000 px.
  await expect(page.getByTestId('formula')).toHaveCount(0);

  // The hint fills the rest of the status bar, 12 px in from the left.
  const hint = await box(page.getByRole('status'));
  near(hint.x, 12);

  // Every control is at least 24 px (SC6); the preset segments sit inside a 24 px outline.
  const small = await page.locator('.editor button').evaluateAll((els) =>
    els
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.getAttribute('data-testid') ?? '', w: r.width, h: r.height };
      })
      .filter((b) => (b.w < 24 || b.h < 24) && !b.id.startsWith('preset-')),
  );
  expect(small).toEqual([]);
}

for (const size of [
  [1280, 800],
  [960, 640],
] as const satisfies readonly Size[]) {
  test(`top bar and status bar boxes at ${size[0]}x${size[1]}`, async () => {
    const { app, page } = await openApp({ size: [...size] });
    try {
      await checkTopAndStatus(page, [...size]);
    } finally {
      await app.close();
    }
  });

  test(`empty state is centred 16 px above the canvas centre at ${size[0]}x${size[1]}`, async () => {
    const { app, page } = await openApp({ size: [...size] });
    try {
      const canvas = await box(page.getByTestId('canvas'));
      const art = await box(page.locator('.empty-art'));
      const text = await box(page.locator('.empty-text'));
      const chips = await box(page.locator('.empty-try'));
      near(art.width, 96);
      near(art.height, 96);
      near(text.y - (art.y + art.height), 16);
      near(chips.y - (text.y + text.height), 12);
      const top = art.y;
      const bottom = chips.y + chips.height;
      near((top + bottom) / 2, canvas.y + canvas.height / 2 - 16, 1);
      near(art.x + art.width / 2, canvas.x + canvas.width / 2);
      const chipBoxes = await page.locator('.chip').evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, w: r.width, h: r.height };
        }),
      );
      expect(chipBoxes).toHaveLength(3);
      for (const c of chipBoxes) near(c.h, 28);
      near(
        (chipBoxes[1] as { x: number }).x -
          ((chipBoxes[0] as { x: number; w: number }).x +
            (chipBoxes[0] as { x: number; w: number }).w),
        8,
      );
    } finally {
      await app.close();
    }
  });
}

// ---- R56: the `tabs` host slot ---------------------------------------------------------------
//
// The editor is only ever mounted by the app, which does not pass `tabs` until TB20. So this is a
// component-level probe of the CSS contract: it gives the live editor the DOM the React markup
// gives it with `tabs` (the `has-tabs` class, a `tabs-slot` between the rail and the canvas and
// the canvas inside a `canvas-panel`; the markup itself is pinned by `Editor.test.tsx`) and
// measures the boxes. The real strip and its e2e are TB24 and TB27.

const STRIP_H = 33;

async function giveTabsSlot(page: Page): Promise<void> {
  await page.evaluate((h) => {
    const root = document.querySelector('.editor');
    const canvas = root?.querySelector('[data-testid="canvas"]');
    if (!root || !canvas) throw new Error('no editor');
    root.classList.add('has-tabs');
    const slot = document.createElement('div');
    slot.className = 'tabs-slot';
    slot.setAttribute('data-testid', 'tabs-slot');
    slot.style.height = `${h}px`;
    const panel = document.createElement('div');
    panel.className = 'canvas-panel';
    panel.setAttribute('data-testid', 'canvas-panel');
    panel.setAttribute('role', 'tabpanel');
    root.insertBefore(slot, canvas);
    root.insertBefore(panel, canvas);
    panel.appendChild(canvas);
  }, STRIP_H);
}

for (const size of [
  [1280, 800],
  [960, 640],
] as const satisfies readonly Size[]) {
  test(`tabs slot at ${size[0]}x${size[1]}: strip above the canvas, rail unchanged, viewport follows`, async () => {
    const { app, page } = await openApp({ size: [...size] });
    try {
      const w = size[0];
      const railBefore = await box(page.getByTestId('rail'));
      const canvasBefore = await box(page.getByTestId('canvas'));
      await giveTabsSlot(page);

      const rail = await box(page.getByTestId('rail'));
      const strip = await box(page.getByTestId('tabs-slot'));
      const canvas = await box(page.getByTestId('canvas'));
      const panel = await box(page.getByTestId('canvas-panel'));
      const top = await box(page.getByTestId('topbar'));
      const status = await box(page.getByTestId('statusbar'));

      // The rail keeps its place and height (the strip is not above it).
      near(rail.x, railBefore.x);
      near(rail.y, railBefore.y);
      near(rail.width, railBefore.width);
      near(rail.height, railBefore.height);
      // The strip: directly under the top bar's line, right of the rail, the column's width,
      // the height of its content.
      near(strip.x, 65);
      near(strip.y, top.y + top.height);
      near(strip.width, w - 65);
      near(strip.height, STRIP_H);
      // The canvas fills the rest of the column: the panel and the canvas have the same box.
      near(canvas.x, 65);
      near(canvas.y, strip.y + strip.height);
      near(canvas.width, w - 65);
      near(canvas.height, canvasBefore.height - STRIP_H);
      near(canvas.y + canvas.height, status.y);
      near(panel.x, canvas.x);
      near(panel.y, canvas.y);
      near(panel.width, canvas.width);
      near(panel.height, canvas.height);

      // The last rail tool (Text) is still fully visible, so the rail needs no scrolling.
      const text = await box(page.getByTestId('tool-text'));
      expect(text.y + text.height).toBeLessThanOrEqual(rail.y + rail.height);
      const scrolls = await page
        .getByTestId('rail')
        .evaluate((el) => el.scrollHeight > el.clientHeight);
      expect(scrolls).toBe(false);

      // The viewport follows the canvas: the editor's viewport size (the overlay's width and
      // height attributes) becomes the canvas's, the column minus the strip.
      await expect
        .poll(async () => {
          const o = page.getByTestId('overlay');
          return [Number(await o.getAttribute('width')), Number(await o.getAttribute('height'))];
        })
        .toEqual([Math.round(canvas.width), Math.round(canvas.height)]);
    } finally {
      await app.close();
    }
  });
}
