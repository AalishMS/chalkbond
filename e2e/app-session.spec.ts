// TB20 (SPEC-app-shell.md SS2-SS7, SS10, R35; RC5 / R24 / R25 as amended): the session store
// round trip with the built app, replacing A14's recovery file. A kill leaves the active tab's
// record; the relaunch with the same user-data folder restores the drawing with no box (asserted
// through the stubbed `dialog`, e2e/stub-dialogs.mjs). The launch's file opens after the restore;
// the old recovery folder is neither read nor deleted; the shutdown flush (`flush-session`), a gone
// renderer and a normal close keep the drawing. TB28 extends this file (several tabs, histories,
// views, damaged files, an unwritable store).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { serialize, type AtomId, type Doc } from '../src/core/doc-model';
import { dialogLog } from './export-steps';
import {
  canvasPoint,
  expectNoNetwork,
  goldenDoc,
  insertName,
  openTab,
  readDocument,
  readTabs,
} from './harness';
import {
  activeTabOf,
  closeWindowForReal,
  drawThenKill,
  expectRecorded,
  kill,
  launchIn,
  recordDoc,
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
