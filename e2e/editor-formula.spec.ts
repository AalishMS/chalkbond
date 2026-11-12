// R51-R53, C7, U5-U8, U13 in the real app: the formula switch, structural drawings on the canvas
// (twice the size, labels unchanged, pointers mapped through ptPerBlu) and the options bar at 960.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { fragments, type AtomId, type Doc } from '../src/core/doc-model';
import {
  canvasPoint,
  goldenDoc,
  insertName,
  loadDocument,
  openApp,
  readContentView,
  readDocument,
} from './harness';
import { expectBlockedRequests } from './launch';

type Pt = { x: number; y: number };

const switchButton = (page: Page): Locator => page.getByTestId('act-formula');

/** The mounted parts of the drawing, in order: key and markup. */
const partsOf = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-layer="content"] > [data-key]')].map(
      (g) => `${g.getAttribute('data-key') ?? ''}|${g.outerHTML}`,
    ),
  );

const atomParts = (page: Page): Locator =>
  page.locator('[data-layer="content"] > [data-key^="atom:"]');

const carbons = (doc: Doc): Doc['atoms'][AtomId][] =>
  Object.values(doc.atoms).filter((a) => a.element === 'C');

/** Where the atom is on the page: `ptPerBlu` is 40 skeletal and 80 structural (Slides). */
const atomAt = async (page: Page, id: AtomId, ptPerBlu: number): Promise<Pt> => {
  const atom = (await readDocument(page)).atoms[id];
  if (!atom) throw new Error('no atom');
  return canvasPoint(page, atom, ptPerBlu);
};

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

test('Show structural writes the carbons, Show skeletal gives the first render back, Ctrl+Z restores', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-select').click();
    await expect(switchButton(page)).toHaveAttribute('aria-disabled', 'true');
    await insertName(page, 'ethanol');
    await expect(switchButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    const first = await partsOf(page);
    expect(await atomParts(page).count()).toBe(1);

    await switchButton(page).click();
    await expect(atomParts(page)).toHaveCount(3);
    await expect(switchButton(page)).toHaveAttribute('aria-label', 'Show skeletal formula');
    await expect(switchButton(page).locator('span')).toHaveText('Show skeletal');
    expect((await readDocument(page)).style.formula).toBe('structural');

    await switchButton(page).click();
    await expect(atomParts(page)).toHaveCount(1);
    await expect(switchButton(page).locator('span')).toHaveText('Show structural');
    expect(await partsOf(page)).toEqual(first);
    expect((await readDocument(page)).style.formula).toBeUndefined();

    // One undo step: a switch, then Ctrl+Z.
    await switchButton(page).click();
    await expect(atomParts(page)).toHaveCount(3);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+z');
    await expect(atomParts(page)).toHaveCount(1);
    expect(await partsOf(page)).toEqual(first);
    expect((await readDocument(page)).style.formula).toBeUndefined();
    await page.keyboard.press('Control+y');
    await expect(atomParts(page)).toHaveCount(3);
    expectBlockedRequests(app, 0);
  } finally {
    await app.close();
  }
});

test('R53: bonds double on screen, labels keep their size, ring carbons stay vertices, the methyl reads CH3', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanol');
    const ethanol = await readDocument(page);
    const [c1, c2] = carbons(ethanol);
    const o = Object.values(ethanol.atoms).find((a) => a.element === 'O');
    if (!c1 || !c2 || !o) throw new Error('ethanol');
    const before = dist(await atomAt(page, c1.id, 40), await atomAt(page, c2.id, 40));
    const oxygenText = page.locator(`[data-key="atom:${o.id}"] text`).first();
    const fontBefore = await oxygenText.evaluate((el) => getComputedStyle(el).fontSize);
    const zoomBefore = (await readContentView(page)).k;

    await switchButton(page).click();
    await expect(atomParts(page)).toHaveCount(3);
    // U13: the zoom stays; the bond between the carbons is twice as long on screen.
    expect((await readContentView(page)).k).toBeCloseTo(zoomBefore, 9);
    const after = dist(await atomAt(page, c1.id, 80), await atomAt(page, c2.id, 80));
    expect(Math.abs(after - 2 * before)).toBeLessThanOrEqual(1);
    expect(await oxygenText.evaluate((el) => getComputedStyle(el).fontSize)).toBe(fontBefore);

    await insertName(page, 'toluene');
    const doc = await readDocument(page);
    const toluene = Object.values(doc.atoms).filter((a) => !ethanol.atoms[a.id]);
    expect(toluene).toHaveLength(7);
    const keys = await atomParts(page).evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-key')),
    );
    // Toluene inserted into a structural drawing: only its methyl is written (ring carbons are
    // skeleton vertices); ethanol's three atoms are written.
    expect(keys).toHaveLength(4);
    const texts = await atomParts(page).evaluateAll((els) =>
      els.map((e) => (e.textContent ?? '').replace(/\s+/g, '')),
    );
    expect(texts).toContain('CH3');
    expectBlockedRequests(app, 0);
  } finally {
    await app.close();
  }
});

test('R53: with the Atom tool a click on a structural atom changes that atom (the pointer maps through ptPerBlu)', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanol');
    await switchButton(page).click();
    await expect(atomParts(page)).toHaveCount(3);
    const before = await readDocument(page);
    const target = carbons(before)[0];
    if (!target) throw new Error('no carbon');
    const at = await atomAt(page, target.id, 80);
    await page.getByTestId('tool-atom').click();
    await page.getByTestId('opt-N').click();
    await page.mouse.click(at.x, at.y);
    const after = await readDocument(page);
    expect(Object.keys(after.atoms)).toEqual(Object.keys(before.atoms));
    expect(after.atoms[target.id]?.element).toBe('N');
    for (const a of Object.values(before.atoms)) {
      if (a.id !== target.id) expect(after.atoms[a.id]?.element).toBe(a.element);
    }
    expectBlockedRequests(app, 0);
  } finally {
    await app.close();
  }
});

test('Select: clicking a written carbon of a structural drawing and dragging moves that molecule and the pointer stays on the atom', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanol');
    await insertName(page, 'toluene');
    await switchButton(page).click();
    await expect(atomParts(page)).toHaveCount(4);
    await page.getByTestId('tool-select').click();
    const start = await readDocument(page);
    const written = carbons(start).filter((a) =>
      Object.values(start.bonds).some((b) => b.a1 === a.id || b.a2 === a.id),
    );
    const ethanolAtoms = new Set<string>(
      fragments(start).find((f) => f.some((id) => start.atoms[id]?.element === 'O')) ?? [],
    );
    const grabbed = written.find((a) => ethanolAtoms.has(a.id));
    if (!grabbed) throw new Error('no ethanol carbon');
    const grab = await atomAt(page, grabbed.id, 80);
    const dx = 90;
    const dy = 70;
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + dx, grab.y + dy, { steps: 8 });
    await page.mouse.up();

    const end = await readDocument(page);
    // The pointer is still on the grabbed atom (not at half or double the distance).
    const now = await atomAt(page, grabbed.id, 80);
    expect(Math.abs(now.x - (grab.x + dx))).toBeLessThanOrEqual(1);
    expect(Math.abs(now.y - (grab.y + dy))).toBeLessThanOrEqual(1);
    // Ethanol moved as one piece; toluene did not move.
    for (const a of Object.values(start.atoms)) {
      const moved = end.atoms[a.id];
      if (!moved) throw new Error('atom gone');
      if (ethanolAtoms.has(a.id)) {
        const p = canvasPoint(page, a, 80);
        const q = canvasPoint(page, moved, 80);
        const [pp, qq] = await Promise.all([p, q]);
        expect(Math.abs(qq.x - pp.x - dx)).toBeLessThanOrEqual(1);
        expect(Math.abs(qq.y - pp.y - dy)).toBeLessThanOrEqual(1);
      } else {
        expect(moved.x).toBe(a.x);
        expect(moved.y).toBe(a.y);
      }
    }
    expectBlockedRequests(app, 0);
  } finally {
    await app.close();
  }
});

test('the switch is --formula-btn-w wide at 1280 and 32 px icon-only at 960 with Expand, and the bar does not overflow', async () => {
  const wide = await openApp({ size: [1280, 800] });
  try {
    await insertName(wide.page, 'ethanol');
    const b = await switchButton(wide.page).boundingBox();
    expect(Math.abs((b?.width ?? 0) - 124)).toBeLessThanOrEqual(1);
    expect(Math.abs((b?.height ?? 0) - 32)).toBeLessThanOrEqual(1);
    // The Show Kekulé box is unchanged.
    const kek = await wide.page.getByTestId('act-kekule').boundingBox();
    expect(Math.abs((kek?.width ?? 0) - 109)).toBeLessThanOrEqual(0.5);
    // Its label is visible and the same width in both states.
    await expect(switchButton(wide.page).locator('span')).toBeVisible();
    await switchButton(wide.page).click();
    const b2 = await switchButton(wide.page).boundingBox();
    expect(b2?.width).toBe(b?.width);
    expectBlockedRequests(wide.app, 0);
  } finally {
    await wide.app.close();
  }

  const { app, page } = await openApp({ size: [960, 640] });
  try {
    await loadDocument(page, goldenDoc('abbreviations'));
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+a');
    await expect(page.getByTestId('act-expand')).toBeVisible();
    const fits = await page
      .getByTestId('options')
      .evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(fits.sw).toBeLessThanOrEqual(fits.cw);
    const b = await switchButton(page).boundingBox();
    expect(Math.abs((b?.width ?? 0) - 32)).toBeLessThanOrEqual(1);
    expect(Math.abs((b?.height ?? 0) - 32)).toBeLessThanOrEqual(1);
    await expect(switchButton(page).locator('span')).toBeHidden();
    await expect(switchButton(page)).toHaveAttribute('aria-label', 'Show structural formula');
    // Still works icon-only, and the bar still fits in the other state.
    await switchButton(page).click();
    expect((await readDocument(page)).style.formula).toBe('structural');
    const fits2 = await page
      .getByTestId('options')
      .evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(fits2.sw).toBeLessThanOrEqual(fits2.cw);
    expectBlockedRequests(app, 0);
  } finally {
    await app.close();
  }
});
