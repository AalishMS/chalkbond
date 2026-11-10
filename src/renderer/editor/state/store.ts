import type { EditorState } from './editor-state';
import { reduce, type EditorAction, type ReducerContext } from './reducer';

export interface Store {
  getState(): EditorState;
  dispatch(action: EditorAction): void;
  /** Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/** Hand-written store (SPEC.md Decisions): state, dispatch, subscribe. */
export function createStore(initial: EditorState, ctx: ReducerContext): Store {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    dispatch(action) {
      const next = reduce(state, action, ctx);
      if (next === state) return;
      state = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
