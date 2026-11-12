import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Doc } from '../src/core/doc-model';
import { canvasPoint, insertName, openApp, readDocument } from './harness';

/** The test id (or tag) of the focused element. */
const focused = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const el = document.activeElement;
    return el?.getAttribute('data-testid') ?? el?.tagName.toLowerCase() ?? 'none';
  });

const tooltip = (page: Page): Locator => page.getByRole('tooltip');
const field = (page: Page): Locator => page.getByTestId('namefield-input');
const atomCount = (d: Doc): number => Object.keys(d.atoms).length;
const xs = (d: Doc): number[] => Object.values(d.atoms).map((a) => a.x);

/** Selectors of every control that takes focus. */
const CONTROLS =
  '.editor button, .editor input, .editor [role="radio"], .editor [role="combobox"], .editor [role="option"]';

// ---- SC5: a keyboard-only walkthrough ------------------------------------------------------

test('keyboard only: name, copy, paste, nudge, undo, tool key, tooltip on focus, preset', async () => {
  const { app, page } = await openApp();
  try {
    expect(await focused(page)).toBe('canvas');

    // 1. Ctrl+F focuses the name field; "ethanol" + Enter inserts, the field stays focused.
    await page.keyboard.press('Control+f');
    expect(await focused(page)).toBe('namefield-input');
    await page.keyboard.type('ethanol');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText('Inserted ethanol');
    expect(atomCount(await readDocument(page))).toBe(3);
    expect(await focused(page)).toBe('namefield-input');
    await expect(field(page)).toHaveValue('');

    // 2. Esc moves focus to the canvas.
    await page.keyboard.press('Escape');
    expect(await focused(page)).toBe('canvas');

    // 3. Ctrl+A selects all, Ctrl+C / Ctrl+V pastes a copy (a second ethanol).
    await page.keyboard.press('Control+a');
    await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    // The host's paste (clipboard-export CB-K) lands after the copy's clipboard write (CB-Q).
    await expect.poll(async () => atomCount(await readDocument(page))).toBe(6);
    const pasted = await readDocument(page);
    expect(atomCount(pasted)).toBe(6);

    // 4. An arrow key nudges the (pasted) selection by 0.1 BLU.
    await page.keyboard.press('ArrowRight');
    const nudged = await readDocument(page);
    const moved = xs(nudged).map((x, i) => x - (xs(pasted)[i] as number));
    expect(moved.filter((d) => Math.abs(d - 0.1) < 1e-9)).toHaveLength(3);
    expect(moved.filter((d) => d === 0)).toHaveLength(3);

    // 5. Ctrl+Z twice undoes the nudge, then the paste.
    await page.keyboard.press('Control+z');
    expect(xs(await readDocument(page))).toEqual(xs(pasted));
    await page.keyboard.press('Control+z');
    expect(atomCount(await readDocument(page))).toBe(3);
    expect(await focused(page)).toBe('canvas');

    // 6. A tool key selects that tool and focus stays on the canvas.
    await page.keyboard.press('b');
    await expect(page.getByTestId('tool-bond')).toHaveAttribute('aria-pressed', 'true');
    expect(await focused(page)).toBe('canvas');

    // 7. Shift+Tab lands on the rail's tab stop (the active tool) and its tooltip opens on focus.
    await page.keyboard.press('Shift+Tab');
    expect(await focused(page)).toBe('tool-bond');
    await expect(tooltip(page).locator('.tooltip-title span')).toHaveText('Bond');
    await expect(tooltip(page).locator('kbd')).toHaveText(['3', 'B']);

    // 8. Back to the canvas, on to the preset switch, ArrowRight switches to Handout.
    await page.keyboard.press('Tab');
    expect(await focused(page)).toBe('canvas');
    await page.keyboard.press('Tab');
    expect(await focused(page)).toBe('preset-slides');
    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe('preset-handout');
    await expect(page.getByTestId('preset-handout')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('preset-slides')).toHaveAttribute('aria-checked', 'false');
    // The document is unchanged apart from the preset.
    expect(atomCount(await readDocument(page))).toBe(3);
  } finally {
    await app.close();
  }
});

test('keyboard only: every tool, option and action is reached and operated', async () => {
  const { app, page } = await openApp();
  try {
    // Every rail button by arrow keys + Enter.
    await page.getByTestId('tool-select').focus();
    const rail = await page
      .locator('[data-testid="rail"] button')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    expect(rail).toHaveLength(10);
    for (const id of rail.slice(1)) {
      await page.keyboard.press('ArrowDown');
      expect(await focused(page)).toBe(id);
      await page.keyboard.press('Enter');
      await expect(page.getByTestId(id as string)).toHaveAttribute('aria-pressed', 'true');
      // The options bar follows the tool and is operable the same way.
      const opts = await page
        .locator('[data-testid="options"] button')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
      if (opts.length > 1) {
        await page.locator('[data-testid="options"] [tabindex="0"]').focus();
        await page.keyboard.press('End');
        expect(await focused(page)).toBe(opts[opts.length - 1]);
        await page.keyboard.press('Home');
        expect(await focused(page)).toBe(opts[0]);
        await page.getByTestId(id as string).focus();
      }
    }

    // Select tool: the action buttons are focusable and say why they are disabled.
    await page.getByTestId('tool-select').focus();
    await page.keyboard.press('Enter');
    await insertName(page, 'ethanol');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+a');
    // Tab from the canvas order: name field -> options bar.
    await page.keyboard.press('Control+f');
    await page.keyboard.press('Tab');
    expect(await focused(page)).toMatch(/^(opt|act)-/);
    await page.getByTestId('act-flip-h').focus();
    await page.keyboard.press('Enter');
    // Flip horizontal is operated by Enter: one undo step returns the document.
    const flipped = await readDocument(page);
    await page.keyboard.press('Control+z');
    expect(xs(await readDocument(page))).not.toEqual(xs(flipped));
  } finally {
    await app.close();
  }
});

test('no keyboard trap: Esc leaves the name dropdown, the label editor and the text editor', async () => {
  const { app, page } = await openApp();
  try {
    // Name field with the dropdown open: Esc closes it, Esc clears, Esc reaches the canvas.
    await page.keyboard.press('Control+f');
    await page.keyboard.type('eth');
    await expect(page.getByTestId('name-row').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('name-row')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    expect(await focused(page)).toBe('canvas');

    // Label editor: hover an atom, Enter opens it, Esc cancels and the canvas has focus.
    await insertName(page, 'ethanol');
    await page.keyboard.press('Escape');
    const doc = await readDocument(page);
    const atom = Object.values(doc.atoms)[0] as { x: number; y: number };
    const p = await canvasPoint(page, atom);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('textbox-edit')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('textbox-edit')).toHaveCount(0);
    expect(await focused(page)).toBe('canvas');

    // Text editor: T, click empty canvas, type, Esc; the canvas has focus and no text exists.
    await page.keyboard.press('t');
    await page.mouse.click(900, 600);
    await expect(page.getByTestId('textbox-edit')).toBeFocused();
    await page.keyboard.type('abc');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('textbox-edit')).toHaveCount(0);
    expect(await focused(page)).toBe('canvas');
  } finally {
    await app.close();
  }
});

test('Tab from the last control wraps to the first; Shift+Tab from the first wraps to the last', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('zoom-fit').focus();
    await page.keyboard.press('Tab');
    expect(await focused(page)).toBe('namefield-input');
    await page.keyboard.press('Shift+Tab');
    expect(await focused(page)).toBe('zoom-fit');
  } finally {
    await app.close();
  }
});

// ---- Focus rings -----------------------------------------------------------------------------

interface Ring {
  style: string;
  width: string;
  color: string;
  offset: string;
  shadow: string;
}

async function accentColor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--accent)';
    document.querySelector('.editor')?.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
}

const ringOf = (locator: Locator): Promise<Ring> =>
  locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      style: cs.outlineStyle,
      width: cs.outlineWidth,
      color: cs.outlineColor,
      offset: cs.outlineOffset,
      shadow: cs.boxShadow,
    };
  });

test('every button shows the 2 px accent ring on keyboard focus', async () => {
  const { app, page } = await openApp();
  try {
    const accent = await accentColor(page);
    // The name field's "Did you mean" chips and the empty-state chips come first: they vanish
    // as soon as the field loses focus.
    await insertName(page, 'ethanl');
    await expect(page.getByTestId('name-chip').first()).toBeVisible();
    const chips = await page.locator('.editor .chip').all();
    expect(chips.length).toBeGreaterThanOrEqual(6);
    for (const chip of chips) {
      await page.keyboard.press('Shift');
      await chip.focus();
      const ring = await ringOf(chip);
      expect([ring.style, ring.width, ring.color]).toEqual(['solid', '2px', accent]);
    }
    await page.keyboard.press('Escape');
    const ids = await page
      .locator('.editor button[data-testid]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid') as string));
    expect(ids.length).toBeGreaterThan(20);
    const seen: string[] = [];
    for (const id of ids) {
      await page.keyboard.press('Shift'); // keyboard modality, so focus() matches :focus-visible
      await page.getByTestId(id).focus();
      const ring = await ringOf(page.getByTestId(id));
      expect(ring.style, id).toBe('solid');
      expect(ring.width, id).toBe('2px');
      expect(ring.color, id).toBe(accent);
      seen.push(id);
    }
    expect(seen).toContain('tool-bond');
  } finally {
    await app.close();
  }
});

test('no ring after a mouse press on any button', async () => {
  const { app, page } = await openApp();
  try {
    for (const id of ['tool-ring', 'opt-cyclopentane', 'zoom-in', 'preset-handout', 'undo']) {
      await page.getByTestId(id).click();
      expect((await ringOf(page.getByTestId(id))).style, id).toBe('none');
    }
    const chip = page.getByTestId('empty-state').locator('.chip').first();
    await chip.hover();
    await page.mouse.down();
    expect((await ringOf(chip)).style).toBe('none');
    await page.mouse.up();
  } finally {
    await app.close();
  }
});

test('the warnings button shows the ring on keyboard focus', async () => {
  const { app, page } = await openApp();
  try {
    const accent = await accentColor(page);
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
    const warnings = page.getByTestId('warnings');
    await expect(warnings).toBeVisible();
    await expect(warnings).toHaveAccessibleName('1 warning');
    await page.keyboard.press('Shift');
    await warnings.focus();
    const ring = await ringOf(warnings);
    expect([ring.style, ring.width, ring.color, ring.offset]).toEqual([
      'solid',
      '2px',
      accent,
      '0px',
    ]);
  } finally {
    await app.close();
  }
});

test('name field: focus border, and the highlighted dropdown row is marked and announced', async () => {
  const { app, page } = await openApp();
  try {
    const accent = await accentColor(page);
    await page.keyboard.press('Control+f');
    const wrap = page.getByTestId('namefield');
    const shadow = await wrap.evaluate((el) => getComputedStyle(el).boxShadow);
    const input = await field(page).evaluate((el) => getComputedStyle(el).boxShadow);
    expect(`${shadow} ${input}`).toContain(accent);
    await page.keyboard.type('eth');
    await expect(page.getByTestId('name-row').first()).toBeVisible();
    const combo = field(page);
    await expect(combo).toHaveAttribute('role', 'combobox');
    await expect(combo).toHaveAttribute('aria-expanded', 'true');
    const listId = await combo.getAttribute('aria-controls');
    await expect(page.locator(`#${listId}`)).toHaveAttribute('role', 'listbox');
    await page.keyboard.press('ArrowDown');
    const rows = page.getByRole('option');
    const selected = rows.and(page.locator('[aria-selected="true"]'));
    await expect(selected).toHaveCount(1);
    await expect(combo).toHaveAttribute(
      'aria-activedescendant',
      (await selected.getAttribute('id')) as string,
    );
    const bg = await selected.evaluate((el) => getComputedStyle(el).backgroundColor);
    const active = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'var(--active-bg)';
      document.querySelector('.editor')?.appendChild(probe);
      const c = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return c;
    });
    expect(bg).toBe(active);
    await page.keyboard.press('Escape');
    await expect(combo).toHaveAttribute('aria-expanded', 'false');
    await expect(combo).not.toHaveAttribute('aria-activedescendant', /.+/);
  } finally {
    await app.close();
  }
});

// ---- Names and roles -------------------------------------------------------------------------

test('every control has an accessible name that starts with its tooltip name', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanl');
    await expect(page.getByTestId('name-chip').first()).toBeVisible();
    // No control without a name: aria-label, else visible text.
    const unnamed = await page.evaluate((sel) => {
      const bad: string[] = [];
      for (const el of document.querySelectorAll(sel)) {
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
        if (name === '') bad.push(el.outerHTML.slice(0, 80));
      }
      return bad;
    }, CONTROLS);
    expect(unnamed).toEqual([]);

    await page.keyboard.press('Escape');
    const controls = await page.locator('.editor button[data-testid]').evaluateAll((els) =>
      els.map((e) => ({
        id: e.getAttribute('data-testid') as string,
        iconOnly: (e.textContent ?? '').trim() === '',
      })),
    );
    let tipped = 0;
    for (const { id, iconOnly } of controls) {
      const el = page.getByTestId(id);
      await page.keyboard.press('Shift');
      await el.focus();
      const tip = tooltip(page);
      const shown = await tip
        .first()
        .waitFor({ timeout: iconOnly ? 2000 : 400 })
        .then(
          () => true,
          () => false,
        );
      // Every icon-only control explains itself on keyboard focus.
      if (iconOnly) expect(shown, `${id} has a tooltip`).toBe(true);
      if (!shown) continue;
      tipped++;
      const title = (await tip.locator('.tooltip-title span').textContent()) ?? '';
      const name = (await el.getAttribute('aria-label')) ?? '';
      if (id.startsWith('tool-')) {
        // R50 U2: the rail name is the tool name alone; the keys are in aria-keyshortcuts and the
        // tooltip chips say the same thing, digit first.
        const chips = await tip.locator('kbd').allTextContents();
        expect(name, id).toBe(title);
        await expect(el, id).toHaveAttribute(
          'aria-keyshortcuts',
          chips.join(' ').replace('+', 'Plus'),
        );
      }
      expect(
        name.toLowerCase().includes(title.toLowerCase()),
        `${id}: name "${name}" contains tooltip title "${title}"`,
      ).toBe(true);
    }
    expect(tipped).toBeGreaterThan(20);
  } finally {
    await app.close();
  }
});

test('roles and states: rail, options, name field, hint, notfound, canvas', async () => {
  const { app, page } = await openApp();
  try {
    const rail = page.getByTestId('rail');
    await expect(rail).toHaveAttribute('role', 'toolbar');
    await expect(rail).toHaveAttribute('aria-orientation', 'vertical');
    await expect(rail.locator('[aria-pressed="true"]')).toHaveCount(1);
    await expect(rail.locator('button:not([aria-pressed])')).toHaveCount(0);
    await expect(rail.locator('.rail-caption[aria-hidden="true"]').first()).toBeAttached();

    const options = page.getByTestId('options');
    await expect(options).toHaveAttribute('role', 'toolbar');
    await expect(options.locator('[aria-pressed="true"]')).toHaveCount(1);

    const preset = page.getByRole('radiogroup', { name: 'Style' });
    await expect(preset.locator('[role="radio"][aria-checked="true"]')).toHaveCount(1);

    const status = page.getByRole('status');
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await expect(page.getByTestId('canvas')).toHaveAttribute('aria-describedby', 'editor-hint');
    await expect(page.locator('#editor-hint')).toHaveAttribute('role', 'status');

    // Not found is announced (role=alert) and the field is not exposed as expanded-without-list.
    await insertName(page, 'ethanl');
    await expect(page.getByRole('alert')).toContainText('No compound named');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    // Disabled controls: aria-disabled, still focusable, still explain themselves.
    await page.getByTestId('tool-select').click();
    const flip = page.getByTestId('act-flip-h');
    await expect(flip).toHaveAttribute('aria-disabled', 'true');
    await expect(flip).not.toHaveAttribute('disabled', /.*/);
    await page.keyboard.press('Shift');
    await flip.focus();
    await expect(tooltip(page).locator('.tooltip-help')).toHaveText('Select a molecule first.');
    const undo = page.getByTestId('undo');
    await expect(undo).toHaveAttribute('aria-disabled', 'true');
    // Nothing uses the native disabled attribute (it would drop out of the tab order).
    await expect(page.locator('.editor [disabled]')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

// ---- Hit targets -----------------------------------------------------------------------------

test('every pointer target is at least 24 x 24 CSS px, at the sizes the spec lists', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanl');
    await expect(page.getByTestId('name-chip').first()).toBeVisible();
    await page.keyboard.press('Escape');
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll('.editor button, .editor [role="option"]')]
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            id: el.getAttribute('data-testid') ?? el.textContent?.trim() ?? el.tagName,
            w: r.width,
            h: r.height,
          };
        })
        .filter((b) => b.w > 0 && b.h > 0),
    );
    expect(boxes.length).toBeGreaterThan(20);
    // The two preset segments are 64 x 24 (SPEC-editor "Control states", Decisions 2026-11-10),
    // so every status-bar control meets the 24 px of "Accessibility".
    const presets = boxes.filter((b) => b.id.startsWith('preset-'));
    expect(presets).toHaveLength(2);
    for (const b of presets) expect([b.w, b.h], b.id).toEqual([64, 24]);
    for (const b of boxes.filter((x) => !x.id.startsWith('preset-'))) {
      expect(b.w, `${b.id} width`).toBeGreaterThanOrEqual(24);
      expect(b.h, `${b.id} height`).toBeGreaterThanOrEqual(24);
    }
    const byId = new Map(boxes.map((b) => [b.id, b]));
    expect(byId.get('tool-bond')).toMatchObject({ w: 56, h: 48 });
    expect(byId.get('undo')).toMatchObject({ w: 32, h: 32 });
    expect(byId.get('opt-single')).toMatchObject({ w: 32, h: 32 });
    expect(byId.get('zoom-in')?.h).toBe(24);
  } finally {
    await app.close();
  }
});

// ---- Reduced motion --------------------------------------------------------------------------

async function longestMotion(page: Page): Promise<{ transition: number; animation: number }> {
  return page.evaluate(() => {
    const secs = (v: string): number =>
      Math.max(
        ...v
          .split(',')
          .map((s) => (s.trim().endsWith('ms') ? parseFloat(s) / 1000 : parseFloat(s))),
      );
    let transition = 0;
    let animation = 0;
    for (const el of document.querySelectorAll('.editor, .editor *')) {
      const cs = getComputedStyle(el);
      transition = Math.max(transition, secs(cs.transitionDuration), secs(cs.transitionDelay));
      animation = Math.max(animation, secs(cs.animationDuration), secs(cs.animationDelay));
    }
    return { transition, animation };
  });
}

test('reduced motion: no transition or animation runs, tooltip included; normal motion is 120 ms', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-bond').hover();
    await expect(tooltip(page)).toBeVisible({ timeout: 2000 });
    expect((await longestMotion(page)).animation).toBeCloseTo(0.12, 5);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.mouse.move(700, 500);
    await expect(tooltip(page)).toHaveCount(0);
    await page.getByTestId('tool-ring').hover();
    await expect(tooltip(page)).toBeVisible({ timeout: 2000 });
    expect(await longestMotion(page)).toEqual({ transition: 0, animation: 0 });
    await page.mouse.move(700, 500);
    await page.keyboard.press('Control+f');
    await page.keyboard.type('eth');
    await expect(page.getByTestId('name-row').first()).toBeVisible();
    expect(await longestMotion(page)).toEqual({ transition: 0, animation: 0 });
  } finally {
    await app.close();
  }
});

test('keyboard only: every selection action runs from its shortcut or its button', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'benzene');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+a');
    const kekule = page.getByTestId('act-kekule');
    await expect(kekule).toContainText('Show Kekulé');
    // Ctrl+Shift+K toggles circle / Kekulé; one undo step.
    await page.keyboard.press('Control+Shift+K');
    await expect(kekule).toContainText('Show circle');
    await page.keyboard.press('Control+z');
    await expect(kekule).toContainText('Show Kekulé');
    // Ctrl+Shift+L runs Clean up; benzene is already clean, so the document is unchanged (the
    // geometry itself is covered by the reducer tests).
    const before = JSON.stringify((await readDocument(page)).atoms);
    await page.keyboard.press('Control+Shift+L');
    await page.keyboard.press('Control+z');
    expect(JSON.stringify((await readDocument(page)).atoms)).toBe(before);
    // Flip by its button: focus, Enter.
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+a');
    await page.getByTestId('act-flip-v').focus();
    await page.keyboard.press('Enter');
    expect(JSON.stringify((await readDocument(page)).atoms)).not.toBe(before);
    await page.keyboard.press('Control+z');
    expect(JSON.stringify((await readDocument(page)).atoms)).toBe(before);
    // Ctrl+D duplicates and Delete removes the copy.
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+d');
    expect(Object.keys((await readDocument(page)).atoms)).toHaveLength(12);
    await page.keyboard.press('Delete');
    expect(Object.keys((await readDocument(page)).atoms)).toHaveLength(6);
    // The Tidy shortcut runs with nothing to tidy and says so.
    await page.keyboard.press('Control+Shift+R');
    await expect(page.getByRole('status')).toContainText('Nothing to tidy');
  } finally {
    await app.close();
  }
});

test('rail badges: each digit sits inside its unchanged 56 x 48 button and is not announced (R50)', async () => {
  const { app, page } = await openApp();
  try {
    const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
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
    for (const [i, id] of tools.entries()) {
      const button = page.getByTestId(`tool-${id}`);
      const badge = button.locator('.rail-key');
      await expect(badge).toHaveText(digits[i] as string);
      await expect(badge).toHaveAttribute('aria-hidden', 'true');
      const b = await button.boundingBox();
      const k = await badge.boundingBox();
      if (!b || !k) throw new Error('no box');
      expect(Math.abs(b.width - 56), id).toBeLessThanOrEqual(1);
      expect(Math.abs(b.height - 48), id).toBeLessThanOrEqual(1);
      expect(k.x, id).toBeGreaterThanOrEqual(b.x);
      expect(k.y, id).toBeGreaterThanOrEqual(b.y);
      expect(k.x + k.width, id).toBeLessThanOrEqual(b.x + b.width);
      expect(k.y + k.height, id).toBeLessThanOrEqual(b.y + b.height);
      // Top-right: right of the button's middle, in its upper half.
      expect(k.x, id).toBeGreaterThan(b.x + b.width / 2);
      expect(k.y + k.height, id).toBeLessThan(b.y + b.height / 2);
    }
    await expect(page.getByTestId('tool-bond')).toHaveAttribute('aria-label', 'Bond');
    await expect(page.getByTestId('tool-plus')).toHaveAttribute('aria-keyshortcuts', '8 Plus');
  } finally {
    await app.close();
  }
});

test('R59: the zoom readout is named "Zoom to 100%" with no key; Tidy reaction shows Ctrl+Shift+R', async () => {
  const { app, page } = await openApp();
  try {
    const readout = page.getByTestId('zoom-reset');
    await expect(readout).toHaveAttribute('aria-label', 'Zoom to 100%');
    await expect(readout).toHaveAttribute('data-tip', 'Zoom to 100%');
    await expect(readout).not.toHaveAttribute('data-tip-key', /.*/);
    await page.getByTestId('tool-select').click();
    const tidy = page.getByTestId('act-tidy');
    await expect(tidy).toHaveAttribute('data-tip', 'Tidy reaction');
    await expect(tidy).toHaveAttribute('data-tip-key', 'Ctrl+Shift+R');
  } finally {
    await app.close();
  }
});
