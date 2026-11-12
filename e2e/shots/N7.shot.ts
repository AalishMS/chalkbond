// N7 shots (tasks/todo-features-2026-11.md; mock-ups 03, 03b, 10 and shell A15c): the formula
// switch in the Select options bar, its tooltip, the icon-only form at the minimum window and a
// structural drawing on the canvas (compare with the structural goldens on the golden sheet).
import { test, type Page } from '@playwright/test';
import type { AtomId, Doc } from '../../src/core/doc-model';
import { canvasPoint, insertName, openApp, readDocument, shot } from '../harness';

type Pt = { x: number; y: number };

const atomPoint = async (page: Page, doc: Doc, id: AtomId, ptPerBlu = 40): Promise<Pt> =>
  canvasPoint(page, doc.atoms[id] as Pt, ptPerBlu);

test('N7 select bar with a ring selected (mock-up 03), Show structural and Show skeletal', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'benzene');
    await insertName(page, 'ethanol');
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Escape');
    const doc = await readDocument(page);
    const ring = Object.values(doc.atoms).find((a) => a.element === 'C') as Doc['atoms'][AtomId];
    const at = await atomPoint(page, doc, ring.id);
    await page.mouse.click(at.x, at.y);
    await page.mouse.move(900, 650);
    await page.waitForTimeout(200);
    await shot(page, 'N7', 'select-bar');

    await page.getByTestId('act-formula').hover();
    await page.getByRole('tooltip').waitFor();
    await page.waitForTimeout(250);
    await shot(page, 'N7', 'formula-tooltip');

    await page.getByTestId('act-formula').click();
    await page.mouse.move(900, 650);
    await page.waitForTimeout(250);
    await shot(page, 'N7', 'select-bar-structural');
  } finally {
    await app.close();
  }
});

test('N7 the disabled switch on an empty drawing', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-select').click();
    await page.getByTestId('act-formula').hover();
    await page.getByRole('tooltip').waitFor();
    await page.waitForTimeout(250);
    await shot(page, 'N7', 'select-bar-disabled');
  } finally {
    await app.close();
  }
});

test('N7 select bar with Expand shown (mock-up 03b)', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanol');
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Escape');
    const doc = await readDocument(page);
    const o = Object.values(doc.atoms).find((a) => a.element === 'O') as Doc['atoms'][AtomId];
    const at = await atomPoint(page, doc, o.id);
    await page.mouse.move(at.x, at.y);
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
    await page.keyboard.type('Ph');
    await page.keyboard.press('Enter');
    await page.getByTestId('tool-select').click();
    await page.mouse.click(1000, 150);
    const now = await readDocument(page);
    const ph = Object.values(now.atoms).find((a) => a.label === 'Ph') as Doc['atoms'][AtomId];
    const p = await atomPoint(page, now, ph.id);
    await page.mouse.click(p.x, p.y);
    await page.mouse.move(900, 650);
    await page.waitForTimeout(200);
    await shot(page, 'N7', 'select-bar-abbrev');
  } finally {
    await app.close();
  }
});

test('N7 the scheme at the 960x640 minimum: icon-only switch (shell A15c)', async () => {
  const { app, page } = await openApp({ size: [960, 640] });
  try {
    await insertName(page, 'ethanol + acetic acid -> ethyl acetate + water');
    await page.getByTestId('tool-select').click();
    await page.mouse.click(900, 600);
    await page.mouse.move(900, 600);
    await page.waitForTimeout(250);
    await shot(page, 'N7', 'select-bar-960');
    await page.getByTestId('act-formula').click();
    await page.mouse.move(900, 600);
    await page.waitForTimeout(250);
    await shot(page, 'N7', 'select-bar-960-structural');
  } finally {
    await app.close();
  }
});

test('N7 ethanol, toluene and acetic acid after Show structural', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanol');
    await insertName(page, 'toluene');
    await insertName(page, 'acetic acid');
    await page.getByTestId('act-formula').click();
    await page.mouse.move(900, 700);
    await page.waitForTimeout(300);
    await shot(page, 'N7', 'structural-canvas');
  } finally {
    await app.close();
  }
});
