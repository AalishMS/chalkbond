import { createCopyFlow, type CopyFlow } from '../clipboard-export/model/copy-flow';
import { createExportFlow, createExportWriter } from '../clipboard-export/model/export-flow';
import { rasterise } from '../clipboard-export/rasterise';
import { emptyDoc, setStyle, type Doc } from '@core/doc-model';
import { createEditorController } from '../editor';
import { createFinishEditing } from './finish-editing';
import { createFileFlows } from './model/file-flows';
import { createPresetMemory } from './model/preset-memory';
import { createSession, sessionUpdate } from './model/session';
import type { ChalkbondApi } from '../../preload/api';
import type { RendererSettings } from '../../shared/ipc-types';

/** Called once before React mounts: effects and StrictMode never own controller lifetime. */
export async function createWindowHost(main: ChalkbondApi) {
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
  let sent: ReturnType<typeof sessionUpdate> | undefined;
  /** N1 for the current session and document; sent only when title or dirty changed. */
  const publishSession = (): void => {
    const update = sessionUpdate(session, controller.isDirty());
    if (sent?.title === update.title && sent.dirty === update.dirty) return;
    main.updateSession(update);
    sent = update;
  };
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
  return {
    commands: [] as string[],
    controller,
    copyFlow,
    exportFlow,
    fileFlows,
    session,
    publishSession,
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
