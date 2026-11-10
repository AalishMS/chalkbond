// Key event -> command (SPEC-editor.md K1 "Global shortcuts"). Pure: it reads a plain key record.
import type { EditorCommand } from '../state/controller';

/** The parts of a `KeyboardEvent` the map reads. */
export interface KeyInfo {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
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
  return null;
}
