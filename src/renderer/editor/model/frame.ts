// The selection's ink box and its dashed frame (SPEC-editor.md "Canvas appearance", Selection).
// Shared by the overlay, which draws the frame, and the handles, which hang off it.
import type { Doc, Selection } from '@core/doc-model';
import type { ItemKey, Scene } from '@core/svg-render';
import { growRect, rectUnion, type Point, type Rect } from './geometry';
import { expandSelection } from './selection';
import { ptToScreen, type Viewport } from './viewport';

/** Selection frame: px the ink box is grown by. */
export const FRAME_GROW = 8;

/** A rectangle (pt) in screen px. */
export function screenRect(v: Viewport, ink: Rect): Rect {
  const a = ptToScreen(v, { x: ink.x, y: ink.y });
  const b = ptToScreen(v, { x: ink.x + ink.w, y: ink.y + ink.h });
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

/**
 * The ink box (pt) of a selection: the union of its items' `extents` and its vertex points,
 * including the atoms of selected bonds; null when it has none.
 */
export function selectionInk(doc: Doc, scene: Scene, sel: Selection): Rect | null {
  const ppb = scene.style.ptPerBlu;
  const { atoms, objects } = expandSelection(doc, sel);
  let ink: Rect | null = null;
  const add = (r: Rect | undefined): void => {
    if (r !== undefined) ink = ink === null ? r : rectUnion(ink, r);
  };
  for (const id of atoms) {
    const atom = doc.atoms[id];
    if (atom) add({ x: atom.x * ppb, y: atom.y * ppb, w: 0, h: 0 });
    add(scene.extents[`atom:${id}`]);
  }
  for (const id of sel.bonds) add(scene.extents[`bond:${id}`]);
  for (const id of objects) add(scene.extents[`obj:${id}` as ItemKey]);
  return ink;
}

/** A crisp 1 px line sits on a half pixel. */
const crisp = (x: number): number => Math.round(x - 0.5) + 0.5;

/**
 * The dashed frame of an ink box (pt) in screen px: grown 8 px, edges on half pixels. `offset`
 * (screen px) shifts it: the drag fast path moves the selection without re-rendering.
 */
export function frameRect(v: Viewport, ink: Rect, offset: Point = { x: 0, y: 0 }): Rect {
  const r = growRect(screenRect(v, ink), FRAME_GROW);
  const x0 = crisp(r.x + offset.x);
  const y0 = crisp(r.y + offset.y);
  const x1 = crisp(r.x + r.w + offset.x);
  const y1 = crisp(r.y + r.h + offset.y);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The centre of the ink box of `sel` (pt), or null when it has none. */
export function selectionCentre(doc: Doc, scene: Scene, sel: Selection): Point | null {
  const ink = selectionInk(doc, scene, sel);
  return ink === null ? null : { x: ink.x + ink.w / 2, y: ink.y + ink.h / 2 };
}
