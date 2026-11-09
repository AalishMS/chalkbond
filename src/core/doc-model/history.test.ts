import { describe, expect, it } from 'vitest';
import { addAtom, updateAtom } from './atoms';
import { addBond } from './bonds';
import { emptyDoc } from './doc';
import { DocError } from './errors';
import {
  canRedo,
  canUndo,
  createHistory,
  current,
  HISTORY_DEPTH,
  redo,
  redoLabel,
  transact,
  undo,
  undoLabel,
  type History,
} from './history';
import { checkInvariants } from './invariants';
import type { AtomId, Doc } from './types';

const T0 = '2026-11-09T00:00:00.000Z';

/** Clock that returns T+1s, T+2s, … so every transact gets a distinct stamp. */
function tickingClock(): () => string {
  let n = 0;
  return () => new Date(Date.parse(T0) + ++n * 1000).toISOString();
}

function fresh(): History {
  return createHistory(emptyDoc(T0), { clock: tickingClock() });
}

const addCarbon =
  (x: number) =>
  (d: Doc): Doc =>
    addAtom(d, { x, y: 0 })[0];

function undoAll(h: History): History {
  while (canUndo(h)) h = undo(h);
  return h;
}

function redoAll(h: History): History {
  while (canRedo(h)) h = redo(h);
  return h;
}

describe('createHistory', () => {
  it('starts with the doc and nothing to undo or redo', () => {
    const doc = emptyDoc(T0);
    const h = createHistory(doc);
    expect(current(h)).toBe(doc);
    expect([canUndo(h), canRedo(h), undoLabel(h), redoLabel(h)]).toEqual([
      false,
      false,
      undefined,
      undefined,
    ]);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it('uses the system clock by default', () => {
    const h = transact(createHistory(emptyDoc(T0)), 'add', addCarbon(0));
    expect(Date.parse(current(h).meta.modified)).toBeGreaterThan(Date.parse(T0));
  });
});

describe('transact / undo / redo', () => {
  it('undo after N transactions restores each prior doc exactly; redo re-applies', () => {
    let h = fresh();
    const snapshots: Doc[] = [current(h)];
    let prev: AtomId | undefined;
    for (let i = 0; i < 8; i++) {
      // Each step adds an atom and bonds it to the previous one (a chain).
      h = transact(h, `step ${i}`, (d) => {
        const [d1, id] = addAtom(d, { x: i, y: 0 });
        const d2 = prev === undefined ? d1 : addBond(d1, prev, id)[0];
        prev = id;
        return d2;
      });
      snapshots.push(current(h));
    }
    for (let i = 8; i > 0; i--) {
      expect(undoLabel(h)).toBe(`step ${i - 1}`);
      h = undo(h);
      expect(current(h)).toEqual(snapshots[i - 1]);
    }
    expect(canUndo(h)).toBe(false);
    for (let i = 1; i <= 8; i++) {
      expect(redoLabel(h)).toBe(`step ${i - 1}`);
      h = redo(h);
      expect(current(h)).toEqual(snapshots[i]);
    }
    expect(canRedo(h)).toBe(false);
  });

  it('stamps meta.modified as part of the same step', () => {
    let h = transact(fresh(), 'add', addCarbon(0));
    expect(current(h).meta.modified).toBe('2026-11-09T00:00:01.000Z');
    expect(current(h).meta.created).toBe(T0);
    h = undo(h);
    expect(current(h).meta.modified).toBe(T0);
    h = redo(h);
    expect(current(h).meta.modified).toBe('2026-11-09T00:00:01.000Z');
  });

  it('a recipe that changes nothing records no step', () => {
    const h = fresh();
    expect(transact(h, 'nothing', (d) => d)).toBe(h);
  });

  it('a recipe that throws leaves the history unchanged', () => {
    const h = transact(fresh(), 'add', addCarbon(0));
    expect(() => transact(h, 'bad', (d) => addBond(d, 'a1' as AtomId, 'a1' as AtomId)[0])).toThrow(
      DocError,
    );
    expect(current(h).atoms).toHaveProperty('a1');
    expect(undoLabel(h)).toBe('add');
  });

  it('accepts a recipe that returns a replacement doc and can undo it', () => {
    let h = transact(fresh(), 'add', addCarbon(0));
    const before = current(h);
    h = transact(h, 'retitle', (d) => ({ ...d, meta: { ...d.meta, title: 'Scheme 1' } }));
    expect(current(h).meta.title).toBe('Scheme 1');
    expect(current(h).atoms).toEqual(before.atoms);
    expect(undo(h).doc).toEqual(before);
  });

  it('a new transact after undo clears redo', () => {
    let h = transact(fresh(), 'one', addCarbon(0));
    h = transact(h, 'two', addCarbon(1));
    h = undo(h);
    expect(canRedo(h)).toBe(true);
    h = transact(h, 'three', addCarbon(2));
    expect(canRedo(h)).toBe(false);
    expect(redo(h)).toBe(h);
    // Undo restored nextId, so the undone atom's id is issued again.
    expect(Object.keys(current(h).atoms)).toEqual(['a1', 'a2']);
    expect(current(h).atoms['a2' as AtomId]?.x).toBe(2);
  });

  it('history values are immutable', () => {
    const h = transact(fresh(), 'one', addCarbon(0));
    expect(Object.isFrozen(h)).toBe(true);
    expect(Object.isFrozen(current(h))).toBe(true);
  });
});

describe('coalescing', () => {
  function drag(h: History, key: string, moves: number): History {
    for (let i = 1; i <= moves; i++) {
      h = transact(h, 'Move atom', (d) => updateAtom(d, 'a1' as AtomId, { x: i * 0.01 }), {
        coalesceKey: key,
      });
    }
    return h;
  }

  it('200 transactions with the same key are one undo step', () => {
    let h = transact(fresh(), 'add', addCarbon(0));
    const start = current(h);
    h = drag(h, 'drag-1', 200);
    expect(current(h).atoms['a1' as AtomId]?.x).toBeCloseTo(2);
    expect(h.past).toHaveLength(2);
    expect(undoLabel(h)).toBe('Move atom');
    const end = current(h);
    h = undo(h);
    expect(current(h)).toEqual(start);
    expect(undoLabel(h)).toBe('add');
    h = redo(h);
    expect(current(h)).toEqual(end);
  });

  it('a different key starts a new step', () => {
    let h = transact(fresh(), 'add', addCarbon(0));
    h = drag(h, 'drag-1', 3);
    h = drag(h, 'drag-2', 3);
    expect(h.past).toHaveLength(3);
  });

  it('a non-keyed transact breaks the run', () => {
    let h = transact(fresh(), 'add', addCarbon(0));
    h = drag(h, 'drag-1', 3);
    h = transact(h, 'add', addCarbon(5));
    h = drag(h, 'drag-1', 3);
    expect(h.past).toHaveLength(4);
  });

  it('undo breaks the run (no merging into an earlier step)', () => {
    let h = transact(fresh(), 'add', addCarbon(0));
    h = drag(h, 'drag-1', 3);
    h = undo(h);
    h = redo(h);
    h = drag(h, 'drag-1', 3);
    expect(h.past).toHaveLength(3);
  });

  it('a no-op keyed transact does not break the run', () => {
    let h = transact(fresh(), 'add', addCarbon(0));
    h = drag(h, 'drag-1', 2);
    h = transact(h, 'Move atom', (d) => d, { coalesceKey: 'drag-1' });
    h = drag(h, 'drag-1', 2);
    expect(h.past).toHaveLength(2);
  });
});

describe('depth limit', () => {
  it(`keeps ${HISTORY_DEPTH} steps; the ${HISTORY_DEPTH + 1}st drops the oldest`, () => {
    let h = fresh();
    for (let i = 0; i < HISTORY_DEPTH + 1; i++) h = transact(h, `add ${i}`, addCarbon(i));
    expect(h.past).toHaveLength(HISTORY_DEPTH);
    h = undoAll(h);
    // Step "add 0" was dropped, so undo stops at the doc with one atom.
    expect(Object.keys(current(h).atoms)).toEqual(['a1']);
    expect(redoLabel(h)).toBe('add 1');
  });
});

describe('Checkpoint B: benzene built step by step', () => {
  it('builds benzene via transact, undoes to empty, redoes to benzene', () => {
    let h = fresh();
    const start = current(h);
    const ids: AtomId[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      h = transact(h, 'Add atom', (d) => {
        const [next, id] = addAtom(d, { x: Math.cos(angle), y: Math.sin(angle) });
        ids.push(id);
        return next;
      });
    }
    for (let i = 0; i < 6; i++) {
      h = transact(h, 'Add bond', (d) => addBond(d, ids[i]!, ids[(i + 1) % 6]!, { order: 1.5 })[0]);
    }
    const benzene = current(h);
    expect(Object.keys(benzene.atoms)).toHaveLength(6);
    expect(Object.values(benzene.bonds).map((b) => b.order)).toEqual([
      1.5, 1.5, 1.5, 1.5, 1.5, 1.5,
    ]);
    expect(checkInvariants(benzene)).toEqual([]);

    let undone = 0;
    while (canUndo(h)) {
      h = undo(h);
      undone++;
      expect(checkInvariants(current(h))).toEqual([]);
    }
    expect(undone).toBe(12);
    expect(current(h)).toEqual(start);

    h = redoAll(h);
    expect(current(h)).toEqual(benzene);
  });
});
