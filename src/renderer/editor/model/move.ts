// What a move drags along, and whether it can be previewed as a translation (SPEC-editor.md
// "Rendering" rule 4 and S3).
import {
  fragments,
  type Anchor,
  type AtomId,
  type BondId,
  type Doc,
  type ObjectId,
  type Selection,
} from '@core/doc-model';
import type { ItemKey, Scene } from '@core/svg-render';
import { rectUnion, type Rect } from './geometry';
import { expandSelection } from './selection';

/** An item's ink box (pt): a whole fragment, or one object. */
export interface ItemBox {
  /** The fragment's atoms; empty for an object. */
  readonly atoms: readonly AtomId[];
  readonly object?: ObjectId;
  readonly box: Rect;
}

function unionOf(boxes: readonly (Rect | undefined)[]): Rect | null {
  let ink: Rect | null = null;
  for (const b of boxes) if (b !== undefined) ink = ink === null ? b : rectUnion(ink, b);
  return ink;
}

/** The ink (pt) of some atoms: their vertices and label extents, and the bonds between them. */
function atomsInk(doc: Doc, scene: Scene, atoms: ReadonlySet<AtomId>): (Rect | undefined)[] {
  const ppb = scene.style.ptPerBlu;
  const boxes: (Rect | undefined)[] = [];
  for (const id of atoms) {
    const atom = doc.atoms[id];
    if (atom) boxes.push({ x: atom.x * ppb, y: atom.y * ppb, w: 0, h: 0 });
    boxes.push(scene.extents[`atom:${id}`]);
  }
  for (const bond of Object.values(doc.bonds)) {
    if (atoms.has(bond.a1) && atoms.has(bond.a2)) boxes.push(scene.extents[`bond:${bond.id}`]);
  }
  return boxes;
}

/** The ink box of every fragment and every object of `doc`, pt. */
export function itemBoxes(doc: Doc, scene: Scene): ItemBox[] {
  const boxes: ItemBox[] = [];
  for (const atoms of fragments(doc)) {
    const box = unionOf(atomsInk(doc, scene, new Set(atoms)));
    if (box !== null) boxes.push({ atoms, box });
  }
  for (const id of Object.keys(doc.objects) as ObjectId[]) {
    const box = scene.extents[`obj:${id}` as ItemKey];
    if (box !== undefined) boxes.push({ atoms: [], object: id, box });
  }
  return boxes;
}

/** The ink box (pt) of what moving `sel` drags along; null when there is none. */
export function movedInk(doc: Doc, scene: Scene, sel: Selection): Rect | null {
  const { atoms, objects } = expandSelection(doc, sel);
  const boxes = atomsInk(doc, scene, atoms);
  for (const id of objects) boxes.push(scene.extents[`obj:${id}` as ItemKey]);
  return unionOf(boxes);
}

/** The atom or bond an anchor follows, if any. */
function anchorTargets(anchor: Anchor): { atom?: AtomId; bond?: BondId } {
  if (anchor.kind === 'atom') return { atom: anchor.atom };
  if (anchor.kind === 'bond') return { bond: anchor.bond };
  return {};
}

export interface MovePlan {
  /** True: only the listed parts' `<g>` need a translation, nothing re-renders. */
  readonly translate: boolean;
  /** Part keys that move with the selection. */
  readonly keys: readonly string[];
  /** Atoms that move, ink boxes of fragments that do not (snap targets are the others). */
  readonly atoms: ReadonlySet<AtomId>;
  readonly objects: ReadonlySet<ObjectId>;
}

/**
 * Rendering rule 4: the preview of a move is a translation when no part that stays depends on a
 * part that moves: every bond has both ends moving or neither, and no unselected curved arrow,
 * callout or caption refers to a moved atom or bond; a selected one that refers to an atom or
 * bond that stays would stretch. Otherwise every frame renders the moved document.
 */
export function movePlan(doc: Doc, scene: Scene, sel: Selection): MovePlan {
  const { atoms, objects } = expandSelection(doc, sel);
  const bondMoves = (id: BondId): boolean => {
    const bond = doc.bonds[id];
    return bond !== undefined && atoms.has(bond.a1) && atoms.has(bond.a2);
  };
  let translate = true;
  for (const bond of Object.values(doc.bonds)) {
    if (atoms.has(bond.a1) !== atoms.has(bond.a2)) translate = false;
  }
  /** Whether an anchor's target moves; `null` when it has none (a point). */
  const targetMoves = (a: Anchor): boolean | null => {
    const t = anchorTargets(a);
    if (t.atom !== undefined) return atoms.has(t.atom);
    if (t.bond !== undefined) return bondMoves(t.bond);
    return null;
  };
  for (const obj of Object.values(doc.objects)) {
    const moving = objects.has(obj.id);
    const anchors: Anchor[] = [];
    if (obj.type === 'curved-arrow') anchors.push(obj.from, obj.to);
    if (obj.type === 'callout') anchors.push(obj.anchor);
    for (const a of anchors) {
      const follows = targetMoves(a);
      // A moving object must move with its anchors; a staying one must not have them move.
      if (follows !== null && follows !== moving) translate = false;
    }
    if (obj.type === 'caption') {
      const some = obj.target.some((t) => atoms.has(t));
      const all = obj.target.every((t) => atoms.has(t));
      if (moving ? !all : some) translate = false;
    }
  }
  const keys: string[] = [];
  for (const id of atoms) keys.push(`atom:${id}`);
  for (const bond of Object.values(doc.bonds)) if (bondMoves(bond.id)) keys.push(`bond:${bond.id}`);
  for (const id of objects) keys.push(`obj:${id}`);
  for (const part of scene.parts) {
    if (!part.key.startsWith('ring:')) continue;
    const ids = part.key.slice('ring:'.length).split(',');
    if (ids.every((id) => atoms.has(id as AtomId))) keys.push(part.key);
  }
  return { translate, keys, atoms, objects };
}
