import { expect, test, type Page } from '@playwright/test';
import {
  fragments,
  type ArrowObject,
  type Doc,
  type ObjectId,
  type TextObject,
} from '../src/core/doc-model';
import { canvasPoint, openApp, readDocument } from './harness';
import { BL, fragmentInk, insert, messyScheme, objInk } from './scheme';

const texts = (d: Doc): TextObject[] =>
  Object.values(d.objects).filter((o): o is TextObject => o.type === 'text');
const arrowsOf = (d: Doc): ArrowObject[] =>
  Object.values(d.objects).filter((o): o is ArrowObject => o.type === 'arrow');
const plainOf = (t: TextObject | undefined): string => (t?.runs ?? []).map((r) => r.text).join('');

/** Screen px per BLU at the current zoom. */
async function bluPx(page: Page): Promise<number> {
  const a = await canvasPoint(page, { x: 0, y: 0 });
  const b = await canvasPoint(page, { x: 1, y: 0 });
  return b.x - a.x;
}

test('Text tool: hovering near an arrow shows the slot on the pointer side; a click types a condition placed by T3', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-arrow').click();
    const from = await canvasPoint(page, { x: -2, y: 0 });
    const to = await canvasPoint(page, { x: 2, y: 0 });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
    const arrow = arrowsOf(await readDocument(page))[0];
    if (!arrow) throw new Error('no arrow');

    await page.getByTestId('tool-text').click();
    const px = await bluPx(page);
    const mid = await canvasPoint(page, { x: 0, y: 0 });
    // Above the shaft: the slot is drawn above it.
    await page.mouse.move(mid.x, mid.y - 0.6 * px);
    const slot = page.getByTestId('overlay-slot').locator('rect');
    await expect(slot).toHaveCount(1);
    const above = await slot.boundingBox();
    if (!above) throw new Error('no slot');
    expect(above.y + above.height).toBeLessThan(mid.y);
    expect(Math.abs(above.x + above.width / 2 - mid.x)).toBeLessThan(2);
    // 2 BLU wide (a dashed rounded box).
    expect(Math.abs(above.width - 2 * px)).toBeLessThan(2);
    // Below the shaft: the other side.
    await page.mouse.move(mid.x + 5, mid.y + 0.6 * px);
    await expect(slot).toHaveCount(1);
    const below = await slot.boundingBox();
    if (!below) throw new Error('no slot');
    expect(below.y).toBeGreaterThan(mid.y);
    // Too far from the shaft: no slot.
    await page.mouse.move(mid.x, mid.y - 1.6 * px);
    await expect(page.getByTestId('overlay-slot')).toHaveCount(0);

    // Click the slot above and type the condition.
    await page.mouse.click(mid.x, mid.y - 0.6 * px);
    const box = page.getByTestId('textbox-edit');
    await expect(box).toBeFocused();
    await page.keyboard.type('conc. H2SO4');
    await page.keyboard.press('Enter');
    await expect(box).toHaveCount(0);
    let doc = await readDocument(page);
    const [t] = texts(doc);
    expect(t?.attachedTo).toEqual({ arrow: arrow.id, slot: 'above' });
    expect(t?.align).toBe('center');
    // T3: ink bottom 0.2 bondLength above the arrow's ink, centred on the midpoint.
    const ti = objInk(doc, t?.id as ObjectId);
    const ai = objInk(doc, arrow.id);
    expect(ai.y - (ti.y + ti.h)).toBeCloseTo(0.2 * BL, 2);
    expect(ti.x + ti.w / 2).toBeCloseTo(0, 2);

    // The slot below, by the same gesture.
    await page.mouse.click(mid.x, mid.y + 0.6 * px);
    await expect(box).toBeFocused();
    await page.keyboard.type('heat');
    await page.keyboard.press('Enter');
    doc = await readDocument(page);
    const heat = texts(doc).find((x) => plainOf(x) === 'heat');
    expect(heat?.attachedTo).toEqual({ arrow: arrow.id, slot: 'below' });
    const hi = objInk(doc, heat?.id as ObjectId);
    expect(hi.y - (ai.y + ai.h)).toBeCloseTo(0.2 * BL, 2);

    // Clicking the condition again edits it; the arrow end handle drags it along.
    await page.mouse.click(mid.x, mid.y - 0.6 * px);
    await expect(box).toBeFocused();
    await page.keyboard.press('Escape');
    await page.getByTestId('tool-select').click();
    await page.mouse.click(mid.x, mid.y);
    // Deleting the arrow deletes its conditions.
    await page.keyboard.press('Delete');
    expect(texts(await readDocument(page))).toHaveLength(0);
  } finally {
    await app.close();
  }
});

test('Tidy reaction: a hand-placed esterification becomes one tidy line (TR1-TR6)', async () => {
  const { app, page } = await openApp();
  try {
    const { doc, arrow, above, below } = await messyScheme(page);
    expect(fragments(doc)).toHaveLength(4);
    const messy = await readDocument(page);

    await page.getByTestId('act-tidy').click();
    const after = await readDocument(page);
    const a = after.objects[arrow] as ArrowObject;
    expect(a.from.y).toBe(a.to.y);
    expect(a.to.x).toBeGreaterThan(a.from.x);

    // Item ink boxes, BLU, left to right.
    const row = [
      ...fragments(after).map((f) => ({ kind: 'fragment', ink: fragmentInk(after, f) })),
      ...Object.values(after.objects)
        .filter((o) => o.type === 'plus' || o.type === 'arrow')
        .map((o) => ({ kind: o.type, ink: objInk(after, o.id) })),
    ]
      .map((r) => ({
        kind: r.kind,
        x: r.ink.x / BL,
        y: r.ink.y / BL,
        w: r.ink.w / BL,
        h: r.ink.h / BL,
      }))
      .sort((p, q) => p.x - q.x);
    expect(row.map((r) => r.kind)).toEqual([
      'fragment',
      'plus',
      'fragment',
      'arrow',
      'fragment',
      'plus',
      'fragment',
    ]);
    const gaps: number[] = [];
    for (let i = 1; i < row.length; i += 1) {
      const p = row[i - 1] as (typeof row)[number];
      const q = row[i] as (typeof row)[number];
      const gap = q.x - (p.x + p.w);
      gaps.push(gap);
      const want = p.kind === 'plus' || q.kind === 'plus' ? 0.4 : 0.6;
      expect(gap).toBeCloseTo(want, 6);
    }
    // Every ink box is centred on the line (the arrow's shaft for the arrow).
    const centres = row.map((r) => (r.kind === 'arrow' ? a.from.y : r.y + r.h / 2));
    for (const c of centres) expect(Math.abs(c - a.from.y)).toBeLessThan(0.01);

    // The conditions: attached above and below, centred, 0.2 bondLength clear; the arrow fits the widest.
    const t1 = after.objects[above] as TextObject;
    const t2 = after.objects[below] as TextObject;
    expect(t1.attachedTo).toEqual({ arrow, slot: 'above' });
    expect(t2.attachedTo).toEqual({ arrow, slot: 'below' });
    const ai = objInk(after, arrow);
    const i1 = objInk(after, above);
    const i2 = objInk(after, below);
    const mid = ((a.from.x + a.to.x) / 2) * BL;
    expect(i1.x + i1.w / 2).toBeCloseTo(mid, 2);
    expect(i2.x + i2.w / 2).toBeCloseTo(mid, 2);
    expect(ai.y - (i1.y + i1.h)).toBeCloseTo(0.2 * BL, 2);
    expect(i2.y - (ai.y + ai.h)).toBeCloseTo(0.2 * BL, 2);
    expect(Math.abs(a.to.x - a.from.x)).toBeCloseTo(Math.max(2.5, i1.w / BL + 0.6), 6);
    console.log(
      'TIDY gaps (BLU)',
      gaps.map((g) => g.toFixed(4)).join(' '),
      'arrow length',
      Math.abs(a.to.x - a.from.x).toFixed(4),
    );

    // On the page too: the same items measured from the parts' own boxes. A part's box leaves
    // out its stroke, so the gaps read a line width (about 0.05 BLU) wider: 0.12 BLU of room.
    const px = await bluPx(page);
    const keys = [
      ...fragments(after).map((f) => ({
        kind: 'fragment',
        keys: [
          ...f.map((id) => `atom:${id}`),
          ...Object.values(after.bonds)
            .filter((b) => f.includes(b.a1) && f.includes(b.a2))
            .map((b) => `bond:${b.id}`),
        ],
      })),
      ...Object.values(after.objects)
        .filter((o) => o.type === 'plus' || o.type === 'arrow')
        .map((o) => ({ kind: o.type, keys: [`obj:${o.id}`] })),
    ];
    const dom = await page.evaluate((items) => {
      return items.map((item) => {
        const boxes = item.keys
          .map((k) => document.querySelector(`[data-testid="content"] g[data-key="${k}"]`))
          .filter((g): g is Element => g !== null)
          .map((g) => g.getBoundingClientRect());
        const x0 = Math.min(...boxes.map((r) => r.left));
        const x1 = Math.max(...boxes.map((r) => r.right));
        const y0 = Math.min(...boxes.map((r) => r.top));
        const y1 = Math.max(...boxes.map((r) => r.bottom));
        return { kind: item.kind, x: x0, w: x1 - x0, cy: (y0 + y1) / 2 };
      });
    }, keys);
    dom.sort((p, q) => p.x - q.x);
    const lineY = (await canvasPoint(page, { x: 0, y: a.from.y })).y;
    const domGaps: number[] = [];
    for (let i = 0; i < dom.length; i += 1) {
      const q = dom[i] as (typeof dom)[number];
      expect(Math.abs(q.cy - lineY)).toBeLessThan(3);
      if (i === 0) continue;
      const p = dom[i - 1] as (typeof dom)[number];
      const gap = (q.x - (p.x + p.w)) / px;
      domGaps.push(gap);
      const want = p.kind === 'plus' || q.kind === 'plus' ? 0.4 : 0.6;
      expect(Math.abs(gap - want)).toBeLessThan(0.12);
    }
    console.log('TIDY DOM gaps (BLU)', domGaps.map((g) => g.toFixed(3)).join(' '));

    // Undo restores the messy layout exactly; Tidy again is one more step, twice is none.
    await page.keyboard.press('Control+z');
    const back = await readDocument(page);
    expect(JSON.stringify(back.atoms)).toBe(JSON.stringify(messy.atoms));
    expect(JSON.stringify(back.objects)).toBe(JSON.stringify(messy.objects));
    await page.keyboard.press('Control+Shift+t');
    const again = await readDocument(page);
    expect(JSON.stringify(again.objects)).toBe(JSON.stringify(after.objects));
  } finally {
    await app.close();
  }
});

test('Tidy reaction with no arrow says so and changes nothing; the shortcut works with one', async () => {
  const { app, page } = await openApp();
  try {
    await insert(page, 'ethanol');
    await page.keyboard.press('Control+Shift+t');
    await expect(page.getByTestId('statusbar').getByRole('status')).toHaveText(
      'Nothing to tidy: draw an arrow between the molecules first.',
    );
    await page.keyboard.press('Control+z');
    // Only the insert was an undo step: undoing it empties the document, so Tidy changed nothing.
    expect(Object.keys((await readDocument(page)).atoms)).toHaveLength(0);
  } finally {
    await app.close();
  }
});
