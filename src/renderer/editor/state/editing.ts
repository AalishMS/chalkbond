// The label and text editors in the state (SPEC-editor.md "Label editor", rule R7): opening one,
// replacing its model and closing it by commit or cancel. The document changes only on commit.
import { current } from '@core/doc-model';
import { labelCommit, labelPrefill } from '../model/label-edit';
import { fromText, textOf, type TextEditState } from '../model/text-edit';
import type { AtomId } from '@core/doc-model';
import type { EditorState } from './editor-state';
import type { EditorAction } from './reducer';

type Commit = Extract<EditorAction, { type: 'commit' }>;

/** L1: the label editor on `atom`, filled with its label or element and all selected. */
export function openLabelEditor(state: EditorState, atom: AtomId): EditorState {
  if (state.editing !== null || state.gesture !== null) return state;
  const found = current(state.history).atoms[atom];
  if (!found) return state;
  return {
    ...state,
    hover: null,
    preview: null,
    notice: null,
    editing: { kind: 'label', atom, edit: fromText(labelPrefill(found)) },
  };
}

/** The editing model changed (a keystroke, a selection move). */
export function setEditModel(state: EditorState, edit: TextEditState): EditorState {
  if (state.editing === null) return state;
  return { ...state, editing: { ...state.editing, edit } };
}

/** Esc: close without a change. */
export function cancelEditing(state: EditorState): EditorState {
  return state.editing === null ? state : { ...state, editing: null };
}

/**
 * Enter, or a click elsewhere: the editor closes and a label that changes the atom is one
 * "Change atom" commit (L3).
 */
export function commitEditing(
  state: EditorState,
  commit: (state: EditorState, action: Commit) => EditorState,
): EditorState {
  const editing = state.editing;
  if (editing === null) return state;
  const closed = { ...state, editing: null };
  if (editing.kind !== 'label') return closed;
  const text = textOf(editing.edit).replace(/\n/g, '');
  const atom = editing.atom;
  if (labelCommit(current(state.history), atom, text) === null) return closed;
  return commit(closed, {
    type: 'commit',
    label: 'Change atom',
    recipe: (doc) => labelCommit(doc, atom, text) ?? doc,
  });
}
