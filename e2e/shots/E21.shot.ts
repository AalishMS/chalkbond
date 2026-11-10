import { test, type Page } from '@playwright/test';
import type { AtomId, BondId, Doc } from '../../src/core/doc-model';
import { canvasPoint, openApp, readDocument, shot } from '../harness';

type Pt = { x: number; y: number };
const START: Pt = { x: 420, y: 560 };
const CENTRE: Pt = { x: 640, y: 400 };
const atomIds = (d: Doc): AtomId[] => Object.keys(d.atoms) as AtomId[];
const px = (page: Page, d: Doc, id: AtomId): Promise<Pt> => canvasPoint(page, d.atoms[id] as Pt);

test('E21 chain: mid-drag with the count label, then committed', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-chain').click();
    await page.mouse.move(START.x, START.y);
    await page.mouse.down();
    await page.mouse.move(START.x + 140, START.y - 30, { steps: 4 });
    await page.mouse.move(START.x + 280, START.y, { steps: 4 });
    await page.waitForTimeout(150);
    await shot(page, 'E21', 'chain-count');
    await page.mouse.up();
    await page.mouse.move(30, 300);
    await page.waitForTimeout(150);
    await shot(page, 'E21', 'chain-committed');
  } finally {
    await app.close();
  }
});

test('E21 the five ring templates, each on empty canvas', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-ring').click();
    for (const name of ['benzene', 'cyclohexane', 'cyclopentane', 'cyclobutane', 'cyclopropane']) {
      await page.getByTestId(`opt-${name}`).click();
      await page.mouse.click(CENTRE.x, CENTRE.y);
      await page.mouse.move(30, 300);
      await page.waitForTimeout(150);
      await shot(page, 'E21', `ring-${name}`);
      await page.keyboard.press('Control+z');
    }
  } finally {
    await app.close();
  }
});

test('E21 ring ghost over empty canvas, over a bond, naphthalene', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-ring').click();
    await page.getByTestId('opt-cyclohexane').click();
    await page.mouse.move(CENTRE.x, CENTRE.y);
    await page.waitForTimeout(150);
    await shot(page, 'E21', 'ring-ghost');
    await page.getByTestId('opt-benzene').click();
    await page.mouse.click(CENTRE.x - 100, CENTRE.y);
    const doc = await readDocument(page);
    const bond = Object.values(doc.bonds)[0] as Doc['bonds'][BondId];
    const pa = await px(page, doc, bond.a1);
    const pb = await px(page, doc, bond.a2);
    const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    await page.mouse.move(mid.x, mid.y);
    await page.waitForTimeout(150);
    await shot(page, 'E21', 'ring-ghost-bond');
    await page.mouse.click(mid.x, mid.y);
    await page.mouse.move(30, 300);
    await page.waitForTimeout(150);
    await shot(page, 'E21', 'naphthalene');
  } finally {
    await app.close();
  }
});

test('E21 cyclohexane attached to an atom of a chain; the options bar with Cyclopentane chosen', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-chain').click();
    await page.mouse.move(START.x, START.y);
    await page.mouse.down();
    await page.mouse.move(START.x + 140, START.y, { steps: 4 });
    await page.mouse.move(START.x + 210, START.y, { steps: 4 });
    await page.mouse.up();
    const doc = await readDocument(page);
    const ids = atomIds(doc);
    const end = await px(page, doc, ids[ids.length - 1] as AtomId);
    await page.getByTestId('tool-ring').click();
    await page.getByTestId('opt-cyclohexane').click();
    await page.mouse.move(end.x, end.y);
    await page.waitForTimeout(150);
    await shot(page, 'E21', 'ring-on-atom-ghost');
    await page.mouse.click(end.x, end.y);
    await page.mouse.move(30, 300);
    await page.waitForTimeout(150);
    await shot(page, 'E21', 'ring-on-atom');
    await page.getByTestId('opt-cyclopentane').hover();
    await page.waitForTimeout(700);
    await page.getByTestId('opt-cyclopentane').click();
    await shot(page, 'E21', 'ring-options-bar');
  } finally {
    await app.close();
  }
});

test('E21 toluene: Ring click, hover a ring atom, 1', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('r');
    await page.mouse.click(CENTRE.x, CENTRE.y);
    const doc = await readDocument(page);
    const at = await px(page, doc, atomIds(doc)[0] as AtomId);
    await page.mouse.move(at.x, at.y);
    await page.waitForTimeout(150);
    await page.keyboard.press('1');
    await page.mouse.move(30, 300);
    await page.waitForTimeout(150);
    await shot(page, 'E21', 'toluene');
  } finally {
    await app.close();
  }
});
