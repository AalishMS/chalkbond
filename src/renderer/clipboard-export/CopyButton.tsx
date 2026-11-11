// The Copy button (SPEC-clipboard-export.md "Copy button"), rendered by the host into the
// editor's actions slot. Its tooltip is the editor's: the data-tip attributes it reads.
import { Icon } from '../app/ui/primitives';
import './clipboard-export.css';

/** Why Copy is disabled: an empty drawing, a label or text editor open, a gesture running. */
export type CopyDisabledReason = 'empty' | 'typing' | 'busy';

const HELP: Record<CopyDisabledReason | 'idle', string> = {
  idle: 'Copies the selection, or the whole drawing, to paste into PowerPoint or Word.',
  empty: 'Draw something first.',
  typing: 'Press Enter to finish typing first.',
  busy: 'Copies the selection, or the whole drawing, to paste into PowerPoint or Word.',
};

export interface CopyButtonProps {
  /** "Copied" for 2 s after a successful copy. */
  copied: boolean;
  /** Content narrower than 1100 px: label only (O1, R6). */
  compact: boolean;
  reason: CopyDisabledReason | null;
  onCopy(): void;
}

export function CopyButton({
  copied,
  compact,
  reason,
  onCopy,
}: CopyButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={compact ? 'btn-copy is-compact' : 'btn-copy'}
      data-testid="copy"
      aria-label="Copy (Ctrl+C)"
      aria-disabled={reason !== null}
      data-tip="Copy"
      data-tip-key="Ctrl+C"
      data-tip-help={HELP[reason ?? 'idle']}
      // K5: a mouse press does not take the focus from the canvas.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (reason === null) onCopy();
      }}
    >
      {!compact && <Icon name={copied ? 'check' : 'copy'} />}
      <span aria-hidden="true">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
