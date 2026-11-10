import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from '@playwright/test';
import { createNameIndex, structureFromText } from '../../src/core/chem-core';
import { emptyDoc, insert, type Doc } from '../../src/core/doc-model';
import { canvasPoint, loadDocument, openApp, shot } from '../harness';

/** propan-1-ol from the dictionary, as the name field would insert it. */
function propanol(): Doc {
  const file = resolve(__dirname, '../../resources/compounds/compounds.json');
  const names = createNameIndex(JSON.parse(readFileSync(file, 'utf8')));
  const result = structureFromText('propan-1-ol', names);
  if (!result.ok) throw new Error('propan-1-ol not found');
  return insert(emptyDoc('2026-01-01T00:00:00.000Z'), result.value.sub, { x: 0, y: 0 })[0];
}

test('E14 hover: a skeleton vertex, a label, a bond', async () => {
  const { app, page } = await openApp();
  try {
    const doc = propanol();
    await loadDocument(page, doc);
    await page.getByTestId('tool-bond').click();
    const atoms = Object.values(doc.atoms);
    const oxygen = atoms.find((a) => a.element === 'O');
    // The chain end farthest from the O is a plain skeleton vertex.
    const end = atoms
      .filter((a) => a.element === 'C')
      .reduce((far, a) =>
        oxygen &&
        Math.hypot(a.x - oxygen.x, a.y - oxygen.y) > Math.hypot(far.x - oxygen.x, far.y - oxygen.y)
          ? a
          : far,
      );
    const bond = Object.values(doc.bonds).find((b) => b.a1 === end.id || b.a2 === end.id);
    if (!oxygen || !bond) throw new Error('unexpected propan-1-ol');
    const other = doc.atoms[bond.a1 === end.id ? bond.a2 : bond.a1];
    if (!other) throw new Error('no bond end');

    const vertex = await canvasPoint(page, end);
    await page.mouse.move(vertex.x + 4, vertex.y + 4);
    await page.getByTestId('overlay-hover').waitFor();
    await shot(page, 'E14', 'hover-atom');

    const o = await canvasPoint(page, oxygen);
    await page.mouse.move(o.x, o.y);
    await page.locator('[data-testid="overlay-hover"] rect').waitFor();
    await shot(page, 'E14', 'hover-label-atom');

    const a = await canvasPoint(page, end);
    const b = await canvasPoint(page, other);
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2 + 3);
    await page.locator('[data-testid="overlay-hover"] path').waitFor();
    await shot(page, 'E14', 'hover-bond');
  } finally {
    await app.close();
  }
});
