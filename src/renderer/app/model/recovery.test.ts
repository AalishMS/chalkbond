// The renderer side of recovery (SPEC-app-shell.md RC1, RC2, RC5): N3 with the committed drawing
// while dirty, N4 when the drawing becomes clean, stale callbacks after a clear never write.
import { describe, expect, it } from 'vitest';
import { createRecovery } from './recovery';

function rig() {
  let now = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  let ids = 0;
  const start = { v: 0 };
  const state = { doc: start, saved: start as object, forced: false, name: 'Untitled' };
  const sent: string[] = [];
  const recovery = createRecovery({
    now: () => now,
    schedule: (fn, ms) => {
      const id = ids++;
      due.set(id, { at: now + ms, fn });
      return () => due.delete(id);
    },
    main: {
      writeRecovery: ({ text, name }) => sent.push(`write ${text} ${name}`),
      clearRecovery: () => sent.push('clear'),
    },
    dirty: () => state.forced || state.doc !== state.saved,
    doc: () => state.doc,
    text: () => JSON.stringify(state.doc),
    name: () => state.name,
  });
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = [...due.entries()]
        .sort((a, b) => a[1].at - b[1].at)
        .find(([, d]) => d.at <= end);
      if (!next) break;
      due.delete(next[0]);
      now = next[1].at;
      next[1].fn();
    }
    now = end;
  };
  const edit = () => {
    state.doc = { v: state.doc.v + 1 };
    recovery.update();
  };
  return { state, sent, recovery, advance, edit, due };
}

describe('recovery (RC1 writes)', () => {
  it('an edit writes the committed drawing and the session name 2 s later', () => {
    const r = rig();
    r.state.name = 'esterification.chalk';
    r.edit();
    r.advance(1999);
    expect(r.sent).toEqual([]);
    r.advance(1);
    expect(r.sent).toEqual(['write {"v":1} esterification.chalk']);
  });

  it('events that do not change the drawing (selection, busy) do not restart the timer', () => {
    const r = rig();
    r.edit();
    r.advance(1500);
    r.recovery.update();
    r.advance(500);
    expect(r.sent).toEqual(['write {"v":1} Untitled']);
  });

  it('steady edits every second write at 10 s with the newest drawing', () => {
    const r = rig();
    for (let i = 0; i < 10; i++) {
      r.edit();
      r.advance(1000);
    }
    expect(r.sent).toEqual(['write {"v":10} Untitled']);
  });
});

describe('recovery (RC2 clears)', () => {
  it('undo back to the saved drawing clears once and cancels the pending write', () => {
    const r = rig();
    const saved = r.state.doc;
    r.edit();
    r.advance(2000);
    r.state.doc = saved;
    r.recovery.update();
    r.recovery.update();
    r.advance(10_000);
    expect(r.sent).toEqual(['write {"v":1} Untitled', 'clear']);
  });

  it('a recovered drawing (forcedDirty) is never cleared by undoing to its loaded state', () => {
    const r = rig();
    r.state.forced = true;
    r.recovery.adopt();
    r.edit();
    r.state.doc = r.state.saved as { v: number };
    r.recovery.update();
    r.advance(2000);
    expect(r.sent).toEqual(['write {"v":0} Untitled']);
  });

  it('clear cancels a pending write; a stale callback after it never writes', () => {
    const r = rig();
    r.edit();
    const [queued] = [...r.due.values()];
    r.state.saved = r.state.doc; // New / Open loaded: clean
    r.recovery.clear();
    queued?.fn();
    r.advance(30_000);
    expect(r.sent).toEqual(['clear']);
  });

  it('a stale callback while dirty but after a newer reschedule does not write twice', () => {
    const r = rig();
    r.edit();
    const [first] = [...r.due.values()];
    r.advance(500);
    r.edit();
    first?.fn();
    r.advance(2000);
    expect(r.sent).toEqual(['write {"v":2} Untitled']);
  });

  it('settle after a save: clean → clear; still dirty (newer edit during the write) → retained', () => {
    const r = rig();
    r.edit();
    r.advance(2000); // recovery holds v1
    r.edit(); // v2 while the save of v1 is written
    r.advance(2000); // recovery holds v2
    r.recovery.settle(); // the save of v1 finished; v2 is still dirty
    expect(r.sent).toEqual(['write {"v":1} Untitled', 'write {"v":2} Untitled']);
    r.state.saved = r.state.doc;
    r.recovery.update(); // markSaved after a later save: clean → clear
    r.recovery.settle();
    expect(r.sent.at(-1)).toBe('clear');
    expect(r.sent.filter((s) => s === 'clear')).toHaveLength(1);
  });

  it('explicit clear always sends N4 once per write (a file from the last run may exist)', () => {
    const r = rig();
    r.recovery.clear();
    r.recovery.clear();
    r.edit();
    r.advance(2000);
    r.state.saved = r.state.doc;
    r.recovery.clear();
    expect(r.sent).toEqual(['clear', 'write {"v":1} Untitled', 'clear']);
  });
});

describe('recovery (RC5 flush)', () => {
  it('writes at once when dirty, pending or not; nothing when clean', () => {
    const r = rig();
    r.recovery.flush();
    expect(r.sent).toEqual([]);
    r.edit();
    r.advance(300);
    r.recovery.flush();
    expect(r.sent).toEqual(['write {"v":1} Untitled']);
    r.advance(5000);
    r.recovery.flush(); // dirty, nothing pending: written again (the newest drawing)
    expect(r.sent).toHaveLength(2);
  });
});
