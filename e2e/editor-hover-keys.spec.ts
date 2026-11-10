import { expect, test, type Page } from '@playwright/test';
import type { AtomId, BondId, Doc } from '../src/core/doc-model';
import { canvasPoint, insertName, openApp, readDocument } from './harness';

type Pt = { x: number; y: number };

const BOND_PX = 80;
const START: Pt = { x: 300, y: 560 };

const atomIds = (d: Doc): AtomId[] => Object.keys(d.atoms) as AtomId[];
const px = (page: Page, d: Doc, id: AtomId): Promise<Pt> => canvasPoint(page, d.atoms[id] as Pt);
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
const hint = (page: Page) => page.getByTestId('statusbar').getByRole('status');
const formulaText = (page: Page) => page.getByTestId('formula');
const activeTool = (page: Page): Promise<string> =>
  page.evaluate(
    () =>
      document
        .querySelector('[data-testid^="tool-"][aria-pressed="true"]')
        ?.getAttribute('data-testid') ?? '',
  );

/** Clicks empty canvas at START: two carbons. */
async function firstBond(page: Page): Promise<Doc> {
  await page.mouse.click(START.x, START.y);
  return readDocument(page);
}

/** Two clicks (empty canvas, then the new end atom): three carbons, propane. */
async function threeCarbons(page: Page): Promise<Doc> {
  const doc = await firstBond(page);
  const second = await px(page, doc, atomIds(doc)[1] as AtomId);
  await page.mouse.click(second.x, second.y);
  return readDocument(page);
}

const elementOf = async (page: Page, id: AtomId): Promise<string> =>
  (await readDocument(page)).atoms[id]?.element ?? '';

test('Hover keys: ethanol by gestures (click empty, click the end atom, hover it, O)', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await threeCarbons(page);
    const end = await px(page, doc, atomIds(doc)[2] as AtomId);
    await page.mouse.move(end.x, end.y);
    await expect(page.getByTestId('overlay-hover').locator('circle')).toHaveCount(1);
    await expect(hint(page)).toHaveText('Type O, N, Cl… to change this atom. Enter for any label.');
    await page.keyboard.press('o');
    const after = await readDocument(page);
    expect(
      Object.values(after.atoms)
        .map((a) => a.element)
        .sort(),
    ).toEqual(['C', 'C', 'O']);
    await expect(formulaText(page)).toHaveText('C2H6O · 46.07 g/mol');
    // One undo step.
    await page.keyboard.press('Control+z');
    expect(await readDocument(page)).toEqual(doc);
    await expect(formulaText(page)).toHaveText('C3H8 · 44.10 g/mol');
  } finally {
    await app.close();
  }
});

test('Hover keys on an atom: element letters, L is Cl, B is Br, + and - change the charge', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await firstBond(page);
    const end = atomIds(doc)[1] as AtomId;
    const at = await px(page, doc, end);
    await page.mouse.move(at.x, at.y);
    const charge = async (): Promise<number> =>
      (await readDocument(page)).atoms[end]?.charge ?? Number.NaN;
    const keys: [string, string][] = [
      ['o', 'O'],
      ['n', 'N'],
      ['s', 'S'],
      ['p', 'P'],
      ['f', 'F'],
      ['h', 'H'],
      ['i', 'I'],
      ['l', 'Cl'],
      ['b', 'Br'],
      ['C', 'C'],
    ];
    for (const [k, element] of keys) {
      await page.keyboard.press(k);
      expect(await elementOf(page, end), k).toBe(element);
    }
    // Shift+= types '+'; '=' alone also adds; '-' removes.
    await page.keyboard.press('Shift+Equal');
    expect(await charge()).toBe(1);
    await page.keyboard.press('=');
    expect(await charge()).toBe(2);
    for (let i = 0; i < 3; i++) await page.keyboard.press('-');
    expect(await charge()).toBe(-1);
    // The atom is still hovered after every change.
    await expect(page.locator('[data-testid^="overlay-hover"]')).toHaveCount(1);
  } finally {
    await app.close();
  }
});

test('Hover keys on an atom: 1, 2, 3 sprout a single, double and triple bond, 80 px long', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await firstBond(page);
    const at = await px(page, doc, atomIds(doc)[1] as AtomId);
    await page.mouse.move(at.x, at.y);
    for (const [k, order] of [
      ['1', 1],
      ['2', 2],
      ['3', 3],
    ] as const) {
      const before = await readDocument(page);
      await page.keyboard.press(k);
      const after = await readDocument(page);
      expect(atomIds(after)).toHaveLength(atomIds(before).length + 1);
      const added = Object.values(after.bonds).find((b) => !(b.id in before.bonds));
      expect(added?.order).toBe(order);
      const [p, q] = await Promise.all([
        px(page, after, added?.a1 as AtomId),
        px(page, after, added?.a2 as AtomId),
      ]);
      expect(Math.abs(dist(p, q) - BOND_PX)).toBeLessThan(0.01);
    }
  } finally {
    await app.close();
  }
});

test('Hover keys: 1 over a ring atom of benzene (inserted by name) gives toluene', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'benzene');
    const doc = await readDocument(page);
    await page.getByTestId('tool-bond').click();
    const at = await px(page, doc, atomIds(doc)[0] as AtomId);
    await page.mouse.move(at.x, at.y);
    await page.keyboard.press('1');
    expect(atomIds(await readDocument(page))).toHaveLength(7);
    await expect(formulaText(page)).toHaveText('C7H8 · 92.14 g/mol');
  } finally {
    await app.close();
  }
});

test('Hover keys on a bond: 1 2 3 set the order, W and H wedge and hash, B is the Bond tool', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await firstBond(page);
    const [a, b] = atomIds(doc) as [AtomId, AtomId];
    const [pa, pb] = [await px(page, doc, a), await px(page, doc, b)];
    const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    await page.mouse.move(mid.x, mid.y);
    await expect(hint(page)).toHaveText('Press 1, 2 or 3 for single, double, triple.');
    const bond = async () => Object.values((await readDocument(page)).bonds)[0];
    await page.keyboard.press('2');
    expect((await bond())?.order).toBe(2);
    await page.keyboard.press('3');
    expect((await bond())?.order).toBe(3);
    await page.keyboard.press('1');
    expect((await bond())?.order).toBe(1);
    await page.keyboard.press('w');
    expect(await bond()).toMatchObject({ stereo: 'wedge', a1: a, a2: b });
    await page.keyboard.press('w');
    expect(await bond()).toMatchObject({ stereo: 'wedge', a1: b, a2: a });
    // Reversing gave the bond a new id: hover it again.
    await page.mouse.move(mid.x + 1, mid.y);
    await page.keyboard.press('h');
    expect(await bond()).toMatchObject({ stereo: 'hash' });
    await page.keyboard.press('1');
    expect(await bond()).toMatchObject({ stereo: 'none', order: 1 });
    // O over a bond does nothing; B over a bond is the Bond tool, not bromine.
    await page.keyboard.press('o');
    await page.keyboard.press('v');
    expect(await activeTool(page)).toBe('tool-select');
    await page.keyboard.press('b');
    expect(await activeTool(page)).toBe('tool-bond');
    expect(Object.values((await readDocument(page)).atoms).map((x) => x.element)).toEqual([
      'C',
      'C',
    ]);
  } finally {
    await app.close();
  }
});

test('Tool keys: with nothing hovered they select tools; L over an atom is chlorine, L over empty canvas the Atom tool', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await firstBond(page);
    const end = atomIds(doc)[1] as AtomId;
    const at = await px(page, doc, end);
    await page.mouse.move(700, 300);
    const tools: [string, string][] = [
      ['v', 'tool-select'],
      ['e', 'tool-erase'],
      ['b', 'tool-bond'],
      ['z', 'tool-chain'],
      ['r', 'tool-ring'],
      ['l', 'tool-atom'],
      ['a', 'tool-arrow'],
      ['+', 'tool-plus'],
      ['m', 'tool-curved'],
      ['t', 'tool-text'],
    ];
    for (const [k, id] of tools) {
      await page.keyboard.press(k);
      expect(await activeTool(page), k).toBe(id);
    }
    await page.keyboard.press('b');
    await page.mouse.move(at.x, at.y);
    await page.keyboard.press('l');
    expect(await activeTool(page)).toBe('tool-bond');
    expect(await elementOf(page, end)).toBe('Cl');
    // V over an atom is not swallowed (R3): it selects Select; hover keys work there too.
    await page.keyboard.press('v');
    expect(await activeTool(page)).toBe('tool-select');
    await page.keyboard.press('o');
    expect(await elementOf(page, end)).toBe('O');
    // With Erase active the element keys are off, the tool keys are not.
    await page.getByTestId('tool-erase').click();
    await page.getByTestId('canvas').focus();
    await page.mouse.move(at.x + 1, at.y);
    await page.keyboard.press('n');
    expect(await elementOf(page, end)).toBe('O');
    await page.keyboard.press('b');
    expect(await activeTool(page)).toBe('tool-bond');
  } finally {
    await app.close();
  }
});

test('Hover and tool keys never fire from the name field or with Ctrl; Ctrl+= zooms, never charges', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await firstBond(page);
    const at = await px(page, doc, atomIds(doc)[1] as AtomId);
    await page.mouse.move(at.x, at.y);
    const input = page.getByTestId('namefield-input');
    await input.click();
    await input.pressSequentially('obe');
    expect(await input.inputValue()).toBe('obe');
    expect(await activeTool(page)).toBe('tool-bond');
    expect(await readDocument(page)).toEqual(doc);
    await input.fill('');
    await page.getByTestId('canvas').focus();
    await page.mouse.move(at.x, at.y);
    await page.keyboard.press('Control+o');
    await page.keyboard.press('Control+=');
    expect(await readDocument(page)).toEqual(doc);
    await expect(page.getByTestId('statusbar')).toContainText('200%');
  } finally {
    await app.close();
  }
});

test('A bond id never leaks: hover keys on a bond that was just reversed need a new hover', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await firstBond(page);
    const [a, b] = atomIds(doc) as [AtomId, AtomId];
    const [pa, pb] = [await px(page, doc, a), await px(page, doc, b)];
    await page.mouse.move((pa.x + pb.x) / 2, (pa.y + pb.y) / 2);
    await page.keyboard.press('w');
    await page.keyboard.press('w');
    const bonds = Object.keys((await readDocument(page)).bonds) as BondId[];
    expect(bonds).toHaveLength(1);
    // Undo restores the original bond with its original id.
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    expect(await readDocument(page)).toEqual(doc);
  } finally {
    await app.close();
  }
});
