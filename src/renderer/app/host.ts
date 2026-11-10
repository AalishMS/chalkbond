import { emptyDoc, setStyle } from '@core/doc-model';
import { createEditorController } from '../editor';
import { createSession, sessionUpdate } from './model/session';
import type { ChalkbondApi } from '../../preload/api';

/** Called once before React mounts: effects and StrictMode never own controller lifetime. */
export async function createWindowHost(main: ChalkbondApi) {
  const startup = await main.startup();
  const clock = (): string => new Date().toISOString();
  const controller = createEditorController({
    clock,
    doc: setStyle(emptyDoc(clock()), { preset: startup.settings.newDrawingStyle }),
    shortcuts: 'all',
    logError: (error) => main.logError(String(error)),
  });
  const session = createSession();
  let sent: ReturnType<typeof sessionUpdate> | undefined;
  return {
    commands: [] as string[],
    controller,
    session,
    publishSession(): void {
      const update = sessionUpdate(session, controller.isDirty());
      if (sent?.title === update.title && sent.dirty === update.dirty) return;
      main.updateSession(update);
      sent = update;
    },
  };
}
export type WindowHost = Awaited<ReturnType<typeof createWindowHost>>;
