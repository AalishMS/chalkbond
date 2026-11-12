// Key event -> command (SPEC-editor.md K1 "Global shortcuts"). Pure: it reads a plain key record.
import type { ElementSymbol } from '@core/doc-model';
import { TOOLS } from '../state/catalog';
import type { EditorCommand } from '../state/controller';
import type { Hit, ToolId } from '../state/editor-state';
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
  if (e.shiftKey && key === 'k') return 'toggle-kekulé';
  if (e.shiftKey && key === 'l') return 'clean-up';
  if (e.shiftKey && key === 't') return 'tidy-reaction';
  if (key === 'a' && !e.shiftKey) return 'select-all';
  if (key === 'c' && !e.shiftKey) return 'copy';
  if (key === 'x' && !e.shiftKey) return 'cut';
  if (key === 'v' && !e.shiftKey) return 'paste';
  if (key === 'd' && !e.shiftKey) return 'duplicate';
  // Ctrl+= and Ctrl++ (Ctrl+Shift+=) zoom in; the shifted forms need no layout knowledge.
  if (key === '=' || key === '+') return 'zoom-in';
  if (key === '-' || key === '_') return 'zoom-out';
  if (!e.shiftKey && key === '0') return 'zoom-fit';
  if (!e.shiftKey && key === '1') return 'zoom-reset';
  return null;
}

/** Arrow-key nudge distances, BLU: 0.1, and 1.0 with Shift. */
export const NUDGE_SMALL = 0.1;
export const NUDGE_BIG = 1;

/**
 * K1 keys that need no Ctrl: Delete / Backspace delete the selection (else the hovered item),
 * Esc takes one step of the ladder, arrow keys nudge the selection. Not left to the host, whatever `shortcuts` says.
 */
export function canvasKey(e: KeyInfo): EditorAction | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (e.key === 'Delete' || e.key === 'Backspace') return { type: 'delete' };
  if (e.key === 'Escape') return { type: 'escape' };
  const step = e.shiftKey ? NUDGE_BIG : NUDGE_SMALL;
  switch (e.key) {
    case 'ArrowLeft':
      return { type: 'nudge', dx: -step, dy: 0 };
    case 'ArrowRight':
      return { type: 'nudge', dx: step, dy: 0 };
    case 'ArrowUp':
      return { type: 'nudge', dx: 0, dy: -step };
    case 'ArrowDown':
      return { type: 'nudge', dx: 0, dy: step };
    default:
      return null;
  }
}

/** A change a hover key makes to the hovered atom or bond (K2). */
export type HoverEdit =
  | { readonly kind: 'element'; readonly element: ElementSymbol }
  | { readonly kind: 'charge'; readonly delta: 1 | -1 }
  | { readonly kind: 'sprout'; readonly order: 1 | 2 | 3 }
  | { readonly kind: 'order'; readonly order: 1 | 2 | 3 }
  | { readonly kind: 'stereo'; readonly stereo: 'wedge' | 'hash' }
  /** Enter: open the label editor on the hovered atom (L1). */
  | { readonly kind: 'label' };

/** K2: element keys over an atom; `L` is chlorine and `B` bromine. */
const ELEMENT_KEYS: Readonly<Record<string, ElementSymbol>> = {
  c: 'C',
  h: 'H',
  n: 'N',
  o: 'O',
  s: 'S',
  p: 'P',
  f: 'F',
  i: 'I',
  l: 'Cl',
  b: 'Br',
};

/** K2: tool keys, used when no hover key claims the press. The digits (R50) come from `TOOLS`. */
const TOOL_KEYS: Readonly<Record<string, ToolId>> = {
  ...Object.fromEntries(TOOLS.map((t) => [t.digit, t.id])),
  v: 'select',
  e: 'erase',
  b: 'bond',
  z: 'chain',
  r: 'ring',
  l: 'atom',
  a: 'arrow',
  '+': 'plus',
  m: 'curved',
  t: 'text',
};

const ORDERS: Readonly<Record<string, 1 | 2 | 3>> = { '1': 1, '2': 2, '3': 3 };

function atomEdit(k: string): HoverEdit | null {
  const element = ELEMENT_KEYS[k];
  if (element !== undefined) return { kind: 'element', element };
  if (k === '+' || k === '=') return { kind: 'charge', delta: 1 };
  if (k === '-') return { kind: 'charge', delta: -1 };
  const order = ORDERS[k];
  if (order !== undefined) return { kind: 'sprout', order };
  if (k === 'Enter') return { kind: 'label' };
  return null;
}

function bondEdit(k: string): HoverEdit | null {
  const order = ORDERS[k];
  if (order !== undefined) return { kind: 'order', order };
  if (k === 'w') return { kind: 'stereo', stereo: 'wedge' };
  if (k === 'h') return { kind: 'stereo', stereo: 'hash' };
  return null;
}

/**
 * K2 canvas keys (R3, R6): the key matches `KeyboardEvent.key`, letters in either case; Ctrl, Alt
 * and Meta must be up, Shift is ignored. If an atom or bond is hovered (and the tool is not Erase
 * or Text) and the key is one of its hover keys, the key acts on it; otherwise a tool key selects
 * that tool; any other key does nothing. Call it only with the canvas focused.
 */
export function hoverKeys(e: KeyInfo, hover: Hit | null, tool: ToolId): EditorAction | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (hover !== null && tool !== 'erase' && tool !== 'text') {
    const edit = hover.kind === 'atom' ? atomEdit(k) : hover.kind === 'bond' ? bondEdit(k) : null;
    if (edit !== null) return { type: 'hover-edit', edit };
  }
  const target = TOOL_KEYS[k];
  return target === undefined ? null : { type: 'select-tool', tool: target };
}
