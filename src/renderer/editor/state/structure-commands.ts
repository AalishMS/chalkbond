// The selection actions on structures (SPEC-editor.md "Selection actions" C1-C3) and the
// warnings button (C6). The scope is the selection, or the whole document when nothing is
// selected; each action is one undo step and does nothing when the scope does not allow it.
import { aromatize, cleanStructure, expandLabel, interpretLabel, kekulize } from '@core/chem-core';
import { current, type AtomId, type Doc } from '@core/doc-model';
import type { Derive } from '../model/derive';
import { selectionInk } from '../model/frame';
import { selectionScope } from '../model/scope';
import { expandSelection, isEmptySelection } from '../model/selection';
import { reveal } from '../model/viewport';
import { nextWarning } from '../model/warnings';
import type { EditorState } from './editor-state';
import { showNotice } from './notice';
import type { EditorAction } from './reducer';
import { selectionActions } from './selection-actions';

type Commit = Extract<EditorAction, { type: 'commit' }>;
type Run = (state: EditorState, action: Commit) => EditorState;

/** The atoms the actions work on: the selection's, or every atom when nothing is selected. */
function scopeAtoms(doc: Doc, state: EditorState): readonly AtomId[] {
  return isEmptySelection(state.selection)
    ? (Object.keys(doc.atoms) as AtomId[])
    : [...expandSelection(doc, state.selection).atoms];
}

const idle = (state: EditorState): boolean => state.gesture === null && state.editing === null;

/** C1: Clean up. The drawing stays where it was (chem-core fits the new layout onto the old). */
export function cleanUp(state: EditorState, derive: Derive, commit: Run): EditorState {
  if (!idle(state)) return state;
  const doc = current(state.history);
  const scope = selectionScope(doc, derive.committed(doc).perception, state.selection);
  if (!selectionActions(scope).cleanUp.enabled) return state;
  const atoms = scopeAtoms(doc, state);
  return commit(state, {
    type: 'commit',
    label: 'Clean up',
    recipe: (d) => cleanStructure(d, atoms),
  });
}

const sameOrders = (a: Doc, b: Doc): boolean =>
  Object.values(b.bonds).every((bond) => a.bonds[bond.id]?.order === bond.order);

/**
 * C3: with an order-1.5 bond in scope, Show Kekulé (a ring with no alternating structure is an
 * error notice and nothing changes); else, with an aromatic ring drawn with other orders, Show
 * circle (an unchanged document records nothing and says so).
 */
export function toggleKekule(state: EditorState, derive: Derive, commit: Run): EditorState {
  if (!idle(state)) return state;
  const doc = current(state.history);
  const scope = selectionScope(doc, derive.committed(doc).perception, state.selection);
  const action = selectionActions(scope).kekule;
  if (!action.enabled) return state;
  const atoms = scopeAtoms(doc, state);
  if (action.mode === 'kekule') {
    return commit(state, {
      type: 'commit',
      label: 'Show Kekulé',
      recipe: (d) => kekulize(d, atoms),
    });
  }
  if (sameOrders(doc, aromatize(doc, atoms))) {
    return showNotice(state, 'info', 'No benzene ring here to show as a circle.');
  }
  return commit(state, {
    type: 'commit',
    label: 'Show circle',
    recipe: (d) => aromatize(d, atoms),
  });
}

/** C2: Expand every abbreviation atom in the selection, one "Expand label" step. */
export function expandLabels(state: EditorState, derive: Derive, commit: Run): EditorState {
  if (!idle(state)) return state;
  const doc = current(state.history);
  const scope = selectionScope(doc, derive.committed(doc).perception, state.selection);
  if (!selectionActions(scope).expand) return state;
  // Ids first: inside the recipe the document is a draft the ops change in place.
  const targets = scopeAtoms(doc, state).filter((id) => {
    const label = doc.atoms[id]?.label;
    return label !== undefined && interpretLabel(label).kind === 'abbreviation';
  });
  return commit(state, {
    type: 'commit',
    label: 'Expand label',
    recipe: (d) => targets.reduce((acc, id) => expandLabel(acc, id), d),
  });
}

/**
 * C6: the warnings button selects the atoms and bonds of the next warning, in order and
 * cycling, switches to Select (the selection survives only there) and brings them into view.
 */
export function showWarning(state: EditorState, derive: Derive): EditorState {
  if (!idle(state)) return state;
  const doc = current(state.history);
  const { perception, scene } = derive.committed(doc);
  const selection = nextWarning(perception, state.selection);
  if (selection === null) return state;
  const ink = selectionInk(doc, scene, selection);
  const size = state.viewport.size;
  const viewport =
    ink === null || size.w === 0 || size.h === 0
      ? state.viewport
      : reveal(state.viewport, ink, scene.style.bondLength);
  return {
    ...state,
    tool: 'select',
    gesture: null,
    preview: null,
    hover: null,
    selection,
    viewport,
  };
}
