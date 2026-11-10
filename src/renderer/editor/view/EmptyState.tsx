import type { EditorAction } from '../state/reducer';

const CHIPS = ['ethanol', 'benzene', 'ethanol + acetic acid -> ethyl acetate + water'];

interface EmptyStateProps {
  dispatch: (action: EditorAction) => void;
}

/**
 * Shown in the canvas while the document is empty. A chip runs its text through the name field
 * (N4) and hands the focus to the canvas, since the chip is about to leave the page.
 */
export function EmptyState({ dispatch }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="empty" data-testid="empty-state">
      <svg className="empty-art" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4L18.93 8V16L12 20L5.07 16V8Z" />
        <circle cx="12" cy="12" r="4.2" />
      </svg>
      <p className="empty-text">Type a compound name above, or click anywhere to start drawing.</p>
      <div className="empty-try">
        <span>Try:</span>
        {CHIPS.map((text) => (
          <button
            key={text}
            type="button"
            className="chip"
            onClick={(e) => {
              const canvas = e.currentTarget.closest<HTMLElement>('.canvas');
              dispatch({ type: 'insert-text', text });
              canvas?.focus();
            }}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
