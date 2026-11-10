// The name field's reducer steps (SPEC-editor.md "Name field and reaction text", N1 and N2).
import { structureFromText } from '@core/chem-core';
import { current, insert, type Doc } from '@core/doc-model';
import { insertPosition } from '../model/placement';
import { reveal, screenToBlu } from '../model/viewport';
import { nameError, suggestionRows } from '../model/suggestions';
import type { EditorState, NameField } from './editor-state';
import type { EditorAction, ReducerContext } from './reducer';

type Commit = Extract<EditorAction, { type: 'commit' }>;

/** The field as it is when idle and empty. */
export const CLEAR_FIELD: NameField = { text: '', open: false, highlighted: 0, error: null };

/** Typing: the dropdown opens when there are rows; the highlight and any error reset. */
export function nameText(state: EditorState, text: string, ctx: ReducerContext): EditorState {
  const open = suggestionRows(ctx.names, text).length > 0;
  return { ...state, nameField: { text, open, highlighted: 0, error: null } };
}

/** ↑ / ↓: moves the highlight inside the rows; nothing while the dropdown is closed. */
export function nameHighlight(state: EditorState, dir: 1 | -1, ctx: ReducerContext): EditorState {
  const field = state.nameField;
  if (!field.open) return state;
  const last = suggestionRows(ctx.names, field.text).length - 1;
  const highlighted = Math.min(last, Math.max(0, field.highlighted + dir));
  return highlighted === field.highlighted
    ? state
    : { ...state, nameField: { ...field, highlighted } };
}

/** Esc, first step: close the dropdown or the not-found panel, keep the text. */
export function nameDismiss(state: EditorState): EditorState {
  const field = state.nameField;
  if (!field.open && field.error === null) return state;
  return { ...state, nameField: { ...field, open: false, error: null } };
}

/** Esc, second step: empty the field. */
export function nameClear(state: EditorState): EditorState {
  const field = state.nameField;
  const same = field.text === '' && !field.open && field.error === null && field.highlighted === 0;
  return same ? state : { ...state, nameField: CLEAR_FIELD };
}

/** Enter: the highlighted row when the dropdown shows rows, else the typed text. */
export function nameEnter(
  state: EditorState,
  ctx: ReducerContext,
  commit: (state: EditorState, action: Commit) => EditorState,
): EditorState {
  const field = state.nameField;
  const rows = field.open ? suggestionRows(ctx.names, field.text) : [];
  const row = rows[field.highlighted];
  return insertText(state, row === undefined ? field.text : row.entry.name, ctx, commit);
}

/**
 * N2: insert a structure from text (a name, SMILES, Molfile). Success: one "Insert <name>"
 * commit placed by P7, the inserted items selected, Select active, the view revealed (V5), the
 * field cleared, "Inserted <name>" announced. Failure: nothing changes but the not-found state.
 */
export function insertText(
  state: EditorState,
  text: string,
  ctx: ReducerContext,
  commit: (state: EditorState, action: Commit) => EditorState,
): EditorState {
  const result = structureFromText(text, ctx.names);
  if (!result.ok) {
    if (result.error.code === 'empty') return state;
    return {
      ...state,
      nameField: { text, open: false, highlighted: 0, error: nameError(text, result.error) },
    };
  }
  const { sub, entry } = result.value;
  const doc: Doc = current(state.history);
  const { scene } = ctx.derive.committed(doc);
  const { size } = state.viewport;
  const centre = screenToBlu(
    state.viewport,
    { x: size.w / 2, y: size.h / 2 },
    scene.style.bondLength,
  );
  const at = insertPosition(doc, scene, sub, centre);
  const name = entry?.name;
  const done = commit(state, {
    type: 'commit',
    label: name === undefined ? 'Insert structure' : `Insert ${name}`,
    recipe: (d) => insert(d, sub, at)[0],
    selection: 'inserted',
  });
  if (done.history === state.history) return done;

  const after = ctx.derive.committed(current(done.history)).scene;
  const viewport =
    after.bounds === null || size.w === 0 || size.h === 0
      ? done.viewport
      : reveal(done.viewport, after.bounds, after.style.bondLength);
  const id = done.noticeSeq + 1;
  return {
    ...done,
    tool: 'select',
    viewport,
    nameField: CLEAR_FIELD,
    notice: { id, kind: 'info', text: `Inserted ${name ?? 'structure'}` },
    noticeSeq: id,
  };
}
