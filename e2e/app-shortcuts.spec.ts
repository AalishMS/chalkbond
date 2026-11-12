// A12 (SPEC-app-shell.md "Keyboard shortcuts dialog", AB1): the dialog's box, scrolling and
// closing rules, focus, its modal state shared with Export, and the native About box as data.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { clickEnabled, menuItem, popups, stubPopup } from './app-menu';
import { loadScheme } from './fixtures';
import { heardCommands, openApp } from './harness';

const dialog = (page: Page) => page.getByTestId('shortcuts-dialog');
const focusedTestId = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
type DialogLog = { method: string; options: Record<string, unknown> }[];
const dialogLog = async (app: ElectronApplication): Promise<DialogLog> =>
  (await app.evaluate(
    () => (globalThis as { __chalkbondDialogLog?: DialogLog }).__chalkbondDialogLog ?? [],
  )) as DialogLog;

/** M4: with a dialog open the ☰ button, Alt and F10 open no popup. */
async function expectNoPopup(app: ElectronApplication, page: Page): Promise<void> {
  await stubPopup(app, ['file.export']);
  await page.getByTestId('app-menu').dispatchEvent('click');
  await page.keyboard.press('F10');
  await page.waitForTimeout(100);
  expect(await popups(app)).toHaveLength(0);
}

/** build/icon.png's size from its IHDR chunk. */
function iconSize(): { width: number; height: number } {
  const png = readFileSync(resolve(__dirname, '../build/icon.png'));
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** The box and the Tools rows, measured in the page (CSS px). */
async function measure(page: Page) {
  return page.evaluate(() => {
    const box = document.querySelector('[data-testid="shortcuts-dialog"]');
    const body = box?.querySelector('.dialog-body');
    if (!(box instanceof HTMLElement) || !(body instanceof HTMLElement)) return null;
    const rect = box.getBoundingClientRect();
    const view = body.getBoundingClientRect();
    const sections = [...body.querySelectorAll('.sc-section')];
    const tools = sections[0];
    const toolRows: DOMRect[] = [];
    for (
      let el = tools?.nextElementSibling;
      el?.classList.contains('sc-row');
      el = el.nextElementSibling
    )
      toolRows.push(el.getBoundingClientRect());
    const keyCells = [...body.querySelectorAll('.sc-row > .keys')].map(
      (k) => k.getBoundingClientRect().width,
    );
    const rows = [...body.querySelectorAll('.sc-row')].map((row) => {
      const r = row.getBoundingClientRect();
      const inner = [...row.querySelectorAll('kbd, .sc-meaning')].map((c) =>
        c.getBoundingClientRect(),
      );
      return {
        height: r.height,
        clipped: inner.some((c) => c.top < r.top - 0.5 || c.bottom > r.bottom + 0.5),
      };
    });
    const style = getComputedStyle(body);
    return {
      width: rect.width,
      top: rect.top,
      bottomGap: window.innerHeight - rect.bottom,
      centre: rect.left + rect.width / 2 - window.innerWidth / 2,
      scrollTop: body.scrollTop,
      scrolls: body.scrollHeight > body.clientHeight,
      overflowY: style.overflowY,
      scrollbar:
        body.offsetWidth -
        body.clientWidth -
        parseFloat(style.borderLeftWidth) -
        parseFloat(style.borderRightWidth),
      ruleBelow: style.borderBottomStyle + ' ' + style.borderBottomWidth,
      toolCount: toolRows.length,
      toolsInside: toolRows.every((r) => r.top >= view.top - 0.5 && r.bottom <= view.bottom + 0.5),
      keyCells: [...new Set(keyCells.map((w) => Math.round(w)))],
      rows,
      title: box.querySelector('.dialog-title')?.textContent,
    };
  });
}

for (const [w, h] of [
  [1280, 800],
  [960, 640],
] as const) {
  test(`at ${w}×${h}: 560 wide, top 96, bottom ≥ 32, every Tools row visible at scrollTop 0`, async () => {
    const { app, page } = await openApp({ size: [w, h] });
    try {
      await loadScheme(page);
      await page.getByTestId('canvas').focus();
      await page.keyboard.press('F1');
      await expect(dialog(page)).toBeVisible();
      const m = await measure(page);
      if (!m) throw new Error('no dialog');
      expect(m.title).toBe('Keyboard shortcuts');
      expect(m.width).toBe(560);
      expect(m.top).toBe(96);
      expect(Math.abs(m.centre)).toBeLessThanOrEqual(0.5);
      expect(m.bottomGap).toBeGreaterThanOrEqual(32);
      expect(m.scrollTop).toBe(0);
      expect(m.toolCount).toBe(10);
      expect(m.toolsInside).toBe(true);
      // The list scrolls with an always-visible thin (8 px) bar and ends on a rule.
      expect(m.scrolls).toBe(true);
      expect(m.overflowY).toBe('scroll');
      expect(m.scrollbar).toBe(8);
      expect(m.ruleBelow).toBe('solid 1px');
      // Key column 136; rows at least 28 and grow when alternatives wrap (no clipping).
      expect(m.keyCells).toEqual([136]);
      for (const row of m.rows) {
        expect(row.height).toBeGreaterThanOrEqual(28);
        expect(row.clipped).toBe(false);
      }
      expect(Math.max(...m.rows.map((r) => r.height))).toBeGreaterThan(28); // C H N O S P F I
    } finally {
      await app.close();
    }
  });
}

test('F1 opens it with focus inside; Tab stays inside; Esc closes and focus returns to the canvas', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('F1');
    await expect(dialog(page)).toBeVisible();
    expect(await focusedTestId(page)).toBe('shortcuts-close');
    await page.keyboard.press('Tab');
    expect(await focusedTestId(page)).toBe('shortcuts-close');
    await page.keyboard.press('Shift+Tab');
    expect(await focusedTestId(page)).toBe('shortcuts-close');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('canvas')).toBeFocused();
  } finally {
    await app.close();
  }
});

test('Enter, the Close button and a scrim click close it; focus returns where it was', async () => {
  const { app, page } = await openApp();
  try {
    const input = page.getByTestId('namefield-input');
    await input.click();
    await page.keyboard.press('F1');
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toHaveCount(0);
    await expect(input).toBeFocused();

    await page.keyboard.press('F1');
    await page.getByTestId('shortcuts-close').click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(input).toBeFocused();

    await page.getByTestId('canvas').focus();
    await page.keyboard.press('F1');
    await expect(dialog(page)).toBeVisible();
    await page.mouse.click(20, 400); // the scrim, left of the dialog
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('canvas')).toBeFocused();
  } finally {
    await app.close();
  }
});

test('Help > Keyboard shortcuts opens it; while open the menu is disabled and host keys do nothing', async () => {
  const { app, page } = await openApp();
  try {
    await loadScheme(page);
    await page.getByTestId('canvas').focus();
    await clickEnabled(app, 'help.shortcuts');
    await expect(dialog(page)).toBeVisible();
    expect(await heardCommands(page)).toContain('help.shortcuts');
    // M4, V3: the ☰ button is disabled and opens nothing (a press, Alt and F10 are ignored).
    await expect(page.getByTestId('app-menu')).toHaveAttribute('aria-disabled', 'true');
    await expectNoPopup(app, page);
    // No overlapping dialogs or host actions: Ctrl+E and F1 are ignored.
    await page.keyboard.press('Control+e');
    await page.keyboard.press('F1');
    await expect(page.getByTestId('export-dialog')).toHaveCount(0);
    await expect(dialog(page)).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(async () => (await menuItem(app, 'help.shortcuts')).enabled).toBe(true);

    // And the other way round: with Export open, F1 and Help > Keyboard shortcuts do nothing.
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+e');
    await expect(page.getByTestId('export-dialog')).toBeVisible();
    await page.keyboard.press('F1');
    await expectNoPopup(app, page);
    await expect(dialog(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('export-dialog')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('F1 while the label editor is open does nothing', async () => {
  const { app, page } = await openApp();
  try {
    await loadScheme(page);
    await page.getByTestId('tool-text').click();
    await page.getByTestId('canvas').click({ position: { x: 300, y: 650 } });
    await expect(page.getByTestId('textbox-edit')).toBeFocused();
    await page.keyboard.press('F1');
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('textbox-edit')).toBeFocused();
    expect((await menuItem(app, 'help.shortcuts')).enabled).toBe(false);
  } finally {
    await app.close();
  }
});

test('AB1: About shows the native box as data; Licences opens the bundled notices', async () => {
  const version = (
    JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as {
      version: string;
    }
  ).version;
  const { app, page } = await openApp({ launch: { dialogs: [{ response: 0 }, { response: 1 }] } });
  try {
    await page.getByTestId('canvas').waitFor();
    await app.evaluate(({ dialog, shell }) => {
      const state = globalThis as { __aboutIcons?: unknown[]; __openedPaths?: string[] };
      state.__aboutIcons = [];
      state.__openedPaths = [];
      const show = dialog.showMessageBox;
      dialog.showMessageBox = ((...args: unknown[]) => {
        const options = args.at(-1) as { icon?: Electron.NativeImage };
        state.__aboutIcons?.push(options.icon?.isEmpty() === false ? options.icon.getSize() : null);
        return (show as (...a: unknown[]) => Promise<Electron.MessageBoxReturnValue>)(...args);
      }) as typeof dialog.showMessageBox;
      shell.openPath = (path: string) => {
        state.__openedPaths?.push(path);
        return Promise.resolve('');
      };
    });
    const opened = () =>
      app.evaluate(() => (globalThis as { __openedPaths?: string[] }).__openedPaths ?? []);
    await clickEnabled(app, 'help.about');
    await expect.poll(async () => (await dialogLog(app)).length).toBe(1);
    const about = {
      type: 'none',
      title: 'About Chalkbond',
      message: `Chalkbond ${version}`,
      detail:
        'Draw chemical structures and reactions for teaching.\n\nWorks fully offline. Nothing you draw leaves this computer.\n\nCopyright © 2026 Aalish.\nBuilt with OpenChemLib, Electron, React, Immer and Zod.',
      buttons: ['OK', 'Licences'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    };
    expect((await dialogLog(app))[0]).toEqual({
      method: 'showMessageBox',
      // The icon is a NativeImage (its JSON copy is not the picture); its size is checked below.
      options: { ...about, icon: expect.any(Object) },
    });
    expect(await opened()).toEqual([]); // OK
    await clickEnabled(app, 'help.about');
    await expect.poll(opened).toHaveLength(1);
    expect((await opened())[0]).toMatch(/[\\/]build[\\/]THIRD-PARTY-NOTICES\.txt$/);
    // The icon is the app's icon.png from build/ (A16 replaces the picture, not the path).
    expect(
      await app.evaluate(() => (globalThis as { __aboutIcons?: unknown[] }).__aboutIcons),
    ).toEqual([iconSize(), iconSize()]);
  } finally {
    await app.close();
  }
});
