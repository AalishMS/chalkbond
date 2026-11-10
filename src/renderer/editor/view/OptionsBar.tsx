import { Fragment } from 'react';
import { isVariantTool, OPTIONS } from '../state/catalog';
import type { EditorState } from '../state/editor-state';
import type { EditorAction } from '../state/reducer';
import {
  selectionActions,
  type ActionState,
  type SelectionScope,
} from '../state/selection-actions';
import { scriptAtCaret } from '../model/text-edit';
import { actionTip, optionTip, TEXT_OPTION_TIPS } from '../state/tips';
import { Icon } from './Icon';
import { pressKeepsFocus } from './press';
import { tipProps } from './Tooltip';
import { useRoving, type Roving } from './use-roving';

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
  roving: Roving;
  /** Shortcut shown in the tooltip. */
  shortcut?: string;
  className?: string;
  /** Runs when the button is pressed and enabled. */
  onPress?: () => void;
}): React.JSX.Element {
  const { id, icon, label, state, roving, shortcut, className, onPress } = props;
  return (
    <button
      type="button"
      className={className === undefined ? 'btn btn-action' : `btn btn-action ${className}`}
      data-testid={id}
      aria-disabled={state.enabled ? undefined : true}
      {...roving.item(id)}
      {...tipProps(actionTip(label, shortcut, state), 'below')}
      onClick={() => {
        // A disabled button stays focusable (aria-disabled), so the click is checked here.
        if (state.enabled) onPress?.();
      }}
    >
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );
}

function FlipButton(props: {
  id: string;
  label: string;
  state: ActionState;
  roving: Roving;
  dispatch: (action: EditorAction) => void;
}): React.JSX.Element {
  const { id, label, state, roving, dispatch } = props;
  return (
    <button
      type="button"
      className="btn btn-opt"
      data-testid={id}
      aria-label={label}
      aria-disabled={state.enabled ? undefined : true}
      {...roving.item(id)}
      {...tipProps(actionTip(label, undefined, state), 'below')}
      onClick={() => {
        // A disabled button stays focusable (aria-disabled), so the click is checked here.
        if (state.enabled) dispatch({ type: 'flip', axis: id === 'act-flip-h' ? 'h' : 'v' });
      }}
    >
      <Icon name={id === 'act-flip-h' ? 'flip-h' : 'flip-v'} size={20} />
    </button>
  );
}

function SelectionBar({
  scope,
  roving,
  dispatch,
}: {
  scope: SelectionScope;
  roving: Roving;
  dispatch: (action: EditorAction) => void;
}): React.JSX.Element {
  const a = selectionActions(scope);
  return (
    <>
      <ActionButton
        id="act-clean"
        icon="clean-up"
        label="Clean up"
        state={a.cleanUp}
        roving={roving}
        shortcut="Ctrl+Shift+L"
        onPress={() => dispatch({ type: 'clean-up' })}
      />
      <ActionButton
        id="act-kekule"
        icon={a.kekule.mode === 'kekule' ? 'show-kekule' : 'show-circle'}
        label={a.kekule.mode === 'kekule' ? 'Show Kekulé' : 'Show circle'}
        state={a.kekule}
        roving={roving}
        shortcut="Ctrl+Shift+K"
        className="btn-kekule"
        onPress={() => dispatch({ type: 'toggle-kekule' })}
      />
      <ActionButton
        id="act-tidy"
        icon="tidy"
        label="Tidy reaction"
        state={a.tidy}
        roving={roving}
        shortcut="Ctrl+Shift+T"
        onPress={() => dispatch({ type: 'tidy' })}
      />
      <Separator />
      <FlipButton
        id="act-flip-h"
        label="Flip horizontal"
        state={a.flip}
        roving={roving}
        dispatch={dispatch}
      />
      <FlipButton
        id="act-flip-v"
        label="Flip vertical"
        state={a.flip}
        roving={roving}
        dispatch={dispatch}
      />
      {a.expand && (
        <>
          <Separator />
          <ActionButton
            id="act-expand"
            icon="expand"
            label="Expand"
            state={{ enabled: true, help: '' }}
            roving={roving}
            onPress={() => dispatch({ type: 'expand' })}
          />
        </>
      )}
    </>
  );
}

type TextButton = keyof typeof TEXT_OPTION_TIPS;

/**
 * T5: the options while a text editor is open (screen 09): x2, x2, B, I, then Insert Δ hν ° →.
 * The four toggles show the model's state at the caret or selection.
 */
function TextOptions({
  editing,
  roving,
  dispatch,
}: {
  editing: Extract<NonNullable<EditorState['editing']>, { kind: 'text' }>;
  roving: Roving;
  dispatch: (action: EditorAction) => void;
}): React.JSX.Element {
  const script = scriptAtCaret(editing.edit);
  const button = (
    id: TextButton,
    label: string,
    content: React.ReactNode,
    onPress: () => void,
    pressed?: boolean,
    glyph = false,
  ): React.JSX.Element => (
    <button
      key={id}
      type="button"
      className={glyph ? 'btn btn-opt text' : 'btn btn-opt'}
      data-testid={id}
      aria-label={label}
      aria-pressed={pressed}
      {...roving.item(id)}
      {...tipProps(TEXT_OPTION_TIPS[id], 'below')}
      onClick={onPress}
    >
      {content}
    </button>
  );
  const insert = (text: string) => (): void => dispatch({ type: 'edit-insert', text });
  return (
    <>
      {button(
        'txt-sub',
        'Subscript',
        <>
          x<span className="sub">2</span>
        </>,
        () => dispatch({ type: 'edit-script', script: 'sub' }),
        script === 'sub',
        true,
      )}
      {button(
        'txt-sup',
        'Superscript',
        <>
          x<span className="sup">2</span>
        </>,
        () => dispatch({ type: 'edit-script', script: 'sup' }),
        script === 'sup',
        true,
      )}
      {button(
        'txt-bold',
        'Bold',
        'B',
        () => dispatch({ type: 'edit-style', flag: 'bold' }),
        editing.bold,
        true,
      )}
      {button(
        'txt-italic',
        'Italic',
        <i>I</i>,
        () => dispatch({ type: 'edit-style', flag: 'italic' }),
        editing.italic,
        true,
      )}
      <Separator />
      <span className="options-caption">Insert</span>
      {button('txt-delta', 'Insert Δ (heat)', 'Δ', insert('Δ'), undefined, true)}
      {button('txt-hv', 'Insert hν (light)', 'hν', insert('hν'), undefined, true)}
      {button('txt-deg', 'Insert °', <Icon name="glyph-degree" size={20} />, insert('°'))}
      {button('txt-arrow', 'Insert →', <Icon name="glyph-arrow" size={20} />, insert('→'))}
    </>
  );
}

/**
 * The tool options in the top bar: the active tool's variants, or the selection actions for
 * Select. A mouse press does not take focus (K5).
 */
export function OptionsBar({ state, scope, dispatch }: OptionsBarProps): React.JSX.Element {
  const tool = state.tool;
  const variant = isVariantTool(tool) ? state.variants[tool] : '';
  const textEditing = state.editing?.kind === 'text' ? state.editing : null;
  const roving = useRoving(
    'horizontal',
    textEditing !== null ? 'txt-sub' : isVariantTool(tool) ? variant : 'act-clean',
    textEditing !== null ? 'text-editing' : `${tool}:${variant}`,
  );
  return (
    <div
      className="options"
      data-testid="options"
      role="toolbar"
      aria-label="Tool options"
      onMouseDown={pressKeepsFocus}
      onKeyDown={roving.onKeyDown}
    >
      {textEditing !== null && (
        <TextOptions editing={textEditing} roving={roving} dispatch={dispatch} />
      )}
      {textEditing === null && tool === 'select' && (
        <SelectionBar scope={scope} roving={roving} dispatch={dispatch} />
      )}
      {textEditing === null &&
        isVariantTool(tool) &&
        OPTIONS[tool].map((o) => (
          <Fragment key={o.id}>
            {o.separatorBefore === true && <Separator />}
            <button
              type="button"
              className={o.glyph === undefined ? 'btn btn-opt' : 'btn btn-opt text'}
              data-testid={`opt-${o.id}`}
              aria-label={o.label}
              aria-pressed={state.variants[tool] === o.id}
              {...roving.item(o.id)}
              {...tipProps(optionTip(o), 'below')}
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
