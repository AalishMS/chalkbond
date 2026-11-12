import { test } from '@playwright/test';
import type { ArrowObject } from '../../src/core/doc-model';
import { canvasPoint, loadDocument, openApp, readDocument, shot } from '../harness';
import { fragments } from '../../src/core/doc-model';
import { insert, messyScheme, place } from '../scheme';

test('E28 condition slot above and below an arrow, a condition being typed', async () => {
  const { app, page } = await openApp();
  try {
    let doc = await insert(page, 'ethanol');
    doc = await insert(page, 'acetic acid');
    const [first, second] = fragments(doc);
    doc = place(doc, first ?? [], { x: -4.5, y: 0.3 });
    doc = place(doc, second ?? [], { x: 4.5, y: 0.3 });
    await loadDocument(page, doc);
    const mid = 0;
    await page.getByTestId('tool-arrow').click();
    const from = await canvasPoint(page, { x: -2.2, y: 0.3 });
    const to = await canvasPoint(page, { x: 2.2, y: 0.3 });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
    await page.getByTestId('tool-text').click();
    const m = await canvasPoint(page, { x: mid, y: 0.3 });
    await page.mouse.move(m.x, m.y - 40);
    await page.waitForTimeout(200);
    await shot(page, 'E28', 'condition-slot-above');
    await page.mouse.move(m.x, m.y + 40);
    await page.waitForTimeout(200);
    await shot(page, 'E28', 'condition-slot-below');
    await page.mouse.click(m.x, m.y - 40);
    await page.keyboard.type('conc. H2SO4');
    await page.waitForTimeout(200);
    await shot(page, 'E28', 'condition-typing');
    await page.keyboard.press('Enter');
    await page.mouse.move(m.x + 300, m.y + 200);
    await page.waitForTimeout(200);
    await shot(page, 'E28', 'condition-committed');
  } finally {
    await app.close();
  }
});

test('E28 conditions on a diagonal arrow', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('tool-arrow').click();
    const from = await canvasPoint(page, { x: -2, y: 1.5 });
    const to = await canvasPoint(page, { x: 2, y: -1.5 });
    await page.keyboard.down('Shift');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const doc = await readDocument(page);
    const a = Object.values(doc.objects).find((o): o is ArrowObject => o.type === 'arrow');
    if (!a) throw new Error('no arrow');
    await page.getByTestId('tool-text').click();
    const m = await canvasPoint(page, { x: (a.from.x + a.to.x) / 2, y: (a.from.y + a.to.y) / 2 });
    await page.mouse.click(m.x - 30, m.y - 30);
    await page.keyboard.type('hv');
    await page.keyboard.press('Enter');
    await page.mouse.click(m.x + 30, m.y + 30);
    await page.keyboard.type('heat');
    await page.keyboard.press('Enter');
    await page.mouse.move(m.x + 400, m.y + 250);
    await page.waitForTimeout(200);
    await shot(page, 'E28', 'condition-diagonal');
  } finally {
    await app.close();
  }
});

test('E28 tidy: the messy scheme before and after, and the notice', async () => {
  const { app, page } = await openApp();
  try {
    await messyScheme(page);
    await page.getByTestId('tool-select').click();
    // The scheme is wider than the window at this zoom: show it all.
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+0');
    await page.waitForTimeout(250);
    await shot(page, 'E28', 'before-tidy');
    await page.getByTestId('act-tidy').click();
    await page.mouse.move(640, 700);
    await page.waitForTimeout(300);
    await shot(page, 'E28', 'after-tidy');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(150);
    await shot(page, 'E28', 'after-undo');
  } finally {
    await app.close();
  }
});

test('E28 tidy without an arrow', async () => {
  const { app, page } = await openApp();
  try {
    const doc = await insert(page, 'ethanol');
    await loadDocument(page, doc);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+Shift+r');
    await page.waitForTimeout(200);
    await shot(page, 'E28', 'tidy-no-arrow-notice');
  } finally {
    await app.close();
  }
});
