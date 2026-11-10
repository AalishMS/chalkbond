import { expect, test, type Page } from '@playwright/test';
import {
  fragments,
  type ArrowObject,
  type Doc,
  type PlusObject,
  type TextObject,
} from '../src/core/doc-model';
import { canvasPoint, openApp, readDocument, type Size } from './harness';
import { BL, fragmentInk, objInk } from './scheme';

const ESTER = 'ethanol + acetic acid -> ethyl acetate + water';

const arrowOf = (d: Doc): ArrowObject => {
  const a = Object.values(d.objects).find((o): o is ArrowObject => o.type === 'arrow');
  if (!a) throw new Error('no arrow');
  return a;
};
const texts = (d: Doc): TextObject[] =>
  Object.values(d.objects).filter((o): o is TextObject => o.type === 'text');
const pluses = (d: Doc): PlusObject[] =>
  Object.values(d.objects).filter((o): o is PlusObject => o.type === 'plus');
const readout = (page: Page): Promise<string> => page.getByTestId('zoom-reset').innerText();

/** Ink boxes (BLU) of the row items of a scheme, left to right, with their kinds. */
function row(doc: Doc): { kind: string; x: number; y: number; w: number; h: number }[] {
  const items = [
    ...fragments(doc).map((f) => ({ kind: 'fragment', ink: fragmentInk(doc, f) })),
    ...Object.values(doc.objects).map((o) => ({ kind: o.type as string, ink: objInk(doc, o.id) })),
  ];
  return items
    .map((r) => ({
      kind: r.kind,
      x: r.ink.x / BL,
      y: r.ink.y / BL,
      w: r.ink.w / BL,
      h: r.ink.h / BL,
    }))
    .sort((p, q) => p.x - q.x);
}

function gapsOf(items: ReturnType<typeof row>): number[] {
  return items.slice(1).map((q, i) => {
    const p = items[i] as (typeof items)[number];
    return q.x - (p.x + p.w);
  });
}

async function chip(page: Page, text: string): Promise<void> {
  await page.getByTestId('empty-state').getByRole('button', { name: text, exact: true }).click();
}

test('the reaction chip inserts the esterification scheme as one undo step (N3, N4)', async () => {
  const { app, page } = await openApp();
  try {
    await chip(page, ESTER);
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
    const doc = await readDocument(page);
    expect(fragments(doc)).toHaveLength(4);
    expect(pluses(doc)).toHaveLength(2);
    const a = arrowOf(doc);
    expect(a.kind).toBe('forward');
    expect(a.from.y).toBe(a.to.y);

    const items = row(doc);
    expect(items.map((r) => r.kind)).toEqual([
      'fragment',
      'plus',
      'fragment',
      'arrow',
      'fragment',
      'plus',
      'fragment',
    ]);
    const gaps = gapsOf(items);
    gaps.forEach((g, i) => {
      const k = items[i]?.kind === 'plus' || items[i + 1]?.kind === 'plus' ? 0.4 : 0.6;
      expect(g).toBeCloseTo(k, 6);
    });
    for (const r of items) {
      const c = r.kind === 'arrow' ? a.from.y : r.y + r.h / 2;
      expect(Math.abs(c - a.from.y)).toBeLessThan(0.01);
    }
    console.log(
      'REACTION chip gaps (BLU)',
      gaps.map((g) => g.toFixed(4)).join(' '),
      'arrow',
      (a.to.x - a.from.x).toFixed(4),
    );

    // Everything selected, Select tool, announced; the readout never above 150 %.
    await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('status')).toContainText('Inserted reaction');
    expect(parseInt(await readout(page), 10)).toBeLessThanOrEqual(150);

    // Centred in the canvas.
    const canvas = await page.getByTestId('canvas').boundingBox();
    if (!canvas) throw new Error('no canvas');
    const x0 = Math.min(...items.map((r) => r.x));
    const x1 = Math.max(...items.map((r) => r.x + r.w));
    const left = await canvasPoint(page, { x: x0, y: 0 });
    const right = await canvasPoint(page, { x: x1, y: 0 });
    expect(Math.abs((left.x + right.x) / 2 - (canvas.x + canvas.width / 2))).toBeLessThan(2);
    expect(left.x - canvas.x).toBeGreaterThanOrEqual(47);
    expect(canvas.x + canvas.width - right.x).toBeGreaterThanOrEqual(47);

    // One undo removes the whole scheme.
    await page.getByTestId('undo').click();
    const gone = await readDocument(page);
    expect(Object.keys(gone.atoms)).toHaveLength(0);
    expect(Object.keys(gone.objects)).toHaveLength(0);
    await expect(page.getByTestId('empty-state')).toBeVisible();
  } finally {
    await app.close();
  }
});

test('typing a reaction: no dropdown while it has an arrow or a +, Enter inserts it', async () => {
  const { app, page } = await openApp();
  try {
    const input = page.getByTestId('namefield-input');
    await input.click();
    await input.pressSequentially('ethanol', { delay: 5 });
    await expect(page.getByRole('listbox')).toHaveCount(1);
    await input.pressSequentially(' + acetic', { delay: 5 });
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await input.pressSequentially(' acid -> ethyl acet', { delay: 5 });
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await input.pressSequentially('ate + water', { delay: 5 });
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await page.keyboard.press('Enter');
    const doc = await readDocument(page);
    expect(fragments(doc)).toHaveLength(4);
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('');
  } finally {
    await app.close();
  }
});

test('<=> and ⇌ draw an equilibrium arrow, => a forward one', async () => {
  const { app, page } = await openApp();
  try {
    const input = page.getByTestId('namefield-input');
    await input.click();
    await input.fill('ethanol <=> ethene');
    await page.keyboard.press('Enter');
    expect(arrowOf(await readDocument(page)).kind).toBe('equilibrium');
    await page.getByTestId('undo').click();
    await input.fill('ethanol ⇌ ethene');
    await page.keyboard.press('Enter');
    expect(arrowOf(await readDocument(page)).kind).toBe('equilibrium');
    await page.getByTestId('undo').click();
    await input.fill('ethanol => ethene');
    await page.keyboard.press('Enter');
    expect(arrowOf(await readDocument(page)).kind).toBe('forward');
  } finally {
    await app.close();
  }
});

test('coefficients: 2 H2 + O2 -> 2 H2O puts a 2 before each structure that has one', async () => {
  const { app, page } = await openApp();
  try {
    const input = page.getByTestId('namefield-input');
    await input.click();
    await input.fill('2 H2 + O2 -> 2 H2O');
    await page.keyboard.press('Enter');
    const doc = await readDocument(page);
    expect(texts(doc).map((t) => t.runs.map((r) => r.text).join(''))).toEqual(['2', '2']);
    const items = row(doc);
    expect(items.map((r) => r.kind)).toEqual([
      'text',
      'fragment',
      'plus',
      'fragment',
      'arrow',
      'text',
      'fragment',
    ]);
    const gaps = gapsOf(items);
    gaps.forEach((g, i) => {
      const k = items[i]?.kind === 'plus' || items[i + 1]?.kind === 'plus' ? 0.4 : 0.6;
      expect(g).toBeCloseTo(k, 6);
    });
    console.log('COEFFICIENT gaps (BLU)', gaps.map((g) => g.toFixed(4)).join(' '));
  } finally {
    await app.close();
  }
});

test('a part that is not found: nothing inserted, the row names it, a chip replaces just that part', async () => {
  const { app, page } = await openApp();
  try {
    const input = page.getByTestId('namefield-input');
    await input.click();
    await input.fill('ethanol + acetic acd -> ethyl acetate + water');
    await page.keyboard.press('Enter');
    const row = page.getByTestId('name-notfound');
    await expect(row).toContainText('No compound named “acetic acd”.');
    await expect(row).toContainText('Did you mean');
    expect(Object.keys((await readDocument(page)).atoms)).toHaveLength(0);
    await expect(input).toHaveValue('ethanol + acetic acd -> ethyl acetate + water');
    await page.getByTestId('name-chip').filter({ hasText: 'acetic acid' }).click();
    expect(fragments(await readDocument(page))).toHaveLength(4);
    await expect(page.getByTestId('name-notfound')).toHaveCount(0);
    await expect(input).toHaveValue('');
  } finally {
    await app.close();
  }
});

test('a scheme inserted into a drawing goes below it, left edges aligned, without overlap', async () => {
  const { app, page } = await openApp();
  try {
    const input = page.getByTestId('namefield-input');
    await input.click();
    await input.fill('benzene');
    await page.keyboard.press('Enter');
    const before = await readDocument(page);
    const old = fragmentInk(before, fragments(before)[0] ?? []);
    await input.fill('ethanol -> ethene');
    await page.keyboard.press('Enter');
    const after = await readDocument(page);
    const fresh = row(after).filter((r) => r.y / 1 >= (old.y + old.h) / BL);
    expect(fresh).toHaveLength(3);
    expect(Math.min(...fresh.map((r) => r.x))).toBeCloseTo(old.x / BL, 6);
    expect(Math.min(...fresh.map((r) => r.y))).toBeCloseTo((old.y + old.h) / BL + 1.5, 6);
  } finally {
    await app.close();
  }
});

test('the SC3 reaction with its conditions in at most 15 actions', async () => {
  const { app, page } = await openApp();
  try {
    const actions: string[] = [];
    await chip(page, ESTER);
    actions.push('click the reaction chip');
    await page.getByTestId('tool-text').click();
    actions.push('Text tool');
    const doc0 = await readDocument(page);
    const a = arrowOf(doc0);
    const mid = await canvasPoint(page, { x: (a.from.x + a.to.x) / 2, y: a.from.y });
    const px =
      (await canvasPoint(page, { x: 1, y: 0 })).x - (await canvasPoint(page, { x: 0, y: 0 })).x;
    await page.mouse.click(mid.x, mid.y - 0.6 * px);
    actions.push('click above the arrow');
    await page.keyboard.type('H2SO4');
    actions.push('type H2SO4');
    await page.keyboard.press('Enter');
    actions.push('Enter');
    await page.mouse.click(mid.x, mid.y + 0.6 * px);
    actions.push('click below the arrow');
    await page.keyboard.press('Control+Shift+D');
    actions.push('Ctrl+Shift+D');
    await page.keyboard.press('Enter');
    actions.push('Enter');
    expect(actions.length).toBeLessThanOrEqual(15);

    const doc = await readDocument(page);
    const arrow = arrowOf(doc);
    expect(arrow.from.y).toBe(arrow.to.y);
    const ts = texts(doc);
    expect(ts.map((t) => t.attachedTo?.slot).sort()).toEqual(['above', 'below']);
    const arrowMid = ((arrow.from.x + arrow.to.x) / 2) * BL;
    for (const t of ts) {
      const ink = objInk(doc, t.id);
      expect(Math.abs(ink.x + ink.w / 2 - arrowMid) / BL).toBeLessThan(0.01);
    }
    const items = row(doc).filter((r) => r.kind === 'fragment' || r.kind === 'plus');
    expect(items).toHaveLength(6);
    for (const r of items) expect(Math.abs(r.y + r.h / 2 - arrow.from.y)).toBeLessThan(0.01);
    expect(plainOf(ts.find((t) => t.attachedTo?.slot === 'below'))).toBe('Δ');
    console.log('SC3 actions', actions.length);
  } finally {
    await app.close();
  }
});

const plainOf = (t: TextObject | undefined): string => (t?.runs ?? []).map((r) => r.text).join('');

test('the chip at 960 x 640 zooms out to fit with the 48 px margin', async () => {
  const size: Size = [960, 640];
  const { app, page } = await openApp({ size });
  try {
    await chip(page, ESTER);
    const doc = await readDocument(page);
    const items = row(doc);
    const canvas = await page.getByTestId('canvas').boundingBox();
    if (!canvas) throw new Error('no canvas');
    const left = await canvasPoint(page, { x: Math.min(...items.map((r) => r.x)), y: 0 });
    const right = await canvasPoint(page, { x: Math.max(...items.map((r) => r.x + r.w)), y: 0 });
    expect(left.x - canvas.x).toBeGreaterThanOrEqual(47);
    expect(canvas.x + canvas.width - right.x).toBeGreaterThanOrEqual(47);
    expect(parseInt(await readout(page), 10)).toBeLessThanOrEqual(150);
  } finally {
    await app.close();
  }
});
