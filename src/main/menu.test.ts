// menu.ts with a fake `Menu` (SPEC-app-shell.md M1–M5, R32, TH5): the popups Electron receives.
import { describe, expect, it } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import type { MenuState } from '../shared/menu';
import { createContextMenus, type ContextMenuPorts } from './menu';
import type { RecentEntry } from './model/recent';

type Template = MenuItemConstructorOptions[];
const ready: MenuState = {
  idle: true,
  modal: false,
  textFocus: false,
  empty: false,
  hasSelection: true,
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
};

// CM1–CM3 (A13): the popup Electron receives, the chosen command or null, at most one at a time.
type Popup = { template: Template; options: { window?: unknown; callback?: () => void } };
function contextSetup(initialRecent: RecentEntry[] = []) {
  const popups: Popup[] = [];
  const calls: unknown[] = [];
  const recent = { list: initialRecent };
  const win = { id: 'main-window', getContentSize: () => [960, 640] };
  const ports: ContextMenuPorts = {
    app: {
      text: (method) => calls.push(['text', method]),
      exit: () => calls.push(['exit']),
      about: () => calls.push(['about']),
      openRecent: (path) => calls.push(['open-recent', path]),
      clearRecent: () => calls.push(['clear-recent']),
      recent: () => recent.list,
    },
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
  const find = (nodes: Template, id: string): MenuItemConstructorOptions | undefined => {
    for (const item of nodes) {
      if (item.id === id) return item;
      const inner = Array.isArray(item.submenu) ? find(item.submenu, id) : undefined;
      if (inner) return inner;
    }
    return undefined;
  };
  const click = (popup: Popup | undefined, id: string) => {
    const item = find(popup?.template ?? [], id);
    if (!item?.click) throw new Error(`no ${id}`);
    (item.click as () => void)();
  };
  const close = (popup: Popup | undefined) => popup?.options.callback?.();
  return {
    menus: createContextMenus(ports),
    popups,
    win,
    click,
    close,
    calls,
    recent,
    find,
    ports,
  };
}

function flat(template: Template): MenuItemConstructorOptions[] {
  return template.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? flat(item.submenu) : []),
  ]);
}

describe('createContextMenus ☰ menu (I9, M1, M2, M4, M5)', () => {
  const at = (state: MenuState = ready, x = 8, y = 44) => ({ state, x, y });

  it('SC16/M2/R1: one popup of four submenus; every item registers no accelerator and has no role', () => {
    const { menus, popups, win } = contextSetup([
      { label: 'a.chalk — Grade 11', path: '/g/a.chalk' },
    ]);
    void menus.showApp(at());
    const popup = popups[0];
    expect(popups).toHaveLength(1);
    expect(popup?.options.window).toBe(win);
    expect(popup?.template.map((m) => m.label)).toEqual(['&File', '&Edit', '&View', '&Help']);
    const items = flat(popup?.template ?? []);
    expect(items.length).toBeGreaterThan(30);
    for (const item of items) {
      expect(item.registerAccelerator, item.id ?? item.type).toBe(false);
      expect(item.role, item.id).toBeUndefined();
    }
    const byId = (id: string) => items.find((i) => i.id === id);
    expect(byId('file.new')).toMatchObject({ label: '&New tab', accelerator: 'CmdOrCtrl+T' });
    expect(byId('file.reopen-tab')).toMatchObject({ accelerator: 'CmdOrCtrl+Shift+T' });
    expect(byId('file.close-tab')).toMatchObject({ accelerator: 'CmdOrCtrl+W' });
    expect(byId('view.zoom-reset')).not.toHaveProperty('accelerator');
    expect(byId('view.style-slides')).toMatchObject({ type: 'radio', checked: true });
    expect(byId('file.recent.0')?.label).toBe('&1 a.chalk — Grade 11');
  });

  it('pops up at the point given, rounded', async () => {
    const { menus, popups, close } = contextSetup();
    const first = menus.showApp(at(ready, 8.4, 43.6));
    expect(popups[0]?.options).toMatchObject({ x: 8, y: 44 });
    close(popups[0]);
    await first;
  });

  it('clamps x and y to [0, content size]', async () => {
    const { menus, popups, close } = contextSetup();
    const first = menus.showApp(at(ready, -20, 5000));
    expect(popups[0]?.options).toMatchObject({ x: 0, y: 640 });
    close(popups[0]);
    await first;
    const second = menus.showApp(at(ready, 4000, -1));
    expect(popups[1]?.options).toMatchObject({ x: 960, y: 0 });
    close(popups[1]);
    await second;
  });

  it('a renderer command resolves with its id; the renderer runs it', async () => {
    const { menus, popups, click, close, calls } = contextSetup();
    const chosen = menus.showApp(at());
    click(popups[0], 'file.close-tab');
    close(popups[0]);
    await expect(chosen).resolves.toBe('file.close-tab');
    expect(calls).toEqual([]);
  });

  it('items main runs itself (Exit, About, text, recent, Clear) run here and answer null', async () => {
    const { menus, popups, click, close, calls } = contextSetup([
      { label: 'x', path: '/x/a.chalk' },
    ]);
    const runOne = async (state: MenuState, id: string) => {
      const answer = menus.showApp(at(state));
      const popup = popups.at(-1);
      click(popup, id);
      close(popup);
      await expect(answer).resolves.toBeNull();
    };
    for (const id of ['file.exit', 'help.about', 'file.recent.0', 'file.recent.clear'])
      await runOne(ready, id);
    await runOne({ ...ready, textFocus: true }, 'edit.copy');
    await runOne({ ...ready, textFocus: true }, 'edit.select-all');
    expect(calls).toEqual([
      ['exit'],
      ['about'],
      ['open-recent', '/x/a.chalk'],
      ['clear-recent'],
      ['text', 'copy'],
      ['text', 'selectAll'],
    ]);
  });

  it('R21: a recent click opens the path captured when the popup was built', async () => {
    const { menus, popups, click, close, calls, recent } = contextSetup([
      { label: 'a', path: '/one/a.chalk' },
      { label: 'b', path: '/one/b.chalk' },
    ]);
    const answer = menus.showApp(at());
    recent.list = [{ label: 'b', path: '/one/b.chalk' }];
    click(popups[0], 'file.recent.1');
    close(popups[0]);
    await answer;
    expect(calls).toEqual([['open-recent', '/one/b.chalk']]);
  });

  it('at most eight recent entries are listed (O4)', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ label: `d${i}`, path: `/d${i}` }));
    const { menus, popups } = contextSetup(many);
    void menus.showApp(at());
    const ids = flat(popups[0]?.template ?? []).map((i) => i.id);
    expect(ids).toContain('file.recent.7');
    expect(ids).not.toContain('file.recent.8');
  });

  it('M1/R19: an item built disabled is ignored when clicked; a modal state disables all', async () => {
    const { menus, popups, click, close, calls } = contextSetup();
    const answer = menus.showApp(at({ ...ready, modal: true }));
    for (const id of ['file.save', 'file.exit', 'help.about', 'edit.copy', 'file.close-tab'])
      click(popups[0], id);
    close(popups[0]);
    await expect(answer).resolves.toBeNull();
    expect(calls).toEqual([]);
    for (const item of flat(popups[0]?.template ?? []).filter((i) => i.id?.includes('.')))
      expect(item.enabled, item.id).toBe(false);
  });

  it('dismissed (Esc, a click elsewhere) answers null', async () => {
    const { menus, popups, close } = contextSetup();
    const dismissed = menus.showApp(at());
    close(popups[0]);
    await expect(dismissed).resolves.toBeNull();
  });

  it('M5: a second popup request while the ☰ popup is open is ignored, in every direction', async () => {
    const { menus, popups, click, close } = contextSetup();
    const first = menus.showApp(at());
    await expect(menus.showApp(at())).resolves.toBeNull();
    await expect(menus.show({ onItem: true, state: ready })).resolves.toBeNull();
    await expect(menus.showTab({ state: { canReopenTab: true }, at: null })).resolves.toBeNull();
    expect(popups).toHaveLength(1);
    click(popups[0], 'file.new');
    close(popups[0]);
    await expect(first).resolves.toBe('file.new');
    // Closed: the canvas menu is allowed again, and then blocks the ☰ popup.
    void menus.show({ onItem: true, state: ready });
    await expect(menus.showApp(at())).resolves.toBeNull();
    expect(popups).toHaveLength(2);
  });

  it('no window: null and no popup', async () => {
    const { popups, ports } = contextSetup();
    const menus = createContextMenus({
      ...ports,
      Menu: { buildFromTemplate: () => ({ popup: () => popups.push({} as Popup) }) as never },
      window: () => undefined,
    });
    await expect(menus.showApp(at())).resolves.toBeNull();
    expect(popups).toHaveLength(0);
  });
});

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
      app: contextSetup().ports.app,
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
      app: contextSetup().ports.app,
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
