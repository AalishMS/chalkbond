// The tab menu as data (SPEC-app-shell.md T15, CM4, mock-up A18). Pure. `menu.ts` turns it into an
// Electron template: accelerators are shown only (`registerAccelerator: false`, M2) and no item has
// a role (R1); the renderer owns every key.

export type TabCommand = 'new-tab' | 'close' | 'reopen';

export interface TabItemNode {
  readonly kind: 'item';
  readonly id: TabCommand;
  readonly label: string;
  /** Display only. */
  readonly accelerator: string;
  readonly enabled: boolean;
}
export type TabNode = TabItemNode | { readonly kind: 'separator' };

const SEPARATOR: TabNode = { kind: 'separator' };

/** T15: &New tab · — · &Close tab · — · Reopen closed &tab (only when a closed tab can come back). */
export function tabContextMenu(state: { readonly canReopenTab: boolean }): TabNode[] {
  const item = (id: TabCommand, label: string, accelerator: string): TabItemNode => ({
    kind: 'item',
    id,
    label,
    accelerator,
    enabled: true,
  });
  const nodes: TabNode[] = [
    item('new-tab', '&New tab', 'CmdOrCtrl+T'),
    SEPARATOR,
    item('close', '&Close tab', 'CmdOrCtrl+W'),
  ];
  if (state.canReopenTab) {
    nodes.push(SEPARATOR, item('reopen', 'Reopen closed &tab', 'CmdOrCtrl+Shift+T'));
  }
  return nodes;
}
