import { emptyDoc, type Doc } from '@core/doc-model';
import { createStore, type Store } from './store';

export interface EditorOptions {
  /** Document to start with; default an empty document stamped by `clock`. */
  doc?: Doc;
  /** ISO timestamps for new documents and history. Injected: state code reads no system clock. */
  clock: () => string;
}

/** Host API of the editor (SPEC-editor.md "Seam to the host"); later tasks add the rest. */
export interface EditorController {
  getDoc(): Doc;
  /** Tool and option selection; the view subscribes to it. */
  readonly store: Store;
}

export function createEditorController(options: EditorOptions): EditorController {
  const doc = options.doc ?? emptyDoc(options.clock());
  const store = createStore();
  return {
    getDoc: () => doc,
    store,
  };
}
