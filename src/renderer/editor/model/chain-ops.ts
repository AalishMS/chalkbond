// The document edit of the Chain tool (SPEC-editor.md P2, P6): a zig-zag of single bonds along a
// drag. Pure, run for the ghost and again inside `transact` for the commit.
import { addAtom, addBond, findBond, type AtomId, type Doc, type Point } from '@core/doc-model';
import { SNAP_DEG, type BondStart } from './bond-ops';
import { distance, normalize, rotate, snapAngle } from './geometry';
import { sproutDirections } from './placement';
import { mergeCandidate } from './ring-ops';

/** P2: a chain has at most this many bonds. */
export const MAX_CHAIN = 20;

const C30 = Math.cos(Math.PI / 6);

/** A chain edit: the document it makes, how many bonds it has and the atom it ended on, if any. */
export interface ChainEdit {
  readonly doc: Doc;
  /** Bonds in the chain (1 to 20); the count label shows it. */
  readonly count: number;
  /** An existing atom a new atom merged into (P6). */
  readonly merge?: AtomId;
}

/** Picks the first bond of the zig-zag among the two directions 30 degrees off the drag. */
function firstBond(doc: Doc, start: BondStart, axis: Point): [Point, Point] {
  const left = rotate(axis, -30);
  const right = rotate(axis, 30);
  if ('atom' in start && doc.atoms[start.atom] !== undefined) {
    const around = sproutDirections(doc, start.atom)[0];
    const hasNeighbour = Object.values(doc.bonds).some(
      (b) => b.a1 === start.atom || b.a2 === start.atom,
    );
    if (around !== undefined && hasNeighbour) {
      const score = (u: Point): number => u.x * around.x + u.y * around.y;
      return score(left) >= score(right) ? [left, right] : [right, left];
    }
  }
  // Nothing to continue: the more upward, then the more rightward.
  if (Math.abs(left.y - right.y) > 1e-9) return left.y < right.y ? [left, right] : [right, left];
  return left.x >= right.x ? [left, right] : [right, left];
}

/**
 * P2 / P6: the chain a drag from `start` to `pointer` (BLU) makes: single bonds of length 1.0 in a
 * zig-zag along the direction snapped to 30 degrees (`free`: as dragged), one bond for every
 * cos 30 BLU of drag along it, at least 1 and at most 20. When `start` is an atom with a
 * neighbour the first bond continues its zig-zag (P1). Null when the pointer has not moved.
 */
export function chainEdit(
  doc: Doc,
  start: BondStart,
  pointer: Point,
  free: boolean,
): ChainEdit | null {
  const from = 'atom' in start ? doc.atoms[start.atom] : start.point;
  if (!from || distance(from, pointer) < 1e-9) return null;
  const aimed = free ? pointer : snapAngle(from, pointer, SNAP_DEG);
  const axis = normalize({ x: aimed.x - from.x, y: aimed.y - from.y });
  const along = (pointer.x - from.x) * axis.x + (pointer.y - from.y) * axis.y;
  const count = Math.min(MAX_CHAIN, Math.max(1, Math.round(along / C30)));
  const [first, second] = firstBond(doc, start, axis);

  let d = doc;
  let prev: AtomId;
  const used = new Set<AtomId>();
  if ('atom' in start) {
    prev = start.atom;
    used.add(prev);
  } else {
    [d, prev] = addAtom(d, { element: 'C', x: start.point.x, y: start.point.y });
  }
  let merge: AtomId | undefined;
  let pos: Point = { x: from.x, y: from.y };
  for (let k = 0; k < count; k++) {
    const step = k % 2 === 0 ? first : second;
    pos = { x: pos.x + step.x, y: pos.y + step.y };
    const near = mergeCandidate(doc, pos, used);
    let next: AtomId;
    if (near !== null) {
      used.add(near);
      merge ??= near;
      next = near;
    } else {
      [d, next] = addAtom(d, { element: 'C', x: pos.x, y: pos.y });
    }
    if (next !== prev && findBond(d, prev, next) === undefined) d = addBond(d, prev, next)[0];
    prev = next;
  }
  return { doc: d, count, ...(merge === undefined ? {} : { merge }) };
}
