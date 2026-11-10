import { expect, test, type Page } from '@playwright/test';
import type { AtomId, BondId, Doc } from '../src/core/doc-model';
import { canvasPoint, goldenDoc, loadDocument, openApp, readDocument } from './harness';

type Pt = { x: number; y: number };

const C30 = Math.cos(Math.PI / 6);
/** One bond is 80 screen px at the default zoom (Slides, 150 %). */
const BOND_PX = 80;
const START: Pt = { x: 300, y: 560 };

const atomIds = (d: Doc): AtomId[] => Object.keys(d.atoms) as AtomId[];
const bondIds = (d: Doc): BondId[] => Object.keys(d.bonds) as BondId[];
const at = (d: Doc, id: AtomId): Pt => d.atoms[id] as Pt;
const px = (page: Page, d: Doc, id: AtomId): Promise<Pt> => canvasPoint(page, at(d, id));
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
/** Direction from p to q in degrees, counter-clockwise (y up), rounded to 0.01. */
const angle = (p: Pt, q: Pt): number =>
  Math.round((Math.atan2(-(q.y - p.y), q.x - p.x) * 18000) / Math.PI) / 100;

/** Parts of the canvas drawn at ghost opacity (0.45) right now. */
const ghosts = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-layer="content"] > [data-key]')]
      .filter((g) => getComputedStyle(g).opacity === '0.45')
      .map((g) => g.getAttribute('data-key') ?? ''),
  );

const hint = (page: Page) => page.getByTestId('statusbar').getByRole('status');

/** Clicks empty canvas at START and returns the document. */
async function firstBond(page: Page): Promise<Doc> {
  await page.mouse.click(START.x, START.y);
  return readDocument(page);
}

test('Bond tool: a click on empty canvas draws one 80 px bond, 30 degrees up-right, one undo step', async () => {
  const { app, page } = await openApp();
  try {
    const before = await readDocument(page);
    const doc = await firstBond(page);
    const [a, b] = atomIds(doc) as [AtomId, AtomId];
    expect(atomIds(doc)).toHaveLength(2);
    expect(bondIds(doc)).toHaveLength(1);
    const pa = await px(page, doc, a);
    const pb = await px(page, doc, b);
    expect(dist(pa, START)).toBeLessThan(0.5);
    expect(Math.abs(dist(pa, pb) - BOND_PX)).toBeLessThan(0.01);
    expect(Math.abs(angle(pa, pb) - 30)).toBeLessThan(0.01);
    expect(Object.values(doc.bonds)[0]).toMatchObject({ order: 1, a1: a, a2: b });
    await page.keyboard.press('Control+z');
    expect(await readDocument(page)).toEqual(before);
  } finally {
    await app.close();
  }
});

test('Bond tool: propane by two clicks, then butane; each bond 80 px, every angle 120 degrees', async () => {
  const { app, page } = await openApp();
  try {
    let doc = await firstBond(page);
    const second = await px(page, doc, atomIds(doc)[1] as AtomId);
    await page.mouse.click(second.x, second.y);
    doc = await readDocument(page);
    expect(atomIds(doc)).toHaveLength(3);
    await expect(page.getByTestId('formula')).toHaveText('C3H8 · 44.10 g/mol');
    // The third carbon is down-right of the second, level with the first: a zig-zag.
    const [a, b, c] = atomIds(doc) as [AtomId, AtomId, AtomId];
    expect(Math.abs(at(doc, c).x - 2 * C30 - at(doc, a).x)).toBeLessThan(1e-9);
    expect(Math.abs(at(doc, c).y - at(doc, a).y)).toBeLessThan(1e-9);
    const third = await px(page, doc, c);
    await page.mouse.click(third.x, third.y);
    doc = await readDocument(page);
    expect(atomIds(doc)).toHaveLength(4);
    await expect(page.getByTestId('formula')).toHaveText('C4H10 · 58.12 g/mol');
    const ids = atomIds(doc);
    for (let i = 0; i + 1 < ids.length; i++) {
      const [p, q] = await Promise.all([
        px(page, doc, ids[i] as AtomId),
        px(page, doc, ids[i + 1] as AtomId),
      ]);
      expect(Math.abs(dist(p, q) - BOND_PX)).toBeLessThan(0.01);
    }
    for (let i = 1; i + 1 < ids.length; i++) {
      const [p, q, s] = await Promise.all(
        [i - 1, i, i + 1].map((k) => px(page, doc, ids[k] as AtomId)),
      );
      const u = { x: (p as Pt).x - (q as Pt).x, y: (p as Pt).y - (q as Pt).y };
      const v = { x: (s as Pt).x - (q as Pt).x, y: (s as Pt).y - (q as Pt).y };
      const cos = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
      expect(Math.abs((Math.acos(cos) * 180) / Math.PI - 120)).toBeLessThan(0.01);
    }
    expect(b).toBe(ids[1]);
    // Three undo steps take the butane back to nothing.
    for (let i = 0; i < 3; i++) await page.keyboard.press('Control+z');
    expect(atomIds(await readDocument(page))).toHaveLength(0);
  } finally {
    await app.close();
  }
});

test('Bond tool: dragging from an atom aims the bond in 30 degree steps, 80 px long, with a grey ghost', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await firstBond(page);
    const end = await px(page, doc, atomIds(doc)[1] as AtomId);
    await page.mouse.move(end.x, end.y);
    await page.mouse.down();
    // A long way off, about 7 degrees above horizontal: the bond still goes exactly horizontal.
    await page.mouse.move(end.x + 250, end.y - 30, { steps: 6 });
    await expect(hint(page)).toHaveText('Hold Shift for any angle.');
    await expect.poll(() => ghosts(page).then((g) => g.length)).toBeGreaterThan(0);
    expect((await ghosts(page)).some((k) => k.startsWith('bond:'))).toBe(true);
    // Nothing is in the document before release.
    expect(await readDocument(page)).toEqual(doc);
    await page.mouse.up();
    // The pointer rests on empty canvas, so the hover ghost of the next click shows; leave.
    await page.mouse.move(30, 300);
    await expect.poll(() => ghosts(page)).toEqual([]);
    const after = await readDocument(page);
    expect(atomIds(after)).toHaveLength(3);
    const [, b, c] = atomIds(after) as [AtomId, AtomId, AtomId];
    const [pb, pc] = [await px(page, after, b), await px(page, after, c)];
    expect(Math.abs(dist(pb, pc) - BOND_PX)).toBeLessThan(0.01);
    expect(Math.abs(pc.y - pb.y)).toBeLessThan(0.01);
    expect(pc.x).toBeGreaterThan(pb.x);
    // The hint is back to the tool's.
    await expect(hint(page)).not.toHaveText('Hold Shift for any angle.');
  } finally {
    await app.close();
  }
});

test('Bond tool: Shift frees the angle', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await firstBond(page);
    const end = await px(page, doc, atomIds(doc)[1] as AtomId);
    await page.mouse.move(end.x, end.y);
    await page.mouse.down();
    await page.keyboard.down('Shift');
    const k = (37 * Math.PI) / 180;
    await page.mouse.move(end.x + 300 * Math.cos(k), end.y - 300 * Math.sin(k), { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const after = await readDocument(page);
    const [, b, c] = atomIds(after) as [AtomId, AtomId, AtomId];
    const [pb, pc] = [await px(page, after, b), await px(page, after, c)];
    expect(Math.abs(angle(pb, pc) - 37)).toBeLessThan(0.2);
    expect(Math.abs(dist(pb, pc) - BOND_PX)).toBeLessThan(0.01);
  } finally {
    await app.close();
  }
});

test('Bond tool: releasing on an existing atom closes a ring; on a bonded atom adds nothing', async () => {
  const { app, page } = await openApp();
  try {
    let doc = await firstBond(page);
    const second = await px(page, doc, atomIds(doc)[1] as AtomId);
    await page.mouse.click(second.x, second.y);
    doc = await readDocument(page);
    const [a, b, c] = atomIds(doc) as [AtomId, AtomId, AtomId];
    const [pa, pb, pc] = [await px(page, doc, a), await px(page, doc, b), await px(page, doc, c)];
    // Drag from a to its own neighbour b: they are bonded, so nothing happens.
    await page.mouse.move(pa.x, pa.y);
    await page.mouse.down();
    await page.mouse.move(pb.x, pb.y, { steps: 6 });
    await page.mouse.up();
    expect(await readDocument(page)).toEqual(doc);
    // Drag from c to a: a third bond, no new atom (cyclopropane).
    await page.mouse.move(pc.x, pc.y);
    await page.mouse.down();
    await page.mouse.move(pa.x + 3, pa.y + 2, { steps: 8 });
    await expect(page.getByTestId('overlay').locator('.overlay-merge')).toHaveCount(1);
    await page.mouse.up();
    const ring = await readDocument(page);
    expect(atomIds(ring)).toHaveLength(3);
    expect(bondIds(ring)).toHaveLength(3);
    await expect(page.getByTestId('formula')).toHaveText('C3H6 · 42.08 g/mol');
  } finally {
    await app.close();
  }
});

test('Bond tool: Esc and a right-click both cancel a drag and leave nothing behind', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await firstBond(page);
    const end = await px(page, doc, atomIds(doc)[1] as AtomId);
    // Esc.
    await page.mouse.move(end.x, end.y);
    await page.mouse.down();
    await page.mouse.move(end.x + 200, end.y + 100, { steps: 5 });
    await expect.poll(() => ghosts(page).then((g) => g.length)).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect.poll(() => ghosts(page)).toEqual([]);
    await page.mouse.up();
    expect(await readDocument(page)).toEqual(doc);
    // Right button.
    await page.mouse.move(end.x, end.y);
    await page.mouse.down();
    await page.mouse.move(end.x + 200, end.y + 100, { steps: 5 });
    await expect.poll(() => ghosts(page).then((g) => g.length)).toBeGreaterThan(0);
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });
    await expect.poll(() => ghosts(page)).toEqual([]);
    await page.mouse.up();
    expect(await readDocument(page)).toEqual(doc);
  } finally {
    await app.close();
  }
});

test('Bond tool: a click on a bond cycles single, double, triple, single; double and triple options set the order', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await firstBond(page);
    const [a, b] = atomIds(doc) as [AtomId, AtomId];
    const [pa, pb] = [await px(page, doc, a), await px(page, doc, b)];
    const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    const orders: number[] = [];
    for (let i = 0; i < 3; i++) {
      await page.mouse.click(mid.x, mid.y);
      orders.push(Object.values((await readDocument(page)).bonds)[0]?.order ?? 0);
    }
    expect(orders).toEqual([2, 3, 1]);
    // No atom is ever added by a click on a bond.
    expect(atomIds(await readDocument(page))).toHaveLength(2);
    // The Double option sets 2, then cycles where the second line goes.
    await page.getByTestId('opt-double').click();
    await page.mouse.click(mid.x, mid.y);
    expect(Object.values((await readDocument(page)).bonds)[0]?.order).toBe(2);
    await page.mouse.click(mid.x, mid.y);
    expect(Object.values((await readDocument(page)).bonds)[0]?.doublePlacement).toBe('left');
    await page.getByTestId('opt-triple').click();
    await page.mouse.click(mid.x, mid.y);
    expect(Object.values((await readDocument(page)).bonds)[0]).toMatchObject({ order: 3 });
  } finally {
    await app.close();
  }
});

test('Bond tool: Wedge sets the narrow end at the atom nearer the click; a second click reverses it', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await firstBond(page);
    const [a, b] = atomIds(doc) as [AtomId, AtomId];
    const [pa, pb] = [await px(page, doc, a), await px(page, doc, b)];
    await page.getByTestId('opt-wedge').click();
    const nearB = { x: pa.x + (pb.x - pa.x) * 0.75, y: pa.y + (pb.y - pa.y) * 0.75 };
    await page.mouse.click(nearB.x, nearB.y);
    expect(Object.values((await readDocument(page)).bonds)[0]).toMatchObject({
      stereo: 'wedge',
      a1: b,
      a2: a,
    });
    await page.mouse.click(nearB.x, nearB.y);
    expect(Object.values((await readDocument(page)).bonds)[0]).toMatchObject({
      stereo: 'wedge',
      a1: a,
      a2: b,
    });
    await page.getByTestId('opt-hash').click();
    await page.mouse.click(nearB.x, nearB.y);
    expect(Object.values((await readDocument(page)).bonds)[0]).toMatchObject({ stereo: 'hash' });
    // The Single option clears stereo.
    await page.getByTestId('opt-single').click();
    await page.mouse.click(nearB.x, nearB.y);
    expect(Object.values((await readDocument(page)).bonds)[0]).toMatchObject({
      stereo: 'none',
      order: 1,
    });
  } finally {
    await app.close();
  }
});

test('Bond tool: hovering shows the ghost of the click, at 0.45; leaving the canvas removes it', async () => {
  const { app, page } = await openApp();
  try {
    expect(await ghosts(page)).toEqual([]);
    await page.mouse.move(START.x, START.y);
    await expect.poll(() => ghosts(page).then((g) => g.length)).toBeGreaterThan(0);
    // Over empty canvas the ghost is the two-atom bond a click adds, first atom under the pointer.
    expect((await ghosts(page)).some((k) => k.startsWith('bond:'))).toBe(true);
    expect(atomIds(await readDocument(page))).toHaveLength(0);
    await page.mouse.click(START.x, START.y);
    const doc = await readDocument(page);
    // On the first atom: the hover circle and the ghost of the next bond.
    await page.mouse.move(START.x + 2, START.y + 1);
    await expect(page.getByTestId('overlay-hover').locator('circle')).toHaveCount(1);
    await expect.poll(() => ghosts(page).then((g) => g.length)).toBeGreaterThan(0);
    expect(await readDocument(page)).toEqual(doc);
    // Off the canvas: nothing is left.
    await page.mouse.move(30, 300);
    await expect.poll(() => ghosts(page)).toEqual([]);
    // A click turns the ghost into a real, fully opaque bond.
    await page.mouse.click(START.x, START.y);
    await expect.poll(() => ghosts(page).then((g) => g.length)).toBeGreaterThanOrEqual(0);
    await page.mouse.move(30, 300);
    await expect.poll(() => ghosts(page)).toEqual([]);
    const opaque = await page.evaluate(
      () =>
        [...document.querySelectorAll('[data-layer="content"] > [data-key^="bond:"]')].filter(
          (g) => getComputedStyle(g).opacity === '1',
        ).length,
    );
    expect(opaque).toBe(2);
  } finally {
    await app.close();
  }
});

test('Bond tool: over a labelled atom no ghost and a light box; over a skeleton carbon the ghost and the circle (HV4)', async () => {
  const { app, page } = await openApp();
  try {
    const doc = goldenDoc('ethanol');
    await loadDocument(page, doc);
    const oxygen = Object.values(doc.atoms).find((a) => a.element === 'O') as Doc['atoms'][AtomId];
    const carbon = Object.values(doc.atoms).find((a) => a.element === 'C') as Doc['atoms'][AtomId];
    const label = page.locator(`[data-layer="content"] > [data-key="atom:${oxygen.id}"]`);
    const before = await label.innerHTML();
    const onO = await canvasPoint(page, oxygen);
    await page.mouse.move(onO.x, onO.y);
    const box = page.getByTestId('overlay-hover-label');
    await expect(box.locator('rect')).toHaveCount(1);
    expect(await box.evaluate((g) => getComputedStyle(g).opacity)).toBe('0.25');
    await expect(page.getByTestId('overlay-hover')).toHaveCount(0);
    expect(await ghosts(page)).toEqual([]);
    expect(await label.innerHTML()).toBe(before);
    // The terminal carbon keeps its ghost and its circle.
    const onC = await canvasPoint(page, carbon);
    await page.mouse.move(onC.x, onC.y);
    await expect(page.getByTestId('overlay-hover').locator('circle')).toHaveCount(1);
    await expect.poll(() => ghosts(page).then((g) => g.length)).toBeGreaterThan(0);
  } finally {
    await app.close();
  }
});
