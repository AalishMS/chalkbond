import { ChemError, type NameIndex } from '@core/chem-core';
import {
  canRedo,
  canUndo,
  current,
  redo,
  transact,
  undo,
  type AtomId,
  type Doc,
  type Selection,
  type StylePreset,
  type SubDoc,
} from '@core/doc-model';
import type { CanvasEvent, MoveEvent } from '../model/canvas-event';
import type { Derive } from '../model/derive';
import type { Point, Rect, Size } from '../model/geometry';
import {
  clampPan,
  fitViewport,
  initialViewport,
  stepViewport,
  switchPreset,
  wheelZoom,
  zoomAbout,
  type Viewport,
} from '../model/viewport';
import type { HoverEdit } from '../model/keymap';
import type { Script, TextEditState } from '../model/text-edit';
import type { TextTarget } from '../model/text-ops';
import { insertedSelection } from '../model/selection';
import { OPTIONS, isVariantTool } from './catalog';
import {
  copySelection,
  cutSelection,
  deleteSelection,
  duplicateSelection,
  escape,
  flipSelection,
  hoverEdit,
  nudgeSelection,
  pasteFragment,
  replaceDocument,
  selectEverything,
} from './commands';
import { differs } from './dirty';
import { showNotice } from './notice';
import { followFormula, toggleFormula } from './formula';
import { setPreset } from './preset';
import {
  cleanUp,
  expandLabels,
  showWarning,
  tidyReaction,
  toggleKekule,
} from './structure-commands';
import {
  cancelEditing,
  commitEditing,
  editInsert,
  editScript,
  editStyle,
  openLabelEditor,
  openTextEditor,
  setEditModel,
} from './editing';
import {
  EMPTY_SELECTION,
  type Editing,
  type EditorState,
  type GestureState,
  type Hit,
  type Preview,
  type ToolId,
  type VariantTool,
} from './editor-state';
import { sameHit } from './hover';
import { newTabState, putTabState, type EditorTabState } from './tab-state';
import { hoverMove, pointer } from './pointer';
import {
  insertText,
  nameClear,
  nameDismiss,
  nameEnter,
  nameHighlight,
  nameText,
} from './name-field';

/** What the reducer needs besides state and action (SPEC-editor.md "State model"). */
export interface ReducerContext {
  readonly derive: Derive;
  readonly names: NameIndex;
  /** X1: where an unexpected error (a `DocError`) is logged; `console.error` in the app. */
  readonly logError: (error: unknown) => void;
}

export type EditorAction =
  | { type: 'focus-request' }
  | { type: 'select-tool'; tool: ToolId }
  | { type: 'select-variant'; tool: VariantTool; variant: string }
  | {
      type: 'commit';
      label: string;
      recipe: (doc: Doc) => Doc;
      coalesceKey?: string;
      /**
       * The selection after the commit; `'inserted'` selects what the commit added (ids issued
       * by it). Default: the old one minus ids the commit removed.
       */
      selection?: Selection | 'inserted';
    }
  | { type: 'name-text'; text: string }
  | { type: 'name-highlight'; dir: 1 | -1 }
  | { type: 'name-dismiss' }
  | { type: 'name-clear' }
  | { type: 'name-enter' }
  | { type: 'insert-text'; text: string }
  | { type: 'pointer'; event: CanvasEvent }
  /** The pointer moved with no gesture running: hover and the tool's ghost (HV1, B6). */
  | { type: 'hover-move'; event: MoveEvent }
  /** A hover key (K2): change the hovered atom or bond. */
  | { type: 'hover-edit'; edit: HoverEdit }
  | { type: 'delete' }
  | { type: 'nudge'; dx: number; dy: number }
  | { type: 'select-all' }
  | { type: 'flip'; axis: 'h' | 'v' }
  | { type: 'copy' }
  | { type: 'cut' }
  /** `at`: the pointer, canvas px, or null for the canvas centre. `sub`: a fragment from the host. */
  | { type: 'paste'; at: Point | null; sub?: SubDoc }
  | { type: 'duplicate' }
  | { type: 'escape' }
  /** C1: Clean up the scope (the selection, else everything). */
  | { type: 'clean-up' }
  /** C3: Show Kekulé or Show circle, whichever the scope offers. */
  | { type: 'toggle-kekule' }
  /** R51, C7: Show structural | Show skeletal on the whole document, then U13. */
  | { type: 'toggle-formula' }
  /** TR1-TR6: Tidy reaction on the scope (the selection, else everything near the arrows). */
  | { type: 'tidy' }
  /** C2: Expand the abbreviations in the selection. */
  | { type: 'expand' }
  /** C6: select the next warning and reveal it. */
  | { type: 'show-warning' }
  /** PR1: the Slides | Handout switch. */
  | { type: 'set-preset'; preset: StylePreset }
  /** R58: a whole replacement of the drawing as one undo step (app-shell AS7). */
  | { type: 'replace-doc'; doc: Doc; label: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'notice-show'; kind: 'info' | 'error'; text: string }
  | { type: 'notice-expired'; id: number }
  | { type: 'notice-clear' }
  | { type: 'load'; doc: Doc }
  /** R57: a tab's part replaces history, saved, selection and view. */
  | { type: 'put-state'; state: EditorTabState }
  | { type: 'mark-saved' }
  | { type: 'set-selection'; selection: Selection }
  | { type: 'set-hover'; hover: Hit | null }
  | { type: 'set-gesture'; gesture: GestureState | null }
  | { type: 'set-preview'; preview: Preview | null }
  | { type: 'set-editing'; editing: Editing | null }
  /** L1: open the label editor on an atom. */
  | { type: 'open-label'; atom: AtomId }
  /** T1: open the text editor on a stored text or a new one. */
  | { type: 'open-text'; target: TextTarget }
  /** x2 / x2 in the text options: the selection's script, or the next typed character's. */
  | { type: 'edit-script'; script: Script }
  /** B / I in the text options. */
  | { type: 'edit-style'; flag: 'bold' | 'italic' }
  /** Δ, hν, °, → in the text options: plain text at the caret. */
  | { type: 'edit-insert'; text: string }
  /** The editing model changed (a keystroke or a selection move in the box). */
  | { type: 'edit-set'; edit: TextEditState }
  /** Enter or a click elsewhere: commit the open editor. */
  | { type: 'edit-commit' }
  /** Esc: close the open editor without a change. */
  | { type: 'edit-cancel' }
  | { type: 'set-space'; held: boolean }
  | { type: 'canvas-resized'; size: Size }
  | { type: 'zoom-step'; dir: 1 | -1 }
  | { type: 'zoom-wheel'; deltaY: number; anchor: Point }
  | { type: 'zoom-reset' }
  | { type: 'zoom-fit' }
  | { type: 'pan-by'; dx: number; dy: number };

type ViewportAction = Extract<
  EditorAction,
  { type: 'zoom-step' | 'zoom-wheel' | 'zoom-reset' | 'zoom-fit' | 'pan-by' | 'canvas-resized' }
>;

/** X1 wording for a failed commit. */
export function errorText(error: unknown): string {
  if (error instanceof ChemError) {
    if (error.code === 'too-large') return 'That structure is too big to draw (over 1000 atoms).';
    if (error.code === 'cannot-kekulize') {
      return "This ring can't be shown with alternating double bonds.";
    }
    return error.message;
  }
  return "That edit isn't possible here.";
}

const docOf = (state: EditorState): Doc => current(state.history);

/** Selection, hover, preview and gesture are not carried across history or a new document. */
const settled = (state: EditorState): EditorState => ({
  ...state,
  selection: EMPTY_SELECTION,
  hover: null,
  gesture: null,
  preview: null,
});

function pruneSelection(selection: Selection, doc: Doc): Selection {
  const atoms = [...selection.atoms].filter((id) => id in doc.atoms);
  const bonds = [...selection.bonds].filter((id) => id in doc.bonds);
  const objects = [...selection.objects].filter((id) => id in doc.objects);
  if (
    atoms.length === selection.atoms.size &&
    bonds.length === selection.bonds.size &&
    objects.length === selection.objects.size
  ) {
    return selection;
  }
  return { atoms: new Set(atoms), bonds: new Set(bonds), objects: new Set(objects) };
}

function commit(
  state: EditorState,
  action: Extract<EditorAction, { type: 'commit' }>,
  ctx: ReducerContext,
): EditorState {
  const opts = action.coalesceKey === undefined ? {} : { coalesceKey: action.coalesceKey };
  try {
    const history = transact(state.history, action.label, action.recipe, opts);
    const next = current(history);
    const before = docOf(state);
    const selection =
      action.selection === 'inserted'
        ? insertedSelection(before.nextId, next)
        : (action.selection ?? pruneSelection(state.selection, next));
    return { ...state, history, selection, gesture: null, preview: null, notice: null };
  } catch (error) {
    if (!(error instanceof ChemError)) ctx.logError(error);
    return showNotice({ ...state, gesture: null, preview: null }, 'error', errorText(error));
  }
}

function stepHistory(state: EditorState, dir: 'undo' | 'redo', ctx: ReducerContext): EditorState {
  if (state.editing !== null) return state;
  const can = dir === 'undo' ? canUndo(state.history) : canRedo(state.history);
  if (!can) return state;
  const history = dir === 'undo' ? undo(state.history) : redo(state.history);
  const stepped = { ...settled(state), history, notice: null };
  // PR1: the viewport follows the style's bond length (a preset switch undone or redone).
  const was = ctx.derive.committed(docOf(state)).scene.style;
  const now = ctx.derive.committed(current(history)).scene.style;
  if (was.bondLength !== now.bondLength) {
    return {
      ...stepped,
      viewport: switchPreset(state.viewport, was.bondLength, now.bondLength),
    };
  }
  // U13: a formula switch undone or redone keeps the zoom and the drawing's centre.
  if (was.ptPerBlu === now.ptPerBlu) return stepped;
  return {
    ...stepped,
    viewport: followFormula(state.viewport, docOf(state), current(history), ctx.derive),
  };
}

/** Ink bounds (pt) and bond length (pt) of a document's scene. */
function sceneOf(doc: Doc, ctx: ReducerContext): { bounds: Rect | null; bond: number } {
  const { scene } = ctx.derive.committed(doc);
  return { bounds: scene.bounds, bond: scene.style.bondLength };
}

/** The same state object when the viewport did not change in value. */
function withViewport(state: EditorState, viewport: Viewport): EditorState {
  const v = state.viewport;
  const same = viewport.zoom === v.zoom && viewport.pan.x === v.pan.x && viewport.pan.y === v.pan.y;
  return same ? state : { ...state, viewport };
}

function viewportAction(
  state: EditorState,
  action: ViewportAction,
  ctx: ReducerContext,
): EditorState {
  const v = state.viewport;
  const { bounds, bond } = sceneOf(docOf(state), ctx);
  switch (action.type) {
    case 'zoom-step':
      return withViewport(state, stepViewport(v, action.dir));
    case 'zoom-wheel':
      return withViewport(state, wheelZoom(v, action.deltaY, action.anchor));
    case 'zoom-reset': {
      // R49 (supersedes R12): 100 % (zoom 1) whatever the preset; V2's default is for new and
      // loaded documents only.
      const centre = { x: v.size.w / 2, y: v.size.h / 2 };
      return withViewport(state, zoomAbout(v, 1, centre));
    }
    case 'zoom-fit':
      return withViewport(state, fitViewport(bounds, v.size, bond));
    case 'pan-by': {
      const panned = { ...v, pan: { x: v.pan.x + action.dx, y: v.pan.y + action.dy } };
      return withViewport(state, clampPan(panned, bounds));
    }
    case 'canvas-resized': {
      const size = action.size;
      if (size.w === v.size.w && size.h === v.size.h) return state;
      // First measurement: apply V2 to the real size, unless a tab's own view was put in (R57);
      // that one keeps its zoom and centre like any resize.
      if ((v.size.w === 0 || v.size.h === 0) && state.viewPending) {
        const pending = size.w === 0 || size.h === 0;
        return { ...state, viewport: initialViewport(bounds, size, bond), viewPending: pending };
      }
      // "Resizing keeps the document point under the canvas centre fixed."
      const pan = { x: v.pan.x + (size.w - v.size.w) / 2, y: v.pan.y + (size.h - v.size.h) / 2 };
      return { ...state, viewport: { ...v, pan, size } };
    }
  }
}

/** Pure reducer; returns the same object when nothing changes. */
export function reduce(state: EditorState, action: EditorAction, ctx: ReducerContext): EditorState {
  switch (action.type) {
    case 'select-tool':
      if (action.tool === state.tool) return state;
      // G3: a tool switch cancels the gesture; the selection survives only into Select.
      return {
        ...state,
        tool: action.tool,
        gesture: null,
        preview: null,
        hover: null,
        selection: action.tool === 'select' ? state.selection : EMPTY_SELECTION,
      };
    case 'select-variant': {
      if (!isVariantTool(action.tool)) return state;
      if (!OPTIONS[action.tool].some((o) => o.id === action.variant)) return state;
      if (state.variants[action.tool] === action.variant) return state;
      return { ...state, variants: { ...state.variants, [action.tool]: action.variant } };
    }
    case 'commit':
      return commit(state, action, ctx);
    case 'pointer':
      return pointer(state, action.event, ctx, (s, a) => commit(s, a, ctx));
    case 'hover-move':
      return hoverMove(state, action.event, ctx);
    case 'hover-edit':
      return hoverEdit(state, action.edit, (s, a) => commit(s, a, ctx));
    case 'delete':
      return deleteSelection(state, (s, a) => commit(s, a, ctx));
    case 'nudge':
      return nudgeSelection(state, action.dx, action.dy, (s, a) => commit(s, a, ctx));
    case 'select-all':
      return selectEverything(state);
    case 'copy':
      return copySelection(state);
    case 'cut':
      return cutSelection(state, (s, a) => commit(s, a, ctx));
    case 'paste':
      return pasteFragment(state, action.at, action.sub, ctx.derive, (s, a) => commit(s, a, ctx));
    case 'duplicate':
      return duplicateSelection(state, ctx.derive, (s, a) => commit(s, a, ctx));
    case 'flip':
      return flipSelection(state, action.axis, ctx.derive, (s, a) => commit(s, a, ctx));
    case 'escape':
      return escape(state);
    case 'clean-up':
      return cleanUp(state, ctx.derive, (s, a) => commit(s, a, ctx));
    case 'toggle-kekule':
      return toggleKekule(state, ctx.derive, (s, a) => commit(s, a, ctx));
    case 'toggle-formula':
      return toggleFormula(state, ctx.derive, (s, a) => commit(s, a, ctx));
    case 'tidy':
      return tidyReaction(state, ctx.derive, (s, a) => commit(s, a, ctx));
    case 'expand':
      return expandLabels(state, ctx.derive, (s, a) => commit(s, a, ctx));
    case 'show-warning':
      return showWarning(state, ctx.derive);
    case 'set-preset':
      return setPreset(state, action.preset, ctx.derive, (s, a) => commit(s, a, ctx));
    case 'replace-doc':
      return replaceDocument(state, action.doc, action.label, (s, a) => commit(s, a, ctx));
    case 'name-text':
      return nameText(state, action.text, ctx);
    case 'name-highlight':
      return nameHighlight(state, action.dir, ctx);
    case 'name-dismiss':
      return nameDismiss(state);
    case 'name-clear':
      return nameClear(state);
    case 'name-enter':
      return nameEnter(state, ctx, (s, a) => commit(s, a, ctx));
    case 'insert-text':
      return insertText(state, action.text, ctx, (s, a) => commit(s, a, ctx));
    case 'undo':
    case 'redo':
      return stepHistory(state, action.type, ctx);
    case 'focus-request':
      return { ...state, focusRequest: state.focusRequest + 1 };
    case 'notice-show':
      return showNotice(state, action.kind, action.text);
    case 'notice-expired':
      return state.notice?.id === action.id ? { ...state, notice: null } : state;
    case 'notice-clear':
      return state.notice === null ? state : { ...state, notice: null };
    case 'load':
      // R57: load is putState(newState(doc)).
      return putTabState(state, newTabState(action.doc, state.history.clock), ctx.derive);
    case 'put-state':
      return putTabState(state, action.state, ctx.derive);
    case 'mark-saved':
      return state.saved === docOf(state) ? state : { ...state, saved: docOf(state) };
    case 'set-selection':
      return { ...state, selection: action.selection };
    case 'set-hover': {
      // The pointer left (or a test set it): a ghost that followed it goes too.
      const ghost = state.preview?.hovering === true;
      if (sameHit(state.hover, action.hover) && !ghost) return state;
      return { ...state, hover: action.hover, preview: ghost ? null : state.preview };
    }
    case 'set-gesture':
      return { ...state, gesture: action.gesture };
    case 'set-preview':
      return { ...state, preview: action.preview };
    case 'set-editing':
      return { ...state, editing: action.editing };
    case 'open-label':
      return openLabelEditor(state, action.atom);
    case 'open-text':
      return openTextEditor(state, action.target);
    case 'edit-script':
      return editScript(state, action.script);
    case 'edit-style':
      return editStyle(state, action.flag);
    case 'edit-insert':
      return editInsert(state, action.text);
    case 'edit-set':
      return setEditModel(state, action.edit);
    case 'edit-commit':
      return commitEditing(state, (s, a) => commit(s, a, ctx));
    case 'edit-cancel':
      return cancelEditing(state);
    case 'set-space':
      return state.spaceHeld === action.held ? state : { ...state, spaceHeld: action.held };
    case 'canvas-resized':
    case 'zoom-step':
    case 'zoom-wheel':
    case 'zoom-reset':
    case 'zoom-fit':
    case 'pan-by':
      return viewportAction(state, action, ctx);
  }
}

/** True when the document differs from the last loaded or saved one (ignores `meta.modified`). */
export function isDirty(state: EditorState): boolean {
  return differs(docOf(state), state.saved);
}
