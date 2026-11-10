import type { Formula } from '@core/chem-core';
import type { StylePreset } from '@core/doc-model';
import { formulaRuns } from '../model/formula';
import { stepZoom, zoomPercent } from '../model/viewport';
import { hintFor, NAME_FIELD_HINT } from '../state/catalog';
import type { Hit, Notice, ToolId } from '../state/editor-state';
import type { EditorAction } from '../state/reducer';
import { STATUS_TIPS, type TipContent } from '../state/tips';
import { FormulaText } from './FormulaText';
import { Icon } from './Icon';
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

/** Hint, formula, preset switch and zoom cluster. The preset switch is a no-op until E30. */
export function StatusBar({
  tool,
  preset,
  zoom,
  dispatch,
  formula = null,
  nameFieldFocused = false,
  hover = null,
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
          ) : (
            hintFor(tool, hover)
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
      <div className="segmented" role="group" aria-label="Style" onMouseDown={pressKeepsFocus}>
        <button
          type="button"
          className="btn btn-status"
          data-testid="preset-slides"
          aria-pressed={preset === 'slides'}
        >
          Slides
        </button>
        <button
          type="button"
          className="btn btn-status"
          data-testid="preset-handout"
          aria-pressed={preset === 'journal'}
        >
          Handout
        </button>
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
          label="Reset zoom (Ctrl+1)"
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
