import { expect, test, type Page } from '@playwright/test';
import { fragments } from '../src/core/doc-model';
import { canvasPoint, insertName, openApp, readDocument } from './harness';

type Pt = { x: number; y: number };

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The union of the geometry boxes of the mounted parts whose key starts with one of `keys`. */
async function inkOf(page: Page, keys: string[]): Promise<Box> {
  return page.evaluate((wanted) => {
    const rects = [...document.querySelectorAll('[data-layer="content"] > [data-key]')]
      .filter((g) => wanted.some((k) => (g.getAttribute('data-key') ?? '').startsWith(k)))
      .map((g) => g.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    return {
      x: left,
      y: top,
      w: Math.max(...rects.map((r) => r.right)) - left,
      h: Math.max(...rects.map((r) => r.bottom)) - top,
    };
  }, keys);
}

/** Ethanol, then benzene to its right, with the keys of the parts of each. */
async function twoMolecules(page: Page): Promise<{
  ringKeys: string[];
  ethKeys: string[];
  ringAtoms: string[];
  ethAtoms: string[];
}> {
  await insertName(page, 'ethanol');
  await insertName(page, 'benzene');
  const doc = await readDocument(page);
  const groups = fragments(doc);
  const ringAtoms: string[] = groups.find((g) => g.length === 6) ?? [];
  const ethAtoms: string[] = groups.find((g) => g.length === 3) ?? [];
  const keys = (atoms: string[], extra: string[]): string[] => [
    ...atoms.map((id) => `atom:${id}`),
    ...Object.values(doc.bonds)
      .filter((b) => atoms.includes(b.a1))
      .map((b) => `bond:${b.id}`),
    ...extra,
  ];
  return {
    ringAtoms,
    ethAtoms,
    ringKeys: keys(ringAtoms, ['ring:']),
    ethKeys: keys(ethAtoms, []),
  };
}

const atomAt = async (page: Page, id: string): Promise<Pt> => {
  const doc = await readDocument(page);
  const atom = doc.atoms[id as keyof typeof doc.atoms];
  if (!atom) throw new Error('no atom');
  return canvasPoint(page, atom);
};

test('dragging a molecule previews a translation and commits one Move on release', async () => {
  const { app, page } = await openApp();
  try {
    const { ringAtoms, ringKeys } = await twoMolecules(page);
    const before = await readDocument(page);
    const grab = await atomAt(page, ringAtoms[0] as string);
    const box0 = await inkOf(page, ringKeys);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x - 120, grab.y + 140, { steps: 8 });
    // Mid-drag the parts carry a transform, the document is untouched, the frame follows.
    // (Skeleton carbons have no atom part: six bonds and the ring circle move.)
    const transformed = page.locator('[data-layer="content"] > [data-key][transform]');
    await expect(transformed).toHaveCount(7);
    expect(await transformed.first().getAttribute('transform')).toBe('translate(-60 70)');
    expect(await readDocument(page)).toEqual(before);
    await expect(page.getByTestId('overlay-frame').locator('rect')).toHaveCount(1);
    await page.mouse.up();
    await expect(page.locator('[data-layer="content"] > [data-key][transform]')).toHaveCount(0);
    const box1 = await inkOf(page, ringKeys);
    expect(Math.abs(box1.x - (box0.x - 120))).toBeLessThanOrEqual(1.5);
    expect(Math.abs(box1.y - (box0.y + 140))).toBeLessThanOrEqual(1.5);
    // One undo step puts it back.
    await page.keyboard.press('Control+z');
    expect(await readDocument(page)).toEqual(before);
  } finally {
    await app.close();
  }
});

test('Shift constrains a drag to one axis', async () => {
  const { app, page } = await openApp();
  try {
    const { ringAtoms, ringKeys } = await twoMolecules(page);
    const grab = await atomAt(page, ringAtoms[0] as string);
    const box0 = await inkOf(page, ringKeys);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.keyboard.down('Shift');
    await page.mouse.move(grab.x + 150, grab.y + 40, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const box1 = await inkOf(page, ringKeys);
    expect(Math.abs(box1.x - (box0.x + 150))).toBeLessThanOrEqual(1.5);
    expect(Math.abs(box1.y - box0.y)).toBeLessThanOrEqual(1.5);
  } finally {
    await app.close();
  }
});

test('the snapping guide shows while the centres align and goes away on release', async () => {
  const { app, page } = await openApp();
  try {
    const { ringAtoms, ringKeys, ethKeys } = await twoMolecules(page);
    const grab = await atomAt(page, ringAtoms[0] as string);
    const ring0 = await inkOf(page, ringKeys);
    const eth = await inkOf(page, ethKeys);
    const dy = eth.y + eth.h / 2 - (ring0.y + ring0.h / 2);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    // 3 px short of aligning, far from the ethanol horizontally: the pull closes the gap.
    await page.mouse.move(grab.x + 20, grab.y + dy - 3, { steps: 8 });
    const guide = page.getByTestId('overlay-guide').locator('line');
    await expect(guide).toHaveCount(1);
    expect(await guide.getAttribute('y1')).toBe(await guide.getAttribute('y2'));
    expect(await guide.evaluate((l) => getComputedStyle(l).strokeDasharray)).toBe('4px, 4px');
    expect(await guide.evaluate((l) => getComputedStyle(l).opacity)).toBe('0.6');
    await page.mouse.up();
    await expect(page.getByTestId('overlay-guide')).toHaveCount(0);
    const ring1 = await inkOf(page, ringKeys);
    expect(Math.abs(ring1.y + ring1.h / 2 - (eth.y + eth.h / 2))).toBeLessThanOrEqual(2);
  } finally {
    await app.close();
  }
});

test('a single atom dragged onto another atom joins it', async () => {
  const { app, page } = await openApp();
  try {
    const { ringAtoms, ethAtoms } = await twoMolecules(page);
    const doc = await readDocument(page);
    const carbon = ethAtoms.find((id) => doc.atoms[id as keyof typeof doc.atoms]?.element === 'C');
    if (carbon === undefined) throw new Error('no carbon');
    const from = await atomAt(page, carbon);
    const to = await atomAt(page, ringAtoms[0] as string);
    await page.mouse.click(700, 700);
    await page.keyboard.down('Alt');
    await page.mouse.click(from.x, from.y);
    await page.keyboard.up('Alt');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x + 3, to.y + 2, { steps: 10 });
    await expect(page.getByTestId('overlay-merge').locator('circle')).toHaveCount(1);
    await page.mouse.up();
    await expect(page.getByTestId('overlay-merge')).toHaveCount(0);
    expect(Object.keys((await readDocument(page)).atoms)).toHaveLength(8);
    await page.keyboard.press('Control+z');
    expect(Object.keys((await readDocument(page)).atoms)).toHaveLength(9);
  } finally {
    await app.close();
  }
});

test('arrow keys nudge by 0.1 BLU (8 px at 150 %); a run of nudges is one undo step', async () => {
  const { app, page } = await openApp();
  try {
    const { ringAtoms, ringKeys } = await twoMolecules(page);
    const before = await readDocument(page);
    await page.mouse.click(700, 700);
    const top = await atomAt(page, ringAtoms[0] as string);
    await page.mouse.click(top.x, top.y); // select the ring; the canvas has focus
    const box0 = await inkOf(page, ringKeys);
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    const box1 = await inkOf(page, ringKeys);
    expect(Math.abs(box1.x - (box0.x + 24))).toBeLessThanOrEqual(1.5);
    await page.keyboard.press('Shift+ArrowDown');
    const box2 = await inkOf(page, ringKeys);
    expect(Math.abs(box2.y - (box1.y + 80))).toBeLessThanOrEqual(1.5);
    // Shift+arrow joined the run: one undo step in all.
    await page.keyboard.press('Control+z');
    expect(await readDocument(page)).toEqual(before);
  } finally {
    await app.close();
  }
});

test('Esc during a drag cancels it: no commit, no preview', async () => {
  const { app, page } = await openApp();
  try {
    const { ringAtoms } = await twoMolecules(page);
    const before = await readDocument(page);
    const grab = await atomAt(page, ringAtoms[0] as string);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 100, grab.y + 100, { steps: 6 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.locator('[data-layer="content"] > [data-key][transform]')).toHaveCount(0);
    expect(await readDocument(page)).toEqual(before);
  } finally {
    await app.close();
  }
});
