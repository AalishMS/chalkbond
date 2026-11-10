import { expect, test, type Page } from '@playwright/test';
import { fragments, type Doc } from '../src/core/doc-model';
import { canvasPoint, goldenDoc, insertName, loadDocument, openApp, readDocument } from './harness';

type Pt = { x: number; y: number };

const cursor = (page: Page): Promise<string> =>
  page.getByTestId('canvas').evaluate((el) => getComputedStyle(el).cursor);

/** The canvas's top-left in page px: overlay shapes are in canvas px. */
async function canvasOrigin(page: Page): Promise<Pt> {
  const box = await page.getByTestId('canvas').boundingBox();
  if (!box) throw new Error('canvas has no box');
  return { x: box.x, y: box.y };
}

/** The dashed frame, in page px. */
async function frameBox(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
  const origin = await canvasOrigin(page);
  const rect = page.getByTestId('overlay-frame').locator('rect');
  const num = async (name: string): Promise<number> => Number(await rect.getAttribute(name));
  return {
    x: origin.x + (await num('x')),
    y: origin.y + (await num('y')),
    w: await num('width'),
    h: await num('height'),
  };
}

/** The rotate handle circle (r = 5), in page px. */
async function rotateHandle(page: Page): Promise<Pt> {
  const origin = await canvasOrigin(page);
  const circle = page.getByTestId('overlay-handle').locator('circle[r="5"]');
  return {
    x: origin.x + Number(await circle.getAttribute('cx')),
    y: origin.y + Number(await circle.getAttribute('cy')),
  };
}

const turned = (p: Pt, about: Pt, deg: number): Pt => {
  const r = (deg * Math.PI) / 180;
  const d = { x: p.x - about.x, y: p.y - about.y };
  return {
    x: about.x + d.x * Math.cos(r) - d.y * Math.sin(r),
    y: about.y + d.x * Math.sin(r) + d.y * Math.cos(r),
  };
};

const ringOf = (doc: Doc): string[] => fragments(doc).find((f) => f.length === 6) ?? [];
const centroid = (doc: Doc, ids: string[]): Pt => {
  const pts = ids.map((id) => doc.atoms[id as keyof typeof doc.atoms] as Pt);
  return {
    x: pts.reduce((t, p) => t + p.x, 0) / pts.length,
    y: pts.reduce((t, p) => t + p.y, 0) / pts.length,
  };
};

test('the rotate handle turns the selection by 15 degree steps, one undo step', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'benzene');
    // The insert selected the benzene (R21): handle 24 px above the frame's top centre.
    const frame = await frameBox(page);
    const handle = await rotateHandle(page);
    expect(handle.y).toBeCloseTo(frame.y - 24, 0);
    expect(Math.abs(handle.x - (frame.x + frame.w / 2))).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('overlay-handle').locator('line')).toHaveCount(1);

    // Hovering it shows the grab hand.
    await page.mouse.move(handle.x, handle.y);
    await expect.poll(() => cursor(page)).toBe('grab');

    const before = await readDocument(page);
    const centre = { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 };
    await page.mouse.down();
    await expect.poll(() => cursor(page)).toBe('grabbing');
    const target = turned(handle, centre, 40);
    await page.mouse.move(target.x, target.y, { steps: 8 });
    // Mid-drag the document is untouched; the preview shows the snapped turn.
    expect(await readDocument(page)).toEqual(before);
    await page.mouse.up();

    const after = await readDocument(page);
    const ring = ringOf(before);
    const c = centroid(before, ring);
    const a = before.atoms[ring[0] as keyof typeof before.atoms] as Pt;
    const b = after.atoms[ring[0] as keyof typeof after.atoms] as Pt;
    const angle = (p: Pt): number => (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI;
    expect(Math.abs(angle(b) - angle(a) - 45)).toBeLessThan(0.5);
    // The ring turned about its own centre.
    const c2 = centroid(after, ring);
    expect(Math.abs(c2.x - c.x)).toBeLessThan(0.01);
    expect(Math.abs(c2.y - c.y)).toBeLessThan(0.01);

    await page.keyboard.press('Control+z');
    expect(await readDocument(page)).toEqual(before);
  } finally {
    await app.close();
  }
});

test('Flip horizontal mirrors acetic acid in one undo step; disabled without a selection', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-select').click();
    expect(await page.getByTestId('act-flip-h').getAttribute('aria-disabled')).toBe('true');
    await insertName(page, 'acetic acid');
    const before = await readDocument(page);
    expect(await page.getByTestId('act-flip-h').getAttribute('aria-disabled')).toBeNull();
    await page.getByTestId('act-flip-h').click();
    const after = await readDocument(page);
    // Every atom moves to 2c - x for one constant c, and y does not change.
    const sums = Object.values(before.atoms).map((atom) => atom.x + (after.atoms[atom.id] as Pt).x);
    for (const s of sums) expect(Math.abs(s - (sums[0] as number))).toBeLessThan(1e-9);
    for (const atom of Object.values(before.atoms)) {
      expect(Math.abs((after.atoms[atom.id] as Pt).y - atom.y)).toBeLessThan(1e-9);
    }
    expect(after).not.toEqual(before);
    await page.getByTestId('act-flip-v').click();
    await page.keyboard.press('Control+z');
    expect(await readDocument(page)).toEqual(after);
    await page.keyboard.press('Control+z');
    expect(await readDocument(page)).toEqual(before);
  } finally {
    await app.close();
  }
});

test('a selected arrow has end handles; dragging one snaps to 15 degrees and keeps its texts', async () => {
  const { app, page } = await openApp();
  try {
    const doc = goldenDoc('reaction-conditions');
    await loadDocument(page, doc);
    await page.getByTestId('tool-select').click();
    const arrow = Object.values(doc.objects).find((o) => o.type === 'arrow');
    if (arrow?.type !== 'arrow') throw new Error('no arrow');
    // Click the arrow near its start, clear of the texts above and below it.
    const start = await canvasPoint(page, { x: arrow.from.x + 0.3, y: arrow.from.y });
    await page.mouse.click(start.x, start.y);
    const handles = page.getByTestId('overlay-handle');
    await expect(handles.locator('rect')).toHaveCount(2);
    const from = await canvasPoint(page, arrow.from);
    const to = await canvasPoint(page, arrow.to);
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const rad = (40 * Math.PI) / 180;
    await page.mouse.move(to.x, to.y);
    await expect.poll(() => cursor(page)).toBe('pointer');
    await page.mouse.down();
    await page.mouse.move(from.x + length * Math.cos(rad), from.y + length * Math.sin(rad), {
      steps: 8,
    });
    await page.mouse.up();
    const after = await readDocument(page);
    const moved = after.objects[arrow.id];
    if (moved?.type !== 'arrow') throw new Error('no arrow');
    const angle =
      (Math.atan2(moved.to.y - moved.from.y, moved.to.x - moved.from.x) * 180) / Math.PI;
    expect(Math.abs(angle - 45)).toBeLessThan(0.5);
    // The texts attached to it moved with its midpoint.
    for (const o of Object.values(doc.objects)) {
      if (o.type !== 'text' || o.attachedTo?.arrow !== arrow.id) continue;
      const t = after.objects[o.id];
      if (t?.type !== 'text') throw new Error('no text');
      const dx = (moved.from.x + moved.to.x) / 2 - (arrow.from.x + arrow.to.x) / 2;
      const dy = (moved.from.y + moved.to.y) / 2 - (arrow.from.y + arrow.to.y) / 2;
      expect(Math.abs(t.at.x - (o.at.x + dx))).toBeLessThan(1e-9);
      expect(Math.abs(t.at.y - (o.at.y + dy))).toBeLessThan(1e-9);
    }
    await page.keyboard.press('Control+z');
    expect(await readDocument(page)).toEqual(doc);
  } finally {
    await app.close();
  }
});

test('R24: Shift+click on empty canvas keeps the selection; Shift+drag adds a marquee', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanol');
    await insertName(page, 'benzene');
    const doc = await readDocument(page);
    const ring = ringOf(doc);
    const eth = fragments(doc).find((f) => f.length === 3) ?? [];
    const selection = page.getByTestId('overlay-selection');
    // The insert left benzene selected. Shift+click on empty canvas keeps it.
    await expect(selection.locator('path')).toHaveCount(6);
    await page.keyboard.down('Shift');
    await page.mouse.click(640, 740);
    await page.keyboard.up('Shift');
    await expect(selection.locator('path')).toHaveCount(6);
    // Shift+drag a marquee around the ethanol adds it: 6 ring bands and 2 ethanol bonds.
    const pts = await Promise.all(
      eth.map((id) => canvasPoint(page, doc.atoms[id as keyof typeof doc.atoms] as Pt)),
    );
    const left = Math.min(...pts.map((p) => p.x)) - 40;
    const right = Math.max(...pts.map((p) => p.x)) + 40;
    const top = Math.min(...pts.map((p) => p.y)) - 60;
    const bottom = Math.max(...pts.map((p) => p.y)) + 60;
    await page.keyboard.down('Shift');
    await page.mouse.move(left, top);
    await page.mouse.down();
    await page.mouse.move(right, bottom, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(selection.locator('path')).toHaveCount(ring.length + 2);
  } finally {
    await app.close();
  }
});
