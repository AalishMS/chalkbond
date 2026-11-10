import { current } from '@core/doc-model';
import type { Derive } from '../model/derive';
import type { Point } from '../model/geometry';
import { handleHit } from '../model/handles';
import { hoverHit, type Hit } from '../model/hit-test';
import type { EditorState } from './editor-state';

/**
 * What a pointer at canvas point `screen` hovers (HV1): a handle of the selection (H2), else what
 * the active tool sees, nothing
 * while Space is held (the pointer pans) or an editor is open.
 */
export function hoverAt(state: EditorState, derive: Derive, screen: Point): Hit | null {
  if (state.spaceHeld || state.editing !== null) return null;
  const doc = current(state.history);
  const { scene } = derive.committed(doc);
  const handle =
    state.tool === 'select' ? handleHit(doc, scene, state.viewport, state.selection, screen) : null;
  return handle ?? hoverHit(state.tool, doc, scene, state.viewport, screen);
}
