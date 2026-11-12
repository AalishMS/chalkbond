// The ☰ menu's trees as data (SPEC-app-shell.md M1–M4; R32: there is no menu bar any more):
// `(MenuState, recent) → menus`. Pure; `menu.ts` turns it into the submenus of one native popup
// (every item `registerAccelerator: false`, no role).
import {
  commandEnabled,
  type AppCommand,
  type MainMenuId,
  type MenuState,
} from '../../shared/menu';

/** `webContents` methods for M3 (a focused text field). */
export type TextMethod = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'delete' | 'selectAll';

export type MenuAction =
  | { kind: 'command'; command: AppCommand }
  | { kind: 'text'; method: TextMethod }
  | { kind: 'exit' }
  | { kind: 'about' }
  | { kind: 'recent'; index: number }
  | { kind: 'recent-clear' }
  /** A submenu holder (Open recent): no action of its own. */
  | { kind: 'none' };

export interface MenuItemNode {
  readonly kind: 'item';
  readonly id: string;
  readonly label: string;
  /** Display only (M2). */
  readonly accelerator?: string;
  readonly enabled: boolean;
  readonly radio?: true;
  readonly checked?: boolean;
  readonly action: MenuAction;
  readonly submenu?: readonly MenuNode[];
}
export type MenuNode = MenuItemNode | { readonly kind: 'separator' };

export interface TopMenu {
  readonly id: 'file' | 'edit' | 'view' | 'help';
  readonly label: string;
  readonly submenu: readonly MenuNode[];
}

/** At most this many recent files are listed (O4). */
export const RECENT_MAX = 8;

const SEPARATOR: MenuNode = { kind: 'separator' };

/** `&` marks the access key, so text from the drawing or a file name doubles it. */
const literal = (text: string): string => text.replaceAll('&', '&&');

/** "Undo add bond": the editor's label with its first letter lower-cased; plain when none. */
function historyLabel(verb: '&Undo' | '&Redo', label: string | null): string {
  if (label === null || label === '') return verb;
  return `${verb} ${literal(label.charAt(0).toLowerCase() + label.slice(1))}`;
}

const TEXT_METHODS: Readonly<Partial<Record<AppCommand, TextMethod>>> = {
  'edit.undo': 'undo',
  'edit.redo': 'redo',
  'edit.cut': 'cut',
  'edit.copy': 'copy',
  'edit.paste': 'paste',
  'edit.delete': 'delete',
  'edit.select-all': 'selectAll',
};

export function menuModel(state: MenuState, recent: readonly string[]): TopMenu[] {
  const entries = recent.slice(0, RECENT_MAX);
  const enabled = (id: AppCommand | MainMenuId): boolean =>
    commandEnabled(id, state, entries.length);
  const command = (id: AppCommand, label: string, accelerator?: string): MenuItemNode => {
    const method = state.textFocus ? TEXT_METHODS[id] : undefined;
    return {
      kind: 'item',
      id,
      label,
      ...(accelerator === undefined ? {} : { accelerator }),
      enabled: enabled(id),
      action: method ? { kind: 'text', method } : { kind: 'command', command: id },
    };
  };
  const radio = (id: AppCommand, label: string, checked: boolean): MenuItemNode => ({
    ...command(id, label),
    radio: true,
    checked,
  });
  const text = state.textFocus;
  const recentItems: MenuNode[] = entries.map((name, index): MenuItemNode => ({
    kind: 'item',
    id: `file.recent.${index}`,
    label: `&${index + 1} ${literal(name)}`,
    enabled: enabled('file.recent'),
    action: { kind: 'recent', index },
  }));
  const clear: MenuItemNode = {
    kind: 'item',
    id: 'file.recent.clear',
    label: '&Clear recently opened',
    enabled: enabled('file.recent.clear'),
    action: { kind: 'recent-clear' },
  };
  return [
    {
      id: 'file',
      label: '&File',
      submenu: [
        command('file.new', '&New tab', 'CmdOrCtrl+T'),
        command('file.open', '&Open…', 'CmdOrCtrl+O'),
        {
          kind: 'item',
          id: 'file.recent',
          label: 'Open &recent',
          enabled: enabled('file.recent'),
          action: { kind: 'none' },
          submenu: recentItems.length === 0 ? [clear] : [...recentItems, SEPARATOR, clear],
        },
        SEPARATOR,
        command('file.save', '&Save', 'CmdOrCtrl+S'),
        command('file.save-as', 'Save &as…', 'CmdOrCtrl+Shift+S'),
        SEPARATOR,
        command('file.export', '&Export…', 'CmdOrCtrl+E'),
        SEPARATOR,
        command('file.reopen-tab', 'Reopen closed &tab', 'CmdOrCtrl+Shift+T'),
        command('file.close-tab', '&Close tab', 'CmdOrCtrl+W'),
        SEPARATOR,
        {
          kind: 'item',
          id: 'file.exit',
          label: 'E&xit',
          accelerator: 'Alt+F4',
          enabled: enabled('file.exit'),
          action: { kind: 'exit' },
        },
      ],
    },
    {
      id: 'edit',
      label: '&Edit',
      submenu: [
        command(
          'edit.undo',
          text ? '&Undo' : historyLabel('&Undo', state.undoLabel),
          'CmdOrCtrl+Z',
        ),
        command(
          'edit.redo',
          text ? '&Redo' : historyLabel('&Redo', state.redoLabel),
          'CmdOrCtrl+Y',
        ),
        SEPARATOR,
        command('edit.cut', 'Cu&t', 'CmdOrCtrl+X'),
        command(
          'edit.copy',
          text || state.hasSelection ? '&Copy' : '&Copy whole drawing',
          'CmdOrCtrl+C',
        ),
        command('edit.paste', '&Paste', 'CmdOrCtrl+V'),
        command('edit.duplicate', '&Duplicate', 'CmdOrCtrl+D'),
        command('edit.delete', 'De&lete', 'Delete'),
        SEPARATOR,
        command('edit.select-all', 'Select &all', 'CmdOrCtrl+A'),
      ],
    },
    {
      id: 'view',
      label: '&View',
      submenu: [
        command('view.zoom-in', 'Zoom &in', 'CmdOrCtrl+='),
        command('view.zoom-out', 'Zoom &out', 'CmdOrCtrl+-'),
        command('view.zoom-fit', '&Fit drawing', 'CmdOrCtrl+0'),
        command('view.zoom-reset', 'Zoom to &100%'),
        SEPARATOR,
        radio('view.style-slides', '&Slides style', state.preset === 'slides'),
        radio('view.style-handout', '&Handout style', state.preset === 'journal'),
      ],
    },
    {
      id: 'help',
      label: '&Help',
      submenu: [
        command('help.shortcuts', '&Keyboard shortcuts', 'F1'),
        SEPARATOR,
        {
          kind: 'item',
          id: 'help.about',
          label: '&About Chalkbond',
          enabled: enabled('help.about'),
          action: { kind: 'about' },
        },
      ],
    },
  ];
}

/** Every item (not separators), depth first, submenu holders before their children. */
export function menuItems(nodes: readonly (MenuNode | TopMenu)[]): MenuItemNode[] {
  const out: MenuItemNode[] = [];
  for (const node of nodes) {
    if ('submenu' in node && !('kind' in node)) {
      out.push(...menuItems(node.submenu));
      continue;
    }
    if (node.kind === 'separator') continue;
    out.push(node);
    if (node.submenu) out.push(...menuItems(node.submenu));
  }
  return out;
}
