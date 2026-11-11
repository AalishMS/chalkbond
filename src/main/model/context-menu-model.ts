// The context menus as data (SPEC-app-shell.md CM1–CM3, A07). Pure. The canvas menus use the Edit
// items' enabled rules (`commandEnabled`) and never the text variant: the host moves focus to the
// canvas before it asks (CM1). The text-field menu (CM3) is the one place roles are used (R1, R3).
import { commandEnabled, type ContextCommand, type MenuState } from '../../shared/menu';

export interface ContextItemNode {
  readonly kind: 'item';
  readonly id: ContextCommand;
  readonly label: string;
  /** Display only. */
  readonly accelerator: string;
  readonly enabled: boolean;
}
export type ContextNode = ContextItemNode | { readonly kind: 'separator' };

const SEPARATOR: ContextNode = { kind: 'separator' };

/** CM1: the item menu (`onItem`) or the empty-canvas menu, enabled as the Edit items. */
export function canvasContextMenu(onItem: boolean, menuState: MenuState): ContextNode[] {
  const state = { ...menuState, textFocus: false };
  const item = (id: ContextCommand, label: string, accelerator: string): ContextItemNode => ({
    kind: 'item',
    id,
    label,
    accelerator,
    enabled: commandEnabled(id, state),
  });
  const paste = item('edit.paste', '&Paste', 'CmdOrCtrl+V');
  if (onItem) {
    return [
      item('edit.cut', 'Cu&t', 'CmdOrCtrl+X'),
      item('edit.copy', '&Copy', 'CmdOrCtrl+C'),
      item('edit.duplicate', '&Duplicate', 'CmdOrCtrl+D'),
      item('edit.delete', 'De&lete', 'Delete'),
      SEPARATOR,
      paste,
    ];
  }
  return [
    paste,
    item('edit.copy', state.hasSelection ? '&Copy' : '&Copy whole drawing', 'CmdOrCtrl+C'),
    SEPARATOR,
    item('edit.select-all', 'Select &all', 'CmdOrCtrl+A'),
  ];
}

export type TextRole = 'cut' | 'copy' | 'paste' | 'selectAll';
export type TextContextNode = { role: TextRole; label: string } | { type: 'separator' };

/** CM3: Cu&t · &Copy · &Paste · — · Select &all with Electron's text roles. */
export function textContextMenu(): TextContextNode[] {
  return [
    { role: 'cut', label: 'Cu&t' },
    { role: 'copy', label: '&Copy' },
    { role: 'paste', label: '&Paste' },
    { type: 'separator' },
    { role: 'selectAll', label: 'Select &all' },
  ];
}
