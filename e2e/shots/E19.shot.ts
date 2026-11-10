import { test, type Page } from '@playwright/test';
import type { AtomId, Doc } from '../../src/core/doc-model';
import { canvasPoint, openApp, readDocument, shot } from '../harness';

type Pt = { x: number; y: number };
const START: Pt = { x: 420, y: 560 };
const atomIds = (d: Doc): AtomId[] => Object.keys(d.atoms) as AtomId[];
const px = (page: Page, d: Doc, id: AtomId): Promise<Pt> => canvasPoint(page, d.atoms[id] as Pt);

/** Clicks empty canvas, then the newest end atom `n` times: n + 1 bonds. */
async function chain(page: Page, n: number): Promise<Doc> {
  await page.mouse.click(START.x, START.y);
  let doc = await readDocument(page);
  for (let i = 0; i < n; i++) {
    const ids = atomIds(doc);
    const at = await px(page, doc, ids[ids.length - 1] as AtomId);
    await page.mouse.click(at.x, at.y);
    doc = await readDocument(page);
  }
  return doc;
}

test('E19 bond ghost: hover empty canvas with Bond', async () => {
  const { app, page } = await openApp();
  try {
    await page.mouse.move(START.x, START.y);
    await page.waitForTimeout(150);
    await shot(page, 'E19', 'bond-ghost');
  } finally {
    await app.close();
  }
});

test('E19 first bond, propane, butane zig-zag', async () => {
  const { app, page } = await openApp();
  try {
    await page.mouse.click(START.x, START.y);
    await page.mouse.move(30, 300);
    await shot(page, 'E19', 'first-bond');
    let doc = await readDocument(page);
    let at = await px(page, doc, atomIds(doc)[1] as AtomId);
    await page.mouse.click(at.x, at.y);
    await page.mouse.move(30, 300);
    await shot(page, 'E19', 'propane');
    doc = await readDocument(page);
    at = await px(page, doc, atomIds(doc)[2] as AtomId);
    await page.mouse.click(at.x, at.y);
    await page.mouse.move(30, 300);
    await shot(page, 'E19', 'zigzag');
    // The pointer on the end atom: hover circle and the ghost of the next bond (mock-up 02).
    doc = await readDocument(page);
    at = await px(page, doc, atomIds(doc)[3] as AtomId);
    await page.mouse.move(at.x, at.y);
    await page.waitForTimeout(150);
    await shot(page, 'E19', 'zigzag-hover');
  } finally {
    await app.close();
  }
});

test('E19 drag in progress with the ghost bond at a snapped angle, then cancelled', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await chain(page, 0);
    const end = await px(page, doc, atomIds(doc)[1] as AtomId);
    await page.mouse.move(end.x, end.y);
    await page.mouse.down();
    await page.mouse.move(end.x + 140, end.y + 160, { steps: 8 });
    await shot(page, 'E19', 'drag-ghost');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.mouse.move(30, 300);
    await shot(page, 'E19', 'drag-cancelled');
  } finally {
    await app.close();
  }
});

test('E19 ring closure by dragging onto the first atom', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await chain(page, 1);
    const [a, , c] = atomIds(doc) as [AtomId, AtomId, AtomId];
    const [pa, pc] = [await px(page, doc, a), await px(page, doc, c)];
    await page.mouse.move(pc.x, pc.y);
    await page.mouse.down();
    await page.mouse.move(pa.x + 4, pa.y + 3, { steps: 8 });
    await shot(page, 'E19', 'ring-closure-drag');
    await page.mouse.up();
    await page.mouse.move(30, 300);
    await shot(page, 'E19', 'ring-closure');
  } finally {
    await app.close();
  }
});

test('E19 double, triple, wedge and hash bonds', async () => {
  const { app, page } = await openApp();
  try {
    // Four separate bonds in a row, one per option.
    for (const [i, option] of ['double', 'triple', 'wedge', 'hash'].entries()) {
      await page.getByTestId(`opt-${option}`).click();
      await page.mouse.click(200 + i * 250, 420);
    }
    await page.mouse.move(30, 300);
    await shot(page, 'E19', 'bond-kinds');
    // The same on existing single bonds: click each bond with its option.
    await page.getByTestId('opt-single').click();
    await page.mouse.click(300, 650);
    const doc = await readDocument(page);
    const ids = atomIds(doc);
    const [a, b] = [
      await px(page, doc, ids[ids.length - 2] as AtomId),
      await px(page, doc, ids[ids.length - 1] as AtomId),
    ];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    await page.mouse.click(mid.x, mid.y);
    await page.mouse.click(mid.x, mid.y);
    await page.mouse.move(30, 300);
    await shot(page, 'E19', 'triple');
    await page.getByTestId('opt-wedge').click();
    await page.mouse.click(mid.x, mid.y);
    await page.mouse.move(30, 300);
    await shot(page, 'E19', 'wedge');
    await page.getByTestId('opt-hash').click();
    await page.mouse.click(mid.x, mid.y);
    await page.mouse.move(30, 300);
    await shot(page, 'E19', 'hash');
  } finally {
    await app.close();
  }
});
