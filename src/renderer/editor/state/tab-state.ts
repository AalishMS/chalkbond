// The per-tab state seam (SPEC-editor.md R57, app-shell R43): what one tab owns of the editor, so
// one controller can serve every tab. Pure: values in, values out.
import {
  bounds,
  canRedo,
  canUndo,
  createHistory,
  current,
  type Doc,
  type History,
  type Selection,
} from '@core/doc-model';
import { resolveStyle } from '@core/svg-render';
import type { Point } from '../model/geometry';
import type { Derive } from '../model/derive';
import {
  clampZoom,
  defaultZoom,
  initialViewport,
  PX_PER_PT,
  screenToBlu,
  type Viewport,
} from '../model/viewport';
import { differs } from './dirty';
import { EMPTY_SELECTION, type EditorState } from './editor-state';

/** A tab's view: the zoom (1 = 100 %) and the drawing point (BLU) at the centre of the canvas. */
export interface TabView {
  readonly zoom: number;
  readonly centre: Point;
}

declare const OPAQUE: unique symbol;

/**
 * One tab's part of the editor: undo history, saved baseline, selection and view. Opaque to the
 * host, which reads it only through the `tabState*` functions.
 */
export interface EditorTabState {
  readonly [OPAQUE]: 'EditorTabState';
}

/** What an `EditorTabState` holds (for the editor's own modules, never the host). */
export interface TabStateParts {
  readonly history: History;
  /** The last loaded or saved drawing, for dirty. */
  readonly saved: Doc;
  readonly selection: Selection;
  readonly view: TabView;
  /**
   * The view is V2's default, still to be fitted to a measured canvas (a new state, or one taken
   * before the canvas had a size). `view` is then only an estimate for the host's index.
   */
  readonly viewPending: boolean;
}

export const sealTabState = (parts: TabStateParts): EditorTabState =>
  parts as unknown as EditorTabState;

export const tabStateParts = (s: EditorTabState): TabStateParts => s as unknown as TabStateParts;

/** The drawing the tab shows. */
export const tabStateDoc = (s: EditorTabState): Doc => current(tabStateParts(s).history);

/** The drawing differs from the saved baseline (ignoring `meta.modified`), as `isDirty`. */
export function tabStateDirty(s: EditorTabState): boolean {
  const parts = tabStateParts(s);
  return differs(current(parts.history), parts.saved);
}

export const tabStateCanUndo = (s: EditorTabState): boolean => canUndo(tabStateParts(s).history);

export const tabStateCanRedo = (s: EditorTabState): boolean => canRedo(tabStateParts(s).history);

/** The zoom and the BLU point at the canvas centre (app-shell SS4's index). */
export function tabStateView(s: EditorTabState): {
  zoom: number;
  centre: { x: number; y: number };
} {
  const { zoom, centre } = tabStateParts(s).view;
  return { zoom, centre: { x: centre.x, y: centre.y } };
}

/**
 * The saved baseline becomes `doc` (app-shell AS3: an inactive tab's auto-save finished), so the
 * state is clean exactly if its drawing is still `doc`.
 */
export function tabStateMarkSaved(s: EditorTabState, doc: Doc): EditorTabState {
  const parts = tabStateParts(s);
  return parts.saved === doc ? s : sealTabState({ ...parts, saved: doc });
}

/** V2's estimate without a canvas: the default zoom and the middle of the drawing (or the origin). */
function defaultView(doc: Doc): TabView {
  const box = bounds(doc);
  return {
    zoom: defaultZoom(resolveStyle(doc.style).bondLength),
    centre: box === null ? { x: 0, y: 0 } : { x: box.x + box.w / 2, y: box.y + box.h / 2 },
  };
}

/** What `load(doc)` makes: a new history, saved = doc, no selection, V2's view (fitted when put). */
export function newTabState(doc: Doc, clock: () => string): EditorTabState {
  return sealTabState({
    history: createHistory(doc, { clock }),
    saved: doc,
    selection: EMPTY_SELECTION,
    view: defaultView(doc),
    viewPending: true,
  });
}

const measured = (v: Viewport): boolean => v.size.w > 0 && v.size.h > 0;

/** The committed part of the editor state, read only (a gesture, preview or open editor is not in it). */
export function tabStateOf(state: EditorState): EditorTabState {
  const doc = current(state.history);
  const v = state.viewport;
  const view: TabView = state.viewPending
    ? defaultView(doc)
    : {
        zoom: v.zoom,
        centre: screenToBlu(
          v,
          { x: v.size.w / 2, y: v.size.h / 2 },
          resolveStyle(doc.style).ptPerBlu,
        ),
      };
  return sealTabState({
    history: state.history,
    saved: state.saved,
    selection: state.selection,
    view,
    viewPending: state.viewPending,
  });
}

/**
 * Puts a tab's part in: history, saved, selection and view replace the editor's. The canvas size
 * stays; the zoom is the state's and its centre goes to the middle of the canvas (a pending view
 * gets V2 on the canvas, as `load` did). Hover, gesture, preview, editing and notice are cleared;
 * tool, variants, name field and clipboard stay.
 */
export function putTabState(state: EditorState, tab: EditorTabState, derive: Derive): EditorState {
  const parts = tabStateParts(tab);
  const doc = current(parts.history);
  const size = state.viewport.size;
  let viewport: Viewport;
  let viewPending: boolean;
  if (parts.viewPending) {
    const { scene } = derive.committed(doc);
    viewport = initialViewport(scene.bounds, size, scene.style.bondLength);
    viewPending = !measured(state.viewport);
  } else {
    const zoom = clampZoom(parts.view.zoom);
    const scale = zoom * PX_PER_PT * resolveStyle(doc.style).ptPerBlu;
    viewport = {
      zoom,
      pan: {
        x: size.w / 2 - parts.view.centre.x * scale,
        y: size.h / 2 - parts.view.centre.y * scale,
      },
      size,
    };
    viewPending = false;
  }
  return {
    ...state,
    history: parts.history,
    saved: parts.saved,
    selection: parts.selection,
    hover: null,
    gesture: null,
    preview: null,
    editing: null,
    notice: null,
    viewport,
    viewPending,
  };
}
