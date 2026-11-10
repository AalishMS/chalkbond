// Pointer-move coalescing: many events in a frame, one delivery (SPEC-editor.md "Tools and
// gestures"). Frame scheduling is injected: `model/` reads no animation-frame API.

export interface Coalescer<T> {
  /** Merges `value` into the pending one and schedules a delivery for the next frame. */
  push(value: T): void;
  /** Delivers the pending value now (a pointer-up must not wait for a frame). */
  flush(): void;
  /** Drops the pending value. */
  cancel(): void;
}

/**
 * `schedule(run)` arranges `run` for the next frame and returns a function that cancels it.
 * `merge(pending, next)` combines two values: the latest wins for positions, sums for deltas.
 */
export function createCoalescer<T>(
  schedule: (run: () => void) => () => void,
  merge: (pending: T, next: T) => T,
  deliver: (value: T) => void,
): Coalescer<T> {
  let pending: { value: T } | null = null;
  let cancelFrame: (() => void) | null = null;

  const flush = (): void => {
    cancelFrame?.();
    cancelFrame = null;
    const batch = pending;
    pending = null;
    if (batch !== null) deliver(batch.value);
  };

  return {
    push(value) {
      pending = { value: pending === null ? value : merge(pending.value, value) };
      cancelFrame ??= schedule(flush);
    },
    flush,
    cancel() {
      cancelFrame?.();
      cancelFrame = null;
      pending = null;
    },
  };
}
