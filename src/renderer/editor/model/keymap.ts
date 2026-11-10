// Key event -> command (SPEC-editor.md K1 "Global shortcuts"). Pure: it reads a plain key record.
import type { EditorCommand } from '../state/controller';
import type { EditorAction } from '../state/reducer';

/** The parts of a `KeyboardEvent` the map reads. */
export interface KeyInfo {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

/**
 * R23: in the name field only Undo and Redo reach the document, and only while the field is
 * empty; with text in it Ctrl+Z / Ctrl+Y are the field's own text undo.
 */
export function fieldCommand(
  e: KeyInfo,
  shortcuts: 'all' | 'canvas-only',
  text: string,
): EditorCommand | null {
  if (text !== '') return null;
  const command = globalCommand(e, shortcuts);
  return command === 'undo' || command === 'redo' ? command : null;
}

/**
 * The K1 command for a key press, or `null`. With `canvas-only` the Ctrl rows belong to the
 * host's menu and nothing matches.
 */
export function globalCommand(e: KeyInfo, shortcuts: 'all' | 'canvas-only'): EditorCommand | null {
  if (shortcuts === 'canvas-only' || !e.ctrlKey || e.altKey || e.metaKey) return null;
  const key = e.key.toLowerCase();
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !e.shiftKey) return 'redo';
  if (key === 'f' && !e.shiftKey) return 'focus-name-field';
  if (key === 'a' && !e.shiftKey) return 'select-all';
  // Ctrl+= and Ctrl++ (Ctrl+Shift+=) zoom in; the shifted forms need no layout knowledge.
  if (key === '=' || key === '+') return 'zoom-in';
  if (key === '-' || key === '_') return 'zoom-out';
  if (!e.shiftKey && key === '0') return 'zoom-fit';
  if (!e.shiftKey && key === '1') return 'zoom-reset';
  return null;
}

/**
 * K1 keys that need no Ctrl: Delete / Backspace delete the selection (else the hovered item),
 * Esc takes one step of the ladder. Not left to the host, whatever `shortcuts` says.
 */
export function canvasKey(e: KeyInfo): EditorAction | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (e.key === 'Delete' || e.key === 'Backspace') return { type: 'delete' };
  if (e.key === 'Escape') return { type: 'escape' };
  return null;
}
