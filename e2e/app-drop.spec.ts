// A15 drag and drop (SPEC-app-shell.md F12, SEC14, R22, "Drop overlay"): a disk-backed File
// dropped on the window opens through I3 (path read in the sandboxed preload); other files show
// F14; a JS-made File is unsupported with an empty name; a dialog open → no overlay, no open.
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { serialize } from '../src/core/doc-model';
import { dispatchDrag, dropStaged, stageFiles } from './drop-steps';
import { goldenDoc, insertName, openApp, readDocument } from './harness';
import { windowTitle } from './relaunch';

type DialogLog = { method: string; options: Record<string, unknown> }[];
const dialogLog = async (app: ElectronApplication): Promise<DialogLog> =>
  (await app.evaluate(
    () => (globalThis as { __chalkbondDialogLog?: DialogLog }).__chalkbondDialogLog ?? [],
  )) as DialogLog;
const overlay = (page: Page) => page.getByTestId('drop-overlay');

let dir: string;
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chalkbond-drop-'));
});
test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('F12: a Files drag shows the A13 overlay; dropping a .chalk opens it through the preload', async () => {
  const file = join(dir, 'ethanol.chalk');
  writeFileSync(file, serialize(goldenDoc('ethanol')));
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    await stageFiles(page, [file]);
    expect(await dispatchDrag(page, 'dragenter')).toBe(true);
    await expect(overlay(page)).toBeVisible();
    expect(await overlay(page).getAttribute('aria-hidden')).toBe('true');
    // Covers the whole page; the dashed box is inset 8 px; the lines are centred, 4 px apart.
    const geometry = await page.evaluate(() => {
      const rect = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(sel);
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      };
      const box = document.querySelector('.drop-box');
      const style = box ? getComputedStyle(box) : null;
      const bg = getComputedStyle(document.querySelector('.drop') as Element).backgroundColor;
      return {
        page: { w: innerWidth, h: innerHeight },
        drop: rect('.drop'),
        box: rect('.drop-box'),
        title: rect('.drop-title'),
        sub: rect('.drop-sub'),
        border: style
          ? `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`
          : '',
        radius: style?.borderTopLeftRadius,
        bg,
        accent: (() => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--accent)';
          document.body.append(probe);
          const colour = getComputedStyle(probe).color;
          probe.remove();
          return colour;
        })(),
      };
    });
    expect(geometry.drop).toEqual({ x: 0, y: 0, w: geometry.page.w, h: geometry.page.h });
    expect(geometry.box).toEqual({ x: 8, y: 8, w: geometry.page.w - 16, h: geometry.page.h - 16 });
    expect(geometry.border).toBe(`2px dashed ${geometry.accent}`);
    expect(geometry.radius).toBe('6px');
    expect(geometry.bg).toBe('rgba(227, 236, 251, 0.94)');
    const centre = geometry.page.w / 2;
    expect(Math.abs(geometry.title.x + geometry.title.w / 2 - centre)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.sub.x + geometry.sub.w / 2 - centre)).toBeLessThanOrEqual(1);
    expect(Math.round(geometry.sub.y - (geometry.title.y + geometry.title.h))).toBe(4);
    const middle = (geometry.title.y + geometry.sub.y + geometry.sub.h) / 2;
    expect(Math.abs(middle - geometry.page.h / 2)).toBeLessThanOrEqual(1);
    await expect(page.locator('.drop-title')).toHaveText('Drop to open');
    await expect(page.locator('.drop-sub')).toHaveText(
      'Chalkbond drawings (.chalk) and pictures made in Chalkbond (.png, .svg, .pdf)',
    );
    expect(await dispatchDrag(page, 'dragover')).toBe(true);
    expect(await dispatchDrag(page, 'drop')).toBe(true);
    await expect(overlay(page)).toHaveCount(0);
    await expect.poll(() => windowTitle(app)).toBe('ethanol - Chalkbond');
    expect((await readDocument(page)).atoms).toEqual(goldenDoc('ethanol').atoms);
    expect(await dialogLog(app)).toEqual([]);
  } finally {
    await app.close();
  }
});

test('F12: dragleave of the window and Esc hide the overlay; a text drag shows none and is not prevented', async () => {
  const file = join(dir, 'ethanol.chalk');
  writeFileSync(file, serialize(goldenDoc('ethanol')));
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    await stageFiles(page, [file]);
    await dispatchDrag(page, 'dragenter');
    await expect(overlay(page)).toBeVisible();
    await dispatchDrag(page, 'dragleave');
    await expect(overlay(page)).toHaveCount(0);
    await dispatchDrag(page, 'dragenter');
    await expect(overlay(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(overlay(page)).toHaveCount(0);
    expect(await dispatchDrag(page, 'dragenter', 'ethanol')).toBe(false);
    expect(await dispatchDrag(page, 'dragover', 'ethanol')).toBe(false);
    await expect(overlay(page)).toHaveCount(0);
    expect(await windowTitle(app)).toBe('Untitled - Chalkbond');
  } finally {
    await app.close();
  }
});

test('F12, F14: a .docx drop → "can\'t open" (with .pdf); a too-large and a vanished file → their boxes', async () => {
  const notes = join(dir, 'notes.docx');
  writeFileSync(notes, 'not a drawing');
  const big = join(dir, 'big.chalk');
  writeFileSync(big, '{');
  truncateSync(big, 20 * 1024 * 1024 + 1);
  const gone = join(dir, 'gone.chalk');
  writeFileSync(gone, serialize(goldenDoc('ethanol')));
  const { app, page } = await openApp({
    launch: { dialogs: [{ response: 0 }, { response: 0 }, { response: 0 }] },
  });
  try {
    const drawn = await readDocument(page);
    await stageFiles(page, [notes]);
    await dropStaged(page);
    await expect.poll(async () => (await dialogLog(app)).length).toBe(1);
    await stageFiles(page, [big]);
    await dropStaged(page);
    await expect.poll(async () => (await dialogLog(app)).length).toBe(2);
    await stageFiles(page, [gone]);
    rmSync(gone);
    await dropStaged(page);
    await expect.poll(async () => (await dialogLog(app)).length).toBe(3);
    expect((await dialogLog(app)).map((d) => [d.options['message'], d.options['detail']])).toEqual([
      [
        "Chalkbond can't open “notes.docx”.",
        'It opens Chalkbond drawings (.chalk) and pictures made in Chalkbond (.png, .svg, .pdf).',
      ],
      [
        '“big.chalk” is too large to open.',
        'Drawings can be up to 20 MB. Pictures made in Chalkbond can be up to 64 MB.',
      ],
      ["“gone.chalk” can't be found.", 'It may have been moved, renamed or deleted.'],
    ]);
    expect(await readDocument(page)).toEqual(drawn);
    expect(await windowTitle(app)).toBe('Untitled - Chalkbond');
  } finally {
    await app.close();
  }
});

test('SEC14: webUtils works in the sandboxed preload; a JS-made File is unsupported with an empty name', async () => {
  const file = join(dir, 'ethanol.chalk');
  writeFileSync(file, serialize(goldenDoc('ethanol')));
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    expect(
      await app.evaluate(
        ({ BrowserWindow }) =>
          (
            BrowserWindow.getAllWindows()[0]?.webContents as unknown as {
              getLastWebPreferences(): Electron.WebPreferences;
            }
          ).getLastWebPreferences().sandbox,
      ),
    ).toBe(true);
    const made = await page.evaluate(() =>
      window.chalkbond.openDroppedFile(new File(['{}'], 'ethanol.chalk')),
    );
    expect(made).toEqual({ ok: false, problem: 'unsupported', name: '' });
    await stageFiles(page, [file]);
    const real = await page.evaluate(() => {
      const input = document.getElementById('drop-probe') as HTMLInputElement;
      const staged = input.files?.[0];
      if (!staged) throw new Error('no staged file');
      return window.chalkbond.openDroppedFile(staged);
    });
    expect(real).toMatchObject({ ok: true, ref: { name: 'ethanol.chalk', kind: 'chalk' } });
    expect(JSON.stringify(real)).not.toContain(dir);
    // Asking for a ref opens nothing by itself, and the made-up File opened nothing either.
    expect(await windowTitle(app)).toBe('Untitled - Chalkbond');
    expect(await dialogLog(app)).toEqual([]);
  } finally {
    await app.close();
  }
});

test('R22: while Keyboard shortcuts is open a drag shows no overlay and a drop opens nothing, navigation prevented', async () => {
  const file = join(dir, 'ethanol.chalk');
  writeFileSync(file, serialize(goldenDoc('ethanol')));
  const { app, page } = await openApp({ launch: { dialogs: [] } });
  try {
    await insertName(page, 'benzene');
    const drawn = await readDocument(page);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('F1');
    await expect(page.getByTestId('shortcuts-dialog')).toBeVisible();
    await stageFiles(page, [file]);
    expect(await dispatchDrag(page, 'dragenter')).toBe(true);
    await expect(overlay(page)).toHaveCount(0);
    expect(await dispatchDrag(page, 'dragover')).toBe(true);
    expect(await dispatchDrag(page, 'drop')).toBe(true);
    await expect(page.getByTestId('shortcuts-dialog')).toBeVisible();
    // Give an (unwanted) open every chance to start: it would read the file and change the title.
    await page.getByTestId('shortcuts-dialog').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('shortcuts-dialog')).toHaveCount(0);
    expect(await windowTitle(app)).toBe('*Untitled - Chalkbond');
    expect(await readDocument(page)).toEqual(drawn);
    expect(await dialogLog(app)).toEqual([]);
  } finally {
    await app.close();
  }
});
