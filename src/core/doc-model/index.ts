// Public entry for the doc-model module. Other modules import only from here.
export type * from './types';
export { PERIODIC_SYMBOLS, PSEUDO_SYMBOLS, isValidElement } from './elements';
export { DocError, type DocErrorCode } from './errors';
export { emptyDoc } from './doc';
export { addAtom, updateAtom, neighbors, type AtomInit, type AtomPatch } from './atoms';
export { addBond, updateBond, findBond, type BondInit, type BondPatch } from './bonds';
export {
  createHistory,
  transact,
  undo,
  redo,
  current,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  HISTORY_DEPTH,
  type History,
  type CreateHistoryOptions,
  type TransactOptions,
} from './history';
export { checkInvariants, type InvariantCode, type InvariantViolation } from './invariants';
