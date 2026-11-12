// TB29 (SPEC-app-shell.md AS1-AS9, R33, R38, R41, SC18, SC21; item (2) and item (6) of the testing
// plan): auto-save of a named tab end to end, through the real main process, real files in a temp
// folder and scripted native boxes (e2e/stub-dialogs.mjs). Timing is the spec's own: a write 2 s
// after the last change, at most 10 s after the first unwritten change of a burst. Outside changes
// are made by writing the file from the test and sending the page a window `focus` event (AS5 (c));
// every claim about a file is by its bytes on disk. A file that was changed outside is never
// overwritten (AS7, AS8): the bytes are compared after the app had time to do it.
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { serialize, type Doc } from '../src/core/doc-model';
import { drawingPayload, withPictureChunks } from '../src/core/clipboard-export';
import { dialogLog } from './export-steps';
import {
  canvasPoint,
  expectNoNetwork,
  goldenDoc,
  heardNotices,
  insertName,
  readDocument,
  readTabs,
  type HookTab,
} from './harness';
import { expectRecorded, launchIn } from './session-steps';

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const TRY_AGAIN = 'Chalkbond keeps your drawing and will try again. You can also use Save as.';
const toluene = goldenDoc('toluene');

let dir: string;
let userData: string;
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chalkbond-autosave-'));
  userData = join(dir, 'user-data');
  mkdirSync(userData);
  mkdirSync(join(dir, 'drawings'));
});
test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const drawings = (name: string): string => join(dir, 'drawings', name);
const text = async (page: Page): Promise<string> => serialize(await readDocument(page));
const read = (file: string): string => readFileSync(file, 'utf8');
const boxes = async (app: ElectronApplication) =>
  (await dialogLog(app)).filter((e) => e.method === 'showMessageBox');
const tabOf = async (page: Page, label: string): Promise<HookTab | undefined> =>
  (await readTabs(page)).find((t) => t.label === label);
const activeTab = async (page: Page): Promise<HookTab | undefined> =>
  (await readTabs(page)).find((t) => t.active);
const lastNotice = async (page: Page): Promise<string | undefined> =>
  (await heardNotices(page)).at(-1)?.text;

/** AS5 (c): the window regained focus. */
async function windowFocused(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

/** Ctrl+S on the (Untitled) canvas, scripted to save `file`; waits until the file holds the drawing. */
async function saveAs(page: Page, file: string, label: string): Promise<string> {
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Control+s');
  await expect.poll(async () => (await activeTab(page))?.label).toBe(label);
  const doc = await text(page);
  await expect.poll(() => (existsSync(file) ? read(file) : '')).toBe(doc);
  expect((await activeTab(page))?.marker).toBe('none');
  return doc;
}

/** Inserts `name` by the name field and waits until the drawing has changed. */
async function edit(page: Page, name: string): Promise<void> {
  const before = await text(page);
  await insertName(page, name);
  await expect.poll(() => text(page)).not.toBe(before);
}

/** The drawing's content (atoms, bonds, objects) of a `.chalk` text: not its modified stamp. */
const content = (chalk: string): unknown => {
  const doc = (JSON.parse(chalk) as { doc: Doc }).doc;
  return { atoms: doc.atoms, bonds: doc.bonds, objects: doc.objects };
};
const shown = async (page: Page): Promise<unknown> => content(await text(page));

/** A named tab holding ethanol, written. Dialogs must begin with the Save as answer for `file`. */
async function namedEthanol(page: Page, file: string, label: string): Promise<string> {
  await edit(page, 'ethanol');
  return saveAs(page, file, label);
}

const finish = async (app: ElectronApplication): Promise<void> => {
  await expectNoNetwork(app);
};

test('AS2, AS1, R41: a named tab writes serialize(doc) about 2 s after the last change; no marker, no notice', async () => {
  const file = drawings('esterification.chalk');
  const { app, page } = await launchIn(userData, {
    dialogs: [{ canceled: false, filePath: file }],
  });
  try {
    const first = await namedEthanol(page, file, 'esterification');
    expect(await lastNotice(page)).toBe('Saved esterification.chalk.');

    await edit(page, 'benzene');
    const noticesBefore = (await heardNotices(page)).length;
    expect(await lastNotice(page)).toBe('Inserted benzene');
    const edited = await text(page);
    expect(edited).not.toBe(first);
    // The timer has not fired yet: the file still holds the first drawing.
    expect(read(file)).toBe(first);
    const started = Date.now();
    await expect.poll(() => read(file), { timeout: 5_000 }).toBe(edited);
    expect(Date.now() - started).toBeGreaterThan(1_000);
    // R41: no marker, no "Saved" notice after an auto-save.
    expect((await activeTab(page))?.marker).toBe('none');
    expect((await activeTab(page))?.label).toBe('esterification');
    // The result of the write has been applied by now (the tab is clean): still no notice.
    await page.waitForTimeout(500);
    expect(await heardNotices(page)).toHaveLength(noticesBefore);
    expect(await lastNotice(page)).toBe('Inserted benzene');
    expect(await boxes(app)).toEqual([]);
    await finish(app);
  } finally {
    await app.close();
  }
});

test('AS2: a continuous burst is written at the latest 10 s after its first change', async () => {
  test.setTimeout(60_000);
  const file = drawings('burst.chalk');
  const { app, page } = await launchIn(userData, {
    dialogs: [{ canceled: false, filePath: file }],
  });
  try {
    const initial = await namedEthanol(page, file, 'burst');
    await page.getByTestId('tool-atom').click();
    const canvas = page.getByTestId('canvas');
    const started = Date.now();
    let writtenAt: number | null = null;
    let writtenText = '';
    for (let i = 0; i < 40; i++) {
      await canvas.click({ position: { x: 120 + (i % 9) * 90, y: 100 + Math.floor(i / 9) * 90 } });
      // A change every ~350 ms keeps AS2's 2 s debounce from ever firing.
      await page.waitForTimeout(350);
      const now = read(file);
      if (writtenAt === null && now !== initial) {
        writtenAt = Date.now() - started;
        writtenText = now;
      }
      if (writtenAt !== null && Date.now() - started > 13_000) break;
      if (writtenAt !== null && i > 36) break;
    }
    expect(writtenAt).not.toBeNull();
    // The cap is 10 s; 1.5 s covers the loop's own granularity and the IPC round trip.
    expect(writtenAt ?? 0).toBeLessThanOrEqual(11_500);
    // The debounce held until the cap (a write at 2 s of silence would be at about 2 s).
    expect(writtenAt ?? 0).toBeGreaterThan(5_000);
    // The write is a whole, valid drawing that was on screen during the burst.
    const mid = JSON.parse(writtenText) as { doc: { atoms: Record<string, unknown> } };
    expect(Object.keys(mid.doc.atoms).length).toBeGreaterThan(3);
    const finalDoc = await text(page);
    await expect.poll(() => read(file), { timeout: 5_000 }).toBe(finalDoc);
    await finish(app);
  } finally {
    await app.close();
  }
});

test('AS4, R41: Ctrl+S writes at once and says "Saved ..."', async () => {
  const file = drawings('now.chalk');
  const { app, page } = await launchIn(userData, {
    dialogs: [{ canceled: false, filePath: file }],
  });
  try {
    await namedEthanol(page, file, 'now');
    await edit(page, 'benzene');
    const edited = await text(page);
    await page.getByTestId('canvas').focus();
    const before = (await heardNotices(page)).length;
    await page.keyboard.press('Control+s');
    // Well before the 2 s timer.
    await expect.poll(() => read(file), { timeout: 1_500 }).toBe(edited);
    await expect.poll(async () => (await heardNotices(page)).length).toBe(before + 1);
    expect(await lastNotice(page)).toBe('Saved now.chalk.');
    // No dialog but the one Save as.
    expect((await dialogLog(app)).map((e) => e.method)).toEqual(['showSaveDialog']);
    await finish(app);
  } finally {
    await app.close();
  }
});

test('AS1, AS8, SC18: an Untitled tab is never written to a file; Ctrl+S on it is Save as (cancelled: it stays)', async () => {
  const { app, page } = await launchIn(userData, { dialogs: [{ canceled: true }] });
  try {
    const watched = readdirSync(join(dir, 'drawings'));
    await edit(page, 'ethanol');
    const { tabId } = await expectRecorded(page, userData);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+s');
    await expect.poll(async () => (await dialogLog(app)).length).toBe(1);
    const save = (await dialogLog(app))[0];
    expect(save?.method).toBe('showSaveDialog');
    expect(String(save?.options['defaultPath'])).toMatch(/[\\/]Untitled\.chalk$/);
    expect(await activeTab(page)).toEqual(
      expect.objectContaining({ id: tabId, kind: 'untitled', marker: 'dot' }),
    );
    // Another auto-save cycle passes; the folder she might have meant is untouched.
    await edit(page, 'benzene');
    await expectRecorded(page, userData);
    expect(readdirSync(join(dir, 'drawings'))).toEqual(watched);
    expect((await activeTab(page))?.kind).toBe('untitled');
    await finish(app);
  } finally {
    await app.close();
  }
});

test('AS1, A6, SC18: a picture drawing is never written to its picture; the edit is only in the store', async () => {
  const picture = drawings('toluene.png');
  const bytes = withPictureChunks(PIXEL, { dpi: 300, payload: drawingPayload(toluene) });
  writeFileSync(picture, bytes);
  const { app, page } = await launchIn(userData, {
    dialogs: [{ canceled: false, filePaths: [picture] }],
  });
  try {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+o');
    await expect.poll(async () => (await activeTab(page))?.label).toBe('toluene.png');
    expect((await activeTab(page))?.kind).toBe('picture');
    await edit(page, 'ethanol');
    // The timer has fired when the store's record holds the edit (SS4: every kind).
    const { doc } = await expectRecorded(page, userData);
    expect(Object.keys(doc.atoms).length).toBeGreaterThan(Object.keys(toluene.atoms).length);
    await expect.poll(async () => (await activeTab(page))?.marker).toBe('dot');
    // Wait out a further cycle of the timer: nothing else lands beside the picture.
    await edit(page, 'benzene');
    await expectRecorded(page, userData);
    expect(readdirSync(join(dir, 'drawings'))).toEqual(['toluene.png']);
    expect(Buffer.compare(readFileSync(picture), Buffer.from(bytes))).toBe(0);
    await finish(app);
  } finally {
    await app.close();
  }
});

test('AS7 (a), N-A4: no unwritten changes and the file changed outside: replaced as one undo step; Ctrl+Z brings hers back and is written', async () => {
  const file = drawings('esterification.chalk');
  const { app, page } = await launchIn(userData, {
    dialogs: [{ canceled: false, filePath: file }],
  });
  try {
    const hers = await namedEthanol(page, file, 'esterification');
    const other = serialize(toluene);
    writeFileSync(file, other);
    await windowFocused(page);
    await expect.poll(() => shown(page)).toEqual(content(other));
    expect(await lastNotice(page)).toBe(
      'esterification.chalk was changed outside Chalkbond. Press Ctrl+Z to see your earlier version.',
    );
    expect(await activeTab(page)).toEqual(
      expect.objectContaining({ label: 'esterification', kind: 'chalk', marker: 'none' }),
    );
    expect(read(file)).toBe(other);
    expect(await boxes(app)).toEqual([]);
    // Clean: the file is not rewritten by the timer.
    await page.waitForTimeout(2_500);
    expect(read(file)).toBe(other);

    // One undo step gives her earlier drawing; that is a change, and it is written.
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+z');
    await expect.poll(() => text(page)).toBe(hers);
    await expect.poll(() => read(file), { timeout: 5_000 }).toBe(hers);
    expect((await readTabs(page)).length).toBe(1);
    await finish(app);
  } finally {
    await app.close();
  }
});

test('AS7 (c), SC21: unwritten changes and the file changed outside: her tab is kept as "(your changes)", the changed file opens beside it, the file is never overwritten', async () => {
  const file = drawings('esterification.chalk');
  const { app, page } = await launchIn(userData, {
    dialogs: [{ canceled: false, filePath: file }, { response: 0 }],
  });
  try {
    await namedEthanol(page, file, 'esterification');
    const other = serialize(toluene);
    writeFileSync(file, other);
    await edit(page, 'benzene');
    const hers = await text(page);
    // Whichever comes first, the focus check or the timer's own check before its write (AS5 (a)).
    await windowFocused(page);
    await expect.poll(async () => (await readTabs(page)).length).toBe(2);
    const tabs = await readTabs(page);
    expect(tabs[0]).toEqual(
      expect.objectContaining({
        label: 'esterification (your changes)',
        kind: 'kept',
        active: true,
      }),
    );
    expect(tabs[1]).toEqual(
      expect.objectContaining({
        label: 'esterification',
        kind: 'chalk',
        active: false,
        marker: 'none',
      }),
    );
    await expect.poll(async () => (await boxes(app)).length).toBe(1);
    expect((await boxes(app))[0]?.options).toEqual({
      type: 'warning',
      title: 'Chalkbond',
      message: '“esterification.chalk” was changed outside Chalkbond.',
      detail:
        'Your changes are in the tab “esterification (your changes)”. The changed file is open in the tab next to it.',
      buttons: ['OK'],
    });
    // Her tab keeps her drawing; time passes (the 2 s timer and more); the file is untouched.
    expect(await text(page)).toBe(hers);
    await page.waitForTimeout(2_500);
    expect(read(file)).toBe(other);
    // The changed file is open in the next tab, not activated until she goes there.
    await page.getByTestId('tab').nth(1).click();
    await expect.poll(async () => (await activeTab(page))?.label).toBe('esterification');
    expect(await shown(page)).toEqual(content(other));
    // That tab owns the path now: an edit there auto-saves into it, her kept tab never does.
    await edit(page, 'ethanol');
    const continued = await text(page);
    await expect.poll(() => read(file), { timeout: 5_000 }).toBe(continued);
    expect(await boxes(app)).toHaveLength(1);
    expect((await tabOf(page, 'esterification (your changes)'))?.kind).toBe('kept');
    await finish(app);
  } finally {
    await app.close();
  }
});

test('AS7 (c): unwritten changes and the changed file does not open: only her kept tab, the box says so, the file is not written', async () => {
  const file = drawings('esterification.chalk');
  const { app, page } = await launchIn(userData, {
    dialogs: [{ canceled: false, filePath: file }, { response: 0 }],
  });
  try {
    await namedEthanol(page, file, 'esterification');
    const garbage = '{ this is not a drawing';
    writeFileSync(file, garbage);
    await edit(page, 'benzene');
    const hers = await text(page);
    await windowFocused(page);
    await expect
      .poll(async () => (await readTabs(page)).map((t) => [t.label, t.kind]))
      .toEqual([['esterification (your changes)', 'kept']]);
    await expect.poll(async () => (await boxes(app)).length).toBe(1);
    expect((await boxes(app))[0]?.options).toEqual({
      type: 'warning',
      title: 'Chalkbond',
      message: '“esterification.chalk” was changed outside Chalkbond.',
      detail:
        "Chalkbond can't open the changed file. Your changes are in the tab “esterification (your changes)”.",
      buttons: ['OK'],
    });
    expect(await text(page)).toBe(hers);
    await page.waitForTimeout(2_500);
    expect(read(file)).toBe(garbage);
    await finish(app);
  } finally {
    await app.close();
  }
});

test('AS6, item (6): a half-written file leaves the tab bound and unavailable, and it recovers when the file parses', async () => {
  const file = drawings('copy.chalk');
  const { app, page } = await launchIn(userData, {
    dialogs: [{ canceled: false, filePath: file }],
  });
  try {
    const hers = await namedEthanol(page, file, 'copy');
    const whole = serialize(toluene);
    const half = whole.slice(0, Math.floor(whole.length / 2));
    writeFileSync(file, half);
    await windowFocused(page);
    await expect.poll(async () => (await activeTab(page))?.marker).toBe('unavailable');
    expect(await lastNotice(page)).toBe(
      "Couldn't read copy.chalk. Chalkbond keeps your drawing and will try again.",
    );
    // Still bound to its file, drawing kept, nothing written over the half file, no box.
    expect(await activeTab(page)).toEqual(
      expect.objectContaining({ label: 'copy', kind: 'chalk', marker: 'unavailable' }),
    );
    expect(await text(page)).toBe(hers);
    await page.waitForTimeout(2_500);
    expect(read(file)).toBe(half);
    expect(await boxes(app)).toEqual([]);

    // The copy finishes: the next check finds a drawing (AS7 (a)) and the tab is available again.
    writeFileSync(file, whole);
    await windowFocused(page);
    await expect.poll(() => shown(page)).toEqual(content(whole));
    await expect.poll(async () => (await activeTab(page))?.marker).toBe('none');
    expect(read(file)).toBe(whole);
    // Bound again: an edit auto-saves into the same file.
    await edit(page, 'ethanol');
    const edited = await text(page);
    await expect.poll(() => read(file), { timeout: 5_000 }).toBe(edited);
    expect(await boxes(app)).toEqual([]);
    await finish(app);
  } finally {
    await app.close();
  }
});

test('AS6, N-A3: a deleted file with nothing unwritten: unavailable, a notice, no box, never recreated; back when restored', async () => {
  const file = drawings('stick.chalk');
  const { app, page } = await launchIn(userData, {
    dialogs: [{ canceled: false, filePath: file }],
  });
  try {
    const hers = await namedEthanol(page, file, 'stick');
    rmSync(file);
    await windowFocused(page);
    await expect.poll(async () => (await activeTab(page))?.marker).toBe('unavailable');
    expect(await lastNotice(page)).toBe(
      "Can't find stick.chalk right now. Chalkbond keeps your drawing.",
    );
    expect(await boxes(app)).toEqual([]);
    await page.waitForTimeout(2_500);
    expect(existsSync(file)).toBe(false);
    expect(await text(page)).toBe(hers);

    writeFileSync(file, hers);
    await windowFocused(page);
    await expect.poll(async () => (await activeTab(page))?.marker).toBe('none');
    expect(read(file)).toBe(hers);
    expect(await boxes(app)).toEqual([]);
    await finish(app);
  } finally {
    await app.close();
  }
});

test('AS6, AS8: a deleted file with unwritten changes: one box, never recreated, retried and written when it is back', async () => {
  const file = drawings('stick.chalk');
  const { app, page } = await launchIn(userData, {
    dialogs: [{ canceled: false, filePath: file }, { response: 0 }],
  });
  try {
    const first = await namedEthanol(page, file, 'stick');
    rmSync(file);
    await edit(page, 'benzene');
    // The timer's write finds the file missing (AS5 (a)): unavailable, and the box once.
    await expect
      .poll(async () => (await activeTab(page))?.marker, { timeout: 5_000 })
      .toBe('unavailable');
    await expect.poll(async () => (await boxes(app)).length).toBe(1);
    expect((await boxes(app))[0]?.options).toEqual({
      type: 'warning',
      title: 'Chalkbond',
      message: "Couldn't save “stick.chalk”.",
      detail: `It may have been moved, renamed or deleted, or its USB drive was removed. ${TRY_AGAIN}`,
      buttons: ['OK'],
    });
    expect(existsSync(file)).toBe(false);

    // Another change and another timer: still no file, no second box.
    await edit(page, 'ethanol');
    await page.waitForTimeout(2_500);
    expect(existsSync(file)).toBe(false);
    expect(await boxes(app)).toHaveLength(1);

    // The file is back (same bytes as before it went): the next check writes the kept drawing.
    writeFileSync(file, first);
    await windowFocused(page);
    const latest = await text(page);
    await expect.poll(() => read(file), { timeout: 5_000 }).toBe(latest);
    await expect.poll(async () => (await activeTab(page))?.marker).toBe('none');
    expect(await boxes(app)).toHaveLength(1);
    await finish(app);
  } finally {
    await app.close();
  }
});

test('AS6, item (6): a write that is refused (read-only) shows one box, keeps the drawing, retries and writes when allowed again', async () => {
  test.setTimeout(60_000);
  const file = drawings('locked.chalk');
  const folder = join(dir, 'drawings');
  const lock = (on: boolean): void => {
    // Windows: a read-only file refuses the rename over it. Elsewhere: a read-only folder.
    if (process.platform === 'win32') chmodSync(file, on ? 0o444 : 0o666);
    else chmodSync(folder, on ? 0o555 : 0o755);
  };
  const { app, page } = await launchIn(userData, {
    dialogs: [{ canceled: false, filePath: file }, { response: 0 }],
  });
  try {
    const first = await namedEthanol(page, file, 'locked');
    lock(true);
    try {
      await edit(page, 'benzene');
      await expect
        .poll(async () => (await activeTab(page))?.marker, { timeout: 8_000 })
        .toBe('unavailable');
      await expect.poll(async () => (await boxes(app)).length).toBe(1);
      const box = (await boxes(app))[0]?.options ?? {};
      expect(box['type']).toBe('warning');
      expect(box['message']).toBe("Couldn't save “locked.chalk”.");
      expect(String(box['detail'])).toMatch(/Chalkbond isn't allowed to save in this folder/);
      expect(String(box['detail'])).toMatch(
        /Chalkbond keeps your drawing and will try again\. You can also use Save as\.$/,
      );
      expect(read(file)).toBe(first);

      // A later change retries; it fails the same way and says nothing more.
      await edit(page, 'ethanol');
      await page.waitForTimeout(2_500);
      expect(read(file)).toBe(first);
      expect(await boxes(app)).toHaveLength(1);
    } finally {
      lock(false);
    }
    // Allowed again: the next check point finds the file `same` and writes at once.
    await windowFocused(page);
    const latest = await text(page);
    await expect.poll(() => read(file), { timeout: 5_000 }).toBe(latest);
    await expect.poll(async () => (await activeTab(page))?.marker).toBe('none');
    expect(await boxes(app)).toHaveLength(1);
    await finish(app);
  } finally {
    await app.close();
  }
});

test('AS2, SS4, item (2): the timer writes the committed drawing during a drag and changes neither the drag nor the doc', async () => {
  const file = drawings('drag.chalk');
  const { app, page } = await launchIn(userData, {
    dialogs: [{ canceled: false, filePath: file }],
  });
  try {
    await namedEthanol(page, file, 'drag');
    const base = await readDocument(page);
    const oxygenId = Object.keys(base.atoms).find((id) => base.atoms[id as never]?.element === 'O');
    expect(oxygenId).toBeDefined();
    await edit(page, 'benzene');
    const committed = await readDocument(page);
    const committedText = serialize(committed);
    const o = committed.atoms[oxygenId as never] as { x: number; y: number };
    await page.getByTestId('tool-select').click();
    const from = await canvasPoint(page, o);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 30, from.y + 20, { steps: 5 });
    // The timer's write lands while the button is still down: it is the committed drawing.
    await expect.poll(() => read(file), { timeout: 5_000 }).toBe(committedText);
    expect(await text(page)).toBe(committedText);
    await page.mouse.move(from.x + 60, from.y + 40, { steps: 5 });
    await page.mouse.up();
    // The drag was not disturbed: it commits as one step and is written by the next timer.
    await expect.poll(() => text(page)).not.toBe(committedText);
    const moved = await text(page);
    await expect.poll(() => read(file), { timeout: 5_000 }).toBe(moved);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+z');
    await expect.poll(() => text(page)).toBe(committedText);
    await expect.poll(() => read(file), { timeout: 5_000 }).toBe(committedText);
    await finish(app);
  } finally {
    await app.close();
  }
});

test('AS2, SS4, item (2): the timer does not finish an open label editor: the file holds the committed drawing', async () => {
  const file = drawings('label.chalk');
  const { app, page } = await launchIn(userData, {
    dialogs: [{ canceled: false, filePath: file }],
  });
  try {
    await namedEthanol(page, file, 'label');
    await edit(page, 'benzene');
    const committed = await readDocument(page);
    const committedText = serialize(committed);
    const oxygenId = Object.keys(committed.atoms).find(
      (id) => committed.atoms[id as never]?.element === 'O',
    );
    const o = await canvasPoint(
      page,
      committed.atoms[oxygenId as never] as { x: number; y: number },
    );
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Escape');
    await page.mouse.move(o.x, o.y);
    const box = page.getByTestId('textbox-edit');
    await expect(page.getByTestId('statusbar').getByRole('status')).toHaveText(
      'Type O, N, Cl… to change this atom. Enter for any label.',
    );
    await page.keyboard.press('Enter');
    await expect(box).toBeFocused();
    await page.keyboard.type('NH2');
    // The timer's write lands with the editor open; the editor and the doc are as they were.
    await expect.poll(() => read(file), { timeout: 5_000 }).toBe(committedText);
    await expect(box).toBeFocused();
    expect(await box.innerText()).toBe('NH2');
    expect(await text(page)).toBe(committedText);
    expect(read(file)).toBe(committedText);

    await page.keyboard.press('Enter');
    await expect(box).toHaveCount(0);
    const labelled = await text(page);
    expect(labelled).not.toBe(committedText);
    await expect.poll(() => read(file), { timeout: 5_000 }).toBe(labelled);
    await finish(app);
  } finally {
    await app.close();
  }
});

test('AS9: Save as onto a file open in another tab shows the open-in-tab box and writes nothing', async () => {
  const a = drawings('a.chalk');
  const b = drawings('b.chalk');
  const { app, page } = await launchIn(userData, {
    dialogs: [
      { canceled: false, filePath: a },
      { canceled: false, filePath: b },
      { canceled: false, filePath: a }, // Ctrl+Shift+S in tab B, onto tab A's file
      { response: 0 },
    ],
  });
  try {
    const aText = await namedEthanol(page, a, 'a');
    await page.keyboard.press('Control+t');
    await expect.poll(async () => (await readTabs(page)).length).toBe(2);
    await edit(page, 'benzene');
    const bText = await saveAs(page, b, 'b');
    expect(bText).not.toBe(aText);

    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+Shift+s');
    await expect.poll(async () => (await boxes(app)).length).toBe(1);
    expect((await boxes(app))[0]?.options).toEqual({
      type: 'error',
      title: 'Chalkbond',
      message: '“a.chalk” is open in another tab.',
      detail: 'Close that tab first, or choose another name.',
      buttons: ['OK'],
    });
    // Nothing written, nothing rebound: B still writes B, A is as it was.
    expect(read(a)).toBe(aText);
    expect(read(b)).toBe(bText);
    expect((await readTabs(page)).map((t) => [t.label, t.kind, t.active])).toEqual([
      ['a', 'chalk', false],
      ['b', 'chalk', true],
    ]);
    await edit(page, 'ethanol');
    const edited = await text(page);
    await expect.poll(() => read(b), { timeout: 5_000 }).toBe(edited);
    expect(read(a)).toBe(aText);
    await finish(app);
  } finally {
    await app.close();
  }
});
