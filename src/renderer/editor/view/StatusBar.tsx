import type { Formula } from '@core/chem-core';
import type { StylePreset } from '@core/doc-model';
import { formulaRuns } from '../model/formula';
import { stepZoom, zoomPercent } from '../model/viewport';
import { EDITOR_HINTS, hintFor, NAME_FIELD_HINT } from '../state/catalog';
import type { Hit, Notice, ToolId } from '../state/editor-state';
import type { EditorAction } from '../state/reducer';
import { STATUS_TIPS, type TipContent } from '../state/tips';
import { FormulaText } from './FormulaText';
import { Icon } from './Icon';
import { PRESET_LABELS } from '../state/preset';
import { pressKeepsFocus } from './press';
import { tipProps } from './Tooltip';

/** Id of the hint slot; the canvas is described by it. */
export const HINT_ID = 'editor-hint';

interface StatusBarProps {
  tool: ToolId;
  preset: StylePreset;
  /** The selection's or the single fragment's formula (C5); no slot when null. */
  formula?: Formula | null;
  /** The viewport zoom (1 = 100 %), shown in the readout. */
  zoom: number;
  dispatch: (action: EditorAction) => void;
  /** The item under the pointer: an atom or a bond changes the hint (K2). */
  hover?: Hit | null;
  /** Kind of the running gesture, if any: a bond drag changes the hint. */
  gesture?: string | null;
  /** How many warnings the document has (C6); the button shows only when there are some. */
  warnings?: number;
  /** An editor is open: its hint replaces the tool's. */
  editing?: 'label' | 'text' | null;
  /** The name field has focus: its hint replaces the tool's. */
  nameFieldFocused?: boolean;
  /** Replaces the hint while set (X1 and the other notices). */
  notice?: Notice | null;
}

function ZoomButton(props: {
  id: string;
  label: string;
  tip: TipContent;
  className?: string;
  /** Greyed (`aria-disabled`) and inert; the tooltip still shows. */
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const extra = props.className === undefined ? '' : ` ${props.className}`;
  return (
    <button
      type="button"
      className={`btn btn-status${extra}`}
      data-testid={props.id}
      aria-label={props.label}
      aria-disabled={props.disabled === true ? true : undefined}
      onClick={props.disabled === true ? undefined : props.onPress}
      {...tipProps(props.tip, 'above')}
    >
      {props.children}
    </button>
  );
}

const PRESET_IDS: Record<StylePreset, string> = { slides: 'slides', journal: 'handout' };

/**
 * The radio group's keys, as native radios have them: an arrow moves to the other of the two
 * options (wrapping), Home and End go to the first and the last. Null for any other key.
 */
export function presetForKey(key: string, current: StylePreset): StylePreset | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowUp':
      return current === 'slides' ? 'journal' : 'slides';
    case 'Home':
      return 'slides';
    case 'End':
      return 'journal';
    default:
      return null;
  }
}

/** Hint, formula, preset switch and zoom cluster. */
export function StatusBar({
  tool,
  preset,
  zoom,
  dispatch,
  formula = null,
  warnings = 0,
  nameFieldFocused = false,
  editing = null,
  hover = null,
  gesture = null,
  notice = null,
}: StatusBarProps): React.JSX.Element {
  return (
    <footer className="statusbar" data-testid="statusbar">
      <div
        className={notice === null ? 'hint' : `hint hint-${notice.kind}`}
        id={HINT_ID}
        role="status"
        aria-live="polite"
      >
        {notice === null ? (
          nameFieldFocused ? (
            NAME_FIELD_HINT
          ) : editing !== null ? (
            EDITOR_HINTS[editing]
          ) : (
            hintFor(tool, hover, gesture)
          )
        ) : (
          <>
            {notice.kind === 'error' && <Icon name="warning" size={16} />}
            <span className="hint-text">{notice.text}</span>
          </>
        )}
      </div>
      {formula !== null && (
        <div className="formula" data-testid="formula">
          <FormulaText runs={formulaRuns(formula.hill, formula.charge)} />
          {formula.mw === null ? '' : ` · ${formula.mw.toFixed(2)} g/mol`}
        </div>
      )}
      {warnings > 0 && (
        <button
          type="button"
          className="btn btn-status btn-warnings"
          data-testid="warnings"
          aria-label={`${warnings} warning${warnings === 1 ? '' : 's'}`}
          onMouseDown={pressKeepsFocus}
          onClick={() => dispatch({ type: 'show-warning' })}
          {...tipProps(
            {
              title: `${warnings} warning${warnings === 1 ? '' : 's'}`,
              help: 'Click to select the next one.',
            },
            'above',
          )}
        >
          <Icon name="warning" size={16} />
          <span>{warnings}</span>
        </button>
      )}
      <div
        className="segmented"
        role="radiogroup"
        aria-label="Style"
        onMouseDown={pressKeepsFocus}
        onKeyDown={(e) => {
          const next = presetForKey(e.key, preset);
          if (next === null) return;
          e.preventDefault();
          if (next !== preset) dispatch({ type: 'set-preset', preset: next });
          e.currentTarget
            .querySelector<HTMLElement>(`[data-testid="preset-${PRESET_IDS[next]}"]`)
            ?.focus();
        }}
      >
        {(['slides', 'journal'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={preset === p}
            tabIndex={preset === p ? 0 : -1}
            className="btn btn-status"
            data-testid={`preset-${PRESET_IDS[p]}`}
            onClick={() => dispatch({ type: 'set-preset', preset: p })}
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>
      <div className="zoom" onMouseDown={pressKeepsFocus}>
        <ZoomButton
          id="zoom-out"
          label="Zoom out (Ctrl+−)"
          tip={STATUS_TIPS.zoomOut}
          disabled={stepZoom(zoom, -1) === zoom}
          onPress={() => dispatch({ type: 'zoom-step', dir: -1 })}
        >
          <Icon name="zoom-out" size={16} />
        </ZoomButton>
        <ZoomButton
          id="zoom-reset"
          label="Zoom to 100%"
          tip={STATUS_TIPS.zoomReset}
          className="btn-zoom"
          onPress={() => dispatch({ type: 'zoom-reset' })}
        >
          {zoomPercent(zoom)}%
        </ZoomButton>
        <ZoomButton
          id="zoom-in"
          label="Zoom in (Ctrl+=)"
          tip={STATUS_TIPS.zoomIn}
          disabled={stepZoom(zoom, 1) === zoom}
          onPress={() => dispatch({ type: 'zoom-step', dir: 1 })}
        >
          <Icon name="zoom-in" size={16} />
        </ZoomButton>
        <ZoomButton
          id="zoom-fit"
          label="Zoom to fit (Ctrl+0)"
          tip={STATUS_TIPS.zoomFit}
          onPress={() => dispatch({ type: 'zoom-fit' })}
        >
          <Icon name="fit" size={16} />
        </ZoomButton>
      </div>
    </footer>
  );
}
