// A11 (SPEC-app-shell.md K1–K3, W6; SC12): host keys with the native menu installed. The menu
// registers no accelerator, so every key reaches the page: K1 for the host, the rest for the
// editor or the focused text field.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { menuItem } from './app-menu';
import { loadScheme } from './fixtures';
import {
  canvasPoint,
  menuRequests,
  openApp,
  readDocument,
  readSelection,
  readTabs,
} from './harness';

type DialogLog = { method: string; options: Record<string, unknown> }[];
const dialogLog = async (app: ElectronApplication): Promise<DialogLog> =>
  (await app.evaluate(
    () => (globalThis as { __chalkbondDialogLog?: DialogLog }).__chalkbondDialogLog ?? [],
  )) as DialogLog;
const atoms = async (page: Page): Promise<number> =>
  Object.keys((await readDocument(page)).atoms).length;
const hint = (page: Page) => page.getByTestId('statusbar').getByRole('status');

test('K1: every host key reaches its action with the menu installed', async () => {
  const { app, page } = await openApp({
    launch: {
      clipboardMemory: true,
      dialogs: [
        { canceled: true, filePaths: [] }, // Ctrl+O
        { canceled: true }, // Ctrl+S (Untitled → Save as)
        { canceled: true }, // Ctrl+Shift+S
      ],
    },
  });
  try {
    await loadScheme(page);
    const total = await atoms(page);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+o');
    await expect.poll(async () => (await dialogLog(app)).length).toBe(1);
    await page.keyboard.press('Control+s');
    await expect.poll(async () => (await dialogLog(app)).length).toBe(2);
    await page.keyboard.press('Control+Shift+s');
    await expect.poll(async () => (await dialogLog(app)).length).toBe(3);
    expect((await dialogLog(app)).map((d) => d.method)).toEqual([
      'showOpenDialog',
      'showSaveDialog',
      'showSaveDialog',
    ]);

    await page.keyboard.press('Control+e');
    await expect(page.getByTestId('export-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('export-dialog')).toHaveCount(0);

    // Ctrl+C with nothing selected copies the whole drawing (CB-C1); Ctrl+V pastes it (CB-P1).
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+c');
    await expect(hint(page)).toHaveText(
      'Copied the whole drawing. Paste into PowerPoint or Word with Ctrl+V.',
    );
    await page.keyboard.press('Control+v');
    await expect.poll(() => atoms(page)).toBe(2 * total);

    // The editor's own Ctrl rows still work: the readout is Zoom to 100% (R49; Ctrl+1 is no
    // longer its key, R59), Ctrl+= zooms in.
    await page.getByTestId('zoom-reset').click();
    await page.getByTestId('canvas').focus();
    await expect(page.getByTestId('zoom-reset')).toHaveText('100%');
    await page.keyboard.press('Control+=');
    await expect(page.getByTestId('zoom-reset')).toHaveText('125%');

    // T7 (R36): Ctrl+N is a new tab; nothing is asked.
    await page.keyboard.press('Control+n');
    await expect.poll(() => atoms(page)).toBe(0);
    expect((await readTabs(page)).map((t) => t.label)).toEqual(['Untitled', 'Untitled 2']);
    expect(await dialogLog(app)).toHaveLength(3);
  } finally {
    await app.close();
  }
});

test('Ctrl+F outside the editor root focuses the name field; inside, the editor does it', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').waitFor();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await page.keyboard.press('Control+f');
    await expect(page.getByTestId('namefield-input')).toBeFocused();
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+f');
    await expect(page.getByTestId('namefield-input')).toBeFocused();
  } finally {
    await app.close();
  }
});

test('text targets keep their keys: Ctrl+A and Ctrl+V in the name field stay the field’s', async () => {
  const { app, page } = await openApp({ launch: { clipboardMemory: true } });
  try {
    await loadScheme(page);
    const input = page.getByTestId('namefield-input');
    await input.click();
    await page.keyboard.type('ethanol');
    await page.keyboard.press('Control+a');
    expect(
      await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]),
    ).toEqual([0, 7]);
    expect(await readSelection(page)).toEqual({ atoms: [], bonds: [], objects: [] });
    const before = await atoms(page);
    await page.keyboard.press('Control+v'); // native text paste, never CB-P1
    expect(await atoms(page)).toBe(before);
    await expect(input).toBeFocused();
    // The file keys still act from the name field (K1), and the menu says M3 there.
    await expect.poll(async () => (await menuItem(app, 'edit.duplicate')).enabled).toBe(false);
  } finally {
    await app.close();
  }
});

test('K3 (R32): after an Alt+click the Alt key-up is consumed and opens nothing; a lone Alt and F10 ask for the menu', async () => {
  const { app, page } = await openApp();
  try {
    await loadScheme(page);
    await page.evaluate(() => {
      const log: boolean[] = [];
      (window as { __altUps?: boolean[] }).__altUps = log;
      window.addEventListener('keyup', (e) => {
        if (e.key === 'Alt') log.push(e.defaultPrevented);
      });
    });
    const ups = () => page.evaluate(() => (window as { __altUps?: boolean[] }).__altUps ?? []);
    const atom = Object.values((await readDocument(page)).atoms)[0];
    if (!atom) throw new Error('no atom');
    const point = await canvasPoint(page, atom);
    await page.getByTestId('tool-select').click();
    await page.keyboard.down('Alt');
    await page.mouse.click(point.x, point.y);
    await page.keyboard.up('Alt');
    await expect.poll(ups).toEqual([true]);
    expect(await menuRequests(page)).toBe(0);
    // Editor Decision 6: Alt+click picked one atom; the next key goes to the editor.
    expect((await readSelection(page)).atoms).toHaveLength(1);
    await page.mouse.move(5, 5); // off the atom: B is then the Bond tool, not bromine
    await page.keyboard.press('b');
    await expect(page.getByTestId('tool-bond')).toHaveAttribute('aria-pressed', 'true');

    // K3: a lone Alt asks for the menu on its key-up (prevented); TB26 opens the ☰ menu there.
    await page.keyboard.press('Alt');
    await expect.poll(ups).toEqual([true, true]);
    await expect.poll(() => menuRequests(page)).toBe(1);
    // Alt+click, then another key before Alt goes up: disarmed, Alt-up not consumed.
    await page.getByTestId('tool-select').click();
    await page.keyboard.down('Alt');
    await page.mouse.click(point.x, point.y);
    await page.keyboard.press('Shift');
    await page.keyboard.up('Alt');
    await expect.poll(ups).toEqual([true, true, false]);
    expect(await menuRequests(page)).toBe(1);
    // K1, M4: F10 alone asks for the menu too.
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('F10');
    await expect.poll(() => menuRequests(page)).toBe(2);
  } finally {
    await app.close();
  }
});

test('SC12/W6: at 960×640 content with the menu bar the rail’s Text button is fully visible', async () => {
  const { app, page } = await openApp({ size: [960, 640] });
  try {
    await page.getByTestId('canvas').waitFor();
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.isMenuBarVisible(),
      ),
    ).toBe(true);
    // The window cannot be made smaller than 960×640 content (W6; the menu bar is frame).
    const content = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.setSize(200, 200);
      return win?.getContentSize();
    });
    expect(content?.[0]).toBeGreaterThanOrEqual(960);
    expect(content?.[1]).toBeGreaterThanOrEqual(640);
    await page.waitForFunction(() => window.innerWidth >= 960 && window.innerHeight >= 640);
    const text = await page.getByTestId('tool-text').boundingBox();
    const rail = await page.getByTestId('rail').boundingBox();
    if (!text || !rail) throw new Error('no rail');
    expect(text.y).toBeGreaterThanOrEqual(rail.y);
    expect(text.y + text.height).toBeLessThanOrEqual(rail.y + rail.height);
    expect(text.y + text.height).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
  } finally {
    await app.close();
  }
});
