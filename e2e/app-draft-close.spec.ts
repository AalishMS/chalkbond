// F4a (SPEC-app-shell.md R17; editor R48) with tabs (TB20; R35, SS10, T17): a label or text still
// being typed when the window is closed, or when main hands over a file to open (F11, F12), is
// finished through its own commit path first. The close never asks (no unkept tab, R51): the file
// tab's file and the store hold the committed drawing; an opened file goes to a new tab and the
// edited tab keeps its label. An IME composition keeps the box open until `compositionend`. The
// name field's text is not an edit.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { parse, serialize, type AtomId, type Doc, type TextObject } from '../src/core/doc-model';
import { dialogLog, openFrom, saveTo } from './export-steps';
import {
  canvasPoint,
  expectNoNetwork,
  goldenDoc,
  loadDocument,
  readDocument,
  readTabs,
} from './harness';
import { activeTabOf, launchIn, recordDoc } from './session-steps';
import { windowTitle } from './relaunch';

const box = (page: Page) => page.getByTestId('textbox-edit');
const hint = (page: Page) => page.getByTestId('statusbar').getByRole('status');
const elements = (d: Doc | null): string[] =>
  Object.values(d?.atoms ?? {})
    .map((a) => a.element)
    .sort();
const texts = (d: Doc | null): TextObject[] =>
  Object.values(d?.objects ?? {}).filter((o): o is TextObject => o.type === 'text');
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
let userData: string;
let ethanol: string;
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chalkbond-draft-'));
  userData = mkdtempSync(join(tmpdir(), 'chalkbond-draft-data-'));
  ethanol = join(dir, 'ethanol.chalk');
  writeFileSync(ethanol, serialize(goldenDoc('ethanol')));
});
/** The app a test launched and has not closed yet: closed after a failure, before the clean-up. */
let running: ElectronApplication | null = null;
test.afterEach(async () => {
  await running?.close().catch(() => undefined);
  running = null;
  rmSync(dir, { recursive: true, force: true });
  rmSync(userData, { recursive: true, force: true });
});
const launch = async (...args: Parameters<typeof launchIn>) => {
  const opened = await launchIn(...args);
  running = opened.app;
  return opened;
};

/** Ctrl+O of ethanol.chalk (the first scripted answer): it opens in the empty Untitled tab. */
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

/** A native close, awaited until the app has exited (it must not ask anything). */
async function closeAndWait(app: ElectronApplication): Promise<void> {
  await expectNoNetwork(app);
  const exited = app.waitForEvent('close');
  await nativeClose(app);
  await exited;
  if (running === app) running = null;
}

test('a label being typed at a native close of a file tab: committed, written to the file and the store, no box', async () => {
  const { app, page } = await launch(userData, { dialogs: [openFrom(ethanol)] });
  await openEthanol(app, page);
  const tabId = (await activeTabOf(page)).id;
  await typeLabel(page, 'NH2');
  await closeAndWait(app);
  // L3: NH2 is an N. SS10: the close wrote the record and the file (AS1) before N5.
  expect(elements(fileDoc(ethanol))).toEqual(['C', 'C', 'N']);
  expect(elements(recordDoc(userData, tabId))).toEqual(['C', 'C', 'N']);
});

test('an Untitled drawing with a label being typed at a native close: the committed label is in the store, no box', async () => {
  const { app, page } = await launch(userData, { dialogs: [] });
  await loadDocument(page, goldenDoc('ethanol'));
  await expect.poll(async () => elements(await readDocument(page))).toEqual(['C', 'C', 'O']);
  const tabId = (await activeTabOf(page)).id;
  await typeLabel(page, 'Cl');
  await closeAndWait(app);
  expect(elements(recordDoc(userData, tabId))).toEqual(['C', 'C', 'Cl']);
  const again = await launchIn(userData, { dialogs: [] });
  try {
    await expect
      .poll(async () => elements(await readDocument(again.page)))
      .toEqual(['C', 'C', 'Cl']);
    expect(await dialogLog(again.app)).toEqual([]);
  } finally {
    await again.app.close();
  }
});

test('an existing text being edited at a native close is committed (T4 path) and written to its file', async () => {
  const file = join(dir, 'note.chalk');
  const { app, page } = await launch(userData, { dialogs: [saveTo(file)] });
  await page.getByTestId('tool-text').click();
  const p = await canvasPoint(page, { x: -5, y: -3 });
  await page.mouse.click(p.x, p.y);
  await expect(box(page)).toBeFocused();
  await page.keyboard.type('dilute');
  await page.keyboard.press('Enter');
  await expect(box(page)).toHaveCount(0);
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Control+s'); // Untitled: Save as, which binds the tab
  await expect.poll(() => windowTitle(app)).toBe('note - Chalkbond');

  // Reopen the stored text, type at its end, and close without finishing.
  const t = texts(await readDocument(page))[0];
  const at = await canvasPoint(page, t?.at ?? { x: 0, y: 0 });
  await page.getByTestId('tool-text').click();
  await page.mouse.click(at.x + 20, at.y);
  await expect(box(page)).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.type(' H2SO4');
  await closeAndWait(app);
  // Committed through T4 as a click elsewhere would: typed after stored (explicit) characters,
  // the new ones inherit `explicit` (T2) and stay as typed.
  expect(scripts(texts(fileDoc(file))[0])).toBe('dilute H2SO4');
});

test('main hands over a file (open event) while a label is typed: finished, then the file opens in a new tab', async () => {
  const toluene = join(dir, 'toluene.chalk');
  writeFileSync(toluene, serialize(goldenDoc('toluene')));
  const { app, page } = await launch(userData, {
    dialogs: [openFrom(ethanol), openFrom(toluene)],
  });
  try {
    await openEthanol(app, page);
    // An opaque ref from main's registry (the page never names a path), as F11 / F12 hand over.
    const ref = await page.evaluate(() => window.chalkbond.chooseOpen());
    // A ref, not T17's `{ focus }`: no tab is bound to toluene.chalk.
    expect(ref !== null && 'name' in ref ? ref.name : null).toBe('toluene.chalk');
    await typeLabel(page, 'Cl');
    await app.evaluate(({ BrowserWindow }, r) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('main:event', { type: 'open', ref: r });
    }, ref);
    await expect.poll(() => windowTitle(app)).toBe('toluene - Chalkbond');
    await expect(box(page)).toHaveCount(0);
    expect((await readDocument(page)).atoms).toEqual(goldenDoc('toluene').atoms);
    expect((await readTabs(page)).map((t) => t.label)).toEqual(['ethanol', 'toluene']);
    // The switch wrote the edited tab's file (AS2: at once on a switch).
    expect(elements(fileDoc(ethanol))).toEqual(['C', 'C', 'Cl']);
    expect((await dialogLog(app)).map((d) => d.method)).toEqual([
      'showOpenDialog',
      'showOpenDialog',
    ]);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('IME: a native close during a composition waits for compositionend, then commits and closes', async () => {
  const { app, page } = await launch(userData, { dialogs: [openFrom(ethanol)] });
  let closed = false;
  try {
    await openEthanol(app, page);
    await typeLabel(page, '');
    // A composition edits the DOM only; the model does not have it yet.
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="textbox-edit"]') as HTMLElement;
      el.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
      el.textContent = 'Br';
    });
    const exited = app.waitForEvent('close');
    await nativeClose(app);
    // The host blurred the box (F4a ran) but the commit waits: the window stays, the box stays.
    await expect
      .poll(() =>
        page.evaluate(
          () => document.activeElement !== document.querySelector('[data-testid="textbox-edit"]'),
        ),
      )
      .toBe(true);
    await expect(box(page)).toHaveText('Br');
    expect(elements(await readDocument(page))).toEqual(['C', 'C', 'O']);
    await expectNoNetwork(app);

    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="textbox-edit"]') as HTMLElement;
      el.dispatchEvent(new CompositionEvent('compositionend', { data: 'Br' }));
    });
    await exited;
    closed = true;
    expect(elements(fileDoc(ethanol))).toEqual(['Br', 'C', 'C']);
  } finally {
    if (!closed) await app.close();
  }
});

test('text typed in the name field is not a drawing edit: a clean file tab closes at once, its file untouched', async () => {
  const { app, page } = await launch(userData, { dialogs: [openFrom(ethanol)] });
  await openEthanol(app, page);
  const input = page.getByTestId('namefield-input');
  await input.click();
  await input.fill('benzene');
  await closeAndWait(app);
  expect(readFileSync(ethanol, 'utf8')).toBe(serialize(goldenDoc('ethanol')));
});
