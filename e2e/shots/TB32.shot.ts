// TB32 shots (tasks/todo-tabs.md; mock-ups docs/mockups/shell A01, A12, A18, A19, A21). They are
// for looking at (AGENTS.md "Shots"); the measurable checks are DOM boxes in e2e/app-tabs.spec.ts
// (TB27). Run `node docs/mockups/shell/build.mjs --png out/mockups-shell` and open each PNG next
// to its mock-up. Named `TB32`, not `A18`: e2e/shots/A18.shot.ts already holds the focus rings.
//
//   A18  strip-one, strip-several (active, rest, dot, long name), strip-states (hover, focus, +),
//        strip-warning-unavailable, strip-warning-unkept, strip-overflow-*-960, strip-drag,
//        tooltip-* (tab, unsaved, unavailable, unkept, close, new)
//   A19  menu-closed, menu-pressed (the popup is native: it is stubbed and never drawn), menu-tooltip
//   A21  min-tabs-960 and options-<tool>-960 for every tool (a DOM check that each bar fits too)
//   A01  main (1280 x 800, the scheme saved as esterification)
//   A12  shortcuts, shortcuts-tabs, shortcuts-scrolled, shortcuts-960
//
// Names ending in `-960` are at 960 x 640 content; the others at 1280 x 800. `*-clip` files are the
// strip region alone (no new information, easier to compare with the sheets at real size).
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { serialize } from '../../src/core/doc-model';
import { stubPopup } from '../app-menu';
import { dropStaged, stageFiles } from '../drop-steps';
import { loadScheme } from '../fixtures';
import {
  activateTab,
  canvasPoint,
  expectNoNetwork,
  goldenDoc,
  insertName,
  openApp,
  openTab,
  readDocument,
  readTabs,
  shot,
} from '../harness';

const ID = 'TB32';
const OUT = resolve(__dirname, '../../out/shots', ID);

let dir: string;
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chalkbond-tb32-'));
});
test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

const saveTo = (filePath: string) => ({ canceled: false, filePath });
const openFiles = (filePaths: string[]) => ({ canceled: false, filePaths });
const BOX_OK = { response: 0, checkboxChecked: false };

/** Writes `<name>.chalk` into the temp folder from a frozen golden input; returns its path. */
function chalkFile(name: string, golden = 'ethanol'): string {
  const file = join(dir, `${name}.chalk`);
  writeFileSync(file, serialize(goldenDoc(golden)));
  return file;
}

/** The tab strip row (strip, rail edge and a slice of canvas): a clip screenshot beside the full one. */
async function clip(page: Page, name: string, width = 1280): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({
    path: join(OUT, `${name}-clip.png`),
    clip: { x: 0, y: 0, width, height: 180 },
  });
}

/** A full shot and its strip clip. */
async function both(page: Page, name: string, width = 1280): Promise<void> {
  await shot(page, ID, name);
  await clip(page, name, width);
}

/** Moves the pointer onto the canvas where nothing is drawn, so no hover state is in the shot. */
async function park(page: Page, x = 1200, y = 780): Promise<void> {
  await page.mouse.move(x, y);
  await page.waitForTimeout(250);
}

const canvasArea = (page: Page): Locator => page.getByTestId('canvas');

/** Adds one atom with the Atom tool so the active drawing has content and is saved or kept. */
async function draw(page: Page, x = 900, y = 600): Promise<void> {
  await page.getByTestId('tool-atom').click();
  await canvasArea(page).click({ position: { x, y } });
  await canvasArea(page).focus();
}

/** Waits until the tab strip has these labels, in order. */
async function expectLabels(page: Page, labels: string[]): Promise<void> {
  await expect.poll(async () => (await readTabs(page)).map((t) => t.label)).toEqual(labels);
  await expect(page.getByTestId('tab')).toHaveCount(labels.length);
}

/**
 * The scheme saved as `esterification.chalk` (the active tab), then ethanol, an unnamed drawing with
 * content (the dot) and a long-named file: the "Several tabs" row of A18. The first tab is active.
 */
async function severalTabs(page: Page): Promise<void> {
  await loadScheme(page);
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Control+s');
  await expectLabels(page, ['esterification']);
  await page.keyboard.press('Control+o'); // the stubbed Open dialog: ethanol
  await expectLabels(page, ['esterification', 'ethanol']);
  await openTab(page);
  await insertName(page, 'benzene');
  await expect.poll(async () => (await readTabs(page)).at(-1)?.marker).toBe('dot');
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Control+o'); // the stubbed Open dialog: the long name
  await expect.poll(async () => (await readTabs(page)).length).toBe(4);
  const first = (await readTabs(page))[0]?.id ?? '';
  await activateTab(page, first);
  await expect.poll(async () => (await readTabs(page))[0]?.active).toBe(true);
}

// ---- A18: the strip ----

test('A18 strip-one: one tab, nothing drawn, no dot', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    await expect(page.getByTestId('tab')).toHaveCount(1);
    await expect.poll(async () => (await readTabs(page))[0]?.marker).toBe('none');
    await park(page);
    await both(page, 'strip-one');
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('A18 strip-several, strip-states: active, rest, dot, long name, hover, keyboard focus, +', async () => {
  const ethanol = chalkFile('ethanol');
  const long = chalkFile('Aspirin synthesis from salicylic acid', 'acetic-acid');
  const { app, page } = await openApp({
    launch: {
      dialogs: [saveTo(join(dir, 'esterification.chalk')), openFiles([ethanol]), openFiles([long])],
    },
  });
  try {
    await severalTabs(page);
    expect((await readTabs(page)).map((t) => t.marker)).toEqual(['none', 'none', 'dot', 'none']);
    await park(page);
    await both(page, 'strip-several');

    // Hover on an inactive tab (its cross shows), then keyboard focus on the active tab, then +.
    await page.getByTestId('tab').nth(1).hover();
    await both(page, 'strip-hover');
    await page.getByTestId('tab').nth(0).focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('tab').nth(0)).toBeFocused();
    await park(page);
    await both(page, 'strip-focus');
    await page.getByTestId('tab-add').hover();
    await both(page, 'strip-add-hover');
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('A18 strip-warning-unavailable: a file tab whose folder is gone, beside a dot', async () => {
  const folder = join(dir, 'lessons');
  mkdirSync(folder);
  const scheme = join(dir, 'esterification.chalk');
  const doomed = join(folder, 'ethanol.chalk');
  writeFileSync(doomed, serialize(goldenDoc('ethanol')));
  const { app, page } = await openApp({
    launch: { dialogs: [saveTo(scheme), openFiles([doomed])] },
  });
  try {
    await loadScheme(page);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+s');
    await expectLabels(page, ['esterification']);
    await page.keyboard.press('Control+o');
    await expectLabels(page, ['esterification', 'ethanol']);
    await openTab(page);
    await insertName(page, 'benzene');
    await expect.poll(async () => (await readTabs(page)).at(-1)?.marker).toBe('dot');
    // Back to ethanol; the folder goes away and the next edit cannot be written (AS6).
    await activateTab(page, (await readTabs(page))[1]?.id ?? '');
    rmSync(folder, { recursive: true });
    await draw(page, 700, 500);
    await expect
      .poll(async () => (await readTabs(page))[1]?.marker, { timeout: 15_000 })
      .toBe('unavailable');
    await activateTab(page, (await readTabs(page))[0]?.id ?? '');
    await page.getByTestId('tool-select').click();
    await park(page);
    await both(page, 'strip-warning-unavailable');

    // The tooltips of the tabs (T5): the dot, the warning icon, and a plain tab.
    const tip = page.getByRole('tooltip');
    const hoverTip = async (index: number, name: string): Promise<void> => {
      await page.mouse.move(1200, 780);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(450);
      await page.getByTestId('tab').nth(index).hover();
      await tip.waitFor();
      await page.waitForTimeout(250);
      await both(page, name);
    };
    await hoverTip(0, 'tooltip-tab');
    await hoverTip(2, 'tooltip-unsaved');
    await hoverTip(1, 'tooltip-unavailable');
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('A18 strip-warning-unkept: the session folder cannot be written (SS6)', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'chalkbond-tb32-data-'));
  const sessionDir = join(userData, 'session');
  const win = process.platform === 'win32';
  const user = `${process.env['USERDOMAIN'] ?? ''}\\${process.env['USERNAME'] ?? ''}`;
  const lock = (): void => {
    if (win) {
      execFileSync('icacls', [sessionDir, '/deny', `${user}:(OI)(CI)(W,DC)`], { stdio: 'ignore' });
    } else chmodSync(join(sessionDir, 'tabs'), 0o500);
  };
  const unlock = (): void => {
    try {
      if (win) execFileSync('icacls', [sessionDir, '/remove:d', user], { stdio: 'ignore' });
      else chmodSync(join(sessionDir, 'tabs'), 0o700);
    } catch {
      // The folder may be gone already.
    }
  };
  // The "Couldn't keep" box (T9) is answered OK; these shots read the strip only.
  const { app, page } = await openApp({
    launch: { userData, dialogs: [BOX_OK, BOX_OK, BOX_OK] },
  });
  try {
    await draw(page);
    await expect.poll(async () => (await readTabs(page))[0]?.marker).toBe('dot');
    await page.waitForTimeout(1500); // let the first record reach the disk before the lock
    lock();
    await draw(page, 700, 500);
    await expect
      .poll(async () => (await readTabs(page))[0]?.marker, { timeout: 20_000 })
      .toBe('unkept');
    await page.getByTestId('tool-select').click();
    await park(page);
    await both(page, 'strip-warning-unkept');
    const tip = page.getByRole('tooltip');
    await page.getByTestId('tab').nth(0).hover();
    await tip.waitFor();
    await page.waitForTimeout(250);
    await both(page, 'tooltip-unkept');
    await expectNoNetwork(app);
  } finally {
    unlock();
    await app.close().catch(() => undefined);
    rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});

test('A18 tooltips on the close cross and on +', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    await insertName(page, 'benzene');
    const tip = page.getByRole('tooltip');
    await page.getByTestId('tab-close').first().hover();
    await tip.waitFor();
    await page.waitForTimeout(250);
    await both(page, 'tooltip-close');
    await page.mouse.move(1200, 780);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
    await page.getByTestId('tab-add').hover();
    await tip.waitFor();
    await page.waitForTimeout(250);
    await both(page, 'tooltip-new');
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('A18 strip-overflow-*-960: twelve tabs shrink to 96 px and scroll, with the chevrons', async () => {
  const names = [
    'ethanol',
    'benzene',
    'aspirin',
    'alkenes',
    'soap',
    'polymers',
    'titration',
    'Grade 12 notes',
    'esters',
    'amines',
  ];
  const files = names.map((n) => chalkFile(n));
  const { app, page } = await openApp({
    size: [960, 640],
    launch: { dialogs: [] },
  });
  try {
    // A drop of several files opens each in a tab, in order (the dialog takes one path only).
    await stageFiles(page, files);
    await dropStaged(page);
    await expect.poll(async () => (await readTabs(page)).length).toBe(names.length);
    // The empty Untitled tab was reused by the first file; add an unnamed drawing with content.
    await openTab(page);
    await insertName(page, 'benzene');
    await openTab(page);
    const list = page.getByRole('tablist', { name: 'Open drawings' });
    const scrollLeft = (): Promise<number> => list.evaluate((el) => el.scrollLeft);
    await expect(page.getByTestId('tab-scroll-left')).toBeVisible();
    await park(page, 600, 628);
    await both(page, 'strip-overflow-end-960', 960);

    // Ctrl+1 goes to the first tab, scrolled into view: only the right chevron remains.
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+1');
    await expect.poll(scrollLeft).toBe(0);
    await expect(page.getByTestId('tab-scroll-left')).toHaveCount(0);
    await expect(page.getByTestId('tab-scroll-right')).toBeVisible();
    await park(page, 600, 628);
    await both(page, 'strip-overflow-start-960', 960);

    // A short wheel turn over the strip: more tabs on both sides, so both chevrons.
    const strip = await list.boundingBox();
    if (strip === null) throw new Error('no strip');
    await page.mouse.move(strip.x + strip.width / 2, strip.y + strip.height / 2);
    await page.mouse.wheel(0, 120);
    await expect.poll(scrollLeft).toBeGreaterThan(0);
    await expect(page.getByTestId('tab-scroll-left')).toBeVisible();
    await expect(page.getByTestId('tab-scroll-right')).toBeVisible();
    await park(page, 600, 628);
    await both(page, 'strip-overflow-middle-960', 960);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('A18 strip-drag: a tab lifted and dragged to the front', async () => {
  const ethanol = chalkFile('ethanol');
  const long = chalkFile('Aspirin synthesis from salicylic acid', 'acetic-acid');
  const { app, page } = await openApp({
    launch: {
      dialogs: [saveTo(join(dir, 'esterification.chalk')), openFiles([ethanol]), openFiles([long])],
    },
  });
  try {
    await severalTabs(page);
    const tabs = page.getByTestId('tab');
    const second = await tabs.nth(1).boundingBox();
    if (second === null) throw new Error('no box');
    const cx = second.x + second.width / 2;
    const cy = second.y + second.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(110, cy + 4, { steps: 12 }); // left of the first tab's middle: drop at the front
    await expect(page.locator('.tab.is-dragging')).toHaveCount(1);
    await page.waitForTimeout(150);
    await both(page, 'strip-drag');
    await page.keyboard.press('Escape'); // cancel: nothing moves
    await page.mouse.up();
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

// ---- A19: the menu button ----

test('A19 menu-closed and menu-pressed (a popup that never closes)', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    await loadScheme(page);
    await park(page);
    await shot(page, ID, 'menu-closed');
    // The popup is native and not part of a shot. A popup that never closes keeps the button
    // pressed (`aria-expanded`), which is the in-window half of A19.
    await app.evaluate(({ Menu }) => {
      Menu.prototype.popup = function popup() {
        // Left open on purpose: the close callback never runs.
      };
    });
    await page.getByTestId('app-menu').click();
    await expect(page.getByTestId('app-menu')).toHaveAttribute('aria-expanded', 'true');
    await park(page, 1200, 700);
    await shot(page, ID, 'menu-pressed');
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('A19 menu-tooltip on the closed button', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    await stubPopup(app, []);
    await loadScheme(page);
    await page.getByTestId('app-menu').hover();
    await page.getByRole('tooltip').waitFor();
    await page.waitForTimeout(250);
    await shot(page, ID, 'menu-tooltip');
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

// ---- A21: the minimum window ----

const TOOLS = [
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

/** The options bar and the top bar hold every child inside their own box (nothing is cut or scrolled). */
async function expectFits(page: Page, label: string): Promise<void> {
  const result = await page.getByTestId('options').evaluate((el) => {
    const box = el.getBoundingClientRect();
    const top = el.closest('[data-testid="topbar"]') as HTMLElement | null;
    const topBox = top?.getBoundingClientRect();
    const right = Math.max(
      0,
      ...Array.from(el.children).map((c) => c.getBoundingClientRect().right),
    );
    const copy = document.querySelector('[data-testid="copy"]')?.getBoundingClientRect();
    return {
      scroll: el.scrollWidth - el.clientWidth,
      overshoot: right - box.right,
      topScroll: top ? top.scrollWidth - top.clientWidth : 0,
      topRight: topBox ? topBox.right : 0,
      copyLeft: copy ? copy.left : 0,
      optionsRight: box.right,
    };
  });
  expect(result.scroll, `${label}: options scroll`).toBeLessThanOrEqual(0);
  expect(result.overshoot, `${label}: a button leaves the bar`).toBeLessThanOrEqual(0.5);
  expect(result.topScroll, `${label}: top bar scroll`).toBeLessThanOrEqual(0);
  expect(result.optionsRight, `${label}: bar reaches Copy`).toBeLessThanOrEqual(result.copyLeft);
}

test('A21 min-tabs-960 and the options bar of every tool fit at 960 x 640', async () => {
  const ethanol = chalkFile('ethanol');
  const { app, page } = await openApp({
    size: [960, 640],
    launch: { dialogs: [saveTo(join(dir, 'esterification.chalk')), openFiles([ethanol])] },
  });
  try {
    await loadScheme(page);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+s');
    await expectLabels(page, ['esterification']);
    await page.keyboard.press('Control+o');
    await expectLabels(page, ['esterification', 'ethanol']);
    await openTab(page);
    await insertName(page, 'benzene');
    await activateTab(page, (await readTabs(page))[0]?.id ?? '');
    await expect.poll(async () => (await readTabs(page))[0]?.active).toBe(true);
    await page.getByTestId('tool-atom').click();
    await park(page, 600, 628);
    await both(page, 'min-tabs-960', 960);
    for (const tool of TOOLS) {
      await page.getByTestId(`tool-${tool}`).click();
      await expect(page.getByTestId(`tool-${tool}`)).toHaveAttribute('aria-pressed', 'true');
      await park(page, 600, 628);
      await expectFits(page, tool);
      await both(page, `options-${tool}-960`, 960);
    }
    // Every ring template and bond kind selected by the bar, and the widest atom bar.
    await page.getByTestId('tool-atom').click();
    await expectFits(page, 'atom');
    // Select with a selection (Flip, Tidy, Kekulé, the formula switch), no Expand.
    await page.getByTestId('tool-select').click();
    await page.mouse.click(900, 620);
    await page.keyboard.press('Control+a');
    await expect.poll(() => page.getByTestId('act-flip-h').count()).toBe(1);
    await park(page, 600, 628);
    await expectFits(page, 'select with a selection');
    await both(page, 'options-select-selection-960', 960);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('A21 options-select-expand-960: Select with Expand, the widest Select bar, fits', async () => {
  const { app, page } = await openApp({ size: [960, 640], launch: { dialogs: [] } });
  try {
    await insertName(page, 'ethanol');
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Escape');
    const doc = await readDocument(page);
    const o = Object.values(doc.atoms).find((a) => a.element === 'O');
    if (o === undefined) throw new Error('no oxygen');
    const at = await canvasPoint(page, o);
    await page.mouse.move(at.x, at.y);
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
    await page.keyboard.type('Ph');
    await page.keyboard.press('Enter');
    await page.getByTestId('tool-select').click();
    await page.mouse.click(700, 120);
    const now = await readDocument(page);
    const ph = Object.values(now.atoms).find((a) => a.label === 'Ph');
    if (ph === undefined) throw new Error('no Ph');
    const p = await canvasPoint(page, ph);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('act-expand')).toBeVisible();
    await park(page, 600, 628);
    await expectFits(page, 'select with Expand');
    await both(page, 'options-select-expand-960', 960);
    await page.getByTestId('act-formula').click();
    await park(page, 600, 628);
    await expectFits(page, 'select with Expand, structural');
    await both(page, 'options-select-expand-structural-960', 960);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

// ---- A01: the main window ----

test('A01 main: the scheme saved as esterification beside ethanol and an unsaved drawing, at 1280 x 800', async () => {
  const ethanol = chalkFile('ethanol');
  const { app, page } = await openApp({
    launch: { dialogs: [saveTo(join(dir, 'esterification.chalk')), openFiles([ethanol])] },
  });
  try {
    await loadScheme(page);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+s');
    await expectLabels(page, ['esterification']);
    await page.keyboard.press('Control+o');
    await expectLabels(page, ['esterification', 'ethanol']);
    await openTab(page);
    await insertName(page, 'benzene');
    await expect.poll(async () => (await readTabs(page)).at(-1)?.marker).toBe('dot');
    await activateTab(page, (await readTabs(page))[0]?.id ?? '');
    await expect.poll(async () => (await readTabs(page))[0]?.active).toBe(true);
    // Esc clears the "Saved ..." notice, so the status bar shows the Select hint as A01 does.
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('statusbar').getByRole('status')).toContainText(
      'Click a molecule to select it',
    );
    await park(page, 1270, 790);
    await shot(page, ID, 'main');
    await clip(page, 'main');
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

// ---- A12: the shortcuts dialog ----

for (const [name, size] of [
  ['shortcuts', [1280, 800]],
  ['shortcuts-960', [960, 640]],
] as const) {
  test(`A12 ${name}`, async () => {
    const { app, page } = await openApp({ size: [...size], launch: { dialogs: [] } });
    try {
      await loadScheme(page);
      await openTab(page);
      await page.getByTestId('canvas').focus();
      await page.keyboard.press('F1');
      const dialog = page.getByTestId('shortcuts-dialog');
      await expect(dialog).toBeVisible();
      await page.mouse.move(size[0] - 10, size[1] - 10);
      await shot(page, ID, name);
      if (name === 'shortcuts') {
        const body = dialog.locator('.dialog-body');
        // The "Tabs and files" section, then the end of the list.
        await body.evaluate((el) => {
          const heading = Array.from(
            el.querySelectorAll('h3, h2, .shortcut-group, [role=heading]'),
          ).find((h) => /Tabs and files/.test(h.textContent ?? ''));
          (heading ?? el.lastElementChild)?.scrollIntoView({ block: 'start' });
        });
        await shot(page, ID, 'shortcuts-tabs');
        await body.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        await shot(page, ID, 'shortcuts-scrolled');
      }
      await expectNoNetwork(app);
    } finally {
      await app.close();
    }
  });
}
