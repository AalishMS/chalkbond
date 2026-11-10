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
import { stepZoom } from '../model/viewport';
import { initialState, type EditorState } from './editor-state';
import { canDelete } from './commands';
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
  /** clipboard-export hook: called with what Copy takes (used from E18). */
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
  /** Which Ctrl shortcuts the editor handles itself. */
  readonly shortcuts: 'all' | 'canvas-only';
  /** Perception and scene of the committed and the preview document, cached. */
  readonly derive: Derive;
  /** The editor's own state, for the view and for tools. */
  readonly store: Store;
  /** The name index (N5), built once per controller from the dictionary. */
  readonly names: NameIndex;
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
      case 'select-all':
        return s.editing === null;
      default:
        if (typeof cmd === 'object' && cmd.type === 'insert-text') return true;
        // Later tasks (clipboard, selection actions, name field) turn these on.
        return false;
    }
  };

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
        case 'select-all':
          store.dispatch({ type: 'select-all' });
          break;
        default:
          if (typeof cmd === 'object' && cmd.type === 'insert-text') {
            store.dispatch({ type: 'insert-text', text: cmd.text });
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
    shortcuts: options.shortcuts ?? 'all',
    derive,
    store,
    names: ctx.names,
  };
}
