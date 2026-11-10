// The document edits of the Arrow, Plus and Curved-arrow tools (SPEC-editor.md R1-R3): pure
// functions from a document to a document. A tool runs them outside history for the ghost and
// inside `transact` for the commit, so both issue the same ids.
import {
  addObject,
  fragments,
  resolveAnchor,
  updateObject,
  type Anchor,
  type ArrowKind,
  type AtomId,
  type Doc,
  type ObjectId,
} from '@core/doc-model';
import type { Scene } from '@core/svg-render';
import type { Guide } from '../state/editor-state';
import { distance, dot, snapAngle, type Point } from './geometry';
import { itemBoxes } from './move';
import { snapMove } from './snap';

/** R1: arrow angles snap to this many degrees (Shift: free). */
export const ARROW_SNAP_DEG = 15;
/** R1: a drag shorter than this many BLU is a click. */
export const ARROW_MIN_BLU = 0.5;
/** R1: the length of the arrow a click makes. */
export const ARROW_DEFAULT_BLU = 2.5;
/** R3: the bend of a curved arrow over a long chord, before its sign (`0.2 × chord` apex). */
export const CURVE_BEND = 0.4;
/** R3: the lowest apex height (BLU) of a new curved arrow, so a short chord still reads as a curve. */
export const CURVE_MIN_APEX = 0.45;
/** R3: apex distances to the nearest foreign atom closer than this (BLU) do not decide the side. */
export const CURVE_SIDE_TIE = 0.1;

export interface ArrowEnds {
  readonly from: Point;
  readonly to: Point;
}

/** The arrow option (a catalog option id) as the model's kind; Reaction when unknown. */
export function arrowKindOf(variant: string): ArrowKind {
  if (variant === 'equilibrium' || variant === 'resonance') return variant;
  if (variant === 'nogo' || variant === 'no-go') return 'no-go';
  return 'forward';
}

/** The curved-arrow option as the model's head; Electron pair when unknown. */
export function curvedHeadOf(variant: string): 'full' | 'fishhook' {
  return variant === 'fishhook' ? 'fishhook' : 'full';
}

const clean = (p: Point): Point => ({ x: p.x + 0, y: p.y + 0 });

/** R1: the arrow a drag from `from` to `to` draws, or null when the drag is a click. */
export function arrowFromDrag(from: Point, to: Point, free: boolean): ArrowEnds | null {
  if (distance(from, to) < ARROW_MIN_BLU) return null;
  const end = free ? to : snapAngle(from, to, ARROW_SNAP_DEG);
  return { from: clean(from), to: clean(end) };
}

/** R1: the arrow a click at `p` draws. */
export function defaultArrowEnds(p: Point): ArrowEnds {
  return { from: clean(p), to: { x: p.x + ARROW_DEFAULT_BLU, y: p.y + 0 } };
}

/** Adds an arrow of `kind` and returns the document and its id. */
export function addArrow(doc: Doc, ends: ArrowEnds, kind: ArrowKind): [Doc, ObjectId] {
  return addObject(doc, { type: 'arrow', kind, from: ends.from, to: ends.to });
}

/** R1: `doc` with arrow `id` set to `kind`; null when it is not an arrow or already that kind. */
export function setArrowKind(doc: Doc, id: ObjectId, kind: ArrowKind): Doc | null {
  const obj = doc.objects[id];
  if (obj?.type !== 'arrow' || obj.kind === kind) return null;
  return updateObject(doc, id, { kind });
}

/** R2: adds a plus sign centred on `at`. */
export function addPlus(doc: Doc, at: Point): [Doc, ObjectId] {
  return addObject(doc, { type: 'plus', at: clean(at) });
}

/** The atoms of the fragment that holds the atom or bond `anchor` is on; none for a point. */
function fragmentOf(doc: Doc, anchor: Anchor): readonly AtomId[] {
  const atom =
    anchor.kind === 'atom'
      ? anchor.atom
      : anchor.kind === 'bond'
        ? doc.bonds[anchor.bond]?.a1
        : null;
  if (atom === null || atom === undefined) return [];
  return fragments(doc).find((f) => f.includes(atom)) ?? [];
}

/** R3: the size of the default bend over a chord: apex height `max(0.2 × chord, 0.45 BLU)`. */
export function defaultBendSize(chord: number): number {
  if (chord <= 0) return CURVE_BEND;
  const apex = Math.max(CURVE_BEND * 0.5 * chord, CURVE_MIN_APEX);
  return (2 * apex) / chord;
}

/** The atoms an anchor stands on: its atom, or both atoms of its bond. */
function ownAtoms(doc: Doc, anchor: Anchor): readonly AtomId[] {
  if (anchor.kind === 'atom') return [anchor.atom];
  if (anchor.kind === 'bond') {
    const bond = doc.bonds[anchor.bond];
    return bond === undefined ? [] : [bond.a1, bond.a2];
  }
  return [];
}

/**
 * R3: the default bend of a new curved arrow. Its size is `defaultBendSize`. Its sign puts the
 * apex on the side farther from the nearest atom that is not one of the anchors' own atoms; when
 * the two distances differ by less than 0.1 BLU the side bulges away from the centroid of the
 * atoms of the fragments the anchors touch (`+` when that centroid lies on the chord).
 * svg-render puts the control point at the chord midpoint + bend x chord length x (u.y, -u.x), u
 * the unit chord, so the apex is bend x chord / 2 from the midpoint.
 */
export function curvedBend(doc: Doc, from: Anchor, to: Anchor): number {
  const a = resolveAnchor(doc, from);
  const b = resolveAnchor(doc, to);
  const len = distance(a, b);
  if (len === 0) return CURVE_BEND;
  const size = defaultBendSize(len);
  const normal = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

  const atoms = new Set<AtomId>([...fragmentOf(doc, from), ...fragmentOf(doc, to)]);
  let preferred = 1;
  if (atoms.size > 0) {
    let cx = 0;
    let cy = 0;
    for (const id of atoms) {
      cx += doc.atoms[id]?.x ?? 0;
      cy += doc.atoms[id]?.y ?? 0;
    }
    const centroid = { x: cx / atoms.size, y: cy / atoms.size };
    const side = dot({ x: centroid.x - mid.x, y: centroid.y - mid.y }, normal);
    // On the chord (within 1e-9 BLU): `+`.
    preferred = side > 1e-9 ? -1 : 1;
  }

  const own = new Set<AtomId>([...ownAtoms(doc, from), ...ownAtoms(doc, to)]);
  const others = Object.values(doc.atoms).filter((atom) => !own.has(atom.id));
  if (others.length === 0) return preferred * size;
  const apexGap = (sign: number): number => {
    const apex = {
      x: mid.x + normal.x * sign * size * len * 0.5,
      y: mid.y + normal.y * sign * size * len * 0.5,
    };
    return Math.min(...others.map((atom) => distance(apex, atom)));
  };
  const plus = apexGap(1);
  const minus = apexGap(-1);
  if (Math.abs(plus - minus) < CURVE_SIDE_TIE) return preferred * size;
  return (plus > minus ? 1 : -1) * size;
}

/** True when the two anchors are the same atom or the same bond. */
function sameAnchor(a: Anchor, b: Anchor): boolean {
  if (a.kind === 'atom' && b.kind === 'atom') return a.atom === b.atom;
  if (a.kind === 'bond' && b.kind === 'bond') return a.bond === b.bond;
  return false;
}

/** R3: adds a curved arrow between two anchors; null when they are the same atom or bond. */
export function addCurved(
  doc: Doc,
  from: Anchor,
  to: Anchor,
  head: 'full' | 'fishhook',
): [Doc, ObjectId] | null {
  if (sameAnchor(from, to)) return null;
  return addObject(doc, {
    type: 'curved-arrow',
    head,
    from,
    to,
    bend: curvedBend(doc, from, to),
  });
}

/**
 * R2, S3: where a plus clicked at `p` (BLU) lands: its centre pulled onto the centre x or y of
 * another fragment or object when within 6 screen px (`pxPerPt` converts), with the guides.
 */
export function snapPlus(
  doc: Doc,
  scene: Scene,
  p: Point,
  pxPerPt: number,
): { readonly at: Point; readonly guides: readonly Guide[] } {
  const bl = scene.style.bondLength;
  const moving = { x: p.x * bl, y: p.y * bl, w: 0, h: 0 };
  const others = itemBoxes(doc, scene).map((b) => b.box);
  const snapped = snapMove(moving, others, { x: 0, y: 0 }, pxPerPt, { x: false, y: false });
  return {
    at: { x: p.x + snapped.d.x / bl, y: p.y + snapped.d.y / bl },
    guides: snapped.guides,
  };
}
