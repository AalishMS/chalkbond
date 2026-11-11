// A11 (SPEC-app-shell.md M1–M3; SC2): the native application menu with the built app. Every item
// displays its shortcut and registers none, has no role, and runs its command when clicked by id.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { clickEnabled, clickMenu, menuItem, menuItems } from './app-menu';
import { loadScheme } from './fixtures';
import { heardCommands, openApp, readDocument, readSelection } from './harness';

const atoms = async (page: Page): Promise<number> =>
  Object.keys((await readDocument(page)).atoms).length;
const preset = async (page: Page): Promise<string> => (await readDocument(page)).style.preset;
const readout = (page: Page) => page.getByTestId('zoom-reset');
type DialogLog = { method: string; options: Record<string, unknown> }[];
const dialogLog = async (app: ElectronApplication): Promise<DialogLog> =>
  (await app.evaluate(
    () => (globalThis as { __chalkbondDialogLog?: DialogLog }).__chalkbondDialogLog ?? [],
  )) as DialogLog;

const APPLICATION_IDS = [
  'file.new',
  'file.open',
  'file.recent',
  'file.recent.clear',
  'file.save',
  'file.save-as',
  'file.export',
  'file.exit',
  'edit.undo',
  'edit.redo',
  'edit.cut',
  'edit.copy',
  'edit.paste',
  'edit.duplicate',
  'edit.delete',
  'edit.select-all',
  'view.zoom-in',
  'view.zoom-out',
  'view.zoom-fit',
  'view.zoom-reset',
  'view.style-slides',
  'view.style-handout',
  'help.shortcuts',
  'help.about',
];

test('M2/R1: the menu bar is ours, every item registers no accelerator and has no role', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').waitFor();
    const items = await menuItems(app);
    expect(
      items.filter((i) => ['file', 'edit', 'view', 'help'].includes(i.id)).map((i) => i.label),
    ).toEqual(['&File', '&Edit', '&View', '&Help']);
    expect(items.map((i) => i.id).filter((id) => id.includes('.'))).toEqual(APPLICATION_IDS);
    for (const item of items) {
      expect(item.registerAccelerator, item.id || item.label).toBe(false);
      expect(item.role, item.id).toBeNull();
    }
    expect((await menuItem(app, 'view.zoom-reset')).label).toBe('Zoom to &100%');
    expect((await menuItem(app, 'view.zoom-reset')).accelerator).toBe('CmdOrCtrl+1');
    expect((await menuItem(app, 'help.shortcuts')).accelerator).toBe('F1');
    // The window keeps its menu bar visible (W4).
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.isMenuBarVisible(),
      ),
    ).toBe(true);
  } finally {
    await app.close();
  }
});

test('SC2: Edit and View items run their commands; labels and enabled states follow the editor', async () => {
  const { app, page } = await openApp({ launch: { clipboardMemory: true } });
  try {
    await page.getByTestId('canvas').waitFor();
    // Empty drawing: Copy whole drawing and Export are disabled, Undo is plain.
    await expect.poll(async () => (await menuItem(app, 'edit.copy')).enabled).toBe(false);
    expect(await menuItem(app, 'edit.copy')).toMatchObject({ label: '&Copy whole drawing' });
    expect(await menuItem(app, 'file.export')).toMatchObject({ enabled: false });
    expect(await menuItem(app, 'edit.undo')).toMatchObject({ label: '&Undo', enabled: false });

    const scheme = await loadScheme(page);
    const total = Object.keys(scheme.atoms).length;
    await expect.poll(async () => (await menuItem(app, 'edit.copy')).enabled).toBe(true);
    expect((await menuItem(app, 'edit.undo')).label).toMatch(/^&Undo [a-z]/);
    expect(await menuItem(app, 'edit.cut')).toMatchObject({ enabled: false });

    await clickEnabled(app, 'edit.select-all');
    await expect.poll(async () => (await readSelection(page)).atoms.length).toBe(total);
    await expect.poll(async () => (await menuItem(app, 'edit.copy')).label).toBe('&Copy');
    expect(await menuItem(app, 'edit.cut')).toMatchObject({ enabled: true });

    await clickEnabled(app, 'edit.copy');
    await expect(page.getByTestId('statusbar').getByRole('status')).toContainText('Copied');
    await clickEnabled(app, 'edit.delete');
    await expect.poll(() => atoms(page)).toBe(0);
    await expect.poll(async () => (await menuItem(app, 'edit.undo')).enabled).toBe(true);
    await clickEnabled(app, 'edit.undo');
    await expect.poll(() => atoms(page)).toBe(total);
    await expect.poll(async () => (await menuItem(app, 'edit.redo')).enabled).toBe(true);
    expect((await menuItem(app, 'edit.redo')).label).toMatch(/^&Redo [a-z]/);
    await clickEnabled(app, 'edit.redo');
    await expect.poll(() => atoms(page)).toBe(0);
    await clickEnabled(app, 'edit.undo');
    await expect.poll(() => atoms(page)).toBe(total);

    await clickEnabled(app, 'edit.select-all');
    await clickEnabled(app, 'edit.duplicate');
    await expect.poll(() => atoms(page)).toBe(2 * total);
    await expect.poll(async () => (await menuItem(app, 'edit.cut')).enabled).toBe(true);
    await clickEnabled(app, 'edit.cut');
    await expect.poll(() => atoms(page)).toBe(total);
    await expect.poll(async () => (await menuItem(app, 'edit.paste')).enabled).toBe(true);
    await clickEnabled(app, 'edit.paste');
    await expect.poll(() => atoms(page)).toBe(2 * total);

    // View: zoom steps, Zoom to 100% (R18), fit; the style radios.
    await clickEnabled(app, 'view.zoom-reset');
    await expect(readout(page)).toHaveText('100%');
    await clickEnabled(app, 'view.zoom-in');
    await expect(readout(page)).toHaveText('125%');
    await clickEnabled(app, 'view.zoom-out');
    await clickEnabled(app, 'view.zoom-out');
    await expect(readout(page)).toHaveText('90%');
    await clickEnabled(app, 'view.zoom-fit');
    await expect(readout(page)).not.toHaveText('90%');
    await clickEnabled(app, 'view.zoom-reset');
    await expect(readout(page)).toHaveText('100%');
    for (let i = 0; i < 6; i++) await clickEnabled(app, 'view.zoom-out'); // 90 75 67 50 33 25
    await expect(readout(page)).toHaveText('25%');
    await expect.poll(async () => (await menuItem(app, 'view.zoom-out')).enabled).toBe(false);
    expect(await menuItem(app, 'view.zoom-in')).toMatchObject({ enabled: true });

    expect(await menuItem(app, 'view.style-slides')).toMatchObject({ checked: true });
    await clickEnabled(app, 'view.style-handout');
    await expect.poll(() => preset(page)).toBe('journal');
    await expect.poll(async () => (await menuItem(app, 'view.style-handout')).checked).toBe(true);
    expect(await menuItem(app, 'view.style-slides')).toMatchObject({ checked: false });
    await clickEnabled(app, 'view.style-slides');
    await expect.poll(() => preset(page)).toBe('slides');

    await clickEnabled(app, 'help.shortcuts');
    await expect.poll(() => heardCommands(page)).toContain('help.shortcuts');
    expect(await heardCommands(page)).toEqual(
      expect.arrayContaining(['edit.select-all', 'view.zoom-reset', 'view.style-handout']),
    );
  } finally {
    await app.close();
  }
});

test('SC2: File items run New, Open, Save, Save as, Export and Exit with scripted boxes', async () => {
  const { app, page } = await openApp({
    launch: {
      dialogs: [
        { canceled: true, filePaths: [] }, // file.open
        { canceled: true }, // file.save (Untitled → Save as)
        { canceled: true }, // file.save-as
        { response: 1 }, // file.new → Don't save
        { response: 2 }, // file.exit → Cancel
      ],
    },
  });
  try {
    await loadScheme(page);
    await clickEnabled(app, 'file.open');
    await expect
      .poll(async () => (await dialogLog(app)).map((d) => d.method))
      .toEqual(['showOpenDialog']);
    await clickEnabled(app, 'file.save');
    await expect.poll(async () => (await dialogLog(app)).length).toBe(2);
    await clickEnabled(app, 'file.save-as');
    await expect.poll(async () => (await dialogLog(app)).length).toBe(3);
    expect((await dialogLog(app)).slice(1).map((d) => d.method)).toEqual([
      'showSaveDialog',
      'showSaveDialog',
    ]);

    await clickEnabled(app, 'file.export');
    await expect(page.getByTestId('export-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('export-dialog')).toHaveCount(0);

    await clickEnabled(app, 'file.new');
    await expect.poll(() => atoms(page)).toBe(0);
    expect((await dialogLog(app))[3]?.options['buttons']).toEqual(['Save', "Don't save", 'Cancel']);

    await loadScheme(page);
    await clickEnabled(app, 'file.exit');
    await expect.poll(async () => (await dialogLog(app)).length).toBe(5);
    // Cancel: the window stays and the drawing is kept.
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    expect(await atoms(page)).toBeGreaterThan(0);
  } finally {
    await app.close();
  }
});

test('M1 modal: while the Export dialog is open every item is disabled and clicks do nothing', async () => {
  const { app, page } = await openApp();
  try {
    await loadScheme(page);
    await page.keyboard.press('Control+e');
    await expect(page.getByTestId('export-dialog')).toBeVisible();
    await expect
      .poll(async () => (await menuItems(app)).filter((i) => i.id.includes('.') && i.enabled))
      .toEqual([]);
    const before = await readDocument(page);
    const zoom = await readout(page).innerText();
    await clickMenu(app, 'edit.select-all');
    await clickMenu(app, 'view.zoom-reset');
    await clickMenu(app, 'file.exit');
    expect(await readSelection(page)).toEqual({ atoms: [], bonds: [], objects: [] });
    expect(await readDocument(page)).toEqual(before);
    await expect(readout(page)).toHaveText(zoom);
    expect(zoom).not.toBe('100%');
    await expect(page.getByTestId('export-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await menuItem(app, 'edit.select-all')).enabled).toBe(true);
  } finally {
    await app.close();
  }
});

test('M3: with the name field focused, Edit acts on its text; Duplicate is disabled', async () => {
  const { app, page } = await openApp();
  try {
    await loadScheme(page);
    await clickEnabled(app, 'edit.select-all');
    await expect.poll(async () => (await readSelection(page)).atoms.length).toBeGreaterThan(0);
    const input = page.getByTestId('namefield-input');
    await input.click();
    await page.keyboard.type('ethanol');
    await expect.poll(async () => (await menuItem(app, 'edit.undo')).label).toBe('&Undo');
    for (const id of [
      'edit.undo',
      'edit.redo',
      'edit.cut',
      'edit.copy',
      'edit.paste',
      'edit.delete',
      'edit.select-all',
    ])
      expect(await menuItem(app, id), id).toMatchObject({ enabled: true });
    expect(await menuItem(app, 'edit.copy')).toMatchObject({ label: '&Copy' });
    expect(await menuItem(app, 'edit.duplicate')).toMatchObject({ enabled: false });

    const before = await readSelection(page);
    await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(7, 7));
    await clickMenu(app, 'edit.select-all');
    await expect
      .poll(() => input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]))
      .toEqual([0, 7]);
    // The drawing's selection is untouched: the field got the select-all.
    expect(await readSelection(page)).toEqual(before);
    await expect(input).toBeFocused();
    await clickMenu(app, 'edit.delete');
    await expect(input).toHaveValue('');

    await page.getByTestId('canvas').focus();
    await expect.poll(async () => (await menuItem(app, 'edit.undo')).label).toMatch(/^&Undo [a-z]/);
  } finally {
    await app.close();
  }
});

test('the label editor open: file items and Keyboard shortcuts are disabled (idle rule)', async () => {
  const { app, page } = await openApp();
  try {
    await loadScheme(page);
    await page.getByTestId('tool-text').click();
    await page.getByTestId('canvas').click({ position: { x: 300, y: 650 } });
    await expect(page.getByTestId('textbox-edit')).toBeFocused();
    await expect.poll(async () => (await menuItem(app, 'file.save')).enabled).toBe(false);
    for (const id of [
      'file.new',
      'file.open',
      'file.save-as',
      'file.export',
      'help.shortcuts',
      'view.style-slides',
    ])
      expect(await menuItem(app, id), id).toMatchObject({ enabled: false });
    for (const id of ['file.exit', 'help.about', 'view.zoom-fit', 'view.zoom-reset'])
      expect(await menuItem(app, id), id).toMatchObject({ enabled: true });
  } finally {
    await app.close();
  }
});
