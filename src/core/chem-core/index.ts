// Public entry for the chem-core module. Other modules import only from here.
// No OpenChemLib type or object crosses this boundary (SPEC-chem-core.md).
export { ChemError, type ChemErrorCode } from './errors';
