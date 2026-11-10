import { expect, test, type Page } from '@playwright/test';
import type { Doc, TextObject } from '../src/core/doc-model';
import { canvasPoint, openApp, readDocument } from './harness';

type Pt = { x: number; y: number };

const box = (page: Page) => page.getByTestId('textbox-edit');
const hint = (page: Page) => page.getByTestId('statusbar').getByRole('status');
const texts = (d: Doc): TextObject[] =>
  Object.values(d.objects).filter((o): o is TextObject => o.type === 'text');
const plainOf = (t: TextObject | undefined): string => (t?.runs ?? []).map((r) => r.text).join('');
const scripts = (t: TextObject | undefined): string =>
  (t?.runs ?? [])
    .map((r) => (r.script === undefined ? r.text : `${r.script}(${r.text})`))
    .join('|');

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

/** Text tool, click at BLU `blu`: the editor is open and focused. */
async function openNewText(page: Page, blu: Pt = { x: -5, y: -3 }): Promise<Pt> {
  await page.getByTestId('tool-text').click();
  const p = await canvasPoint(page, blu);
  await page.mouse.click(p.x, p.y);
  await expect(box(page)).toBeFocused();
  return p;
}

/** Commits what is typed with Enter and returns the document. */
async function finish(page: Page): Promise<Doc> {
  await page.keyboard.press('Enter');
  await expect(box(page)).toHaveCount(0);
  return readDocument(page);
}

const history = (page: Page) => ({
  undo: page.getByTestId('undo'),
  redo: page.getByTestId('redo'),
});

test('type conc. H2SO4, 170, press the degree button, type C, Enter: subscripts appear on finish (T1, T2, T4)', async () => {
  const { app, page } = await openApp();
  try {
    await openNewText(page);
    await expect(hint(page)).toHaveText(
      'Enter finishes. Shift+Enter starts a new line. Formulas like H2SO4 get their subscripts when you finish.',
    );
    await page.keyboard.type('conc. H2SO4, 170 ');
    // Plain while typing: no subscripts yet, no markup.
    expect(await editorShape(page)).toBe('t:conc. H2SO4, 170 ');
    await page.getByTestId('txt-deg').click();
    await expect(box(page)).toBeFocused();
    await page.keyboard.type('C');
    expect(await editorShape(page)).toBe('t:conc. H2SO4, 170 °C');
    const doc = await finish(page);
    expect(texts(doc)).toHaveLength(1);
    expect(scripts(texts(doc)[0])).toBe('conc. H|sub(2)|SO|sub(4)|, 170 °C');
    // Drawn: the part holds the text.
    const part = page.locator(`[data-key="obj:${texts(doc)[0]?.id}"]`);
    await expect(part).toContainText('conc. H');
    // One undo step: the text is gone, the next undo has nothing.
    await page.keyboard.press('Control+z');
    expect(texts(await readDocument(page))).toHaveLength(0);
    await expect(history(page).undo).toHaveAttribute('aria-disabled', 'true');
  } finally {
    await app.close();
  }
});

test('reopening with Select double-click shows the stored runs with real subscripts, unchanged is no step', async () => {
  const { app, page } = await openApp();
  try {
    const p = await openNewText(page);
    await page.keyboard.type('conc. H2SO4');
    const doc = await finish(page);
    await page.getByTestId('tool-select').click();
    await page.mouse.dblclick(p.x + 30, p.y);
    await expect(box(page)).toBeFocused();
    expect(await editorShape(page)).toBe(
      't:conc. H|span[data-script=sub]:2|t:SO|span[data-script=sub]:4',
    );
    await expect(box(page).locator('span[data-script="sub"]').first()).toHaveText('2');
    expect(await box(page).innerText()).not.toMatch(/[_^{}]/);
    await page.keyboard.press('Enter');
    await expect(box(page)).toHaveCount(0);
    // No step: still one undo (the add), the document is the same.
    expect(JSON.stringify(await readDocument(page))).toBe(JSON.stringify(doc));
    await page.keyboard.press('Control+z');
    expect(texts(await readDocument(page))).toHaveLength(0);
    await expect(history(page).undo).toHaveAttribute('aria-disabled', 'true');
  } finally {
    await app.close();
  }
});

test('x2 on a selection is explicit: toggling twice round-trips; a plain 2 stays plain', async () => {
  const { app, page } = await openApp();
  try {
    const p = await openNewText(page);
    await page.keyboard.type('CO2 and H2SO4');
    await finish(page);
    await page.getByTestId('tool-select').click();
    await page.mouse.dblclick(p.x + 30, p.y);
    await expect(box(page)).toBeFocused();
    // The 4 is a subscript: select just it (End, Shift+Left) and press x2 twice.
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(page.getByTestId('txt-sub')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('txt-sub').click();
    await expect(page.getByTestId('txt-sub')).toHaveAttribute('aria-pressed', 'false');
    expect(await editorShape(page)).toBe(
      't:CO|span[data-script=sub]:2|t: and H|span[data-script=sub]:2|t:SO4',
    );
    await page.getByTestId('txt-sub').click();
    expect(await editorShape(page)).toBe(
      't:CO|span[data-script=sub]:2|t: and H|span[data-script=sub]:2|t:SO|span[data-script=sub]:4',
    );
    // Make the 2 of CO2 plain on purpose: it stays plain after finishing.
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.getByTestId('txt-sub').click();
    const doc = await finish(page);
    expect(scripts(texts(doc)[0])).toBe('CO2 and H|sub(2)|SO|sub(4)');
  } finally {
    await app.close();
  }
});

test('typing, Backspace in the middle, Shift+arrow selection with x2, Shift+Enter, Ctrl+Z inside', async () => {
  const { app, page } = await openApp();
  try {
    await openNewText(page);
    await page.keyboard.type('abcd');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Backspace');
    expect(await editorShape(page)).toBe('t:acd');
    // Shift+arrow selects; x2 makes it a subscript.
    await page.keyboard.press('Shift+ArrowRight');
    await page.getByTestId('txt-sub').click();
    expect(await editorShape(page)).toBe('t:a|span[data-script=sub]:c|t:d');
    await expect(page.getByTestId('txt-sub')).toHaveAttribute('aria-pressed', 'true');
    // Shift+Enter breaks the line; Enter does not.
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('x');
    expect(await box(page).innerText()).toBe('acd\nx');
    // The undo and redo buttons are disabled; Ctrl+Z is local: it undoes the typing, not a step.
    await expect(history(page).undo).toHaveAttribute('aria-disabled', 'true');
    await expect(history(page).redo).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Control+z');
    expect(await box(page).innerText()).toBe('acd\n');
    await page.keyboard.press('Control+y');
    expect(await box(page).innerText()).toBe('acd\nx');
    const doc = await finish(page);
    expect(plainOf(texts(doc)[0])).toBe('acd\nx');
    expect(texts(doc)).toHaveLength(1);
  } finally {
    await app.close();
  }
});

test('the insert buttons put plain text at the caret; the bar and the focus stay', async () => {
  const { app, page } = await openApp();
  try {
    await openNewText(page);
    for (const id of ['txt-delta', 'txt-hv', 'txt-deg', 'txt-arrow']) {
      await page.getByTestId(id).click();
      await expect(box(page)).toBeFocused();
    }
    expect(await editorShape(page)).toBe('t:Δhν°→');
    const doc = await finish(page);
    expect(plainOf(texts(doc)[0])).toBe('Δhν°→');
  } finally {
    await app.close();
  }
});

test('B and I toggle for the whole text and show pressed; K3 shortcuts', async () => {
  const { app, page } = await openApp();
  try {
    await openNewText(page);
    await page.keyboard.type('Hello');
    await page.getByTestId('txt-bold').click();
    await expect(page.getByTestId('txt-bold')).toHaveAttribute('aria-pressed', 'true');
    await expect(box(page)).toHaveCSS('font-weight', '700');
    await page.keyboard.press('Control+i');
    await expect(page.getByTestId('txt-italic')).toHaveAttribute('aria-pressed', 'true');
    await expect(box(page)).toHaveCSS('font-style', 'italic');
    await page.keyboard.press('Control+Shift+d');
    await page.keyboard.press('Control+Shift+h');
    expect(await editorShape(page)).toBe('t:HelloΔhν');
    const doc = await finish(page);
    const t = texts(doc)[0];
    expect(t?.runs.every((r) => r.bold === true && r.italic === true)).toBe(true);
    // Reopened: B and I are shown pressed.
    await page.getByTestId('tool-text').click();
    const p = await canvasPoint(page, t?.at ?? { x: 0, y: 0 });
    await page.mouse.click(p.x + 20, p.y);
    await expect(box(page)).toBeFocused();
    await expect(page.getByTestId('txt-bold')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('txt-italic')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
  } finally {
    await app.close();
  }
});

test('Esc cancels, an empty text is never created, clicking elsewhere commits', async () => {
  const { app, page } = await openApp();
  try {
    await openNewText(page);
    await page.keyboard.type('gone');
    await page.keyboard.press('Escape');
    await expect(box(page)).toHaveCount(0);
    expect(texts(await readDocument(page))).toHaveLength(0);
    await expect(history(page).undo).toHaveAttribute('aria-disabled', 'true');

    // Empty: Enter adds nothing.
    await openNewText(page);
    await page.keyboard.press('Enter');
    await expect(box(page)).toHaveCount(0);
    expect(texts(await readDocument(page))).toHaveLength(0);

    // A click elsewhere on the canvas commits.
    await openNewText(page, { x: -5, y: -3 });
    await page.keyboard.type('kept');
    const away = await canvasPoint(page, { x: 5, y: 3 });
    await page.mouse.click(away.x, away.y);
    await expect(box(page)).toHaveCount(0);
    expect(plainOf(texts(await readDocument(page))[0])).toBe('kept');
  } finally {
    await app.close();
  }
});

test('Esc on a reopened text restores it; emptying it deletes it', async () => {
  const { app, page } = await openApp();
  try {
    const p = await openNewText(page);
    await page.keyboard.type('heat');
    const doc = await finish(page);
    await page.getByTestId('tool-text').click();
    await page.mouse.click(p.x + 15, p.y);
    await expect(box(page)).toBeFocused();
    await page.keyboard.type(' more');
    await page.keyboard.press('Escape');
    expect(JSON.stringify(await readDocument(page))).toBe(JSON.stringify(doc));
    // Open again, select all, delete, Enter.
    await page.mouse.click(p.x + 15, p.y);
    await expect(box(page)).toBeFocused();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    await expect(box(page)).toHaveCount(0);
    expect(texts(await readDocument(page))).toHaveLength(0);
  } finally {
    await app.close();
  }
});

test('a paste is plain text, whatever the clipboard holds', async () => {
  const { app, page } = await openApp();
  try {
    await openNewText(page);
    // A real clipboard on Windows reports its own text for rich content, so the paste event is
    // sent with both flavours: the box must take only `text/plain`.
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="textbox-edit"]');
      const data = new DataTransfer();
      data.setData('text/plain', 'H2O plain');
      data.setData('text/html', '<b style="color:red">rich</b> H<sub>2</sub>O');
      el?.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
    expect(await editorShape(page)).toBe('t:H2O plain');
    expect(await box(page).innerHTML()).not.toContain('<b');
    const doc = await finish(page);
    expect(scripts(texts(doc)[0])).toBe('H|sub(2)|O plain');
  } finally {
    await app.close();
  }
});

test('WYSIWYG: the box shows the text where and as wide as the drawn text will be', async () => {
  const { app, page } = await openApp();
  try {
    const p = await openNewText(page);
    await page.keyboard.type('Hello world');
    const edit = await box(page).boundingBox();
    if (!edit) throw new Error('no box');
    // Left edge: the text starts at the press point (8 px padding inside the outline).
    expect(Math.abs(edit.x + 8 - p.x)).toBeLessThan(1.5);
    const doc = await finish(page);
    const part = page.locator(`[data-key="obj:${texts(doc)[0]?.id}"]`);
    const drawn = await part.boundingBox();
    if (!drawn) throw new Error('no part box');
    expect(Math.abs(drawn.x - p.x)).toBeLessThan(2);
    // Width of the text: box minus padding, against the drawn ink.
    expect(Math.abs(edit.width - 16 - drawn.width)).toBeLessThan(3);
    // Vertically the first line stays centred on the press point.
    expect(Math.abs(drawn.y + drawn.height / 2 - p.y)).toBeLessThan(4);
  } finally {
    await app.close();
  }
});
