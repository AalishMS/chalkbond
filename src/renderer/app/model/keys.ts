// K1 host keys (SPEC-app-shell.md "Keyboard (host keys)"): the pure decision. Rows are added by
// the tasks that build their actions; C8 adds Ctrl+C, C9 Ctrl+V (clipboard-export CB-K), A8 the
// file keys Ctrl+N / O / S / Shift+S, C10 Ctrl+E (the Export dialog).

/** The parts of a `KeyboardEvent` the decision reads. */
export interface KeyInput {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
}

export interface HostKeyContext {
  /** The target is an `input`, `textarea` or `contenteditable` element. */
  readonly textTarget: boolean;
  /** The editor has nothing selected. */
  readonly selectionEmpty: boolean;
  /** No gesture runs and no label or text editor is open. */
  readonly idle: boolean;
  /** An in-window dialog is open: K1 does nothing (the dialog handles its keys). */
  readonly modal: boolean;
  /** A file flow (New, Open, Save, Save as, close) is running: file keys do nothing. */
  readonly fileBusy: boolean;
  /** The drawing has no atom and no object: Ctrl+E does nothing. */
  readonly empty: boolean;
}

/**
 * `copy-whole`: CB-C1's whole-drawing branch (an empty drawing gives N-C4); `paste`: CB-P1;
 * `new`, `open`, `save`, `save-as`: F1, F2, F5, F6; `export`: the Export dialog (EX1).
 */
export type HostKeyAction = 'copy-whole' | 'paste' | 'new' | 'open' | 'save' | 'save-as' | 'export';

/** Ctrl+<key> (Shift as given) → file action; valid in the name field too, never while busy. */
function fileKey(key: string, shift: boolean): HostKeyAction | null {
  if (key === 's') return shift ? 'save-as' : 'save';
  if (shift) return null;
  if (key === 'n') return 'new';
  if (key === 'o') return 'open';
  return null;
}

/** The host action for a keydown, or null to let it reach the editor (or the text) unchanged. */
export function hostKey(e: KeyInput, ctx: HostKeyContext): HostKeyAction | null {
  if (!e.ctrlKey || e.altKey || e.metaKey || ctx.modal) return null;
  const key = e.key.toLowerCase();
  const file = fileKey(key, e.shiftKey);
  if (file !== null) return ctx.idle && !ctx.fileBusy ? file : null;
  // K1: Ctrl+E when idle and the drawing is not empty (the File menu's rule; the name field too).
  if (key === 'e' && !e.shiftKey) return ctx.idle && !ctx.empty ? 'export' : null;
  // R4: Ctrl+C in a text target is native text copy; with a selection the editor copies.
  if (key === 'c' && !e.shiftKey && !ctx.textTarget && ctx.selectionEmpty) return 'copy-whole';
  // CB-K: Ctrl+V on a non-text target while idle is the host's paste, never the editor's.
  if (key === 'v' && !e.shiftKey && !ctx.textTarget && ctx.idle) return 'paste';
  return null;
}
