// A10 (SPEC-app-shell.md ST1, ST2, W1, W2; Settings): the remembered style for new drawings, the
// window across a real close and relaunch with one user-data folder, a garbage or off-screen
// settings.json, and loads (Open of a picture, test hook) never remembered. Every close is real
// (relaunch.ts). On Linux the headless backend reports a 1 × 1 work area, so the W2 checks here
// are relative to the work area; the 1100 × 760 rectangle of the todo is e2e/win/app-window-memory.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { drawingPayload, withPictureChunks } from '../src/core/clipboard-export';
import { setStyle } from '../src/core/doc-model';
import { goldenDoc, loadDocument, readDocument } from './harness';
import { closeForReal, launchWith, windowState, windowTitle, workArea } from './relaunch';

const SIZE: [number, number] = [1280, 800];
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

let userData = '';
test.beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'chalkbond-e2e-settings-'));
});
test.afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

const settingsFile = (): string => join(userData, 'settings.json');
const readSettings = (): Record<string, unknown> | null => {
  try {
    return JSON.parse(readFileSync(settingsFile(), 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
};
const presetOf = async (page: Page): Promise<string> => (await readDocument(page)).style.preset;

test('ST1: switch to Handout, Ctrl+N is Handout, and a relaunch keeps it', async () => {
  // The switch makes the drawing dirty: Ctrl+N asks; "Don't save" (1).
  let { app, page } = await launchWith(userData, {
    size: SIZE,
    launch: { dialogs: [{ response: 1 }] },
  });
  await page.getByTestId('preset-handout').click();
  await expect(page.getByTestId('preset-handout')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Control+n');
  await expect.poll(() => windowTitle(app)).toBe('Untitled - Chalkbond');
  expect(await presetOf(page)).toBe('journal');
  await expect(page.getByTestId('preset-handout')).toHaveAttribute('aria-checked', 'true');
  await closeForReal(app);
  expect(readSettings()?.['newDrawingStyle']).toBe('journal');
  ({ app, page } = await launchWith(userData, { size: SIZE }));
  try {
    expect(await presetOf(page)).toBe('journal');
    await expect(page.getByTestId('preset-handout')).toHaveAttribute('aria-checked', 'true');
  } finally {
    await closeForReal(app);
  }
});

test('ST1: a Handout picture opened (Open) or a drawing loaded (test hook) is not remembered', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chalkbond-e2e-handout-'));
  const file = join(dir, 'toluene.png');
  const handout = setStyle(goldenDoc('toluene'), { preset: 'journal' });
  writeFileSync(file, withPictureChunks(PIXEL, { dpi: 300, payload: drawingPayload(handout) }));
  try {
    let { app, page } = await launchWith(userData, {
      size: SIZE,
      launch: { dialogs: [{ canceled: false, filePaths: [file] }] },
    });
    await loadDocument(page, setStyle(goldenDoc('ethanol'), { preset: 'journal' }));
    expect(await presetOf(page)).toBe('journal');
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+o');
    await expect.poll(() => windowTitle(app)).toBe('toluene.png - Chalkbond');
    expect(await presetOf(page)).toBe('journal');
    await expect(page.getByTestId('preset-handout')).toHaveAttribute('aria-checked', 'true');
    await closeForReal(app);
    expect(readSettings()?.['newDrawingStyle']).toBe('slides');
    ({ app, page } = await launchWith(userData, { size: SIZE }));
    expect(await presetOf(page)).toBe('slides');
    await closeForReal(app);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('W2: a real close stores the normal bounds and maximized flag; a relaunch restores them', async () => {
  let { app } = await launchWith(userData);
  const atClose = await windowState(app);
  await closeForReal(app);
  expect(readSettings()?.['window']).toEqual({ ...atClose?.normal, maximized: atClose?.maximized });

  // A stored window covering the work area, not maximized: restored as stored (W1 would differ
  // on the headless backend, where it maximizes).
  ({ app } = await launchWith(userData));
  const area = await workArea(app);
  await closeForReal(app);
  const base = readSettings() ?? {};
  writeFileSync(settingsFile(), JSON.stringify({ ...base, window: { ...area, maximized: false } }));
  ({ app } = await launchWith(userData));
  expect(await windowState(app)).toEqual({ normal: area, maximized: false });
  await closeForReal(app);

  // Maximized: applied after the bounds, so the normal bounds stay the stored ones.
  writeFileSync(settingsFile(), JSON.stringify({ ...base, window: { ...area, maximized: true } }));
  ({ app } = await launchWith(userData));
  try {
    expect(await windowState(app)).toEqual({ normal: area, maximized: true });
  } finally {
    await closeForReal(app);
  }
  expect(readSettings()?.['window']).toEqual({ ...area, maximized: true });
});

test('W2: bounds stored at x = 10 000 fall back to W1', async () => {
  // W1 as a first launch places it, measured with a fresh user-data folder.
  let { app } = await launchWith(userData);
  const first = await windowState(app);
  await closeForReal(app);
  writeFileSync(
    settingsFile(),
    JSON.stringify({
      ...readSettings(),
      window: { x: 10_000, y: 80, width: 1100, height: 760, maximized: false },
    }),
  );
  ({ app } = await launchWith(userData));
  try {
    expect(await windowState(app)).toEqual(first);
  } finally {
    await closeForReal(app);
  }
});

test('a garbage settings.json: the app starts with defaults and the file is rewritten valid', async () => {
  writeFileSync(settingsFile(), '\u0000garbage{{{ not json');
  const { app, page } = await launchWith(userData, { size: SIZE });
  try {
    expect((await page.evaluate(() => window.chalkbond.startup())).settings).toEqual({
      newDrawingStyle: 'slides',
      export: { format: 'png', pngDpi: 300, pngWhite: false },
    });
    expect(await presetOf(page)).toBe('slides');
    await expect.poll(readSettings).toEqual({
      version: 1,
      newDrawingStyle: 'slides',
      export: { format: 'png', pngDpi: 300, pngWhite: false },
      window: null,
      recent: [],
      folders: { open: null, save: null, export: null },
    });
    expect(readFileSync(join(userData, 'logs', 'main.log'), 'utf8')).toMatch(/settings.*broken/i);
  } finally {
    await closeForReal(app);
  }
});

test('ST2: startup and I8 carry no path; I8 rejects a folder and stores Export choices', async () => {
  const { app, page } = await launchWith(userData, { size: SIZE });
  try {
    const startup = await page.evaluate(() => window.chalkbond.startup());
    expect(Object.keys(startup.settings).sort()).toEqual(['export', 'newDrawingStyle']);
    const rejected = await page.evaluate(() =>
      window.chalkbond.setSettings({ folders: { open: '/etc' } } as never).then(
        () => 'accepted',
        () => 'rejected',
      ),
    );
    expect(rejected).toBe('rejected');
    await page.evaluate(() =>
      window.chalkbond.setSettings({ export: { format: 'svg', pngDpi: 600, pngWhite: true } }),
    );
    await expect
      .poll(() => readSettings()?.['export'])
      .toEqual({ format: 'svg', pngDpi: 600, pngWhite: true });
    expect(readSettings()?.['folders']).toEqual({ open: null, save: null, export: null });
  } finally {
    await closeForReal(app);
  }
});
