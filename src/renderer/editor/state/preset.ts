// PR1 / V6: the Slides | Handout switch (SPEC-editor.md "Preset").
import { current, setStyle, type StylePreset } from '@core/doc-model';
import type { Derive } from '../model/derive';
import { switchPreset } from '../model/viewport';
import type { EditorState } from './editor-state';
import type { EditorAction } from './reducer';

type Commit = Extract<EditorAction, { type: 'commit' }>;

/** The label of the undo step: the preset's teacher-facing name (Decision 4). */
export const PRESET_LABELS: Record<StylePreset, string> = { slides: 'Slides', journal: 'Handout' };

/**
 * PR1: one "Switch to Handout style" / "Switch to Slides style" commit through `setStyle`, then V6:
 * the zoom is scaled by old / new bond length about the canvas centre so the drawing keeps its
 * size on screen. The viewport is not part of history, so undo flips only the style. The preset the
 * document already has, an open editor or a running gesture: nothing happens.
 */
export function setPreset(
  state: EditorState,
  preset: StylePreset,
  derive: Derive,
  commit: (state: EditorState, action: Commit) => EditorState,
): EditorState {
  if (state.gesture !== null || state.editing !== null) return state;
  const doc = current(state.history);
  if (doc.style.preset === preset) return state;
  const old = derive.committed(doc).scene.style.bondLength;
  const done = commit(state, {
    type: 'commit',
    label: `Switch to ${PRESET_LABELS[preset]} style`,
    recipe: (d) => setStyle(d, { preset }),
  });
  if (done.history === state.history) return done;
  const next = derive.committed(current(done.history)).scene.style.bondLength;
  return { ...done, viewport: switchPreset(done.viewport, old, next) };
}
