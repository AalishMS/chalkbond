// R51 / C7 / R53 U13: the Show structural | Show skeletal switch.
import { current, setStyle, type Doc } from '@core/doc-model';
import type { Derive } from '../model/derive';
import { keepInkCentre, reveal, type Viewport } from '../model/viewport';
import type { EditorState } from './editor-state';
import type { EditorAction } from './reducer';

type Commit = Extract<EditorAction, { type: 'commit' }>;

/** C7: the document is structural, or has something drawn (an empty skeletal one has nothing to show). */
export function canToggleFormula(doc: Doc): boolean {
  return (
    doc.style.formula === 'structural' ||
    Object.keys(doc.atoms).length > 0 ||
    Object.keys(doc.objects).length > 0
  );
}

/**
 * U13: the view after the formula changed from the document `was` to `now` (a switch, or its
 * undo or redo): the zoom stays, the drawing's centre stays where it was on screen, then V5
 * reveals it (pan if it fits, else zoom out to `min(fit, z0)`). Not R38.
 */
export function followFormula(viewport: Viewport, was: Doc, now: Doc, derive: Derive): Viewport {
  const before = derive.committed(was).scene;
  const after = derive.committed(now).scene;
  const moved = keepInkCentre(viewport, before.bounds, after.bounds);
  const { w, h } = moved.size;
  if (after.bounds === null || w === 0 || h === 0) return moved;
  return reveal(moved, after.bounds, after.style.bondLength);
}

/**
 * One "Show structural formula" / "Show skeletal formula" commit on the whole document (selection
 * and tool kept), then U13. An empty skeletal document, an open editor or a running gesture: nothing.
 */
export function toggleFormula(
  state: EditorState,
  derive: Derive,
  commit: (state: EditorState, action: Commit) => EditorState,
): EditorState {
  if (state.gesture !== null || state.editing !== null) return state;
  const doc = current(state.history);
  if (!canToggleFormula(doc)) return state;
  const structural = doc.style.formula === 'structural';
  const formula = structural ? 'skeletal' : 'structural';
  const done = commit(state, {
    type: 'commit',
    label: structural ? 'Show skeletal formula' : 'Show structural formula',
    recipe: (d) => setStyle(d, { formula }),
  });
  if (done.history === state.history) return done;
  return {
    ...done,
    viewport: followFormula(done.viewport, doc, current(done.history), derive),
  };
}
