// SS4 "When written" as a table over an injected clock: which writes are due now and when. One test
// per clause of the rule. Nothing here touches a store; `write` only records what was asked for.
import { describe, expect, it } from 'vitest';
import {
  createWriteSchedule,
  INDEX_DEBOUNCE_MS,
  VIEW_DEBOUNCE_MS,
  type WriteDue,
} from './write-schedule';

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
    raw: due,
  };
}

function rig() {
  const time = fakeTime();
  const writes: Array<WriteDue & { at: number }> = [];
  const schedule = createWriteSchedule({
    now: time.now,
    schedule: time.schedule,
    write: (due) => writes.push({ ...due, at: time.now() }),
  });
  return { time, writes, schedule };
}

describe('write schedule (SS4)', () => {
  it('constants: index 500 ms after a tab-list change, 2 s after a view change', () => {
    expect(INDEX_DEBOUNCE_MS).toBe(500);
    expect(VIEW_DEBOUNCE_MS).toBe(2000);
  });

  describe("the active tab's record", () => {
    it('a burst of changes writes one record 2 s after the last change', () => {
      const { time, writes, schedule } = rig();
      schedule.event('doc');
      time.advance(1000);
      schedule.event('doc');
      time.advance(1999);
      expect(writes).toEqual([]);
      time.advance(1);
      expect(writes).toEqual([{ record: true, index: false, cause: 'timer', at: 3000 }]);
      time.advance(60_000);
      expect(writes).toHaveLength(1);
    });

    it('a burst that never rests writes at the 10 s cap, then again 10 s later', () => {
      const { time, writes, schedule } = rig();
      for (let t = 0; t < 25_000; t += 500) {
        schedule.event('doc');
        time.advance(500);
      }
      expect(writes.map((w) => w.at)).toEqual([10_000, 20_000]);
      expect(writes.every((w) => w.record && !w.index && w.cause === 'timer')).toBe(true);
    });

    it('a change that rests for 2 s after a write starts a new burst', () => {
      const { time, writes, schedule } = rig();
      schedule.event('doc');
      time.advance(2000);
      schedule.event('doc');
      time.advance(2000);
      expect(writes.map((w) => w.at)).toEqual([2000, 4000]);
    });

    it('a view event alone writes no record', () => {
      const { time, writes, schedule } = rig();
      schedule.event('view');
      time.advance(60_000);
      expect(writes.every((w) => !w.record)).toBe(true);
      expect(schedule.recordPending()).toBe(false);
    });

    it('a tab-list event alone writes no record', () => {
      const { time, writes, schedule } = rig();
      schedule.event('tabs');
      time.advance(60_000);
      expect(writes.every((w) => !w.record)).toBe(true);
    });

    it('a record write leaves the index alone (no index at the timer)', () => {
      const { time, writes, schedule } = rig();
      schedule.event('doc');
      time.advance(2000);
      expect(writes.map((w) => w.index)).toEqual([false]);
    });

    it('recordPending follows the timer; cancelRecord drops it (a closed tab)', () => {
      const { time, writes, schedule } = rig();
      expect(schedule.recordPending()).toBe(false);
      schedule.event('doc');
      expect(schedule.recordPending()).toBe(true);
      schedule.cancelRecord();
      expect(schedule.recordPending()).toBe(false);
      time.advance(60_000);
      expect(writes).toEqual([]);
    });
  });

  describe('at once on the flush points', () => {
    it.each(['switch', 'save', 'save-as', 'close', 'flush-session'] as const)(
      '%s writes the record and the index now',
      (point) => {
        const { writes, schedule } = rig();
        schedule.event(point);
        expect(writes).toEqual([{ record: true, index: true, cause: point, at: 0 }]);
      },
    );

    it('a switch flushes the outgoing tab record at once, before any timer', () => {
      const { time, writes, schedule } = rig();
      schedule.event('doc');
      time.advance(300);
      schedule.event('switch');
      expect(writes).toEqual([{ record: true, index: true, cause: 'switch', at: 300 }]);
    });

    it('a flush point settles every pending timer: nothing is written twice', () => {
      const { time, writes, schedule } = rig();
      schedule.event('doc');
      schedule.event('tabs');
      schedule.event('view');
      time.advance(100);
      schedule.event('flush-session');
      expect(schedule.recordPending()).toBe(false);
      expect(schedule.indexPending()).toBe(false);
      time.advance(60_000);
      expect(writes).toHaveLength(1);
    });

    it('a change after a flush point starts a new burst', () => {
      const { time, writes, schedule } = rig();
      time.advance(9000);
      schedule.event('doc');
      time.advance(1000);
      schedule.event('switch');
      schedule.event('doc');
      time.advance(2000);
      expect(writes.map((w) => [w.cause, w.at])).toEqual([
        ['switch', 10_000],
        ['timer', 12_000],
      ]);
    });
  });

  describe('the index', () => {
    it('is written 500 ms after the last tab-list change (debounce)', () => {
      const { time, writes, schedule } = rig();
      schedule.event('tabs');
      time.advance(400);
      schedule.event('tabs');
      time.advance(499);
      expect(writes).toEqual([]);
      time.advance(1);
      expect(writes).toEqual([{ record: false, index: true, cause: 'index', at: 900 }]);
    });

    it('is written 2 s after the last view change (debounce)', () => {
      const { time, writes, schedule } = rig();
      schedule.event('view');
      time.advance(1500);
      schedule.event('view');
      time.advance(1999);
      expect(writes).toEqual([]);
      time.advance(1);
      expect(writes).toEqual([{ record: false, index: true, cause: 'view', at: 3500 }]);
    });

    it('a continuous view change (pan) keeps pushing the write back', () => {
      const { time, writes, schedule } = rig();
      for (let t = 0; t < 10_000; t += 100) {
        schedule.event('view');
        time.advance(100);
      }
      expect(writes).toEqual([]);
      time.advance(2000);
      expect(writes).toHaveLength(1);
    });

    it('is written at once after every file write (the written hash)', () => {
      const { time, writes, schedule } = rig();
      schedule.event('file-written');
      expect(writes).toEqual([{ record: false, index: true, cause: 'file-written', at: 0 }]);
      time.advance(1000);
      schedule.event('file-written');
      expect(writes).toHaveLength(2);
    });

    it('one index write covers a pending tab-list change and a pending view change', () => {
      const { time, writes, schedule } = rig();
      schedule.event('view');
      time.advance(100);
      schedule.event('tabs');
      time.advance(500);
      expect(writes).toEqual([{ record: false, index: true, cause: 'index', at: 600 }]);
      expect(schedule.indexPending()).toBe(false);
      time.advance(60_000);
      expect(writes).toHaveLength(1);
    });

    it('a file write settles the pending index debounces', () => {
      const { time, writes, schedule } = rig();
      schedule.event('tabs');
      schedule.event('file-written');
      time.advance(60_000);
      expect(writes).toHaveLength(1);
    });

    it('a tab-list change does not touch the record timer', () => {
      const { time, writes, schedule } = rig();
      schedule.event('doc');
      schedule.event('tabs');
      time.advance(500);
      expect(writes.map((w) => w.cause)).toEqual(['index']);
      time.advance(1500);
      expect(writes.map((w) => w.cause)).toEqual(['index', 'timer']);
    });
  });

  describe('nothing for what did not change', () => {
    it('two inactive tabs that did not change write nothing, however long it runs', () => {
      const { time, writes } = rig();
      time.advance(10 * 60_000);
      expect(writes).toEqual([]);
    });

    it('a stale callback of a cancelled or flushed timer does nothing', () => {
      const { time, writes, schedule } = rig();
      schedule.event('doc');
      schedule.event('tabs');
      const stale = [...time.raw.values()].map((d) => d.fn);
      schedule.event('switch');
      for (const fn of stale) fn();
      expect(writes).toHaveLength(1);
    });

    it('cancel drops every pending write', () => {
      const { time, writes, schedule } = rig();
      schedule.event('doc');
      schedule.event('tabs');
      schedule.event('view');
      schedule.cancel();
      expect(schedule.recordPending()).toBe(false);
      expect(schedule.indexPending()).toBe(false);
      time.advance(60_000);
      expect(writes).toEqual([]);
    });
  });
});
