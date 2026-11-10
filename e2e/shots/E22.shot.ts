import { test, type Page } from '@playwright/test';
import type { AtomId, BondId, Doc } from '../../src/core/doc-model';
import { canvasPoint, insertName, openApp, readDocument, shot } from '../harness';

type Pt = { x: number; y: number };
const START: Pt = { x: 420, y: 560 };
const atomIds = (d: Doc): AtomId[] => Object.keys(d.atoms) as AtomId[];
const px = (page: Page, d: Doc, id: AtomId): Promise<Pt> => canvasPoint(page, d.atoms[id] as Pt);
const away = (page: Page): Promise<void> => page.mouse.move(900, 200);

/** Chooses an Atom option and clicks the atom at `at` `n` times. */
async function mark(page: Page, option: string, at: Pt, n = 1): Promise<void> {
  await page.getByTestId(`opt-${option}`).click();
  for (let i = 0; i < n; i++) await page.mouse.click(at.x, at.y);
}

test('E22 acetic acid built from a chain with the Atom tool', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-chain').click();
    await page.mouse.click(START.x, START.y);
    const doc = await readDocument(page);
    const carbonyl = await px(page, doc, atomIds(doc)[1] as AtomId);
    await page.getByTestId('tool-atom').click();
    await page.getByTestId('opt-O').click();
    await page.mouse.move(carbonyl.x, carbonyl.y);
    await page.mouse.down();
    await page.mouse.move(carbonyl.x, carbonyl.y - 60, { steps: 4 });
    await page.mouse.up();
    await page.mouse.move(carbonyl.x, carbonyl.y);
    await page.mouse.down();
    await page.mouse.move(carbonyl.x + 60, carbonyl.y + 35, { steps: 4 });
    await page.mouse.up();
    await page.getByTestId('tool-bond').click();
    await page.getByTestId('opt-double').click();
    const after = await readDocument(page);
    const keep = atomIds(after)[1] as AtomId;
    const bond = Object.values(after.bonds).find(
      (b) =>
        b.a1 === keep &&
        after.atoms[b.a2]?.y !== undefined &&
        (after.atoms[b.a2]?.y ?? 0) < (after.atoms[keep]?.y ?? 0) - 0.5,
    ) as Doc['bonds'][BondId];
    const a = after.atoms[bond.a1] as Pt;
    const b = after.atoms[bond.a2] as Pt;
    const mid = await canvasPoint(page, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    await page.mouse.click(mid.x, mid.y);
    await page.getByTestId('tool-atom').click();
    await away(page);
    await page.waitForTimeout(150);
    await shot(page, 'E22', 'acetic-acid');
  } finally {
    await app.close();
  }
});

test('E22 element drag from an atom shows the ghost bond', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-chain').click();
    await page.mouse.click(START.x, START.y);
    const doc = await readDocument(page);
    const end = await px(page, doc, atomIds(doc)[1] as AtomId);
    await page.getByTestId('tool-atom').click();
    await page.getByTestId('opt-Cl').click();
    await page.mouse.move(end.x, end.y);
    await page.mouse.down();
    await page.mouse.move(end.x + 70, end.y + 40, { steps: 4 });
    await page.waitForTimeout(150);
    await shot(page, 'E22', 'atom-drag');
  } finally {
    await app.close();
  }
});

test('E22 charges, lone pairs and a radical', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-atom').click();
    await page.getByTestId('opt-N').click();
    const left: Pt = { x: 420, y: 400 };
    const right: Pt = { x: 720, y: 400 };
    await page.mouse.click(left.x, left.y);
    await page.getByTestId('opt-O').click();
    await page.mouse.click(right.x, right.y);
    await mark(page, 'plus', left);
    await mark(page, 'minus', right);
    await away(page);
    await page.waitForTimeout(150);
    await shot(page, 'E22', 'charges');
  } finally {
    await app.close();
  }
});

test('E22 lone pairs on the O of water, then a radical on a carbon', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-atom').click();
    await page.getByTestId('opt-O').click();
    const water: Pt = { x: 420, y: 400 };
    const methyl: Pt = { x: 720, y: 400 };
    await page.mouse.click(water.x, water.y);
    await page.getByTestId('opt-C').click();
    await page.mouse.click(methyl.x, methyl.y);
    await mark(page, 'lone-pair', water, 1);
    await away(page);
    await page.waitForTimeout(150);
    await shot(page, 'E22', 'lone-pair-1');
    await mark(page, 'lone-pair', water, 1);
    await away(page);
    await page.waitForTimeout(150);
    await shot(page, 'E22', 'lone-pairs');
    await mark(page, 'radical', methyl);
    await away(page);
    await page.waitForTimeout(150);
    await shot(page, 'E22', 'radical');
  } finally {
    await app.close();
  }
});

test('E22 delta+ and delta- on a C-Cl bond', async () => {
  const { app, page } = await openApp();
  try {
    await page.mouse.click(START.x, START.y);
    const doc = await readDocument(page);
    const [c, cl] = atomIds(doc) as [AtomId, AtomId];
    const pc = await px(page, doc, c);
    const pcl = await px(page, doc, cl);
    await page.getByTestId('tool-atom').click();
    await page.getByTestId('opt-Cl').click();
    await page.mouse.click(pcl.x, pcl.y);
    await mark(page, 'delta-plus', pc);
    await mark(page, 'delta-minus', pcl);
    await away(page);
    await page.waitForTimeout(150);
    await shot(page, 'E22', 'delta');
  } finally {
    await app.close();
  }
});

test('E22 atom options at 960x640 with Chlorine chosen, hovering a carbon of propan-1-ol', async () => {
  const { app, page } = await openApp({ size: [960, 640] });
  try {
    await insertName(page, 'propan-1-ol');
    await page.getByTestId('tool-atom').click();
    await page.getByTestId('opt-Cl').click();
    const doc = await readDocument(page);
    const carbon = Object.values(doc.atoms).find((a) => a.element === 'C') as Doc['atoms'][AtomId];
    const at = await canvasPoint(page, carbon);
    await page.mouse.move(at.x, at.y);
    await page.waitForTimeout(150);
    await shot(page, 'E22', 'atom-options');
    await page.getByTestId('opt-Cl').hover();
    await page.waitForTimeout(700);
    await shot(page, 'E22', 'atom-options-tip');
  } finally {
    await app.close();
  }
});
