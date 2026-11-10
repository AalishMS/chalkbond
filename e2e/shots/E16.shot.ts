import { test, type Page } from '@playwright/test';
import { fragments } from '../../src/core/doc-model';
import { canvasPoint, insertName, openApp, readDocument, shot } from '../harness';

/** The centre of the geometry boxes of the mounted parts whose key starts with one of `keys`. */
async function centreOf(page: Page, keys: string[]): Promise<{ x: number; y: number }> {
  return page.evaluate((wanted) => {
    const rects = [...document.querySelectorAll('[data-layer="content"] > [data-key]')]
      .filter((g) => wanted.some((k) => (g.getAttribute('data-key') ?? '').startsWith(k)))
      .map((g) => g.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left));
    const right = Math.max(...rects.map((r) => r.right));
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return { x: (left + right) / 2, y: (top + bottom) / 2 };
  }, keys);
}

test('E16 move: guide while dragging, after release', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanol');
    await insertName(page, 'benzene');
    const doc = await readDocument(page);
    const groups = fragments(doc);
    const ringAtoms: string[] = groups.find((g) => g.length === 6) ?? [];
    const ethAtoms: string[] = groups.find((g) => g.length === 3) ?? [];
    const keysOf = (atoms: string[], extra: string[]): string[] => [
      ...atoms.map((id) => `atom:${id}`),
      ...Object.values(doc.bonds)
        .filter((b) => atoms.includes(b.a1))
        .map((b) => `bond:${b.id}`),
      ...extra,
    ];
    const ringKeys = keysOf(ringAtoms, ['ring:']);
    const ethKeys = keysOf(ethAtoms, []);
    const first = doc.atoms[ringAtoms[0] as keyof typeof doc.atoms];
    if (!first) throw new Error('no atom');
    const grab = await canvasPoint(page, first);
    const ring = await centreOf(page, ringKeys);
    const eth = await centreOf(page, ethKeys);

    // Drag the benzene right and down until its centre height matches the ethanol's, 2 px short.
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 110, grab.y + (eth.y - ring.y) - 2, { steps: 10 });
    await shot(page, 'E16', 'move-guide');
    await page.mouse.up();
    await page.mouse.move(640, 740);
    await shot(page, 'E16', 'moved');
  } finally {
    await app.close();
  }
});
