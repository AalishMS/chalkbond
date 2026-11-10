import { expect, test, type Page } from '@playwright/test';
import type { AtomId, Doc } from '../src/core/doc-model';
import { canvasPoint, insertName, openApp, readDocument } from './harness';

type Pt = { x: number; y: number };

const atomIds = (d: Doc): AtomId[] => Object.keys(d.atoms) as AtomId[];
const oxygen = (d: Doc): AtomId => atomIds(d).find((id) => d.atoms[id]?.element === 'O') as AtomId;
const px = (page: Page, d: Doc, id: AtomId): Promise<Pt> => canvasPoint(page, d.atoms[id] as Pt);
const formula = (page: Page) => page.getByTestId('formula');
const box = (page: Page) => page.getByTestId('textbox-edit');
const activeTool = (page: Page): Promise<string> =>
  page.evaluate(
    () =>
      document
        .querySelector('[data-testid^="tool-"][aria-pressed="true"]')
        ?.getAttribute('data-testid') ?? '',
  );
const hint = (page: Page) => page.getByTestId('statusbar').getByRole('status');
const focusedTestId = (page: Page): Promise<string | null> =>
  page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);

/** The editor's DOM as it is: only text nodes and `<span data-script>`, never anything else. */
const editorShape = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid="textbox-edit"]');
    if (!el) return '';
    return [...el.childNodes]
      .map((n) =>
        n.nodeType === Node.TEXT_NODE
          ? `t:${n.textContent}`
          : `${(n as Element).tagName.toLowerCase()}[${[...(n as Element).attributes]
              .map((a) => `${a.name}=${a.value}`)
              .join(',')}]:${n.textContent}`,
      )
      .join('|');
  });

/** Ethanol from the name field, then the pointer rests over its oxygen. Returns the document. */
async function ethanolHovered(page: Page): Promise<{ doc: Doc; o: Pt }> {
  await insertName(page, 'ethanol');
  await page.getByTestId('canvas').focus();
  // Esc clears the "Inserted" notice, which would hide the hint.
  await page.keyboard.press('Escape');
  const doc = await readDocument(page);
  const o = await px(page, doc, oxygen(doc));
  await page.mouse.move(o.x, o.y);
  await expect(hint(page)).toHaveText('Type O, N, Cl… to change this atom. Enter for any label.');
  return { doc, o };
}

test('Enter over an atom opens the label editor: NH2 shows a real subscript and commits N (L1-L3)', async () => {
  const { app, page } = await openApp();
  try {
    await ethanolHovered(page);
    await expect(formula(page)).toHaveText('C2H6O · 46.07 g/mol');
    await page.keyboard.press('Enter');
    await expect(box(page)).toBeVisible();
    await expect(box(page)).toBeFocused();
    await expect(hint(page)).toHaveText('Enter finishes. Esc cancels.');
    // The label is filled and fully selected: typing replaces it.
    expect(await editorShape(page)).toBe('t:O');
    await page.keyboard.type('NH2');
    expect(await editorShape(page)).toBe('t:NH|span[data-script=sub]:2');
    await expect(box(page).locator('span[data-script="sub"]')).toHaveText('2');
    // No markup syntax, ever.
    expect(await box(page).innerText()).not.toMatch(/[_^{}]/);
    await page.keyboard.press('Enter');
    await expect(box(page)).toHaveCount(0);
    expect(await focusedTestId(page)).toBe('canvas');
    await expect(formula(page)).toHaveText('C2H7N · 45.08 g/mol');
    // One undo step.
    await page.keyboard.press('Control+z');
    await expect(formula(page)).toHaveText('C2H6O · 46.07 g/mol');
  } finally {
    await app.close();
  }
});

test('the box is a TextBox over the atom: 1 px accent outline, canvas background, rendered size', async () => {
  const { app, page } = await openApp();
  try {
    const { o } = await ethanolHovered(page);
    await page.keyboard.press('Enter');
    const edit = box(page);
    const b = await edit.boundingBox();
    if (!b) throw new Error('no box');
    // Centred on the atom.
    expect(Math.abs(b.x + b.width / 2 - o.x)).toBeLessThan(1.5);
    expect(Math.abs(b.y + b.height / 2 - o.y)).toBeLessThan(3);
    const style = await edit.evaluate((el) => {
      const c = getComputedStyle(el);
      return {
        outline: `${c.outlineWidth} ${c.outlineStyle} ${c.outlineColor}`,
        bg: c.backgroundColor,
        font: c.fontFamily,
        size: c.fontSize,
      };
    });
    expect(style.outline).toBe('1px solid rgb(31, 95, 209)');
    expect(style.bg).toBe('rgb(255, 255, 255)');
    expect(style.font).toContain('Arial');
    // Slides: 24 pt at 150 % zoom is 48 px.
    expect(style.size).toBe('48px');
  } finally {
    await app.close();
  }
});

test('Esc cancels with no change and focus returns to the canvas', async () => {
  const { app, page } = await openApp();
  try {
    const { doc } = await ethanolHovered(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('NH2');
    await page.keyboard.press('Escape');
    await expect(box(page)).toHaveCount(0);
    expect(await focusedTestId(page)).toBe('canvas');
    expect(await readDocument(page)).toEqual(doc);
    await expect(formula(page)).toHaveText('C2H6O · 46.07 g/mol');
  } finally {
    await app.close();
  }
});

test('clicking elsewhere commits; the typing keys, undo and redo stay in the editor (R7)', async () => {
  const { app, page } = await openApp();
  try {
    await ethanolHovered(page);
    await page.keyboard.press('Enter');
    const toolBefore = await activeTool(page);
    await page.keyboard.type('NH2');
    // While it is open: Undo/Redo buttons are disabled and tool keys are text.
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('redo')).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.type('B');
    expect(await box(page).innerText()).toBe('NH2B');
    // Ctrl+Z is the editor's own undo.
    await page.keyboard.press('Control+z');
    expect(await box(page).innerText()).toBe('NH2');
    await page.keyboard.press('Control+y');
    expect(await box(page).innerText()).toBe('NH2B');
    await page.keyboard.press('Backspace');
    expect(await box(page).innerText()).toBe('NH2');
    expect(await activeTool(page)).toBe(toolBefore);
    // Click on empty canvas.
    await page.mouse.click(900, 200);
    await expect(box(page)).toHaveCount(0);
    expect(await focusedTestId(page)).toBe('canvas');
    await expect(formula(page)).toHaveText('C2H7N · 45.08 g/mol');
  } finally {
    await app.close();
  }
});

test('Backspace in the middle, selecting with Shift+arrows, and a paste of plain text', async () => {
  const { app, page } = await openApp();
  try {
    await ethanolHovered(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('COOH');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Backspace');
    expect(await box(page).innerText()).toBe('COH');
    // The caret is after the C: Shift+Right twice selects "OH"; typing replaces the selection.
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.type('N');
    expect(await box(page).innerText()).toBe('CN');
    // Paste: plain text goes in at the caret, newlines dropped in a one-line label.
    await app.evaluate(({ clipboard }) => {
      clipboard.writeText('H2\nO');
    });
    await page.keyboard.press('Control+v');
    expect(await box(page).innerText()).toBe('CNH2O');
    expect(await editorShape(page)).toBe('t:CNH|span[data-script=sub]:2|t:O');
    await page.keyboard.press('Escape');
  } finally {
    await app.close();
  }
});

test('digits typed after a letter show as a subscript, and Home then Shift+End selects the whole label', async () => {
  const { app, page } = await openApp();
  try {
    await ethanolHovered(page);
    await page.keyboard.press('Enter');
    // The label box derives sub/superscripts from the text: "CO2H" shows its 2 as a subscript.
    await page.keyboard.type('CO2H');
    expect(await editorShape(page)).toBe('t:CO|span[data-script=sub]:2|t:H');
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    // A selection read back from the DOM follows the arrows.
    const sel = await page.evaluate(() => {
      const s = getSelection();
      return s ? s.toString() : '';
    });
    expect(sel).toBe('CO2H');
    await page.keyboard.press('Escape');
  } finally {
    await app.close();
  }
});

test('a charge is a superscript while typing: NH4+', async () => {
  const { app, page } = await openApp();
  try {
    await ethanolHovered(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('NH4+');
    expect(await editorShape(page)).toBe('t:NH|span[data-script=sub]:4|span[data-script=sup]:+');
    await page.keyboard.press('Escape');
  } finally {
    await app.close();
  }
});

test('an unknown label is kept as typed, with the caption warning (L2)', async () => {
  const { app, page } = await openApp();
  try {
    await ethanolHovered(page);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('textbox')).toContainText('e.g. OH, NH2, Cl, Ph, CO2H');
    await page.keyboard.type('H20');
    await expect(page.getByTestId('textbox')).toContainText(
      'Not a known group; it will be drawn as typed.',
    );
    await page.keyboard.press('Enter');
    const doc = await readDocument(page);
    const star = atomIds(doc).find((id) => doc.atoms[id]?.element === '*') as AtomId;
    expect(doc.atoms[star]).toMatchObject({ label: 'H20' });
  } finally {
    await app.close();
  }
});

test('Ph on the oxygen, COOH and empty text (L3)', async () => {
  const { app, page } = await openApp();
  try {
    await ethanolHovered(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('Ph');
    await page.keyboard.press('Enter');
    let doc = await readDocument(page);
    expect(Object.values(doc.atoms).some((a) => a.label === 'Ph' && a.element === 'C')).toBe(true);
    // Hover it again and clear its label: a plain carbon.
    const ph = atomIds(doc).find((id) => doc.atoms[id]?.label === 'Ph') as AtomId;
    const at = await px(page, doc, ph);
    await page.mouse.move(at.x + 1, at.y + 1);
    await page.keyboard.press('Enter');
    await expect(box(page)).toBeVisible();
    expect(await box(page).innerText()).toBe('Ph');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Enter');
    doc = await readDocument(page);
    expect(doc.atoms[ph]).toMatchObject({ element: 'C' });
    expect(doc.atoms[ph]?.label).toBeUndefined();
  } finally {
    await app.close();
  }
});

test('a double-click with Select opens the editor; with Bond it adds bonds and opens nothing (R2, S7)', async () => {
  const { app, page } = await openApp();
  try {
    const { doc, o } = await ethanolHovered(page);
    // Bond: two clicks on the oxygen sprout bonds, no editor.
    await page.getByTestId('tool-bond').click();
    await page.mouse.move(o.x, o.y);
    await page.mouse.dblclick(o.x, o.y);
    await expect(box(page)).toHaveCount(0);
    expect(atomIds(await readDocument(page)).length).toBeGreaterThan(atomIds(doc).length);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    expect(await readDocument(page)).toEqual(doc);
    // Select: the editor opens on the atom.
    await page.getByTestId('tool-select').click();
    await page.mouse.dblclick(o.x, o.y);
    await expect(box(page)).toBeVisible();
    expect(await box(page).innerText()).toBe('O');
    await page.keyboard.press('Escape');
    expect(await readDocument(page)).toEqual(doc);
  } finally {
    await app.close();
  }
});

test('Enter over an atom does nothing with the Erase tool', async () => {
  const { app, page } = await openApp();
  try {
    const { o } = await ethanolHovered(page);
    await page.getByTestId('tool-erase').click();
    await page.mouse.move(o.x, o.y);
    await page.keyboard.press('Enter');
    await expect(box(page)).toHaveCount(0);
  } finally {
    await app.close();
  }
});
