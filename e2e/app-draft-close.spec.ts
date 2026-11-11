// F4a (SPEC-app-shell.md R17; editor R48): a label or text still being typed when the window is
// closed, or when main hands over a file to open (F11, F12), is finished through its own commit
// path first, so the unsaved-changes prompt asks and Save writes the newer drawing. An IME
// composition keeps the box open until `compositionend`. The name field's text is not an edit.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { parse, serialize, type AtomId, type Doc, type TextObject } from '../src/core/doc-model';
import { dialogLog, openFrom, saveTo } from './export-steps';
import { canvasPoint, goldenDoc, openApp, readDocument } from './harness';
import { windowTitle } from './relaunch';

const box = (page: Page) => page.getByTestId('textbox-edit');
const hint = (page: Page) => page.getByTestId('statusbar').getByRole('status');
const SAVE = { response: 0 };
const CANCEL = { response: 2 };
const saveChanges = (name: string) => ({
  type: 'warning',
  title: 'Chalkbond',
  message: `Do you want to save changes to “${name}”?`,
  detail: "If you don't save, your changes will be lost.",
  buttons: ['Save', "Don't save", 'Cancel'],
  defaultId: 0,
  cancelId: 2,
  noLink: true,
});
const elements = (d: Doc): string[] =>
  Object.values(d.atoms)
    .map((a) => a.element)
    .sort();
const texts = (d: Doc): TextObject[] =>
  Object.values(d.objects).filter((o): o is TextObject => o.type === 'text');
const scripts = (t: TextObject | undefined): string =>
  (t?.runs ?? [])
    .map((r) => (r.script === undefined ? r.text : `${r.script}(${r.text})`))
    .join('|');
const fileDoc = (file: string): Doc => {
  const parsed = parse(readFileSync(file, 'utf8'));
  if (!parsed.ok) throw new Error(`not a drawing: ${file}`);
  return parsed.value;
};
/** A native close request (title-bar ×, Alt+F4): main prevents it and asks the renderer (F13). */
const nativeClose = (app: ElectronApplication): Promise<void> =>
  app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close();
  });

let dir: string;
let ethanol: string;
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chalkbond-draft-'));
  ethanol = join(dir, 'ethanol.chalk');
  writeFileSync(ethanol, serialize(goldenDoc('ethanol')));
});
test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Ctrl+O of ethanol.chalk (the first scripted answer): a clean, saved drawing. */
async function openEthanol(app: ElectronApplication, page: Page): Promise<void> {
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Control+o');
  await expect.poll(() => windowTitle(app)).toBe('ethanol - Chalkbond');
}

/** The label editor on ethanol's oxygen (hover, Enter), with `text` typed and not finished. */
async function typeLabel(page: Page, text: string): Promise<void> {
  const doc = await readDocument(page);
  const o = Object.keys(doc.atoms).find((id) => doc.atoms[id as AtomId]?.element === 'O');
  const at = await canvasPoint(page, doc.atoms[o as AtomId] as { x: number; y: number });
  await page.getByTestId('canvas').focus();
  await page.mouse.move(at.x, at.y);
  await expect(hint(page)).toHaveText('Type O, N, Cl… to change this atom. Enter for any label.');
  await page.keyboard.press('Enter');
  await expect(box(page)).toBeFocused();
  if (text !== '') await page.keyboard.type(text);
}

test('a label being typed at a native close: the prompt asks; Cancel keeps it, Save writes it', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [openFrom(ethanol), CANCEL, SAVE] } });
  let closed = false;
  try {
    await openEthanol(app, page);
    await typeLabel(page, 'NH2');
    await nativeClose(app);
    await expect.poll(async () => (await dialogLog(app)).length).toBe(2);
    expect((await dialogLog(app))[1]?.options).toEqual(saveChanges('ethanol'));
    // Cancel: the label was committed (L3: NH2 is an N), the window stays, the drawing is dirty.
    await expect(box(page)).toHaveCount(0);
    expect(elements(await readDocument(page))).toEqual(['C', 'C', 'N']);
    await expect.poll(() => windowTitle(app)).toBe('*ethanol - Chalkbond');

    const exited = app.waitForEvent('close');
    await nativeClose(app);
    await exited;
    closed = true;
    expect(elements(fileDoc(ethanol))).toEqual(['C', 'C', 'N']);
  } finally {
    if (!closed) await app.close();
  }
});

test('an existing text being edited at a native close is committed (T4 path) and saved', async () => {
  const file = join(dir, 'note.chalk');
  const { app, page } = await openApp({ launch: { dialogs: [saveTo(file), CANCEL, SAVE] } });
  let closed = false;
  try {
    await page.getByTestId('tool-text').click();
    const p = await canvasPoint(page, { x: -5, y: -3 });
    await page.mouse.click(p.x, p.y);
    await expect(box(page)).toBeFocused();
    await page.keyboard.type('dilute');
    await page.keyboard.press('Enter');
    await expect(box(page)).toHaveCount(0);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+s');
    await expect.poll(() => windowTitle(app)).toBe('note - Chalkbond');

    // Reopen the stored text, type at its end, and close without finishing.
    const t = texts(await readDocument(page))[0];
    const at = await canvasPoint(page, t?.at ?? { x: 0, y: 0 });
    await page.getByTestId('tool-text').click();
    await page.mouse.click(at.x + 20, at.y);
    await expect(box(page)).toBeFocused();
    await page.keyboard.press('End');
    await page.keyboard.type(' H2SO4');
    await nativeClose(app);
    await expect.poll(async () => (await dialogLog(app)).length).toBe(2);
    expect((await dialogLog(app))[1]?.options).toEqual(saveChanges('note'));
    await expect(box(page)).toHaveCount(0);
    // Committed through T4 as a click elsewhere would: typed after stored (explicit) characters,
    // the new ones inherit `explicit` (T2) and stay as typed.
    expect(scripts(texts(await readDocument(page))[0])).toBe('dilute H2SO4');
    await expect.poll(() => windowTitle(app)).toBe('*note - Chalkbond');

    const exited = app.waitForEvent('close');
    await nativeClose(app);
    await exited;
    closed = true;
    expect(scripts(texts(fileDoc(file))[0])).toBe('dilute H2SO4');
  } finally {
    if (!closed) await app.close();
  }
});

test('main hands over a file (open event) while a label is typed: finished, then the prompt', async () => {
  const toluene = join(dir, 'toluene.chalk');
  writeFileSync(toluene, serialize(goldenDoc('toluene')));
  const { app, page } = await openApp({
    launch: { dialogs: [openFrom(ethanol), openFrom(toluene), CANCEL] },
  });
  try {
    await openEthanol(app, page);
    // An opaque ref from main's registry (the page never names a path), as F11 / F12 hand over.
    const ref = await page.evaluate(() => window.chalkbond.chooseOpen());
    expect(ref?.name).toBe('toluene.chalk');
    await typeLabel(page, 'Cl');
    await app.evaluate(({ BrowserWindow }, r) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('main:event', { type: 'open', ref: r });
    }, ref);
    await expect.poll(async () => (await dialogLog(app)).length).toBe(3);
    expect((await dialogLog(app))[2]?.options).toEqual(saveChanges('ethanol'));
    await expect(box(page)).toHaveCount(0);
    expect(elements(await readDocument(page))).toEqual(['C', 'C', 'Cl']);
    await expect.poll(() => windowTitle(app)).toBe('*ethanol - Chalkbond');
  } finally {
    await app.close();
  }
});

test('IME: a native close during a composition waits for compositionend, then commits and asks', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [openFrom(ethanol), CANCEL] } });
  try {
    await openEthanol(app, page);
    await typeLabel(page, '');
    // A composition edits the DOM only; the model does not have it yet.
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="textbox-edit"]') as HTMLElement;
      el.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
      el.textContent = 'Br';
    });
    await nativeClose(app);
    // The host blurred the box (F4a ran) but the commit waits: no prompt, the box stays.
    await expect
      .poll(() =>
        page.evaluate(
          () => document.activeElement !== document.querySelector('[data-testid="textbox-edit"]'),
        ),
      )
      .toBe(true);
    await expect(box(page)).toHaveText('Br');
    expect((await dialogLog(app)).length).toBe(1);
    expect(elements(await readDocument(page))).toEqual(['C', 'C', 'O']);

    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="textbox-edit"]') as HTMLElement;
      el.dispatchEvent(new CompositionEvent('compositionend', { data: 'Br' }));
    });
    await expect.poll(async () => (await dialogLog(app)).length).toBe(2);
    expect((await dialogLog(app))[1]?.options).toEqual(saveChanges('ethanol'));
    await expect(box(page)).toHaveCount(0);
    expect(elements(await readDocument(page))).toEqual(['Br', 'C', 'C']);
    await expect.poll(() => windowTitle(app)).toBe('*ethanol - Chalkbond');
  } finally {
    await app.close();
  }
});

test('text typed in the name field is not a drawing edit: a clean drawing closes at once', async () => {
  const { app, page } = await openApp({ launch: { dialogs: [openFrom(ethanol)] } });
  let closed = false;
  try {
    await openEthanol(app, page);
    const input = page.getByTestId('namefield-input');
    await input.click();
    await input.fill('benzene');
    const exited = app.waitForEvent('close');
    await nativeClose(app);
    await exited;
    closed = true;
    expect(readFileSync(ethanol, 'utf8')).toBe(serialize(goldenDoc('ethanol')));
  } finally {
    if (!closed) await app.close();
  }
});
