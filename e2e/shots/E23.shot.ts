import { test, type Page } from '@playwright/test';
import type { AtomId, Doc } from '../../src/core/doc-model';
import { canvasPoint, insertName, openApp, readDocument, shot } from '../harness';

type Pt = { x: number; y: number };
const atomIds = (d: Doc): AtomId[] => Object.keys(d.atoms) as AtomId[];
const px = (page: Page, d: Doc, id: AtomId): Promise<Pt> => canvasPoint(page, d.atoms[id] as Pt);
const oxygen = (d: Doc): AtomId => atomIds(d).find((id) => d.atoms[id]?.element === 'O') as AtomId;

/** Ethanol, the pointer resting on the oxygen with the hover keys live. */
async function ethanolAtOxygen(page: Page): Promise<Pt> {
  await insertName(page, 'ethanol');
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Escape');
  const doc = await readDocument(page);
  const o = await px(page, doc, oxygen(doc));
  await page.mouse.move(o.x, o.y);
  await page.waitForTimeout(150);
  return o;
}

test('E23 label editor: OH selected, then CO2H typed', async () => {
  const { app, page } = await openApp();
  try {
    await ethanolAtOxygen(page);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    await shot(page, 'E23', 'label-oh-selected');
    await page.keyboard.type('CO2H');
    await page.waitForTimeout(150);
    await shot(page, 'E23', 'label-editor');
  } finally {
    await app.close();
  }
});

test('E23 label editor on a bare carbon', async () => {
  const { app, page } = await openApp();
  try {
    await page.mouse.click(420, 560);
    const doc = await readDocument(page);
    const end = await px(page, doc, atomIds(doc)[1] as AtomId);
    await page.mouse.move(end.x, end.y);
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    await shot(page, 'E23', 'label-bare-carbon');
  } finally {
    await app.close();
  }
});

for (const [name, text] of [
  ['nh2', 'NH2'],
  ['cooh', 'COOH'],
  ['ph', 'Ph'],
] as const) {
  test(`E23 committed ${text}`, async () => {
    const { app, page } = await openApp();
    try {
      await ethanolAtOxygen(page);
      await page.keyboard.press('Enter');
      await page.keyboard.type(text);
      await page.keyboard.press('Enter');
      await page.mouse.move(900, 200);
      await page.waitForTimeout(150);
      await shot(page, 'E23', `committed-${name}`);
    } finally {
      await app.close();
    }
  });
}

test('E23 unknown label: H20 with the warning caption', async () => {
  const { app, page } = await openApp();
  try {
    await ethanolAtOxygen(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('H20');
    await page.waitForTimeout(150);
    await shot(page, 'E23', 'label-unknown');
  } finally {
    await app.close();
  }
});
