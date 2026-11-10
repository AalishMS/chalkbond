import { createNameIndex, type NameIndex } from '@core/chem-core';
import {
  canRedo,
  canUndo,
  current,
  emptyDoc,
  redoLabel,
  undoLabel,
  type AtomId,
  type BondId,
  type Doc,
  type ObjectId,
  type Selection,
  type StylePreset,
  type SubDoc,
} from '@core/doc-model';
import compounds from '../../../../resources/compounds/compounds.json';
import { createDerive, type Derive } from '../model/derive';
import type { Point } from '../model/geometry';
import { screenToBlu, stepZoom } from '../model/viewport';
import { initialState, type EditorState } from './editor-state';
import { handleHit } from '../model/handles';
import { HIT_ALL, hitTest } from '../model/hit-test';
import { canCopy, canDelete, canPaste } from './commands';
import { isDirty, type ReducerContext } from './reducer';
import { createStore, type Store } from './store';

/** Commands the host sends with `run` (SPEC-editor.md "Seam to the host"). */
export type EditorCommand =
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'select-all'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-fit'
  | 'zoom-reset'
  | 'clean-up'
  | 'toggle-kekulé'
  | 'tidy-reaction'
  | 'focus-name-field'
  | { type: 'set-preset'; preset: StylePreset }
  | { type: 'paste-sub'; sub: SubDoc }
  | { type: 'insert-text'; text: string };

/** What a context-menu event points at. */
export type HostHit =
  { kind: 'atom'; id: AtomId } | { kind: 'bond'; id: BondId } | { kind: 'object'; id: ObjectId };

export type EditorEvent =
  | { type: 'doc' | 'selection' | 'dirty' | 'history' | 'notice' }
  | { type: 'context-menu'; target: HostHit | null; screen: Point };

export interface EditorOptions {
  /** Document to start with; default an empty document stamped by `clock`. */
  doc?: Doc;
  /** ISO timestamps for new documents and history. Injected: state code reads no system clock. */
  clock: () => string;
  /** Name dictionary; default `createNameIndex` of `compounds.json`, built once. */
  names?: NameIndex;
  /** `canvas-only` when the host's menu owns the Ctrl shortcuts (K1). */
  shortcuts?: 'all' | 'canvas-only';
  /** clipboard-export hook: called with what Copy or Cut takes (CB1). */
  onCopy?: (sub: SubDoc, doc: Doc, selection: Selection) => void;
  /** Where unexpected errors are logged (X1); default `console.error`. */
  logError?: (error: unknown) => void;
}

/** Host API of the editor (SPEC-editor.md "Seam to the host"). */
export interface EditorController {
  getDoc(): Doc;
  getSelection(): Selection;
  /** New history, cleared selection, marks saved, V2 view. */
  load(doc: Doc): void;
  markSaved(): void;
  /** The document differs from the last loaded or saved one, ignoring `meta.modified`. */
  isDirty(): boolean;
  run(cmd: EditorCommand): void;
  canRun(cmd: EditorCommand): boolean;
  /** For menu text such as "Undo Add bond". */
  undoLabel(): string | undefined;
  redoLabel(): string | undefined;
  subscribe(listener: (e: EditorEvent) => void): () => void;
  /**
   * The view reports where the pointer is over the canvas (canvas px), or null when it has left:
   * Paste lands there (CB1).
   */
  setPointer(screen: Point | null): void;
  /**
   * Hovers again what rests under the last reported pointer position (HV1, B6): a key press that
   * changed the tool or the document leaves the pointer where it was, and hover keys must not wait
   * for it to move. Nothing happens with the pointer off the canvas or while a gesture runs.
   */
  refreshHover(): void;
  /**
   * The view reports a `contextmenu` on the canvas at `screen` (canvas px). A gesture in progress
   * is cancelled and nothing else happens; otherwise a `context-menu` event goes to the
   * subscribers with the item there (CM1). The selection never changes.
   */
  contextMenuAt(screen: Point): void;
  /** Which Ctrl shortcuts the editor handles itself. */
  readonly shortcuts: 'all' | 'canvas-only';
  /** Perception and scene of the committed and the preview document, cached. */
  readonly derive: Derive;
  /** The editor's own state, for the view and for tools. */
  readonly store: Store;
  /** The name index (N5), built once per controller from the dictionary. */
  readonly names: NameIndex;
}

/** The H1/H2 item under `screen` for the host: atoms, bonds and objects; handles and slots are null. */
function hostHitAt(state: EditorState, derive: Derive, screen: Point): HostHit | null {
  const doc = current(state.history);
  const { scene } = derive.committed(doc);
  if (handleHit(doc, scene, state.viewport, state.selection, screen) !== null) return null;
  const hit = hitTest(doc, scene, state.viewport, screen, HIT_ALL);
  switch (hit?.kind) {
    case 'atom':
    case 'bond':
    case 'object':
      return { kind: hit.kind, id: hit.id } as HostHit;
    default:
      return null;
  }
}

let defaultNames: NameIndex | undefined;

/** The dictionary index, built on first use and then shared. */
function builtInNames(): NameIndex {
  defaultNames ??= createNameIndex(compounds);
  return defaultNames;
}

interface Snapshot {
  doc: Doc;
  selection: Selection;
  dirty: boolean;
  history: string;
  notice: EditorState['notice'];
}

const snapshot = (s: EditorState, dirty: boolean): Snapshot => ({
  doc: current(s.history),
  selection: s.selection,
  dirty,
  history: [
    canUndo(s.history),
    canRedo(s.history),
    undoLabel(s.history),
    redoLabel(s.history),
  ].join('|'),
  notice: s.notice,
});

export function createEditorController(options: EditorOptions): EditorController {
  const doc = options.doc ?? emptyDoc(options.clock());
  const derive = createDerive();
  const ctx: ReducerContext = {
    derive,
    names: options.names ?? builtInNames(),
    logError: options.logError ?? ((error) => console.error(error)),
  };
  const store = createStore(initialState(doc, options.clock), ctx);
  const listeners = new Set<(e: EditorEvent) => void>();
  const emit = (e: EditorEvent): void => {
    for (const listener of [...listeners]) listener(e);
  };

  // One event per kind of change, however many actions caused it.
  let last = store.getState();
  let before = snapshot(last, isDirty(last));
  store.subscribe(() => {
    const next = store.getState();
    const unchanged = next.history === last.history && next.saved === last.saved;
    const after = snapshot(next, unchanged ? before.dirty : isDirty(next));
    last = next;
    const prev = before;
    before = after;
    if (after.doc !== prev.doc) emit({ type: 'doc' });
    if (after.selection !== prev.selection) emit({ type: 'selection' });
    if (after.dirty !== prev.dirty) emit({ type: 'dirty' });
    if (after.history !== prev.history) emit({ type: 'history' });
    if (after.notice !== prev.notice) emit({ type: 'notice' });
  });

  const canRun = (cmd: EditorCommand): boolean => {
    const s = store.getState();
    switch (cmd) {
      case 'undo':
        return canUndo(s.history) && s.editing === null;
      case 'redo':
        return canRedo(s.history) && s.editing === null;
      case 'zoom-in':
        return stepZoom(s.viewport.zoom, 1) !== s.viewport.zoom;
      case 'zoom-out':
        return stepZoom(s.viewport.zoom, -1) !== s.viewport.zoom;
      case 'zoom-fit':
      case 'zoom-reset':
        return true;
      case 'delete':
        return canDelete(s);
      case 'cut':
      case 'copy':
      case 'duplicate':
        return canCopy(s);
      case 'paste':
        return canPaste(s);
      case 'select-all':
        return s.editing === null;
      default:
        if (typeof cmd === 'object' && cmd.type === 'insert-text') return true;
        if (typeof cmd === 'object' && cmd.type === 'paste-sub') {
          return s.gesture === null && s.editing === null;
        }
        // Later tasks (selection actions) turn the rest on.
        return false;
    }
  };

  /** Where the pointer is over the canvas, canvas px; null when it is not (CB1 paste position). */
  let pointerAt: Point | null = null;

  return {
    getDoc: () => current(store.getState().history),
    getSelection: () => store.getState().selection,
    load: (d) => store.dispatch({ type: 'load', doc: d }),
    markSaved: () => store.dispatch({ type: 'mark-saved' }),
    isDirty: () => isDirty(store.getState()),
    run(cmd) {
      if (!canRun(cmd)) return;
      switch (cmd) {
        case 'undo':
        case 'redo':
          store.dispatch({ type: cmd });
          break;
        case 'zoom-in':
          store.dispatch({ type: 'zoom-step', dir: 1 });
          break;
        case 'zoom-out':
          store.dispatch({ type: 'zoom-step', dir: -1 });
          break;
        case 'zoom-fit':
        case 'zoom-reset':
          store.dispatch({ type: cmd });
          break;
        case 'delete':
          store.dispatch({ type: 'delete' });
          break;
        case 'copy':
        case 'cut': {
          // The host hook sees what was taken, from the document as it was before a cut.
          const before = store.getState();
          store.dispatch({ type: cmd });
          const taken = store.getState().clipboard;
          if (taken !== null && taken !== before.clipboard) {
            options.onCopy?.(taken, current(before.history), before.selection);
          }
          break;
        }
        case 'paste':
          store.dispatch({ type: 'paste', at: null });
          break;
        case 'duplicate':
          store.dispatch({ type: 'duplicate' });
          break;
        case 'select-all':
          store.dispatch({ type: 'select-all' });
          break;
        default:
          if (typeof cmd === 'object' && cmd.type === 'insert-text') {
            store.dispatch({ type: 'insert-text', text: cmd.text });
          } else if (typeof cmd === 'object' && cmd.type === 'paste-sub') {
            store.dispatch({ type: 'paste', at: pointerAt, sub: cmd.sub });
          }
          break;
      }
    },
    canRun,
    undoLabel: () => undoLabel(store.getState().history),
    redoLabel: () => redoLabel(store.getState().history),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setPointer(screen) {
      pointerAt = screen;
    },
    refreshHover() {
      const state = store.getState();
      if (pointerAt === null || state.gesture !== null) return;
      const bondLength = derive.committed(current(state.history)).scene.style.bondLength;
      store.dispatch({
        type: 'hover-move',
        event: {
          type: 'move',
          screen: pointerAt,
          p: screenToBlu(state.viewport, pointerAt, bondLength),
          button: 0,
          mods: { shift: false, alt: false, ctrl: false },
        },
      });
    },
    contextMenuAt(screen) {
      const state = store.getState();
      if (state.gesture !== null) {
        // CM1: a gesture is cancelled and that is all.
        store.dispatch({ type: 'escape' });
        return;
      }
      emit({ type: 'context-menu', target: hostHitAt(state, derive, screen), screen });
    },
    shortcuts: options.shortcuts ?? 'all',
    derive,
    store,
    names: ctx.names,
  };
}
