import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { CopyButton, type CopyDisabledReason } from '../clipboard-export/CopyButton';
import { ExportDialog } from '../clipboard-export/ExportDialog';
import { PDF_OUTCOME } from '../clipboard-export/model/export-flow';
import type { CopyFlow } from '../clipboard-export/model/copy-flow';
import { Editor, type EditorController } from '../editor';
import { installHostKeys } from './host-keys';
import { createTestHook } from './model/test-hook';

import type { WindowHost } from './host';
import sprite from './shell-icons.svg?raw';
import './shell-tokens.css';

export function App({ host }: { host: WindowHost }): React.JSX.Element {
  const { controller, copyFlow, exportFlow, fileFlows } = host;
  useEffect(
    () =>
      installHostKeys(
        controller,
        fileFlows,
        {
          'copy-whole': () => {
            void copyFlow.copy();
          },
          paste: () => {
            void copyFlow.paste();
          },
          new: () => {
            void fileFlows.newDrawing();
          },
          open: () => {
            void fileFlows.open();
          },
          save: () => {
            void fileFlows.save();
          },
          'save-as': () => {
            void fileFlows.saveAs();
          },
          export: () => {
            exportFlow.open();
          },
        },
        // K1: while the Export dialog is open no host key acts.
        () => exportFlow.state() !== null,
      ),
    [controller, copyFlow, exportFlow, fileFlows],
  );
  const exportState = useSyncExternalStore(exportFlow.subscribe, exportFlow.state);
  useEffect(() => {
    const stopMain = window.chalkbond.onMainEvent((event) => {
      if (event.type === 'command') host.commands.push(event.command);
      else if (event.type === 'close-requested') void fileFlows.requestClose();
      else if (event.type === 'open') void fileFlows.openRef(event.ref);
    });
    host.publishSession();
    const stopController = controller.subscribe((event) => {
      if (event.type === 'doc' || event.type === 'dirty') host.publishSession();
    });
    return () => {
      stopController();
      stopMain();
    };
  }, [controller, fileFlows, host]);
  // The e2e test hook (TH2): main loads the page with `?testHooks=1` only for an unpackaged build
  // started with `--chalkbond-test-hooks`. Without the query nothing is defined.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('testHooks') !== '1') return undefined;
    const hook = createTestHook(controller, host.commands, (doc) => host.loadUntitled(doc));
    Object.defineProperty(window, '__chalkbondTest', {
      value: hook,
      configurable: true,
    });
    return () => {
      hook.dispose();
      Reflect.deleteProperty(window, '__chalkbondTest');
    };
  }, [controller, host]);
  // One element for the window's lifetime: the Copy button re-renders itself, not the editor.
  const actions = useMemo(
    () => <CopyAction controller={controller} copyFlow={copyFlow} />,
    [controller, copyFlow],
  );
  return (
    <div className="app" data-testid="canvas-area">
      <div className="sprite" aria-hidden="true" dangerouslySetInnerHTML={{ __html: sprite }} />
      <Editor controller={controller} actions={actions} />
      {exportState && (
        <ExportDialog
          state={exportState}
          pdfOutcome={PDF_OUTCOME}
          onChoose={(change) => exportFlow.choose(change)}
          onCancel={() => exportFlow.cancel()}
          onSave={() => {
            void exportFlow.save();
          }}
        />
      )}
    </div>
  );
}

/** Why Copy is disabled now, or null (SPEC-clipboard-export.md "Copy button", Disabled row). */
function copyDisabledReason(controller: EditorController): CopyDisabledReason | null {
  const doc = controller.getDoc();
  if (!controller.canRun('focus-name-field')) return 'typing'; // a label or text editor is open
  if (!controller.canRun({ type: 'set-preset', preset: 'slides' })) return 'busy';
  if (Object.keys(doc.atoms).length === 0 && Object.keys(doc.objects).length === 0) return 'empty';
  return null;
}

/** Content narrower than 1100 px (O1): the label-only Copy. */
function useCompact(): boolean {
  const [compact, setCompact] = useState(() => window.innerWidth < 1100);
  useEffect(() => {
    const update = (): void => setCompact(window.innerWidth < 1100);
    window.addEventListener('resize', update);
    update(); // a resize between the first render and this effect would otherwise be missed
    return () => window.removeEventListener('resize', update);
  }, []);
  return compact;
}

function CopyAction({
  controller,
  copyFlow,
}: {
  controller: EditorController;
  copyFlow: CopyFlow;
}): React.JSX.Element {
  const subscribe = useCallback(
    (changed: () => void) =>
      controller.subscribe((event) => {
        if (event.type === 'doc' || event.type === 'busy') changed();
      }),
    [controller],
  );
  const reason = useSyncExternalStore(subscribe, () => copyDisabledReason(controller));
  const copied = useSyncExternalStore(copyFlow.subscribe, copyFlow.copied);
  const compact = useCompact();
  return (
    <CopyButton
      copied={copied}
      compact={compact}
      reason={reason}
      onCopy={() => {
        void copyFlow.copy();
      }}
    />
  );
}
