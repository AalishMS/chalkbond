import { test, type Page } from '@playwright/test';
import type { Doc } from '../../src/core/doc-model';
import { canvasPoint, insertName, openApp, readDocument, shot } from '../harness';

type Pt = { x: number; y: number };

async function insert(page: Page, name: string): Promise<Doc> {
  await insertName(page, name);
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Escape');
  return readDocument(page);
}

async function drag(page: Page, from: Pt, to: Pt, release = true): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  if (release) await page.mouse.up();
}

/** Both molecules inserted; returns the screen x of each atom, to find the gap and the far edge. */
async function twoMolecules(page: Page): Promise<{ doc: Doc; xs: number[]; ys: number[] }> {
  await insert(page, 'ethanol');
  const doc = await insert(page, 'acetic acid');
  const pts = await Promise.all(Object.values(doc.atoms).map((a) => canvasPoint(page, a)));
  return {
    doc,
    xs: pts.map((p) => p.x).sort((a, b) => a - b),
    ys: pts.map((p) => p.y).sort((a, b) => a - b),
  };
}

function widestGap(xs: number[]): number {
  let at = 0;
  let widest = 0;
  for (let i = 1; i < xs.length; i += 1) {
    const gap = (xs[i] ?? 0) - (xs[i - 1] ?? 0);
    if (gap > widest) {
      widest = gap;
      at = ((xs[i] ?? 0) + (xs[i - 1] ?? 0)) / 2;
    }
  }
  return at;
}

test('E25 the four arrow kinds, with the Arrow options bar', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-arrow').click();
    let y = 220;
    for (const option of ['forward', 'equilibrium', 'resonance', 'nogo']) {
      await page.getByTestId(`opt-${option}`).click();
      await drag(page, { x: 480, y }, { x: 720, y });
      y += 120;
    }
    await page.mouse.move(1000, 700);
    await page.waitForTimeout(200);
    await shot(page, 'E25', 'arrow-variants');
  } finally {
    await app.close();
  }
});

test('E25 options bars', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-arrow').click();
    await page.getByTestId('opt-equilibrium').click();
    await page.mouse.move(1000, 700);
    await page.waitForTimeout(150);
    await shot(page, 'E25', 'options-arrow');
    await page.getByTestId('tool-curved').click();
    await page.getByTestId('opt-fishhook').click();
    await page.mouse.move(1000, 700);
    await page.waitForTimeout(150);
    await shot(page, 'E25', 'options-curly');
  } finally {
    await app.close();
  }
});

test('E25 arrow drag between ethanol and acetic acid, mid-drag and plus signs', async () => {
  const { app, page } = await openApp();
  try {
    const { xs, ys } = await twoMolecules(page);
    const gap = widestGap(xs);
    const midY = ((ys[0] ?? 0) + (ys.at(-1) ?? 0)) / 2;
    await page.getByTestId('tool-plus').click();
    await page.mouse.move(gap, midY + 3);
    await page.mouse.down();
    await page.waitForTimeout(150);
    await shot(page, 'E25', 'plus-guide');
    await page.mouse.up();
    await page.getByTestId('tool-arrow').click();
    const from = { x: (xs.at(-1) ?? 0) + 50, y: midY };
    await drag(page, from, { x: from.x + 170, y: midY + 22 }, false);
    await page.waitForTimeout(150);
    await shot(page, 'E25', 'arrow-drag');
    await page.mouse.up();
    await page.mouse.move(1000, 720);
    await page.waitForTimeout(150);
    await shot(page, 'E25', 'plus-signs');
  } finally {
    await app.close();
  }
});

test('E25 curly arrows: bond to atom, hover anchors, fishhook', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await insert(page, 'acetic acid');
    const carbonyl = Object.values(doc.bonds).find(
      (b) =>
        b.order === 2 && (doc.atoms[b.a1]?.element === 'O' || doc.atoms[b.a2]?.element === 'O'),
    );
    if (!carbonyl) throw new Error('no C=O');
    const oId = doc.atoms[carbonyl.a1]?.element === 'O' ? carbonyl.a1 : carbonyl.a2;
    const p1 = doc.atoms[carbonyl.a1] as Pt;
    const p2 = doc.atoms[carbonyl.a2] as Pt;
    const mid = await canvasPoint(page, { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
    const o = await canvasPoint(page, doc.atoms[oId] as Pt);
    await page.getByTestId('tool-curved').click();
    await page.mouse.move(mid.x, mid.y);
    await page.waitForTimeout(150);
    await shot(page, 'E25', 'curly-hover');
    await page.mouse.down();
    await page.mouse.move((mid.x + o.x) / 2, (mid.y + o.y) / 2 - 15, { steps: 4 });
    await page.mouse.move(o.x, o.y, { steps: 4 });
    await page.waitForTimeout(150);
    await shot(page, 'E25', 'curly-drag');
    await page.mouse.up();
    await page.mouse.move(1000, 720);
    await page.waitForTimeout(150);
    await shot(page, 'E25', 'curly-electron-pair');
    // A fishhook from the hydroxyl O to the carbonyl carbon.
    const hydroxyl = Object.values(doc.atoms).find((a) => a.element === 'O' && a.id !== oId) as Pt;
    const carbon = doc.atoms[carbonyl.a1]?.element === 'O' ? p2 : p1;
    await page.getByTestId('opt-fishhook').click();
    await drag(page, await canvasPoint(page, hydroxyl), await canvasPoint(page, carbon));
    await page.mouse.move(1000, 720);
    await page.waitForTimeout(150);
    await shot(page, 'E25', 'curly-fishhook');
  } finally {
    await app.close();
  }
});

test('E25 curly arrow between water and chloromethane', async () => {
  const { app, page } = await openApp();
  try {
    await insert(page, 'water');
    const doc = await insert(page, 'chloromethane');
    const atoms = Object.values(doc.atoms);
    const oxygen = atoms.find((a) => a.element === 'O') as Pt;
    const carbon = atoms.find((a) => a.element === 'C') as Pt;
    await page.getByTestId('tool-curved').click();
    await drag(page, await canvasPoint(page, oxygen), await canvasPoint(page, carbon));
    await page.mouse.move(1000, 720);
    await page.waitForTimeout(150);
    await shot(page, 'E25', 'curly-water-chloromethane');
  } finally {
    await app.close();
  }
});
