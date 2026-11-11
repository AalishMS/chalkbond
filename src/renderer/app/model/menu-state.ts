// The renderer side of the native menu (SPEC-app-shell.md "Process split and IPC", M1, R19):
// MenuState from the controller, focus and dialogs; a once-per-frame scheduler; and the dispatcher
// that re-checks a menu command against the current state before it runs.
import {
  APP_COMMANDS,
  commandEnabled,
  isTextEditCommand,
  MENU_STATE_KEYS,
  type AppCommand,
  type MenuState,
} from '../../../shared/menu';
import type { EditorCommand, EditorController } from '../../editor';

export type MenuController = Pick<
  EditorController,
  'getDoc' | 'getSelection' | 'canRun' | 'undoLabel' | 'redoLabel'
>;

const IDLE: EditorCommand = { type: 'set-preset', preset: 'slides' };

function hasKeys(record: object): boolean {
  for (const key in record) if (Object.hasOwn(record, key)) return true;
  return false;
}

export function deriveMenuState(
  c: MenuController,
  view: { readonly textFocus: boolean; readonly modal: boolean },
): MenuState {
  const doc = c.getDoc();
  const selection = c.getSelection();
  return {
    idle: c.canRun(IDLE),
    modal: view.modal,
    textFocus: view.textFocus,
    empty: !hasKeys(doc.atoms) && !hasKeys(doc.objects),
    hasSelection: selection.atoms.size + selection.bonds.size + selection.objects.size > 0,
    canUndo: c.canRun('undo'),
    canRedo: c.canRun('redo'),
    undoLabel: c.undoLabel() ?? null,
    redoLabel: c.redoLabel() ?? null,
    canCut: c.canRun('cut'),
    canDuplicate: c.canRun('duplicate'),
    canDelete: c.canRun('delete'),
    canSelectAll: c.canRun('select-all'),
    canZoomIn: c.canRun('zoom-in'),
    canZoomOut: c.canRun('zoom-out'),
    preset: doc.style.preset,
  };
}

export function sameMenuState(a: MenuState | undefined, b: MenuState): boolean {
  return a !== undefined && MENU_STATE_KEYS.every((key) => a[key] === b[key]);
}

/** Calls `publish` at most once per animation frame, however often `invalidate` is called. */
export function createMenuScheduler(ports: {
  requestFrame(fn: () => void): number;
  cancelFrame(handle: number): void;
  publish(): void;
}): { invalidate(): void; cancel(): void } {
  let pending: number | null = null;
  return {
    invalidate() {
      if (pending !== null) return;
      pending = ports.requestFrame(() => {
        pending = null;
        ports.publish();
      });
    },
    /** Drops a pending frame (the listeners went away); a later `invalidate` schedules again. */
    cancel() {
      if (pending !== null) ports.cancelFrame(pending);
      pending = null;
    },
  };
}

/** What a menu command does in the renderer (the same functions the keys and buttons call). */
export interface AppActions {
  newDrawing(): void;
  open(): void;
  save(): void;
  saveAs(): void;
  exportDialog(): void;
  /** CB-C1: the selection, or the whole drawing when nothing is selected. */
  copy(): void;
  /** CB-P1. */
  paste(): void;
  shortcuts(): void;
  run(cmd: EditorCommand): void;
}

const run =
  (cmd: EditorCommand) =>
  (a: AppActions): void =>
    a.run(cmd);

/** Every renderer menu command and what it does (exhaustive over `AppCommand`). */
const ACTIONS: Readonly<Record<AppCommand, (a: AppActions) => void>> = {
  'file.new': (a) => a.newDrawing(),
  'file.open': (a) => a.open(),
  'file.save': (a) => a.save(),
  'file.save-as': (a) => a.saveAs(),
  'file.export': (a) => a.exportDialog(),
  'edit.undo': run('undo'),
  'edit.redo': run('redo'),
  'edit.cut': run('cut'),
  'edit.copy': (a) => a.copy(),
  'edit.paste': (a) => a.paste(),
  'edit.duplicate': run('duplicate'),
  'edit.delete': run('delete'),
  'edit.select-all': run('select-all'),
  'view.zoom-in': run('zoom-in'),
  'view.zoom-out': run('zoom-out'),
  'view.zoom-fit': run('zoom-fit'),
  'view.zoom-reset': run('zoom-reset'),
  'view.style-slides': run({ type: 'set-preset', preset: 'slides' }),
  'view.style-handout': run({ type: 'set-preset', preset: 'journal' }),
  'help.shortcuts': (a) => a.shortcuts(),
};

const isAppCommand = (id: string): id is AppCommand =>
  (APP_COMMANDS as readonly string[]).includes(id);

/**
 * Runs a menu command if `state` (derived now, not the frame the menu was built from) allows it.
 * Edit commands never run while a text field has focus: main acts on the text then (M3). Returns
 * whether something ran.
 */
export function runAppCommand(id: string, state: MenuState, a: AppActions): boolean {
  if (!isAppCommand(id) || !commandEnabled(id, state)) return false;
  if (state.textFocus && isTextEditCommand(id)) return false;
  ACTIONS[id](a);
  return true;
}
