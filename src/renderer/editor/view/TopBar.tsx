import type { EditorState } from '../state/editor-state';
import type { EditorAction } from '../state/reducer';
import type { SelectionScope } from '../state/selection-actions';
import { Icon } from './Icon';
import { NameField } from './NameField';
import { OptionsBar } from './OptionsBar';

interface TopBarProps {
  state: EditorState;
  scope: SelectionScope;
  canUndo: boolean;
  canRedo: boolean;
  dispatch: (action: EditorAction) => void;
}

function HistoryButton(props: {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="btn btn-top"
      data-testid={props.id}
      aria-label={props.label}
      aria-disabled={props.enabled ? undefined : true}
    >
      <Icon name={props.icon} size={20} />
    </button>
  );
}

/** Name field, divider, tool options, Undo and Redo. */
export function TopBar({
  state,
  scope,
  canUndo,
  canRedo,
  dispatch,
}: TopBarProps): React.JSX.Element {
  return (
    <header className="topbar" data-testid="topbar">
      <NameField />
      <div className="divider-v" role="separator" />
      <OptionsBar state={state} scope={scope} dispatch={dispatch} />
      <div className="history">
        <HistoryButton id="undo" label="Undo (Ctrl+Z)" icon="undo" enabled={canUndo} />
        <HistoryButton id="redo" label="Redo (Ctrl+Y)" icon="redo" enabled={canRedo} />
      </div>
    </header>
  );
}
