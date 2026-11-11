// M1–M3 as data (SPEC-app-shell.md "Menu bar"; SC2): every row's label, id, accelerator text,
// enabled rule and action. `menu.ts` sets `registerAccelerator: false` on each item and no role.
import { describe, expect, it } from 'vitest';
import type { MenuState } from '../../shared/menu';
import { menuItems, menuModel, type MenuItemNode, type MenuNode, type TopMenu } from './menu-model';

const ready: MenuState = {
  idle: true,
  modal: false,
  textFocus: false,
  empty: false,
  hasSelection: true,
  canUndo: true,
  canRedo: true,
  undoLabel: 'Add bond',
  redoLabel: 'Change element',
  canCut: true,
  canDuplicate: true,
  canDelete: true,
  canSelectAll: true,
  canZoomIn: true,
  canZoomOut: true,
  preset: 'slides',
};

const byId = (nodes: readonly (MenuNode | TopMenu)[], id: string): MenuItemNode => {
  const item = menuItems(nodes).find((n) => n.id === id);
  if (!item) throw new Error(`no ${id}`);
  return item;
};
const row = (item: MenuItemNode) => [item.label, item.accelerator ?? null, item.enabled];
const shape = (nodes: readonly MenuNode[]) =>
  nodes.map((n) => (n.kind === 'separator' ? '—' : n.id));

describe('menuModel', () => {
  it('has the four menus of A04–A06 with their access keys, in order', () => {
    const menus = menuModel(ready, []);
    expect(menus.map((m) => [m.id, m.label])).toEqual([
      ['file', '&File'],
      ['edit', '&Edit'],
      ['view', '&View'],
      ['help', '&Help'],
    ]);
    expect(menus.map((m) => shape(m.submenu))).toEqual([
      [
        'file.new',
        'file.open',
        'file.recent',
        '—',
        'file.save',
        'file.save-as',
        '—',
        'file.export',
        '—',
        'file.exit',
      ],
      [
        'edit.undo',
        'edit.redo',
        '—',
        'edit.cut',
        'edit.copy',
        'edit.paste',
        'edit.duplicate',
        'edit.delete',
        '—',
        'edit.select-all',
      ],
      [
        'view.zoom-in',
        'view.zoom-out',
        'view.zoom-fit',
        'view.zoom-reset',
        '—',
        'view.style-slides',
        'view.style-handout',
      ],
      ['help.shortcuts', '—', 'help.about'],
    ]);
  });

  it('M1: label, display accelerator and enabled state of every row (ready editor)', () => {
    const menus = menuModel(ready, []);
    const rows = Object.fromEntries(menuItems(menus).map((n) => [n.id, row(n)]));
    expect(rows).toEqual({
      'file.new': ['&New', 'CmdOrCtrl+N', true],
      'file.open': ['&Open…', 'CmdOrCtrl+O', true],
      'file.recent': ['Open &recent', null, false],
      'file.recent.clear': ['&Clear recently opened', null, false],
      'file.save': ['&Save', 'CmdOrCtrl+S', true],
      'file.save-as': ['Save &as…', 'CmdOrCtrl+Shift+S', true],
      'file.export': ['&Export…', 'CmdOrCtrl+E', true],
      'file.exit': ['E&xit', 'Alt+F4', true],
      'edit.undo': ['&Undo add bond', 'CmdOrCtrl+Z', true],
      'edit.redo': ['&Redo change element', 'CmdOrCtrl+Y', true],
      'edit.cut': ['Cu&t', 'CmdOrCtrl+X', true],
      'edit.copy': ['&Copy', 'CmdOrCtrl+C', true],
      'edit.paste': ['&Paste', 'CmdOrCtrl+V', true],
      'edit.duplicate': ['&Duplicate', 'CmdOrCtrl+D', true],
      'edit.delete': ['De&lete', 'Delete', true],
      'edit.select-all': ['Select &all', 'CmdOrCtrl+A', true],
      'view.zoom-in': ['Zoom &in', 'CmdOrCtrl+=', true],
      'view.zoom-out': ['Zoom &out', 'CmdOrCtrl+-', true],
      'view.zoom-fit': ['&Fit drawing', 'CmdOrCtrl+0', true],
      'view.zoom-reset': ['Zoom to &100%', 'CmdOrCtrl+1', true],
      'view.style-slides': ['&Slides style', null, true],
      'view.style-handout': ['&Handout style', null, true],
      'help.shortcuts': ['&Keyboard shortcuts', 'F1', true],
      'help.about': ['&About Chalkbond', null, true],
    });
  });

  it('routes every renderer row as a command and Exit, About, recent to main', () => {
    const items = menuItems(menuModel(ready, ['a.chalk — X']));
    for (const item of items) {
      if (item.id === 'file.exit') expect(item.action).toEqual({ kind: 'exit' });
      else if (item.id === 'help.about') expect(item.action).toEqual({ kind: 'about' });
      else if (item.id === 'file.recent') expect(item.action).toEqual({ kind: 'none' });
      else if (item.id === 'file.recent.clear')
        expect(item.action).toEqual({ kind: 'recent-clear' });
      else if (item.id === 'file.recent.0')
        expect(item.action).toEqual({ kind: 'recent', index: 0 });
      else expect(item.action).toEqual({ kind: 'command', command: item.id });
    }
  });

  it('"Undo add bond": the editor label with its first letter lower-cased; plain when none', () => {
    const none = menuModel({ ...ready, undoLabel: null, redoLabel: null, canUndo: false }, []);
    expect(row(byId(none, 'edit.undo'))).toEqual(['&Undo', 'CmdOrCtrl+Z', false]);
    expect(byId(none, 'edit.redo').label).toBe('&Redo');
    const cased = menuModel({ ...ready, undoLabel: 'Insert ethanol', redoLabel: 'X' }, []);
    expect(byId(cased, 'edit.undo').label).toBe('&Undo insert ethanol');
    expect(byId(cased, 'edit.redo').label).toBe('&Redo x');
    expect(byId(menuModel({ ...ready, undoLabel: '' }, []), 'edit.undo').label).toBe('&Undo');
  });

  it('doubles & in text that comes from the drawing or the recent list', () => {
    const menus = menuModel({ ...ready, undoLabel: 'Type A & B' }, ['R&D.chalk — Lab & co']);
    expect(byId(menus, 'edit.undo').label).toBe('&Undo type A && B');
    expect(byId(menus, 'file.recent.0').label).toBe('&1 R&&D.chalk — Lab && co');
  });

  it('A05: "Copy whole drawing" when nothing is selected, "Copy" with a selection', () => {
    expect(byId(menuModel({ ...ready, hasSelection: false }, []), 'edit.copy').label).toBe(
      '&Copy whole drawing',
    );
    expect(byId(menuModel(ready, []), 'edit.copy').label).toBe('&Copy');
  });

  it('the style radios are checked by the preset', () => {
    const slides = menuModel(ready, []);
    expect(byId(slides, 'view.style-slides').radio).toBe(true);
    expect(byId(slides, 'view.style-slides').checked).toBe(true);
    expect(byId(slides, 'view.style-handout').checked).toBe(false);
    const journal = menuModel({ ...ready, preset: 'journal' }, []);
    expect(byId(journal, 'view.style-slides').checked).toBe(false);
    expect(byId(journal, 'view.style-handout').checked).toBe(true);
  });

  it('M1 modal: every item, Exit and About included, is disabled', () => {
    const items = menuItems(menuModel({ ...ready, modal: true }, ['a.chalk — X']));
    expect(items.length).toBeGreaterThan(20);
    for (const item of items) expect(item.enabled, item.id).toBe(false);
  });

  it('M3 text focus: plain labels, the seven native text actions, Duplicate disabled', () => {
    const state = { ...ready, textFocus: true, hasSelection: false, idle: false };
    const edit = menuModel({ ...state, canUndo: false, canCut: false }, [])[1];
    if (!edit) throw new Error('no Edit menu');
    const rows = menuItems([edit]).map((n) => [n.id, n.label, n.enabled, n.action]);
    expect(rows).toEqual([
      ['edit.undo', '&Undo', true, { kind: 'text', method: 'undo' }],
      ['edit.redo', '&Redo', true, { kind: 'text', method: 'redo' }],
      ['edit.cut', 'Cu&t', true, { kind: 'text', method: 'cut' }],
      ['edit.copy', '&Copy', true, { kind: 'text', method: 'copy' }],
      ['edit.paste', '&Paste', true, { kind: 'text', method: 'paste' }],
      ['edit.duplicate', '&Duplicate', false, { kind: 'command', command: 'edit.duplicate' }],
      ['edit.delete', 'De&lete', true, { kind: 'text', method: 'delete' }],
      ['edit.select-all', 'Select &all', true, { kind: 'text', method: 'selectAll' }],
    ]);
    expect(byId(menuModel(state, []), 'edit.undo').accelerator).toBe('CmdOrCtrl+Z');
  });

  it('Open recent: numbered entries (at most 8), a separator, Clear; enabled when idle', () => {
    const names = Array.from({ length: 9 }, (_, i) => `d${i}.chalk — Grade 11`);
    const file = menuModel(ready, names)[0];
    if (!file) throw new Error('no File menu');
    const recent = byId([file], 'file.recent');
    expect(recent.enabled).toBe(true);
    expect(shape(recent.submenu ?? [])).toEqual([
      ...Array.from({ length: 8 }, (_, i) => `file.recent.${i}`),
      '—',
      'file.recent.clear',
    ]);
    expect(byId([file], 'file.recent.0').label).toBe('&1 d0.chalk — Grade 11');
    expect(byId([file], 'file.recent.7').label).toBe('&8 d7.chalk — Grade 11');
    expect(byId([file], 'file.recent.clear').enabled).toBe(true);
    const busy = menuModel({ ...ready, idle: false }, names);
    expect(byId(busy, 'file.recent').enabled).toBe(false);
    expect(byId(busy, 'file.recent.3').enabled).toBe(false);
  });

  it('an empty recent list shows only the disabled Clear (until A15 fills it)', () => {
    const recent = byId(menuModel(ready, []), 'file.recent');
    expect(shape(recent.submenu ?? [])).toEqual(['file.recent.clear']);
  });

  it('ids are unique', () => {
    const ids = menuItems(menuModel(ready, ['a', 'b'])).map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
