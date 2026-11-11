// The native application menu (SPEC-app-shell.md M1–M3): built from the pure model and applied
// when N1's `menu` or the recent list changes. Every item displays its accelerator but never
// registers it (M2, A3) and no item has a role (R1); the renderer owns every key.
import type { Menu as ElectronMenu, MenuItemConstructorOptions } from 'electron';
import { MENU_STATE_KEYS, type AppCommand, type MenuState } from '../shared/menu';
import {
  menuModel,
  type MenuAction,
  type MenuNode,
  type TextMethod,
  type TopMenu,
} from './model/menu-model';

export interface MenuPorts {
  /** `Menu` from electron, read at call time (TH4: a test may stub its methods). */
  Menu: Pick<typeof ElectronMenu, 'buildFromTemplate' | 'setApplicationMenu'>;
  /** A renderer command (`main:event {type: 'command'}`). */
  command(command: AppCommand): void;
  /** M3: a `webContents` text method on the focused page. */
  text(method: TextMethod): void;
  exit(): void;
  about(): void;
  /** Open recent (A15): the entry's index, or `clear`. */
  recent(index: number | 'clear'): void;
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
  let recent: readonly string[] = [];
  let built = false;

  const run = (action: MenuAction): void => {
    switch (action.kind) {
      case 'command':
        return ports.command(action.command);
      case 'text':
        return ports.text(action.method);
      case 'exit':
        return ports.exit();
      case 'about':
        return ports.about();
      case 'recent':
        return ports.recent(action.index);
      case 'recent-clear':
        return ports.recent('clear');
      case 'none':
        return undefined;
    }
  };

  const item = (node: MenuNode): MenuItemConstructorOptions => {
    if (node.kind === 'separator') return { type: 'separator', registerAccelerator: false };
    return {
      id: node.id,
      label: node.label,
      ...(node.accelerator === undefined ? {} : { accelerator: node.accelerator }),
      registerAccelerator: false,
      enabled: node.enabled,
      ...(node.radio ? { type: 'radio' as const, checked: node.checked ?? false } : {}),
      ...(node.submenu ? { submenu: node.submenu.map(item) } : {}),
      click: () => {
        // A click on an item built disabled is ignored (MenuItem.click() does not check it). A
        // radio flips itself natively: rebuild from the model, which N1 then updates.
        if (node.radio) setImmediate(() => install());
        if (node.enabled) run(node.action);
      },
    };
  };

  const top = (menu: TopMenu): MenuItemConstructorOptions => ({
    id: menu.id,
    label: menu.label,
    registerAccelerator: false,
    submenu: menu.submenu.map(item),
  });

  const install = (): void => {
    ports.Menu.setApplicationMenu(ports.Menu.buildFromTemplate(menuModel(state, recent).map(top)));
    built = true;
  };

  return {
    /** Applies N1's state (and the recent list, A15); rebuilds only when something changed. */
    apply(next: MenuState, nextRecent: readonly string[] = recent): void {
      const changed =
        !built ||
        !same(state, next) ||
        nextRecent.length !== recent.length ||
        nextRecent.some((name, i) => name !== recent[i]);
      state = next;
      recent = nextRecent;
      if (changed) install();
    },
    state: (): MenuState => state,
  };
}
