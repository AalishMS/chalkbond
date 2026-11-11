// A18: the accessibility pass for the new UI of app-shell and clipboard-export (names, roles,
// focus order, visible focus rings, dialog focus trap and return, hit targets, reduced motion, the
// hint slot). The editor's own facts are in editor-a11y.spec.ts. Contrast pairs (V2) are checked
// by tests/tooling/shell-tokens.test.ts, not here. The Copy button is only pressed in the
// "UI success" test, with main's clipboard.write stubbed.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { loadScheme } from './fixtures';
import { openApp } from './harness';

interface Ring {
  id: string;
  width: number;
  style: string;
  color: string;
}

/** The focused element's test id (or tag) and its computed outline. */
const focusRing = (page: Page): Promise<Ring> =>
  page.evaluate(() => {
    const el = document.activeElement;
    const css = el ? getComputedStyle(el) : null;
    return {
      id: el?.getAttribute('data-testid') ?? el?.tagName.toLowerCase() ?? 'none',
      width: css ? parseFloat(css.outlineWidth) : 0,
      style: css?.outlineStyle ?? 'none',
      color: css?.outlineColor ?? '',
    };
  });

const expectRing = (ring: Ring): void => {
  expect(ring.style, `${ring.id} outline style`).toBe('solid');
  expect(ring.width, `${ring.id} outline width`).toBeGreaterThanOrEqual(2);
  expect(ring.color, `${ring.id} outline colour`).not.toBe('rgba(0, 0, 0, 0)');
};

/** Every new control is a named control with a box of at least 24 × 24 (spec Accessibility). */
async function expectTarget(control: Locator): Promise<void> {
  const box = await control.boundingBox();
  expect(box, 'a visible box').not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
}

/** The test id of the focused element, and whether it sits inside `selector`. */
const focusIn = (page: Page, selector: string): Promise<boolean> =>
  page.evaluate((sel) => document.activeElement?.closest(sel) != null, selector);

test('Tab from the name field reaches Undo, Redo, then Copy, then the rail', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-bond').click();
    await page.getByTestId('namefield-input').focus();
    const order: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab');
      const stop = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          id: el?.getAttribute('data-testid') ?? el?.tagName.toLowerCase() ?? 'none',
          rail: el?.closest('[data-testid="rail"]') != null,
        };
      });
      order.push(stop.rail ? 'rail' : stop.id);
      if (stop.rail) break;
    }
    const at = (id: string): number => order.indexOf(id);
    expect(at('undo'), order.join(' > ')).toBeGreaterThan(-1);
    expect(at('redo')).toBe(at('undo') + 1);
    expect(at('copy')).toBe(at('redo') + 1);
    expect(order.at(-1)).toBe('rail');
    expect(order.indexOf('rail')).toBe(at('copy') + 1);
    // The options come between the name field and Undo (they are the first stops).
    expect(at('undo')).toBeGreaterThan(0);
  } finally {
    await app.close();
  }
});

test('Copy: role, name, 24 px target and a 2 px ring on keyboard focus, disabled or not', async () => {
  const { app, page } = await openApp();
  try {
    const copy = page.getByRole('button', { name: 'Copy (Ctrl+C)' });
    await expect(copy).toHaveCount(1);
    await expectTarget(copy);
    await page.getByTestId('redo').focus();
    await page.keyboard.press('Tab');
    await expect(copy).toBeFocused();
    expectRing(await focusRing(page));
    expect(await copy.evaluate((el) => getComputedStyle(el).outlineOffset), 'ring offset').toBe(
      '2px',
    );
  } finally {
    await app.close();
  }
});

test('Export dialog: role, name, trap, rings, names, targets, focus return', async () => {
  const { app, page } = await openApp();
  try {
    await loadScheme(page);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+e');
    const dialog = page.getByRole('dialog', { name: 'Export drawing' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    const format = dialog.getByRole('radiogroup', { name: 'Format' });
    for (const name of [/PNG picture/, /SVG drawing/, /PDF document/]) {
      const card = format.getByRole('radio', { name });
      await expect(card).toHaveCount(1);
      await expectTarget(card);
    }
    const sizes = dialog.getByRole('radiogroup', { name: 'Picture size' });
    for (const name of ['Screen', 'Print', 'Poster']) {
      await expectTarget(sizes.getByRole('radio', { name }));
    }
    await expectTarget(dialog.getByRole('checkbox', { name: /White background/ }));
    await expectTarget(dialog.getByRole('button', { name: 'Cancel' }));
    await expectTarget(dialog.getByRole('button', { name: 'Save…' }));

    // Tab cycles inside the dialog: five stops, then back to the first, never out.
    const first = await focusRing(page);
    expect(await focusIn(page, '[data-testid="export-dialog"]')).toBe(true);
    const stops = [first];
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press('Tab');
      expect(await focusIn(page, '[data-testid="export-dialog"]')).toBe(true);
      stops.push(await focusRing(page));
    }
    expect(stops.map((s) => s.id)).toEqual([
      'export-format-png',
      'export-size-print',
      'export-white',
      'export-cancel',
      'export-save',
      'export-format-png',
    ]);
    for (const stop of stops) expectRing(stop);
    await page.keyboard.press('Shift+Tab');
    expect((await focusRing(page)).id).toBe('export-save');

    // Esc closes it and the focus returns to where it was.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('canvas')).toBeFocused();
  } finally {
    await app.close();
  }
});

test('Keyboard shortcuts dialog: role, name, trap, ring, return', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('F1');
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    const close = dialog.getByRole('button', { name: 'Close' });
    await expectTarget(close);
    for (let i = 0; i < 4; i += 1) {
      expect(await focusIn(page, '[data-testid="shortcuts-dialog"]')).toBe(true);
      await page.keyboard.press('Tab');
    }
    await expect(close).toBeFocused();
    expectRing(await focusRing(page));
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('canvas')).toBeFocused();
  } finally {
    await app.close();
  }
});

test('a scrolling dialog list can be read with the keyboard alone (short window)', async () => {
  const { app, page } = await openApp({ size: [960, 640] });
  try {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('F1');
    const body = page.getByTestId('shortcuts-dialog').locator('.dialog-body');
    await expect(body).toBeVisible();
    const scrolls = await body.evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(scrolls, 'the list overflows at 960 x 640').toBe(true);
    for (const key of ['PageDown', 'End']) {
      const before = await body.evaluate((el) => el.scrollTop);
      await page.keyboard.press(key);
      await expect.poll(() => body.evaluate((el) => el.scrollTop), key).toBeGreaterThan(before);
    }
    await page.keyboard.press('Home');
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBe(0);
    // The focus stayed on the dialog's button throughout.
    await expect(page.getByTestId('shortcuts-close')).toBeFocused();
  } finally {
    await app.close();
  }
});

test('a scrolling Export dialog: ArrowDown on a radio card selects, it does not scroll (R26)', async () => {
  const { app, page } = await openApp({ size: [960, 640] });
  try {
    await loadScheme(page);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+e');
    const body = page.getByTestId('export-dialog').locator('.dialog-body');
    await expect(body).toBeVisible();
    expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await expect(page.getByTestId('export-format-png')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('export-format-svg')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('export-format-svg')).toBeFocused();
    // Give any wrongly started scroll time to show, then check it did not move.
    await page.waitForTimeout(100);
    expect(await body.evaluate((el) => el.scrollTop)).toBe(0);
  } finally {
    await app.close();
  }
});

test('Export dialog: Cancel by mouse returns the focus to the canvas too', async () => {
  const { app, page } = await openApp();
  try {
    await loadScheme(page);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+e');
    await expect(page.getByTestId('export-dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('export-dialog')).toHaveCount(0);
    await expect(page.getByTestId('canvas')).toBeFocused();
  } finally {
    await app.close();
  }
});

test('reduced motion: the dialog and its scrim have no transition or animation', async () => {
  const { app, page } = await openApp();
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadScheme(page);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+e');
    await expect(page.getByTestId('export-dialog')).toBeVisible();
    const motion = await page.evaluate(() =>
      ['.shell-modal', '.scrim', '.dialog'].map((sel) => {
        const css = getComputedStyle(document.querySelector(sel) as Element);
        return {
          sel,
          transition: css.transitionDuration.split(',').every((d) => parseFloat(d) === 0),
          animation: css.animationName === 'none' || parseFloat(css.animationDuration) === 0,
        };
      }),
    );
    for (const m of motion) {
      expect(m.transition, `${m.sel} transition`).toBe(true);
      expect(m.animation, `${m.sel} animation`).toBe(true);
    }
  } finally {
    await app.close();
  }
});

test.describe('UI success (stubbed main clipboard.write; not Windows clipboard proof)', () => {
  test('after a copy the hint slot (role=status) holds the notice', async () => {
    const { app, page } = await openApp({ launch: { clipboardWriteSuccess: true } });
    try {
      await loadScheme(page);
      await page.getByTestId('canvas').focus();
      await page.getByRole('button', { name: 'Copy (Ctrl+C)' }).click();
      await expect(page.getByRole('status')).toContainText('Copied the whole drawing.');
    } finally {
      await app.close();
    }
  });
});
