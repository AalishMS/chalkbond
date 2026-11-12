import { createCopyFlow, type CopyFlow } from '../clipboard-export/model/copy-flow';
import { createExportFlow, createExportWriter } from '../clipboard-export/model/export-flow';
import { rasterise } from '../clipboard-export/rasterise';
import { emptyDoc, setStyle, type Doc } from '@core/doc-model';
import { createEditorController, type EditorCommand } from '../editor';
import { createFinishEditing, createFinishEditingNow, trackComposition } from './finish-editing';
import {
  createMenuScheduler,
  deriveMenuState,
  runAppCommand,
  type AppActions,
} from './model/menu-state';
import { isTextTarget } from './text-target';
import { createPresetMemory } from './model/preset-memory';
import {
  createTabFlows,
  type OpenRequest,
  type TabFlowController,
  type TabFlowMain,
} from './model/tab-flows';
import { createWriteSchedule } from './model/write-schedule';
import { windowTitleOf, type Sha256 } from './model/tab-status';
import { activeTab, byNumber, label, last, next, previous, type TabList } from './model/tabs';
import type { HookTab, HookTabs } from './model/test-hook';
import type { HostActions } from './host-keys';
import type { TabView } from './TabStrip';
import type { ChalkbondApi } from '../../preload/api';
import { CONTEXT_COMMANDS, type ContextCommand } from '../../shared/menu';
import type { HostHit } from '../editor';
import type { FileRef, MainEvent, RendererSettings, SessionUpdate } from '../../shared/ipc-types';

/** M3: a text target has focus (no document in node tests). */
const focusedText = (): boolean =>
  typeof document !== 'undefined' && isTextTarget(document.activeElement);

/** CM1: the canvas takes focus (from the name field) before its context menu is asked for. */
const focusCanvasElement = (): void => {
  if (typeof document === 'undefined') return;
  document.querySelector<HTMLElement>('[data-testid="canvas"]')?.focus();
};

const isContextCommand = (id: string): id is ContextCommand =>
  (CONTEXT_COMMANDS as readonly string[]).includes(id);

/** SHA-256 of a text's UTF-8 bytes as hex (the written hash, Terms of "Tabs, auto-save and session"). */
const sha256: Sha256 = async (text) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** Timers and frames, injected so node tests can drive them (the defaults are the browser's). */
export interface HostEnv {
  now(): number;
  schedule(fn: () => void, ms: number): () => void;
  requestFrame(fn: () => void): number;
  cancelFrame(handle: number): void;
}

const browserEnv = (): HostEnv => ({
  now: () => Date.now(),
  schedule: (fn, ms) => {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
  requestFrame: (fn) =>
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(fn)
      : (setTimeout(fn, 0) as unknown as number),
  cancelFrame: (handle) => {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
    else clearTimeout(handle);
  },
});

/** What the strip and N1 show: the tabs' view-models, the active tab and W3's title. */
export interface TabsView {
  readonly tabs: readonly TabView[];
  readonly activeId: string;
  /** W3: `*` when the active tab is unsaved, its label, ` - Chalkbond`. */
  readonly title: string;
}

const sameTabs = (a: readonly TabView[], b: readonly TabView[]): boolean =>
  a.length === b.length &&
  a.every((t, i) => t.id === b[i]?.id && t.label === b[i]?.label && t.marker === b[i]?.marker);

/** R22, R37: opens that arrive while an in-window dialog is open wait (first in, first out). */
const HELD_LIMIT = 20;

/**
 * Called once before React mounts: effects and StrictMode never own controller lifetime. TB20: the
 * window's tabs (TB14) and their flows (TB17-TB19) over the preload's functions; the controller's
 * events feed the SS4 write schedule (TB16): `doc` / `history` -> the active tab's record on AS2's
 * timer, `view` -> the index after 2 s, a tab-list or marker change -> the index after 500 ms. The
 * flows write the record and the index themselves at their flush points (switch, Save, Save as,
 * close, `flush-session`), so those never go through the schedule.
 */
export async function createWindowHost(
  main: ChalkbondApi,
  textFocus = focusedText,
  focusCanvas = focusCanvasElement,
  env: HostEnv = browserEnv(),
) {
  const startup = await main.startup();
  const clock = (): string => new Date().toISOString();
  // The editor's onCopy must exist before the flow does; it forwards to the flow once made.
  const late: { flow?: CopyFlow } = {};
  const controller = createEditorController({
    clock,
    onCopy: (sub, doc, selection) => {
      void late.flow?.onCopy(sub, doc, selection);
    },
    doc: setStyle(emptyDoc(clock()), { preset: startup.settings.newDrawingStyle }),
    shortcuts: 'all',
    logError: (error) => main.logError(String(error)),
  });
  const copyFlow = createCopyFlow({
    controller,
    write: (value) => main.clipboardWrite(value),
    read: () => main.clipboardRead(),
    rasterise,
    schedule: env.schedule,
  });
  late.flow = copyFlow;
  // ST1, ST2: the renderer's settings (no path); a change is kept here and sent to main (I8).
  const settings: RendererSettings = {
    newDrawingStyle: startup.settings.newDrawingStyle,
    export: { ...startup.settings.export },
  };
  const remember = async (change: Partial<RendererSettings>): Promise<void> => {
    if (change.newDrawingStyle !== undefined) settings.newDrawingStyle = change.newDrawingStyle;
    if (change.export !== undefined) settings.export = { ...change.export };
    try {
      await main.setSettings(change);
    } catch (error) {
      main.logError(`Settings not stored: ${String(error)}`);
    }
  };
  // CO1, ST1: a host load and a tab's state put in are never remembered as a preset switch.
  const presets = createPresetMemory({
    controller,
    remember: (style) => {
      void remember({ newDrawingStyle: style });
    },
  });
  // M1: an in-window dialog is open (Export or Keyboard shortcuts); one at a time.
  let exportOpen = (): boolean => false;
  let shortcutsOpen = false;
  const shortcutsListeners = new Set<() => void>();
  const setShortcuts = (open: boolean): void => {
    if (open === shortcutsOpen) return;
    shortcutsOpen = open;
    for (const listener of [...shortcutsListeners]) listener();
  };
  const modal = (): boolean => exportOpen() || shortcutsOpen;
  // M4: the ☰ button follows the popup (`aria-expanded`) and the dialogs (disabled while one is open).
  let appMenuOpen = false;
  const appMenuListeners = new Set<() => void>();
  const appMenuChanged = (): void => {
    for (const listener of [...appMenuListeners]) listener();
  };
  // R40: Ctrl+Shift+T and the menus' Reopen closed tab need an entry in the reopen list; the flows
  // below own the list, so the menu state reads it late.
  const reopenable: { now: () => boolean } = { now: () => false };
  const menuState = () =>
    deriveMenuState(controller, {
      textFocus: textFocus(),
      modal: modal(),
      canReopenTab: reopenable.now(),
    });

  // ---- tabs, flows and the write schedule ----------------------------------------------------

  /** True while a tab's state is put in: its `doc` / `history` events are no edit (SS4). */
  let putting = false;
  const flowController: TabFlowController = {
    getDoc: () => controller.getDoc(),
    markSaved: () => controller.markSaved(),
    run: (cmd) => controller.run(cmd),
    takeState: () => controller.takeState(),
    newState: (doc) => controller.newState(doc),
    snapshotState: () => controller.snapshotState(),
    putState: (state) =>
      presets.quietly(() => {
        putting = true;
        try {
          controller.putState(state);
        } finally {
          putting = false;
        }
      }),
  };
  /** AS5, AS7: no gesture, no label or text editor (what `replace-doc` needs, R58), no dialog. */
  const hostIdle = (): boolean =>
    !modal() && controller.canRun({ type: 'replace-doc', doc: controller.getDoc(), label: '' });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const encoder = new TextEncoder();
  // Late-bound: the flows call `changed` only from their async work, after everything exists.
  const later: { changed: () => void } = { changed: () => undefined };
  const schedule = createWriteSchedule({
    now: env.now,
    schedule: env.schedule,
    write: (due) => {
      if (!flows.closed()) void flows.write(due);
    },
  });
  const tabMain: TabFlowMain = {
    ...main,
    // SS10: after N5 nothing more is written; the schedule's pending writes are dropped.
    closeOk: () => {
      schedule.cancel();
      main.closeOk();
    },
  };
  const flows = createTabFlows({
    main: tabMain,
    controller: flowController,
    sha256,
    clock,
    newId: () => crypto.randomUUID(),
    notify: (kind, text) => controller.notify(kind, text),
    // F4a: an open label or text editor is committed before a switch, an open or a close decides.
    finishEditing: createFinishEditing(controller),
    // R25: the shutdown flush finishes it at once unless an IME composition runs.
    finishEditingNow: createFinishEditingNow(controller, trackComposition()),
    ask: (request) => main.ask(request),
    newDrawingStyle: () => settings.newDrawingStyle,
    decodeUtf8: (bytes) => {
      try {
        return decoder.decode(bytes);
      } catch {
        return null;
      }
    },
    hostIdle,
    changed: () => later.changed(),
  });
  const canReopen = (): boolean => flows.state().list.closed.length > 0;
  reopenable.now = canReopen;

  // The strip's view and W3's title follow the flows' state (markers need the SHA-256: async).
  let view: TabsView = {
    tabs: [],
    activeId: flows.state().list.active,
    title: 'Untitled - Chalkbond',
  };
  const viewListeners = new Set<() => void>();
  let viewGeneration = 0;
  let started = false;
  const tabViews = (list: TabList) =>
    Promise.all(
      list.tabs.map(async (t): Promise<TabView> => ({
        id: t.id,
        label: label(t),
        marker: await flows.marker(t.id),
      })),
    );
  let latestView: Promise<void> = Promise.resolve();
  /**
   * Recomputes the view; a marker or label change schedules the index (SS4). The latest call wins:
   * an earlier one that finishes later is dropped and settles with the latest one.
   */
  const refreshView = (): Promise<void> => {
    const run = computeView(++viewGeneration);
    latestView = run;
    return run.then(() => (latestView === run ? undefined : latestView));
  };
  const computeView = async (generation: number): Promise<void> => {
    const { list, meta } = flows.state();
    const tabs = await tabViews(list);
    const active = activeTab(list);
    const stored = meta[active.id]?.stored;
    const title = windowTitleOf(
      active,
      await flows.facts(active.id),
      stored === undefined ? undefined : { kind: active.kind, ...stored },
    );
    if (generation !== viewGeneration) return;
    const tabsChanged = !sameTabs(view.tabs, tabs);
    if (!tabsChanged && view.activeId === list.active && view.title === title) return;
    view = { tabs, activeId: list.active, title };
    if (tabsChanged && started && !flows.closed()) schedule.event('tabs');
    for (const listener of [...viewListeners]) listener();
  };

  let sent: SessionUpdate | undefined;
  /** N1 (W3's title; there is no menu to follow since R32) for the view now; sent when it changed. */
  const publishSession = (): void => {
    const update: SessionUpdate = { title: view.title };
    if (sent?.title === update.title) return;
    main.updateSession(update);
    sent = update;
  };
  /** The view, then N1. */
  const refresh = async (): Promise<void> => {
    await refreshView();
    publishSession();
  };
  // Editor events, focus, dialogs and tab changes refresh at most once per animation frame.
  const scheduler = createMenuScheduler({
    requestFrame: env.requestFrame,
    cancelFrame: env.cancelFrame,
    publish: () => void refresh(),
  });

  let lastActive = flows.state().list.active;
  later.changed = () => {
    const { active } = flows.state().list;
    // The switch flow wrote the outgoing tab's record itself; the timer belonged to that tab.
    if (active !== lastActive) schedule.cancelRecord();
    lastActive = active;
    if (!flows.closed()) schedule.event('tabs');
    scheduler.invalidate();
  };

  /** AS7, the AS6 and SS6 boxes wait for the host to be idle. */
  const idleChanged = (): void => {
    if (hostIdle()) void flows.settleIdle();
  };
  // SS4: the active tab's drawing or history changed -> its record on AS2's timer; a `view`
  // event -> the index after 2 s. A tab's state put in by a flow is not an edit.
  controller.subscribe((event) => {
    if (!started || flows.closed()) return;
    if ((event.type === 'doc' || event.type === 'history') && !putting) schedule.event('doc');
    else if (event.type === 'view') schedule.event('view');
    else if (event.type === 'busy') idleChanged();
  });

  /** What a menu command does: the functions the keys and buttons call (M1). */
  const actions: AppActions = {
    // T7: a new tab (File > New tab, Ctrl+T, Ctrl+N).
    newDrawing: () => void flows.newTab(),
    // R47: File > Reopen closed tab (T12) and File > Close tab (T8, the active tab).
    reopenTab: () => void flows.reopen(),
    closeTab: () => void flows.close(flows.state().list.active),
    open: () => void flows.open(),
    save: () => void flows.save(),
    saveAs: () => void flows.saveAs(),
    exportDialog: () => {
      if (!modal()) exportFlow.open();
    },
    copy: () => void copyFlow.copy(),
    paste: () => void copyFlow.paste(),
    shortcuts: () => {
      if (!modal()) setShortcuts(true);
    },
    run: (cmd: EditorCommand) => controller.run(cmd),
  };

  // EX1, EX2: the Export dialog's choices and the Save dialog (C3); EX3–EX5: the writer writes the
  // snapshot taken at Save… (no tab, record or file change). Its name is the active tab's.
  const exportFlow = createExportFlow({
    main,
    controller,
    settings: () => ({ ...settings.export }),
    remember: (choices) => remember({ export: choices }),
    sessionName: () => {
      const tab = activeTab(flows.state().list);
      return tab.kind === 'untitled' ? null : tab.name;
    },
    chosen: createExportWriter({
      main,
      rasterise,
      notify: (kind, text) => controller.notify(kind, text),
      encodeUtf8: (text) => encoder.encode(text),
      logError: (message) => main.logError(message),
    }),
    logError: (message) => main.logError(message),
  });
  exportOpen = () => exportFlow.state() !== null;

  // R22, R37: an OS open or focus that arrives while a dialog is open waits for it to close.
  const held: OpenRequest[] = [];
  const hold = (request: OpenRequest): void => {
    if (held.length < HELD_LIMIT) held.push(request);
    else main.logError('Open request dropped: the queue is full');
  };
  const releaseHeld = (): void => {
    if (modal()) return;
    for (const request of held.splice(0)) void flows.request(request);
  };
  const dialogChanged = (): void => {
    appMenuChanged();
    releaseHeld();
    idleChanged();
  };
  exportFlow.subscribe(dialogChanged);
  shortcutsListeners.add(dialogChanged);

  /** A `main:event` menu command, re-checked against the state now (R19). */
  const runCommand = (command: string): boolean => runAppCommand(command, menuState(), actions);
  const commands: string[] = [];

  /**
   * CO5, SS7: once, after the window's view is mounted: the strip, the active tab, then I7's file
   * and the opens queued meanwhile. No recovery offer (R35). The canvas has focus after.
   */
  const start = async (): Promise<void> => {
    if (started) return;
    started = true;
    await flows.start({ session: startup.session ?? null, open: startup.open ?? null });
    // SS4: main knows the tab list and the active tab from the start (F6's folder reads it).
    await flows.write({ record: false, index: true });
    focusCanvas();
  };

  let menuOpen = false;
  /**
   * CM1, CM2: the editor's `context-menu` event (an unselected item is already selected). The menu
   * acts on the drawing, so a focused text field gives focus to the canvas first; then I6 with the
   * state now; the chosen command runs as the Edit item does, re-checked against the state then.
   * One menu at a time; none while an in-window dialog is open.
   */
  const contextMenu = async (event: {
    readonly target: HostHit | null;
    readonly screen: { x: number; y: number };
  }): Promise<void> => {
    if (menuOpen || modal()) return;
    if (textFocus()) focusCanvas();
    menuOpen = true;
    try {
      const chosen = await main.showContextMenu({
        onItem: event.target !== null,
        state: menuState(),
      });
      if (chosen !== null && isContextCommand(chosen)) runCommand(chosen);
    } catch (error) {
      main.logError(`Context menu failed: ${String(error)}`);
    } finally {
      menuOpen = false;
    }
  };
  /** T15, CM4: the tab menu (I10) for tab `tabId`; its answer acts on that tab, not the active one. */
  const tabMenu = async (tabId: string, at: { x: number; y: number } | null): Promise<void> => {
    if (menuOpen || modal()) return;
    menuOpen = true;
    let chosen: Awaited<ReturnType<ChalkbondApi['showTabMenu']>> = null;
    try {
      chosen = await main.showTabMenu({ tabId, state: { canReopenTab: canReopen() }, at });
    } catch (error) {
      main.logError(`Tab menu failed: ${String(error)}`);
    } finally {
      menuOpen = false;
    }
    if (chosen === 'new-tab') await flows.newTab();
    else if (chosen === 'close') await flows.close(tabId);
    else if (chosen === 'reopen') await flows.reopen();
  };
  // ---- the ☰ menu (M4, R32) ---------------------------------------------------------------

  /** The button's bottom-left corner in content CSS px (the page is never zoomed). */
  const appMenuAnchor = (): { x: number; y: number } => {
    if (typeof document === 'undefined') return { x: 0, y: 0 };
    const rect = document
      .querySelector<HTMLElement>('[data-testid="app-menu"]')
      ?.getBoundingClientRect();
    return rect === undefined ? { x: 0, y: 0 } : { x: rect.left, y: rect.bottom };
  };
  /**
   * M4: a press of the ☰ button, Alt or F10. I9 with the state now and the anchor; the chosen
   * command runs as a menu command always did, re-checked against the state then (R19); Open
   * recent, Exit, About and the text items ran in main. Focus is where it was before. One popup
   * at a time (M5), none while an in-window dialog is open.
   */
  const appMenu = async (): Promise<void> => {
    if (menuOpen || modal()) return;
    const before = typeof document === 'undefined' ? null : document.activeElement;
    menuOpen = true;
    appMenuOpen = true;
    appMenuChanged();
    let chosen: Awaited<ReturnType<ChalkbondApi['showAppMenu']>> = null;
    try {
      chosen = await main.showAppMenu({ state: menuState(), ...appMenuAnchor() });
    } catch (error) {
      main.logError(`Menu failed: ${String(error)}`);
    } finally {
      menuOpen = false;
      appMenuOpen = false;
      appMenuChanged();
    }
    if (
      typeof document !== 'undefined' &&
      before instanceof HTMLElement &&
      before !== document.body &&
      before.isConnected &&
      document.activeElement !== before
    )
      before.focus();
    if (chosen !== null) {
      commands.push(chosen);
      runCommand(chosen);
    }
  };
  /** `main:event {open}` (F10, F11): T17 now, queued while a flow runs, held while a dialog is open. */
  const openRequested = async (ref: FileRef): Promise<void> => {
    if (modal()) return hold({ kind: 'ref', ref });
    await flows.openRef(ref);
  };
  /** `main:event {focus-tab}` (T17): the file is open in that tab: activate it. */
  const focusRequested = async (tabId: string): Promise<void> => {
    if (modal()) return hold({ kind: 'focus', tabId });
    await flows.focusTab(tabId);
  };
  /**
   * F12 (R37), SEC14: every file with an Open extension opens in its own tab, in order (else the
   * first file, for its F14 box); each asks I3 (the preload reads its path) when its turn comes.
   */
  const openDropped = async (files: readonly File[]): Promise<void> => {
    if (modal() || files.length === 0) return;
    await flows.drop(
      files.map((file) => ({
        name: file.name,
        resolve: async () => {
          const result = await main.openDroppedFile(file);
          return result.ok ? result : { ...result, name: result.name || file.name };
        },
      })),
    );
  };
  /** Every `main:event` (the preload's `onMainEvent`). */
  const handleMainEvent = (event: MainEvent): void => {
    switch (event.type) {
      case 'command':
        commands.push(event.command);
        runCommand(event.command);
        return;
      case 'close-requested':
        void flows.closeWindow(); // SS10, R51; N5 stops the schedule
        return;
      case 'open':
        void openRequested(event.ref);
        return;
      case 'focus-tab':
        void focusRequested(event.tabId);
        return;
      case 'flush-session':
        void flows.flushSession(); // R25: best effort, nothing awaited
        return;
      case 'flush-recovery':
        return; // superseded by `flush-session` (R35); main no longer sends it
    }
  };

  /** T11 by a click (`pointer`: the canvas takes focus after, as the rail does) or a key. */
  const activateTab = async (id: string, pointer = false): Promise<void> => {
    await flows.activate(id);
    if (pointer) focusCanvas();
  };
  /** T11 keys: the tab `pick` chooses, if it is another one. */
  const toTab = (pick: (list: TabList) => TabList) => (): void => {
    const list = flows.state().list;
    const target = pick(list);
    if (target.active !== list.active) void flows.activate(target.active);
  };
  let menuRequests = 0;
  /** K1, K2, K3 (R36): what the host keys do. */
  const hostActions: HostActions = {
    'copy-whole': actions.copy,
    paste: actions.paste,
    new: actions.newDrawing,
    open: actions.open,
    save: actions.save,
    'save-as': actions.saveAs,
    export: actions.exportDialog,
    shortcuts: actions.shortcuts,
    'focus-name': () => {
      if (controller.canRun('focus-name-field')) controller.run('focus-name-field');
    },
    'close-tab': () => void flows.close(flows.state().list.active),
    'next-tab': toTab(next),
    'previous-tab': toTab(previous),
    'last-tab': toTab(last),
    'tab-1': toTab((l) => byNumber(l, 1)),
    'tab-2': toTab((l) => byNumber(l, 2)),
    'tab-3': toTab((l) => byNumber(l, 3)),
    'tab-4': toTab((l) => byNumber(l, 4)),
    'tab-5': toTab((l) => byNumber(l, 5)),
    'tab-6': toTab((l) => byNumber(l, 6)),
    'tab-7': toTab((l) => byNumber(l, 7)),
    'tab-8': toTab((l) => byNumber(l, 8)),
    'reopen-tab': () => void flows.reopen(),
    // M4, K3: F10 and a lone Alt open the ☰ menu (the hook counts the requests).
    menu: () => {
      menuRequests++;
      void appMenu();
    },
  };
  /** TH2 seams for the tabs (`readTabs`, `activateTab`). */
  const hookTabs: HookTabs = {
    read: async () => {
      const { list } = flows.state();
      return Promise.all(
        list.tabs.map(async (t): Promise<HookTab> => ({
          id: t.id,
          label: label(t),
          kind: t.kind,
          active: t.id === list.active,
          marker: await flows.marker(t.id),
        })),
      );
    },
    activate: (id) => flows.activate(id),
    menuRequests: () => menuRequests,
  };

  return {
    openRequested,
    focusRequested,
    openDropped,
    handleMainEvent,
    commands,
    controller,
    copyFlow,
    exportFlow,
    tabFlows: flows,
    publishSession,
    /** The tab view and N1 now (the frame scheduler runs this). */
    refresh,
    /** Something the menu, title or strip reads changed: on the next frame (at most once per frame). */
    invalidateMenu: scheduler.invalidate,
    cancelMenu: scheduler.cancel,
    /** An in-window dialog is open: K1 and every menu item do nothing. */
    modal,
    /** The Keyboard shortcuts dialog (A12): opened by `actions.shortcuts`, closed by itself. */
    shortcutsDialog: {
      open: (): boolean => shortcutsOpen,
      close: (): void => setShortcuts(false),
      subscribe(listener: () => void): () => void {
        shortcutsListeners.add(listener);
        return () => shortcutsListeners.delete(listener);
      },
    },
    /** The strip's view-models and W3's title (`useSyncExternalStore`). */
    tabsView: {
      get: (): TabsView => view,
      subscribe(listener: () => void): () => void {
        viewListeners.add(listener);
        return () => viewListeners.delete(listener);
      },
    },
    /** The strip's callbacks (T7, T8, T11, T13, T15). */
    tabs: {
      activate: activateTab,
      close: (id: string): Promise<void> => flows.close(id),
      newTab: async (pointer = false): Promise<void> => {
        await flows.newTab();
        if (pointer) focusCanvas();
      },
      move: (from: number, to: number): void => flows.move(from, to),
      menu: tabMenu,
    },
    hostActions,
    hookTabs,
    /** M4: the ☰ button's press, and what it shows (`aria-expanded`; disabled while `modal()`). */
    appMenu: {
      open: appMenu,
      isOpen: (): boolean => appMenuOpen,
      subscribe(listener: () => void): () => void {
        appMenuListeners.add(listener);
        return () => appMenuListeners.delete(listener);
      },
    },
    /** Ctrl+Shift+T and the tab menu's Reopen: the reopen list is non-empty (R40). */
    canReopen,
    actions,
    runCommand,
    contextMenu,
    start,
    /** AS5 (c): the window regained focus. */
    windowFocused: (): Promise<void> => flows.windowFocused(),
    /** ST2: a copy of the renderer settings now. */
    settings: (): RendererSettings => ({ ...settings, export: { ...settings.export } }),
    /** I8: remembers a settings change (here at once; main writes the file). */
    remember,
    /** TH2 `load`: the document into the active tab (no prompt; a test seam only). */
    loadIntoActive(doc: Doc): void {
      presets.load(doc);
      scheduler.invalidate();
    },
  };
}
export type WindowHost = Awaited<ReturnType<typeof createWindowHost>>;
