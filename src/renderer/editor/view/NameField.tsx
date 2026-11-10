import { formulaRuns } from '../model/formula';
import { chipText, type SuggestionRow } from '../model/suggestions';
import type { NameField as NameFieldState } from '../state/editor-state';
import type { EditorAction } from '../state/reducer';
import { FormulaText } from './FormulaText';
import { Icon } from './Icon';

/** Id of the suggestion list, for `aria-controls`. */
const LIST_ID = 'name-suggestions';
const rowId = (i: number): string => `name-row-${i}`;

interface NameFieldProps {
  field: NameFieldState;
  /** N1 rows for the typed text; empty while the dropdown is closed. */
  rows: readonly SuggestionRow[];
  dispatch: (action: EditorAction) => void;
}

/** Focus the canvas of the editor `from` belongs to (the Esc ladder's last step, K5). */
function focusCanvas(from: HTMLElement): void {
  from.closest('.editor')?.querySelector<HTMLElement>('.canvas')?.focus();
}

/** A press on a row or chip must not take focus from the field (K5: it stays focused). */
const keepFocus = (e: React.MouseEvent): void => e.preventDefault();

/**
 * The compound-name field with its dropdown (SPEC-editor.md N1, N2, K5): suggestion rows while
 * typing, the not-found panel with "Did you mean" chips after a failed insert.
 */
export function NameField({ field, rows, dispatch }: NameFieldProps): React.JSX.Element {
  const showRows = field.open && rows.length > 0;
  const error = field.error;
  const insertName = (text: string): void => dispatch({ type: 'insert-text', text });

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault();
        dispatch({ type: 'name-highlight', dir: e.key === 'ArrowDown' ? 1 : -1 });
        break;
      case 'Enter':
        e.preventDefault();
        dispatch({ type: 'name-enter' });
        break;
      case 'Escape':
        e.preventDefault();
        if (field.open || field.error !== null) dispatch({ type: 'name-dismiss' });
        else if (field.text !== '') dispatch({ type: 'name-clear' });
        else focusCanvas(e.currentTarget);
        break;
    }
  };

  return (
    <>
      <label
        className={field.error === null ? 'namefield' : 'namefield is-notfound'}
        data-testid="namefield"
      >
        <Icon name="search" size={20} />
        <input
          type="text"
          role="combobox"
          aria-label="Compound name"
          aria-autocomplete="list"
          aria-expanded={showRows}
          aria-controls={LIST_ID}
          aria-activedescendant={showRows ? rowId(field.highlighted) : undefined}
          data-testid="namefield-input"
          placeholder="Type a compound name…"
          autoComplete="off"
          spellCheck={false}
          value={field.text}
          onChange={(e) => dispatch({ type: 'name-text', text: e.currentTarget.value })}
          onKeyDown={onKeyDown}
        />
      </label>
      {showRows && (
        <div className="dropdown" role="listbox" aria-label="Suggestions" id={LIST_ID}>
          {rows.map((row, i) => (
            <div
              key={row.entry.name}
              className="dropdown-row"
              id={rowId(i)}
              role="option"
              data-testid="name-row"
              aria-selected={i === field.highlighted}
              onMouseDown={keepFocus}
              onClick={() => insertName(row.entry.name)}
            >
              <span className="dropdown-name">
                <b>{row.bold}</b>
                {row.rest}
                {row.alias !== null && <span className="dropdown-alias">{` — ${row.alias}`}</span>}
              </span>
              <span className="dropdown-formula">
                <FormulaText runs={formulaRuns(row.entry.formula)} />
              </span>
            </div>
          ))}
        </div>
      )}
      {error !== null && (
        <div className="dropdown" role="alert" data-testid="name-notfound">
          <div className="notfound">
            <Icon name="warning" size={20} />
            <span>{error.message}</span>
          </div>
          {error.suggestions.length > 0 && (
            <div className="suggest">
              Did you mean
              <div className="suggest-chips">
                {error.suggestions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="chip"
                    data-testid="name-chip"
                    onMouseDown={keepFocus}
                    onClick={() => insertName(chipText(field.text, error, name))}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
