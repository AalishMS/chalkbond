// menu.ts with a fake `Menu` (SPEC-app-shell.md M1–M3, TH5): the template Electron receives.
import { describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import type { MenuState } from '../shared/menu';
import {
  createAppMenu,
  createContextMenus,
  INITIAL_MENU_STATE,
  type ContextMenuPorts,
  type MenuPorts,
} from './menu';

type Template = MenuItemConstructorOptions[];
const ready: MenuState = {
  ...INITIAL_MENU_STATE,
  idle: true,
  empty: false,
  hasSelection: true,
  canUndo: true,
  canRedo: true,
  canCut: true,
  canDuplicate: true,
  canDelete: true,
  canSelectAll: true,
  canZoomIn: true,
  canZoomOut: true,
};

function setup() {
  const templates: Template[] = [];
  const calls: unknown[] = [];
  const ports: MenuPorts = {
    Menu: {
      buildFromTemplate: (template: Template) => {
        templates.push(template);
        return { template } as never;
      },
      setApplicationMenu: vi.fn(),
    },
    command: (command) => calls.push(['command', command]),
    text: (method) => calls.push(['text', method]),
    exit: () => calls.push(['exit']),
    about: () => calls.push(['about']),
    openRecent: (path) => calls.push(['open-recent', path]),
    clearRecent: () => calls.push(['clear-recent']),
  };
  return { menu: createAppMenu(ports), ports, templates, calls };
}

function flat(template: Template): MenuItemConstructorOptions[] {
  return template.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? flat(item.submenu) : []),
  ]);
}
const find = (template: Template | undefined, id: string) => {
  const item = flat(template ?? []).find((i) => i.id === id);
  if (!item?.click) throw new Error(`no ${id}`);
  return item as MenuItemConstructorOptions & { click: () => void };
};

describe('createAppMenu', () => {
  it('M2/R1: every item, separators and menus included, registerAccelerator false, no role', () => {
    const { menu, templates, ports } = setup();
    menu.apply(ready, [{ label: 'a.chalk — Grade 11', path: '/g11/a.chalk' }]);
    const template = templates[0] ?? [];
    expect(ports.Menu.setApplicationMenu).toHaveBeenCalledTimes(1);
    const items = flat(template);
    expect(items.length).toBeGreaterThan(30);
    for (const item of items) {
      expect(item.registerAccelerator, item.id ?? item.type).toBe(false);
      expect(item.role, item.id).toBeUndefined();
    }
    expect(template.map((m) => m.label)).toEqual(['&File', '&Edit', '&View', '&Help']);
    expect(find(template, 'edit.undo').accelerator).toBe('CmdOrCtrl+Z');
    expect(find(template, 'view.style-slides')).toMatchObject({ type: 'radio', checked: true });
  });

  it('routes clicks: renderer commands, text methods, Exit, About, recent', () => {
    const { menu, templates, calls } = setup();
    menu.apply(ready, [{ label: 'a.chalk — X', path: '/x/a.chalk' }]);
    for (const id of ['file.save', 'file.exit', 'help.about', 'file.recent.0', 'file.recent.clear'])
      find(templates.at(-1), id).click();
    menu.apply({ ...ready, textFocus: true });
    find(templates.at(-1), 'edit.copy').click();
    find(templates.at(-1), 'edit.select-all').click();
    expect(calls).toEqual([
      ['command', 'file.save'],
      ['exit'],
      ['about'],
      ['open-recent', '/x/a.chalk'],
      ['clear-recent'],
      ['text', 'copy'],
      ['text', 'selectAll'],
    ]);
  });

  it('R21: a recent click opens the path captured when its menu was built, not a later list', () => {
    const { menu, templates, calls } = setup();
    menu.apply(ready, [
      { label: 'a.chalk', path: '/one/a.chalk' },
      { label: 'b.chalk', path: '/one/b.chalk' },
    ]);
    const stale = find(templates.at(-1), 'file.recent.1');
    // The list reorders (an open elsewhere) before the stale item is clicked.
    menu.apply(ready, [
      { label: 'b.chalk', path: '/one/b.chalk' },
      { label: 'a.chalk', path: '/one/a.chalk' },
    ]);
    stale.click();
    find(templates.at(-1), 'file.recent.1').click();
    expect(calls).toEqual([
      ['open-recent', '/one/b.chalk'],
      ['open-recent', '/one/a.chalk'],
    ]);
  });

  it('a recent entry built disabled (not idle) is ignored when clicked', () => {
    const { menu, templates, calls } = setup();
    menu.apply({ ...ready, idle: false }, [{ label: 'a.chalk', path: '/a.chalk' }]);
    find(templates.at(-1), 'file.recent.0').click();
    find(templates.at(-1), 'file.recent.clear').click();
    expect(calls).toEqual([]);
  });

  it('ignores a click on an item built disabled (MenuItem.click does not check)', () => {
    const { menu, templates, calls } = setup();
    menu.apply({ ...ready, modal: true });
    for (const id of ['file.save', 'file.exit', 'help.about', 'edit.copy'])
      find(templates.at(-1), id).click();
    expect(calls).toEqual([]);
  });

  it('rebuilds only when the state or the recent list changed', () => {
    const { menu, templates } = setup();
    menu.apply(ready);
    menu.apply({ ...ready });
    expect(templates).toHaveLength(1);
    menu.apply({ ...ready, undoLabel: 'Add bond' });
    expect(templates).toHaveLength(2);
    menu.apply({ ...ready, undoLabel: 'Add bond' }, [{ label: 'x', path: '/x' }]);
    expect(templates).toHaveLength(3);
    menu.apply({ ...ready, undoLabel: 'Add bond' }, [{ label: 'x', path: '/x' }]);
    expect(templates).toHaveLength(3);
    // Same label, another file: the click must open the new path, so the menu is rebuilt.
    menu.apply({ ...ready, undoLabel: 'Add bond' }, [{ label: 'x', path: '/y/x' }]);
    expect(templates).toHaveLength(4);
    expect(menu.state().undoLabel).toBe('Add bond');
  });

  it('a radio click rebuilds from the model (the native flip is undone until N1)', async () => {
    const { menu, templates, calls } = setup();
    menu.apply(ready);
    find(templates.at(-1), 'view.style-handout').click();
    expect(calls).toEqual([['command', 'view.style-handout']]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(templates).toHaveLength(2);
    expect(find(templates.at(-1), 'view.style-slides').checked).toBe(true);
  });

  it('the initial state enables only Exit, About, Fit and Zoom to 100%', () => {
    const { menu, templates } = setup();
    menu.apply(INITIAL_MENU_STATE);
    const enabled = flat(templates[0] ?? [])
      .filter((i) => i.id?.includes('.') && i.enabled)
      .map((i) => i.id);
    expect(enabled).toEqual(['file.exit', 'view.zoom-fit', 'view.zoom-reset', 'help.about']);
  });
});

// CM1–CM3 (A13): the popup Electron receives, the chosen command or null, at most one at a time.
type Popup = { template: Template; options: { window?: unknown; callback?: () => void } };
function contextSetup() {
  const popups: Popup[] = [];
  const win = { id: 'main-window' };
  const ports: ContextMenuPorts = {
    Menu: {
      buildFromTemplate: (template: Template) => {
        const popup: Popup = { template, options: {} };
        return {
          popup(options: Popup['options']) {
            popup.options = options;
            popups.push(popup);
          },
        } as never;
      },
    },
    window: () => win as never,
  };
  const click = (popup: Popup | undefined, id: string) => {
    const item = popup?.template.find((i) => i.id === id);
    if (!item?.click) throw new Error(`no ${id}`);
    (item.click as () => void)();
  };
  const close = (popup: Popup | undefined) => popup?.options.callback?.();
  return { menus: createContextMenus(ports), popups, win, click, close };
}

describe('createContextMenus (CM1, CM2)', () => {
  it('pops the item menu up on the window: ids, labels, no role, no registered accelerator', async () => {
    const { menus, popups, win, click, close } = contextSetup();
    const chosen = menus.show({ onItem: true, state: ready });
    const popup = popups[0];
    expect(popup?.options.window).toBe(win);
    expect(popup?.template.map((i) => i.id ?? i.type)).toEqual([
      'edit.cut',
      'edit.copy',
      'edit.duplicate',
      'edit.delete',
      'separator',
      'edit.paste',
    ]);
    for (const item of popup?.template ?? []) {
      expect(item.registerAccelerator).toBe(false);
      expect(item.role).toBeUndefined();
    }
    expect(popup?.template[3]).toMatchObject({ label: 'De&lete', accelerator: 'Delete' });
    click(popup, 'edit.delete');
    close(popup);
    await expect(chosen).resolves.toBe('edit.delete');
  });

  it('a click that arrives after the close callback still counts (Windows order)', async () => {
    const { menus, popups, click, close } = contextSetup();
    const chosen = menus.show({ onItem: false, state: { ...ready, hasSelection: false } });
    close(popups[0]);
    click(popups[0], 'edit.select-all');
    await expect(chosen).resolves.toBe('edit.select-all');
  });

  it('dismissed (Esc, click elsewhere) → null; a disabled item click is ignored', async () => {
    const { menus, popups, click, close } = contextSetup();
    const dismissed = menus.show({ onItem: true, state: ready });
    close(popups[0]);
    await expect(dismissed).resolves.toBeNull();
    const disabled = menus.show({ onItem: true, state: { ...ready, canDelete: false } });
    click(popups[1], 'edit.delete');
    close(popups[1]);
    await expect(disabled).resolves.toBeNull();
  });

  it('one popup at a time: a request while one is open answers null without a popup', async () => {
    const { menus, popups, click, close } = contextSetup();
    const first = menus.show({ onItem: true, state: ready });
    await expect(menus.show({ onItem: false, state: ready })).resolves.toBeNull();
    expect(popups).toHaveLength(1);
    click(popups[0], 'edit.cut');
    close(popups[0]);
    await expect(first).resolves.toBe('edit.cut');
    void menus.show({ onItem: false, state: ready });
    expect(popups).toHaveLength(2);
  });

  it('no window: null and no popup', async () => {
    const { popups } = contextSetup();
    const menus = createContextMenus({
      Menu: { buildFromTemplate: () => ({ popup: () => popups.push({} as Popup) }) as never },
      window: () => undefined,
    });
    await expect(menus.show({ onItem: true, state: ready })).resolves.toBeNull();
    expect(popups).toHaveLength(0);
  });
});

describe('createContextMenus tab menu (T15, CM4, M5)', () => {
  const tab = (canReopenTab: boolean, at: { x: number; y: number } | null = null) => ({
    tabId: '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e',
    state: { canReopenTab },
    at,
  });

  it('pops the three items up at the cursor: ids, labels, no role, no registered accelerator', async () => {
    const { menus, popups, win, click, close } = contextSetup();
    const chosen = menus.showTab(tab(true));
    const popup = popups[0];
    expect(popup?.options.window).toBe(win);
    expect(popup?.options).not.toHaveProperty('x');
    expect(popup?.options).not.toHaveProperty('y');
    expect(popup?.template.map((i) => i.id ?? i.type)).toEqual([
      'new-tab',
      'separator',
      'close',
      'separator',
      'reopen',
    ]);
    expect(popup?.template[0]).toMatchObject({ label: '&New tab', accelerator: 'CmdOrCtrl+T' });
    expect(popup?.template[4]).toMatchObject({
      label: 'Reopen closed &tab',
      accelerator: 'CmdOrCtrl+Shift+T',
    });
    for (const item of popup?.template ?? []) {
      expect(item.registerAccelerator).toBe(false);
      expect(item.role).toBeUndefined();
    }
    click(popup, 'close');
    close(popup);
    await expect(chosen).resolves.toBe('close');
  });

  it('leaves Reopen out when no closed tab can come back', () => {
    const { menus, popups } = contextSetup();
    void menus.showTab(tab(false));
    expect(popups[0]?.template.map((i) => i.id ?? i.type)).toEqual([
      'new-tab',
      'separator',
      'close',
    ]);
  });

  it('under the tab for a key: the point is rounded and kept inside the window (>= 0)', async () => {
    const { menus, popups, close } = contextSetup();
    const first = menus.showTab(tab(true, { x: 120.6, y: 40.2 }));
    expect(popups[0]?.options).toMatchObject({ x: 121, y: 40 });
    close(popups[0]);
    await first;
    void menus.showTab(tab(true, { x: -5, y: -0.4 }));
    expect(popups[1]?.options).toMatchObject({ x: 0, y: 0 });
  });

  it('dismissed (Esc, click elsewhere) answers null', async () => {
    const { menus, popups, close } = contextSetup();
    const dismissed = menus.showTab(tab(true));
    close(popups[0]);
    await expect(dismissed).resolves.toBeNull();
  });

  it('M5: a request while another popup is open is ignored, in both directions', async () => {
    const { menus, popups, click, close } = contextSetup();
    const canvas = menus.show({ onItem: true, state: ready });
    await expect(menus.showTab(tab(true))).resolves.toBeNull();
    expect(popups).toHaveLength(1);
    click(popups[0], 'edit.cut');
    close(popups[0]);
    await expect(canvas).resolves.toBe('edit.cut');

    const first = menus.showTab(tab(true));
    await expect(menus.showTab(tab(true))).resolves.toBeNull();
    await expect(menus.show({ onItem: false, state: ready })).resolves.toBeNull();
    expect(popups).toHaveLength(2);
    click(popups[1], 'reopen');
    close(popups[1]);
    await expect(first).resolves.toBe('reopen');
    void menus.showTab(tab(true));
    expect(popups).toHaveLength(3);
  });

  it('no window: null and no popup', async () => {
    const { popups } = contextSetup();
    const menus = createContextMenus({
      Menu: { buildFromTemplate: () => ({ popup: () => popups.push({} as Popup) }) as never },
      window: () => undefined,
    });
    await expect(menus.showTab(tab(true))).resolves.toBeNull();
    expect(popups).toHaveLength(0);
  });
});

describe('createContextMenus CM3 (text fields, R3)', () => {
  it('editable target: Cut · Copy · Paste · — · Select all with roles; others ignored', () => {
    const { menus, popups, win } = contextSetup();
    menus.text({ isEditable: false });
    expect(popups).toHaveLength(0);
    menus.text({ isEditable: true });
    expect(popups[0]?.options.window).toBe(win);
    expect(popups[0]?.template.map((i) => i.role ?? i.type)).toEqual([
      'cut',
      'copy',
      'paste',
      'separator',
      'selectAll',
    ]);
    for (const item of popups[0]?.template ?? []) expect(item.registerAccelerator).toBe(false);
  });
});
