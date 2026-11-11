// menu.ts with a fake `Menu` (SPEC-app-shell.md M1–M3, TH5): the template Electron receives.
import { describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import type { MenuState } from '../shared/menu';
import { createAppMenu, INITIAL_MENU_STATE, type MenuPorts } from './menu';

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
    recent: (index) => calls.push(['recent', index]),
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
    menu.apply(ready, ['a.chalk — Grade 11']);
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
    menu.apply(ready, ['a.chalk — X']);
    for (const id of ['file.save', 'file.exit', 'help.about', 'file.recent.0', 'file.recent.clear'])
      find(templates.at(-1), id).click();
    menu.apply({ ...ready, textFocus: true });
    find(templates.at(-1), 'edit.copy').click();
    find(templates.at(-1), 'edit.select-all').click();
    expect(calls).toEqual([
      ['command', 'file.save'],
      ['exit'],
      ['about'],
      ['recent', 0],
      ['recent', 'clear'],
      ['text', 'copy'],
      ['text', 'selectAll'],
    ]);
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
    menu.apply({ ...ready, undoLabel: 'Add bond' }, ['x']);
    expect(templates).toHaveLength(3);
    menu.apply({ ...ready, undoLabel: 'Add bond' }, ['x']);
    expect(templates).toHaveLength(3);
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
