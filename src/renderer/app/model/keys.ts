// K1 host keys (SPEC-app-shell.md "Keyboard (host keys)"): the pure decision, complete: Ctrl+C
// (C8), Ctrl+V (C9, clipboard-export CB-K), Ctrl+N / O / S / Shift+S (A8), Ctrl+E (C10), F1 and
// Ctrl+F outside the editor (A11). K3: the Alt key-up after an Alt+click (`altGuard`).

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
  /** The target is inside the editor root: the editor's own Ctrl+F acts there. */
  readonly insideEditor: boolean;
}

/**
 * `copy-whole`: CB-C1's whole-drawing branch (an empty drawing gives N-C4); `paste`: CB-P1;
 * `new`, `open`, `save`, `save-as`: F1, F2, F5, F6; `export`: the Export dialog (EX1);
 * `shortcuts`: the Keyboard shortcuts dialog; `focus-name`: `run('focus-name-field')`.
 */
export type HostKeyAction =
  | 'copy-whole'
  | 'paste'
  | 'new'
  | 'open'
  | 'save'
  | 'save-as'
  | 'export'
  | 'shortcuts'
  | 'focus-name';

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
  if (e.altKey || e.metaKey || ctx.modal) return null;
  // F1 alone, when idle (the menu shows Keyboard shortcuts disabled otherwise; R19).
  if (e.key === 'F1') return !e.ctrlKey && !e.shiftKey && ctx.idle ? 'shortcuts' : null;
  if (!e.ctrlKey) return null;
  const key = e.key.toLowerCase();
  const file = fileKey(key, e.shiftKey);
  if (file !== null) return ctx.idle && !ctx.fileBusy ? file : null;
  // K1: Ctrl+E when idle and the drawing is not empty (the File menu's rule; the name field too).
  if (key === 'e' && !e.shiftKey) return ctx.idle && !ctx.empty ? 'export' : null;
  // R4: Ctrl+C in a text target is native text copy; with a selection the editor copies.
  if (key === 'c' && !e.shiftKey && !ctx.textTarget && ctx.selectionEmpty) return 'copy-whole';
  // CB-K: Ctrl+V on a non-text target while idle is the host's paste, never the editor's.
  if (key === 'v' && !e.shiftKey && !ctx.textTarget && ctx.idle) return 'paste';
  // Ctrl+F outside the editor root (e.g. `body`): the editor's own Ctrl+F never sees it.
  if (key === 'f' && !e.shiftKey && !ctx.insideEditor) return 'focus-name';
  return null;
}

/** What the K3 rule hears: pointer presses and key presses on the window. */
export type AltGuardEvent =
  | { readonly type: 'pointerdown'; readonly altKey: boolean }
  | { readonly type: 'keydown'; readonly key: string; readonly repeat: boolean }
  | { readonly type: 'keyup'; readonly key: string };

/**
 * K3 (R4): a `pointerdown` with Alt held arms; the next Alt key-up is prevented (an unconsumed Alt
 * would focus the menu bar) and disarms; any other keydown disarms, except Alt's own auto-repeat
 * while it is still held from the click. A standalone Alt press is never prevented.
 */
export function altGuard(armed: boolean, e: AltGuardEvent): { armed: boolean; prevent: boolean } {
  switch (e.type) {
    case 'pointerdown':
      return { armed: armed || e.altKey, prevent: false };
    case 'keydown':
      return { armed: armed && e.key === 'Alt' && e.repeat, prevent: false };
    case 'keyup':
      return e.key === 'Alt' ? { armed: false, prevent: armed } : { armed, prevent: false };
  }
}
