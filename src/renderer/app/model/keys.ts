// K1 host keys (SPEC-app-shell.md "Keyboard (host keys)"): the pure decision. Rows are added by
// the tasks that build their actions; C8 adds Ctrl+C (clipboard-export CB-K).

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
}

/** `copy-whole`: CB-C1's whole-drawing branch (an empty drawing gives N-C4). */
export type HostKeyAction = 'copy-whole';

/** The host action for a keydown, or null to let it reach the editor (or the text) unchanged. */
export function hostKey(e: KeyInput, ctx: HostKeyContext): HostKeyAction | null {
  if (!e.ctrlKey || e.altKey || e.metaKey) return null;
  const key = e.key.toLowerCase();
  // R4: Ctrl+C in a text target is native text copy; with a selection the editor copies.
  if (key === 'c' && !e.shiftKey && !ctx.textTarget && ctx.selectionEmpty) return 'copy-whole';
  return null;
}
