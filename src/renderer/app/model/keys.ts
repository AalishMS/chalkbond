// K1 host keys (SPEC-app-shell.md "Keyboard (host keys)"): the pure decision, complete: Ctrl+C
// (C8), Ctrl+V (C9, clipboard-export CB-K), Ctrl+N / O / S / Shift+S (A8), Ctrl+E (C10), F1 and
// Ctrl+F outside the editor (A11). K3: the Alt key-up after an Alt+click (`altGuard`).

/** The parts of a `KeyboardEvent` the decision reads. */
export interface KeyInput {
  readonly key: string;
  /**
   * `KeyboardEvent.code` (the physical key): Ctrl+digit matches it (R45). Absent = no physical key
   * known, so no Ctrl+digit matches.
   */
  readonly code?: string;
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
  /** The reopen list (R40) is non-empty: Ctrl+Shift+T does nothing otherwise. Absent = empty. */
  readonly canReopen?: boolean;
}

/** Ctrl+1 ... Ctrl+8: go to tab n (R36); Ctrl+9 is `last-tab`. */
export type TabNumberAction = `tab-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;

/**
 * `copy-whole`: CB-C1's whole-drawing branch (an empty drawing gives N-C4); `paste`: CB-P1;
 * `new`, `open`, `save`, `save-as`: F1, F2, F5, F6; `export`: the Export dialog (EX1);
 * `shortcuts`: the Keyboard shortcuts dialog; `focus-name`: `run('focus-name-field')`.
 * Tabs (R36): `new` is also Ctrl+T (a new tab), `close-tab`, `next-tab`, `previous-tab` (both wrap),
 * `tab-1` ... `tab-8`, `last-tab` (Ctrl+9), `reopen-tab`; `menu`: open the ☰ menu (M4; F10).
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
  | 'focus-name'
  | 'close-tab'
  | 'next-tab'
  | 'previous-tab'
  | 'last-tab'
  | 'reopen-tab'
  | 'menu'
  | TabNumberAction;

/** Ctrl+<key> (Shift as given) → file action; valid in the name field too, never while busy. */
function fileKey(key: string, shift: boolean): HostKeyAction | null {
  if (key === 's') return shift ? 'save-as' : 'save';
  if (shift) return null;
  if (key === 'n') return 'new';
  if (key === 'o') return 'open';
  return null;
}

const DIGIT_CODE = /^(?:Digit|Numpad)([1-9])$/;

/** Ctrl+1 ... Ctrl+9 by physical key (R45); `key` may be a Devanagari digit. */
function digitKey(code: string | undefined): TabNumberAction | 'last-tab' | null {
  const digit = code === undefined ? undefined : DIGIT_CODE.exec(code)?.[1];
  if (digit === undefined) return null;
  return digit === '9' ? 'last-tab' : (`tab-${digit}` as TabNumberAction);
}

/** Ctrl+<key> that works on the tabs (R36), Shift as given; null when it is none. */
function tabKey(e: KeyInput, key: string, canReopen: boolean): HostKeyAction | null {
  if (key === 'tab') return e.shiftKey ? 'previous-tab' : 'next-tab';
  if (e.shiftKey) return key === 't' && canReopen ? 'reopen-tab' : null;
  if (key === 't') return 'new';
  if (key === 'w') return 'close-tab';
  if (key === 'pagedown') return 'next-tab';
  if (key === 'pageup') return 'previous-tab';
  return digitKey(e.code);
}

/** The host action for a keydown, or null to let it reach the editor (or the text) unchanged. */
export function hostKey(e: KeyInput, ctx: HostKeyContext): HostKeyAction | null {
  if (e.altKey || e.metaKey || ctx.modal) return null;
  // M4: F10 alone opens the ☰ menu, idle or not, in a text target too.
  if (e.key === 'F10') return !e.ctrlKey && !e.shiftKey ? 'menu' : null;
  // F1 alone, when idle (the menu shows Keyboard shortcuts disabled otherwise; R19).
  if (e.key === 'F1') return !e.ctrlKey && !e.shiftKey && ctx.idle ? 'shortcuts' : null;
  if (!e.ctrlKey) return null;
  const key = e.key.toLowerCase();
  const file = fileKey(key, e.shiftKey);
  if (file !== null) return ctx.idle && !ctx.fileBusy ? file : null;
  // R36: the tab keys follow the file keys' rule (idle, no flow running, the name field too).
  const tab = tabKey(e, key, ctx.canReopen ?? false);
  if (tab !== null) return ctx.idle && !ctx.fileBusy ? tab : null;
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

/** What the K3 rule hears: pointer presses, key presses and the window losing focus. */
export type AltGuardEvent =
  | { readonly type: 'pointerdown'; readonly altKey: boolean }
  | {
      readonly type: 'keydown';
      readonly key: string;
      readonly repeat: boolean;
      /** Ctrl, Shift or Meta was already held (Windows' Alt+Shift language switch). */
      readonly otherModifier?: boolean;
    }
  | {
      readonly type: 'keyup';
      readonly key: string;
      /** An in-window dialog is open: a lone Alt opens nothing. */
      readonly modal?: boolean;
    }
  | { readonly type: 'blur' };

/** `armed`: an Alt+click happened (R4). `alone`: Alt is down and nothing else happened since. */
export interface AltState {
  readonly armed: boolean;
  readonly alone: boolean;
}

export const ALT_IDLE: AltState = { armed: false, alone: false };

export interface AltDecision {
  readonly state: AltState;
  /** The event is `preventDefault()`-ed. */
  readonly prevent: boolean;
  /** Open the ☰ menu (M4): an Alt key-up with nothing in between. */
  readonly open: boolean;
}

/**
 * K3 (R4, R32): a `pointerdown` with Alt held arms; the next Alt key-up is prevented and opens
 * nothing. An Alt key-up opens the menu only when Alt went down (not an auto-repeat, no other
 * modifier already held) and came up with no other key, no pointer press and no window blur in
 * between, and no dialog is open: so Alt+click, Alt+Tab, Alt+F4 and Alt+Shift open nothing.
 */
export function altGuard(state: AltState, e: AltGuardEvent): AltDecision {
  const none = (next: AltState): AltDecision => ({ state: next, prevent: false, open: false });
  switch (e.type) {
    case 'pointerdown':
      return none({ armed: state.armed || e.altKey, alone: false });
    case 'keydown':
      if (e.key === 'Alt') {
        // Auto-repeat of the Alt held since the click (or since a lone press) changes nothing.
        if (e.repeat) return none(state);
        return none({ armed: false, alone: e.otherModifier !== true });
      }
      return none(ALT_IDLE);
    case 'keyup':
      if (e.key !== 'Alt') return none(state);
      if (state.armed) return { state: ALT_IDLE, prevent: true, open: false };
      if (state.alone && e.modal !== true) return { state: ALT_IDLE, prevent: true, open: true };
      return none(ALT_IDLE);
    case 'blur':
      return none(ALT_IDLE);
  }
}
