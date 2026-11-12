// AS2 timing (SPEC-app-shell.md "Tabs, auto-save and session"; RC1 before it): a write 2 s after the
// last document change, and never more than 10 s after the first change of a burst. Pure: the clock
// and the scheduler are injected. A cancelled or rescheduled callback that still runs (a timer that
// fired late) does nothing.

export const AUTOSAVE_IDLE_MS = 2000;
export const AUTOSAVE_MAX_MS = 10_000;

export interface AutosaveTimerPorts {
  /** Milliseconds, monotonic enough for the difference of two readings. */
  now(): number;
  /** Runs `fn` after `ms`; returns a cancel function. */
  schedule(fn: () => void, ms: number): () => void;
  /** The write. */
  fire(): void;
}

export interface AutosaveTimer {
  /** A document change while dirty. */
  change(): void;
  /** Drops the pending write and ends the burst. */
  cancel(): void;
  /** Fires a pending write at once; true when one was pending. */
  flush(): boolean;
  pending(): boolean;
}

export function createAutosaveTimer(ports: AutosaveTimerPorts): AutosaveTimer {
  let burstStart: number | null = null;
  let stop: (() => void) | null = null;
  let generation = 0;

  const cancel = (): void => {
    generation++;
    stop?.();
    stop = null;
    burstStart = null;
  };
  const fire = (): void => {
    cancel();
    ports.fire();
  };

  return {
    change() {
      const now = ports.now();
      const start = burstStart ?? now;
      const at = Math.min(now + AUTOSAVE_IDLE_MS, start + AUTOSAVE_MAX_MS);
      stop?.();
      burstStart = start;
      const mine = ++generation;
      stop = ports.schedule(
        () => {
          if (mine === generation) fire();
        },
        Math.max(0, at - now),
      );
    },
    cancel,
    flush() {
      if (stop === null) return false;
      fire();
      return true;
    },
    pending: () => stop !== null,
  };
}
