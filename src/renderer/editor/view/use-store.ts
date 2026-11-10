import { useSyncExternalStore } from 'react';
import type { EditorState } from '../state/editor-state';
import type { Store } from '../state/store';

/** Subscribes a component to the editor store; the server snapshot equals the client one. */
export function useEditorState(store: Store): EditorState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
