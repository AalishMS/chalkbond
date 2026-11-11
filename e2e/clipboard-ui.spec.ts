// Copy button boxes, keyboard and states on every platform (SPEC-clipboard-export.md "Copy
// button", SC10, SC11). The first group never presses an enabled Copy, so the real clipboard is
// never written. The "UI success" group stubs main's `clipboard.write` (e2e/stub-clipboard-write.mjs)
// at the transport boundary and keeps the real flow and rasteriser: it checks the window's
// feedback only and is NOT proof of what reaches the Windows clipboard (e2e/win/clipboard-copy.spec.ts).
import { expect, test, type Locator, type Page } from '@playwright/test';
import { heardNotices, openApp, readDocument, readSelection } from './harness';
import { loadScheme, selectEthanol } from './fixtures';

const box = async (l: Locator) => {
  const b = await l.boundingBox();
  if (!b) throw new Error('no box');
  return b;
};
const near = (actual: number, expected: number): void =>
  expect(Math.abs(actual - expected), `${actual} ≈ ${expected}`).toBeLessThanOrEqual(0.5);

test('Copy at 1280 × 800: 32 high, at least 84 wide, 12 px after Redo, right edge at 1268', async () => {
  const { app, page } = await openApp({ size: [1280, 800] });
  try {
    const copy = page.getByTestId('copy');
    await expect(copy.locator('svg')).toHaveCount(1); // the resize to 1280 has reached React
    const b = await box(copy);
    const redo = await box(page.getByTestId('redo'));
    near(b.height, 32);
    expect(b.width).toBeGreaterThanOrEqual(84);
    near(b.x - (redo.x + redo.width), 12);
    near(b.x + b.width, 1268);
    near(b.y + b.height / 2, redo.y + redo.height / 2);
    await expect(copy.locator('svg')).toHaveCount(1);
    await expect(copy).toHaveText('Copy');
    await expect(copy).toHaveAccessibleName('Copy (Ctrl+C)');
    await expect(copy).toHaveAttribute('aria-disabled', 'true'); // empty document
  } finally {
    await app.close();
  }
});

test('Copy at 960 × 640: label only, 8 px after Redo, name field 204; the Atom options fit', async () => {
  const { app, page } = await openApp({ size: [960, 640] });
  try {
    const copy = page.getByTestId('copy');
    await expect(copy.locator('svg')).toHaveCount(0);
    const b = await box(copy);
    const redo = await box(page.getByTestId('redo'));
    near(b.height, 32);
    expect(b.width).toBeGreaterThanOrEqual(56);
    near(b.x - (redo.x + redo.width), 8);
    near(b.x + b.width, 948);
    await expect(copy.locator('svg')).toHaveCount(0);
    await expect(copy).toHaveText('Copy');
    near((await box(page.getByTestId('namefield'))).width, 204);
    await page.getByTestId('tool-atom').click();
    const options = page.getByTestId('options');
    expect(await options.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    const last = page.getByTestId('opt-delta-minus');
    await expect(last).toBeVisible();
    const o = await box(options);
    const l = await box(last);
    expect(l.x + l.width).toBeLessThanOrEqual(o.x + o.width);
  } finally {
    await app.close();
  }
});

test('Copy keyboard and focus: Redo → Copy → rail; disabled stays focusable; a press keeps canvas focus', async () => {
  const { app, page } = await openApp();
  try {
    const copy = page.getByTestId('copy');
    await expect(copy).toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('redo').focus();
    await page.keyboard.press('Tab');
    await expect(copy).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('rail').locator('[tabindex="0"]')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(copy).toBeFocused();

    // The editor's tooltip on hover, with the disabled reason as its help.
    const b = await box(copy);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible();
    await expect(tip.locator('.tooltip-title span')).toHaveText('Copy');
    await expect(tip.locator('kbd')).toHaveText('Ctrl+C');
    await expect(tip).toContainText('Draw something first.');

    // K5: a mouse press on Copy (disabled here: nothing is written) leaves the focus on the canvas.
    await page.getByTestId('canvas').focus();
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.getByTestId('canvas')).toBeFocused();
    expect(await heardNotices(page)).toEqual([]);
  } finally {
    await app.close();
  }
});

test('Ctrl+C on an empty drawing says N-C4 and writes nothing', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+c');
    await expect
      .poll(() => heardNotices(page))
      .toEqual([{ kind: 'info', text: 'Nothing to copy yet. Draw something first.' }]);
    await expect(page.getByTestId('copy')).toHaveText('Copy');
  } finally {
    await app.close();
  }
});

test.describe('UI success (stubbed main clipboard.write; not Windows clipboard proof)', () => {
  const launch = { clipboardWriteSuccess: true };
  const lastNotice = async (page: Page) => (await heardNotices(page)).at(-1)?.text;

  test('Copy button, whole drawing: Copied for 2 s, N-C2, editor untouched', async () => {
    const { app, page } = await openApp({ launch });
    try {
      const doc = await loadScheme(page);
      const copy = page.getByTestId('copy');
      await expect(copy).toHaveAttribute('aria-disabled', 'false');
      const rest = await box(copy);
      await page.getByTestId('canvas').focus();
      await copy.click();
      await expect(copy).toHaveText('Copied');
      await expect(copy.locator('use')).toHaveAttribute('href', '#check');
      // As A02: the right edge stays 12 px from the window; "Copied" may need a few px more.
      const copied = await box(copy);
      expect(copied.width).toBeGreaterThanOrEqual(rest.width);
      near(copied.x + copied.width, 1268);
      await expect(page.getByTestId('canvas')).toBeFocused();
      await expect
        .poll(() => lastNotice(page))
        .toBe('Copied the whole drawing. Paste into PowerPoint or Word with Ctrl+V.');
      const s = await readSelection(page);
      expect(s.atoms.length + s.bonds.length + s.objects.length).toBe(0);
      // Ctrl+V is the host's paste (CB-K), never the editor's own: with main's write stubbed and
      // the clipboard cleared it finds nothing (N-P2), and the drawing is unchanged.
      await app.evaluate(({ clipboard }) => clipboard.clear());
      await page.keyboard.press('Control+v');
      await expect
        .poll(() => lastNotice(page))
        .toBe('Nothing to paste. Copy a drawing, or a compound name, first.');
      expect(await readDocument(page)).toEqual(doc);
      await expect(copy).toHaveText('Copy', { timeout: 3000 });
    } finally {
      await app.close();
    }
  });

  test('Ctrl+C: whole drawing with nothing selected, the selection with ethanol selected; Ctrl+X cuts', async () => {
    const { app, page } = await openApp({ launch });
    try {
      await loadScheme(page);
      await page.getByTestId('canvas').focus();
      await page.keyboard.press('Control+c');
      await expect(page.getByTestId('copy')).toHaveText('Copied');
      await expect
        .poll(() => lastNotice(page))
        .toBe('Copied the whole drawing. Paste into PowerPoint or Word with Ctrl+V.');

      await selectEthanol(page);
      const selected = await readSelection(page);
      await page.keyboard.press('Control+c');
      await expect
        .poll(() => lastNotice(page))
        .toBe('Copied. Paste into PowerPoint or Word with Ctrl+V.');
      expect(await readSelection(page)).toEqual(selected);

      const before = Object.keys((await readDocument(page)).atoms).length;
      await page.keyboard.press('Control+x');
      await expect
        .poll(() => lastNotice(page))
        .toBe('Cut. Paste into PowerPoint or Word with Ctrl+V.');
      expect(Object.keys((await readDocument(page)).atoms)).toHaveLength(before - 3);
    } finally {
      await app.close();
    }
  });

  test('compact Copied at 960: the word without the check, the button may widen', async () => {
    const { app, page } = await openApp({ size: [960, 640], launch });
    try {
      await loadScheme(page);
      const copy = page.getByTestId('copy');
      await copy.click();
      await expect(copy).toHaveText('Copied');
      await expect(copy.locator('svg')).toHaveCount(0);
      const b = await box(copy);
      expect(b.width).toBeGreaterThanOrEqual(56);
      near(b.x + b.width, 948);
    } finally {
      await app.close();
    }
  });
});
