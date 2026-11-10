import { describe, expect, it, vi } from 'vitest';
import { createCoalescer } from './coalesce';

/** A manual frame scheduler: `frame()` runs what was scheduled. */
function manual(): { schedule: (run: () => void) => () => void; frame: () => void } {
  let pending: (() => void) | null = null;
  return {
    schedule(run) {
      pending = run;
      return () => {
        pending = null;
      };
    },
    frame() {
      const run = pending;
      pending = null;
      run?.();
    },
  };
}

describe('createCoalescer', () => {
  it('flushes once per frame with the merged value', () => {
    const { schedule, frame } = manual();
    const flush = vi.fn();
    const c = createCoalescer<number>(schedule, (a, b) => a + b, flush);
    c.push(1);
    c.push(2);
    c.push(3);
    expect(flush).not.toHaveBeenCalled();
    frame();
    expect(flush).toHaveBeenCalledOnce();
    expect(flush).toHaveBeenCalledWith(6);
    frame();
    expect(flush).toHaveBeenCalledOnce();
  });

  it('keeps only the latest value when the merge says so', () => {
    const { schedule, frame } = manual();
    const flush = vi.fn();
    const c = createCoalescer<string>(schedule, (_a, b) => b, flush);
    c.push('a');
    c.push('b');
    frame();
    expect(flush).toHaveBeenCalledWith('b');
  });

  it('flush() delivers at once and the scheduled frame then does nothing', () => {
    const { schedule, frame } = manual();
    const flush = vi.fn();
    const c = createCoalescer<number>(schedule, (a, b) => a + b, flush);
    c.push(4);
    c.flush();
    expect(flush).toHaveBeenCalledWith(4);
    frame();
    c.flush();
    expect(flush).toHaveBeenCalledOnce();
  });

  it('cancel() drops the pending value', () => {
    const { schedule, frame } = manual();
    const flush = vi.fn();
    const c = createCoalescer<number>(schedule, (a, b) => a + b, flush);
    c.push(4);
    c.cancel();
    frame();
    c.flush();
    expect(flush).not.toHaveBeenCalled();
  });

  it('starts a fresh batch after a flush', () => {
    const { schedule, frame } = manual();
    const flush = vi.fn();
    const c = createCoalescer<number>(schedule, (a, b) => a + b, flush);
    c.push(1);
    frame();
    c.push(5);
    frame();
    expect(flush.mock.calls).toEqual([[1], [5]]);
  });
});
