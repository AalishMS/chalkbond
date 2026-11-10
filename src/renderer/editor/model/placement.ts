// P7: where a structure inserted from the name field goes (SPEC-editor.md "Placement rules").
import {
  emptyDoc,
  fragments,
  insert,
  type Doc,
  type ObjectId,
  type Point,
  type SubDoc,
} from '@core/doc-model';
import { render, type ItemKey, type Scene } from '@core/svg-render';
import { rectCenter, rectUnion, type Rect } from './geometry';

/** Clear space between the drawing and an inserted structure, BLU. */
export const INSERT_GAP = 1;

const scaled = (r: Rect, k: number): Rect => ({ x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k });

/**
 * The ink box of a sub-document with its origin at (0, 0), in BLU, labels included; null when
 * nothing would be drawn. Rendered in `style` so label sizes match the document it goes into.
 */
export function subInk(sub: SubDoc, style: Doc['style'], now: string): Rect | null {
  const host = { ...emptyDoc(now), style };
  const scene = render(insert(host, sub, { x: 0, y: 0 })[0]);
  return scene.bounds === null ? null : scaled(scene.bounds, 1 / scene.style.bondLength);
}

/** Ink boxes (BLU) of each fragment and each object of `doc`. */
function itemBoxes(doc: Doc, scene: Scene): Rect[] {
  const k = 1 / scene.style.bondLength;
  const boxes: Rect[] = [];
  for (const atoms of fragments(doc)) {
    let box: Rect | null = null;
    const add = (r: Rect): void => {
      box = box === null ? r : rectUnion(box, r);
    };
    for (const id of atoms) {
      const atom = doc.atoms[id];
      if (atom) add({ x: atom.x, y: atom.y, w: 0, h: 0 });
      const ink = scene.extents[`atom:${id}`];
      if (ink) add(scaled(ink, k));
    }
    for (const bond of Object.values(doc.bonds)) {
      if (!atoms.includes(bond.a1)) continue;
      const ink = scene.extents[`bond:${bond.id}`];
      if (ink) add(scaled(ink, k));
    }
    if (box !== null) boxes.push(box);
  }
  for (const id of Object.keys(doc.objects) as ObjectId[]) {
    const ink = scene.extents[`obj:${id}` as ItemKey];
    if (ink) boxes.push(scaled(ink, k));
  }
  return boxes;
}

/**
 * The point (BLU) at which to `insert` `sub` so that P7 holds. Empty document: the ink box is
 * centred on `canvasCentre`. Otherwise its left edge is 1.0 BLU right of the document's ink
 * box, vertically centred on the rightmost fragment or object.
 */
export function insertPosition(doc: Doc, scene: Scene, sub: SubDoc, canvasCentre: Point): Point {
  const ink = subInk(sub, doc.style, doc.meta.created) ?? { x: 0, y: 0, w: 0, h: 0 };
  const inkCentre = rectCenter(ink);
  const boxes = itemBoxes(doc, scene);
  if (scene.bounds === null || boxes.length === 0) {
    return { x: canvasCentre.x - inkCentre.x, y: canvasCentre.y - inkCentre.y };
  }
  const bounds = scaled(scene.bounds, 1 / scene.style.bondLength);
  let rightmost = boxes[0] as Rect;
  for (const box of boxes) if (box.x + box.w > rightmost.x + rightmost.w) rightmost = box;
  return {
    x: bounds.x + bounds.w + INSERT_GAP - ink.x,
    y: rectCenter(rightmost).y - inkCentre.y,
  };
}
