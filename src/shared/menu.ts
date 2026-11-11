// The M1 enabled rules (SPEC-app-shell.md "Menu bar", R19), once for main's menu model and the
// renderer's dispatcher. Pure, no imports: main, preload types and the renderer all read it.

/** What main needs to build the menu (N1 `menu`); derived in `renderer/app/model/menu-state.ts`. */
export interface MenuState {
  /** `canRun({type: 'set-preset'})`: no gesture, no label or text editor open. */
  idle: boolean;
  /** An in-window dialog is open: every item is disabled (M1). */
  modal: boolean;
  /** A text target has focus: Edit acts on the text (M3). */
  textFocus: boolean;
  /** The drawing has no atom and no object. */
  empty: boolean;
  hasSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  canCut: boolean;
  canDuplicate: boolean;
  canDelete: boolean;
  canSelectAll: boolean;
  canZoomIn: boolean;
  canZoomOut: boolean;
  preset: 'slides' | 'journal';
}

export const MENU_STATE_KEYS = [
  'idle',
  'modal',
  'textFocus',
  'empty',
  'hasSelection',
  'canUndo',
  'canRedo',
  'undoLabel',
  'redoLabel',
  'canCut',
  'canDuplicate',
  'canDelete',
  'canSelectAll',
  'canZoomIn',
  'canZoomOut',
  'preset',
] as const satisfies readonly (keyof MenuState)[];

/** Menu ids the renderer runs (`main:event {type: 'command'}`), in menu order. */
export const APP_COMMANDS = [
  'file.new',
  'file.open',
  'file.save',
  'file.save-as',
  'file.export',
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
] as const;
export type AppCommand = (typeof APP_COMMANDS)[number];

/** Items main runs itself (File > Exit, Help > About, Open recent). */
export type MainMenuId = 'file.exit' | 'help.about' | 'file.recent' | 'file.recent.clear';

/** Edit items that act on a focused text field instead (M3), all enabled then but Duplicate. */
const TEXT_ITEMS: ReadonlySet<string> = new Set([
  'edit.undo',
  'edit.redo',
  'edit.cut',
  'edit.copy',
  'edit.paste',
  'edit.delete',
  'edit.select-all',
]);

export const isTextEditCommand = (id: string): boolean => TEXT_ITEMS.has(id);

/** M1's "Enabled when" column; `recent` is the length of the recent list (A15). */
export function commandEnabled(id: AppCommand | MainMenuId, s: MenuState, recent = 0): boolean {
  if (s.modal) return false;
  if (s.textFocus && id.startsWith('edit.')) return TEXT_ITEMS.has(id);
  switch (id) {
    case 'file.new':
    case 'file.open':
    case 'file.save':
    case 'file.save-as':
    case 'edit.paste':
    case 'view.style-slides':
    case 'view.style-handout':
    case 'help.shortcuts':
      return s.idle;
    case 'file.recent':
    case 'file.recent.clear':
      return s.idle && recent > 0;
    case 'file.export':
    case 'edit.copy':
      return s.idle && !s.empty;
    case 'edit.undo':
      return s.canUndo;
    case 'edit.redo':
      return s.canRedo;
    case 'edit.cut':
      return s.canCut;
    case 'edit.duplicate':
      return s.canDuplicate;
    case 'edit.delete':
      return s.canDelete;
    case 'edit.select-all':
      return s.canSelectAll;
    case 'view.zoom-in':
      return s.canZoomIn;
    case 'view.zoom-out':
      return s.canZoomOut;
    case 'view.zoom-fit':
    case 'view.zoom-reset':
    case 'file.exit':
    case 'help.about':
      return true;
  }
}

/** CM1: the commands a canvas context menu offers (I6 answers one of them, or null). */
export const CONTEXT_COMMANDS = [
  'edit.cut',
  'edit.copy',
  'edit.duplicate',
  'edit.delete',
  'edit.paste',
  'edit.select-all',
] as const satisfies readonly AppCommand[];
export type ContextCommand = (typeof CONTEXT_COMMANDS)[number];
