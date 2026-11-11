// The Keyboard shortcuts dialog (SPEC-app-shell.md "Keyboard shortcuts dialog"; mock-up A12) on
// the dialog shell (V3): the list scrolls with an always-visible thin bar and ends on a rule above
// the fixed footer; Close, Enter, Esc and a scrim click close it; focus returns where it was.
import { Fragment } from 'react';
import { keyParts, SHORTCUTS } from './model/shortcuts';
import { Button, Dialog, Kbd } from './ui/primitives';

function Keys({ keys }: { keys: readonly string[] }): React.JSX.Element {
  return (
    <span className="keys">
      {keys.map((combo, i) => (
        <Fragment key={i}>
          {keyParts(combo).map((part, j) => (
            <Fragment key={j}>
              {j > 0 && <span aria-hidden="true">+</span>}
              {part.kind === 'key' ? <Kbd>{part.text}</Kbd> : <span>{part.text}</span>}
            </Fragment>
          ))}
        </Fragment>
      ))}
    </span>
  );
}

export function ShortcutsDialog({ onClose }: { onClose(): void }): React.JSX.Element {
  return (
    <Dialog
      title="Keyboard shortcuts"
      testId="shortcuts-dialog"
      width={560}
      className="shortcuts"
      onCancel={onClose}
      onEnter={onClose}
      footer={
        <Button data-testid="shortcuts-close" onClick={onClose}>
          Close
        </Button>
      }
    >
      {SHORTCUTS.map(({ section, rows }) => (
        <Fragment key={section}>
          <h3 className="sc-section">{section}</h3>
          {rows.map((row) => (
            <div className="sc-row" key={`${row.keys.join(' ')} ${row.meaning}`}>
              <Keys keys={row.keys} />
              <span className="sc-meaning">{row.meaning}</span>
            </div>
          ))}
        </Fragment>
      ))}
    </Dialog>
  );
}
