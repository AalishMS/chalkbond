// Shared fixtures for the clipboard-export e2e and shots (tasks/todo-clipboard-export.md).
import { expect, type Page } from '@playwright/test';
import type { ArrowObject, Doc } from '../src/core/doc-model';
import { canvasPoint, insertName, readDocument, readSelection } from './harness';

/** Screen px per BLU at the current zoom. */
async function bluPx(page: Page): Promise<number> {
  const a = await canvasPoint(page, { x: 0, y: 0 });
  const b = await canvasPoint(page, { x: 1, y: 0 });
  return b.x - a.x;
}

/**
 * The SC3 scheme of A01: types `ethanol + acetic acid -> ethyl acetate + water` into the name
 * field, adds the condition `conc. H2SO4, Δ` above the arrow with the Text tool, presses Esc until
 * nothing is selected and the Select tool is active (A01), and returns the document.
 */
export async function loadScheme(page: Page): Promise<Doc> {
  await insertName(page, 'ethanol + acetic acid -> ethyl acetate + water');
  const arrow = Object.values((await readDocument(page)).objects).find(
    (o): o is ArrowObject => o.type === 'arrow',
  );
  if (!arrow) throw new Error('the scheme has no arrow');
  await page.getByTestId('tool-text').click();
  const mid = await canvasPoint(page, {
    x: (arrow.from.x + arrow.to.x) / 2,
    y: (arrow.from.y + arrow.to.y) / 2,
  });
  const above = { x: mid.x, y: mid.y - 0.6 * (await bluPx(page)) };
  await page.mouse.move(above.x, above.y);
  await expect(page.getByTestId('overlay-slot')).toHaveCount(1);
  await page.mouse.click(above.x, above.y);
  const box = page.getByTestId('textbox-edit');
  await expect(box).toBeFocused();
  await page.keyboard.type('conc. H2SO4, Δ');
  await page.keyboard.press('Enter');
  await expect(box).toHaveCount(0);
  // Esc steps down the editor's ladder (SPEC-editor.md K1): … → clear selection → Select tool.
  await page.getByTestId('canvas').focus();
  const select = page.getByTestId('tool-select');
  const settled = async (): Promise<boolean> => {
    const s = await readSelection(page);
    const empty = s.atoms.length + s.bonds.length + s.objects.length === 0;
    return empty && (await select.getAttribute('aria-pressed')) === 'true';
  };
  for (let i = 0; i < 6 && !(await settled()); i++) await page.keyboard.press('Escape');
  expect(await settled()).toBe(true);
  return readDocument(page);
}

/** Clicks ethanol (the scheme's first molecule) with the Select tool: its whole fragment. */
export async function selectEthanol(page: Page): Promise<void> {
  const doc = await readDocument(page);
  const atom = Object.values(doc.atoms)[0];
  if (!atom) throw new Error('the scheme has no ethanol');
  await page.getByTestId('tool-select').click();
  const point = await canvasPoint(page, atom);
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await readSelection(page)).atoms.length).toBe(3);
}
