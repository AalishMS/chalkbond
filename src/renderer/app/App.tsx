import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { CopyButton, type CopyDisabledReason } from '../clipboard-export/CopyButton';
import { ExportDialog } from '../clipboard-export/ExportDialog';
import { ShortcutsDialog } from './ShortcutsDialog';
import { DropOverlay } from './DropOverlay';
import { installDropTarget } from './drop-target';
import { createDropTracker } from './model/drop';
import { PDF_OUTCOME } from '../clipboard-export/model/export-flow';
import type { CopyFlow } from '../clipboard-export/model/copy-flow';
import { Editor, type EditorController } from '../editor';
import { installHostKeys } from './host-keys';
import { TabStrip, tabDomId } from './TabStrip';
import { MenuButton } from './MenuButton';
import { createTestHook } from './model/test-hook';

import type { WindowHost } from './host';
import sprite from './shell-icons.svg?raw';
import './shell-tokens.css';

export function App({ host }: { host: WindowHost }): React.JSX.Element {
  const { controller, copyFlow, exportFlow } = host;
  useEffect(
    () =>
      installHostKeys(
        controller,
        host.tabFlows,
        host.hostActions,
        // K1: while an in-window dialog is open no host key acts.
        host.modal,
        // R40: Ctrl+Shift+T only while the reopen list has an entry.
        host.canReopen,
      ),
    [controller, host],
  );
  const exportState = useSyncExternalStore(exportFlow.subscribe, exportFlow.state);
  const shortcutsOpen = useSyncExternalStore(
    host.shortcutsDialog.subscribe,
    host.shortcutsDialog.open,
  );
  const activeId = useSyncExternalStore(
    host.tabsView.subscribe,
    () => host.tabsView.get().activeId,
  );
  useEffect(() => {
    const stopMain = window.chalkbond.onMainEvent((event) => host.handleMainEvent(event));
    host.publishSession();
    // CO5, SS7: the strip, the active tab, then the launch's file, once the view is mounted.
    void host.start();
    // N1 (title, menu) and the strip follow the editor, focus and dialogs, at most once per frame.
    const invalidate = host.invalidateMenu;
    const stopController = controller.subscribe((event) => {
      if (event.type === 'context-menu') void host.contextMenu(event);
      else if (event.type !== 'notice') invalidate();
    });
    // Zoom in / out enable at the ends of the range; the viewport sends no controller event.
    let zoom = controller.store.getState().viewport.zoom;
    const stopStore = controller.store.subscribe(() => {
      const next = controller.store.getState().viewport.zoom;
      if (next === zoom) return;
      zoom = next;
      invalidate();
    });
    const stopExport = exportFlow.subscribe(invalidate);
    const stopShortcuts = host.shortcutsDialog.subscribe(invalidate);
    const stopView = host.tabsView.subscribe(invalidate);
    // AS5 (c): the window regained focus: the active file tab is checked.
    const focused = (): void => void host.windowFocused();
    document.addEventListener('focusin', invalidate);
    document.addEventListener('focusout', invalidate);
    window.addEventListener('focus', focused);
    return () => {
      stopController();
      stopStore();
      stopExport();
      stopShortcuts();
      stopView();
      document.removeEventListener('focusin', invalidate);
      document.removeEventListener('focusout', invalidate);
      window.removeEventListener('focus', focused);
      host.cancelMenu();
      stopMain();
    };
  }, [controller, exportFlow, host]);
  // F12: the drop overlay follows window drag events; a drop goes to I3 through the preload.
  const drops = useMemo(() => createDropTracker(), []);
  useEffect(() => installDropTarget(window, drops, host), [drops, host]);
  const dropping = useSyncExternalStore(drops.subscribe, drops.visible);
  // The e2e test hook (TH2): main loads the page with `?testHooks=1` only for an unpackaged build
  // started with `--chalkbond-test-hooks`. Without the query nothing is defined.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('testHooks') !== '1') return undefined;
    const hook = createTestHook(
      controller,
      host.commands,
      (doc) => host.loadIntoActive(doc),
      host.hookTabs,
    );
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
  // R32, R56: the ☰ button in the editor's `menu` slot; it re-renders itself, not the editor.
  const menu = useMemo(() => <MenuButton host={host} />, [host]);
  // R31, R56: the strip in the editor's `tabs` slot; it re-renders itself, not the editor.
  const tabs = useMemo(() => <HostTabs host={host} />, [host]);
  return (
    <div className="app" data-testid="canvas-area">
      <div className="sprite" aria-hidden="true" dangerouslySetInnerHTML={{ __html: sprite }} />
      <Editor
        controller={controller}
        menu={menu}
        actions={actions}
        tabs={tabs}
        tabPanelLabelledBy={tabDomId(activeId)}
      />
      {shortcutsOpen && <ShortcutsDialog onClose={host.shortcutsDialog.close} />}
      {dropping && <DropOverlay />}
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

/**
 * The tab strip over the host's view (T2-T6) and callbacks (T7, T8, T11, T13, T15). T11's focus
 * rule: after a mouse click on a tab (or the + button) the canvas takes focus; after a key it stays
 * where it was. The strip says which one it was (`pointer`).
 */
function HostTabs({ host }: { host: WindowHost }): React.JSX.Element {
  const view = useSyncExternalStore(host.tabsView.subscribe, host.tabsView.get);
  return (
    <div className="app-tabs">
      <TabStrip
        tabs={view.tabs}
        activeId={view.activeId}
        onActivate={(id, pointer) => void host.tabs.activate(id, pointer)}
        onClose={(id) => void host.tabs.close(id)}
        onNew={(pointer) => void host.tabs.newTab(pointer)}
        onMove={(from, to) => host.tabs.move(from, to)}
        onTabMenu={(id, at) => void host.tabs.menu(id, at)}
      />
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
