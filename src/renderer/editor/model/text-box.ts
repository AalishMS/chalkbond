// Where the label editor's box stands (SPEC-editor.md rule L1): centred on the atom, in the
// rendered label's font size at the current zoom.
import type { AtomId, Doc } from '@core/doc-model';
import type { Scene } from '@core/svg-render';
import type { Point } from './geometry';
import { bluToScreen, PX_PER_PT, type Viewport } from './viewport';

export interface LabelBox {
  /** Centre, canvas px. */
  readonly at: Point;
  /** Font size, px. */
  readonly fontPx: number;
}

export function labelBox(doc: Doc, scene: Scene, viewport: Viewport, id: AtomId): LabelBox | null {
  const atom = doc.atoms[id];
  if (!atom) return null;
  return {
    at: bluToScreen(viewport, atom, scene.style.bondLength),
    fontPx: scene.style.fontSize * viewport.zoom * PX_PER_PT,
  };
}
