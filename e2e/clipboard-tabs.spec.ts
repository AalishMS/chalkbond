// TB30: clipboard and export with tabs (SPEC-clipboard-export.md R13, C8, CB-P1, EX2, EX4;
// app-shell K1, R43). Copy, Cut, Paste and Export act on the active tab; the editor's in-app
// clipboard and the copy generation are window-wide. Portable: main's clipboard is the in-memory
// store of e2e/stub-clipboard-memory.mjs behind the real adapter, flow and rasteriser (not proof of
// the Windows clipboard; that is e2e/win/).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { parse, serialize, type Doc } from '../src/core/doc-model';
import { requestOpens, writeChalkFiles } from './drop-steps';
import { dialogLog, expectNotice, saveTo } from './export-steps';
import {
  activateTab,
  expectNoNetwork,
  goldenDoc,
  loadDocument,
  openApp,
  openTab,
  readDocument,
  readTabs,
  tabKeys,
} from './harness';
import { recordDoc, recordIds } from './session-steps';

type HookWindow = { __chalkbondTest?: { run(cmd: string): void } };
const selectAll = async (page: Page) => {
  await page.evaluate(() => (window as HookWindow).__chalkbondTest?.run('select-all'));
  await page.getByTestId('canvas').focus();
};
const atomCount = async (page: Page) => Object.keys((await readDocument(page)).atoms).length;
const points = (doc: Doc) =>
  Object.values(doc.atoms)
    .map((a) => `${a.x.toFixed(3)},${a.y.toFixed(3)}`)
    .sort();
const labels = async (page: Page) => (await readTabs(page)).map((t) => t.label);
/** Waits until the strip shows the tabs the host holds (the DOM trails the hook by a render). */
const settled = async (page: Page): Promise<void> => {
  await expect
    .poll(async () => (await tabKeys(page)).join())
    .toBe((await readTabs(page)).map((t) => t.id).join());
};
/** A new tab by the + button, once the strip has caught up with the last change. */
const newTab = async (page: Page): Promise<string> => {
  await settled(page);
  return openTab(page);
};
const activeId = async (page: Page) => (await readTabs(page)).find((t) => t.active)?.id ?? '';

/** The clipboard's drawing as the paste would read it (C2), parsed. */
async function clipboardDrawing(page: Page): Promise<Doc> {
  const read = await page.evaluate(() => window.chalkbond.clipboardRead());
  if (read.drawing === null) throw new Error('the clipboard holds no drawing');
  const parsed = parse(read.drawing);
  if (!parsed.ok) throw new Error('the clipboard drawing does not parse');
  return parsed.value;
}

/** The records in the session store: tab id to the drawing it holds (volatile fields left out). */
function storeDrawings(userData: string): Record<string, string | null> {
  return Object.fromEntries(
    recordIds(userData).map((id) => {
      const doc = recordDoc(userData, id);
      return [id, doc === null ? null : serialize(doc)];
    }),
  );
}

let dir: string;
let userData: string;
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chalkbond-clip-tabs-'));
  userData = mkdtempSync(join(tmpdir(), 'chalkbond-clip-tabs-data-'));
});
test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(userData, { recursive: true, force: true });
});

async function open(extra: { dialogs?: unknown[] } = {}) {
  const opened = await openApp({
    launch: { clipboardMemory: true, userData, dialogs: extra.dialogs ?? [] },
  });
  await opened.page.waitForFunction(() => '__chalkbondTest' in window);
  return opened;
}

test('R13, CB-P1: a copy in tab A pastes in tab B by the in-app branch, one BLU from the source position', async () => {
  const { app, page } = await open();
  try {
    const ethanol = goldenDoc('ethanol');
    await loadDocument(page, ethanol);
    const tabA = await activeId(page);
    await selectAll(page);
    await page.keyboard.press('Control+c');
    await expectNotice(page, 'Copied. Paste into PowerPoint or Word with Ctrl+V.');

    const tabB = await newTab(page);
    expect(await atomCount(page)).toBe(0);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+v');
    await expect.poll(() => atomCount(page)).toBe(3);
    // The in-app branch cascades by (1, 1) BLU from where the copy came from (a fragment paste
    // would land elsewhere, at the pointer).
    const pasted = await readDocument(page);
    expect(points(pasted)).toEqual(
      Object.values(ethanol.atoms)
        .map((a) => `${(a.x + 1).toFixed(3)},${(a.y + 1).toFixed(3)}`)
        .sort(),
    );
    expect((await readTabs(page)).find((t) => t.active)?.id).toBe(tabB);

    // Tab A is untouched by a paste into B.
    await activateTab(page, tabA);
    expect(serialize(await readDocument(page))).toBe(serialize(ethanol));
    expect(await labels(page)).toEqual(['Untitled', 'Untitled 2']);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('R13: a tab switch while the picture is rasterising changes nothing already taken', async () => {
  const { app, page } = await open();
  try {
    const ethanol = goldenDoc('ethanol');
    const toluene = goldenDoc('toluene');
    await loadDocument(page, ethanol);
    const tabA = await activeId(page);
    await newTab(page);
    await loadDocument(page, toluene);
    const tabB = await activeId(page);
    await activateTab(page, tabA);
    // Rasterising waits for the image to decode: slow it so there is a window to switch in.
    await page.evaluate(() => {
      const decode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = async function (this: HTMLImageElement) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return decode.call(this);
      };
    });
    await page.getByTestId('copy').click(); // the whole drawing of tab A
    await activateTab(page, tabB); // while A's picture is still being made
    expect(await activeId(page)).toBe(tabB);
    await expectNotice(
      page,
      'Copied the whole drawing. Paste into PowerPoint or Word with Ctrl+V.',
    );
    // The clipboard holds what tab A showed when Copy ran, not tab B's drawing.
    expect(points(await clipboardDrawing(page))).toEqual(points(ethanol));
    // Neither tab changed, and the active tab is still B.
    expect(await activeId(page)).toBe(tabB);
    expect(serialize(await readDocument(page))).toBe(serialize(toluene));
    await activateTab(page, tabA);
    expect(serialize(await readDocument(page))).toBe(serialize(ethanol));
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('R13: a paste lands in the tab that is active when the clipboard read returns', async () => {
  const { app, page } = await open();
  try {
    const ethanol = goldenDoc('ethanol');
    await loadDocument(page, ethanol);
    const tabA = await activeId(page);
    await page.getByTestId('copy').click(); // the whole drawing: a fragment on paste
    await expectNotice(
      page,
      'Copied the whole drawing. Paste into PowerPoint or Word with Ctrl+V.',
    );
    const tabB = await newTab(page);
    const tabC = await newTab(page);
    await activateTab(page, tabB);
    // The clipboard read waits in main: Ctrl+V is pressed in B and the active tab is C by then.
    await app.evaluate(({ clipboard }) => {
      const state = globalThis as unknown as { __clipboardReads: number };
      state.__clipboardReads = 0;
      const read = clipboard.read.bind(clipboard);
      clipboard.read = async () => {
        state.__clipboardReads += 1;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return read();
      };
    });
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+v');
    await expect
      .poll(() =>
        app.evaluate(
          () => (globalThis as unknown as { __clipboardReads: number }).__clipboardReads,
        ),
      )
      .toBe(1);
    await activateTab(page, tabC);
    await expect.poll(() => atomCount(page)).toBe(3); // C is active and holds the paste
    expect(await activeId(page)).toBe(tabC);
    expect(points(await readDocument(page))).toEqual(points(ethanol)); // not shifted
    await activateTab(page, tabB);
    expect(await atomCount(page)).toBe(0);
    await activateTab(page, tabA);
    expect(serialize(await readDocument(page))).toBe(serialize(ethanol));
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('EX2, EX4, R13: Export names the file after the active tab and changes no tab, record or file', async () => {
  const [file] = writeChalkFiles(dir, ['ethanol']);
  if (file === undefined) throw new Error('file');
  const untitledPng = join(dir, 'out-untitled.png');
  const ethanolPng = join(dir, 'out-ethanol.png');
  const { app, page } = await open({ dialogs: [saveTo(ethanolPng), saveTo(untitledPng)] });
  try {
    await loadDocument(page, goldenDoc('toluene'));
    await requestOpens(app, [file]);
    await expect.poll(() => labels(page)).toEqual(['Untitled', 'ethanol']);
    const source = readFileSync(file, 'utf8');

    const exportActive = async (call: number): Promise<void> => {
      await page.getByTestId('canvas').focus();
      await page.keyboard.press('Control+e');
      await expect(page.getByTestId('export-dialog')).toBeVisible();
      await page.getByTestId('export-save').click();
      await expect.poll(async () => (await dialogLog(app)).length).toBe(call);
      await expect(page.getByTestId('export-dialog')).toHaveCount(0);
    };
    const tabsBefore = await readTabs(page);
    // Both tabs have a record (the file tab's is written by the timer, AS2): "no change" is then
    // about Export, not a pending first write.
    await expect.poll(() => recordIds(userData).length, { timeout: 15_000 }).toBe(2);
    const storeBefore = storeDrawings(userData);

    // The active tab is the file tab: its label names the picture.
    await exportActive(1);
    expect(basename(String((await dialogLog(app))[0]?.options['defaultPath']))).toBe('ethanol.png');
    await expectNotice(page, 'Exported out-ethanol.png.');
    expect(readFileSync(ethanolPng).length).toBeGreaterThan(8);
    // An untitled tab passes no name.
    await activateTab(page, tabsBefore[0]?.id ?? '');
    await exportActive(2);
    expect(basename(String((await dialogLog(app))[1]?.options['defaultPath']))).toBe(
      'Untitled.png',
    );
    await expectNotice(page, 'Exported out-untitled.png.');
    expect(
      [...readFileSync(untitledPng).subarray(1, 4)].map((c) => String.fromCharCode(c)).join(''),
    ).toBe('PNG');

    // No tab, no record, no file changed: not the strip, not the store, not the .chalk file.
    await activateTab(page, tabsBefore[1]?.id ?? '');
    expect(await readTabs(page)).toEqual(
      tabsBefore.map((t) => ({ ...t, active: t.id === tabsBefore[1]?.id })),
    );
    expect(readFileSync(file, 'utf8')).toBe(source);
    expect(storeDrawings(userData)).toEqual(storeBefore);
    expect(recordIds(userData).length).toBe(2);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('K1, R13: tab keys do nothing while the Export dialog is open', async () => {
  const [file] = writeChalkFiles(dir, ['ethanol']);
  if (file === undefined) throw new Error('file');
  const { app, page } = await open();
  try {
    await loadDocument(page, goldenDoc('toluene'));
    await requestOpens(app, [file]);
    await expect.poll(() => labels(page)).toEqual(['Untitled', 'ethanol']);
    const before = await readTabs(page);
    const active = await activeId(page);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+e');
    await expect(page.getByTestId('export-dialog')).toBeVisible();
    for (const key of [
      'Control+t',
      'Control+w',
      'Control+Tab',
      'Control+Shift+Tab',
      'Control+PageDown',
      'Control+PageUp',
      'Control+1',
      'Control+2',
      'Control+9',
      'Control+Shift+t',
    ]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(50);
    }
    await expect(page.getByTestId('export-dialog')).toBeVisible();
    expect(await readTabs(page)).toEqual(before);
    expect(await activeId(page)).toBe(active);
    // The same keys work once the dialog is closed.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('export-dialog')).toHaveCount(0);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+1');
    await expect.poll(() => activeId(page)).toBe(before[0]?.id);
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});
