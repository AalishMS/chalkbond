import { expect, test, type Page } from '@playwright/test';
import { fragments, type AtomId, type Doc } from '../src/core/doc-model';
import {
  canvasPoint,
  heardEvents,
  insertName,
  listenEvents,
  openApp,
  readDocument,
} from './harness';

type Pt = { x: number; y: number };

const atomPoint = (doc: Doc, id: string): Pt => doc.atoms[id as AtomId] as Pt;

/** The middle of the bond with index `n` in id order, as a page point. */
async function bondMid(page: Page, doc: Doc, n: number): Promise<Pt> {
  const bond = Object.values(doc.bonds)[n];
  if (!bond) throw new Error('no bond');
  const a = atomPoint(doc, bond.a1);
  const b = atomPoint(doc, bond.a2);
  return canvasPoint(page, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
}

const ghosted = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('[data-layer="content"] > [data-key]')].filter(
        (g) => getComputedStyle(g).opacity === '0.3',
      ).length,
  );

test('Erase: a drag ghosts what it crosses at 0.3, one commit on release, orphans go (E1, E2)', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'hexane');
    await page.getByTestId('tool-erase').click();
    const before = await readDocument(page);
    expect(Object.keys(before.atoms)).toHaveLength(6);
    const first = await bondMid(page, before, 0);
    const second = await bondMid(page, before, 1);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    await page.mouse.move(second.x, second.y, { steps: 8 });
    // Two bonds are ghosted; the document has not changed yet.
    await expect.poll(() => ghosted(page)).toBe(2);
    expect(await readDocument(page)).toEqual(before);
    await page.mouse.up();
    await expect.poll(() => ghosted(page)).toBe(0);
    const after = await readDocument(page);
    // Two bonds and the two carbons they left bondless are gone.
    expect(Object.keys(after.bonds)).toHaveLength(3);
    expect(Object.keys(after.atoms)).toHaveLength(4);
    // One undo step.
    await page.keyboard.press('Control+z');
    expect(await readDocument(page)).toEqual(before);
  } finally {
    await app.close();
  }
});

test('Erase: a click erases the bond under the pointer', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'butane');
    await page.getByTestId('tool-erase').click();
    const before = await readDocument(page);
    const mid = await bondMid(page, before, 1);
    await page.mouse.click(mid.x, mid.y);
    const after = await readDocument(page);
    expect(Object.keys(after.bonds)).toHaveLength(2);
    expect(Object.keys(after.atoms)).toHaveLength(4);
  } finally {
    await app.close();
  }
});

test('Ctrl+C, move the pointer, Ctrl+V: a second ethanol at the pointer, selected', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanol');
    await page.getByTestId('canvas').focus();
    const before = await readDocument(page);
    await page.keyboard.press('Control+c');
    await page.mouse.move(900, 600);
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+v');
    const after = await readDocument(page);
    const fresh = Object.keys(after.atoms).filter((id) => !(id in before.atoms));
    expect(fresh).toHaveLength(3);
    // The new atoms are centred on the pointer.
    const pts = await Promise.all(fresh.map((id) => canvasPoint(page, atomPoint(after, id))));
    const cx = (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2;
    const cy = (Math.min(...pts.map((p) => p.y)) + Math.max(...pts.map((p) => p.y))) / 2;
    expect(Math.abs(cx - 900)).toBeLessThan(1.5);
    expect(Math.abs(cy - 600)).toBeLessThan(1.5);
    // The paste is what is selected: two bonds are banded.
    await expect(page.getByTestId('overlay-selection').locator('path')).toHaveCount(2);
    expect(fragments(after)).toHaveLength(2);
    // One undo step takes it away.
    await page.keyboard.press('Control+z');
    expect(await readDocument(page)).toEqual(before);
  } finally {
    await app.close();
  }
});

test('Ctrl+D duplicates 1 BLU right and down; Ctrl+X then Ctrl+V moves a molecule', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanol');
    await page.getByTestId('canvas').focus();
    const before = await readDocument(page);
    await page.keyboard.press('Control+d');
    const dup = await readDocument(page);
    const fresh = Object.keys(dup.atoms).filter((id) => !(id in before.atoms));
    expect(fresh).toHaveLength(3);
    const old = Object.keys(before.atoms).sort();
    const sortedNew = [...fresh].sort();
    old.forEach((id, i) => {
      const a = atomPoint(before, id);
      const b = atomPoint(dup, sortedNew[i] as string);
      expect(Math.abs(b.x - a.x - 1)).toBeLessThan(1e-9);
      expect(Math.abs(b.y - a.y - 1)).toBeLessThan(1e-9);
    });
    // The duplicate is selected: cut it, then paste it back.
    await page.keyboard.press('Control+x');
    expect(Object.keys((await readDocument(page)).atoms)).toHaveLength(3);
    await page.mouse.move(700, 500);
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+v');
    expect(Object.keys((await readDocument(page)).atoms)).toHaveLength(6);
  } finally {
    await app.close();
  }
});

test('right-click draws no menu and tells the host what is under the pointer (CM1)', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanol');
    await listenEvents(page);
    const doc = await readDocument(page);
    const oxygen = Object.values(doc.atoms).find((a) => a.element === 'O');
    if (!oxygen) throw new Error('no oxygen');
    const at = await canvasPoint(page, oxygen);
    const elements = await page.evaluate(() => document.querySelectorAll('*').length);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await page.mouse.click(40 + 65, 700, { button: 'right' });
    await page.waitForTimeout(100);
    const heard = (await heardEvents(page)).filter((e) => e.type === 'context-menu');
    expect(heard).toHaveLength(2);
    expect(heard[0]).toMatchObject({ target: { kind: 'atom', id: oxygen.id } });
    expect(heard[1]).toMatchObject({ target: null });
    // Nothing appeared: no new window, no menu element, the same number of elements.
    expect(app.windows()).toHaveLength(1);
    expect(await page.locator('[role="menu"]').count()).toBe(0);
    expect(await page.evaluate(() => document.querySelectorAll('*').length)).toBe(elements);
    // The selection (the inserted ethanol) is untouched.
    await expect(page.getByTestId('overlay-selection').locator('path')).toHaveCount(2);
  } finally {
    await app.close();
  }
});
