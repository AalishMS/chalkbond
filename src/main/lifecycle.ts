// Window close and app quit (SPEC-app-shell.md F13, RC2, RC5, R5, R20, SS10). A close is handed to
// the renderer (`close-requested`) once it has sent its first N1; its N5 closes the window only
// after the recovery chain is idle, so the N4 sent just before it has removed the file, and (TB13,
// SS10) after the session chain is empty: every record, index and auto-save write the renderer sent
// before N5 has run, then the discarded records are deleted on the empty chain (the store deletes
// only after a validly read index, SS11), and anything queued meanwhile has run too. A failed write
// or deletion does not hold the close. A gone renderer or a close after Windows' `session-end`
// (irrevocable, RC5, R24) closes at once: no prompt, no wait, no deletion (the next valid start
// deletes), and recovery is never cleared. `query-session-end` is only a question (the shutdown can
// still be cancelled): it asks the renderer for a best-effort flush, prevents nothing, waits for
// nothing and changes no guard state. Quit waits for one flush of settings and recovery (not run at
// a Windows session end). R37: the `close-requested` waits in the open-request queue behind earlier
// opens when one is given.
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

/** The parts of the session store the close uses (a fake chain in tests). */
export interface SessionChain {
  /** Settles once every task queued so far has run. */
  idle(): Promise<void>;
  /** A task is queued or running. */
  busy(): boolean;
  /** Queues the deletion of the discarded records (SS3, SS11); settles when it has run. */
  deleteDiscarded(): Promise<void>;
}

/**
 * Waits until the chain has no task queued or running, also for tasks that arrive meanwhile.
 * True when it was seen empty; false when `idle` failed (the chain's state is then unknown).
 */
async function drained(chain: SessionChain): Promise<boolean> {
  while (chain.busy()) {
    try {
      await chain.idle();
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * SS10 after N5: the recovery chain idle, the session chain empty, the discarded records deleted on
 * the empty chain, and the chain empty again. Never rejects: a failure only skips what follows it
 * (the deletion is skipped when the chain was not seen empty; the next valid start deletes them).
 */
async function settleBeforeClose(ports: CloseGuardPorts): Promise<void> {
  await ports.recoveryIdle().catch(() => undefined);
  if (!(await drained(ports.sessionChain))) return;
  await ports.sessionChain.deleteDiscarded().catch(() => undefined);
  await drained(ports.sessionChain);
}

export interface CloseGuardPorts {
  /** Runs for every close that goes ahead (W2 remembers the bounds then). */
  closing(): void;
  /** Settles when every recovery write and clear queued so far has run (RC6). */
  recoveryIdle(): Promise<void>;
  /** The session store's one chain (SS5, `session-store.ts`): N5 waits for it to be empty (SS10). */
  sessionChain: SessionChain;
  /**
   * R37: hands `close-requested` to the open-request queue, so it is sent behind every open that
   * arrived before it (`model/open-requests.ts`). Without it the request is sent at once.
   */
  requestClose?(): void;
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
  // state changes (the shutdown may be cancelled); the renderer flushes the session store at once (R25, SS10).
  win.on('query-session-end', () => {
    send({ type: 'flush-session' });
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
    if (ports.requestClose) ports.requestClose();
    else send({ type: 'close-requested' });
  });
  return {
    /** N1 arrived: the renderer listens for main events now. */
    rendererReady(): void {
      ready = true;
    },
    /**
     * N5: the renderer ran its close flush and sent N4 first; close once that clear has run and
     * the session chain is empty with the discarded records deleted (SS10), once.
     */
    closeOk(): void {
      if (closingNow) return;
      closingNow = true;
      void settleBeforeClose(ports).then(() => {
        allowed = true;
        if (!win.isDestroyed()) win.close();
      });
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
