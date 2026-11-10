import type { EditorState } from './editor-state';

/** A notice for the status bar's hint slot (X1, R20); the id rises so an expiry cannot hit a later one. */
export function showNotice(state: EditorState, kind: 'info' | 'error', text: string): EditorState {
  const id = state.noticeSeq + 1;
  return { ...state, notice: { id, kind, text }, noticeSeq: id };
}
