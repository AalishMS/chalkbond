// The label editor's rules (SPEC-editor.md L1-L3): what a label box is filled with, and what
// committing it does to the atom. Pure: values in, a document (or null for "no change") out.
import { interpretLabel, perceive } from '@core/chem-core';
import { updateAtom, type Atom, type AtomId, type Doc } from '@core/doc-model';
import { ringAtoms } from '@core/svg-render';

/** L1: the atom's label, else its element with the H count (when explicit) and the charge. */
export function labelPrefill(atom: Atom): string {
  if (atom.label !== undefined && atom.label !== '') return atom.label;
  let text = atom.element;
  if (atom.explicitH !== undefined && atom.explicitH > 0) {
    text += atom.explicitH === 1 ? 'H' : `H${atom.explicitH}`;
  }
  if (atom.charge !== 0) {
    const sign = atom.charge > 0 ? '+' : '-';
    text += Math.abs(atom.charge) === 1 ? sign : `${sign}${Math.abs(atom.charge)}`;
  }
  return text;
}

/**
 * L1 in the document's setting: in structural mode a carbon outside a ring with no label opens
 * with the text it shows, the element and its perceived H count (`CH3`, R52 U11); everything else
 * (a ring carbon, any carbon in skeletal mode, a labelled atom) as `labelPrefill`.
 */
export function labelPrefillIn(doc: Doc, atom: Atom): string {
  const written =
    doc.style.formula === 'structural' &&
    atom.element === 'C' &&
    (atom.label === undefined || atom.label === '') &&
    !ringAtoms(doc).has(atom.id);
  if (!written) return labelPrefill(atom);
  const h = Math.max(0, Math.floor(perceive(doc).atoms[atom.id]?.implicitH ?? 0));
  const text = `C${h === 0 ? '' : h === 1 ? 'H' : `H${h}`}`;
  if (atom.charge === 0) return text;
  const sign = atom.charge > 0 ? '+' : '-';
  return Math.abs(atom.charge) === 1 ? `${text}${sign}` : `${text}${sign}${Math.abs(atom.charge)}`;
}

/** L2: the caption turns into the "drawn as typed" warning when the text is not understood. */
export function labelWarning(text: string): boolean {
  return text.trim() !== '' && interpretLabel(text).kind === 'unknown';
}

/**
 * L3: `text` committed to atom `id`. `element` labels set the element, the charge and an H count
 * only if it differs from the automatic one; an abbreviation keeps its attachment element; any
 * other text becomes a pseudo-atom `*` drawn as typed; empty text is a plain carbon. Returns
 * `null` when the atom would not change (no undo step).
 */
export function labelCommit(doc: Doc, id: AtomId, text: string): Doc | null {
  const before = doc.atoms[id];
  if (!before) return null;
  const typed = text.trim();
  const interp = interpretLabel(typed);
  let next: Doc;
  if (typed === '') {
    next = updateAtom(doc, id, {
      element: 'C',
      label: undefined,
      charge: 0,
      explicitH: undefined,
    });
  } else if (interp.kind === 'element') {
    const cleared = updateAtom(doc, id, {
      element: interp.element,
      label: undefined,
      charge: interp.charge ?? 0,
      explicitH: undefined,
    });
    const automatic = perceive(cleared).atoms[id]?.implicitH;
    next =
      interp.hCount !== undefined && interp.hCount !== automatic
        ? updateAtom(cleared, id, { explicitH: interp.hCount })
        : cleared;
  } else if (interp.kind === 'abbreviation') {
    next = updateAtom(doc, id, {
      element: interp.element,
      label: interp.key,
      charge: 0,
      explicitH: undefined,
    });
  } else {
    next = updateAtom(doc, id, { element: '*', label: typed, charge: 0, explicitH: undefined });
  }
  return JSON.stringify(next.atoms[id]) === JSON.stringify(before) ? null : next;
}
