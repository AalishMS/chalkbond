import { test } from '@playwright/test';
import { fragments } from '../../src/core/doc-model';
import { canvasPoint, insertName, openApp, readDocument, shot } from '../harness';

type Pt = { x: number; y: number };

test('E15 select: fragment, narrowed atom, bond, label, marquee, delete', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'benzene');
    await insertName(page, 'ethanol');
    const doc = await readDocument(page);
    const groups = fragments(doc);
    const ringIds = groups.find((g) => g.length === 6) ?? [];
    const ethIds = groups.find((g) => g.length === 3) ?? [];
    const pos = async (id: string): Promise<Pt> => {
      const a = doc.atoms[id as keyof typeof doc.atoms];
      if (!a) throw new Error('no atom');
      return canvasPoint(page, a);
    };
    const ring = await Promise.all(ringIds.map(pos));
    const eth = await Promise.all(ethIds.map(pos));
    const oxygenId = ethIds.find((id) => doc.atoms[id as keyof typeof doc.atoms]?.element === 'O');
    const oxygen = oxygenId === undefined ? null : await pos(oxygenId);
    if (!oxygen) throw new Error('no O');
    const away = { x: 640, y: 720 };

    await page.mouse.click(away.x, away.y);
    const top = ring.reduce((a, b) => (b.y < a.y ? b : a));
    await page.mouse.click(top.x, top.y);
    await page.mouse.move(away.x, away.y);
    await shot(page, 'E15', 'select-benzene');

    await page.mouse.click(top.x, top.y);
    await page.mouse.move(away.x, away.y);
    await shot(page, 'E15', 'select-narrowed');

    const next = ring.find((p) => p !== top && Math.hypot(p.x - top.x, p.y - top.y) < 90);
    if (!next) throw new Error('no neighbour');
    await page.mouse.click(top.x, top.y); // whole fragment again
    await page.mouse.click((top.x + next.x) / 2, (top.y + next.y) / 2);
    await page.mouse.move(away.x, away.y);
    await shot(page, 'E15', 'select-bond');

    await page.mouse.click(oxygen.x, oxygen.y);
    await page.mouse.click(oxygen.x, oxygen.y);
    await page.mouse.move(away.x, away.y);
    await shot(page, 'E15', 'select-label');

    await page.mouse.click(away.x, away.y);
    const left = Math.min(...ring.map((p) => p.x)) - 70;
    const right = (Math.min(...eth.map((p) => p.x)) + Math.max(...eth.map((p) => p.x))) / 2 + 10;
    await page.mouse.move(left, 250);
    await page.mouse.down();
    await page.mouse.move(right, 620, { steps: 8 });
    await shot(page, 'E15', 'marquee');
    await page.mouse.up();
    await page.mouse.move(away.x, away.y);
    await shot(page, 'E15', 'marquee-result');

    await page.mouse.click(top.x, top.y);
    await page.keyboard.press('Delete');
    await page.mouse.move(away.x, away.y);
    await shot(page, 'E15', 'after-delete');
  } finally {
    await app.close();
  }
});
