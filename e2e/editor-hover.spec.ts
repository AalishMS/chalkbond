import { expect, test, type Locator, type Page } from '@playwright/test';
import { render } from '../src/core/svg-render';
import { canvasPoint, goldenDoc, insertName, loadDocument, openApp, readDocument } from './harness';

const near = (actual: number, expected: number, tol = 0.75): void => {
  expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(tol);
};

const hoverGroup = (page: Page): Locator => page.getByTestId('overlay-hover');
const cursor = (page: Page): Promise<string> =>
  page.getByTestId('canvas').evaluate((el) => getComputedStyle(el).cursor);

/** Golden ethanol on the canvas with the Bond tool active, with its atoms and bonds as screen points. */
async function ethanolWithBondTool(page: Page): Promise<{
  atoms: { id: string; element: string; at: { x: number; y: number } }[];
  bonds: { id: string; from: { x: number; y: number }; to: { x: number; y: number } }[];
}> {
  const doc = goldenDoc('ethanol');
  await loadDocument(page, doc);
  await page.getByTestId('tool-bond').click();
  const atoms = await Promise.all(
    Object.values(doc.atoms).map(async (a) => ({
      id: a.id,
      element: a.element,
      at: await canvasPoint(page, a),
    })),
  );
  const at = (id: string): { x: number; y: number } => {
    const found = atoms.find((a) => a.id === id);
    if (!found) throw new Error(`no atom ${id}`);
    return found.at;
  };
  const bonds = Object.values(doc.bonds).map((b) => ({
    id: b.id,
    from: at(b.a1),
    to: at(b.a2),
  }));
  return { atoms, bonds };
}

test('hovering a skeleton vertex draws a circle of r 9 at 0.45, with the atom hint', async () => {
  const { app, page } = await openApp();
  try {
    const { atoms } = await ethanolWithBondTool(page);
    const carbon = atoms.find((a) => a.element === 'C');
    if (!carbon) throw new Error('no carbon');
    await page.mouse.move(carbon.at.x + 3, carbon.at.y + 2);
    const circle = hoverGroup(page).locator('circle');
    await expect(circle).toHaveCount(1);
    expect(await circle.getAttribute('r')).toBe('9');
    const canvas = await page.getByTestId('canvas').boundingBox();
    if (!canvas) throw new Error('no canvas');
    near(Number(await circle.getAttribute('cx')), carbon.at.x - canvas.x);
    near(Number(await circle.getAttribute('cy')), carbon.at.y - canvas.y);
    expect(await hoverGroup(page).evaluate((g) => getComputedStyle(g).opacity)).toBe('0.45');
    await expect(page.getByRole('status')).toHaveText(
      'Type O, N, Cl… to change this atom. Enter for any label.',
    );
    expect(await cursor(page)).toBe('crosshair');
    // Leaving the atom clears it and restores the tool hint.
    await page.mouse.move(canvas.x + 200, canvas.y + 100);
    await expect(hoverGroup(page)).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText(
      'Click to add a bond. Drag to aim it. Click a bond to change it.',
    );
  } finally {
    await app.close();
  }
});

test('hovering a bond draws an 8 px band between its atoms, with the bond hint', async () => {
  const { app, page } = await openApp();
  try {
    const { bonds } = await ethanolWithBondTool(page);
    const bond = bonds[0];
    if (!bond) throw new Error('no bond');
    const mid = { x: (bond.from.x + bond.to.x) / 2, y: (bond.from.y + bond.to.y) / 2 };
    await page.mouse.move(mid.x, mid.y + 3);
    const band = hoverGroup(page).locator('path.overlay-band');
    await expect(band).toHaveCount(1);
    expect(await band.getAttribute('stroke-width')).toBe('8');
    expect(await band.evaluate((p) => getComputedStyle(p).strokeLinecap)).toBe('round');
    const canvas = await page.getByTestId('canvas').boundingBox();
    if (!canvas) throw new Error('no canvas');
    const d = (await band.getAttribute('d')) ?? '';
    const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    near(nums[0] ?? NaN, bond.from.x - canvas.x);
    near(nums[1] ?? NaN, bond.from.y - canvas.y);
    near(nums[2] ?? NaN, bond.to.x - canvas.x);
    near(nums[3] ?? NaN, bond.to.y - canvas.y);
    await expect(page.getByRole('status')).toHaveText(
      'Press 1, 2 or 3 for single, double, triple.',
    );
  } finally {
    await app.close();
  }
});

test('hovering the O of OH draws its label box grown 2 px, light', async () => {
  const { app, page } = await openApp();
  try {
    const { atoms } = await ethanolWithBondTool(page);
    const oxygen = atoms.find((a) => a.element === 'O');
    if (!oxygen) throw new Error('no O');
    await page.mouse.move(oxygen.at.x, oxygen.at.y);
    const group = page.getByTestId('overlay-hover-label');
    const rect = group.locator('rect');
    await expect(rect).toHaveCount(1);
    expect(await group.evaluate((g) => getComputedStyle(g).opacity)).toBe('0.25');
    expect(await rect.getAttribute('rx')).toBe('4');
    // The scene's ink box for the label, in client px, grown 2 px.
    const ink = render(goldenDoc('ethanol')).extents[`atom:${oxygen.id}`];
    const canvas = await page.getByTestId('canvas').boundingBox();
    if (!ink || !canvas) throw new Error('no extents or canvas');
    const topLeft = await canvasPoint(page, { x: ink.x / 40, y: ink.y / 40 });
    const bottomRight = await canvasPoint(page, {
      x: (ink.x + ink.w) / 40,
      y: (ink.y + ink.h) / 40,
    });
    near(Number(await rect.getAttribute('x')), topLeft.x - canvas.x - 2);
    near(Number(await rect.getAttribute('y')), topLeft.y - canvas.y - 2);
    near(Number(await rect.getAttribute('width')), bottomRight.x - topLeft.x + 4);
    near(Number(await rect.getAttribute('height')), bottomRight.y - topLeft.y + 4);
  } finally {
    await app.close();
  }
});

test('cursors per tool, and what each tool highlights', async () => {
  const { app, page } = await openApp();
  try {
    const { atoms } = await ethanolWithBondTool(page);
    const carbon = atoms.find((a) => a.element === 'C');
    if (!carbon) throw new Error('no carbon');
    const canvas = await page.getByTestId('canvas').boundingBox();
    if (!canvas) throw new Error('no canvas');
    const empty = { x: canvas.x + 150, y: canvas.y + 120 };

    await page.getByTestId('tool-select').click();
    await page.mouse.move(empty.x, empty.y);
    expect(await cursor(page)).toBe('default');
    await page.mouse.move(carbon.at.x, carbon.at.y);
    await expect(hoverGroup(page)).toHaveCount(1);
    expect(await cursor(page)).toBe('move');

    await page.getByTestId('tool-erase').click();
    await page.mouse.move(carbon.at.x + 1, carbon.at.y + 1);
    await expect(hoverGroup(page)).toHaveCount(1);
    expect(await cursor(page)).toContain('data:image/svg+xml');
    expect(await cursor(page)).toContain('4 18');
    // Erase keeps the tool hint: hover keys do not apply to it.
    await expect(page.getByRole('status')).toHaveText('Click or drag over anything to erase it.');

    await page.getByTestId('tool-text').click();
    await page.mouse.move(carbon.at.x + 2, carbon.at.y + 2);
    await expect(hoverGroup(page)).toHaveCount(0);
    expect(await cursor(page)).toBe('text');

    await page.getByTestId('tool-ring').click();
    expect(await cursor(page)).toBe('crosshair');
  } finally {
    await app.close();
  }
});

test('HV5: with Select, a selected item shows no hover tint; an unselected one does', async () => {
  const { app, page } = await openApp();
  try {
    // Water is inserted selected, with the Select tool active (R21).
    await insertName(page, 'water');
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Escape');
    const doc = await readDocument(page);
    const oxygen = Object.values(doc.atoms).find((a) => a.element === 'O');
    if (!oxygen) throw new Error('no O');
    const o = await canvasPoint(page, oxygen);
    await page.mouse.move(o.x, o.y);
    await expect(page.getByTestId('overlay-selection')).toHaveCount(1);
    await expect(hoverGroup(page)).toHaveCount(0);
    await expect(page.getByTestId('overlay-hover-label')).toHaveCount(0);
    expect(await cursor(page)).toBe('move');
    // Clear the selection on empty canvas: the same atom now highlights.
    await page.mouse.click(o.x + 300, o.y + 250);
    await page.mouse.move(o.x, o.y);
    await expect(page.getByTestId('overlay-hover-label')).toHaveCount(1);
  } finally {
    await app.close();
  }
});
