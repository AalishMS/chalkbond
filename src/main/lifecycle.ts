// Window close and app quit (SPEC-app-shell.md F13, RC2, RC5, R5, R20). A close is handed to the
// renderer (`close-requested`) once it has sent its first N1; its N5 closes the window only after
// the recovery chain is idle, so the N4 sent just before it has removed the file. A gone renderer
// or a close after Windows' `session-end` (irrevocable, RC5, R24) closes without the prompt and
// never clears recovery. `query-session-end` is only a question (the shutdown can still be
// cancelled): it asks the renderer for a best-effort flush and changes no guard state. Quit waits
// for one flush of settings and recovery (not run at a Windows session end).
import { CHANNELS } from '../shared/channels';
import type { MainEvent } from '../shared/ipc-types';

interface Preventable {
  preventDefault(): void;
}

/** The parts of a `BrowserWindow` the guard uses (a fake in tests). */
export interface GuardedWindow {
  on(
    event: 'close' | 'query-session-end' | 'session-end',
    listener: (event: Preventable) => void,
  ): unknown;
  close(): void;
  isDestroyed(): boolean;
  webContents: {
    on(event: 'render-process-gone', listener: () => void): unknown;
    send(channel: string, value: MainEvent): void;
    isCrashed(): boolean;
  };
}

export interface CloseGuardPorts {
  /** Runs for every close that goes ahead (W2 remembers the bounds then). */
  closing(): void;
  /** Settles when every recovery write and clear queued so far has run (RC6). */
  recoveryIdle(): Promise<void>;
}

export function guardClose(win: GuardedWindow, ports: CloseGuardPorts) {
  let ready = false;
  let allowed = false;
  let closingNow = false;
  const send = (value: MainEvent): void => {
    if (!win.isDestroyed()) win.webContents.send(CHANNELS.mainEvent, value);
  };
  win.webContents.on('render-process-gone', () => {
    allowed = true;
  });
  // RC5, R24: Windows asks whether the session may end. Nothing is prevented or awaited and no
  // state changes (the shutdown may be cancelled); the renderer writes the recovery file at once.
  win.on('query-session-end', () => {
    send({ type: 'flush-recovery' });
  });
  // R24: `session-end` cannot be prevented. The close that follows skips F4 and never clears.
  win.on('session-end', () => {
    allowed = true;
  });
  win.on('close', (event) => {
    if (allowed || !ready || win.webContents.isCrashed()) {
      ports.closing();
      return;
    }
    event.preventDefault();
    send({ type: 'close-requested' });
  });
  return {
    /** N1 arrived: the renderer listens for main events now. */
    rendererReady(): void {
      ready = true;
    },
    /** N5: the renderer ran F4 and sent N4 first; close once that clear has run. */
    closeOk(): void {
      if (closingNow) return;
      closingNow = true;
      const close = (): void => {
        allowed = true;
        if (!win.isDestroyed()) win.close();
      };
      ports.recoveryIdle().then(close, close);
    },
  };
}

/** The parts of `app` the quit flush uses. */
export interface QuittingApp {
  on(event: 'will-quit', listener: (event: Preventable) => void): unknown;
  quit(): void;
}

/**
 * One `will-quit` handler: while settings or recovery work is pending, quit waits for one flush of
 * both (a second quit meanwhile waits for the same flush), then quits again.
 */
export function installQuitFlush(
  app: QuittingApp,
  ports: { pending(): boolean; flush(): Promise<unknown>; log(message: string): void },
): void {
  let state: 'open' | 'flushing' | 'done' = 'open';
  app.on('will-quit', (event) => {
    if (state === 'done' || (state === 'open' && !ports.pending())) return;
    event.preventDefault();
    if (state === 'flushing') return;
    state = 'flushing';
    void ports
      .flush()
      .catch((error: unknown) => ports.log(`Flush before quit failed: ${String(error)}`))
      .finally(() => {
        state = 'done';
        app.quit();
      });
  });
}
