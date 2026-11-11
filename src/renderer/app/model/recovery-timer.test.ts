// RC1 timing (SPEC-app-shell.md): 2 s after the last change, never more than 10 s after the first
// change of a burst; injected clock and scheduler; a cancelled or stale callback never fires.
import { describe, expect, it } from 'vitest';
import { createRecoveryTimer, RECOVERY_IDLE_MS, RECOVERY_MAX_MS } from './recovery-timer';

/** A fake clock and scheduler: `advance` runs due callbacks in time order. */
function fakeTime() {
  let now = 0;
  let next = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    schedule(fn: () => void, ms: number) {
      const id = next++;
      due.set(id, { at: now + ms, fn });
      return () => due.delete(id);
    },
    /** Every callback ever scheduled and not cancelled, even if already due (stale tests). */
    pending: () => due.size,
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const [id, first] =
          [...due.entries()].sort((a, b) => a[1].at - b[1].at).find(([, d]) => d.at <= end) ?? [];
        if (id === undefined || first === undefined) break;
        due.delete(id);
        now = first.at;
        first.fn();
      }
      now = end;
    },
    /** Runs a callback that was captured before it was cancelled (a timer that fired late). */
    raw: due,
  };
}

function rig() {
  const time = fakeTime();
  const fired: number[] = [];
  const timer = createRecoveryTimer({
    now: time.now,
    schedule: time.schedule,
    fire: () => fired.push(time.now()),
  });
  return { time, fired, timer };
}

describe('recovery timer (RC1)', () => {
  it('constants: 2 s idle, 10 s at most', () => {
    expect(RECOVERY_IDLE_MS).toBe(2000);
    expect(RECOVERY_MAX_MS).toBe(10_000);
  });

  it('one edit writes 2 s later, once', () => {
    const { time, fired, timer } = rig();
    timer.change();
    time.advance(1999);
    expect(fired).toEqual([]);
    time.advance(1);
    expect(fired).toEqual([2000]);
    time.advance(20_000);
    expect(fired).toEqual([2000]);
    expect(timer.pending()).toBe(false);
  });

  it('steady edits every 1 s write at 10 s, then a new burst starts', () => {
    const { time, fired, timer } = rig();
    for (let t = 0; t < 14_000; t += 1000) {
      timer.change();
      time.advance(1000);
    }
    expect(fired).toEqual([10_000]);
    time.advance(2000); // the last change was at 13 s: 15 s
    expect(fired).toEqual([10_000, 15_000]);
  });

  it('a burst that pauses writes 2 s after its last change', () => {
    const { time, fired, timer } = rig();
    timer.change();
    time.advance(1500);
    timer.change();
    time.advance(1500);
    timer.change();
    time.advance(5000);
    expect(fired).toEqual([5000]);
  });

  it('cancel (save, New, Open, undo to saved) drops the pending write and the burst', () => {
    const { time, fired, timer } = rig();
    timer.change();
    time.advance(1000);
    timer.cancel();
    expect(timer.pending()).toBe(false);
    time.advance(30_000);
    expect(fired).toEqual([]);
    expect(time.pending()).toBe(0);
    timer.change();
    time.advance(2000);
    expect(fired).toEqual([33_000]);
  });

  it('flush fires a pending write at once (RC5); with nothing pending it does nothing', () => {
    const { time, fired, timer } = rig();
    expect(timer.flush()).toBe(false);
    timer.change();
    time.advance(500);
    expect(timer.flush()).toBe(true);
    expect(fired).toEqual([500]);
    time.advance(10_000);
    expect(fired).toEqual([500]);
  });

  it('a stale callback (cancelled after it was queued) never fires', () => {
    const { time, fired, timer } = rig();
    timer.change();
    const [queued] = [...time.raw.values()];
    timer.cancel();
    queued?.fn();
    expect(fired).toEqual([]);
    timer.change();
    const [second] = [...time.raw.values()];
    timer.change(); // rescheduled: the first callback is stale now
    second?.fn();
    expect(fired).toEqual([]);
    time.advance(2000);
    expect(fired).toHaveLength(1);
  });
});
