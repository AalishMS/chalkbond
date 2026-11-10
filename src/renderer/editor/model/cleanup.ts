// Deleting with the orphan rule (SPEC-editor.md E2, S8).
import { deleteItems, type AtomId, type Atom, type Doc, type Selection } from '@core/doc-model';

/** A skeleton carbon with nothing of its own to keep: nothing but `C` at a vertex. */
function isPlainCarbon(atom: Atom): boolean {
  return (
    atom.element === 'C' &&
    atom.label === undefined &&
    atom.charge === 0 &&
    atom.radical === 0 &&
    (atom.lonePairs ?? 0) === 0 &&
    atom.isotope === undefined &&
    atom.explicitH === undefined &&
    atom.partialCharge === undefined &&
    atom.number === undefined &&
    atom.color === undefined
  );
}

/** A curved arrow, callout or caption points at the atom. */
function isReferred(doc: Doc, id: AtomId): boolean {
  for (const obj of Object.values(doc.objects)) {
    switch (obj.type) {
      case 'curved-arrow':
        if (
          (obj.from.kind === 'atom' && obj.from.atom === id) ||
          (obj.to.kind === 'atom' && obj.to.atom === id)
        ) {
          return true;
        }
        break;
      case 'callout':
        if (obj.anchor.kind === 'atom' && obj.anchor.atom === id) return true;
        break;
      case 'caption':
        if (obj.target.includes(id)) return true;
        break;
      default:
        break;
    }
  }
  return false;
}

/**
 * E2: `deleteItems`, then every atom that lost a bond in this deletion and now has none is also
 * deleted if it is a plain skeleton carbon, unless a curved arrow, callout or caption refers to
 * it. A deleted bond would otherwise leave a stray "CH4".
 */
export function deleteWithOrphans(doc: Doc, sel: Selection): Doc {
  const lost = new Set<AtomId>();
  for (const bond of Object.values(doc.bonds)) {
    if (!sel.bonds.has(bond.id) && !sel.atoms.has(bond.a1) && !sel.atoms.has(bond.a2)) continue;
    for (const end of [bond.a1, bond.a2]) if (!sel.atoms.has(end)) lost.add(end);
  }
  const next = deleteItems(doc, sel);
  const bonded = new Set<AtomId>();
  for (const bond of Object.values(next.bonds)) {
    bonded.add(bond.a1);
    bonded.add(bond.a2);
  }
  const orphans = [...lost].filter((id) => {
    const atom = next.atoms[id];
    return atom !== undefined && !bonded.has(id) && isPlainCarbon(atom) && !isReferred(next, id);
  });
  if (orphans.length === 0) return next;
  return deleteItems(next, { atoms: new Set(orphans), bonds: new Set(), objects: new Set() });
}
