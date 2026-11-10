import { test, type Page } from '@playwright/test';
import { canvasPoint, openApp, shot } from '../harness';

const AT = { x: -3, y: -1 };

async function openText(page: Page): Promise<{ x: number; y: number }> {
  await page.getByTestId('tool-text').click();
  const p = await canvasPoint(page, AT);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(150);
  return p;
}

/** What the box is: sizes the mock-up 09 gives (padding 2 8, 1 px outline, sub 0.7 em, drop 0.2 em). */
async function metrics(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="textbox-edit"]') as HTMLElement;
    const cs = getComputedStyle(el);
    const sub = el.querySelector('span[data-script="sub"]') as HTMLElement | null;
    const scs = sub ? getComputedStyle(sub) : null;
    const b = el.getBoundingClientRect();
    return {
      box: { x: b.x, y: b.y, w: b.width, h: b.height },
      padding: cs.padding,
      outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`,
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      sub: scs ? { fontSize: scs.fontSize, top: scs.top } : null,
    };
  });
}

test('E27 text editor: empty, typing, committed, reopened', async () => {
  const { app, page } = await openApp();
  try {
    const p = await openText(page);
    await shot(page, 'E27', 'text-empty');
    await page.keyboard.type('conc. H2SO4');
    await page.waitForTimeout(150);
    await shot(page, 'E27', 'text-editing');
    console.log('METRICS typing', JSON.stringify(await metrics(page)));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    await shot(page, 'E27', 'text-committed');
    await page.getByTestId('tool-select').click();
    await page.mouse.dblclick(p.x + 40, p.y);
    await page.waitForTimeout(200);
    await shot(page, 'E27', 'text-reopened');
    console.log('METRICS reopened', JSON.stringify(await metrics(page)));
    // x2 active with a selection: select the 4.
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.waitForTimeout(150);
    await shot(page, 'E27', 'text-script-selected');
  } finally {
    await app.close();
  }
});

test('E27 text editor: two lines, bold and italic', async () => {
  const { app, page } = await openApp();
  try {
    await openText(page);
    await page.keyboard.type('first line');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('H2O second');
    await page.waitForTimeout(150);
    await shot(page, 'E27', 'text-two-lines');
    await page.keyboard.press('Control+b');
    await page.keyboard.press('Control+i');
    await page.waitForTimeout(150);
    await shot(page, 'E27', 'text-bold-italic');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    await shot(page, 'E27', 'text-bold-italic-committed');
  } finally {
    await app.close();
  }
});
