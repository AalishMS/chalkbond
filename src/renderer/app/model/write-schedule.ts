// SS4 "When written" (SPEC-app-shell.md, "Tabs, auto-save and session"), pure: the clock and the
// scheduler are injected and nothing is written here. The host reports what happened (`event`) and
// `write` says which writes are due now: the active tab's record and / or the session index.
//
//   doc            the active tab's drawing or history changed: the record on AS2's timer (2 s after
//                  the last change, at most 10 s into a burst), every kind of tab
//   tabs           the tab list, order, active tab, names, kinds, bindings or markers changed: the
//                  index 500 ms after the last such change (debounce, like ST3)
//   view           the editor's `view` event: the index 2 s after the last one; never a record
//   file-written   an AS1 write finished (the written hash): the index at once
//   switch, save, save-as, close, flush-session
//                  the flush points: the record and the index at once. The record is written even if
//                  it did not change since the last one, because Save as changes the record's name
//                  and kind and a new tab has none yet; these are rare, deliberate moments.
//
// One index write covers every pending index change, so it settles both debounces. Nothing is
// scheduled for an inactive tab: only the active tab's events reach this object. A cancelled or
// rescheduled callback that still runs (a timer that fired late) does nothing.
import { createAutosaveTimer } from './autosave-timer';

export const INDEX_DEBOUNCE_MS = 500;
export const VIEW_DEBOUNCE_MS = 2000;

export type FlushPoint = 'switch' | 'save' | 'save-as' | 'close' | 'flush-session';
export type ScheduleEvent = 'doc' | 'tabs' | 'view' | 'file-written' | FlushPoint;
/** Why a write is due: `timer` (AS2), `index` (tab-list debounce), `view`, `file-written`, or a flush point. */
export type WriteCause = 'timer' | 'index' | 'view' | 'file-written' | FlushPoint;

export interface WriteDue {
  /** Write the active tab's record (from `snapshotState`). */
  record: boolean;
  /** Write the session index. When both are due the record goes first (SS5). */
  index: boolean;
  cause: WriteCause;
}

export interface WriteSchedulePorts {
  /** Milliseconds, monotonic enough for the difference of two readings. */
  now(): number;
  /** Runs `fn` after `ms`; returns a cancel function. */
  schedule(fn: () => void, ms: number): () => void;
  /** The writes that are due. */
  write(due: WriteDue): void;
}

export interface WriteSchedule {
  event(e: ScheduleEvent): void;
  /** Drops the pending record write and ends the burst (the active tab was closed). */
  cancelRecord(): void;
  /** Drops every pending write. */
  cancel(): void;
  recordPending(): boolean;
  indexPending(): boolean;
}

export function createWriteSchedule(ports: WriteSchedulePorts): WriteSchedule {
  const record = createAutosaveTimer({
    now: ports.now,
    schedule: ports.schedule,
    fire: () => ports.write({ record: true, index: false, cause: 'timer' }),
  });

  let stopTabs: (() => void) | null = null;
  let stopView: (() => void) | null = null;
  let generation = 0;

  const cancelIndex = (): void => {
    generation++;
    stopTabs?.();
    stopView?.();
    stopTabs = null;
    stopView = null;
  };
  const debounce = (cause: 'index' | 'view', ms: number): (() => void) => {
    const mine = generation;
    return ports.schedule(() => {
      if (mine !== generation) return;
      cancelIndex();
      ports.write({ record: false, index: true, cause });
    }, ms);
  };

  return {
    event(e) {
      switch (e) {
        case 'doc':
          record.change();
          return;
        case 'tabs':
          stopTabs?.();
          stopTabs = debounce('index', INDEX_DEBOUNCE_MS);
          return;
        case 'view':
          stopView?.();
          stopView = debounce('view', VIEW_DEBOUNCE_MS);
          return;
        case 'file-written':
          cancelIndex();
          ports.write({ record: false, index: true, cause: e });
          return;
        default:
          record.cancel();
          cancelIndex();
          ports.write({ record: true, index: true, cause: e });
      }
    },
    cancelRecord: () => record.cancel(),
    cancel() {
      record.cancel();
      cancelIndex();
    },
    recordPending: () => record.pending(),
    indexPending: () => stopTabs !== null || stopView !== null,
  };
}
