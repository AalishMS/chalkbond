// C10 (SPEC-clipboard-export.md "Export dialog", EX1, EX2; app-shell K1, V3, ST2): Ctrl+E, the
// keyboard rules, the box, Save… → the stubbed Save dialog (cancelled), remembered choices across
// a real relaunch, Cancel and the scrim with no effect, and the short window (960 × 640).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { serialize } from '../src/core/doc-model';
import { goldenDoc, heardNotices, loadDocument, openApp, readDocument } from './harness';
import { closeForReal, launchWith, windowTitle } from './relaunch';

const CANCELLED = { canceled: true, filePath: '' };

const dialog = (page: Page) => page.getByTestId('export-dialog');
const focusedId = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
const dialogLog = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      (
        globalThis as {
          __chalkbondDialogLog?: { method: string; options: { defaultPath?: string } }[];
        }
      ).__chalkbondDialogLog ?? [],
  );

async function openExport(page: Page): Promise<void> {
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Control+e');
  await expect(dialog(page)).toBeVisible();
}

test('Ctrl+E: focus on the PNG card; arrows, Home and End select; Esc returns focus', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+e'); // empty drawing: nothing
    await expect(dialog(page)).toHaveCount(0);
    await loadDocument(page, goldenDoc('toluene'));
    await openExport(page);
    expect(await focusedId(page)).toBe('export-format-png');
    expect(await page.evaluate(() => document.activeElement?.matches(':focus-visible'))).toBe(true);
    await expect(page.getByTestId('export-size-line')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('export-format-svg')).toHaveAttribute('aria-checked', 'true');
    expect(await focusedId(page)).toBe('export-format-svg');
    await expect(page.getByTestId('export-size-line')).toHaveCount(0);
    await expect(page.getByTestId('export-white')).toHaveCount(0);
    await page.keyboard.press('End');
    expect(await focusedId(page)).toBe('export-format-pdf');
    await page.keyboard.press('ArrowDown'); // wraps
    expect(await focusedId(page)).toBe('export-format-png');
    await page.keyboard.press('ArrowUp');
    expect(await focusedId(page)).toBe('export-format-pdf');
    await page.keyboard.press('Home');
    expect(await focusedId(page)).toBe('export-format-png');
    // Size: one tab stop, arrows move and select.
    await page.keyboard.press('Tab');
    expect(await focusedId(page)).toBe('export-size-print');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('export-size-poster')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('export-size-line')).toContainText('For large prints.');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    expect(await focusedId(page)).toBe('canvas');
    expect(await dialogLog(app)).toEqual([]);
  } finally {
    await app.close();
  }
});

test('the box: 400 wide, top 96 below the content top, centred; modal; focus trapped', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    await loadDocument(page, goldenDoc('toluene'));
    const before = serialize(await readDocument(page));
    await openExport(page);
    const box = await dialog(page).boundingBox();
    expect(box?.width).toBe(400);
    expect(box?.y).toBe(96);
    expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - 640)).toBeLessThanOrEqual(1);
    // At 1280 × 800 everything fits: no scrolling body.
    expect(
      await dialog(page)
        .locator('.dialog-body')
        .evaluate((el) => el.scrollHeight - el.clientHeight),
    ).toBe(0);
    // K1 while the dialog is open: no host key acts (no New prompt, no Open dialog), no editor key.
    for (const key of ['Control+n', 'Control+o', 'Control+s', 'Control+e', 'Control+v', 'Delete'])
      await page.keyboard.press(key);
    expect(await dialogLog(app)).toEqual([]);
    expect(serialize(await readDocument(page))).toBe(before);
    await expect(dialog(page)).toBeVisible();
    // Trap: Shift+Tab from the first stop goes to Save…, Tab from Save… back to the card.
    await page.keyboard.press('Shift+Tab');
    expect(await focusedId(page)).toBe('export-save');
    await page.keyboard.press('Tab');
    expect(await focusedId(page)).toBe('export-format-png');
    const order: (string | null)[] = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      order.push(await focusedId(page));
    }
    expect(order).toEqual([
      'export-size-print',
      'export-white',
      'export-cancel',
      'export-save',
      'export-format-png',
    ]);
  } finally {
    await app.close();
  }
});

test('Enter = Save…: the Save dialog suggests Untitled.png; cancelled, nothing changes', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [CANCELLED] } });
  try {
    await loadDocument(page, goldenDoc('toluene'));
    const before = serialize(await readDocument(page));
    const title = await windowTitle(app);
    await openExport(page);
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(async () => (await dialogLog(app)).length).toBe(1);
    const [call] = await dialogLog(app);
    expect(call?.method).toBe('showSaveDialog');
    expect(call?.options.defaultPath).toMatch(/[\\/]Untitled\.png$/);
    expect(await focusedId(page)).toBe('canvas');
    expect(serialize(await readDocument(page))).toBe(before);
    expect(await windowTitle(app)).toBe(title);
    expect(await heardNotices(page)).toEqual([]);
  } finally {
    await app.close();
  }
});

test('Cancel and a scrim click close with no effect; the choices are not kept', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'chalkbond-e2e-export-cancel-'));
  try {
    const { app, page } = await launchWith(userData, {
      size: [1280, 800],
      launch: { dialogs: [] },
    });
    await loadDocument(page, goldenDoc('toluene'));
    await openExport(page);
    await page.getByTestId('export-size-poster').click();
    await page.getByTestId('export-cancel').click();
    await expect(dialog(page)).toHaveCount(0);
    expect(await focusedId(page)).toBe('canvas');
    await openExport(page);
    await expect(page.getByTestId('export-size-print')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('export-format-svg').click();
    await page.mouse.click(20, 780); // the scrim, outside the box
    await expect(dialog(page)).toHaveCount(0);
    await openExport(page);
    await expect(page.getByTestId('export-format-png')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    expect(await dialogLog(app)).toEqual([]);
    await closeForReal(app);
    let stored: unknown = null;
    try {
      stored = (
        JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')) as { export: unknown }
      ).export;
    } catch {
      stored = null; // never written: nothing to remember
    }
    expect([null, { format: 'png', pngDpi: 300, pngWhite: false }]).toContainEqual(stored);
  } finally {
    rmSync(userData, { recursive: true, force: true });
  }
});

test('choices survive a relaunch: Poster and White background stay selected', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'chalkbond-e2e-export-'));
  try {
    let { app, page } = await launchWith(userData, {
      size: [1280, 800],
      launch: { dialogs: [CANCELLED] },
    });
    await loadDocument(page, goldenDoc('toluene'));
    await openExport(page);
    await page.getByTestId('export-size-poster').click();
    await page.getByTestId('export-white').click();
    await expect(page.getByTestId('export-white')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('export-save').click();
    await expect.poll(async () => (await dialogLog(app)).length).toBe(1);
    await closeForReal(app);
    ({ app, page } = await launchWith(userData, { size: [1280, 800] }));
    try {
      await loadDocument(page, goldenDoc('toluene'));
      await openExport(page);
      await expect(page.getByTestId('export-format-png')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('export-size-poster')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('export-white')).toHaveAttribute('aria-checked', 'true');
      await page.keyboard.press('Escape');
    } finally {
      await closeForReal(app);
    }
  } finally {
    rmSync(userData, { recursive: true, force: true });
  }
});

test('960 × 640: top stays 96, 32 px kept below, the body scrolls, the footer stays visible', async () => {
  const { app, page } = await openApp({ size: [960, 640], launch: { dialogs: [CANCELLED] } });
  try {
    await loadDocument(page, goldenDoc('toluene'));
    await openExport(page);
    const box = await dialog(page).boundingBox();
    expect(box?.y).toBe(96);
    expect(box?.width).toBe(400);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(640 - 32);
    expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - 480)).toBeLessThanOrEqual(1);
    const inside = async (id: string): Promise<boolean> => {
      const b = await page.getByTestId(id).boundingBox();
      return (
        b !== null &&
        box !== null &&
        b.y >= box.y &&
        b.y + b.height <= box.y + box.height &&
        b.y + b.height <= 640
      );
    };
    expect(await inside('export-save')).toBe(true);
    expect(await inside('export-cancel')).toBe(true);
    const body = dialog(page).locator('.dialog-body');
    const sizes = await body.evaluate((el) => ({
      scroll: el.scrollHeight,
      client: el.clientHeight,
    }));
    console.info('C10 960x640 body', JSON.stringify(sizes));
    expect(sizes.scroll).toBeGreaterThan(sizes.client); // the PNG body needs room: it scrolls
    // Every control is reachable by keyboard and scrolled into view inside the body.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await focusedId(page)).toBe('export-white');
    const visible = await page.getByTestId('export-white').evaluate((el) => {
      const b = el.getBoundingClientRect();
      const v = (el.closest('.dialog-body') as HTMLElement).getBoundingClientRect();
      return b.top >= v.top - 0.5 && b.bottom <= v.bottom + 0.5;
    });
    expect(visible).toBe(true);
    await page.keyboard.press('Space');
    await expect(page.getByTestId('export-white')).toHaveAttribute('aria-checked', 'true');
    expect(await inside('export-save')).toBe(true);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await dialogLog(app)).length).toBe(1);
  } finally {
    await app.close();
  }
});
