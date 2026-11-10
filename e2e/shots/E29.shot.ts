import { test, type Page } from '@playwright/test';
import type { ArrowObject, Doc } from '../../src/core/doc-model';
import { canvasPoint, openApp, readDocument, shot } from '../harness';

const arrowOfDoc = (d: Doc): ArrowObject => {
  const a = Object.values(d.objects).find((o): o is ArrowObject => o.type === 'arrow');
  if (!a) throw new Error('no arrow');
  return a;
};

const ESTER = 'ethanol + acetic acid -> ethyl acetate + water';

async function chip(page: Page, text: string): Promise<void> {
  await page.getByTestId('empty-state').getByRole('button', { name: text, exact: true }).click();
}

async function typeInto(page: Page, text: string): Promise<void> {
  const input = page.getByTestId('namefield-input');
  await input.click();
  await input.fill(text);
  await page.keyboard.press('Enter');
}

/** Moves the pointer off the drawing so no hover highlight is in the picture. */
async function parkPointer(page: Page): Promise<void> {
  await page.mouse.move(40, 760);
  await page.waitForTimeout(250);
}

test('E29 the reaction chip on an empty document', async () => {
  const { app, page } = await openApp();
  try {
    await chip(page, ESTER);
    await parkPointer(page);
    await shot(page, 'E29', 'reaction-chip');
  } finally {
    await app.close();
  }
});

test('E29 conditions added above and below the arrow', async () => {
  const { app, page } = await openApp();
  try {
    await chip(page, ESTER);
    await page.getByTestId('tool-text').click();
    const a = arrowOfDoc(await readDocument(page));
    const mid = await canvasPoint(page, { x: (a.from.x + a.to.x) / 2, y: a.from.y });
    const px =
      (await canvasPoint(page, { x: 1, y: 0 })).x - (await canvasPoint(page, { x: 0, y: 0 })).x;
    await page.mouse.click(mid.x, mid.y - 0.6 * px);
    await page.keyboard.type('H2SO4');
    await page.keyboard.press('Enter');
    await page.mouse.click(mid.x, mid.y + 0.6 * px);
    await page.keyboard.press('Control+Shift+D');
    await page.keyboard.press('Enter');
    await page.getByTestId('tool-select').click();
    await parkPointer(page);
    await shot(page, 'E29', 'reaction-conditions');
  } finally {
    await app.close();
  }
});

test('E29 not-found names the failing part', async () => {
  const { app, page } = await openApp();
  try {
    await typeInto(page, 'ethanol + acetic acd -> ethyl acetate + water');
    await page.waitForTimeout(250);
    await shot(page, 'E29', 'reaction-notfound');
  } finally {
    await app.close();
  }
});

test('E29 equilibrium, coefficients, below a drawing, small window', async () => {
  const { app, page } = await openApp();
  try {
    await typeInto(page, 'acetic acid + ethanol <=> ethyl acetate + water');
    await parkPointer(page);
    await shot(page, 'E29', 'reaction-equilibrium');
    await page.getByTestId('undo').click();
    await typeInto(page, '2 H2 + O2 -> 2 H2O');
    await parkPointer(page);
    await shot(page, 'E29', 'reaction-coefficients');
    await page.getByTestId('undo').click();
    await typeInto(page, 'benzene');
    await typeInto(page, 'ethanol + acetic acid -> ethyl acetate + water');
    await parkPointer(page);
    await shot(page, 'E29', 'reaction-below-drawing');
  } finally {
    await app.close();
  }
});

test('E29 the chip at 960 x 640', async () => {
  const { app, page } = await openApp({ size: [960, 640] });
  try {
    await chip(page, ESTER);
    await page.mouse.move(40, 600);
    await page.waitForTimeout(250);
    await shot(page, 'E29', 'reaction-chip-960x640');
  } finally {
    await app.close();
  }
});
