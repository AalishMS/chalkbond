// A13 (SPEC-app-shell.md CM1–CM3, R3, TH4, TH5): the native context menus as data. `Menu.prototype
// .popup` is stubbed in main to record the items Electron received and to click a scripted choice
// (or none: Esc); Playwright cannot see a native menu.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { Doc } from '../src/core/doc-model';
import { menuItem, popups, stubPopup, type PopupItem } from './app-menu';
import {
  canvasPoint,
  expectNoNetwork,
  insertName,
  openApp,
  readDocument,
  readSelection,
} from './harness';

const labels = (items: PopupItem[] | undefined) =>
  (items ?? []).map((i) => (i.type === 'separator' ? '—' : i.label));

/** Benzene, then ethanol to its right (A07's drawing); nothing selected, Select tool, canvas focus. */
async function benzeneAndEthanol(page: Page): Promise<{ doc: Doc; ethanol: string[] }> {
  await insertName(page, 'benzene');
  const ring = Object.keys((await readDocument(page)).atoms);
  await insertName(page, 'ethanol');
  await page.getByTestId('canvas').focus();
  const select = page.getByTestId('tool-select');
  const settled = async (): Promise<boolean> => {
    const s = await readSelection(page);
    const none = s.atoms.length + s.bonds.length + s.objects.length === 0;
    return none && (await select.getAttribute('aria-pressed')) === 'true';
  };
  for (let i = 0; i < 6 && !(await settled()); i++) await page.keyboard.press('Escape');
  expect(await settled()).toBe(true);
  const doc = await readDocument(page);
  return { doc, ethanol: Object.keys(doc.atoms).filter((id) => !ring.includes(id)) };
}

async function atomPoint(page: Page, doc: Doc, id: string) {
  const atom = doc.atoms[id as keyof Doc['atoms']];
  if (!atom) throw new Error(`no atom ${id}`);
  return canvasPoint(page, atom);
}

/** An empty spot well below the drawing. */
async function emptyPoint(page: Page) {
  const box = await page.getByTestId('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  return { x: box.x + 60, y: box.y + box.height - 60 };
}

// The ☰ popup's Undo row (the application menu is gone, R32); it replaces the popup stub.
const canUndo = async (app: ElectronApplication): Promise<boolean> =>
  (await menuItem(app, 'edit.undo')).enabled;

test('CM1: right-click an unselected ethanol atom selects ethanol first; the item menu; Delete removes it', async () => {
  const { app, page } = await openApp();
  try {
    const { doc, ethanol } = await benzeneAndEthanol(page);
    await stubPopup(app, ['edit.delete']);
    const at = await atomPoint(page, doc, ethanol[1] ?? '');
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await expect.poll(async () => (await popups(app)).length).toBe(1);
    const [items] = await popups(app);
    expect(labels(items)).toEqual(['Cu&t', '&Copy', '&Duplicate', 'De&lete', '—', '&Paste']);
    expect(items?.map((i) => i.id)).toEqual([
      'edit.cut',
      'edit.copy',
      'edit.duplicate',
      'edit.delete',
      '',
      'edit.paste',
    ]);
    for (const item of items ?? []) {
      expect(item.role).toBeNull();
      expect(item.registerAccelerator).toBe(false);
    }
    expect(items?.filter((i) => i.type !== 'separator').every((i) => i.enabled)).toBe(true);
    await expect
      .poll(async () => Object.keys((await readDocument(page)).atoms).length)
      .toBe(Object.keys(doc.atoms).length - ethanol.length);
    const after = await readDocument(page);
    for (const id of ethanol) expect(after.atoms).not.toHaveProperty(id);
    await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
    expect(await popups(app)).toHaveLength(1); // one canvas menu, no CM3 menu beside it
  } finally {
    await app.close();
  }
});

test('CM1: before the event, the selection is the whole ethanol fragment (A4)', async () => {
  const { app, page } = await openApp();
  try {
    const { doc, ethanol } = await benzeneAndEthanol(page);
    await stubPopup(app, [null]);
    const at = await atomPoint(page, doc, ethanol[0] ?? '');
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await expect.poll(async () => (await popups(app)).length).toBe(1);
    expect((await readSelection(page)).atoms.sort()).toEqual([...ethanol].sort());
  } finally {
    await app.close();
  }
});

test('CM1: empty canvas with nothing selected → Copy whole drawing; dismissed (Esc) changes nothing', async () => {
  const { app, page } = await openApp();
  try {
    const { doc, ethanol } = await benzeneAndEthanol(page);
    await stubPopup(app, [null, null]);
    const empty = await emptyPoint(page);
    await page.mouse.click(empty.x, empty.y, { button: 'right' });
    await expect.poll(async () => (await popups(app)).length).toBe(1);
    const [items] = await popups(app);
    expect(labels(items)).toEqual(['&Paste', '&Copy whole drawing', '—', 'Select &all']);
    expect(items?.map((i) => i.id)).toEqual(['edit.paste', 'edit.copy', '', 'edit.select-all']);
    await page.waitForTimeout(100);
    expect(await readDocument(page)).toEqual(doc);
    expect((await readSelection(page)).atoms).toEqual([]);
    expect(await canUndo(app)).toBe(true); // the inserts only; nothing new

    // A selected item right-clicked and dismissed: the selection and drawing stay as they were.
    await page.getByTestId('canvas').focus();
    const at = await atomPoint(page, doc, ethanol[0] ?? '');
    await page.mouse.click(at.x, at.y);
    const selected = await readSelection(page);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await expect.poll(async () => (await popups(app)).length).toBe(2);
    await page.waitForTimeout(100);
    expect(await readSelection(page)).toEqual(selected);
    expect(await readDocument(page)).toEqual(doc);
  } finally {
    await app.close();
  }
});

test('CM1 after typing in the name field: Delete acts on the drawing, the field text is untouched', async () => {
  const { app, page } = await openApp();
  try {
    const { doc, ethanol } = await benzeneAndEthanol(page);
    const input = page.getByTestId('namefield-input');
    await input.click();
    await input.fill('acetone');
    await expect(input).toBeFocused();
    await stubPopup(app, ['edit.delete']);
    const at = await atomPoint(page, doc, ethanol[1] ?? '');
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await expect.poll(async () => (await popups(app)).length).toBe(1);
    expect((await popups(app))[0]?.find((i) => i.id === 'edit.cut')?.label).toBe('Cu&t');
    await expect
      .poll(async () => Object.keys((await readDocument(page)).atoms).length)
      .toBe(Object.keys(doc.atoms).length - ethanol.length);
    await expect(input).toHaveValue('acetone');
    await expect(page.getByTestId('canvas')).toBeFocused();
  } finally {
    await app.close();
  }
});

test('CM1 during a gesture: right button cancels it; no menu, no history entry', async () => {
  const { app, page } = await openApp();
  try {
    const { doc } = await benzeneAndEthanol(page);
    await stubPopup(app, []);
    await page.getByTestId('tool-bond').click();
    const start = await emptyPoint(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 40, start.y - 30, { steps: 4 });
    await page.mouse.click(start.x + 40, start.y - 30, { button: 'right' });
    await page.mouse.up();
    await page.waitForTimeout(150);
    expect(await popups(app)).toEqual([]);
    expect(await readDocument(page)).toEqual(doc);
  } finally {
    await app.close();
  }
});

test('CM3: right-click in the name field → the text menu with the four roles, once; elsewhere none', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').waitFor();
    await stubPopup(app, []);
    // A non-editable part of the window (the tool rail) shows nothing. (Checked first: a stubbed
    // CM3 popup never tells Chromium its menu closed, so no mouse input should follow it.)
    await page.getByTestId('tool-select').click({ button: 'right' });
    await page.waitForTimeout(150);
    expect(await popups(app)).toHaveLength(0);
    const input = page.getByTestId('namefield-input');
    await input.click();
    await input.fill('ethanol');
    await input.click({ button: 'right' });
    await expect.poll(async () => (await popups(app)).length).toBe(1);
    const [items] = await popups(app);
    // Electron reports a built item's role in lower case (`selectAll` → `selectall`).
    expect(items?.map((i) => i.role ?? i.type)).toEqual([
      'cut',
      'copy',
      'paste',
      'separator',
      'selectall',
    ]);
    expect(labels(items)).toEqual(['Cu&t', '&Copy', '&Paste', '—', 'Select &all']);
    await page.waitForTimeout(150);
    expect(await popups(app)).toHaveLength(1);
    await expect(input).toHaveValue('ethanol');
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});
