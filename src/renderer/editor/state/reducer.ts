import { ChemError, type NameIndex } from '@core/chem-core';
import {
  canRedo,
  canUndo,
  createHistory,
  current,
  redo,
  transact,
  undo,
  type Doc,
  type Selection,
} from '@core/doc-model';
import type { Derive } from '../model/derive';
import type { Point, Rect, Size } from '../model/geometry';
import {
  clampPan,
  defaultZoom,
  fitViewport,
  initialViewport,
  stepViewport,
  wheelZoom,
  zoomAbout,
  type Viewport,
} from '../model/viewport';
import { insertedSelection } from '../model/selection';
import { OPTIONS, isVariantTool } from './catalog';
import { differs } from './dirty';
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
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'notice-show'; kind: 'info' | 'error'; text: string }
  | { type: 'notice-expired'; id: number }
  | { type: 'notice-clear' }
  | { type: 'load'; doc: Doc }
  | { type: 'mark-saved' }
  | { type: 'set-selection'; selection: Selection }
  | { type: 'set-hover'; hover: Hit | null }
  | { type: 'set-gesture'; gesture: GestureState | null }
  | { type: 'set-preview'; preview: Preview | null }
  | { type: 'set-editing'; editing: Editing | null }
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

function showNotice(state: EditorState, kind: 'info' | 'error', text: string): EditorState {
  const id = state.noticeSeq + 1;
  return { ...state, notice: { id, kind, text }, noticeSeq: id };
}

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

function stepHistory(state: EditorState, dir: 'undo' | 'redo'): EditorState {
  if (state.editing !== null) return state;
  const can = dir === 'undo' ? canUndo(state.history) : canRedo(state.history);
  if (!can) return state;
  const history = dir === 'undo' ? undo(state.history) : redo(state.history);
  return { ...settled(state), history, notice: null };
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
      const centre = { x: v.size.w / 2, y: v.size.h / 2 };
      return withViewport(state, zoomAbout(v, defaultZoom(bond), centre));
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
      // First measurement: apply V2 to the real size.
      if (v.size.w === 0 || v.size.h === 0) {
        return { ...state, viewport: initialViewport(bounds, size, bond) };
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
      return stepHistory(state, action.type);
    case 'notice-show':
      return showNotice(state, action.kind, action.text);
    case 'notice-expired':
      return state.notice?.id === action.id ? { ...state, notice: null } : state;
    case 'notice-clear':
      return state.notice === null ? state : { ...state, notice: null };
    case 'load': {
      const { bounds, bond } = sceneOf(action.doc, ctx);
      return {
        ...settled(state),
        history: createHistory(action.doc, { clock: state.history.clock }),
        saved: action.doc,
        editing: null,
        notice: null,
        viewport: initialViewport(bounds, state.viewport.size, bond),
      };
    }
    case 'mark-saved':
      return state.saved === docOf(state) ? state : { ...state, saved: docOf(state) };
    case 'set-selection':
      return { ...state, selection: action.selection };
    case 'set-hover':
      return { ...state, hover: action.hover };
    case 'set-gesture':
      return { ...state, gesture: action.gesture };
    case 'set-preview':
      return { ...state, preview: action.preview };
    case 'set-editing':
      return { ...state, editing: action.editing };
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
