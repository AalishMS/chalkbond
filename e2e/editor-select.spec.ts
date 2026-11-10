import { expect, test, type Locator, type Page } from '@playwright/test';
import { fragments } from '../src/core/doc-model';
import { canvasPoint, insertName, openApp, readDocument } from './harness';

type Pt = { x: number; y: number };

const selection = (page: Page): Locator => page.getByTestId('overlay-selection');
const frame = (page: Page): Locator => page.getByTestId('overlay-frame');
const disabled = async (page: Page, id: string): Promise<boolean> =>
  (await page.getByTestId(id).getAttribute('aria-disabled')) === 'true';

/** Ethanol, then benzene to its right, as the name field places them; Select is active. */
async function ethanolAndBenzene(page: Page): Promise<{
  ring: { id: string; at: Pt }[];
  ethanol: { id: string; element: string; at: Pt }[];
}> {
  await insertName(page, 'ethanol');
  await insertName(page, 'benzene');
  const doc = await readDocument(page);
  const groups = fragments(doc);
  const place = async (ids: string[]) =>
    Promise.all(
      ids.map(async (id) => {
        const atom = doc.atoms[id as keyof typeof doc.atoms];
        if (!atom) throw new Error('no atom');
        return { id, element: atom.element, at: await canvasPoint(page, atom) };
      }),
    );
  const ring = groups.find((g) => g.length === 6);
  const ethanol = groups.find((g) => g.length === 3);
  if (!ring || !ethanol) throw new Error('unexpected fragments');
  return { ring: await place(ring), ethanol: await place(ethanol) };
}

test('Decision 6: click a benzene atom, click again, click again', async () => {
  const { app, page } = await openApp();
  try {
    const { ring } = await ethanolAndBenzene(page);
    const atom = ring[0] as { at: Pt };
    // The insert left benzene selected (R21); a click on empty canvas clears it.
    await page.mouse.click(700, 700);
    await expect(selection(page).locator('path, circle, rect')).toHaveCount(0);

    await page.mouse.click(atom.at.x, atom.at.y);
    await expect(page.getByTestId('formula')).toHaveText('C6H6 · 78.11 g/mol');
    await expect(selection(page).locator('path')).toHaveCount(6);
    await expect(selection(page).locator('circle')).toHaveCount(0);
    await expect(frame(page).locator('rect')).toHaveCount(1);
    expect(
      await frame(page)
        .locator('rect')
        .evaluate((r) => getComputedStyle(r).strokeDasharray),
    ).toBe('4px, 3px');

    // Second click on an atom of the fully selected fragment: just that atom.
    await page.mouse.click(atom.at.x, atom.at.y);
    await expect(selection(page).locator('circle')).toHaveCount(1);
    await expect(selection(page).locator('path')).toHaveCount(0);
    expect(await selection(page).locator('circle').getAttribute('r')).toBe('12');
    await expect(page.getByTestId('formula')).toHaveText('C6H6 · 78.11 g/mol');

    // Third click: the whole fragment again.
    await page.mouse.click(atom.at.x, atom.at.y);
    await expect(selection(page).locator('path')).toHaveCount(6);
  } finally {
    await app.close();
  }
});

test('the selection is a tinted band at 0.24 with a dashed frame 8 px outside the ink', async () => {
  const { app, page } = await openApp();
  try {
    const { ring } = await ethanolAndBenzene(page);
    await page.mouse.click(700, 700);
    await page.mouse.click((ring[0] as { at: Pt }).at.x, (ring[0] as { at: Pt }).at.y);
    await expect(selection(page).locator('path')).toHaveCount(6);
    expect(await selection(page).evaluate((g) => getComputedStyle(g).opacity)).toBe('0.24');
    const band = selection(page).locator('path').first();
    expect(await band.evaluate((p) => getComputedStyle(p).strokeWidth)).toBe('12px');
    expect(await band.evaluate((p) => getComputedStyle(p).strokeLinecap)).toBe('round');
    // The frame is the ring's ink box grown 8 px: wider than the vertices by at least 8 px each side.
    const xs = ring.map((a) => a.at.x);
    const canvas = await page.getByTestId('canvas').boundingBox();
    if (!canvas) throw new Error('no canvas');
    const rect = frame(page).locator('rect');
    const x = Number(await rect.getAttribute('x')) + canvas.x;
    const w = Number(await rect.getAttribute('width'));
    expect(x).toBeLessThanOrEqual(Math.min(...xs) - 8 + 0.5);
    expect(x + w).toBeGreaterThanOrEqual(Math.max(...xs) + 8 - 0.5);
  } finally {
    await app.close();
  }
});

test('a selected label atom is a rounded tinted box (screen 03b)', async () => {
  const { app, page } = await openApp();
  try {
    const { ethanol } = await ethanolAndBenzene(page);
    const oxygen = ethanol.find((a) => a.element === 'O');
    if (!oxygen) throw new Error('no O');
    await page.mouse.click(700, 700);
    await page.mouse.click(oxygen.at.x, oxygen.at.y);
    await page.mouse.click(oxygen.at.x, oxygen.at.y); // narrow to the atom
    const box = selection(page).locator('rect');
    await expect(box).toHaveCount(1);
    expect(await box.getAttribute('rx')).toBe('4');
    await expect(selection(page).locator('circle')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('Shift+click adds a fragment; Alt+click picks one atom', async () => {
  const { app, page } = await openApp();
  try {
    const { ring, ethanol } = await ethanolAndBenzene(page);
    await page.mouse.click(700, 700);
    await page.mouse.click((ring[0] as { at: Pt }).at.x, (ring[0] as { at: Pt }).at.y);
    const carbon = ethanol.find((a) => a.element === 'C');
    if (!carbon) throw new Error('no C');
    await page.keyboard.down('Shift');
    await page.mouse.click(carbon.at.x, carbon.at.y);
    await page.keyboard.up('Shift');
    await expect(page.getByTestId('formula')).toHaveText('C8H12O · 124.18 g/mol');
    await page.keyboard.down('Alt');
    await page.mouse.click((ring[1] as { at: Pt }).at.x, (ring[1] as { at: Pt }).at.y);
    await page.keyboard.up('Alt');
    await expect(selection(page).locator('circle')).toHaveCount(1);
  } finally {
    await app.close();
  }
});

test('a marquee: the rectangle shows while dragging; on release it selects what is inside', async () => {
  const { app, page } = await openApp();
  try {
    const { ring, ethanol } = await ethanolAndBenzene(page);
    await page.mouse.click(700, 700);
    const left = Math.min(...ethanol.map((a) => a.at.x)) - 60;
    const right = Math.max(...ring.map((a) => a.at.x)) + 60;
    await page.mouse.move(left, 120);
    await page.mouse.down();
    await page.mouse.move(right, 650, { steps: 6 });
    const marquee = page.getByTestId('overlay-marquee').locator('rect');
    await expect(marquee).toHaveCount(1);
    expect(
      await page
        .getByTestId('overlay-marquee')
        .evaluate((g) => getComputedStyle(g.querySelector('rect') as Element).fillOpacity),
    ).toBe('0.08');
    await expect(selection(page).locator('path, circle')).toHaveCount(0);
    await page.mouse.up();
    await expect(page.getByTestId('overlay-marquee')).toHaveCount(0);
    // Both molecules: no single-fragment formula; the selection draws bands for 6 + 2 bonds.
    await expect(selection(page).locator('path')).toHaveCount(8);
    // A marquee commits nothing: the document is unchanged.
    expect(Object.keys((await readDocument(page)).atoms)).toHaveLength(9);
  } finally {
    await app.close();
  }
});

test('Delete removes the selection in one undo step; Ctrl+Z brings it back', async () => {
  const { app, page } = await openApp();
  try {
    const { ring } = await ethanolAndBenzene(page);
    await page.mouse.click(700, 700);
    await page.mouse.click((ring[0] as { at: Pt }).at.x, (ring[0] as { at: Pt }).at.y);
    await page.keyboard.press('Delete');
    expect(Object.keys((await readDocument(page)).atoms)).toHaveLength(3);
    await expect(selection(page).locator('path, circle')).toHaveCount(0);
    await page.keyboard.press('Control+z');
    expect(Object.keys((await readDocument(page)).atoms)).toHaveLength(9);
    await page.mouse.click((ring[0] as { at: Pt }).at.x, (ring[0] as { at: Pt }).at.y);
    await page.keyboard.press('Backspace');
    expect(Object.keys((await readDocument(page)).atoms)).toHaveLength(3);
  } finally {
    await app.close();
  }
});

test('deleting one bond of ethanol removes the carbon it orphans (E2)', async () => {
  const { app, page } = await openApp();
  try {
    const { ethanol } = await ethanolAndBenzene(page);
    const doc = await readDocument(page);
    const oxygen = ethanol.find((a) => a.element === 'O');
    const carbons = ethanol.filter((a) => a.element === 'C');
    if (!oxygen) throw new Error('no O');
    // The terminal carbon is the one farther from the O.
    const far = carbons.reduce((a, b) =>
      Math.hypot(a.at.x - oxygen.at.x, a.at.y - oxygen.at.y) >
      Math.hypot(b.at.x - oxygen.at.x, b.at.y - oxygen.at.y)
        ? a
        : b,
    );
    const mid = carbons.find((c) => c.id !== far.id);
    if (!mid) throw new Error('no middle carbon');
    await page.mouse.click(700, 700);
    await page.mouse.click(far.at.x, far.at.y); // whole fragment
    await page.mouse.click((far.at.x + mid.at.x) / 2, (far.at.y + mid.at.y) / 2); // the bond
    await page.keyboard.press('Delete');
    const after = await readDocument(page);
    expect(Object.keys(after.atoms)).toHaveLength(Object.keys(doc.atoms).length - 1);
    expect(far.id in after.atoms).toBe(false);
  } finally {
    await app.close();
  }
});

test('the options bar follows the selection scope', async () => {
  const { app, page } = await openApp();
  try {
    const { ring, ethanol } = await ethanolAndBenzene(page);
    await page.mouse.click(700, 700);
    // Nothing selected: the scope is the document, which has a benzene ring and no arrow.
    expect(await disabled(page, 'act-clean')).toBe(false);
    expect(await disabled(page, 'act-kekule')).toBe(false);
    expect(await disabled(page, 'act-tidy')).toBe(true);
    expect(await disabled(page, 'act-flip-h')).toBe(true);
    // Ethanol alone: no ring in scope, but a selection to flip.
    const carbon = ethanol.find((a) => a.element === 'C');
    if (!carbon) throw new Error('no C');
    await page.mouse.click(carbon.at.x, carbon.at.y);
    expect(await disabled(page, 'act-kekule')).toBe(true);
    expect(await disabled(page, 'act-flip-h')).toBe(false);
    await page.mouse.click((ring[0] as { at: Pt }).at.x, (ring[0] as { at: Pt }).at.y);
    expect(await disabled(page, 'act-kekule')).toBe(false);
  } finally {
    await app.close();
  }
});

test('Esc steps the ladder: selection, then nothing; Ctrl+A selects everything', async () => {
  const { app, page } = await openApp();
  try {
    await ethanolAndBenzene(page);
    await page.mouse.click(700, 700);
    await page.keyboard.press('Control+a');
    await expect(selection(page).locator('path')).toHaveCount(8);
    await page.keyboard.press('Escape');
    await expect(selection(page).locator('path, circle, rect')).toHaveCount(0);
    await expect(frame(page)).toHaveCount(0);
  } finally {
    await app.close();
  }
});
