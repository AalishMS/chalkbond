// Test helper: the oracle of SPEC-svg-render.md Decision 16 (item 4 of "The layout"). The
// structural render of `doc` must equal, part for part, the skeletal render of `structuralOracle(doc)`:
// every carbon the structural mode writes (a carbon outside a ring without `label`, `isotope` or
// `explicitH`) is given `explicitH` = its perceived `implicitH`, so today's rules write it, and
// `style.formula` is removed.
import { perceive } from '../../chem-core';
import type { Atom, AtomId, Doc } from '../../doc-model';
import { ringAtoms } from '../ring-atoms';

export function structuralOracle(doc: Doc): Doc {
  const ring = ringAtoms(doc);
  const perception = perceive(doc);
  const atoms: Record<string, Atom> = {};
  for (const [id, atom] of Object.entries(doc.atoms)) {
    const written =
      atom.element === 'C' &&
      (atom.label === undefined || atom.label === '') &&
      atom.isotope === undefined &&
      atom.explicitH === undefined &&
      !ring.has(id as AtomId);
    atoms[id] = written
      ? { ...atom, explicitH: perception.atoms[id as AtomId]?.implicitH ?? 0 }
      : atom;
  }
  const { formula: _formula, ...style } = doc.style;
  return { ...doc, atoms, style } as Doc;
}
