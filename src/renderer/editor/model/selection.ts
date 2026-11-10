// Selections: what a commit added, and the click rules of the Select tool (SPEC-editor.md S1,
// Decision 6).
import {
  fragments,
  type AtomId,
  type BondId,
  type Doc,
  type ObjectId,
  type Selection,
} from '@core/doc-model';
import { EMPTY_SELECTION } from '../state/editor-state';
import type { Hit } from './hit-test';

const number = (id: string): number => Number(id.slice(1));

/**
 * The items `doc` gained since the document's `nextId` was `firstNewId`: ids are never reused
 * within a document, so every id at or above it was issued by that commit.
 */
export function insertedSelection(firstNewId: number, doc: Doc): Selection {
  const fresh = (ids: string[]): string[] => ids.filter((id) => number(id) >= firstNewId);
  return {
    atoms: new Set(fresh(Object.keys(doc.atoms)) as AtomId[]),
    bonds: new Set(fresh(Object.keys(doc.bonds)) as BondId[]),
    objects: new Set(fresh(Object.keys(doc.objects)) as ObjectId[]),
  };
}

export const isEmptySelection = (s: Selection): boolean =>
  s.atoms.size === 0 && s.bonds.size === 0 && s.objects.size === 0;

/** Every atom, bond and object of the document (Ctrl+A). */
export function selectAll(doc: Doc): Selection {
  const sel = {
    atoms: new Set(Object.keys(doc.atoms) as AtomId[]),
    bonds: new Set(Object.keys(doc.bonds) as BondId[]),
    objects: new Set(Object.keys(doc.objects) as ObjectId[]),
  };
  return isEmptySelection(sel) ? EMPTY_SELECTION : sel;
}

/**
 * The selection plus what moving it implies: the endpoints of selected bonds, and texts attached
 * to selected arrows (the same expansion `transformItems` applies).
 */
export function expandSelection(
  doc: Doc,
  sel: Selection,
): { atoms: Set<AtomId>; objects: Set<ObjectId> } {
  const atoms = new Set<AtomId>(sel.atoms);
  for (const id of sel.bonds) {
    const bond = doc.bonds[id];
    if (bond) {
      atoms.add(bond.a1);
      atoms.add(bond.a2);
    }
  }
  const objects = new Set<ObjectId>(sel.objects);
  for (const obj of Object.values(doc.objects)) {
    if (obj.type === 'text' && obj.attachedTo && sel.objects.has(obj.attachedTo.arrow)) {
      objects.add(obj.id);
    }
  }
  return { atoms, objects };
}

/** The atoms of the fragment that holds `atom`. */
function fragmentAtoms(doc: Doc, atom: AtomId): readonly AtomId[] {
  return fragments(doc).find((f) => f.includes(atom)) ?? [atom];
}

/** The atoms and bonds of the fragment of an atom or bond hit. */
function fragmentOf(doc: Doc, hit: { kind: 'atom' | 'bond'; id: string }): Selection {
  const anchor = hit.kind === 'atom' ? (hit.id as AtomId) : doc.bonds[hit.id as BondId]?.a1;
  if (anchor === undefined) return EMPTY_SELECTION;
  const atoms = new Set(fragmentAtoms(doc, anchor));
  const bonds = new Set(
    Object.values(doc.bonds)
      .filter((b) => atoms.has(b.a1) && atoms.has(b.a2))
      .map((b) => b.id),
  );
  return { atoms, bonds, objects: new Set() };
}

const holdsAll = <T>(set: ReadonlySet<T>, items: ReadonlySet<T>): boolean =>
  [...items].every((i) => set.has(i));

const isWhole = (sel: Selection, frag: Selection): boolean =>
  holdsAll(sel.atoms, frag.atoms) && holdsAll(sel.bonds, frag.bonds);

/** One atom, bond or object as a selection. */
function single(hit: Hit): Selection {
  switch (hit.kind) {
    case 'atom':
      return { atoms: new Set([hit.id]), bonds: new Set(), objects: new Set() };
    case 'bond':
      return { atoms: new Set(), bonds: new Set([hit.id]), objects: new Set() };
    case 'object':
      return { atoms: new Set(), bonds: new Set(), objects: new Set([hit.id]) };
    default:
      return EMPTY_SELECTION;
  }
}

/** `sel` with `add` toggled in or out: out when every item of `add` is already in. */
function toggled(sel: Selection, add: Selection): Selection {
  const inside =
    holdsAll(sel.atoms, add.atoms) &&
    holdsAll(sel.bonds, add.bonds) &&
    holdsAll(sel.objects, add.objects);
  const merge = <T>(a: ReadonlySet<T>, b: ReadonlySet<T>): Set<T> =>
    inside ? new Set([...a].filter((x) => !b.has(x))) : new Set([...a, ...b]);
  const next = {
    atoms: merge(sel.atoms, add.atoms),
    bonds: merge(sel.bonds, add.bonds),
    objects: merge(sel.objects, add.objects),
  };
  return isEmptySelection(next) ? EMPTY_SELECTION : next;
}

/** Whether the item named by `hit` is in `sel`. */
export function selectionHolds(sel: Selection, hit: Hit): boolean {
  switch (hit.kind) {
    case 'atom':
      return sel.atoms.has(hit.id);
    case 'bond':
      return sel.bonds.has(hit.id);
    case 'object':
      return sel.objects.has(hit.id);
    default:
      return false;
  }
}

/**
 * S1: the selection after a click (press and release within 4 px). On an atom or bond: its whole
 * fragment, or, when that fragment is already fully selected, just that atom or bond; Alt picks
 * the single atom or bond directly; Shift toggles. On an object: that object (Shift toggles).
 * On empty canvas: nothing selected, unless Shift is down (R24: Shift only adds).
 */
export function clickSelection(
  doc: Doc,
  sel: Selection,
  hit: Hit | null,
  mods: { readonly shift: boolean; readonly alt: boolean },
): Selection {
  if (hit === null) return mods.shift ? sel : EMPTY_SELECTION;
  if (hit.kind === 'object') return mods.shift ? toggled(sel, single(hit)) : single(hit);
  if (hit.kind !== 'atom' && hit.kind !== 'bond') return sel;
  if (mods.alt) return mods.shift ? toggled(sel, single(hit)) : single(hit);
  const frag = fragmentOf(doc, hit);
  if (mods.shift) return toggled(sel, frag);
  return isWhole(sel, frag) ? single(hit) : frag;
}

/** Everything in `a` or `b`. */
export function unionSelection(a: Selection, b: Selection): Selection {
  if (isEmptySelection(a)) return b;
  if (isEmptySelection(b)) return a;
  return {
    atoms: new Set([...a.atoms, ...b.atoms]),
    bonds: new Set([...a.bonds, ...b.bonds]),
    objects: new Set([...a.objects, ...b.objects]),
  };
}
