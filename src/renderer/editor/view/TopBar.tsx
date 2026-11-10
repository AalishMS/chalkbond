import type { EditorState } from '../state/editor-state';
import type { EditorAction } from '../state/reducer';
import type { SelectionScope } from '../state/selection-actions';
import { HISTORY_EMPTY_HELP, HISTORY_TIPS } from '../state/tips';
import { Icon } from './Icon';
import { NameField } from './NameField';
import { OptionsBar } from './OptionsBar';
import { tipProps } from './Tooltip';

interface TopBarProps {
  state: EditorState;
  scope: SelectionScope;
  canUndo: boolean;
  canRedo: boolean;
  dispatch: (action: EditorAction) => void;
}

function HistoryButton(props: {
  id: 'undo' | 'redo';
  label: string;
  icon: string;
  enabled: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const tip = HISTORY_TIPS[props.id];
  return (
    <button
      type="button"
      className="btn btn-top"
      data-testid={props.id}
      aria-label={props.label}
      aria-disabled={props.enabled ? undefined : true}
      onClick={props.enabled ? props.onPress : undefined}
      {...tipProps(props.enabled ? tip : { ...tip, help: HISTORY_EMPTY_HELP[props.id] }, 'below')}
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
        <HistoryButton
          id="undo"
          label="Undo (Ctrl+Z)"
          icon="undo"
          enabled={canUndo}
          onPress={() => dispatch({ type: 'undo' })}
        />
        <HistoryButton
          id="redo"
          label="Redo (Ctrl+Y)"
          icon="redo"
          enabled={canRedo}
          onPress={() => dispatch({ type: 'redo' })}
        />
      </div>
    </header>
  );
}
