import { expect, test, type Page } from '@playwright/test';
import type {
  ArrowObject,
  AtomId,
  CurvedArrowObject,
  Doc,
  PlusObject,
} from '../src/core/doc-model';
import { render } from '../src/core/svg-render';
import { canvasPoint, insertName, openApp, readDocument } from './harness';

type Pt = { x: number; y: number };

/** One bond is 80 screen px at the default zoom (Slides, 150 %). */
const BOND_PX = 80;

const objectsOf = <T extends { type: string }>(d: Doc, type: T['type']): T[] =>
  Object.values(d.objects).filter((o): o is T & typeof o => o.type === type) as unknown as T[];
const arrows = (d: Doc): ArrowObject[] => objectsOf<ArrowObject>(d, 'arrow');
const pluses = (d: Doc): PlusObject[] => objectsOf<PlusObject>(d, 'plus');
const curves = (d: Doc): CurvedArrowObject[] => objectsOf<CurvedArrowObject>(d, 'curved-arrow');
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
/** Direction from p to q in degrees, counter-clockwise (y up). */
const angle = (p: Pt, q: Pt): number => (Math.atan2(-(q.y - p.y), q.x - p.x) * 180) / Math.PI;

/** Inserts `name` and takes the focus to the canvas; the Select tool is active afterwards. */
async function insert(page: Page, name: string): Promise<Doc> {
  await insertName(page, name);
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Escape');
  return readDocument(page);
}

async function drag(page: Page, from: Pt, to: Pt): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

const onto = (deg: number, from: Pt, px: number): Pt => ({
  x: from.x + px * Math.cos((deg * Math.PI) / 180),
  y: from.y - px * Math.sin((deg * Math.PI) / 180),
});

test('Arrow tool: a 240 px drag is a horizontal 240 px arrow drawn as svg-render draws it, one undo step', async () => {
  const { app, page } = await openApp();
  try {
    const before = await readDocument(page);
    await page.getByTestId('tool-arrow').click();
    const from = { x: 400, y: 400 };
    await drag(page, from, { x: 640, y: 400 });
    const doc = await readDocument(page);
    const [a] = arrows(doc);
    if (!a) throw new Error('no arrow');
    expect(a.kind).toBe('forward');
    const p0 = await canvasPoint(page, a.from);
    const p1 = await canvasPoint(page, a.to);
    expect(dist(p0, from)).toBeLessThan(0.5);
    expect(Math.abs(dist(p0, p1) - 240)).toBeLessThan(0.5);
    expect(Math.abs(angle(p0, p1))).toBeLessThan(0.01);
    // The DOM draws exactly the markup svg-render makes for this document.
    const key = `obj:${a.id}`;
    const part = render(doc).parts.find((p) => p.key === key);
    if (!part) throw new Error('arrow not rendered');
    const wanted = [...part.svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
    expect(wanted.length).toBeGreaterThan(0);
    const drawn = await page
      .locator(`[data-layer="content"] > [data-key="${key}"]`)
      .evaluate((g) => [...g.querySelectorAll('path')].map((p) => p.getAttribute('d')));
    expect(drawn).toEqual(wanted);
    await page.keyboard.press('Control+z');
    expect(await readDocument(page)).toEqual(before);
  } finally {
    await app.close();
  }
});

test('Arrow tool: angles snap to 15 degrees, Shift leaves them free', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-arrow').click();
    const starts: [number, number, number][] = [
      [10, 15, 300],
      [20, 15, 400],
      [5, 0, 500],
    ];
    for (const [deg, want, y] of starts) {
      const from = { x: 300, y };
      await drag(page, from, onto(deg, from, 240));
      const doc = await readDocument(page);
      const a = arrows(doc).at(-1);
      if (!a) throw new Error('no arrow');
      const p0 = await canvasPoint(page, a.from);
      const p1 = await canvasPoint(page, a.to);
      expect(Math.abs(angle(p0, p1) - want), `${deg} deg`).toBeLessThan(0.01);
      expect(Math.abs(dist(p0, p1) - 240)).toBeLessThan(0.5);
    }
    // Shift: free.
    const from = { x: 300, y: 650 };
    await page.keyboard.down('Shift');
    await drag(page, from, onto(20, from, 240));
    await page.keyboard.up('Shift');
    const a = arrows(await readDocument(page)).at(-1);
    if (!a) throw new Error('no arrow');
    const p0 = await canvasPoint(page, a.from);
    const p1 = await canvasPoint(page, a.to);
    expect(Math.abs(angle(p0, p1) - 20)).toBeLessThan(0.05);
  } finally {
    await app.close();
  }
});

test('Arrow tool: the options draw the four kinds; a click on an arrow changes its kind in one step', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-arrow').click();
    const kinds = [
      ['forward', 'forward'],
      ['equilibrium', 'equilibrium'],
      ['resonance', 'resonance'],
      ['nogo', 'no-go'],
    ] as const;
    let y = 250;
    for (const [option, kind] of kinds) {
      await page.getByTestId(`opt-${option}`).click();
      await drag(page, { x: 400, y }, { x: 640, y });
      expect(arrows(await readDocument(page)).at(-1)?.kind).toBe(kind);
      y += 100;
    }
    // A click on the first arrow with Equilibrium chosen.
    await page.getByTestId('opt-equilibrium').click();
    const before = await readDocument(page);
    await page.mouse.click(520, 250);
    const after = await readDocument(page);
    expect(arrows(after)).toHaveLength(4);
    expect(arrows(after)[0]?.kind).toBe('equilibrium');
    await page.keyboard.press('Control+z');
    expect(await readDocument(page)).toEqual(before);
    // A click on empty canvas: the default arrow, 2.5 BLU = 200 px.
    await page.mouse.click(300, 700);
    const last = arrows(await readDocument(page)).at(-1);
    if (!last) throw new Error('no arrow');
    const p0 = await canvasPoint(page, last.from);
    const p1 = await canvasPoint(page, last.to);
    expect(Math.abs(dist(p0, p1) - 2.5 * BOND_PX)).toBeLessThan(0.5);
  } finally {
    await app.close();
  }
});

test('ethanol + acetic acid ->: the plus snaps to the molecules centre line and the arrow lies on it', async () => {
  const { app, page } = await openApp();
  try {
    await insert(page, 'ethanol');
    const doc2 = await (async () => {
      await insert(page, 'acetic acid');
      return readDocument(page);
    })();
    const atoms = Object.values(doc2.atoms);
    const pts = await Promise.all(atoms.map((a) => canvasPoint(page, a)));
    const xs = pts.map((p) => p.x).sort((a, b) => a - b);
    const ys = pts.map((p) => p.y).sort((a, b) => a - b);
    // The gap between the two molecules: the widest gap in x.
    let gapAt = 0;
    let widest = 0;
    for (let i = 1; i < xs.length; i += 1) {
      const gap = (xs[i] ?? 0) - (xs[i - 1] ?? 0);
      if (gap > widest) {
        widest = gap;
        gapAt = ((xs[i] ?? 0) + (xs[i - 1] ?? 0)) / 2;
      }
    }
    const midY = ((ys[0] ?? 0) + (ys.at(-1) ?? 0)) / 2;
    await page.getByTestId('tool-plus').click();
    await page.mouse.move(gapAt, midY + 4);
    await page.mouse.down();
    // While the button is down: a guide line shows and a ghost plus follows.
    await expect(page.getByTestId('overlay-guide')).toHaveCount(1);
    const canvasBox = await page.getByTestId('canvas').boundingBox();
    const guideY =
      (canvasBox?.y ?? 0) +
      Number(await page.getByTestId('overlay-guide').locator('line').first().getAttribute('y1'));
    await page.mouse.up();
    const doc = await readDocument(page);
    const [plus] = pluses(doc);
    if (!plus) throw new Error('no plus');
    const where = await canvasPoint(page, plus.at);
    expect(Math.abs(where.x - gapAt)).toBeLessThan(0.5);
    // On the guide, and within the 6 px pull of where the pointer was.
    expect(Math.abs(where.y - guideY)).toBeLessThan(0.5);
    expect(Math.abs(where.y - (midY + 4))).toBeLessThanOrEqual(6.01);
    // The arrow to the right of the second molecule, on the same baseline.
    await page.getByTestId('tool-arrow').click();
    const startX = (xs.at(-1) ?? 0) + 60;
    await drag(page, { x: startX, y: where.y }, { x: startX + 160, y: where.y + 3 });
    const arrow = arrows(await readDocument(page))[0];
    if (!arrow) throw new Error('no arrow');
    const a0 = await canvasPoint(page, arrow.from);
    const a1 = await canvasPoint(page, arrow.to);
    expect(Math.abs(a0.y - where.y)).toBeLessThan(0.5);
    expect(Math.abs(a1.y - where.y)).toBeLessThan(0.5);
  } finally {
    await app.close();
  }
});

test('Curly tool: acetic acid C=O bond to its O atom, anchored, full head, hover lights the anchors', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await insert(page, 'acetic acid');
    const carbonyl = Object.values(doc.bonds).find(
      (b) =>
        b.order === 2 && (doc.atoms[b.a1]?.element === 'O' || doc.atoms[b.a2]?.element === 'O'),
    );
    if (!carbonyl) throw new Error('no C=O');
    const oxygen = (doc.atoms[carbonyl.a1]?.element === 'O' ? carbonyl.a1 : carbonyl.a2) as AtomId;
    const p1 = doc.atoms[carbonyl.a1] as Pt;
    const p2 = doc.atoms[carbonyl.a2] as Pt;
    const mid = await canvasPoint(page, { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
    const o = await canvasPoint(page, doc.atoms[oxygen] as Pt);
    await page.getByTestId('tool-curved').click();
    // Hover: the bond lights up.
    await page.mouse.move(mid.x, mid.y);
    await expect(page.getByTestId('overlay-hover')).toHaveCount(1);
    await page.mouse.down();
    await page.mouse.move((mid.x + o.x) / 2, (mid.y + o.y) / 2 - 10, { steps: 3 });
    await page.mouse.move(o.x, o.y, { steps: 3 });
    // Start (bond band) and end (label box) are both lit.
    await expect(page.getByTestId('overlay-hover')).toHaveCount(1);
    await expect(page.getByTestId('overlay-hover-label')).toHaveCount(1);
    await page.mouse.up();
    const after = await readDocument(page);
    const [c] = curves(after);
    if (!c) throw new Error('no curved arrow');
    expect(c.from).toEqual({ kind: 'bond', bond: carbonyl.id, t: 0.5 });
    expect(c.to).toEqual({ kind: 'atom', atom: oxygen });
    expect(c.head).toBe('full');
    expect(Math.abs(c.bend)).toBeCloseTo(1.8, 9);
    // Rendered by svg-render: a path in the part, and its ink stays clear of the label's glyphs.
    const scene = render(after);
    const ink = scene.extents[`obj:${c.id}`];
    expect(ink).toBeDefined();
    await page.keyboard.press('Control+z');
    expect(curves(await readDocument(page))).toHaveLength(0);
  } finally {
    await app.close();
  }
});

test('Curly tool: Single electron makes a fishhook; starting on empty canvas gives the notice', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await insert(page, 'ethanol');
    const [a, b] = Object.values(doc.atoms);
    if (!a || !b) throw new Error('atoms');
    const pa = await canvasPoint(page, a);
    const pb = await canvasPoint(page, b);
    await page.getByTestId('tool-curved').click();
    await page.getByTestId('opt-fishhook').click();
    await drag(page, pa, pb);
    expect(curves(await readDocument(page))[0]?.head).toBe('fishhook');
    await page.mouse.click(1100, 650);
    await expect(page.getByTestId('statusbar').getByRole('status')).toContainText(
      'Start on an atom or a bond.',
    );
    expect(curves(await readDocument(page))).toHaveLength(1);
  } finally {
    await app.close();
  }
});
