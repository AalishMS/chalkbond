import { current } from '@core/doc-model';
import type { Derive } from '../model/derive';
import type { Point } from '../model/geometry';
import { hoverHit, type Hit } from '../model/hit-test';
import type { EditorState } from './editor-state';

/**
 * What a pointer at canvas point `screen` hovers (HV1): what the active tool sees, nothing
 * while Space is held (the pointer pans) or an editor is open.
 */
export function hoverAt(state: EditorState, derive: Derive, screen: Point): Hit | null {
  if (state.spaceHeld || state.editing !== null) return null;
  const doc = current(state.history);
  return hoverHit(state.tool, doc, derive.committed(doc).scene, state.viewport, screen);
}
