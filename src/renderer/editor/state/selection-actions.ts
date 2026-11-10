/**
 * Summary of the scope (the selection, or the whole document when nothing is selected) that
 * decides which selection actions are enabled. Computed by later tasks from doc and perception.
 */
export interface SelectionScope {
  /** A fragment with at least two atoms. */
  hasFragment: boolean;
  /** An order-1.5 aromatic bond. */
  hasAromatic15: boolean;
  /** An aromatic bond that is not order 1.5 (rule R11). */
  hasAromaticNon15: boolean;
  /** The document has a straight arrow. */
  hasArrow: boolean;
  /** The selection is non-empty. */
  hasSelection: boolean;
  /** The selection contains an abbreviation atom. */
  hasAbbreviation: boolean;
}

export const EMPTY_SCOPE: SelectionScope = {
  hasFragment: false,
  hasAromatic15: false,
  hasAromaticNon15: false,
  hasArrow: false,
  hasSelection: false,
  hasAbbreviation: false,
};

export interface ActionState {
  enabled: boolean;
  /** Tooltip help line saying why it is disabled. */
  help: string;
}

export interface SelectionActions {
  cleanUp: ActionState;
  kekule: ActionState & { mode: 'kekule' | 'circle' };
  tidy: ActionState;
  flip: ActionState;
  /** Rendered only when true; always enabled then. */
  expand: boolean;
}

/** SPEC-editor.md "Selection actions" enablement table. */
export function selectionActions(scope: SelectionScope): SelectionActions {
  const mode = !scope.hasAromatic15 && scope.hasAromaticNon15 ? 'circle' : 'kekule';
  return {
    cleanUp: { enabled: scope.hasFragment, help: 'Draw a molecule first.' },
    kekule: {
      mode,
      enabled: scope.hasAromatic15 || scope.hasAromaticNon15,
      help: 'No benzene ring here.',
    },
    tidy: { enabled: scope.hasArrow, help: 'Draw an arrow first.' },
    flip: { enabled: scope.hasSelection, help: 'Select a molecule first.' },
    expand: scope.hasAbbreviation,
  };
}
