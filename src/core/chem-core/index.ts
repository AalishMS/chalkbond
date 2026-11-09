// Public entry for the chem-core module. Other modules import only from here.
// No OpenChemLib type or object crosses this boundary (SPEC-chem-core.md).
export { ChemError, type ChemErrorCode } from './errors';
export { interpretLabel, type LabelInterpretation } from './labels';
export { ABBREVIATIONS, type AbbreviationDef } from './abbreviations';
export { perceive, formulaOf } from './perceive';
export type {
  AtomInfo,
  BondInfo,
  ChemWarning,
  ChemWarningCode,
  Formula,
  FragmentPerception,
  Perception,
} from './types';
export { createPerceiver, PERCEIVER_CACHE_SIZE } from './perceiver';
export { aromatize, kekulize } from './aromatic';
