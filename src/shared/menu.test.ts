// M1 enabled rules (SPEC-app-shell.md "Menu bar", R19): one table for main's menu and the
// renderer's dispatcher.
import { describe, expect, it } from 'vitest';
import { APP_COMMANDS, commandEnabled, MENU_STATE_KEYS, type MenuState } from './menu';

const ready: MenuState = {
  idle: true,
  modal: false,
  textFocus: false,
  empty: false,
  hasSelection: true,
  canUndo: true,
  canRedo: true,
  undoLabel: 'Add bond',
  redoLabel: 'Add bond',
  canCut: true,
  canDuplicate: true,
  canDelete: true,
  canSelectAll: true,
  canZoomIn: true,
  canZoomOut: true,
  canReopenTab: true,
  preset: 'slides',
};
const blank: MenuState = {
  ...ready,
  idle: false,
  empty: true,
  hasSelection: false,
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
  canCut: false,
  canDuplicate: false,
  canDelete: false,
  canSelectAll: false,
  canZoomIn: false,
  canZoomOut: false,
  canReopenTab: false,
};

describe('commandEnabled', () => {
  it('lists every renderer command of M1 once, in menu order', () => {
    expect(APP_COMMANDS).toEqual([
      'file.new',
      'file.open',
      'file.save',
      'file.save-as',
      'file.export',
      'file.reopen-tab',
      'file.close-tab',
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
    ]);
  });

  it('names every MenuState field once', () => {
    expect([...MENU_STATE_KEYS].sort()).toEqual(Object.keys(ready).sort());
  });

  it('enables everything when the editor is ready and something is selected', () => {
    for (const id of [...APP_COMMANDS, 'file.exit', 'help.about'] as const)
      expect(commandEnabled(id, ready), id).toBe(true);
    expect(commandEnabled('file.recent', ready, 1)).toBe(true);
    expect(commandEnabled('file.recent.clear', ready, 1)).toBe(true);
  });

  it('applies each row rule on its own field', () => {
    const off = (change: Partial<MenuState>) => ({ ...ready, ...change });
    const cases: [Parameters<typeof commandEnabled>[0], Partial<MenuState>][] = [
      ['file.new', { idle: false }],
      ['file.open', { idle: false }],
      ['file.save', { idle: false }],
      ['file.save-as', { idle: false }],
      ['file.export', { idle: false }],
      ['file.export', { empty: true }],
      ['file.reopen-tab', { idle: false }],
      ['file.reopen-tab', { canReopenTab: false }],
      ['file.close-tab', { idle: false }],
      ['edit.undo', { canUndo: false }],
      ['edit.redo', { canRedo: false }],
      ['edit.cut', { canCut: false }],
      ['edit.copy', { idle: false }],
      ['edit.copy', { empty: true }],
      ['edit.paste', { idle: false }],
      ['edit.duplicate', { canDuplicate: false }],
      ['edit.delete', { canDelete: false }],
      ['edit.select-all', { canSelectAll: false }],
      ['view.zoom-in', { canZoomIn: false }],
      ['view.zoom-out', { canZoomOut: false }],
      ['view.style-slides', { idle: false }],
      ['view.style-handout', { idle: false }],
      ['help.shortcuts', { idle: false }],
    ];
    for (const [id, change] of cases) expect(commandEnabled(id, off(change)), id).toBe(false);
  });

  it('keeps Fit, Zoom to 100%, Exit and About enabled on a blank, busy editor', () => {
    for (const id of ['view.zoom-fit', 'view.zoom-reset', 'file.exit', 'help.about'] as const)
      expect(commandEnabled(id, blank), id).toBe(true);
    for (const id of APP_COMMANDS.filter((c) => c !== 'view.zoom-fit' && c !== 'view.zoom-reset'))
      expect(commandEnabled(id, blank), id).toBe(false);
  });

  it('R47, M6: Close tab needs idle only; Reopen closed tab also needs the reopen list', () => {
    const idle = { ...ready, empty: true, canReopenTab: false };
    expect(commandEnabled('file.close-tab', idle)).toBe(true);
    expect(commandEnabled('file.reopen-tab', idle)).toBe(false);
    expect(commandEnabled('file.reopen-tab', { ...idle, canReopenTab: true })).toBe(true);
  });

  it('enables Open recent and Clear only when idle with a non-empty list', () => {
    expect(commandEnabled('file.recent', ready)).toBe(false);
    expect(commandEnabled('file.recent', ready, 0)).toBe(false);
    expect(commandEnabled('file.recent', { ...ready, idle: false }, 3)).toBe(false);
    expect(commandEnabled('file.recent.clear', ready, 0)).toBe(false);
    expect(commandEnabled('file.recent.clear', ready, 8)).toBe(true);
  });

  it('M1 modal: every item is disabled while an in-window dialog is open', () => {
    const modal = { ...ready, modal: true };
    for (const id of [
      ...APP_COMMANDS,
      'file.exit',
      'help.about',
      'file.recent',
      'file.recent.clear',
    ] as const)
      expect(commandEnabled(id, modal, 8), id).toBe(false);
    expect(commandEnabled('edit.copy', { ...modal, textFocus: true })).toBe(false);
  });

  it('M3 text focus: the seven text actions are enabled, Duplicate is disabled', () => {
    const text = { ...blank, textFocus: true };
    for (const id of [
      'edit.undo',
      'edit.redo',
      'edit.cut',
      'edit.copy',
      'edit.paste',
      'edit.delete',
      'edit.select-all',
    ] as const)
      expect(commandEnabled(id, text), id).toBe(true);
    expect(commandEnabled('edit.duplicate', { ...ready, textFocus: true })).toBe(false);
  });
});
