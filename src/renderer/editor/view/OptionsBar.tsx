import { Fragment } from 'react';
import { isVariantTool, OPTIONS } from '../state/catalog';
import type { EditorState } from '../state/editor-state';
import type { EditorAction } from '../state/reducer';
import {
  selectionActions,
  type ActionState,
  type SelectionScope,
} from '../state/selection-actions';
import { Icon } from './Icon';

interface OptionsBarProps {
  state: EditorState;
  scope: SelectionScope;
  dispatch: (action: EditorAction) => void;
}

function Separator(): React.JSX.Element {
  return <div className="options-sep" role="separator" />;
}

/** An icon + label action button; disabled ones keep their help line for the tooltip. */
function ActionButton(props: {
  id: string;
  icon: string;
  label: string;
  state: ActionState;
  className?: string;
}): React.JSX.Element {
  const { id, icon, label, state, className } = props;
  return (
    <button
      type="button"
      className={className === undefined ? 'btn btn-action' : `btn btn-action ${className}`}
      data-testid={id}
      aria-disabled={state.enabled ? undefined : true}
      data-help={state.enabled ? undefined : state.help}
    >
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );
}

function FlipButton(props: { id: string; label: string; state: ActionState }): React.JSX.Element {
  const { id, label, state } = props;
  return (
    <button
      type="button"
      className="btn btn-opt"
      data-testid={id}
      aria-label={label}
      aria-disabled={state.enabled ? undefined : true}
      data-help={state.enabled ? undefined : state.help}
    >
      <Icon name={id === 'act-flip-h' ? 'flip-h' : 'flip-v'} size={20} />
    </button>
  );
}

function SelectionBar({ scope }: { scope: SelectionScope }): React.JSX.Element {
  const a = selectionActions(scope);
  return (
    <>
      <ActionButton id="act-clean" icon="clean-up" label="Clean up" state={a.cleanUp} />
      <ActionButton
        id="act-kekule"
        icon={a.kekule.mode === 'kekule' ? 'show-kekule' : 'show-circle'}
        label={a.kekule.mode === 'kekule' ? 'Show Kekulé' : 'Show circle'}
        state={a.kekule}
        className="btn-kekule"
      />
      <ActionButton id="act-tidy" icon="tidy" label="Tidy reaction" state={a.tidy} />
      <Separator />
      <FlipButton id="act-flip-h" label="Flip horizontal" state={a.flip} />
      <FlipButton id="act-flip-v" label="Flip vertical" state={a.flip} />
      {a.expand && (
        <>
          <Separator />
          <ActionButton
            id="act-expand"
            icon="expand"
            label="Expand"
            state={{ enabled: true, help: '' }}
          />
        </>
      )}
    </>
  );
}

/**
 * The tool options in the top bar: the active tool's variants, or the selection actions for
 * Select. A mouse press does not take focus (K5).
 */
export function OptionsBar({ state, scope, dispatch }: OptionsBarProps): React.JSX.Element {
  const tool = state.tool;
  return (
    <div
      className="options"
      data-testid="options"
      role="toolbar"
      aria-label="Tool options"
      onMouseDown={(e) => {
        e.preventDefault();
      }}
    >
      {tool === 'select' && <SelectionBar scope={scope} />}
      {isVariantTool(tool) &&
        OPTIONS[tool].map((o) => (
          <Fragment key={o.id}>
            {o.separatorBefore === true && <Separator />}
            <button
              type="button"
              className={o.glyph === undefined ? 'btn btn-opt' : 'btn btn-opt text'}
              data-testid={`opt-${o.id}`}
              aria-label={o.label}
              aria-pressed={state.variants[tool] === o.id}
              onClick={() => {
                dispatch({ type: 'select-variant', tool, variant: o.id });
              }}
            >
              {o.glyph ?? <Icon name={o.icon ?? ''} size={20} />}
            </button>
          </Fragment>
        ))}
    </div>
  );
}
