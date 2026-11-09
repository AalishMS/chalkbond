// Public perception types for chem-core. See SPEC-chem-core.md "Data Model".
import type { AtomId, BondId } from '../doc-model/index';

export interface AtomInfo {
  /** H to draw next to the atom: `explicitH` if set, else computed. 0 for labelled atoms. */
  readonly implicitH: number;
  readonly aromatic: boolean;
  /** 'over' → the editor shows a valence warning on this atom. */
  readonly valence: 'ok' | 'over';
}

export interface BondInfo {
  readonly aromatic: boolean;
}

export interface Formula {
  /** Element symbol → count, incl. 'H' ('D'/'T' for hydrogen isotopes); pseudo-atoms and
   * unknown labels are counted under their symbol / label text. */
  readonly counts: Readonly<Record<string, number>>;
  /** Net formal charge. */
  readonly charge: number;
  /** Hill order, e.g. 'C2H3O2' (charge not included). */
  readonly hill: string;
  /** Display form incl. charge, e.g. 'C2H3O2⁻'. */
  readonly text: string;
  /** Average mass (g/mol); null if pseudo-atoms or unknown labels. */
  readonly mw: number | null;
  /** Monoisotopic mass; null if pseudo-atoms or unknown labels. */
  readonly exactMass: number | null;
}

export type ChemWarningCode =
  /** Atom exceeds its allowed valence (incl. charge / radical). */
  | 'over-valence'
  /** Label is neither element + H nor a known abbreviation. */
  | 'unknown-label'
  /** Abbreviation atom has a bond count its group can't take (groups are monovalent). */
  | 'abbreviation-bonds'
  /** Order-1.5 bonds that admit no Kekulé structure. */
  | 'cannot-kekulize';

export interface ChemWarning {
  readonly code: ChemWarningCode;
  readonly atoms: readonly AtomId[];
  readonly bonds: readonly BondId[];
  readonly message: string;
}

export interface FragmentPerception {
  readonly atoms: readonly AtomId[];
  readonly formula: Formula;
}

export interface Perception {
  readonly atoms: Readonly<Record<AtomId, AtomInfo>>;
  readonly bonds: Readonly<Record<BondId, BondInfo>>;
  /** Same order as doc-model `fragments()`. */
  readonly fragments: readonly FragmentPerception[];
  readonly warnings: readonly ChemWarning[];
}
