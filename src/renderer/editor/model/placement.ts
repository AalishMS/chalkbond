// P7: where a structure inserted from the name field goes (SPEC-editor.md "Placement rules").
import {
  emptyDoc,
  fragments,
  insert,
  neighbors,
  type AtomId,
  type Doc,
  type ObjectId,
  type Point,
  type SubDoc,
} from '@core/doc-model';
import { render, type ItemKey, type Scene } from '@core/svg-render';
import { distance, normalize, rectCenter, rectUnion, rotate, type Rect } from './geometry';

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

/** Two numbers closer than this are equal when ranking sprout candidates. */
const TIE = 1e-9;

/** The unit vector (screen: y down) of a counter-clockwise angle in degrees measured with y up. */
const direction = (deg: number): Point => ({
  x: Math.cos((deg * Math.PI) / 180),
  y: -Math.sin((deg * Math.PI) / 180),
});

/** The counter-clockwise angle (y up) of a screen vector, 0..360 degrees. */
function upAngle(v: Point): number {
  const a = (Math.atan2(-v.y, v.x) * 180) / Math.PI;
  return a < 0 ? a + 360 : a;
}

/**
 * P1: the directions (unit vectors, BLU, y down) a new bond can leave `atom` in, best first. The
 * first is the default sprout direction; the rest are the "next candidates" for a click whose
 * default is already taken (B3).
 *
 * - no neighbour: 30 degrees up and to the right;
 * - one neighbour: the two directions 120 degrees from it. The one farther from the neighbour's
 *   other neighbours comes first (the zig-zag continues); on a tie the one nearer horizontal (a
 *   zig-zag has no vertical bonds), then the more upward, then the more rightward;
 * - two or more: the bisectors of the angular gaps, largest first, a tie going to the gap that
 *   starts at the smallest angle counter-clockwise from +x.
 */
export function sproutDirections(doc: Doc, atom: AtomId): Point[] {
  const at = doc.atoms[atom];
  if (!at) return [];
  const around = neighbors(doc, atom).flatMap((id) => doc.atoms[id] ?? []);
  if (around.length === 0) return [direction(30)];
  const vectors = around.map((n) => normalize({ x: n.x - at.x, y: n.y - at.y }));
  const first = vectors[0] as Point;
  if (around.length === 1) {
    const neighbour = around[0];
    const others = neighbour
      ? neighbors(doc, neighbour.id)
          .filter((id) => id !== atom)
          .flatMap((id) => doc.atoms[id] ?? [])
      : [];
    // How far a candidate's atom is from the neighbour's other neighbours; no others, no preference.
    const room = (c: Point): number =>
      others.length === 0
        ? Infinity
        : Math.min(...others.map((o) => distance({ x: at.x + c.x, y: at.y + c.y }, o)));
    const rank = (a: Point, b: Point): number => {
      const [ra, rb] = [room(a), room(b)];
      if (Math.abs(ra - rb) > TIE && ra !== rb) return rb - ra;
      if (Math.abs(Math.abs(a.y) - Math.abs(b.y)) > TIE) return Math.abs(a.y) - Math.abs(b.y);
      if (Math.abs(a.y - b.y) > TIE) return a.y - b.y;
      return b.x - a.x;
    };
    return [rotate(first, 120), rotate(first, -120)].sort(rank);
  }
  const angles = vectors.map(upAngle).sort((a, b) => a - b);
  const gaps = angles.map((start, i) => {
    const next = i + 1 < angles.length ? (angles[i + 1] as number) : (angles[0] as number) + 360;
    return { start, size: next - start };
  });
  gaps.sort((a, b) => (Math.abs(a.size - b.size) > TIE ? b.size - a.size : a.start - b.start));
  return gaps.map((g) => direction(g.start + g.size / 2));
}
