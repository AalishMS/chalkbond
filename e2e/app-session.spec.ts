// TB20 (SPEC-app-shell.md SS2-SS7, SS10, R35; RC5 / R24 / R25 as amended): the session store
// round trip with the built app, replacing A14's recovery file. A kill leaves the active tab's
// record; the relaunch with the same user-data folder restores the drawing with no box (asserted
// through the stubbed `dialog`, e2e/stub-dialogs.mjs). The launch's file opens after the restore;
// the old recovery folder is neither read nor deleted; the shutdown flush (`flush-session`), a gone
// renderer and a normal close keep the drawing. TB28 extends this file (several tabs, histories,
// views, damaged files, an unwritable store); the TB28 tests are at the end.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { drawingPayload, withPictureChunks } from '../src/core/clipboard-export';
import { serialize, type AtomId, type Doc } from '../src/core/doc-model';
import { dialogLog, openFrom, saveTo } from './export-steps';
import {
  activateTab,
  canvasPoint,
  expectNoNetwork,
  goldenDoc,
  heardNotices,
  insertName,
  openApp,
  openTab,
  readContentView,
  readDocument,
  readTabs,
  type ContentView,
} from './harness';
import {
  activeTabOf,
  addSteps,
  closeWindowForReal,
  countSteps,
  damagedNames,
  drawThenKill,
  expectRecorded,
  heldCount,
  holdStore,
  indexFile,
  kill,
  launchIn,
  lockSession,
  readIndex,
  recordDoc,
  recordFile,
  recordIds,
  sessionFolder,
  type HoldPoint,
} from './session-steps';
import { windowTitle } from './relaunch';

const elements = (d: Doc | null): string[] =>
  Object.values(d?.atoms ?? {})
    .map((a) => a.element)
    .sort();
const mainLog = (userData: string): string => {
  const file = join(userData, 'logs', 'main.log');
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
};

let userData: string;
let files: string;
test.beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'chalkbond-session-data-'));
  files = mkdtempSync(join(tmpdir(), 'chalkbond-session-files-'));
});
test.afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
  rmSync(files, { recursive: true, force: true });
});

test('SS7, R35: edit, 12 s, kill, relaunch with the same user data: the drawing is back with no box', async () => {
  const drawn = await drawThenKill(userData, 'ethanol');
  const { app, page } = await launchIn(userData, { dialogs: [] });
  try {
    await expect.poll(async () => (await readDocument(page)).atoms).toEqual(drawn.doc.atoms);
    expect(await readTabs(page)).toEqual([
      { id: drawn.tabId, label: 'Untitled', kind: 'untitled', active: true, marker: 'dot' },
    ]);
    await expect.poll(() => windowTitle(app)).toBe('*Untitled - Chalkbond');
    await expect(page.getByTestId('tab')).toHaveCount(1);
    await expect(page.getByTestId('canvas')).toBeFocused();
    expect(await dialogLog(app)).toEqual([]);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('SS7: two tabs, the second active, come back in order with the active tab after a kill', async () => {
  const first = await launchIn(userData);
  await insertName(first.page, 'ethanol');
  const a = await expectRecorded(first.page, userData);
  const b = await openTab(first.page);
  await insertName(first.page, 'benzene');
  await expectRecorded(first.page, userData);
  await kill(first.app);
  const { app, page } = await launchIn(userData, { dialogs: [] });
  try {
    await expect
      .poll(async () => (await readTabs(page)).map((t) => [t.id, t.label, t.active]))
      .toEqual([
        [a.tabId, 'Untitled', false],
        [b, 'Untitled 2', true],
      ]);
    expect(elements(await readDocument(page))).toEqual(Array(6).fill('C'));
    // The inactive tab's marker comes from the index before it is loaded (SS3).
    expect((await readTabs(page))[0]?.marker).toBe('dot');
    expect(await dialogLog(app)).toEqual([]);
  } finally {
    await app.close();
  }
});

test('SS7, F11: a .chalk on the relaunch command line opens in a new tab after the restore', async () => {
  const ethanol = join(files, 'ethanol.chalk');
  writeFileSync(ethanol, serialize(goldenDoc('ethanol')));
  const drawn = await drawThenKill(userData, 'benzene');
  const { app, page } = await launchIn(userData, { dialogs: [], extraArgs: [ethanol] });
  try {
    await expect.poll(() => windowTitle(app)).toBe('ethanol - Chalkbond');
    expect((await readDocument(page)).atoms).toEqual(goldenDoc('ethanol').atoms);
    expect((await readTabs(page)).map((t) => [t.id === drawn.tabId, t.label, t.active])).toEqual([
      [true, 'Untitled', false],
      [false, 'ethanol', true],
    ]);
    expect(await dialogLog(app)).toEqual([]);
  } finally {
    await app.close();
  }
});

test('F11: on a first run the command-line file opens in the empty Untitled tab, no box', async () => {
  const ethanol = join(files, 'ethanol.chalk');
  writeFileSync(ethanol, serialize(goldenDoc('ethanol')));
  const { app, page } = await launchIn(userData, { dialogs: [], extraArgs: [ethanol] });
  try {
    await expect.poll(() => windowTitle(app)).toBe('ethanol - Chalkbond');
    expect((await readDocument(page)).atoms).toEqual(goldenDoc('ethanol').atoms);
    expect((await readTabs(page)).map((t) => t.label)).toEqual(['ethanol']);
    expect(await dialogLog(app)).toEqual([]);
  } finally {
    await app.close();
  }
});

test('SS7, R35: the old recovery folder is neither read nor deleted; no box, an empty Untitled', async () => {
  const folder = join(userData, 'recovery');
  mkdirSync(folder, { recursive: true });
  const drawing = join(folder, 'drawing.chalk');
  const meta = join(folder, 'recovery.json');
  for (const text of [serialize(goldenDoc('ethanol')), 'PK garbage']) {
    writeFileSync(drawing, text);
    writeFileSync(meta, '{"name":"esterification.chalk"}');
    const { app, page } = await launchIn(userData, { dialogs: [] });
    try {
      await expect
        .poll(async () => (await readTabs(page)).map((t) => t.label))
        .toEqual(['Untitled']);
      expect(Object.keys((await readDocument(page)).atoms)).toEqual([]);
      expect(await dialogLog(app)).toEqual([]);
      expect(readFileSync(drawing, 'utf8')).toBe(text);
      expect(readFileSync(meta, 'utf8')).toBe('{"name":"esterification.chalk"}');
      expect(mainLog(userData)).not.toContain('Recovery');
    } finally {
      await app.close();
    }
  }
});

// Synthetic events only: they prove the guard's logic, not what Windows does at a real shutdown.
const emitQuerySessionEnd = (app: ElectronApplication): Promise<boolean> =>
  app.evaluate(({ BrowserWindow }) => {
    let wasPrevented = false;
    BrowserWindow.getAllWindows()[0]?.emit('query-session-end', {
      preventDefault: () => {
        wasPrevented = true;
      },
    });
    return wasPrevented;
  });

test('R24, R25: a cancelled shutdown (query-session-end only) writes the record within 1 s, prevents nothing; a later close shows no box', async () => {
  const { app, page } = await launchIn(userData, { dialogs: [] });
  await insertName(page, 'ethanol');
  const tabId = (await activeTabOf(page)).id;
  expect(await emitQuerySessionEnd(app)).toBe(false);
  await expect
    .poll(() => elements(recordDoc(userData, tabId)), { timeout: 1000 })
    .toEqual(['C', 'C', 'O']);
  expect(recordDoc(userData, tabId)?.atoms).toEqual((await readDocument(page)).atoms);
  // The shutdown was cancelled: an ordinary close asks nothing (R35) and keeps the drawing.
  await closeWindowForReal(app);
  const again = await launchIn(userData, { dialogs: [] });
  try {
    await expect
      .poll(async () => elements(await readDocument(again.page)))
      .toEqual(['C', 'C', 'O']);
    expect(await dialogLog(again.app)).toEqual([]);
  } finally {
    await again.app.close();
  }
});

test('R24: query-session-end then session-end, then the close: no box, the record stays', async () => {
  const { app, page } = await launchIn(userData, { dialogs: [] });
  await insertName(page, 'ethanol');
  const tabId = (await activeTabOf(page)).id;
  expect(await emitQuerySessionEnd(app)).toBe(false);
  await expect
    .poll(() => elements(recordDoc(userData, tabId)), { timeout: 1000 })
    .toEqual(['C', 'C', 'O']);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.emit('session-end', {});
  });
  // Windows then closes the window: no box (none is scripted), nothing removed.
  await closeWindowForReal(app);
  expect(elements(recordDoc(userData, tabId))).toEqual(['C', 'C', 'O']);
});

/** The label editor on the oxygen of an inserted ethanol (hover, Enter), `text` typed, unfinished. */
async function openLabelEditor(page: Page, text: string): Promise<void> {
  const doc = await readDocument(page);
  const o = Object.keys(doc.atoms).find((id) => doc.atoms[id as AtomId]?.element === 'O');
  const at = await canvasPoint(page, doc.atoms[o as AtomId] as { x: number; y: number });
  await page.getByTestId('canvas').focus();
  await page.mouse.move(at.x, at.y);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('textbox-edit')).toBeFocused();
  if (text !== '') await page.keyboard.type(text);
}

test('R25: a label typed but not confirmed is finished by the shutdown flush and is in the record within 1 s', async () => {
  const { app, page } = await launchIn(userData, { dialogs: [] });
  await insertName(page, 'ethanol');
  const tabId = (await activeTabOf(page)).id;
  await openLabelEditor(page, 'Cl');
  expect(await emitQuerySessionEnd(app)).toBe(false);
  await expect
    .poll(() => elements(recordDoc(userData, tabId)), { timeout: 1000 })
    .toEqual(['C', 'C', 'Cl']);
  await expect(page.getByTestId('textbox-edit')).toHaveCount(0);
  expect(elements(await readDocument(page))).toEqual(['C', 'C', 'Cl']);
  await expectNoNetwork(app);
  await app.close();
});

/**
 * An IME composition under way (DOM only, as in app-draft-close.spec.ts), optionally with a
 * synthetic `query-session-end`; then `compositionend`, then a click elsewhere (blur). Returns what
 * was observed at each step.
 */
async function composeThen(page: Page, app: ElectronApplication, shutdown: boolean) {
  await openLabelEditor(page, '');
  const tabId = (await activeTabOf(page)).id;
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="textbox-edit"]') as HTMLElement;
    el.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
    el.textContent = 'Br';
  });
  if (shutdown) {
    expect(await emitQuerySessionEnd(app)).toBe(false);
    // The committed drawing only: the draft is not kept (R25).
    await expect
      .poll(() => elements(recordDoc(userData, tabId)), { timeout: 1000 })
      .toEqual(['C', 'C', 'O']);
  }
  const edit = page.getByTestId('textbox-edit');
  const open = async (): Promise<[number, string | null]> => {
    const n = await edit.count();
    return [n, n === 0 ? null : await edit.textContent()];
  };
  const at = { composing: await open(), document: elements(await readDocument(page)) };
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="textbox-edit"]') as HTMLElement;
    el.dispatchEvent(new CompositionEvent('compositionend', { data: 'Br' }));
  });
  const afterEnd = { box: await open(), document: elements(await readDocument(page)) };
  await edit.evaluate((el) => (el as HTMLElement).blur());
  await expect(edit).toHaveCount(0);
  return { at, afterEnd, committed: elements(await readDocument(page)) };
}

test('R25: during an IME composition the flush writes the committed drawing at once, leaves the editor alone, and compositionend behaves as without a shutdown', async () => {
  const first = await launchIn(userData, { dialogs: [] });
  await insertName(first.page, 'ethanol');
  const withShutdown = await composeThen(first.page, first.app, true);
  await first.app.close();
  rmSync(userData, { recursive: true, force: true });
  mkdirSync(userData, { recursive: true });
  const second = await launchIn(userData, { dialogs: [] });
  await insertName(second.page, 'ethanol');
  const without = await composeThen(second.page, second.app, false);
  await expectNoNetwork(second.app);
  await second.app.close();
  expect(withShutdown.at.composing).toEqual([1, 'Br']);
  expect(withShutdown.at.document).toEqual(['C', 'C', 'O']);
  expect(withShutdown).toEqual(without);
});

test('R35: a normal close never asks; the next launch has the drawing back', async () => {
  const { app, page } = await launchIn(userData, { dialogs: [] });
  await insertName(page, 'ethanol');
  const drawn = await readDocument(page);
  await closeWindowForReal(app);
  const again = await launchIn(userData, { dialogs: [] });
  try {
    await expect.poll(async () => (await readDocument(again.page)).atoms).toEqual(drawn.atoms);
    expect(await dialogLog(again.app)).toEqual([]);
  } finally {
    await again.app.close();
  }
});

test('a gone renderer: the window closes without a box and the record stays', async () => {
  const { app, page } = await launchIn(userData, { dialogs: [] });
  await insertName(page, 'ethanol');
  const { tabId } = await expectRecorded(page, userData);
  await expectNoNetwork(app);
  await app.evaluate(
    ({ BrowserWindow }) =>
      new Promise<void>((resolve) => {
        const contents = BrowserWindow.getAllWindows()[0]?.webContents;
        contents?.once('render-process-gone', () => resolve());
        contents?.forcefullyCrashRenderer();
      }),
  );
  await closeWindowForReal(app);
  expect(elements(recordDoc(userData, tabId))).toEqual(['C', 'C', 'O']);
});

test('F6, SS7: Ctrl+S on Untitled is Save as and binds the tab; after a relaunch it is that file', async () => {
  const out = join(files, 'saved.chalk');
  const { app, page } = await launchIn(userData, {
    dialogs: [{ canceled: false, filePath: out }],
  });
  await insertName(page, 'ethanol');
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Control+S');
  await expect.poll(() => windowTitle(app)).toBe('saved - Chalkbond');
  expect(readFileSync(out, 'utf8')).toBe(serialize(await readDocument(page)));
  await closeWindowForReal(app);
  const again = await launchIn(userData, { dialogs: [] });
  try {
    await expect
      .poll(async () => (await readTabs(again.page)).map((t) => [t.label, t.kind, t.marker]))
      .toEqual([['saved', 'chalk', 'none']]);
    await expect.poll(() => windowTitle(again.app)).toBe('saved - Chalkbond');
    expect(elements(await readDocument(again.page))).toEqual(['C', 'C', 'O']);
    expect(await dialogLog(again.app)).toEqual([]);
    await expectNoNetwork(again.app);
  } finally {
    await again.app.close();
  }
});

// ---- TB28: three tabs, history and views; item (5); damaged files; R51 -------------------------

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const SAVE_BOX = (name: string) => ({
  method: 'showMessageBox',
  options: {
    type: 'warning',
    title: 'Chalkbond',
    message: `Do you want to save “${name}”?`,
    detail: "If you don't save, your drawing will be lost.",
    buttons: ['Save', "Don't save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  },
});
const DAMAGED_NOTICE = { kind: 'error', text: 'A drawing kept by Chalkbond could not be read.' };
const canvasOf = (page: Page) => page.getByTestId('canvas');

interface Snapshot {
  doc: Doc;
  view: ContentView;
}
const snapshot = async (page: Page): Promise<Snapshot> => ({
  doc: await readDocument(page),
  view: await readContentView(page),
});

test('SC20, SS1, SS7, SS3: three tabs of three kinds with views and 100 undo steps each, a kill, a relaunch: all back; the dots come from the index', async () => {
  const lesson = join(files, 'lesson.chalk');
  const picture = join(files, 'toluene.png');
  writeFileSync(
    picture,
    withPictureChunks(PIXEL, { dpi: 300, payload: drawingPayload(goldenDoc('toluene')) }),
  );
  // R35: the recovery folder of earlier builds sits beside the session and is never touched.
  const oldFolder = join(userData, 'recovery');
  mkdirSync(oldFolder, { recursive: true });
  const oldDrawing = join(oldFolder, 'drawing.chalk');
  const oldMeta = join(oldFolder, 'recovery.json');
  writeFileSync(oldDrawing, serialize(goldenDoc('ethanol')));
  writeFileSync(oldMeta, '{"name":"esterification.chalk"}');

  const first = await launchIn(userData, { dialogs: [saveTo(lesson), openFrom(picture)] });
  const { page } = first;
  const want: Record<string, Snapshot> = {};
  let ids: string[] = [];
  try {
    // Tab 1, an Untitled with content: benzene and 105 more steps, zoomed in once.
    await insertName(page, 'benzene');
    await addSteps(page, 105);
    await canvasOf(page).focus();
    await page.keyboard.press('Control+=');
    const t1 = (await activeTabOf(page)).id;
    want[t1] = await snapshot(page);
    // Tab 2, a named file: ethanol, 105 steps, Save as, zoomed out once.
    const t2 = await openTab(page);
    await insertName(page, 'ethanol');
    await addSteps(page, 105);
    await canvasOf(page).focus();
    await page.keyboard.press('Control+s');
    await expect.poll(async () => (await activeTabOf(page)).kind).toBe('chalk');
    await page.keyboard.press('Control+-');
    want[t2] = await snapshot(page);
    // Tab 3, a picture drawing: opened, 105 steps, zoomed in twice.
    await page.keyboard.press('Control+o');
    await expect.poll(async () => (await readTabs(page)).length).toBe(3);
    const t3 = (await activeTabOf(page)).id;
    expect((await activeTabOf(page)).kind).toBe('picture');
    await addSteps(page, 105);
    await canvasOf(page).focus();
    await page.keyboard.press('Control+=');
    await page.keyboard.press('Control+=');
    want[t3] = await snapshot(page);
    // Back to tab 2: the active tab at the kill is neither the first nor the last.
    await page.keyboard.press('Control+2');
    await expect.poll(async () => (await activeTabOf(page)).id).toBe(t2);
    ids = [t1, t2, t3];
    expect(new Set(ids.map((id) => want[id]?.view.k)).size).toBe(3);

    // SS4, AS2: within 12 s every record holds its drawing, the index its views, the file its text.
    await expect
      .poll(
        () =>
          ids.every((id) => isDeepStrictEqual(recordDoc(userData, id)?.atoms, want[id]?.doc.atoms)),
        { timeout: 12_000 },
      )
      .toBe(true);
    await expect
      .poll(() => readFileSync(lesson, 'utf8'), { timeout: 12_000 })
      .toBe(serialize(want[t2]?.doc as Doc));
    await expect
      .poll(
        () => readIndex(userData)?.tabs.map((t) => [t.id, t.kind, t.unsaved, t.view !== null]),
        {
          timeout: 12_000,
        },
      )
      .toEqual([
        [t1, 'untitled', true, true],
        [t2, 'chalk', false, true],
        [t3, 'picture', true, true],
      ]);
    expect(readIndex(userData)?.active).toBe(t2);
  } catch (error) {
    await first.app.close();
    throw error;
  }
  await kill(first.app);

  const { app, page: again } = await launchIn(userData, { dialogs: [] });
  try {
    const [t1, t2, t3] = ids as [string, string, string];
    // SS3, SS7: the dots of the tabs not loaded come from the index; only the active tab is read.
    await expect
      .poll(async () => (await readTabs(again)).map((t) => [t.id, t.kind, t.active, t.marker]))
      .toEqual([
        [t1, 'untitled', false, 'dot'],
        [t2, 'chalk', true, 'none'],
        [t3, 'picture', false, 'dot'],
      ]);
    const check = async (id: string): Promise<void> => {
      const wanted = want[id] as Snapshot;
      await expect
        .poll(async () => serialize(await readDocument(again)))
        .toBe(serialize(wanted.doc));
      // The view is stored as zoom and the drawing point at the centre: the translation round-trips
      // through that point, so it may differ in the last bits.
      const view = await readContentView(again);
      expect(view.k).toBe(wanted.view.k);
      expect(view.e).toBeCloseTo(wanted.view.e, 6);
      expect(view.f).toBeCloseTo(wanted.view.f, 6);
      // The history comes back with it: no redo steps, the last 100 undo steps (105 were made).
      expect(await countSteps(again)).toEqual({ redo: 0, undo: 100 });
    };
    await check(t2);
    for (const id of [t1, t3]) {
      await activateTab(again, id);
      await expect.poll(async () => (await activeTabOf(again)).id).toBe(id);
      await check(id);
    }
    expect(await dialogLog(app)).toEqual([]);
    expect(readFileSync(oldDrawing, 'utf8')).toBe(serialize(goldenDoc('ethanol')));
    expect(readFileSync(oldMeta, 'utf8')).toBe('{"name":"esterification.chalk"}');
    expect(mainLog(userData)).not.toContain('Recovery');
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

/** One file tab (ethanol saved as `file`), the main hold armed at `point`, one edit made and held. */
async function holdAfterEdit(point: HoldPoint, file: string) {
  const { app, page } = await launchIn(userData, { dialogs: [saveTo(file)] });
  try {
    await insertName(page, 'ethanol');
    await canvasOf(page).focus();
    await page.keyboard.press('Control+s');
    await expect.poll(async () => (await activeTabOf(page)).kind).toBe('chalk');
    const { tabId, doc: before } = await expectRecorded(page, userData);
    await expect
      .poll(() => readIndex(userData)?.tabs[0]?.written ?? null)
      .toBe(sha256(readFileSync(file)));
    await holdStore(app, point, tabId);
    await insertName(page, 'benzene');
    const edited = await readDocument(page);
    // The chain stops at the point: the record is on disk, or the file has the new text.
    await expect.poll(() => heldCount(app), { timeout: 12_000 }).toBe(1);
    return { app, tabId, before, edited };
  } catch (error) {
    await app.close();
    throw error;
  }
}

/** After the relaunch: one file tab, the edited drawing, no conflict, no box; the file is that drawing. */
async function expectNoConflict(file: string, edited: Doc): Promise<void> {
  const { app, page } = await launchIn(userData, { dialogs: [] });
  try {
    await expect
      .poll(async () => (await readTabs(page)).map((t) => [t.label, t.kind]))
      .toEqual([['lesson', 'chalk']]);
    await expect.poll(async () => serialize(await readDocument(page))).toBe(serialize(edited));
    // Any unwritten text is written after the restart (SS5); nothing says "changed outside".
    await expect
      .poll(() => readFileSync(file, 'utf8'), { timeout: 12_000 })
      .toBe(serialize(edited));
    await expect.poll(async () => (await readTabs(page))[0]?.marker).toBe('none');
    expect((await readTabs(page)).length).toBe(1);
    expect(await heardNotices(page)).toEqual([]);
    expect(await dialogLog(app)).toEqual([]);
    await expect
      .poll(() => readIndex(userData)?.tabs[0])
      .toMatchObject({
        fileHash: sha256(readFileSync(file)),
        written: sha256(readFileSync(file)),
        writing: null,
      });
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
}

test('item (5): killed after the record and before the file write, the file keeps the written text, is `same`, and gets the record after the restart', async () => {
  const file = join(files, 'lesson.chalk');
  const held = await holdAfterEdit('record-written', file);
  // The record has the edit; the file does not (the power cut came between the two).
  expect(recordDoc(userData, held.tabId)?.atoms).toEqual(held.edited.atoms);
  expect(readFileSync(file, 'utf8')).toBe(serialize(held.before));
  expect(readIndex(userData)?.tabs[0]?.writing).toBeNull();
  await kill(held.app);
  await expectNoConflict(file, held.edited);
});

test('item (5): killed after the file write and before the index, the file holds the in-flight text, is `same`, and its hash is promoted', async () => {
  const file = join(files, 'lesson.chalk');
  const held = await holdAfterEdit('file-written', file);
  // The file has the new text; the index still says `writing` with its hash and the old `written`.
  expect(readFileSync(file, 'utf8')).toBe(serialize(held.edited));
  expect(readIndex(userData)?.tabs[0]).toMatchObject({
    writing: sha256(readFileSync(file)),
    written: sha256(serialize(held.before)),
  });
  const bytes = readFileSync(file);
  await kill(held.app);
  await expectNoConflict(file, held.edited);
  expect(readFileSync(file).equals(bytes)).toBe(true);
});

test('TH7, SEC12: without the test-hooks flag the hold is never consulted: a drawing is kept and the window closes', async () => {
  const { app, page } = await openApp({ launch: { testHooks: false, userData, dialogs: [] } });
  await app.evaluate(() => {
    // Armed for every tab: were the seam wired, the chain would stop after the first record.
    (globalThis as { __chalkbondTestMain?: unknown }).__chalkbondTestMain = {
      blockedRequests: 0,
      hold: { point: 'record-written', reached: 0 },
    };
  });
  await insertName(page, 'ethanol');
  await expect.poll(() => recordIds(userData).length, { timeout: 12_000 }).toBe(1);
  // Were the seam wired the chain would be held: the window could not close and `reached` would be 1.
  await closeWindowForReal(app);
  expect(recordIds(userData).length).toBe(1);
});

// SS11: the store is never trusted to be intact; the app opens whatever it can.

/** Two Untitled tabs (ethanol, then benzene active), both recorded; the process is killed. */
async function twoUntitled(): Promise<{ a: string; b: string; docA: Doc; docB: Doc }> {
  const first = await launchIn(userData);
  try {
    await insertName(first.page, 'ethanol');
    const a = await expectRecorded(first.page, userData);
    const b = await openTab(first.page);
    await insertName(first.page, 'benzene');
    const recordedB = await expectRecorded(first.page, userData);
    await kill(first.app);
    return { a: a.tabId, b, docA: a.doc, docB: recordedB.doc };
  } catch (error) {
    await first.app.close();
    throw error;
  }
}

test('SS11: an unparsable index is moved to damaged/ and every record opens as a kept tab', async () => {
  const { a, b, docA, docB } = await twoUntitled();
  writeFileSync(indexFile(userData), '{ this is not an index');
  const { app, page } = await launchIn(userData, { dialogs: [] });
  try {
    await expect
      .poll(async () => (await readTabs(page)).map((t) => t.kind))
      .toEqual(['kept', 'kept']);
    expect((await readTabs(page)).map((t) => t.id).sort()).toEqual([a, b].sort());
    for (const [id, doc] of [
      [a, docA],
      [b, docB],
    ] as const) {
      await activateTab(page, id);
      await expect.poll(async () => (await activeTabOf(page)).id).toBe(id);
      await expect.poll(async () => (await readDocument(page)).atoms).toEqual(doc.atoms);
    }
    // Moved aside with its bytes, never deleted; the records are untouched; a fresh index lists them.
    expect(damagedNames(userData)).toEqual(['index.json']);
    expect(readFileSync(join(sessionFolder(userData), 'damaged', 'index.json'), 'utf8')).toBe(
      '{ this is not an index',
    );
    expect(recordIds(userData)).toEqual([a, b].sort());
    await expect
      .poll(() => (readIndex(userData)?.tabs.map((t) => t.kind) ?? []).join())
      .toBe('kept,kept');
    expect(await dialogLog(app)).toEqual([]);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('SS11: a record the index neither lists nor discards (an orphan) opens as a kept tab at the end', async () => {
  const { a, b, docB } = await twoUntitled();
  const listed = readIndex(userData);
  if (listed === null) throw new Error('no index');
  writeFileSync(
    indexFile(userData),
    `${JSON.stringify({ ...listed, tabs: listed.tabs.filter((t) => t.id !== b), active: a }, null, 2)}\n`,
  );
  const { app, page } = await launchIn(userData, { dialogs: [] });
  try {
    await expect
      .poll(async () => (await readTabs(page)).map((t) => [t.id, t.kind]))
      .toEqual([
        [a, 'untitled'],
        [b, 'kept'],
      ]);
    await activateTab(page, b);
    await expect.poll(async () => (await readDocument(page)).atoms).toEqual(docB.atoms);
    expect(damagedNames(userData)).toEqual([]);
    expect(await dialogLog(app)).toEqual([]);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

const damages: [string, (record: string) => string][] = [
  ['does not start like a record (no "{")', () => 'this is not a record'],
  ['is cut off (not JSON)', (record) => record.slice(0, Math.floor(record.length / 2))],
  [
    'has a drawing that does not parse',
    (record) => {
      const parsed = JSON.parse(record) as { editor: { file: string } };
      return JSON.stringify({ ...parsed, editor: { ...parsed.editor, file: 'not a .chalk file' } });
    },
  ],
];
for (const [what, damage] of damages) {
  test(`SS11, N-A5: an inactive tab whose record ${what} keeps its dot from the index, is lost with N-A5 on first use and its record is moved to damaged/`, async () => {
    const { a, b, docB } = await twoUntitled();
    const damagedText = damage(readFileSync(recordFile(userData, a), 'utf8'));
    writeFileSync(recordFile(userData, a), damagedText);
    const { app, page } = await launchIn(userData, { dialogs: [] });
    try {
      // The dot comes from the index: nothing has read the damaged record yet.
      await expect
        .poll(async () => (await readTabs(page)).map((t) => [t.id, t.active, t.marker]))
        .toEqual([
          [a, false, 'dot'],
          [b, true, 'dot'],
        ]);
      await expect.poll(async () => (await readDocument(page)).atoms).toEqual(docB.atoms);
      expect(damagedNames(userData)).toEqual([]);
      await activateTab(page, a);
      await expect.poll(async () => (await readTabs(page)).map((t) => t.id)).toEqual([b]);
      expect(await heardNotices(page)).toContainEqual(DAMAGED_NOTICE);
      // Everything else opens: the other tab is as it was, nothing is deleted, no box.
      expect((await activeTabOf(page)).id).toBe(b);
      expect((await readDocument(page)).atoms).toEqual(docB.atoms);
      await expect.poll(() => damagedNames(userData)).toEqual([`${a}.json`]);
      expect(readFileSync(join(sessionFolder(userData), 'damaged', `${a}.json`), 'utf8')).toBe(
        damagedText,
      );
      expect(recordIds(userData)).toEqual([b]);
      expect(await dialogLog(app)).toEqual([]);
      await expectNoNetwork(app);
    } finally {
      await app.close();
    }
  });
}

test('SS11, R52: a damaged record of a file tab opens from its file (history lost) and is moved to damaged/', async () => {
  const lesson = join(files, 'lesson.chalk');
  const first = await launchIn(userData, { dialogs: [saveTo(lesson)] });
  await insertName(first.page, 'ethanol');
  await canvasOf(first.page).focus();
  await first.page.keyboard.press('Control+s');
  await expect.poll(async () => (await activeTabOf(first.page)).kind).toBe('chalk');
  const { tabId, doc } = await expectRecorded(first.page, userData);
  await kill(first.app);
  const bytes = readFileSync(lesson);
  const damagedText = '{"format":"chalkbond-tab","version":1,';
  writeFileSync(recordFile(userData, tabId), damagedText);
  const { app, page } = await launchIn(userData, { dialogs: [] });
  try {
    await expect
      .poll(async () => (await readTabs(page)).map((t) => [t.id, t.label, t.kind, t.marker]))
      .toEqual([[tabId, 'lesson', 'chalk', 'none']]);
    await expect.poll(async () => (await readDocument(page)).atoms).toEqual(doc.atoms);
    expect(await countSteps(page)).toEqual({ redo: 0, undo: 0 });
    await expect.poll(() => damagedNames(userData)).toEqual([`${tabId}.json`]);
    expect(readFileSync(join(sessionFolder(userData), 'damaged', `${tabId}.json`), 'utf8')).toBe(
      damagedText,
    );
    expect(readFileSync(lesson).equals(bytes)).toBe(true);
    expect(await heardNotices(page)).toEqual([]);
    expect(await dialogLog(app)).toEqual([]);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('SS6, SS10, R51: an unwritable session folder: the warning, the box once, closing the tab asks, closing the window asks for that tab only and Cancel keeps it open', async () => {
  const lesson = join(files, 'lesson.chalk');
  const { app, page } = await launchIn(userData, {
    dialogs: [
      saveTo(lesson), // Ctrl+S on tab 1: Save as
      { response: 0, checkboxChecked: false }, // the "Couldn't keep" box of tab 2
      { response: 2 }, // Ctrl+W on tab 2: Cancel
      { response: 2 }, // the window close, the first time: Cancel
      { response: 1 }, // the window close, the second time: Don't save
    ],
  });
  let unlock = (): void => undefined;
  try {
    // Tab 1 is a file tab: its drawing is in its file, so it is never "unkept".
    await insertName(page, 'ethanol');
    await canvasOf(page).focus();
    await page.keyboard.press('Control+s');
    await expect.poll(async () => (await activeTabOf(page)).kind).toBe('chalk');
    await expectRecorded(page, userData);
    // Tab 2 is an Untitled whose drawing exists only in the store.
    await openTab(page);
    await insertName(page, 'benzene');
    await expectRecorded(page, userData);
    unlock = lockSession(userData);
    await insertName(page, 'methane');
    await expect
      .poll(async () => (await readTabs(page))[1]?.marker, { timeout: 20_000 })
      .toBe('unkept');
    expect((await readTabs(page))[0]?.marker).not.toBe('unkept');
    await expect(page.getByTestId('tab').nth(1)).toHaveAttribute(
      'aria-label',
      "Untitled, couldn't keep",
    );
    // The box is shown once: the save dialog, then the keep box.
    await expect.poll(async () => (await dialogLog(app)).length).toBe(2);
    const keep = (await dialogLog(app))[1];
    expect(keep?.method).toBe('showMessageBox');
    expect(keep?.options['message']).toBe("Chalkbond couldn't keep “Untitled”.");
    expect(String(keep?.options['detail'])).toContain('save this drawing with Save as');
    // A later change retries the write (it fails again) and shows no second box.
    const failures = (): number => (mainLog(userData).match(/Write failed/g) ?? []).length;
    const seen = failures();
    await insertName(page, 'methane');
    await expect.poll(failures, { timeout: 20_000 }).toBeGreaterThan(seen);
    expect((await readTabs(page))[1]?.marker).toBe('unkept');
    expect(await dialogLog(app)).toHaveLength(2);

    // Closing that tab asks; Cancel keeps it.
    await canvasOf(page).focus();
    await page.keyboard.press('Control+w');
    await expect.poll(async () => (await dialogLog(app)).length).toBe(3);
    expect((await dialogLog(app))[2]).toEqual(SAVE_BOX('Untitled'));
    expect((await readTabs(page)).map((t) => t.label)).toEqual(['lesson', 'Untitled']);

    // Closing the window with tab 1 active: tab 2 is activated and asked about, tab 1 is not.
    await page.keyboard.press('Control+1');
    await expect.poll(async () => (await activeTabOf(page)).label).toBe('lesson');
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.close();
    });
    await expect.poll(async () => (await dialogLog(app)).length).toBe(4);
    expect((await dialogLog(app))[3]).toEqual(SAVE_BOX('Untitled'));
    await expect.poll(async () => (await activeTabOf(page)).label).toBe('Untitled');
    // Cancel: the window stays open, with both tabs, and no further box.
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    expect((await readTabs(page)).map((t) => t.label)).toEqual(['lesson', 'Untitled']);
    expect(await dialogLog(app)).toHaveLength(4);
    await expectNoNetwork(app);

    // The second close: Don't save drops that tab and the window closes.
    const exited = new Promise<void>((resolve) => app.process().once('exit', () => resolve()));
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.close();
    });
    await exited;
  } finally {
    unlock();
    await app.close().catch(() => undefined);
  }
});
