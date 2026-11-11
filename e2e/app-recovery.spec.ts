// A14 (SPEC-app-shell.md RC1–RC6, SC7): the recovery file round trip with the built app. A kill
// leaves the file; the relaunch with the same user-data folder offers it (the native box asserted
// as data through `stub-dialogs.mjs`); Recover, Delete, a file on the command line (RC4), a file
// that is not a drawing, the shutdown flush (RC5), a gone renderer and a normal close.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { parse, serialize, type AtomId, type Doc } from '../src/core/doc-model';
import { dialogLog } from './export-steps';
import {
  canvasPoint,
  expectNoNetwork,
  goldenDoc,
  heardNotices,
  insertName,
  readDocument,
} from './harness';
import { launchSecondInstance } from './launch';
import { menuItems } from './app-menu';
import {
  closeWindowForReal,
  DELETE,
  drawThenKill,
  launchIn,
  RECOVER,
  RECOVER_BOX,
  recoveryFile,
  recoveryMeta,
} from './recovery-steps';
import { windowTitle } from './relaunch';

const elements = (d: Doc): string[] =>
  Object.values(d.atoms)
    .map((a) => a.element)
    .sort();
const fileDoc = (file: string): Doc => {
  const parsed = parse(readFileSync(file, 'utf8'));
  if (!parsed.ok) throw new Error(`not a drawing: ${file}`);
  return parsed.value;
};
const mainLog = (userData: string): string => {
  const file = join(userData, 'logs', 'main.log');
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
};

let userData: string;
let files: string;
test.beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'chalkbond-recovery-data-'));
  files = mkdtempSync(join(tmpdir(), 'chalkbond-recovery-files-'));
});
test.afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
  rmSync(files, { recursive: true, force: true });
});

test('SC7: after a kill, the relaunch offers the drawing; Recover brings it back as "Recovered drawing"', async () => {
  const drawn = await drawThenKill(userData, 'ethanol');
  expect(fileDoc(recoveryFile(userData)).atoms).toEqual(drawn.atoms);
  expect(JSON.parse(readFileSync(recoveryMeta(userData), 'utf8'))).toMatchObject({
    name: 'Untitled',
  });
  const { app, page } = await launchIn(userData, { dialogs: [RECOVER] });
  try {
    await expect.poll(async () => elements(await readDocument(page))).toEqual(elements(drawn));
    expect((await readDocument(page)).atoms).toEqual(drawn.atoms);
    expect(await dialogLog(app)).toEqual([{ method: 'showMessageBox', options: RECOVER_BOX }]);
    await expect.poll(() => windowTitle(app)).toBe('*Recovered drawing - Chalkbond');
    // Kept until the drawing is saved (forcedDirty): nothing cleared it.
    expect(existsSync(recoveryFile(userData))).toBe(true);
    await expect(page.getByTestId('canvas')).toBeFocused();
  } finally {
    await app.close();
  }
});

test('RC3 Delete: the empty drawing, and the recovery file is gone', async () => {
  await drawThenKill(userData, 'ethanol');
  const { app, page } = await launchIn(userData, { dialogs: [DELETE] });
  try {
    await expect.poll(() => existsSync(recoveryFile(userData))).toBe(false);
    expect(existsSync(recoveryMeta(userData))).toBe(false);
    expect(Object.keys((await readDocument(page)).atoms)).toEqual([]);
    expect(await windowTitle(app)).toBe('Untitled - Chalkbond');
    expect((await dialogLog(app)).map((d) => d.options)).toEqual([RECOVER_BOX]);
  } finally {
    await app.close();
  }
});

test('RC4: a .chalk on the relaunch command line: recovery first; Recover keeps it and shows N-A2', async () => {
  const ethanol = join(files, 'ethanol.chalk');
  writeFileSync(ethanol, serialize(goldenDoc('ethanol')));
  const drawn = await drawThenKill(userData, 'benzene');
  const { app, page } = await launchIn(userData, { dialogs: [RECOVER], extraArgs: [ethanol] });
  try {
    await expect.poll(async () => (await readDocument(page)).atoms).toEqual(drawn.atoms);
    await expect(page.getByTestId('statusbar').getByRole('status')).toHaveText(
      'Recovered your unsaved drawing. Save it, then open ethanol.chalk again.',
    );
    expect(await windowTitle(app)).toBe('*Recovered drawing - Chalkbond');
    expect((await dialogLog(app)).map((d) => d.options)).toEqual([RECOVER_BOX]);
  } finally {
    await app.close();
  }
});

test('RC4: Delete, then the command-line file opens (F3)', async () => {
  const ethanol = join(files, 'ethanol.chalk');
  writeFileSync(ethanol, serialize(goldenDoc('ethanol')));
  await drawThenKill(userData, 'benzene');
  const { app, page } = await launchIn(userData, { dialogs: [DELETE], extraArgs: [ethanol] });
  try {
    await expect.poll(() => windowTitle(app)).toBe('ethanol - Chalkbond');
    expect((await readDocument(page)).atoms).toEqual(goldenDoc('ethanol').atoms);
    expect(existsSync(recoveryFile(userData))).toBe(false);
    expect((await dialogLog(app)).map((d) => d.options)).toEqual([RECOVER_BOX]);
  } finally {
    await app.close();
  }
});

test('F11: without a recovery file, the command-line file opens with no box', async () => {
  const ethanol = join(files, 'ethanol.chalk');
  writeFileSync(ethanol, serialize(goldenDoc('ethanol')));
  const { app, page } = await launchIn(userData, { dialogs: [], extraArgs: [ethanol] });
  try {
    await expect.poll(() => windowTitle(app)).toBe('ethanol - Chalkbond');
    expect((await readDocument(page)).atoms).toEqual(goldenDoc('ethanol').atoms);
    expect(await dialogLog(app)).toEqual([]);
  } finally {
    await app.close();
  }
});

test('RC3: a recovery file that does not parse, or is not a drawing, is deleted and logged; no box', async () => {
  const folder = join(userData, 'recovery');
  for (const [text, logged] of [
    ['{"schemaVersion": 1, "secret": "benzene"', 'Recovery file not used'],
    ['PK garbage', 'Recovery file not a drawing'],
  ] as const) {
    mkdirSync(folder, { recursive: true });
    writeFileSync(recoveryFile(userData), text);
    writeFileSync(recoveryMeta(userData), '{"name":"esterification.chalk"}');
    const { app, page } = await launchIn(userData, { dialogs: [] });
    try {
      await expect.poll(() => existsSync(recoveryFile(userData))).toBe(false);
      expect(existsSync(recoveryMeta(userData))).toBe(false);
      expect(await dialogLog(app)).toEqual([]);
      expect(Object.keys((await readDocument(page)).atoms)).toEqual([]);
      await expect.poll(() => mainLog(userData)).toContain(logged);
      expect(mainLog(userData)).not.toContain('secret');
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

test('RC5, R24: a cancelled shutdown (query-session-end only) writes the file within 1 s, prevents nothing, and the next real close still prompts', async () => {
  const { app, page } = await launchIn(userData, { dialogs: [{ response: 1 }] });
  await insertName(page, 'ethanol');
  expect(await emitQuerySessionEnd(app)).toBe(false);
  await expect.poll(() => existsSync(recoveryFile(userData)), { timeout: 1000 }).toBe(true);
  expect(fileDoc(recoveryFile(userData)).atoms).toEqual((await readDocument(page)).atoms);
  // The shutdown was cancelled: an ordinary close shows the save prompt (the one scripted box,
  // Don't save), then N4 clears the file.
  await closeWindowForReal(app);
  expect(existsSync(recoveryFile(userData))).toBe(false);
  expect(existsSync(recoveryMeta(userData))).toBe(false);
});

test('RC5, R24: query-session-end then session-end, then the close: no prompt, the recovery file stays', async () => {
  const { app, page } = await launchIn(userData, { dialogs: [] });
  await insertName(page, 'ethanol');
  expect(await emitQuerySessionEnd(app)).toBe(false);
  await expect.poll(() => existsSync(recoveryFile(userData)), { timeout: 1000 }).toBe(true);
  expect(fileDoc(recoveryFile(userData)).atoms).toEqual((await readDocument(page)).atoms);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.emit('session-end', {});
  });
  // Windows then closes the window: no prompt (no box is scripted), no clear.
  await closeWindowForReal(app);
  expect(existsSync(recoveryFile(userData))).toBe(true);
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

test('RC5, R25: a label typed but not confirmed is finished by the shutdown flush and is in the recovery file within 1 s', async () => {
  const { app, page } = await launchIn(userData, { dialogs: [] });
  await insertName(page, 'ethanol');
  await openLabelEditor(page, 'Cl');
  expect(await emitQuerySessionEnd(app)).toBe(false);
  await expect
    .poll(
      () => (existsSync(recoveryFile(userData)) ? elements(fileDoc(recoveryFile(userData))) : []),
      {
        timeout: 1000,
      },
    )
    .toEqual(['C', 'C', 'Cl']);
  await expect(page.getByTestId('textbox-edit')).toHaveCount(0);
  expect(elements(await readDocument(page))).toEqual(['C', 'C', 'Cl']);
  await app.close();
});

/**
 * An IME composition under way (DOM only, as in app-draft-close.spec.ts), optionally with a
 * synthetic `query-session-end`; then `compositionend`, then a click elsewhere (blur). Returns what
 * was observed at each step.
 */
async function composeThen(page: Page, app: ElectronApplication, shutdown: boolean) {
  await openLabelEditor(page, '');
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="textbox-edit"]') as HTMLElement;
    el.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
    el.textContent = 'Br';
  });
  if (shutdown) {
    expect(await emitQuerySessionEnd(app)).toBe(false);
    await expect.poll(() => existsSync(recoveryFile(userData)), { timeout: 1000 }).toBe(true);
    // The committed drawing only: the draft is not recoverable (R25).
    expect(elements(fileDoc(recoveryFile(userData)))).toEqual(['C', 'C', 'O']);
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

test('RC5, R25: during an IME composition the flush writes the committed drawing at once, leaves the editor alone, and compositionend behaves as without a shutdown', async () => {
  const first = await launchIn(userData, { dialogs: [] });
  await insertName(first.page, 'ethanol');
  const withShutdown = await composeThen(first.page, first.app, true);
  await first.app.close();
  rmSync(userData, { recursive: true, force: true });
  mkdirSync(userData, { recursive: true });
  const second = await launchIn(userData, { dialogs: [] });
  await insertName(second.page, 'ethanol');
  const without = await composeThen(second.page, second.app, false);
  await second.app.close();
  expect(withShutdown.at.composing).toEqual([1, 'Br']);
  expect(withShutdown.at.document).toEqual(['C', 'C', 'O']);
  expect(withShutdown).toEqual(without);
});

test("RC2: a normal close after Don't save leaves no recovery file", async () => {
  const { app, page } = await launchIn(userData, { dialogs: [{ response: 1 }] });
  await insertName(page, 'ethanol');
  await expect.poll(() => existsSync(recoveryFile(userData)), { timeout: 12_000 }).toBe(true);
  await closeWindowForReal(app);
  expect(existsSync(recoveryFile(userData))).toBe(false);
  expect(existsSync(recoveryMeta(userData))).toBe(false);
});

test('a gone renderer: the window closes without a prompt and the recovery file stays', async () => {
  const { app, page } = await launchIn(userData, { dialogs: [] });
  await insertName(page, 'ethanol');
  await expect.poll(() => existsSync(recoveryFile(userData)), { timeout: 12_000 }).toBe(true);
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
  expect(existsSync(recoveryFile(userData))).toBe(true);
});

test('RC2: Save clears the recovery file; undo back to the saved drawing clears it too', async () => {
  const out = join(files, 'saved.chalk');
  const { app, page } = await launchIn(userData, {
    dialogs: [{ canceled: false, filePath: out }],
  });
  try {
    await insertName(page, 'ethanol');
    await expect.poll(() => existsSync(recoveryFile(userData)), { timeout: 12_000 }).toBe(true);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+S');
    await expect.poll(() => existsSync(out)).toBe(true);
    await expect.poll(() => existsSync(recoveryFile(userData))).toBe(false);
    await page.keyboard.press('Delete'); // the inserted ethanol is still selected
    await expect.poll(() => existsSync(recoveryFile(userData)), { timeout: 12_000 }).toBe(true);
    await page.keyboard.press('Control+Z');
    await expect.poll(() => existsSync(recoveryFile(userData))).toBe(false);
    await expect.poll(() => windowTitle(app)).toBe('saved - Chalkbond');
  } finally {
    await app.close();
  }
});

// A15 (R23, RC4, RC7): file requests while the recover box is still open (a held scripted answer).
const releaseBox = (app: ElectronApplication) =>
  app.evaluate(() =>
    (globalThis as { __chalkbondReleaseDialog?: () => void }).__chalkbondReleaseDialog?.(),
  );

test('R23: during the offer an edit writes nothing and a second launch waits; Recover keeps the drawing, N-A2 names the latest', async () => {
  const a = join(files, 'a.chalk');
  const b = join(files, 'b.chalk');
  writeFileSync(a, serialize(goldenDoc('ethanol')));
  writeFileSync(b, serialize(goldenDoc('acetic-acid')));
  const drawn = await drawThenKill(userData, 'benzene');
  const lastRun = readFileSync(recoveryFile(userData), 'utf8');
  const { app, page } = await launchIn(userData, {
    dialogs: [{ ...RECOVER, hold: true }],
    extraArgs: [a],
  });
  try {
    await expect.poll(async () => (await dialogLog(app)).length).toBe(1);
    // RC7: an edit while the box is open would be written 2 s later if tracking ran.
    await insertName(page, 'water');
    expect(await launchSecondInstance({ userData, extraArgs: [b] })).toEqual({
      code: 0,
      signal: null,
    });
    await page.waitForTimeout(2500);
    expect(readFileSync(recoveryFile(userData), 'utf8')).toBe(lastRun);
    expect(await windowTitle(app)).not.toMatch(/^(a|b) - /);
    await releaseBox(app);
    await expect.poll(() => windowTitle(app)).toBe('*Recovered drawing - Chalkbond');
    expect((await readDocument(page)).atoms).toEqual(drawn.atoms);
    await expect
      .poll(() => heardNotices(page))
      .toContainEqual({
        kind: 'info',
        text: 'Recovered your unsaved drawing. Save it, then open b.chalk again.',
      });
    expect((await heardNotices(page)).filter((n) => n.text.startsWith('Recovered'))).toHaveLength(
      1,
    );
    expect((await dialogLog(app)).map((d) => d.options)).toEqual([RECOVER_BOX]);
    expect(readFileSync(recoveryFile(userData), 'utf8')).toBe(lastRun);
    expect((await menuItems(app)).filter((i) => /^file\.recent\.\d/.test(i.id))).toEqual([]);
  } finally {
    await app.close();
  }
});

test('R23: Delete after a second launch during the offer opens only the latest file, once', async () => {
  const a = join(files, 'a.chalk');
  const b = join(files, 'b.chalk');
  writeFileSync(a, serialize(goldenDoc('ethanol')));
  writeFileSync(b, serialize(goldenDoc('acetic-acid')));
  await drawThenKill(userData, 'benzene');
  const { app, page } = await launchIn(userData, {
    dialogs: [{ ...DELETE, hold: true }],
    extraArgs: [a],
  });
  try {
    await expect.poll(async () => (await dialogLog(app)).length).toBe(1);
    expect(await launchSecondInstance({ userData, extraArgs: [b] })).toEqual({
      code: 0,
      signal: null,
    });
    await releaseBox(app);
    await expect.poll(() => windowTitle(app)).toBe('b - Chalkbond');
    expect((await readDocument(page)).atoms).toEqual(goldenDoc('acetic-acid').atoms);
    expect(existsSync(recoveryFile(userData))).toBe(false);
    expect((await dialogLog(app)).map((d) => d.options)).toEqual([RECOVER_BOX]);
    // Only b reached the session (N2 → recent): a was never opened first.
    await expect
      .poll(async () =>
        (await menuItems(app)).filter((i) => /^file\.recent\.\d/.test(i.id)).map((i) => i.label),
      )
      .toEqual(['&1 b.chalk']);
  } finally {
    await app.close();
  }
});
