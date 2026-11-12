// A11, A19 (SPEC-app-shell.md M1-M5, R32, R46, R47, SC2, SC16): there is no application menu; the
// ☰ button, Alt and F10 open one native popup of File, Edit, View and Help. Every item displays its
// shortcut and registers none, has no role, and runs its command when chosen by id through the
// stubbed `Menu.prototype.popup`.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import {
  clickEnabled,
  clickMenu,
  menuItem,
  menuItems,
  popupPoints,
  popups,
  stubPopup,
} from './app-menu';
import { loadScheme } from './fixtures';
import {
  expectNoNetwork,
  heardCommands,
  openApp,
  readDocument,
  readSelection,
  readTabs,
} from './harness';

const atoms = async (page: Page): Promise<number> =>
  Object.keys((await readDocument(page)).atoms).length;
const preset = async (page: Page): Promise<string> => (await readDocument(page)).style.preset;
const readout = (page: Page) => page.getByTestId('zoom-reset');
const button = (page: Page) => page.getByTestId('app-menu');
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
  'file.reopen-tab',
  'file.close-tab',
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

/**
 * Holds the next popup open until `release()` (a native menu stays up until a choice or Esc), so a
 * test can look at the page meanwhile. `popups` still records the tree.
 */
async function holdPopup(app: ElectronApplication): Promise<() => Promise<void>> {
  await app.evaluate(({ Menu }) => {
    const g = globalThis as { __popups?: unknown[]; __release?: () => void };
    g.__popups = [];
    Menu.prototype.popup = function popup(options?: Electron.PopupOptions) {
      g.__popups?.push([]);
      g.__release = () => options?.callback?.();
    } as never;
  });
  return () =>
    app.evaluate(() => {
      (globalThis as { __release?: () => void }).__release?.();
    });
}

test('SC16/W4/R32: no application menu and no menu bar; the ☰ is the top bar’s first child', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').waitFor();
    expect(
      await app.evaluate(({ Menu, BrowserWindow }) => ({
        menu: Menu.getApplicationMenu(),
        bar: BrowserWindow.getAllWindows()[0]?.isMenuBarVisible(),
      })),
    ).toEqual({ menu: null, bar: false });
    // M4: the first child of the top bar, before the name field.
    const first = page.getByTestId('topbar').locator(':scope > *').first();
    await expect(first).toHaveAttribute('data-testid', 'app-menu');
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toHaveCount(1);
    await expect(button(page)).toHaveAttribute('aria-label', 'Menu');
    await expect(button(page)).toHaveAttribute('aria-haspopup', 'menu');
    await expect(button(page)).toHaveAttribute('aria-expanded', 'false');
    expect(await page.getByTestId('topbar').evaluate((el) => el.className)).toContain('has-menu');
    const [menu, field] = await Promise.all([
      button(page).boundingBox(),
      page.getByTestId('namefield-input').boundingBox(),
    ]);
    if (!menu || !field) throw new Error('no boxes');
    expect(menu.x).toBeLessThan(field.x);
    expect(menu.width).toBeGreaterThanOrEqual(24);
    expect(menu.height).toBeGreaterThanOrEqual(24);
    // A19: the tooltip text (the app's tooltip host reads these attributes).
    await expect(button(page)).toHaveAttribute('data-ui-tip', 'Menu (Alt or F10)');
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('M2/R1/M4: the popup has File, Edit, View and Help; every item registers no accelerator and has no role', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').waitFor();
    await stubPopup(app, [null]);
    await button(page).click(); // a real press: it opens the popup and keeps the focus where it was
    await expect.poll(async () => (await popups(app)).length).toBe(1);
    const tree = (await popups(app))[0] ?? [];
    expect(tree.map((m) => m.label)).toEqual(['&File', '&Edit', '&View', '&Help']);
    const items = await menuItems(app);
    expect(items.map((i) => i.id).filter((id) => id.includes('.'))).toEqual(APPLICATION_IDS);
    for (const item of items) {
      expect(item.registerAccelerator, item.id || item.label).toBe(false);
      expect(item.role, item.id).toBeNull();
    }
    // R47, A19: the File rows; R46: Zoom to 100% has no key, and no row shows Ctrl+1.
    const row = async (id: string) => {
      const item = await menuItem(app, id);
      return [item.label, item.accelerator];
    };
    expect(await row('file.new')).toEqual(['&New tab', 'CmdOrCtrl+T']);
    expect(await row('file.reopen-tab')).toEqual(['Reopen closed &tab', 'CmdOrCtrl+Shift+T']);
    expect(await row('file.close-tab')).toEqual(['&Close tab', 'CmdOrCtrl+W']);
    expect(await row('view.zoom-reset')).toEqual(['Zoom to &100%', null]);
    expect((await menuItems(app)).filter((i) => i.accelerator === 'CmdOrCtrl+1')).toEqual([]);
    expect(await row('help.shortcuts')).toEqual(['&Keyboard shortcuts', 'F1']);
    // Reopen closed tab has nothing to bring back yet; Close tab needs only an idle editor.
    expect(await menuItem(app, 'file.reopen-tab')).toMatchObject({ enabled: false });
    expect(await menuItem(app, 'file.close-tab')).toMatchObject({ enabled: true });
  } finally {
    await app.close();
  }
});

test('M4: the popup opens at the button’s bottom-left corner; aria-expanded follows it; a second request is ignored (M5)', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').waitFor();
    const release = await holdPopup(app);
    await button(page).click();
    await expect(button(page)).toHaveAttribute('aria-expanded', 'true');
    // M5: a second press, F10 and a right-click on the canvas open nothing while one is open.
    await button(page).dispatchEvent('click');
    await page.keyboard.press('F10');
    await page.getByTestId('canvas').click({ button: 'right', position: { x: 300, y: 300 } });
    await page.waitForTimeout(100);
    expect(await popups(app)).toHaveLength(1);
    await release();
    await expect(button(page)).toHaveAttribute('aria-expanded', 'false');
    // The corner (content CSS px, rounded) was sent with the request.
    await stubPopup(app, [null]);
    await button(page).click();
    await expect.poll(async () => (await popups(app)).length).toBe(1);
    const box = await button(page).boundingBox();
    if (!box) throw new Error('no button');
    const [at] = await popupPoints(app);
    expect(at?.x).toBe(Math.round(box.x));
    expect(at?.y).toBe(Math.round(box.y + box.height));
  } finally {
    await app.close();
  }
});

test('K1/K3: the button, F10 and a lone Alt open the popup; Alt+click and Alt+Shift do not', async () => {
  const { app, page } = await openApp();
  try {
    await loadScheme(page);
    await page.getByTestId('canvas').focus();
    await stubPopup(app, []);
    await button(page).click();
    await expect.poll(async () => (await popups(app)).length).toBe(1);
    await page.keyboard.press('F10');
    await expect.poll(async () => (await popups(app)).length).toBe(2);
    await page.keyboard.press('Alt');
    await expect.poll(async () => (await popups(app)).length).toBe(3);
    // Enter and Space on the focused button.
    await button(page).focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await popups(app)).length).toBe(4);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await popups(app)).length).toBe(5);
    // Alt+Shift (a language switch) and Alt+Tab-like chords open nothing.
    await page.getByTestId('canvas').focus();
    await page.keyboard.down('Alt');
    await page.keyboard.press('Shift');
    await page.keyboard.up('Alt');
    await page.waitForTimeout(100);
    expect(await popups(app)).toHaveLength(5);
    // The popup did not take the focus from the canvas.
    await expect(page.getByTestId('canvas')).toBeFocused();
  } finally {
    await app.close();
  }
});

test('K5/M4: a press on the button leaves the focus where it was (canvas, name field)', async () => {
  const { app, page } = await openApp();
  try {
    await loadScheme(page);
    await stubPopup(app, []);
    await page.getByTestId('canvas').focus();
    await button(page).click();
    await expect.poll(async () => (await popups(app)).length).toBe(1);
    await expect(page.getByTestId('canvas')).toBeFocused();
    const input = page.getByTestId('namefield-input');
    await input.click();
    await button(page).click();
    await expect.poll(async () => (await popups(app)).length).toBe(2);
    await expect(input).toBeFocused();
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

    // View: zoom steps, Zoom to 100% (R18, R46: no key), fit; the style radios.
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
    await expectNoNetwork(app);
  } finally {
    await app.close();
  }
});

test('SC2/R47: File items run New tab, Open, Save, Save as, Export, Close tab, Reopen closed tab and Exit (no box) with scripted dialogs', async () => {
  const { app, page } = await openApp({
    launch: {
      dialogs: [
        { canceled: true, filePaths: [] }, // file.open
        { canceled: true }, // file.save (Untitled → Save as)
        { canceled: true }, // file.save-as
      ],
    },
  });
  let closed = false;
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

    // T7 (TB20): New tab adds a tab and asks nothing.
    await clickEnabled(app, 'file.new');
    await expect.poll(() => atoms(page)).toBe(0);
    expect((await readTabs(page)).map((t) => t.label)).toEqual(['Untitled', 'Untitled 2']);
    expect(await dialogLog(app)).toHaveLength(3);

    // R47: Close tab closes the active (empty) tab at once; Reopen closed tab brings it back.
    expect(await menuItem(app, 'file.reopen-tab')).toMatchObject({ enabled: false });
    await clickEnabled(app, 'file.close-tab');
    await expect.poll(async () => (await readTabs(page)).length).toBe(1);
    await expect.poll(async () => (await menuItem(app, 'file.reopen-tab')).enabled).toBe(true);
    await clickEnabled(app, 'file.reopen-tab');
    await expect.poll(async () => (await readTabs(page)).length).toBe(2);
    expect(await dialogLog(app)).toHaveLength(3);

    // R35: Exit never asks; the drawings are kept by the session store.
    await loadScheme(page);
    await expectNoNetwork(app);
    const exited = app.waitForEvent('close');
    await clickEnabled(app, 'file.exit');
    await exited;
    closed = true;
  } finally {
    if (!closed) await app.close();
  }
});

test('M1 modal: while the Export dialog is open the button is disabled, opens nothing, and a popup built for it disables every item', async () => {
  const { app, page } = await openApp();
  try {
    await loadScheme(page);
    await page.keyboard.press('Control+e');
    await expect(page.getByTestId('export-dialog')).toBeVisible();
    await expect(button(page)).toHaveAttribute('aria-disabled', 'true');
    await stubPopup(app, ['edit.select-all']);
    await button(page).dispatchEvent('click');
    await page.keyboard.press('F10');
    await page.waitForTimeout(100);
    expect(await popups(app)).toHaveLength(0);

    // I9 asked for directly with a modal state: every item is disabled and a click does nothing.
    const before = await readDocument(page);
    const zoom = await readout(page).innerText();
    const answer = await page.evaluate(() =>
      window.chalkbond.showAppMenu({
        state: {
          idle: true,
          modal: true,
          textFocus: false,
          empty: false,
          hasSelection: false,
          canUndo: true,
          canRedo: true,
          undoLabel: null,
          redoLabel: null,
          canCut: true,
          canDuplicate: true,
          canDelete: true,
          canSelectAll: true,
          canZoomIn: true,
          canZoomOut: true,
          canReopenTab: true,
          preset: 'slides',
        },
        x: 10,
        y: 10,
      }),
    );
    expect(answer).toBeNull();
    const [tree] = await popups(app);
    const flat = (nodes: typeof tree): NonNullable<typeof tree> =>
      (nodes ?? []).flatMap((n) => [n, ...flat(n.submenu)]);
    const items = flat(tree).filter((i) => i.id.includes('.'));
    expect(items.length).toBeGreaterThan(20);
    for (const item of items) expect(item.enabled, item.id).toBe(false);
    expect(await readSelection(page)).toEqual({ atoms: [], bonds: [], objects: [] });
    expect(await readDocument(page)).toEqual(before);
    await expect(readout(page)).toHaveText(zoom);
    await expect(page.getByTestId('export-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(button(page)).not.toHaveAttribute('aria-disabled', 'true');
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
      'file.close-tab',
      'file.reopen-tab',
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
