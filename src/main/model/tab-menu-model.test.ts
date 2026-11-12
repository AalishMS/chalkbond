// The tab menu as data (SPEC-app-shell.md T15, CM4, mock-up A18).
import { describe, expect, it } from 'vitest';
import { tabContextMenu } from './tab-menu-model';

describe('tabContextMenu (T15)', () => {
  it('lists New tab, Close tab and, when a tab can be reopened, Reopen closed tab', () => {
    expect(tabContextMenu({ canReopenTab: true })).toEqual([
      { kind: 'item', id: 'new-tab', label: '&New tab', accelerator: 'CmdOrCtrl+T', enabled: true },
      { kind: 'separator' },
      { kind: 'item', id: 'close', label: '&Close tab', accelerator: 'CmdOrCtrl+W', enabled: true },
      { kind: 'separator' },
      {
        kind: 'item',
        id: 'reopen',
        label: 'Reopen closed &tab',
        accelerator: 'CmdOrCtrl+Shift+T',
        enabled: true,
      },
    ]);
  });

  it('leaves Reopen closed tab, and the separator before it, out when the list is empty', () => {
    const nodes = tabContextMenu({ canReopenTab: false });
    expect(nodes.map((n) => (n.kind === 'item' ? n.id : n.kind))).toEqual([
      'new-tab',
      'separator',
      'close',
    ]);
  });

  it('carries no role and only display accelerators (M2, R1)', () => {
    for (const node of tabContextMenu({ canReopenTab: true })) {
      expect(node).not.toHaveProperty('role');
      expect(node).not.toHaveProperty('registerAccelerator');
    }
  });
});
