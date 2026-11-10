const CHIPS = ['ethanol', 'benzene', 'ethanol + acetic acid -> ethyl acetate + water'];

/** Shown in the canvas while the document is empty. Chips are no-ops until E13. */
export function EmptyState(): React.JSX.Element {
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
          <button key={text} type="button" className="chip">
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
