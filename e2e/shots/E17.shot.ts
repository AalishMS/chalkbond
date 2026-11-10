import { test, type Page } from '@playwright/test';
import { fragments } from '../../src/core/doc-model';
import {
  canvasPoint,
  goldenDoc,
  insertName,
  loadDocument,
  openApp,
  readDocument,
  shot,
} from '../harness';

type Pt = { x: number; y: number };

async function overlayCentre(page: Page, selector: string): Promise<Pt> {
  const box = await page.getByTestId('canvas').boundingBox();
  const circle = page.getByTestId('overlay-handle').locator(selector);
  if (!box) throw new Error('no canvas');
  return {
    x: box.x + Number(await circle.getAttribute('cx')),
    y: box.y + Number(await circle.getAttribute('cy')),
  };
}

async function frameCentre(page: Page): Promise<Pt> {
  const box = await page.getByTestId('canvas').boundingBox();
  const rect = page.getByTestId('overlay-frame').locator('rect');
  if (!box) throw new Error('no canvas');
  return {
    x: box.x + Number(await rect.getAttribute('x')) + Number(await rect.getAttribute('width')) / 2,
    y: box.y + Number(await rect.getAttribute('y')) + Number(await rect.getAttribute('height')) / 2,
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

test('E17 rotate handle: at rest (as mock-up 03), hover, mid-turn, after', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'benzene');
    await insertName(page, 'ethanol');
    const doc = await readDocument(page);
    const ring = fragments(doc).find((f) => f.length === 6) ?? [];
    const first = doc.atoms[ring[0] as keyof typeof doc.atoms] as Pt;
    const at = await canvasPoint(page, first);
    await page.mouse.click(at.x, at.y);
    await page.mouse.move(640, 740);
    await shot(page, 'E17', 'rotate-handle');
    const handle = await overlayCentre(page, 'circle[r="5"]');
    await page.mouse.move(handle.x, handle.y);
    await page.waitForTimeout(150);
    await shot(page, 'E17', 'rotate-handle-hover');
  } finally {
    await app.close();
  }
});

test('E17 rotating ethanol: mid-drag at 45 degrees, after release', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanol');
    const handle = await overlayCentre(page, 'circle[r="5"]');
    const centre = await frameCentre(page);
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    const target = turned(handle, centre, 44);
    await page.mouse.move(target.x, target.y, { steps: 10 });
    await shot(page, 'E17', 'rotating-45');
    await page.mouse.up();
    await page.mouse.move(640, 740);
    await shot(page, 'E17', 'rotated-45');
  } finally {
    await app.close();
  }
});

test('E17 flips: toluene, acetic acid before and after each flip', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'toluene');
    await page.mouse.move(640, 740);
    await shot(page, 'E17', 'toluene-before');
    await page.getByTestId('act-flip-h').click();
    await page.mouse.move(640, 740);
    await shot(page, 'E17', 'flipped');
  } finally {
    await app.close();
  }
  const second = await openApp();
  try {
    const page = second.page;
    await insertName(page, 'acetic acid');
    await page.mouse.move(640, 740);
    await shot(page, 'E17', 'acetic-before');
    await page.getByTestId('act-flip-h').click();
    await page.mouse.move(640, 740);
    await shot(page, 'E17', 'acetic-flip-h');
    await page.getByTestId('act-flip-v').click();
    await page.mouse.move(640, 740);
    await shot(page, 'E17', 'acetic-flip-h-then-v');
  } finally {
    await second.app.close();
  }
});

test('E17 arrow and curved-arrow handles', async () => {
  const { app, page } = await openApp();
  try {
    const doc = goldenDoc('reaction-conditions');
    await loadDocument(page, doc);
    await page.getByTestId('tool-select').click();
    const arrow = Object.values(doc.objects).find((o) => o.type === 'arrow');
    if (arrow?.type !== 'arrow') throw new Error('no arrow');
    const start = await canvasPoint(page, { x: arrow.from.x + 0.3, y: arrow.from.y });
    await page.mouse.click(start.x, start.y);
    await page.mouse.move(640, 740);
    await shot(page, 'E17', 'arrow-handles');
    await loadDocument(page, goldenDoc('fishhook-homolysis'));
    await page.getByTestId('tool-select').click();
    await page.keyboard.press('Control+a');
    await page.mouse.move(640, 740);
    await shot(page, 'E17', 'curved-handles');
  } finally {
    await app.close();
  }
});
