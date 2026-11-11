import { createCopyFlow, type CopyFlow } from '../clipboard-export/model/copy-flow';
import { createExportFlow, createExportWriter } from '../clipboard-export/model/export-flow';
import { rasterise } from '../clipboard-export/rasterise';
import { emptyDoc, serialize, setStyle, type Doc } from '@core/doc-model';
import { createEditorController } from '../editor';
import { createFinishEditing, createFinishEditingNow, trackComposition } from './finish-editing';
import { createFileFlows } from './model/file-flows';
import {
  createMenuScheduler,
  deriveMenuState,
  runAppCommand,
  sameMenuState,
  type AppActions,
} from './model/menu-state';
import { isTextTarget } from './text-target';
import { createPresetMemory } from './model/preset-memory';
import { createRecovery } from './model/recovery';
import { createSession, recoveryName, sessionUpdate } from './model/session';
import type { ChalkbondApi } from '../../preload/api';
import { CONTEXT_COMMANDS, type ContextCommand } from '../../shared/menu';
import type { HostHit } from '../editor';
import type { FileRef, RendererSettings, SessionUpdate } from '../../shared/ipc-types';

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

/** Called once before React mounts: effects and StrictMode never own controller lifetime. */
export async function createWindowHost(
  main: ChalkbondApi,
  textFocus = focusedText,
  focusCanvas = focusCanvasElement,
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
    schedule: (fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
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
  // CO1: every host load goes through the preset memory, so a load is never remembered (ST1).
  const presets = createPresetMemory({
    controller,
    remember: (style) => {
      void remember({ newDrawingStyle: style });
    },
  });
  const hostController = {
    getDoc: () => controller.getDoc(),
    load: presets.load,
    markSaved: () => controller.markSaved(),
    isDirty: () => controller.isDirty(),
    notify: (kind: 'info' | 'error', text: string) => controller.notify(kind, text),
  };
  const session = createSession();
  // RC1, RC2, RC5: the recovery file follows the committed drawing while it is dirty (F7).
  const recovery = createRecovery({
    now: () => Date.now(),
    schedule: (fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
    main: {
      writeRecovery: (value) => main.writeRecovery(value),
      clearRecovery: () => main.clearRecovery(),
    },
    dirty: () => session.forcedDirty || controller.isDirty(),
    doc: () => controller.getDoc(),
    text: () => serialize(controller.getDoc()),
    name: () => recoveryName(session),
    // R25: an open label or text editor is finished before the shutdown flush writes.
    beforeFlush: createFinishEditingNow(controller, trackComposition()),
  });
  // RC7 (R23): last run's file must survive until the startup offer is answered (resumed by it).
  if (startup.recovery !== null) recovery.suspend();
  controller.subscribe((event) => {
    if (event.type === 'doc' || event.type === 'dirty') recovery.update();
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
  const menuState = () => deriveMenuState(controller, { textFocus: textFocus(), modal: modal() });
  let sent: SessionUpdate | undefined;
  /** N1 for the current session, document and menu; sent only when one of them changed. */
  const publishSession = (): void => {
    const update = { ...sessionUpdate(session, controller.isDirty()), menu: menuState() };
    if (
      sent?.title === update.title &&
      sent.dirty === update.dirty &&
      sameMenuState(sent.menu, update.menu)
    )
      return;
    main.updateSession(update);
    sent = update;
  };
  // Editor events, focus and dialog changes publish at most once per animation frame.
  const scheduler = createMenuScheduler({
    requestFrame: (fn) => requestAnimationFrame(fn),
    cancelFrame: (handle) => cancelAnimationFrame(handle),
    publish: publishSession,
  });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const encoder = new TextEncoder();
  const fileFlows = createFileFlows({
    main,
    controller: hostController,
    session,
    publish: publishSession,
    clock,
    // ST1: the style of the last preset switch (startup settings until one happens).
    newDrawingStyle: () => settings.newDrawingStyle,
    decodeUtf8: (bytes) => {
      try {
        return decoder.decode(bytes);
      } catch {
        return null;
      }
    },
    encodeUtf8: (text) => encoder.encode(text),
    // F4a: an open label or text editor is committed before New, Open or close decide.
    finishEditing: createFinishEditing(controller),
    recovery,
  });
  // EX1, EX2: the Export dialog's choices and the Save dialog (C3); EX3–EX5: the writer writes the
  // snapshot taken at Save… (no dirty, session or recovery change).
  const exportFlow = createExportFlow({
    main,
    controller,
    settings: () => ({ ...settings.export }),
    remember: (choices) => remember({ export: choices }),
    sessionName: () => (session.kind === 'untitled' ? null : session.name),
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
  // R22: an OS open (F11) that arrives while a dialog is open waits for it to close (latest wins).
  let heldOpen: FileRef | null = null;
  const releaseHeld = (): void => {
    if (heldOpen === null || modal()) return;
    const ref = heldOpen;
    heldOpen = null;
    void fileFlows.openRef(ref);
  };
  exportFlow.subscribe(releaseHeld);
  shortcutsListeners.add(releaseHeld);
  /** What a menu command does: the functions the keys and buttons call (M1). */
  const actions: AppActions = {
    newDrawing: () => void fileFlows.newDrawing(),
    open: () => void fileFlows.open(),
    save: () => void fileFlows.save(),
    saveAs: () => void fileFlows.saveAs(),
    exportDialog: () => {
      if (!modal()) exportFlow.open();
    },
    copy: () => void copyFlow.copy(),
    paste: () => void copyFlow.paste(),
    shortcuts: () => {
      if (!modal()) setShortcuts(true);
    },
    run: (cmd) => controller.run(cmd),
  };
  /** A `main:event` menu command, re-checked against the state now (R19). */
  const runCommand = (command: string): boolean => runAppCommand(command, menuState(), actions);
  let started = false;
  /**
   * CO5, RC3, RC4: once, after the window's view is mounted (the recover box has its parent and
   * the canvas exists): the recovery offer, then the launch's file. The canvas has focus after.
   */
  const start = async (): Promise<void> => {
    if (started) return;
    started = true;
    if (startup.recovery === null && startup.open === null) return;
    await fileFlows.start({ recovery: startup.recovery, open: startup.open });
    focusCanvas();
  };
  let contextOpen = false;
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
    if (contextOpen || modal()) return;
    if (textFocus()) focusCanvas();
    contextOpen = true;
    try {
      const chosen = await main.showContextMenu({
        onItem: event.target !== null,
        state: menuState(),
      });
      if (chosen !== null && isContextCommand(chosen)) runCommand(chosen);
    } catch (error) {
      main.logError(`Context menu failed: ${String(error)}`);
    } finally {
      contextOpen = false;
    }
  };
  /** `main:event {open}` (F10, F11): F3 now, queued while a flow runs, held while a dialog is open. */
  const openRequested = async (ref: FileRef): Promise<void> => {
    if (modal()) {
      heldOpen = ref;
      return;
    }
    await fileFlows.openRef(ref);
  };
  /** F12, SEC14: a dropped File → I3 (the preload reads its path) → F3, or the F14 box. */
  const openDropped = async (file: File): Promise<void> => {
    if (modal()) return;
    try {
      const result = await main.openDroppedFile(file);
      if (result.ok) await fileFlows.openRef(result.ref);
      else await main.showFileError(result.problem, result.name || file.name);
    } catch (error) {
      main.logError(`Drop failed: ${String(error)}`);
    }
  };
  return {
    openRequested,
    openDropped,
    commands: [] as string[],
    controller,
    copyFlow,
    exportFlow,
    fileFlows,
    session,
    publishSession,
    /** Something the menu reads changed: N1 on the next frame (at most once per frame). */
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
    actions,
    runCommand,
    contextMenu,
    start,
    /** RC5 (`main:event {flush-recovery}`): N3 at once when dirty. */
    flushRecovery: (): void => recovery.flush(),
    /** ST2: a copy of the renderer settings now. */
    settings: (): RendererSettings => ({ ...settings, export: { ...settings.export } }),
    /** I8: remembers a settings change (here at once; main writes the file). */
    remember,
    /** TH2 `load`: the document as an Untitled session (no prompt; a test seam only). */
    loadUntitled(doc: Doc): void {
      presets.load(doc);
      Object.assign(session, createSession());
      main.sessionFile(null);
      publishSession();
    },
  };
}
export type WindowHost = Awaited<ReturnType<typeof createWindowHost>>;
