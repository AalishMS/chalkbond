import type { StylePreset } from '@core/doc-model';
import { HINTS } from '../state/catalog';
import type { ToolId } from '../state/editor-state';
import { Icon } from './Icon';

interface StatusBarProps {
  tool: ToolId;
  preset: StylePreset;
  /** Formula and mass text; the slot is not rendered when empty. */
  formula?: string;
}

function ZoomButton(props: {
  id: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const extra = props.className === undefined ? '' : ` ${props.className}`;
  return (
    <button
      type="button"
      className={`btn btn-status${extra}`}
      data-testid={props.id}
      aria-label={props.label}
    >
      {props.children}
    </button>
  );
}

/** Hint, formula, preset switch and zoom cluster. Buttons are no-ops until later tasks. */
export function StatusBar({ tool, preset, formula = '' }: StatusBarProps): React.JSX.Element {
  return (
    <footer className="statusbar" data-testid="statusbar">
      <div className="hint" role="status" aria-live="polite">
        {HINTS[tool]}
      </div>
      {formula !== '' && (
        <div className="formula" data-testid="formula">
          {formula}
        </div>
      )}
      <div className="segmented" role="group" aria-label="Style">
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
      <div className="zoom">
        <ZoomButton id="zoom-out" label="Zoom out (Ctrl+−)">
          <Icon name="zoom-out" size={16} />
        </ZoomButton>
        <ZoomButton id="zoom-reset" label="Reset zoom (Ctrl+1)" className="btn-zoom">
          150%
        </ZoomButton>
        <ZoomButton id="zoom-in" label="Zoom in (Ctrl+=)">
          <Icon name="zoom-in" size={16} />
        </ZoomButton>
        <ZoomButton id="zoom-fit" label="Zoom to fit (Ctrl+0)">
          <Icon name="fit" size={16} />
        </ZoomButton>
      </div>
    </footer>
  );
}
