// TB27 (SPEC-app-shell.md T1-T16, R36, R45, R46, A18, A21, SC17, SC19; editor R56, K4): the tab
// strip and the tab keys end to end on the built app. Every assertion is a DOM box, a stubbed
// `dialog` log entry (e2e/stub-dialogs.mjs), a popup recorded through the stubbed
// `Menu.prototype.popup` (e2e/app-menu.ts) or a read through the TB20 test hook (`readTabs`,
// `readDocument`). Nothing waits on a fixed timer: state is polled. The R51 box (an unkept tab at the
// window close) and the session store are TB28's; autosave is TB29's.
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { drawingPayload, withPictureChunks } from '../src/core/clipboard-export';
import { serialize } from '../src/core/doc-model';
import { popups, stubPopup } from './app-menu';
import { dialogLog } from './export-steps';
import {
  canvasPoint,
  expectNoNetwork,
  goldenDoc,
  insertName,
  openApp,
  openTab,
  readContentView,
  readDocument,
  readSelection,
  readTabs,
  tabKeys,
  type HookTab,
} from './harness';
import { closeWindowForReal, drawThenKill, expectRecorded, kill, launchIn } from './session-steps';

const canvas = (page: Page): Locator => page.getByTestId('canvas');
const tabs = (page: Page): Locator => page.getByTestId('tab');
const labels = async (page: Page): Promise<string[]> => (await readTabs(page)).map((t) => t.label);
const activeLabel = async (page: Page): Promise<string | undefined> =>
  (await readTabs(page)).find((t) => t.active)?.label;
const atomCount = async (page: Page): Promise<number> =>
  Object.keys((await readDocument(page)).atoms).length;
const readout = (page: Page): Locator => page.getByTestId('zoom-reset');
const hint = (page: Page): Locator => page.getByTestId('statusbar').getByRole('status');

/** Adds one atom with the Atom tool at a canvas offset and waits until it is in the drawing. */
async function edit(page: Page, x = 900, y = 600): Promise<void> {
  const before = await atomCount(page);
  await page.getByTestId('tool-atom').click();
  await canvas(page).click({ position: { x, y } });
  await expect.poll(() => atomCount(page)).toBe(before + 1);
  await canvas(page).focus();
}

/** The tab strip's tab list element: the scroll container of the tabs. */
const tabList = (page: Page): Locator => page.getByRole('tablist', { name: 'Open drawings' });

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  if (b === null) throw new Error('no box');
  return b;
}
const centre = (b: Box): { x: number; y: number } => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
});

/** The tab's box lies inside the tab list's box (it is scrolled into view). */
async function expectInView(page: Page, tab: Locator): Promise<void> {
  const list = await box(tabList(page));
  const t = await box(tab);
  expect(t.x).toBeGreaterThanOrEqual(list.x - 1);
  expect(t.x + t.width).toBeLessThanOrEqual(list.x + list.width + 1);
}

/** Opens tabs by the + button until there are `count`. */
async function openTabs(page: Page, count: number): Promise<void> {
  while ((await tabKeys(page)).length < count) await openTab(page);
}

/** A synthetic Ctrl+<digit> on the physical key `code`, whatever character `key` reports. */
async function ctrlCode(page: Page, code: string, key: string): Promise<void> {
  await page.evaluate(
    ([c, k]) => {
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent('keydown', {
          key: k,
          code: c,
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    [code, key] as const,
  );
}

/** Removes a temp folder; Windows may still hold a file of a killed app for a moment. */
function removeDir(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch {
    // Not an assertion: a leftover temp folder is harmless (launch.ts does the same).
  }
}

let dir: string;
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chalkbond-tabs-'));
});
test.afterEach(() => {
  removeDir(dir);
});

// ---- Keys (R36, R45, R46) ------------------------------------------------------------------

test('R36: new, close, next, previous, number, last and reopen keys', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    await canvas(page).focus();
    await page.keyboard.press('Control+t');
    await expect.poll(() => labels(page)).toEqual(['Untitled', 'Untitled 2']);
    await page.keyboard.press('Control+n'); // R36: Ctrl+N is a new tab too
    await expect.poll(() => labels(page)).toEqual(['Untitled', 'Untitled 2', 'Untitled 3']);
    await expect.poll(() => activeLabel(page)).toBe('Untitled 3');

    const press = async (keys: string, active: string): Promise<void> => {
      await page.keyboard.press(keys);
      await expect.poll(() => activeLabel(page), { message: keys }).toBe(active);
    };
    await press('Control+Tab', 'Untitled'); // wraps
    await press('Control+Shift+Tab', 'Untitled 3'); // wraps back
    await press('Control+PageUp', 'Untitled 2');
    await press('Control+PageDown', 'Untitled 3');
    await press('Control+1', 'Untitled');
    await press('Control+2', 'Untitled 2');
    await press('Control+9', 'Untitled 3'); // the last tab
    await press('Control+Digit1', 'Untitled');
    await page.keyboard.press('Control+5'); // no tab 5: nothing happens
    await page.keyboard.press('Control+8');
    await expect.poll(() => activeLabel(page)).toBe('Untitled');

    // R45: Ctrl+digit matches the physical key (`code`), so a Devanagari digit in `key` still goes
    // to tab 2, and the number pad (NumLock on: key "3", code Numpad3) is the same digit.
    await ctrlCode(page, 'Digit2', '२');
    await expect.poll(() => activeLabel(page)).toBe('Untitled 2');
    await ctrlCode(page, 'Numpad3', '3');
    await expect.poll(() => activeLabel(page)).toBe('Untitled 3');
    await ctrlCode(page, 'Digit2', '२');
    await expect.poll(() => activeLabel(page)).toBe('Untitled 2');

    // Ctrl+W closes the active (empty) tab with no box; its right neighbour is active.
    await page.keyboard.press('Control+w');
    await expect.poll(() => labels(page)).toEqual(['Untitled', 'Untitled 3']);
    await expect.poll(() => activeLabel(page)).toBe('Untitled 3');
    // Ctrl+Shift+T brings it back at its old position and activates it.
    await page.keyboard.press('Control+Shift+t');
    await expect.poll(() => labels(page)).toEqual(['Untitled', 'Untitled 2', 'Untitled 3']);
    await expect.poll(() => activeLabel(page)).toBe('Untitled 2');
    // With nothing left to reopen the key does nothing.
    await page.keyboard.press('Control+Shift+t');
    expect(await labels(page)).toEqual(['Untitled', 'Untitled 2', 'Untitled 3']);

    expect(await dialogLog(app)).toEqual([]);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('R36, R46: Ctrl+1 and Ctrl+Shift+T never reach the editor; Tidy is Ctrl+Shift+R; Zoom to 100% has no key', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    await canvas(page).focus();
    await expect(readout(page)).toHaveText('150%');
    // Ctrl+1 is "go to tab 1" (here the same tab), not Zoom to 100%; Ctrl+Shift+0 is no key.
    await page.keyboard.press('Control+1');
    await page.keyboard.press('Control+Shift+0');
    await page.keyboard.press('Control+Shift+Digit0');
    await expect(readout(page)).toHaveText('150%');
    // Ctrl+Shift+T (nothing to reopen) is not Tidy any more: no "Nothing to tidy" appears.
    await page.keyboard.press('Control+Shift+t');
    await expect(hint(page)).not.toContainText('Nothing to tidy');
    // Ctrl+Shift+R is Tidy: with no arrow it says so.
    await page.keyboard.press('Control+Shift+r');
    await expect(hint(page)).toContainText('Nothing to tidy');
    // The readout is the Zoom to 100% command (R49).
    await readout(page).click();
    await expect(readout(page)).toHaveText('100%');
    expect(await dialogLog(app)).toEqual([]);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

// ---- Mouse: click, middle-click, ×, new tab, double-click (T7, T8, T11) ---------------------

test('T7, T8, T11: click, middle-click, the cross, the + button and a double-click on the empty strip', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    await expect(tabs(page)).toHaveCount(1);
    await page.getByTestId('tab-add').click();
    await expect.poll(() => labels(page)).toEqual(['Untitled', 'Untitled 2']);
    await expect.poll(() => activeLabel(page)).toBe('Untitled 2');
    // A double-click on the empty part of the strip adds a tab at the end and activates it.
    const strip = await box(page.getByTestId('tab-strip'));
    await page.mouse.dblclick(strip.x + strip.width - 40, strip.y + strip.height / 2);
    await expect.poll(() => labels(page)).toEqual(['Untitled', 'Untitled 2', 'Untitled 3']);
    await expect.poll(() => activeLabel(page)).toBe('Untitled 3');

    // A click activates the tab.
    await tabs(page).nth(0).click();
    await expect.poll(() => activeLabel(page)).toBe('Untitled');
    await expect(tabs(page).nth(0)).toHaveAttribute('aria-selected', 'true');
    // After a mouse click on a tab the canvas has focus (editor K5).
    await expect(canvas(page)).toBeFocused();

    // A middle-click closes the tab it is on, not the active one.
    await tabs(page).nth(1).click({ button: 'middle' });
    await expect.poll(() => labels(page)).toEqual(['Untitled', 'Untitled 3']);
    await expect.poll(() => activeLabel(page)).toBe('Untitled');

    // The cross of a tab (shown on hover) closes that tab.
    await tabs(page).nth(1).hover();
    await tabs(page).nth(1).getByTestId('tab-close').click();
    await expect.poll(() => labels(page)).toEqual(['Untitled']);

    // The last tab: its cross leaves one empty Untitled (R39, R49), no box.
    await tabs(page).nth(0).getByTestId('tab-close').click();
    await expect.poll(() => labels(page)).toEqual(['Untitled']);
    expect(await dialogLog(app)).toEqual([]);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('T8: the cross of the active tab closes it and activates its right neighbour, else the left', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    await openTabs(page, 3);
    await tabs(page).nth(0).click();
    await tabs(page).nth(0).getByTestId('tab-close').click();
    await expect.poll(() => labels(page)).toEqual(['Untitled 2', 'Untitled 3']);
    await expect.poll(() => activeLabel(page)).toBe('Untitled 2'); // the right neighbour
    await tabs(page).nth(1).click();
    await tabs(page).nth(1).getByTestId('tab-close').click();
    await expect.poll(() => labels(page)).toEqual(['Untitled 2']);
    await expect.poll(() => activeLabel(page)).toBe('Untitled 2'); // no right neighbour: the left
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

// ---- Drag to reorder (T13) -----------------------------------------------------------------

/** Presses on tab `index` and moves `dx` px sideways in small steps; the button stays down. */
async function dragBy(page: Page, index: number, dx: number): Promise<Box> {
  const b = await box(tabs(page).nth(index));
  const c = centre(b);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + dx, c.y, { steps: 8 });
  return b;
}

test('T13: a drag past 4 px reorders; under 4 px it is a click; Esc cancels', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    await openTabs(page, 3);
    await tabs(page).nth(0).click();
    const [a, b, c] = (await readTabs(page)).map((t) => t.id) as [string, string, string];

    // Under the 4 px threshold it is only a click: nothing is lifted, the order is unchanged.
    const second = await box(tabs(page).nth(1));
    await page.mouse.move(centre(second).x, centre(second).y);
    await page.mouse.down();
    await page.mouse.move(centre(second).x + 3, centre(second).y, { steps: 3 });
    await expect(page.locator('.is-reordering')).toHaveCount(0);
    await expect(page.locator('.is-dragging')).toHaveCount(0);
    await page.mouse.up();
    expect(await tabKeys(page)).toEqual([a, b, c]);
    await expect.poll(() => activeLabel(page)).toBe('Untitled 2');
    // The click's switch ends with the canvas taking focus (T11); wait for it before the next press.
    await expect(canvas(page)).toBeFocused();

    // Past 4 px: the tab is lifted, the others make room, the drop line shows.
    const width = (await box(tabs(page).nth(0))).width;
    await dragBy(page, 0, width * 2 + 8);
    await expect(page.locator('.tabs.is-reordering')).toHaveCount(1);
    await expect(page.locator('.tab.is-dragging')).toHaveCount(1);
    await expect(page.locator('.tab-drop')).toHaveCount(1);
    await page.mouse.up();
    await expect(page.locator('.is-reordering')).toHaveCount(0);
    await expect(page.locator('.tab-drop')).toHaveCount(0);
    expect((await readTabs(page)).map((t) => t.label)).toEqual([
      'Untitled 2',
      'Untitled 3',
      'Untitled',
    ]);
    expect(await tabKeys(page)).toEqual([b, c, a]);
    // The order is the model's order too (the hook reads the host's list).
    expect((await readTabs(page)).map((t) => t.id)).toEqual([b, c, a]);

    // Esc cancels: nothing moves, and the editor does not see the Esc.
    await dragBy(page, 2, -(width * 2 + 8));
    await expect(page.locator('.tabs.is-reordering')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.is-reordering')).toHaveCount(0);
    await page.mouse.up();
    expect(await tabKeys(page)).toEqual([b, c, a]);

    // Losing the pointer capture cancels too.
    await dragBy(page, 2, -(width * 2 + 8));
    await expect(page.locator('.tabs.is-reordering')).toHaveCount(1);
    const released = await tabList(page).evaluate((el) => {
      for (let id = 0; id < 8; id += 1) {
        if (el.hasPointerCapture(id)) {
          el.releasePointerCapture(id);
          return true;
        }
      }
      return false;
    });
    expect(released).toBe(true);
    // Chromium delivers `lostpointercapture` with the next pointer event.
    await page.mouse.move(10, 400);
    await expect(page.locator('.is-reordering')).toHaveCount(0);
    await page.mouse.up();
    expect(await tabKeys(page)).toEqual([b, c, a]);
    expect(await dialogLog(app)).toEqual([]);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('T13: the other tabs make room at once under prefers-reduced-motion, and move at the motion speed otherwise', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    await openTabs(page, 3);
    const other = (): Promise<string> =>
      tabs(page)
        .nth(1)
        .evaluate((el) => getComputedStyle(el).transitionDuration);
    const seconds = (v: string): number =>
      Math.max(
        ...v
          .split(',')
          .map((s) => (s.trim().endsWith('ms') ? parseFloat(s) / 1000 : parseFloat(s))),
      );

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await dragBy(page, 0, 120);
    await expect(page.locator('.tabs.is-reordering')).toHaveCount(1);
    expect(seconds(await other())).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await page.mouse.up();

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dragBy(page, 0, 120);
    await expect(page.locator('.tabs.is-reordering')).toHaveCount(1);
    expect(seconds(await other())).toBe(0);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.locator('.is-reordering')).toHaveCount(0);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

// ---- Overflow (T14, A21) -------------------------------------------------------------------

test('T14, A21: at 960 x 640 eight tabs fit; twelve shrink to 96 px and scroll with the chevrons, the wheel and a key switch', async () => {
  const { app, page } = await openApp({ size: [960, 640], launch: { dialogs: [] } });
  try {
    await openTabs(page, 8);
    await expect(page.getByTestId('tab-scroll-left')).toHaveCount(0);
    await expect(page.getByTestId('tab-scroll-right')).toHaveCount(0);
    await openTabs(page, 12);
    const list = tabList(page);
    const scrollLeft = (): Promise<number> => list.evaluate((el) => el.scrollLeft);
    const widths = await tabs(page).evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().width),
    );
    // Tabs shrink to A18's minimum width (the active one is the same width).
    for (const w of widths) expect(w).toBeGreaterThanOrEqual(95.5);
    expect(Math.min(...widths)).toBeLessThanOrEqual(96.5);

    // The new (last) tab is active and scrolled into view; only the left chevron is shown.
    await expect(page.getByTestId('tab-scroll-left')).toBeVisible();
    await expect(page.getByTestId('tab-scroll-right')).toHaveCount(0);
    await expectInView(page, tabs(page).nth(11));
    // The × of the active tab is still reachable.
    const active = await box(tabs(page).nth(11));
    const close = await box(tabs(page).nth(11).getByTestId('tab-close'));
    expect(close.x).toBeGreaterThanOrEqual(active.x);
    expect(close.x + close.width).toBeLessThanOrEqual(active.x + active.width + 1);

    // A key switch to the first tab scrolls it into view; now only the right chevron is shown.
    await canvas(page).focus();
    await page.keyboard.press('Control+1');
    await expect.poll(() => activeLabel(page)).toBe('Untitled');
    await expectInView(page, tabs(page).nth(0));
    await expect.poll(scrollLeft).toBe(0);
    await expect(page.getByTestId('tab-scroll-left')).toHaveCount(0);
    await expect(page.getByTestId('tab-scroll-right')).toBeVisible();
    // Ctrl+9 goes to the last tab, scrolled into view.
    await page.keyboard.press('Control+9');
    await expect.poll(() => activeLabel(page)).toBe('Untitled 12');
    await expectInView(page, tabs(page).nth(11));
    // A middle tab by key too.
    await page.keyboard.press('Control+6');
    await expect.poll(() => activeLabel(page)).toBe('Untitled 6');
    await expectInView(page, tabs(page).nth(5));

    // The chevrons scroll the strip (and never switch tabs).
    await page.keyboard.press('Control+1');
    await expect.poll(scrollLeft).toBe(0);
    await page.getByTestId('tab-scroll-right').click();
    await expect.poll(scrollLeft).toBeGreaterThan(0);
    const afterRight = await scrollLeft();
    expect(await activeLabel(page)).toBe('Untitled');
    await page.getByTestId('tab-scroll-left').click();
    await expect.poll(scrollLeft).toBeLessThan(afterRight);

    // The wheel over the strip scrolls it sideways.
    await page.keyboard.press('Control+1');
    await expect.poll(scrollLeft).toBe(0);
    const strip = await box(page.getByTestId('tab-strip'));
    await page.mouse.move(strip.x + strip.width / 2, strip.y + strip.height / 2);
    await page.mouse.wheel(0, 240);
    await expect.poll(scrollLeft).toBeGreaterThan(0);
    await expect(page.getByTestId('tab-scroll-left')).toBeVisible();
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

// ---- Tab menu (T15, CM4) -------------------------------------------------------------------

test('T15: the tab menu has New tab, Close tab and (when something can come back) Reopen closed tab; it acts on the right-clicked tab', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    await stubPopup(app, [null, 'close', 'reopen', 'new-tab', null, null]);
    await openTabs(page, 3);
    await expect.poll(() => activeLabel(page)).toBe('Untitled 3');

    // 1. Nothing to reopen: two items; a dismissed menu changes nothing, a right-click does not
    // activate the tab.
    await tabs(page).nth(0).click({ button: 'right' });
    await expect.poll(async () => (await popups(app)).length).toBe(1);
    const first = (await popups(app))[0] ?? [];
    expect(first.map((i) => i.type)).toEqual(['normal', 'separator', 'normal']);
    expect(first.map((i) => i.id)).toEqual(['new-tab', '', 'close']);
    expect(first.filter((i) => i.type === 'normal').map((i) => [i.label, i.accelerator])).toEqual([
      ['&New tab', 'CmdOrCtrl+T'],
      ['&Close tab', 'CmdOrCtrl+W'],
    ]);
    expect(first.every((i) => !i.registerAccelerator && i.role === null && i.enabled)).toBe(true);
    expect(await activeLabel(page)).toBe('Untitled 3');
    expect(await labels(page)).toEqual(['Untitled', 'Untitled 2', 'Untitled 3']);

    // 2. Close tab acts on the right-clicked tab (the first), not the active one.
    await tabs(page).nth(0).click({ button: 'right' });
    await expect.poll(() => labels(page)).toEqual(['Untitled 2', 'Untitled 3']);
    expect(await activeLabel(page)).toBe('Untitled 3');

    // 3. A closed tab can come back: the third item, with its key shown (the menu has three
    // commands).
    await tabs(page).nth(1).click({ button: 'right' });
    await expect.poll(async () => (await popups(app)).length).toBe(3);
    const third = (await popups(app))[2] ?? [];
    expect(third.map((i) => i.type)).toEqual([
      'normal',
      'separator',
      'normal',
      'separator',
      'normal',
    ]);
    expect(
      third.filter((i) => i.type === 'normal').map((i) => [i.id, i.label, i.accelerator]),
    ).toEqual([
      ['new-tab', '&New tab', 'CmdOrCtrl+T'],
      ['close', '&Close tab', 'CmdOrCtrl+W'],
      ['reopen', 'Reopen closed &tab', 'CmdOrCtrl+Shift+T'],
    ]);
    expect(third.every((i) => !i.registerAccelerator && i.role === null)).toBe(true);
    await expect.poll(() => labels(page)).toEqual(['Untitled', 'Untitled 2', 'Untitled 3']);
    await expect.poll(() => activeLabel(page)).toBe('Untitled');

    // 4. New tab from the menu adds a tab at the end and activates it.
    await tabs(page).nth(1).click({ button: 'right' });
    await expect
      .poll(() => labels(page))
      .toEqual(['Untitled', 'Untitled 2', 'Untitled 3', 'Untitled 4']);
    await expect.poll(() => activeLabel(page)).toBe('Untitled 4');

    // 5. The keys on a focused tab: the context-menu key and Shift+F10 ask for the menu under it.
    await tabs(page).nth(1).focus();
    await page.keyboard.press('ContextMenu');
    await expect.poll(async () => (await popups(app)).length).toBe(5);
    await page.keyboard.press('Shift+F10');
    await expect.poll(async () => (await popups(app)).length).toBe(6);
    expect(await labels(page)).toHaveLength(4);
    expect(await dialogLog(app)).toEqual([]);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

// ---- The close prompt (T9, SC19) ------------------------------------------------------------

const SAVE_BOX = (name: string) => ({
  method: 'showMessageBox',
  options: {
    type: 'warning',
    title: 'Chalkbond',
    message: `Do you want to save “${name}”?`,
    detail: "If you don't save, your drawing will be lost.",
    buttons: ['Save', "Don't save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  },
});

test("T9, SC19: closing an unsaved tab asks; Cancel keeps it, a cancelled Save as keeps it, Save writes and closes, Don't save closes", async () => {
  const file = join(dir, 'lesson.chalk');
  const { app, page } = await openApp({
    launch: {
      dialogs: [
        { response: 2 }, // 1. Cancel
        { response: 0 }, // 2. Save ...
        { canceled: true }, // ... the Save as box is cancelled: the tab stays
        { response: 0 }, // 3. Save ...
        { canceled: false, filePath: file }, // ... to a file: written, the tab closes
        { response: 1 }, // 4. Don't save (another tab)
      ],
    },
  });
  try {
    await edit(page);
    await edit(page, 700, 500);
    const drawn = await readDocument(page);
    await expect.poll(async () => (await readTabs(page))[0]?.marker).toBe('dot');
    await openTab(page); // an empty Untitled 2 keeps the window from closing with the tab
    await canvas(page).focus();
    await page.keyboard.press('Control+1');
    await expect.poll(() => activeLabel(page)).toBe('Untitled');

    // 1. Cancel: nothing changes.
    await page.keyboard.press('Control+w');
    await expect.poll(async () => (await dialogLog(app)).length).toBe(1);
    expect((await dialogLog(app))[0]).toEqual(SAVE_BOX('Untitled'));
    expect(await labels(page)).toEqual(['Untitled', 'Untitled 2']);
    expect(await atomCount(page)).toBe(2);

    // 2. Save, then the Save as box is cancelled: the tab is kept, unsaved.
    await page.keyboard.press('Control+w');
    await expect.poll(async () => (await dialogLog(app)).length).toBe(3);
    expect((await dialogLog(app)).map((d) => d.method)).toEqual([
      'showMessageBox',
      'showMessageBox',
      'showSaveDialog',
    ]);
    expect(await labels(page)).toEqual(['Untitled', 'Untitled 2']);
    expect((await readTabs(page))[0]?.marker).toBe('dot');
    expect(existsSync(file)).toBe(false);

    // 3. Save to a file: the tab closes once the file is written.
    await page.keyboard.press('Control+w');
    await expect.poll(() => labels(page)).toEqual(['Untitled 2']);
    expect(readFileSync(file, 'utf8')).toBe(serialize(drawn));
    expect((await dialogLog(app)).map((d) => d.method)).toEqual([
      'showMessageBox',
      'showMessageBox',
      'showSaveDialog',
      'showMessageBox',
      'showSaveDialog',
    ]);

    // 4. Don't save: the tab closes, nothing is written, no Save as box.
    await edit(page);
    await page.keyboard.press('Control+w');
    await expect.poll(() => labels(page)).toEqual(['Untitled']);
    expect(await dialogLog(app)).toHaveLength(6);
    expect((await dialogLog(app))[5]?.method).toBe('showMessageBox');
    expect(await atomCount(page)).toBe(0);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('T9: the box names the tab and the tab is activated first; the cross asks the same way', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [{ response: 2 }, { response: 1 }] } });
  try {
    await edit(page);
    await openTabs(page, 3);
    // Close the edited first tab from the third one by its cross: it is activated and asked about.
    await tabs(page).nth(0).hover();
    await tabs(page).nth(0).getByTestId('tab-close').click();
    await expect.poll(async () => (await dialogLog(app)).length).toBe(1);
    expect((await dialogLog(app))[0]).toEqual(SAVE_BOX('Untitled'));
    await expect.poll(() => activeLabel(page)).toBe('Untitled');
    expect(await atomCount(page)).toBe(1);
    // A middle-click asks too; Don't save closes it.
    await tabs(page).nth(0).click({ button: 'middle' });
    await expect.poll(() => labels(page)).toEqual(['Untitled 2', 'Untitled 3']);
    expect(await dialogLog(app)).toHaveLength(2);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

// ---- Reopen (T12) ---------------------------------------------------------------------------

test('T12: a closed "Don\'t save" Untitled comes back at its place with its drawing and history, under a fresh id', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [{ response: 1 }] } });
  try {
    await openTabs(page, 3);
    await tabs(page).nth(1).click();
    await expect.poll(() => activeLabel(page)).toBe('Untitled 2');
    await edit(page);
    await edit(page, 700, 500);
    const drawn = await readDocument(page);
    const oldId = (await readTabs(page))[1]?.id;
    await page.keyboard.press('Control+w');
    await expect.poll(() => labels(page)).toEqual(['Untitled', 'Untitled 3']);
    expect(await dialogLog(app)).toHaveLength(1);

    await page.keyboard.press('Control+Shift+t');
    await expect.poll(() => labels(page)).toEqual(['Untitled', 'Untitled 2', 'Untitled 3']);
    await expect.poll(() => activeLabel(page)).toBe('Untitled 2');
    const back = (await readTabs(page))[1] as HookTab;
    expect(back).toMatchObject({ label: 'Untitled 2', active: true, marker: 'dot' });
    expect(back.id).not.toBe(oldId);
    expect(serialize(await readDocument(page))).toBe(serialize(drawn));
    // The history came back with it: one undo removes the last atom, a redo puts it back.
    await canvas(page).focus();
    await page.keyboard.press('Control+z');
    await expect.poll(() => atomCount(page)).toBe(1);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => atomCount(page)).toBe(2);
    expect(await dialogLog(app)).toHaveLength(1);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

// ---- Per-tab state (T11) --------------------------------------------------------------------

test("T11: a switch restores each tab's drawing, undo history, selection and view; tool and name-field text stay window-wide", async () => {
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    // Tab 1: two atoms, one selected, zoomed in.
    await edit(page);
    await edit(page, 700, 500);
    await page.getByTestId('tool-select').click();
    const doc1 = await readDocument(page);
    const target = Object.values(doc1.atoms).find((a) => a.x !== 0) ?? Object.values(doc1.atoms)[0];
    if (target === undefined) throw new Error('no atoms');
    const at = await canvasPoint(page, target);
    await page.mouse.click(at.x, at.y);
    await expect.poll(async () => (await readSelection(page)).atoms.length).toBe(1);
    await canvas(page).focus();
    await page.keyboard.press('Control+=');
    await expect(readout(page)).toHaveText('200%');
    const selection1 = await readSelection(page);
    const view1 = await readContentView(page);

    // Tab 2: empty, default view, nothing selected; the tool and the field's text are window-wide.
    await page.getByTestId('tab-add').click();
    await expect.poll(() => activeLabel(page)).toBe('Untitled 2');
    expect(await atomCount(page)).toBe(0);
    expect(await readSelection(page)).toEqual({ atoms: [], bonds: [], objects: [] });
    await expect(readout(page)).toHaveText('150%');
    await page.getByTestId('tool-bond').click();
    await page.getByTestId('namefield-input').click();
    await page.keyboard.type('xyz');

    // Back to tab 1 by a click: its state is exactly as it was left, the window's is not.
    await tabs(page).nth(0).click();
    await expect.poll(() => activeLabel(page)).toBe('Untitled');
    await expect.poll(() => atomCount(page)).toBe(2);
    expect(serialize(await readDocument(page))).toBe(serialize(doc1));
    expect(await readSelection(page)).toEqual(selection1);
    expect(await readContentView(page)).toEqual(view1);
    await expect(readout(page)).toHaveText('200%');
    await expect(page.getByTestId('tool-bond')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('namefield-input')).toHaveValue('xyz');

    // Its undo history is its own: one undo removes one atom; tab 2 has nothing to undo.
    await canvas(page).focus();
    await page.keyboard.press('Control+z');
    await expect.poll(() => atomCount(page)).toBe(1);
    await page.keyboard.press('Control+2');
    await expect.poll(() => activeLabel(page)).toBe('Untitled 2');
    await page.keyboard.press('Control+z');
    expect(await atomCount(page)).toBe(0);
    await page.keyboard.press('Control+1');
    await expect.poll(() => atomCount(page)).toBe(1);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => atomCount(page)).toBe(2);
    await expect(page.getByTestId('namefield-input')).toHaveValue('xyz');
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

// ---- Fix items (1) and (3) ------------------------------------------------------------------

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test('fix item (1): an edit in a file tab, Ctrl+Tab at once to an edited picture tab, close it: the box appears', async () => {
  const lesson = join(dir, 'lesson.chalk');
  const picture = join(dir, 'toluene.png');
  writeFileSync(
    picture,
    withPictureChunks(PIXEL, { dpi: 300, payload: drawingPayload(goldenDoc('toluene')) }),
  );
  const { app, page } = await openApp({
    launch: {
      dialogs: [
        { canceled: false, filePath: lesson }, // Ctrl+S on Untitled: Save as, the tab is a file tab
        { canceled: false, filePaths: [picture] }, // Ctrl+O: the picture opens in a new tab
        { response: 2 }, // the close box: Cancel
        { response: 1 }, // the second close box: Don't save
      ],
    },
  });
  try {
    await edit(page);
    await page.keyboard.press('Control+s');
    await expect.poll(async () => (await readTabs(page))[0]?.kind).toBe('chalk');
    await page.keyboard.press('Control+o');
    await expect.poll(() => labels(page)).toEqual(['lesson', 'toluene.png']);
    await expect.poll(() => activeLabel(page)).toBe('toluene.png');
    // Edit the picture drawing: it is unsaved (a dot), and only Save as can keep it.
    await edit(page);
    await expect.poll(async () => (await readTabs(page))[1]?.marker).toBe('dot');

    // Edit the file tab, then switch to the picture tab at once: the file write that the switch
    // starts must not mark the picture tab saved.
    await page.keyboard.press('Control+1');
    await expect.poll(() => activeLabel(page)).toBe('lesson');
    await edit(page, 700, 500);
    const edited = await readDocument(page);
    await page.keyboard.press('Control+Tab');
    await expect.poll(() => activeLabel(page)).toBe('toluene.png');
    await page.keyboard.press('Control+w');
    await expect.poll(async () => (await dialogLog(app)).length).toBe(3);
    expect((await dialogLog(app))[2]).toEqual(SAVE_BOX('toluene.png'));
    expect(await labels(page)).toEqual(['lesson', 'toluene.png']);

    // The file tab's write lands (it equals serialize of the drawing); the picture tab is still unsaved.
    await expect.poll(() => readFileSync(lesson, 'utf8')).toBe(serialize(edited));
    expect((await readTabs(page)).map((t) => t.marker)).toEqual(['none', 'dot']);

    // Don't save closes it; the picture file is never written.
    const before = readFileSync(picture);
    await page.keyboard.press('Control+w');
    await expect.poll(() => labels(page)).toEqual(['lesson']);
    expect(readFileSync(picture).equals(before)).toBe(true);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('fix item (3): after a relaunch, closing a tab not shown since asks for an Untitled with content', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'chalkbond-tabs-data-'));
  try {
    const first = await launchIn(userData);
    await insertName(first.page, 'ethanol');
    await expectRecorded(first.page, userData);
    await openTab(first.page);
    await insertName(first.page, 'benzene');
    await expectRecorded(first.page, userData);
    await kill(first.app);

    const { app, page } = await launchIn(userData, { dialogs: [{ response: 2 }, { response: 1 }] });
    try {
      await expect
        .poll(async () => (await readTabs(page)).map((t) => [t.label, t.active, t.marker]))
        .toEqual([
          ['Untitled', false, 'dot'],
          ['Untitled 2', true, 'dot'],
        ]);
      // The first tab has not been shown in this run: its cross still asks, after reading it.
      await tabs(page).nth(0).hover();
      await tabs(page).nth(0).getByTestId('tab-close').click();
      await expect.poll(async () => (await dialogLog(app)).length).toBe(1);
      expect((await dialogLog(app))[0]).toEqual(SAVE_BOX('Untitled'));
      // Cancel keeps it, shown and with its drawing (the tab is activated first).
      await expect.poll(() => activeLabel(page)).toBe('Untitled');
      expect(await atomCount(page)).toBe(3);
      expect(await labels(page)).toEqual(['Untitled', 'Untitled 2']);
      // Don't save closes it.
      await page.getByTestId('canvas').focus();
      await page.keyboard.press('Control+w');
      await expect.poll(() => labels(page)).toEqual(['Untitled 2']);
      expect(await dialogLog(app)).toHaveLength(2);
      await expectNoNetwork(app);
    } finally {
      await app.close();
    }
  } finally {
    removeDir(userData);
  }
});

test('fix item (3): a tab not shown since the relaunch and holding nothing closes without a box', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'chalkbond-tabs-data-'));
  try {
    await drawThenKill(userData, 'ethanol');
    const { app, page } = await launchIn(userData, { dialogs: [] });
    try {
      await expect.poll(async () => (await readTabs(page)).length).toBe(1);
      await openTab(page);
      await tabs(page).nth(1).getByTestId('tab-close').click();
      await expect.poll(() => labels(page)).toEqual(['Untitled']);
      expect(await dialogLog(app)).toEqual([]);
      await expectNoNetwork(app);
    } finally {
      await app.close();
    }
  } finally {
    removeDir(userData);
  }
});

test('SC19: the window close shows no box when no tab is unkept, however many tabs have content', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'chalkbond-tabs-data-'));
  try {
    // Any box would be answered Cancel and keep the window open, so the exit proves there was none.
    const { app, page } = await launchIn(userData, { dialogs: [{ response: 2 }] });
    await edit(page);
    await openTab(page);
    await edit(page);
    await expect
      .poll(async () => (await readTabs(page)).map((t) => t.marker))
      .toEqual(['dot', 'dot']);
    await closeWindowForReal(app);
  } finally {
    removeDir(userData);
  }
});

// ---- Roles, names, targets, focus order (T16, A18, K4) -------------------------------------

test('T16: roles, names and the tab stop; the tab panel is labelled by the active tab', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    await expect(page.getByTestId('tab-strip')).toBeVisible();
    const list = tabList(page);
    await expect(list).toHaveAttribute('role', 'tablist');
    await expect(list).toHaveAttribute('aria-label', 'Open drawings');
    await edit(page); // Untitled with content: unsaved
    await openTab(page);
    await openTab(page);

    const ids = await tabKeys(page);
    expect(await tabs(page).evaluateAll((els) => els.map((e) => e.getAttribute('role')))).toEqual([
      'tab',
      'tab',
      'tab',
    ]);
    // Names: the label plus what the marker says; a marker is aria-hidden.
    const names = await tabs(page).evaluateAll((els) =>
      els.map((e) => e.getAttribute('aria-label')),
    );
    expect(names).toEqual(['Untitled, not saved as a file yet', 'Untitled 2', 'Untitled 3']);
    expect(
      await page
        .locator('.tab-dot, .tab-warn')
        .evaluateAll((els) => els.map((e) => e.getAttribute('aria-hidden'))),
    ).toEqual(['true']);
    // aria-selected on the active tab only; one tab stop (the active tab).
    expect(
      await tabs(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-selected'))),
    ).toEqual(['false', 'false', 'true']);
    expect(await tabs(page).evaluateAll((els) => els.map((e) => e.tabIndex))).toEqual([-1, -1, 0]);
    // The + button, the cross and the chevrons have names; the cross and chevrons are no tab stop.
    await expect(page.getByTestId('tab-add')).toHaveAttribute('aria-label', 'New tab (Ctrl+T)');
    await expect(tabs(page).nth(2).getByTestId('tab-close')).toHaveAttribute(
      'aria-label',
      'Close Untitled 3 (Ctrl+W)',
    );
    expect(
      await page.getByTestId('tab-close').evaluateAll((els) => els.map((e) => e.tabIndex)),
    ).toEqual([-1, -1, -1]);
    // The canvas region is the tab panel, labelled by the active tab.
    const panel = page.getByRole('tabpanel');
    await expect(panel).toHaveAttribute('aria-labelledby', `tab-${ids[2]}`);
    await tabs(page).nth(0).click();
    await expect(panel).toHaveAttribute('aria-labelledby', `tab-${ids[0]}`);
    expect(
      await page.evaluate(
        (id) => document.getElementById(id)?.getAttribute('role'),
        `tab-${ids[0]}`,
      ),
    ).toBe('tab');
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('T16: the tab name says ", couldn\'t save" for a file that cannot be written', async () => {
  const folder = join(dir, 'lessons');
  mkdirSync(folder);
  const file = join(folder, 'esterification.chalk');
  const { app, page } = await openApp({
    launch: { dialogs: [{ canceled: false, filePath: file }] },
  });
  try {
    await edit(page);
    await page.keyboard.press('Control+s');
    await expect.poll(() => labels(page)).toEqual(['esterification']);
    await expect(tabs(page).nth(0)).toHaveAttribute('aria-label', 'esterification');
    // The folder goes away; the next edit cannot be written (AS6): the warning icon, the name says so.
    rmSync(folder, { recursive: true });
    await edit(page, 700, 500);
    await expect
      .poll(async () => (await readTabs(page))[0]?.marker, { timeout: 15_000 })
      .toBe('unavailable');
    await expect(tabs(page).nth(0)).toHaveAttribute('aria-label', "esterification, couldn't save");
    await expect(tabs(page).nth(0).locator('.tab-warn')).toHaveAttribute('aria-hidden', 'true');
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('T16, SS6: the tab name says ", couldn\'t keep" when the session folder cannot be written', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'chalkbond-tabs-data-'));
  const sessionDir = join(userData, 'session');
  const win = process.platform === 'win32';
  const user = `${process.env['USERDOMAIN'] ?? ''}\\${process.env['USERNAME'] ?? ''}`;
  const lock = (): void => {
    if (win) {
      execFileSync('icacls', [sessionDir, '/deny', `${user}:(OI)(CI)(W,DC)`], { stdio: 'ignore' });
    } else {
      chmodSync(join(sessionDir, 'tabs'), 0o500);
    }
  };
  const unlock = (): void => {
    try {
      if (win) execFileSync('icacls', [sessionDir, '/remove:d', user], { stdio: 'ignore' });
      else chmodSync(join(sessionDir, 'tabs'), 0o700);
    } catch {
      // The folder may be gone already.
    }
  };
  // Any box (the "Couldn't keep" box, T9) is answered OK or Cancel; this test reads the name only.
  const { app, page } = await launchIn(userData, {
    dialogs: [{ response: 0 }, { response: 0 }, { response: 0 }],
  });
  try {
    await edit(page);
    await expectRecorded(page, userData);
    lock();
    await edit(page, 700, 500);
    await expect
      .poll(async () => (await readTabs(page))[0]?.marker, { timeout: 20_000 })
      .toBe('unkept');
    await expect(tabs(page).nth(0)).toHaveAttribute('aria-label', "Untitled, couldn't keep");
    await expectNoNetwork(app);
  } finally {
    unlock();
    await app.close().catch(() => undefined);
    removeDir(userData);
  }
});

test('T16: arrows move focus (wrapping) without activating; Home, End, Enter and Space', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    await openTabs(page, 3);
    await tabs(page).nth(0).click();
    await tabs(page).nth(0).focus();
    const focusedTab = (): Promise<number> =>
      tabs(page).evaluateAll((els) => els.findIndex((e) => e === document.activeElement));
    await page.keyboard.press('ArrowRight');
    expect(await focusedTab()).toBe(1);
    expect(await activeLabel(page)).toBe('Untitled'); // arrows never activate
    await page.keyboard.press('End');
    expect(await focusedTab()).toBe(2);
    await page.keyboard.press('ArrowRight'); // wraps
    expect(await focusedTab()).toBe(0);
    await page.keyboard.press('ArrowLeft'); // wraps back
    expect(await focusedTab()).toBe(2);
    await page.keyboard.press('Home');
    expect(await focusedTab()).toBe(0);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect.poll(() => activeLabel(page)).toBe('Untitled 2');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect.poll(() => activeLabel(page)).toBe('Untitled 3');
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('K4, T16: Tab goes rail, the active tab, the + button, the canvas; the cross and chevrons are no stop', async () => {
  const { app, page } = await openApp({ size: [960, 640], launch: { dialogs: [] } });
  try {
    await openTabs(page, 12);
    await tabs(page).nth(4).click();
    const where = (): Promise<string> =>
      page.evaluate(() => {
        const el = document.activeElement;
        if (el === null) return 'none';
        if (el.getAttribute('role') === 'tab') {
          return `tab:${[...document.querySelectorAll('[role="tab"]')].indexOf(el)}`;
        }
        return el.getAttribute('data-testid') ?? el.tagName.toLowerCase();
      });
    await expect(canvas(page)).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    expect(await where()).toBe('tab-add');
    await page.keyboard.press('Shift+Tab');
    expect(await where()).toBe('tab:4'); // the active tab is the strip's one stop
    await page.keyboard.press('Shift+Tab');
    expect(await where()).toMatch(/^tool-/); // the rail's tab stop
    await page.keyboard.press('Tab');
    expect(await where()).toBe('tab:4');
    await page.keyboard.press('Tab');
    expect(await where()).toBe('tab-add');
    await page.keyboard.press('Tab');
    expect(await where()).toBe('canvas');
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('A18, T16: a tab, its cross, the + button and the chevrons are at least 24 x 24 px', async () => {
  const { app, page } = await openApp({ size: [960, 640], launch: { dialogs: [] } });
  try {
    await openTabs(page, 12);
    await tabs(page).nth(0).click();
    await expect.poll(() => activeLabel(page)).toBe('Untitled');
    await expect(page.getByTestId('tab-scroll-right')).toBeVisible();
    const boxes = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-testid="tab"], [data-testid="tab-close"], [data-testid="tab-add"], [data-testid^="tab-scroll-"]',
        ),
      ].map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.getAttribute('data-testid') ?? '', w: r.width, h: r.height };
      }),
    );
    const of = (id: string): { id: string; w: number; h: number }[] =>
      boxes.filter((b) => b.id === id);
    expect(of('tab')).toHaveLength(12);
    expect(of('tab-close')).toHaveLength(12);
    expect(of('tab-add')).toHaveLength(1);
    expect(of('tab-scroll-right')).toHaveLength(1);
    for (const b of boxes) {
      expect(b.w, `${b.id} width`).toBeGreaterThanOrEqual(24);
      expect(b.h, `${b.id} height`).toBeGreaterThanOrEqual(24);
    }
    // A18's sizes: the cross 24 x 24, the + 28 x 28, a chevron 24 x 28, a tab 28 high (29 active).
    for (const b of of('tab-close')) expect([b.w, b.h]).toEqual([24, 24]);
    expect(of('tab-add').map((b) => [b.w, b.h])).toEqual([[28, 28]]);
    expect(of('tab-scroll-right').map((b) => [b.w, b.h])).toEqual([[24, 28]]);
    expect(of('tab').map((b) => b.h)).toEqual([29, ...Array<number>(11).fill(28)]);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('T2, T5: the strip is shown with one tab; the cross keeps its room so a label never moves', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    await expect(page.getByTestId('tab-strip')).toBeVisible();
    await expect(tabs(page)).toHaveCount(1);
    await expect(page.getByTestId('tab-add')).toBeVisible();
    await openTab(page);
    // The label of the inactive tab and of the active one start at the same offset in their tabs;
    // the cross of an inactive tab is hidden but still has its box.
    const title = (i: number): Promise<number> =>
      tabs(page)
        .nth(i)
        .evaluate((el) => {
          const t = el.querySelector('.tab-title') as HTMLElement;
          return t.getBoundingClientRect().left - el.getBoundingClientRect().left;
        });
    expect(await title(0)).toBe(await title(1));
    await expect(tabs(page).nth(0).getByTestId('tab-close')).toBeHidden();
    await tabs(page).nth(0).hover();
    await expect(tabs(page).nth(0).getByTestId('tab-close')).toBeVisible();
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});
