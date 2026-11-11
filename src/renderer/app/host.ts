import { createCopyFlow, type CopyFlow } from '../clipboard-export/model/copy-flow';
import { rasterise } from '../clipboard-export/rasterise';
import { emptyDoc, setStyle, type Doc } from '@core/doc-model';
import { createEditorController } from '../editor';
import { createFileFlows } from './model/file-flows';
import { createSession, sessionUpdate } from './model/session';
import type { ChalkbondApi } from '../../preload/api';

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
    controller,
    session,
    publish: publishSession,
    clock,
    // ST1: the startup settings' style until A10 tracks preset switches.
    newDrawingStyle: () => startup.settings.newDrawingStyle,
    decodeUtf8: (bytes) => {
      try {
        return decoder.decode(bytes);
      } catch {
        return null;
      }
    },
    encodeUtf8: (text) => encoder.encode(text),
  });
  return {
    commands: [] as string[],
    controller,
    copyFlow,
    fileFlows,
    session,
    publishSession,
    /** TH2 `load`: the document as an Untitled session (no prompt; a test seam only). */
    loadUntitled(doc: Doc): void {
      controller.load(doc);
      Object.assign(session, createSession());
      main.sessionFile(null);
      publishSession();
    },
  };
}
export type WindowHost = Awaited<ReturnType<typeof createWindowHost>>;
