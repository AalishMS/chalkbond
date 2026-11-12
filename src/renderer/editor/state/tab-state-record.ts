// The per-tab state as a record (SPEC-editor.md R57, part 2) for app-shell's session store: the
// record is doc-model's HistoryRecord (D2) and nothing else; the view and the saved state are the
// host's (app-shell SS3). Pure: values in, values out.
import {
  current,
  historyFromRecord,
  historyToRecord,
  type Doc,
  type HistoryRecord,
  type ParseError,
  type Result,
} from '@core/doc-model';
import { EMPTY_SELECTION } from './editor-state';
import { newTabState, sealTabState, tabStateParts, type EditorTabState } from './tab-state';

/** A tab's drawing and its newest undo steps as JSON (doc-model's `HistoryRecord`, D2). */
export type EditorTabRecord = HistoryRecord;

/** The drawing and the newest `maxSteps` undo steps (no redo steps), JSON-serialisable. */
export function tabStateToRecord(
  s: EditorTabState,
  opts: { readonly maxSteps: number },
): EditorTabRecord {
  return historyToRecord(tabStateParts(s).history, { maxSteps: opts.maxSteps });
}

export interface TabStateFromRecordOptions {
  /** ISO timestamps for the restored history's next edits (the editor's clock). */
  readonly clock: () => string;
  /**
   * The zoom and the BLU point at the canvas centre, from the host's index; null (none stored,
   * app-shell SS3) gives V2's default view, fitted to the canvas when put, as `newState` does.
   */
  readonly view: {
    readonly zoom: number;
    readonly centre: { readonly x: number; readonly y: number };
  } | null;
  /**
   * `current`: the drawing is the saved one (clean). `unknown`: the host cannot tell, so the state
   * stays dirty until `markSaved` or `tabStateMarkSaved`, even if undo returns to this drawing.
   */
  readonly saved: 'current' | 'unknown';
}

/** Key no drawing has: the strict `.chalk` schema rejects unknown keys (doc-model). */
const UNKNOWN_BASELINE = '#unknown-baseline';

/**
 * A saved baseline that differs from every drawing (`differs` sees the extra key), so the state
 * is dirty until the baseline is replaced by `mark-saved` or `tabStateMarkSaved`. It is never
 * rendered, written or compared by identity with a real drawing.
 */
function unknownBaseline(doc: Doc): Doc {
  const marked: Doc & { readonly [UNKNOWN_BASELINE]: true } = { ...doc, [UNKNOWN_BASELINE]: true };
  return Object.freeze(marked);
}

/**
 * Restores a tab's state from a record (untrusted data): strict shape and the history through
 * doc-model's `historyFromRecord` (D2), whose error is the result's. A damaged undo step is dropped
 * with every older one (`droppedSteps`); the drawing is never lost to it. The state has no redo
 * steps, no selection and the given view (or, for `view: null`, the view `newState` makes).
 */
export function tabStateFromRecord(
  value: unknown,
  opts: TabStateFromRecordOptions,
): Result<{ state: EditorTabState; droppedSteps: number }, ParseError> {
  const restored = historyFromRecord(value, { clock: opts.clock });
  if (!restored.ok) return restored;
  const { history, dropped } = restored.value;
  const doc = current(history);
  const saved = opts.saved === 'current' ? doc : unknownBaseline(doc);
  const view = opts.view;
  const state =
    view === null
      ? sealTabState({ ...tabStateParts(newTabState(doc, opts.clock)), history, saved })
      : sealTabState({
          history,
          saved,
          selection: EMPTY_SELECTION,
          view: { zoom: view.zoom, centre: { x: view.centre.x, y: view.centre.y } },
          viewPending: false,
        });
  return { ok: true, value: { state, droppedSteps: dropped } };
}
