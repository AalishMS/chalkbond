import { test, type Page } from '@playwright/test';
import type { AtomId, Doc } from '../../src/core/doc-model';
import { canvasPoint, insertName, loadDocument, openApp, readDocument, shot } from '../harness';

type Pt = { x: number; y: number };
const atomIds = (d: Doc): AtomId[] => Object.keys(d.atoms) as AtomId[];
const px = (page: Page, d: Doc, id: AtomId): Promise<Pt> => canvasPoint(page, d.atoms[id] as Pt);
const oxygen = (d: Doc): AtomId => atomIds(d).find((id) => d.atoms[id]?.element === 'O') as AtomId;

async function insert(page: Page, name: string): Promise<Doc> {
  await insertName(page, name);
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Escape');
  return readDocument(page);
}

async function relabel(page: Page, doc: Doc, text: string): Promise<Pt> {
  const o = await px(page, doc, oxygen(doc));
  await page.mouse.move(o.x, o.y);
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  return o;
}

test('E24 warning H20 on water, then its tooltip', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await insert(page, 'water');
    const o = await relabel(page, doc, 'H20');
    await page.mouse.move(900, 200);
    await page.waitForTimeout(200);
    await shot(page, 'E24', 'warning-h20');
    await page.mouse.move(o.x, o.y);
    await page.waitForTimeout(800);
    await shot(page, 'E24', 'warning-tooltip');
  } finally {
    await app.close();
  }
});

test('E24 a carbon with five bonds', async () => {
  const { app, page } = await openApp();
  try {
    await page.mouse.click(520, 480);
    const doc = await readDocument(page);
    const first = await px(page, doc, atomIds(doc)[0] as AtomId);
    await page.mouse.move(first.x, first.y);
    await page.waitForTimeout(150);
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('1');
    await page.waitForTimeout(900);
    await shot(page, 'E24', 'five-bonds');
  } finally {
    await app.close();
  }
});

test('E24 benzene before and after Show Kekule', async () => {
  const { app, page } = await openApp();
  try {
    await insert(page, 'benzene');
    await page.getByTestId('tool-select').click();
    await page.mouse.move(900, 200);
    await page.waitForTimeout(150);
    await shot(page, 'E24', 'kekule-before');
    await page.getByTestId('act-kekule').click();
    await page.mouse.move(900, 200);
    await page.waitForTimeout(200);
    await shot(page, 'E24', 'kekule');
  } finally {
    await app.close();
  }
});

test('E24 distorted pentane before and after Clean up', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await insert(page, 'pentane');
    const warped: Doc = {
      ...doc,
      atoms: Object.fromEntries(
        atomIds(doc).map((id, i) => {
          const a = doc.atoms[id] as Doc['atoms'][AtomId];
          return [id, { ...a, x: a.x + 0.35 * Math.sin(i * 7), y: a.y + 0.3 * i }];
        }),
      ) as Doc['atoms'],
    };
    await loadDocument(page, warped);
    await page.getByTestId('tool-select').click();
    await page.mouse.move(900, 200);
    await page.waitForTimeout(150);
    await shot(page, 'E24', 'clean-before');
    await page.getByTestId('act-clean').click();
    await page.mouse.move(900, 200);
    await page.waitForTimeout(200);
    await shot(page, 'E24', 'clean-after');
  } finally {
    await app.close();
  }
});

test('E24 Ph before and after Expand', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await insert(page, 'ethanol');
    await relabel(page, doc, 'Ph');
    await page.getByTestId('tool-select').click();
    await page.mouse.click(1000, 150);
    const now = await readDocument(page);
    const ph = atomIds(now).find((id) => now.atoms[id]?.label === 'Ph') as AtomId;
    const at = await px(page, now, ph);
    await page.mouse.click(at.x, at.y);
    await page.mouse.move(900, 200);
    await page.waitForTimeout(200);
    await shot(page, 'E24', 'expand-before');
    await page.getByTestId('act-expand').click();
    await page.mouse.move(900, 200);
    await page.waitForTimeout(200);
    await shot(page, 'E24', 'expand-after');
  } finally {
    await app.close();
  }
});
