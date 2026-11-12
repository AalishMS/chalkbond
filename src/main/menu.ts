// The native popups (SPEC-app-shell.md M1–M5, R32): the ☰ menu (I9), the canvas menu (I6) and the
// tab menu (I10), built from the pure models when asked for and shown with `Menu.popup`. There is
// no application menu. Every item displays its accelerator but never registers it (M2, A3) and no
// item has a role (R1); the renderer owns every key.
import type { BrowserWindow, Menu as ElectronMenu, MenuItemConstructorOptions } from 'electron';
import type { AppCommand, ContextCommand, MenuState } from '../shared/menu';
import { canvasContextMenu, textContextMenu } from './model/context-menu-model';
import {
  menuModel,
  RECENT_MAX,
  type MenuAction,
  type MenuNode,
  type TextMethod,
  type TopMenu,
} from './model/menu-model';
import type { RecentEntry } from './model/recent';
import { tabContextMenu, type TabCommand } from './model/tab-menu-model';

/** The shape the canvas (CM1) and tab (T15) menu models share. */
type PopupNode<Id extends string> =
  | {
      readonly kind: 'item';
      readonly id: Id;
      readonly label: string;
      readonly accelerator: string;
      readonly enabled: boolean;
    }
  | { readonly kind: 'separator' };

/** What the ☰ menu's items that main runs itself do (M4): text, Exit, About, Open recent. */
export interface AppMenuPorts {
  /** M3: a `webContents` text method on the focused page. */
  text(method: TextMethod): void;
  exit(): void;
  about(): void;
  /** Open recent (F10, R21): the path captured when the popup was built. */
  openRecent(path: string): void;
  /** Open recent > Clear recently opened. */
  clearRecent(): void;
  /** The recent list now (paths stay in main); the popup captures it when it is built. */
  recent(): readonly RecentEntry[];
}

export interface ContextMenuPorts {
  /** `Menu` from electron, read at call time; `popup` is the built menu's (TH4 stubs the prototype). */
  Menu: Pick<typeof ElectronMenu, 'buildFromTemplate'>;
  /** The main window: the popup's parent, at the cursor. */
  window(): BrowserWindow | undefined;
  app: AppMenuPorts;
}

/**
 * I9 (M4), CM1–CM3: the native popups. `show` pops the canvas menu up at the cursor and resolves with
 * the chosen command, or null when it was dismissed (Esc, a click elsewhere), a disabled item was
 * clicked, there is no window, or another context menu is still open. `text` is the text-field
 * menu for `webContents` `context-menu` (CM3): editable targets only, with Electron's roles.
 */
export function createContextMenus(ports: ContextMenuPorts) {
  // M5: one popup at a time, shared by the ☰ (I9), canvas (CM1) and tab (T15) menus.
  let open = false;

  /**
   * Pops the template `build` makes up on the main window (at the cursor, or at `at`). `build` gets
   * `settle`, which an item's click calls with its answer; the answer is null when the menu was
   * dismissed, there is no window, or another popup is still open.
   */
  const popupTemplate = <Answer>(
    build: (settle: (answer: Answer | null) => void) => MenuItemConstructorOptions[],
    at: { x: number; y: number } | null,
  ): Promise<Answer | null> => {
    const window = ports.window();
    if (open || window === undefined) return Promise.resolve(null);
    open = true;
    return new Promise<Answer | null>((resolve) => {
      let settled = false;
      const settle = (value: Answer | null): void => {
        if (settled) return;
        settled = true;
        open = false;
        resolve(value);
      };
      ports.Menu.buildFromTemplate(build(settle)).popup({
        window,
        ...(at === null
          ? {}
          : { x: Math.max(0, Math.round(at.x)), y: Math.max(0, Math.round(at.y)) }),
        // Closed: an item's click may still follow the close on some platforms, so null waits a
        // turn for it.
        callback: () => setImmediate(() => settle(null)),
      });
    });
  };

  /** Pops a flat list of nodes up; the chosen id, else null. */
  const popupMenu = <Id extends string>(
    nodes: readonly PopupNode<Id>[],
    at: { x: number; y: number } | null,
  ): Promise<Id | null> =>
    popupTemplate<Id>(
      (settle) =>
        nodes.map((node): MenuItemConstructorOptions =>
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
        ),
      at,
    );

  /** One node of a ☰ submenu; `entries` is the recent list the popup was built from (R21). */
  const appItem = (
    node: MenuNode,
    entries: readonly RecentEntry[],
    settle: (command: AppCommand | null) => void,
  ): MenuItemConstructorOptions => {
    if (node.kind === 'separator') return { type: 'separator', registerAccelerator: false };
    const run = (action: MenuAction): void => {
      switch (action.kind) {
        case 'command':
          return settle(action.command);
        case 'text':
          return ports.app.text(action.method);
        case 'exit':
          return ports.app.exit();
        case 'about':
          return ports.app.about();
        case 'recent': {
          const entry = entries[action.index];
          return entry === undefined ? undefined : ports.app.openRecent(entry.path);
        }
        case 'recent-clear':
          return ports.app.clearRecent();
        case 'none':
          return undefined;
      }
    };
    return {
      id: node.id,
      label: node.label,
      ...(node.accelerator === undefined ? {} : { accelerator: node.accelerator }),
      registerAccelerator: false,
      enabled: node.enabled,
      ...(node.radio ? { type: 'radio' as const, checked: node.checked ?? false } : {}),
      ...(node.submenu ? { submenu: node.submenu.map((n) => appItem(n, entries, settle)) } : {}),
      // MenuItem.click() does not check `enabled` (R19). Items main runs itself answer null.
      click: () => {
        if (node.enabled) run(node.action);
      },
    };
  };

  const appTop = (
    menu: TopMenu,
    entries: readonly RecentEntry[],
    settle: (command: AppCommand | null) => void,
  ): MenuItemConstructorOptions => ({
    id: menu.id,
    label: menu.label,
    registerAccelerator: false,
    submenu: menu.submenu.map((n) => appItem(n, entries, settle)),
  });

  return {
    /**
     * I9 (M4): the four submenus File, Edit, View and Help as one popup at (x, y) in content CSS
     * px, clamped to the content size. A renderer command resolves with its id (the renderer runs
     * it); text, Exit, About and the recent items run here and resolve null, as does a dismissal.
     */
    showApp({
      state,
      x,
      y,
    }: {
      state: MenuState;
      x: number;
      y: number;
    }): Promise<AppCommand | null> {
      const window = ports.window();
      if (window === undefined) return Promise.resolve(null);
      const [width = 0, height = 0] = window.getContentSize();
      const entries = ports.app.recent().slice(0, RECENT_MAX);
      const menus = menuModel(
        state,
        entries.map((entry) => entry.label),
      );
      return popupTemplate<AppCommand>(
        (settle) => menus.map((menu) => appTop(menu, entries, settle)),
        { x: Math.min(Math.max(x, 0), width), y: Math.min(Math.max(y, 0), height) },
      );
    },
    show({ onItem, state }: { onItem: boolean; state: MenuState }): Promise<ContextCommand | null> {
      return popupMenu(canvasContextMenu(onItem, state), null);
    },
    /** I10 (T15, CM4): the tab menu at the cursor, or under the tab for a key. */
    showTab({
      state,
      at,
    }: {
      state: { canReopenTab: boolean };
      at: { x: number; y: number } | null;
    }): Promise<TabCommand | null> {
      return popupMenu(tabContextMenu(state), at);
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
