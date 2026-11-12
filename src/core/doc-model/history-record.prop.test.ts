import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { command, run } from './__fixtures__/arbitraries';
import { emptyDoc } from './doc';
import { canRedo, canUndo, createHistory, current, undo, type History } from './history';
import { historyFromRecord, historyToRecord, type HistoryRecord } from './history-record';

// SPEC-doc-model.md D2: random transacts (with undo and redo), record, restore, undo all the way:
// the same drawings as the original history. A failure prints a seed; reproduce with it.
const RUNS = 500;
const TIMEOUT = 120_000;
const NOW = '2026-11-09T00:00:00.000Z';
const sequence = fc.array(command, { minLength: 1, maxLength: 50, size: 'max' });

function fixedClock(): () => string {
  let n = 0;
  return () => new Date(Date.parse(NOW) + ++n * 1000).toISOString();
}

function build(cmds: readonly Parameters<typeof run>[1][]): History {
  return cmds.reduce(run, createHistory(emptyDoc(NOW), { clock: fixedClock() }));
}

function viaJson(record: HistoryRecord): HistoryRecord {
  return JSON.parse(JSON.stringify(record)) as HistoryRecord;
}

describe('history record properties (D2)', () => {
  it(
    'record, restore, undo all the way: the same drawings as the original',
    () => {
      fc.assert(
        fc.property(sequence, fc.nat({ max: 60 }), (cmds, maxSteps) => {
          let original = build(cmds);
          const r = historyFromRecord(viaJson(historyToRecord(original, { maxSteps })));
          expect(r.ok).toBe(true);
          if (!r.ok) return;
          let restored = r.value.history;
          expect(r.value.dropped).toBe(0);
          expect(canRedo(restored)).toBe(false);
          expect(current(restored)).toEqual(current(original));
          const kept = Math.min(maxSteps, original.past.length);
          for (let i = 0; i < kept; i++) {
            original = undo(original);
            restored = undo(restored);
            expect(current(restored)).toEqual(current(original));
          }
          expect(canUndo(restored)).toBe(false);
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );

  it(
    'a damaged step drops exactly itself and the older ones, never the drawing',
    () => {
      fc.assert(
        fc.property(sequence, fc.nat(), (cmds, pick) => {
          const original = build(cmds);
          const record = viaJson(historyToRecord(original, { maxSteps: 100 }));
          fc.pre(record.past.length > 0);
          const k = pick % record.past.length;
          const past = record.past.map((s, i) =>
            i === k ? { ...s, inverse: [{ op: 'replace', path: ['nextId'], value: -1 }] } : s,
          );
          const r = historyFromRecord({ ...record, past });
          expect(r.ok).toBe(true);
          if (!r.ok) return;
          expect(r.value.dropped).toBe(k + 1);
          expect(current(r.value.history)).toEqual(current(original));
          let restored = r.value.history;
          for (let i = k + 1; i < record.past.length; i++) restored = undo(restored);
          expect(canUndo(restored)).toBe(false);
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );
});
