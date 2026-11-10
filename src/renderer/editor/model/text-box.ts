// Where the label editor's box stands (SPEC-editor.md rule L1): centred on the atom, in the
// rendered label's font size at the current zoom.
import type { AtomId, Doc } from '@core/doc-model';
import { textObjectOf, type TextTarget } from './text-ops';
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

export interface TextPlace {
  /** The text's `at`, canvas px: where its alignment edge (or centre) and first line stand. */
  readonly at: Point;
  readonly align: 'left' | 'center' | 'right';
  /** Font size, px. */
  readonly fontPx: number;
}

/** T2: where the text editor's box stands: over the text as it will be drawn, at the same size. */
export function textPlace(
  doc: Doc,
  scene: Scene,
  viewport: Viewport,
  target: TextTarget,
): TextPlace | null {
  const stored = textObjectOf(doc, target);
  const source =
    target.kind === 'new' ? { at: target.fresh.at, align: target.fresh.align } : stored;
  if (source === null) return null;
  return {
    at: bluToScreen(viewport, source.at, scene.style.bondLength),
    align: source.align,
    fontPx: scene.style.fontSize * viewport.zoom * PX_PER_PT,
  };
}
