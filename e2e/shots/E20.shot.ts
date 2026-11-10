import { test, type Page } from '@playwright/test';
import type { AtomId, Doc } from '../../src/core/doc-model';
import { canvasPoint, insertName, openApp, readDocument, shot } from '../harness';

type Pt = { x: number; y: number };
const START: Pt = { x: 420, y: 560 };
const atomIds = (d: Doc): AtomId[] => Object.keys(d.atoms) as AtomId[];
const px = (page: Page, d: Doc, id: AtomId): Promise<Pt> => canvasPoint(page, d.atoms[id] as Pt);

/** Click empty canvas, click the new end atom: three carbons. */
async function propane(page: Page): Promise<Doc> {
  await page.mouse.click(START.x, START.y);
  let doc = await readDocument(page);
  const at = await px(page, doc, atomIds(doc)[1] as AtomId);
  await page.mouse.click(at.x, at.y);
  doc = await readDocument(page);
  return doc;
}

test('E20 ethanol by hover key O, then Cl and a charge on the other end', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await propane(page);
    const end = await px(page, doc, atomIds(doc)[2] as AtomId);
    await page.mouse.move(end.x, end.y);
    await page.waitForTimeout(150);
    await shot(page, 'E20', 'hover-before-O');
    await page.keyboard.press('o');
    await page.waitForTimeout(150);
    await shot(page, 'E20', 'hover-key-O');
    const other = await px(page, doc, atomIds(doc)[0] as AtomId);
    await page.mouse.move(other.x, other.y);
    await page.keyboard.press('l');
    await page.waitForTimeout(150);
    await shot(page, 'E20', 'hover-key-L');
    await page.keyboard.press('Shift+Equal');
    await page.waitForTimeout(150);
    await shot(page, 'E20', 'hover-key-L-plus');
  } finally {
    await app.close();
  }
});

test('E20 toluene: benzene by name, hover a ring atom, 1', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'benzene');
    const doc = await readDocument(page);
    await page.getByTestId('tool-bond').click();
    const at = await px(page, doc, atomIds(doc)[0] as AtomId);
    await page.mouse.move(at.x, at.y);
    await page.waitForTimeout(150);
    await shot(page, 'E20', 'toluene-hover');
    await page.keyboard.press('1');
    await page.waitForTimeout(150);
    await shot(page, 'E20', 'toluene');
  } finally {
    await app.close();
  }
});

test('E20 hover keys on a bond: the hint, then 2', async () => {
  const { app, page } = await openApp();
  try {
    await page.mouse.click(START.x, START.y);
    const doc = await readDocument(page);
    const [a, b] = atomIds(doc) as [AtomId, AtomId];
    const [pa, pb] = [await px(page, doc, a), await px(page, doc, b)];
    await page.mouse.move((pa.x + pb.x) / 2, (pa.y + pb.y) / 2);
    await page.waitForTimeout(150);
    await shot(page, 'E20', 'bond-hover');
    await page.keyboard.press('2');
    await page.waitForTimeout(150);
    await shot(page, 'E20', 'bond-double');
  } finally {
    await app.close();
  }
});
