// The document edits of the Atom tool (SPEC-editor.md A1-A3): pure functions from a document to a
// document, run outside history for a ghost and inside `transact` for the commit.
import {
  addAtom,
  updateAtom,
  type AtomId,
  type Doc,
  type ElementSymbol,
  type PartialCharge,
  type Point,
} from '@core/doc-model';
import { bondSpec, dragBond, type BondEdit } from './bond-ops';

/** The mark options of the Atom tool (A3). */
export type AtomMark = 'plus' | 'minus' | 'lone-pair' | 'radical' | 'delta-plus' | 'delta-minus';

/** What the Atom option does: set an element, or add a mark. */
export type AtomMode =
  | { readonly kind: 'element'; readonly element: ElementSymbol }
  | { readonly kind: 'mark'; readonly mark: AtomMark };

const MARKS: readonly string[] = [
  'plus',
  'minus',
  'lone-pair',
  'radical',
  'delta-plus',
  'delta-minus',
];

/** The mode of an Atom option id: a mark id, else an element symbol (carbon when unknown). */
export function atomMode(variant: string): AtomMode {
  if (MARKS.includes(variant)) return { kind: 'mark', mark: variant as AtomMark };
  return { kind: 'element', element: (variant === '' ? 'C' : variant) as ElementSymbol };
}

/** A3: charges stay within this many units of zero. */
export const MAX_CHARGE = 4;
/** A3: lone pairs cycle through 0 to this many. */
export const MAX_LONE_PAIRS = 4;

/**
 * A2: `element` on atom `id`, label and explicit H cleared, charge and marks kept. Null when the
 * atom has that element already (or does not exist).
 */
export function setElement(doc: Doc, id: AtomId, element: ElementSymbol): Doc | null {
  const atom = doc.atoms[id];
  if (!atom || atom.element === element) return null;
  return updateAtom(doc, id, { element, label: undefined, explicitH: undefined });
}

/** A1: a lone atom of `element` at `p`; it draws with its hydrogens (a lone O is H2O). */
export function addLoneAtom(doc: Doc, p: Point, element: ElementSymbol): Doc {
  return addAtom(doc, { element, x: p.x, y: p.y })[0];
}

/**
 * A1: a drag from atom `from` towards `pointer` bonds a new atom of `element`, placed as B4 places
 * it. If the drag ends on `target` the two atoms are only bonded. Null when nothing is added.
 */
export function dragAtom(
  doc: Doc,
  from: AtomId,
  pointer: Point,
  free: boolean,
  target: AtomId | null,
  element: ElementSymbol,
): BondEdit | null {
  // Inside a transaction `doc` is a draft the edit changes in place: note its atoms first.
  const before = new Set<string>(Object.keys(doc.atoms));
  const edit = dragBond(doc, { atom: from }, pointer, free, target, bondSpec('single'));
  if (edit === null || edit.merge !== undefined) return edit;
  const fresh = Object.keys(edit.doc.atoms).find((id) => !before.has(id)) as AtomId | undefined;
  if (fresh === undefined) return edit;
  return { doc: updateAtom(edit.doc, fresh, { element }) };
}

/**
 * A3: the mark `mark` on atom `id`; `reverse` (Shift) goes the other way. Charges step by one,
 * clamped to -4..4; lone pairs cycle 0 to 4; a radical toggles; delta+ / delta- are set, or
 * cleared if the atom has that value already (reversed: delta+ sets delta-, and the reverse).
 * Null when nothing changes (a charge at its limit) or the atom does not exist.
 */
export function applyMark(doc: Doc, id: AtomId, mark: AtomMark, reverse: boolean): Doc | null {
  const atom = doc.atoms[id];
  if (!atom) return null;
  switch (mark) {
    case 'plus':
    case 'minus': {
      const step = (mark === 'plus' ? 1 : -1) * (reverse ? -1 : 1);
      const charge = Math.max(-MAX_CHARGE, Math.min(MAX_CHARGE, atom.charge + step));
      return charge === atom.charge ? null : updateAtom(doc, id, { charge });
    }
    case 'lone-pair': {
      const n = atom.lonePairs ?? 0;
      const cycle = MAX_LONE_PAIRS + 1;
      return updateAtom(doc, id, { lonePairs: (n + (reverse ? cycle - 1 : 1)) % cycle });
    }
    case 'radical':
      return updateAtom(doc, id, { radical: atom.radical === 0 ? 1 : 0 });
    case 'delta-plus':
    case 'delta-minus': {
      const plus = (mark === 'delta-plus') !== reverse;
      const value: PartialCharge = plus ? 'δ+' : 'δ-';
      return updateAtom(doc, id, {
        partialCharge: atom.partialCharge === value ? undefined : value,
      });
    }
  }
}
