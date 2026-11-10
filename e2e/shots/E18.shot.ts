import { test, type Page } from '@playwright/test';
import type { AtomId, Doc } from '../../src/core/doc-model';
import { canvasPoint, insertName, openApp, readDocument, shot } from '../harness';

type Pt = { x: number; y: number };

/** The middle of the bond with index `n` in id order, as a page point. */
async function bondMid(page: Page, doc: Doc, n: number): Promise<Pt> {
  const bond = Object.values(doc.bonds)[n];
  if (!bond) throw new Error('no bond');
  const a = doc.atoms[bond.a1 as AtomId] as Pt;
  const b = doc.atoms[bond.a2 as AtomId] as Pt;
  return canvasPoint(page, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
}

test('E18 erase: mid-drag with ghosted parts, after release', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'hexane');
    await page.getByTestId('tool-erase').click();
    const doc = await readDocument(page);
    const first = await bondMid(page, doc, 1);
    const second = await bondMid(page, doc, 2);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    await page.mouse.move(second.x, second.y, { steps: 8 });
    await shot(page, 'E18', 'erase-drag');
    await page.mouse.up();
    await page.mouse.move(640, 700);
    await shot(page, 'E18', 'erased');
  } finally {
    await app.close();
  }
});

test('E18 clipboard: copy and paste at the pointer, duplicate', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanol');
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+c');
    await page.mouse.move(820, 520);
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+v');
    await page.keyboard.press('Control+v');
    await page.mouse.move(820, 700);
    await shot(page, 'E18', 'pasted');
    await page.keyboard.press('Control+d');
    await shot(page, 'E18', 'duplicated');
  } finally {
    await app.close();
  }
});
