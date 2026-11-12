// Public entry for the doc-model module. Other modules import only from here.
export type * from './types';
export { PERIODIC_SYMBOLS, PSEUDO_SYMBOLS, isValidElement } from './elements';
export { DocError, type DocErrorCode } from './errors';
export { emptyDoc } from './doc';
export { addAtom, updateAtom, neighbors, type AtomInit, type AtomPatch } from './atoms';
export { addBond, updateBond, findBond, type BondInit, type BondPatch } from './bonds';
export { addObject, updateObject, type ObjectInit, type ObjectPatch } from './objects';
export { paintLayers } from './z-order';
export { setStyle, type StylePatch } from './style';
export { deleteItems } from './delete';
export { mergeAtoms } from './merge';
export { resolveAnchor } from './anchors';
export { transformItems, bounds } from './transform';
export { fragments } from './graph';
export { extract, insert, everything, type SubDoc } from './subdoc';
export {
  serialize,
  parse,
  FILE_FORMAT,
  MAX_FILE_BYTES,
  type Result,
  type ParseError,
  type ParseErrorCode,
} from './serialize';
export { CURRENT_SCHEMA_VERSION } from './migrations';
export { IDENTITY, applyAffine, translation, rotation, scaling } from './geometry';
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
export {
  historyToRecord,
  historyFromRecord,
  type HistoryRecord,
  type StepRecord,
  type PatchRecord,
} from './history-record';
export { checkInvariants, type InvariantCode, type InvariantViolation } from './invariants';
