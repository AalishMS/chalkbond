// CM1–CM3 as data (SPEC-app-shell.md "Context menus", A07): the canvas item and empty-canvas
// menus with the Edit items' enabled rules, and the text-field menu with its four roles.
import { describe, expect, it } from 'vitest';
import { commandEnabled, type MenuState } from '../../shared/menu';
import { canvasContextMenu, textContextMenu } from './context-menu-model';

const idle: MenuState = {
  idle: true,
  modal: false,
  textFocus: false,
  empty: false,
  hasSelection: true,
  canUndo: true,
  canRedo: false,
  undoLabel: 'Add bond',
  redoLabel: null,
  canCut: true,
  canDuplicate: true,
  canDelete: true,
  canSelectAll: true,
  canZoomIn: true,
  canZoomOut: true,
  preset: 'slides',
};

const shape = (state: MenuState, onItem: boolean) =>
  canvasContextMenu(onItem, state).map((n) =>
    n.kind === 'separator' ? '—' : `${n.id}|${n.label}|${n.accelerator}|${n.enabled}`,
  );

describe('CM1 item menu (A07 left)', () => {
  it('Cut · Copy · Duplicate · Delete · — · Paste, accelerators display only', () => {
    expect(shape(idle, true)).toEqual([
      'edit.cut|Cu&t|CmdOrCtrl+X|true',
      'edit.copy|&Copy|CmdOrCtrl+C|true',
      'edit.duplicate|&Duplicate|CmdOrCtrl+D|true',
      'edit.delete|De&lete|Delete|true',
      '—',
      'edit.paste|&Paste|CmdOrCtrl+V|true',
    ]);
  });

  it('enabled exactly as the Edit items (commandEnabled)', () => {
    const states: MenuState[] = [
      { ...idle, idle: false },
      { ...idle, canCut: false, canDuplicate: false },
      { ...idle, canDelete: false, empty: true },
      { ...idle, modal: true },
    ];
    for (const state of states) {
      for (const node of canvasContextMenu(true, state)) {
        if (node.kind === 'separator') continue;
        expect(node.enabled, node.id).toBe(commandEnabled(node.id, { ...state, textFocus: false }));
      }
    }
  });

  it('is never the text variant: a stale textFocus does not enable Cut or Duplicate', () => {
    const stale = { ...idle, textFocus: true, canCut: false, canDuplicate: false };
    const enabled = Object.fromEntries(
      canvasContextMenu(true, stale).flatMap((n) => (n.kind === 'item' ? [[n.id, n.enabled]] : [])),
    );
    expect(enabled).toEqual({
      'edit.cut': false,
      'edit.copy': true,
      'edit.duplicate': false,
      'edit.delete': true,
      'edit.paste': true,
    });
  });
});

describe('CM1 empty-canvas menu (A07 right)', () => {
  it('nothing selected: Paste · Copy whole drawing · — · Select all', () => {
    expect(shape({ ...idle, hasSelection: false }, false)).toEqual([
      'edit.paste|&Paste|CmdOrCtrl+V|true',
      'edit.copy|&Copy whole drawing|CmdOrCtrl+C|true',
      '—',
      'edit.select-all|Select &all|CmdOrCtrl+A|true',
    ]);
  });

  it('something selected: Copy; an empty drawing disables Copy; Select all follows canSelectAll', () => {
    expect(shape(idle, false)[1]).toBe('edit.copy|&Copy|CmdOrCtrl+C|true');
    const empty = { ...idle, empty: true, hasSelection: false, canSelectAll: false };
    expect(shape(empty, false)).toEqual([
      'edit.paste|&Paste|CmdOrCtrl+V|true',
      'edit.copy|&Copy whole drawing|CmdOrCtrl+C|false',
      '—',
      'edit.select-all|Select &all|CmdOrCtrl+A|false',
    ]);
    expect(shape({ ...idle, idle: false }, false)[0]).toBe('edit.paste|&Paste|CmdOrCtrl+V|false');
  });
});

describe('CM3 text field menu (R3)', () => {
  it('Cut · Copy · Paste · — · Select all with the four roles, nothing else', () => {
    expect(textContextMenu()).toEqual([
      { role: 'cut', label: 'Cu&t' },
      { role: 'copy', label: '&Copy' },
      { role: 'paste', label: '&Paste' },
      { type: 'separator' },
      { role: 'selectAll', label: 'Select &all' },
    ]);
  });
});
