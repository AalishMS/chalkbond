// The native application menu (SPEC-app-shell.md M1–M3): built from the pure model and applied
// when N1's `menu` or the recent list changes. Every item displays its accelerator but never
// registers it (M2, A3) and no item has a role (R1); the renderer owns every key.
import type { BrowserWindow, Menu as ElectronMenu, MenuItemConstructorOptions } from 'electron';
import {
  MENU_STATE_KEYS,
  type AppCommand,
  type ContextCommand,
  type MenuState,
} from '../shared/menu';
import { canvasContextMenu, textContextMenu } from './model/context-menu-model';
import {
  menuModel,
  type MenuAction,
  type MenuNode,
  type TextMethod,
  type TopMenu,
} from './model/menu-model';
import type { RecentEntry } from './model/recent';

export interface MenuPorts {
  /** `Menu` from electron, read at call time (TH4: a test may stub its methods). */
  Menu: Pick<typeof ElectronMenu, 'buildFromTemplate' | 'setApplicationMenu'>;
  /** A renderer command (`main:event {type: 'command'}`). */
  command(command: AppCommand): void;
  /** M3: a `webContents` text method on the focused page. */
  text(method: TextMethod): void;
  exit(): void;
  about(): void;
  /** Open recent (F10, R21): the path captured when the clicked entry's menu was built. */
  openRecent(path: string): void;
  /** Open recent > Clear recently opened. */
  clearRecent(): void;
}

/** The state before the first N1: nothing runs yet but Exit, About, Fit and Zoom to 100%. */
export const INITIAL_MENU_STATE: MenuState = {
  idle: false,
  modal: false,
  textFocus: false,
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
  preset: 'slides',
};

function same(a: MenuState, b: MenuState): boolean {
  return MENU_STATE_KEYS.every((key) => a[key] === b[key]);
}

export function createAppMenu(ports: MenuPorts) {
  let state = INITIAL_MENU_STATE;
  let recent: readonly RecentEntry[] = [];
  let built = false;

  /** `entries`: the recent list this menu was built from (R21: never the list at click time). */
  const run = (action: MenuAction, entries: readonly RecentEntry[]): void => {
    switch (action.kind) {
      case 'command':
        return ports.command(action.command);
      case 'text':
        return ports.text(action.method);
      case 'exit':
        return ports.exit();
      case 'about':
        return ports.about();
      case 'recent': {
        const entry = entries[action.index];
        return entry === undefined ? undefined : ports.openRecent(entry.path);
      }
      case 'recent-clear':
        return ports.clearRecent();
      case 'none':
        return undefined;
    }
  };

  const item = (node: MenuNode, entries: readonly RecentEntry[]): MenuItemConstructorOptions => {
    if (node.kind === 'separator') return { type: 'separator', registerAccelerator: false };
    return {
      id: node.id,
      label: node.label,
      ...(node.accelerator === undefined ? {} : { accelerator: node.accelerator }),
      registerAccelerator: false,
      enabled: node.enabled,
      ...(node.radio ? { type: 'radio' as const, checked: node.checked ?? false } : {}),
      ...(node.submenu ? { submenu: node.submenu.map((n) => item(n, entries)) } : {}),
      click: () => {
        // A click on an item built disabled is ignored (MenuItem.click() does not check it). A
        // radio flips itself natively: rebuild from the model, which N1 then updates.
        if (node.radio) setImmediate(() => install());
        if (node.enabled) run(node.action, entries);
      },
    };
  };

  const top = (menu: TopMenu, entries: readonly RecentEntry[]): MenuItemConstructorOptions => ({
    id: menu.id,
    label: menu.label,
    registerAccelerator: false,
    submenu: menu.submenu.map((n) => item(n, entries)),
  });

  const install = (): void => {
    const entries = recent;
    const labels = entries.map((e) => e.label);
    ports.Menu.setApplicationMenu(
      ports.Menu.buildFromTemplate(menuModel(state, labels).map((m) => top(m, entries))),
    );
    built = true;
  };

  return {
    /** Applies N1's state (and the recent list, F10); rebuilds only when something changed. */
    apply(next: MenuState, nextRecent: readonly RecentEntry[] = recent): void {
      const changed =
        !built ||
        !same(state, next) ||
        nextRecent.length !== recent.length ||
        nextRecent.some((e, i) => e.label !== recent[i]?.label || e.path !== recent[i]?.path);
      state = next;
      recent = nextRecent;
      if (changed) install();
    },
    state: (): MenuState => state,
  };
}

export interface ContextMenuPorts {
  /** `Menu` from electron, read at call time; `popup` is the built menu's (TH4 stubs the prototype). */
  Menu: Pick<typeof ElectronMenu, 'buildFromTemplate'>;
  /** The main window: the popup's parent, at the cursor. */
  window(): BrowserWindow | undefined;
}

/**
 * CM1–CM3: the native context menus. `show` pops the canvas menu up at the cursor and resolves with
 * the chosen command, or null when it was dismissed (Esc, a click elsewhere), a disabled item was
 * clicked, there is no window, or another context menu is still open. `text` is the text-field
 * menu for `webContents` `context-menu` (CM3): editable targets only, with Electron's roles.
 */
export function createContextMenus(ports: ContextMenuPorts) {
  let open = false;
  return {
    show({ onItem, state }: { onItem: boolean; state: MenuState }): Promise<ContextCommand | null> {
      const window = ports.window();
      if (open || window === undefined) return Promise.resolve(null);
      open = true;
      return new Promise<ContextCommand | null>((resolve) => {
        let settled = false;
        const settle = (value: ContextCommand | null): void => {
          if (settled) return;
          settled = true;
          open = false;
          resolve(value);
        };
        const template = canvasContextMenu(onItem, state).map((node): MenuItemConstructorOptions =>
          node.kind === 'separator'
            ? { type: 'separator', registerAccelerator: false }
            : {
                id: node.id,
                label: node.label,
                accelerator: node.accelerator,
                registerAccelerator: false,
                enabled: node.enabled,
                click: () => {
                  // MenuItem.click() does not check `enabled` (R19).
                  if (node.enabled) settle(node.id);
                },
              },
        );
        ports.Menu.buildFromTemplate(template).popup({
          window,
          // Closed: an item's click may still follow the close on some platforms, so null waits a
          // turn for it.
          callback: () => setImmediate(() => settle(null)),
        });
      });
    },
    text(params: { isEditable: boolean }): void {
      const window = ports.window();
      if (!params.isEditable || window === undefined) return;
      const template = textContextMenu().map((node): MenuItemConstructorOptions =>
        'role' in node
          ? { role: node.role, label: node.label, registerAccelerator: false }
          : { type: 'separator', registerAccelerator: false },
      );
      ports.Menu.buildFromTemplate(template).popup({ window });
    },
  };
}
