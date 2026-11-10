import { expect, test, type Page } from '@playwright/test';
import type { AtomId, Doc } from '../src/core/doc-model';
import { canvasPoint, insertName, loadDocument, openApp, readDocument } from './harness';

type Pt = { x: number; y: number };

const atomIds = (d: Doc): AtomId[] => Object.keys(d.atoms) as AtomId[];
const px = (page: Page, d: Doc, id: AtomId): Promise<Pt> => canvasPoint(page, d.atoms[id] as Pt);
const formula = (page: Page) => page.getByTestId('formula');
const warnings = (page: Page) => page.getByTestId('warnings');
const hint = (page: Page) => page.getByTestId('statusbar').getByRole('status');
const oxygen = (d: Doc): AtomId => atomIds(d).find((id) => d.atoms[id]?.element === 'O') as AtomId;
const orders = (d: Doc): number[] =>
  Object.values(d.bonds)
    .map((b) => b.order)
    .sort();

/** Inserts `name`, clears the notice and takes the focus to the canvas. */
async function insert(page: Page, name: string): Promise<Doc> {
  await insertName(page, name);
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Escape');
  return readDocument(page);
}

/** Opens the label editor on the oxygen of water or ethanol and commits `text`. */
async function relabel(page: Page, doc: Doc, text: string): Promise<Pt> {
  const o = await px(page, doc, oxygen(doc));
  await page.mouse.move(o.x, o.y);
  await expect(hint(page)).toHaveText('Type O, N, Cl… to change this atom. Enter for any label.');
  await page.keyboard.press('Enter');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  return o;
}

const warningShapes = (page: Page) => page.getByTestId('overlay-warning').locator('rect, circle');

test('a label "H20" is marked, explained on hover, counted, and the marker goes when it is fixed', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await insert(page, 'ethanol');
    await expect(warnings(page)).toHaveCount(0);
    await expect(page.getByTestId('overlay-warning')).toHaveCount(0);
    const o = await relabel(page, doc, 'H20');
    await expect(warnings(page)).toHaveCount(1);
    await expect(warnings(page)).toHaveAttribute('aria-label', '1 warning');
    await expect(warnings(page).locator('span')).toHaveText('1');
    // The box round the label: 1.5 px dashed in the warning colour.
    await expect(warningShapes(page)).toHaveCount(1);
    const style = await warningShapes(page)
      .first()
      .evaluate((el) => {
        const c = getComputedStyle(el);
        return { stroke: c.stroke, width: c.strokeWidth, dash: c.strokeDasharray, fill: c.fill };
      });
    expect(style.stroke).toBe('rgb(180, 35, 24)');
    expect(style.width).toBe('1.5px');
    expect(style.dash).toBe('3px, 2px');
    expect(style.fill).toBe('none');
    // The message shows after 500 ms of hover.
    await page.mouse.move(o.x + 600, o.y - 200);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    const at = await px(page, await readDocument(page), oxygen(doc));
    await page.mouse.move(at.x, at.y);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.waitForTimeout(650);
    await expect(page.getByRole('tooltip')).toHaveText('Unknown label "H20".');
    // Fixing it clears the marker, the tooltip and the count.
    await page.keyboard.press('Enter');
    await page.keyboard.type('OH');
    await page.keyboard.press('Enter');
    await expect(warnings(page)).toHaveCount(0);
    await expect(page.getByTestId('overlay-warning')).toHaveCount(0);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await expect(formula(page)).toHaveText('C2H6O · 46.07 g/mol');
  } finally {
    await app.close();
  }
});

test('a carbon with five bonds shows the circle marker; the warnings button selects it and cycles', async () => {
  const { app, page } = await openApp();
  try {
    // Bond tool: one bond, then the hover key 1 sprouts more bonds from the first atom.
    await page.mouse.click(420, 560);
    const doc = await readDocument(page);
    const first = await px(page, doc, atomIds(doc)[0] as AtomId);
    await page.mouse.move(first.x, first.y);
    await expect(hint(page)).toHaveText('Type O, N, Cl… to change this atom. Enter for any label.');
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('1');
    await expect(warnings(page)).toHaveCount(1);
    await expect(warningShapes(page)).toHaveCount(1);
    expect(await page.getByTestId('overlay-warning').locator('circle').count()).toBe(1);
    const r = await page.getByTestId('overlay-warning').locator('circle').getAttribute('r');
    expect(r).toBe('13');
    // The button selects the atom (Select becomes the tool).
    await warnings(page).click();
    await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('overlay-selection')).toBeAttached();
    // Undo takes the fifth bond away and the marker with it.
    await page.keyboard.press('Control+z');
    await expect(warnings(page)).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('Show Kekulé turns benzene into alternating bonds and the button flips to Show circle without the bar moving (C3)', async () => {
  const { app, page } = await openApp();
  try {
    await insert(page, 'benzene');
    await page.getByTestId('tool-select').click();
    const kekule = page.getByTestId('act-kekule');
    await expect(kekule).toContainText('Show Kekulé');
    const next = page.getByTestId('act-tidy');
    const before = (await next.boundingBox())?.x ?? 0;
    expect(orders(await readDocument(page))).toEqual([1.5, 1.5, 1.5, 1.5, 1.5, 1.5]);
    await kekule.click();
    expect(orders(await readDocument(page))).toEqual([1, 1, 1, 2, 2, 2]);
    await expect(kekule).toContainText('Show circle');
    const after = (await next.boundingBox())?.x ?? 0;
    expect(Math.abs(after - before)).toBeLessThanOrEqual(0.5);
    await expect(formula(page)).toHaveText('C6H6 · 78.11 g/mol');
    // Back to the circle with the shortcut; each is one undo step.
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+Shift+K');
    expect(orders(await readDocument(page))).toEqual([1.5, 1.5, 1.5, 1.5, 1.5, 1.5]);
    await page.keyboard.press('Control+z');
    expect(orders(await readDocument(page))).toEqual([1, 1, 1, 2, 2, 2]);
    await page.keyboard.press('Control+z');
    expect(orders(await readDocument(page))).toEqual([1.5, 1.5, 1.5, 1.5, 1.5, 1.5]);
  } finally {
    await app.close();
  }
});

test('Show Kekulé is disabled for a drawing without a benzene ring', async () => {
  const { app, page } = await openApp();
  try {
    await insert(page, 'cyclohexene');
    await page.getByTestId('tool-select').click();
    await expect(page.getByTestId('act-kekule')).toHaveAttribute('aria-disabled', 'true');
    const before = await readDocument(page);
    // A disabled button stays in the tab order and does nothing when pressed.
    await page.getByTestId('act-kekule').click({ force: true });
    expect(await readDocument(page)).toEqual(before);
  } finally {
    await app.close();
  }
});

test('Clean up tidies a distorted pentane in place, one undo step (C1)', async () => {
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
    await page.getByTestId('act-clean').click();
    const clean = await readDocument(page);
    for (const bond of Object.values(clean.bonds)) {
      const a = clean.atoms[bond.a1] as Pt;
      const b = clean.atoms[bond.a2] as Pt;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(1, 1);
    }
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+z');
    expect(await readDocument(page)).toEqual(warped);
  } finally {
    await app.close();
  }
});

test('Expand replaces Ph with its ring, same formula; the button is only there with an abbreviation (C2)', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await insert(page, 'ethanol');
    await relabel(page, doc, 'Ph');
    await expect(formula(page)).toHaveText('C8H10 · 106.17 g/mol');
    await page.getByTestId('tool-select').click();
    await page.mouse.click(1000, 150);
    await expect(page.getByTestId('act-expand')).toHaveCount(0);
    // Select it with a click, then Expand.
    const now = await readDocument(page);
    const ph = atomIds(now).find((id) => now.atoms[id]?.label === 'Ph') as AtomId;
    const at = await px(page, now, ph);
    await page.mouse.click(at.x, at.y);
    await expect(page.getByTestId('act-expand')).toBeVisible();
    await page.getByTestId('act-expand').click();
    const after = await readDocument(page);
    expect(atomIds(after)).toHaveLength(atomIds(now).length + 5);
    expect(Object.values(after.atoms).some((a) => a.label !== undefined)).toBe(false);
    await expect(formula(page)).toHaveText('C8H10 · 106.17 g/mol');
    await expect(page.getByTestId('act-expand')).toHaveCount(0);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+z');
    expect(await readDocument(page)).toEqual(now);
  } finally {
    await app.close();
  }
});
