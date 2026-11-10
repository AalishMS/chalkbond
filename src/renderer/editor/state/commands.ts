// Editor commands that act on the selection: delete (S8, K1), select all, the Esc ladder, nudges,
// flips and the in-app clipboard (CB1).
import {
  bounds,
  current,
  extract,
  insert,
  scaling,
  transformItems,
  translation,
  type Selection,
  type SubDoc,
} from '@core/doc-model';
import { deleteWithOrphans } from '../model/cleanup';
import type { Derive } from '../model/derive';
import { selectionCentre } from '../model/frame';
import type { Point } from '../model/geometry';
import { isEmptySelection, selectAll } from '../model/selection';
import { reveal, screenToBlu } from '../model/viewport';
import { EMPTY_SELECTION, type EditorState, type Hit } from './editor-state';
import { nameDismiss } from './name-field';
import type { EditorAction } from './reducer';

type Commit = Extract<EditorAction, { type: 'commit' }>;

/** The hovered item as a selection: what Delete acts on when nothing is selected. */
function hoveredSelection(hit: Hit | null): Selection {
  switch (hit?.kind) {
    case 'atom':
      return { atoms: new Set([hit.id]), bonds: new Set(), objects: new Set() };
    case 'bond':
      return { atoms: new Set(), bonds: new Set([hit.id]), objects: new Set() };
    case 'object':
      return { atoms: new Set(), bonds: new Set(), objects: new Set([hit.id]) };
    default:
      return EMPTY_SELECTION;
  }
}

/** Whether Delete has something to act on: the selection, else the hovered item. */
export function canDelete(state: EditorState): boolean {
  if (state.gesture !== null || state.editing !== null) return false;
  return !isEmptySelection(state.selection) || !isEmptySelection(hoveredSelection(state.hover));
}

/**
 * S8 / K1: delete the selection with the orphan rule (E2), one "Delete" commit; with nothing
 * selected, the hovered item ("Erase").
 */
export function deleteSelection(
  state: EditorState,
  commit: (state: EditorState, action: Commit) => EditorState,
): EditorState {
  if (!canDelete(state)) return state;
  const hasSelection = !isEmptySelection(state.selection);
  const target = hasSelection ? state.selection : hoveredSelection(state.hover);
  const done = commit(state, {
    type: 'commit',
    label: hasSelection ? 'Delete' : 'Erase',
    recipe: (doc) => deleteWithOrphans(doc, target),
    selection: EMPTY_SELECTION,
  });
  return done.history === state.history ? done : { ...done, hover: null };
}

/** Ctrl+A: Select becomes the active tool and everything is selected. */
export function selectEverything(state: EditorState): EditorState {
  if (state.editing !== null) return state;
  return {
    ...state,
    tool: 'select',
    gesture: null,
    preview: null,
    hover: null,
    selection: selectAll(current(state.history)),
  };
}

/**
 * K1 Esc: one step per press: cancel the gesture, close the editor or the name dropdown, clear
 * the notice, clear the selection, switch to Select.
 */
export function escape(state: EditorState): EditorState {
  if (state.gesture !== null || state.preview !== null) {
    return { ...state, gesture: null, preview: null };
  }
  if (state.editing !== null) return { ...state, editing: null };
  const field = state.nameField;
  if (field.open || field.error !== null) return nameDismiss(state);
  if (state.notice !== null) return { ...state, notice: null };
  if (!isEmptySelection(state.selection)) return { ...state, selection: EMPTY_SELECTION };
  if (state.tool !== 'select') return { ...state, tool: 'select', hover: null };
  return state;
}

/**
 * K1: arrow keys move the selection by `dx`, `dy` BLU. A run of nudges is one undo step
 * (`coalesceKey: 'nudge'`); anything else in between ends the run.
 */
export function nudgeSelection(
  state: EditorState,
  dx: number,
  dy: number,
  commit: (state: EditorState, action: Commit) => EditorState,
): EditorState {
  if (state.gesture !== null || state.editing !== null || isEmptySelection(state.selection)) {
    return state;
  }
  const sel = state.selection;
  return commit(state, {
    type: 'commit',
    label: 'Nudge',
    recipe: (doc) => transformItems(doc, sel, translation(dx, dy)),
    coalesceKey: 'nudge',
  });
}

/**
 * Flip horizontal / vertical: the selection mirrored about the centre of its ink box, one "Flip"
 * commit (SPEC-editor.md "Selection actions"). Labels stay upright: svg-render lays a label out
 * from where its bonds are, so "HO" becomes "OH" when the bond now comes from the other side.
 */
export function flipSelection(
  state: EditorState,
  axis: 'h' | 'v',
  derive: Derive,
  commit: (state: EditorState, action: Commit) => EditorState,
): EditorState {
  if (state.gesture !== null || state.editing !== null || isEmptySelection(state.selection)) {
    return state;
  }
  const doc = current(state.history);
  const { scene } = derive.committed(doc);
  const centre = selectionCentre(doc, scene, state.selection);
  if (centre === null) return state;
  const bl = scene.style.bondLength;
  const c = { x: centre.x / bl, y: centre.y / bl };
  const m = axis === 'h' ? scaling(-1, 1, c) : scaling(1, -1, c);
  const sel = state.selection;
  return commit(state, {
    type: 'commit',
    label: 'Flip',
    recipe: (d) => transformItems(d, sel, m),
    selection: sel,
  });
}

/** Whether Copy, Cut and Duplicate have a selection to act on. */
export function canCopy(state: EditorState): boolean {
  return state.gesture === null && state.editing === null && !isEmptySelection(state.selection);
}

/** Whether Paste has something to put: a copied fragment. */
export function canPaste(state: EditorState): boolean {
  return state.gesture === null && state.editing === null && state.clipboard !== null;
}

/** CB1 Copy: the extracted selection goes to the in-app clipboard; the document is untouched. */
export function copySelection(state: EditorState): EditorState {
  if (!canCopy(state)) return state;
  return { ...state, clipboard: extract(current(state.history), state.selection) };
}

/** CB1 Cut: Copy, then delete with the orphan rule (E2), one "Cut" commit. */
export function cutSelection(
  state: EditorState,
  commit: (state: EditorState, action: Commit) => EditorState,
): EditorState {
  if (!canCopy(state)) return state;
  const sel = state.selection;
  const copied = copySelection(state);
  const done = commit(copied, {
    type: 'commit',
    label: 'Cut',
    recipe: (doc) => deleteWithOrphans(doc, sel),
    selection: EMPTY_SELECTION,
  });
  return done.history === state.history ? state : { ...done, hover: null };
}

/**
 * After an insert (paste, duplicate): Select is active with the new items selected (the commit
 * chose them), and V5 brings them into view.
 */
function afterInsert(before: EditorState, done: EditorState, derive: Derive): EditorState {
  if (done.history === before.history) return done;
  const { scene } = derive.committed(current(done.history));
  const size = done.viewport.size;
  const viewport =
    scene.bounds === null || size.w === 0 || size.h === 0
      ? done.viewport
      : reveal(done.viewport, scene.bounds, scene.style.bondLength);
  return { ...done, tool: 'select', hover: null, viewport };
}

/**
 * CB1 Paste: `insert` at the pointer (`at`, canvas px) or, with the pointer off the canvas, at the
 * canvas centre; one "Paste" commit, the pasted items selected, then V5. `sub` is a fragment the
 * host read from the system clipboard; without it the in-app clipboard is pasted.
 */
export function pasteFragment(
  state: EditorState,
  at: Point | null,
  sub: SubDoc | undefined,
  derive: Derive,
  commit: (state: EditorState, action: Commit) => EditorState,
): EditorState {
  const fragment = sub ?? state.clipboard;
  if (fragment === null || state.gesture !== null || state.editing !== null) return state;
  const { scene } = derive.committed(current(state.history));
  const size = state.viewport.size;
  const target = screenToBlu(
    state.viewport,
    at ?? { x: size.w / 2, y: size.h / 2 },
    scene.style.bondLength,
  );
  const done = commit(state, {
    type: 'commit',
    label: 'Paste',
    recipe: (doc) => insert(doc, fragment, target)[0],
    selection: 'inserted',
  });
  return afterInsert(state, done, derive);
}

/** CB1 Duplicate: a copy of the selection 1.0 BLU right and down of it, selected, then V5. */
export function duplicateSelection(
  state: EditorState,
  derive: Derive,
  commit: (state: EditorState, action: Commit) => EditorState,
): EditorState {
  if (!canCopy(state)) return state;
  const doc = current(state.history);
  const box = bounds(doc, state.selection);
  if (box === null) return state;
  const sub = extract(doc, state.selection);
  const at = { x: box.x + box.w / 2 + 1, y: box.y + box.h / 2 + 1 };
  const done = commit(state, {
    type: 'commit',
    label: 'Duplicate',
    recipe: (d) => insert(d, sub, at)[0],
    selection: 'inserted',
  });
  return afterInsert(state, done, derive);
}
