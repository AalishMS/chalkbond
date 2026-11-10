// The scope of the selection actions (SPEC-editor.md "Selection actions", R11): the selection,
// or the whole document when nothing is selected.
import { interpretLabel, type Perception } from '@core/chem-core';
import type { AtomId, BondId, Doc, Selection } from '@core/doc-model';
import { EMPTY_SCOPE, type SelectionScope } from '../state/selection-actions';
import { expandSelection, isEmptySelection } from './selection';

export function selectionScope(
  doc: Doc,
  perception: Perception,
  selection: Selection,
): SelectionScope {
  const hasArrow = Object.values(doc.objects).some((o) => o.type === 'arrow');
  const whole = isEmptySelection(selection);
  const atoms: ReadonlySet<AtomId> = whole
    ? new Set(Object.keys(doc.atoms) as AtomId[])
    : expandSelection(doc, selection).atoms;
  const bonds: BondId[] = (Object.keys(doc.bonds) as BondId[]).filter((id) => {
    const bond = doc.bonds[id];
    return (
      bond !== undefined &&
      (whole || selection.bonds.has(id) || (atoms.has(bond.a1) && atoms.has(bond.a2)))
    );
  });
  let hasAromatic15 = false;
  let hasAromaticNon15 = false;
  for (const id of bonds) {
    const bond = doc.bonds[id];
    if (bond === undefined || perception.bonds[id]?.aromatic !== true) continue;
    if (bond.order === 1.5) hasAromatic15 = true;
    else hasAromaticNon15 = true;
  }
  const hasAbbreviation =
    !whole &&
    [...atoms].some((id) => {
      const label = doc.atoms[id]?.label;
      return label !== undefined && interpretLabel(label).kind === 'abbreviation';
    });
  return {
    ...EMPTY_SCOPE,
    hasFragment: perception.fragments.some(
      (f) => f.atoms.length >= 2 && f.atoms.some((a) => atoms.has(a)),
    ),
    hasAromatic15,
    hasAromaticNon15,
    hasArrow,
    hasSelection: !whole,
    hasAbbreviation,
  };
}
