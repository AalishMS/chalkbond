// SPEC-editor.md R57 (part 2): a tab's state as doc-model's history record (D2) and back, for
// app-shell's session store (SS3: the record's `editor` field; R50: 100 steps stored, no redo).
import {
  addAtom,
  addBond,
  createHistory,
  current,
  deleteItems,
  emptyDoc,
  findBond,
  transact,
  undo,
  updateAtom,
  type AtomId,
  type Doc,
  type History,
} from '@core/doc-model';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createEditorController, type EditorController } from './controller';
import { EMPTY_SELECTION } from './editor-state';
import {
  sealTabState,
  tabStateCanRedo,
  tabStateCanUndo,
  tabStateDirty,
  tabStateDoc,
  tabStateMarkSaved,
  tabStateParts,
  tabStateView,
  type EditorTabState,
} from './tab-state';
import { tabStateFromRecord, tabStateToRecord, type EditorTabRecord } from './tab-state-record';
import { addEthane, T0 } from './testing';

const T1 = '2026-11-12T08:00:00.000Z';
const VIEW = { zoom: 1.5, centre: { x: 2.25, y: -1.5 } };

const make = (): EditorController => {
  const c = createEditorController({ clock: () => T0, logError: () => undefined });
  c.store.dispatch({ type: 'canvas-resized', size: { w: 1000, h: 600 } });
  return c;
};

/** `n` committed edits through the controller: each adds an ethane (one undo step each). */
function edited(n: number): EditorController {
  const c = make();
  for (let i = 0; i < n; i++) {
    c.store.dispatch({ type: 'commit', label: `Add ethane ${i}`, recipe: addEthane });
  }
  return c;
}

const viaJson = (r: EditorTabRecord): unknown => JSON.parse(JSON.stringify(r)) as unknown;

function restore(
  value: unknown,
  saved: 'current' | 'unknown' = 'current',
  clock: () => string = () => T1,
): { state: EditorTabState; droppedSteps: number } {
  const r = tabStateFromRecord(value, { clock, view: VIEW, saved });
  if (!r.ok) throw new Error(`expected a state, got ${r.error.code}: ${r.error.message}`);
  return r.value;
}

/** The drawings met by undoing all the way, newest first (the current one included). */
function undoChain(h: History): Doc[] {
  const docs = [current(h)];
  let at = h;
  while (at.past.length > 0) {
    at = undo(at);
    docs.push(current(at));
  }
  return docs;
}

describe('tabStateToRecord (R57)', () => {
  it("holds doc-model's HistoryRecord and nothing else (no view, no saved state)", () => {
    const c = edited(2);
    c.run('zoom-in');
    const record = tabStateToRecord(c.snapshotState(), { maxSteps: 100 });
    expect(Object.keys(record).sort()).toEqual(['file', 'format', 'past', 'version']);
    expect(record.format).toBe('chalkbond-history');
    expect(record.version).toBe(1);
    expect(record.past).toHaveLength(2);
    for (const step of record.past) {
      expect(Object.keys(step).sort()).toEqual(['inverse', 'label', 'patches']);
    }
    expect(JSON.parse(JSON.stringify(record))).toEqual(record);
  });

  it('keeps the newest maxSteps undo steps and no redo steps', () => {
    const c = edited(5);
    c.run('undo');
    const s = c.snapshotState();
    expect(tabStateCanRedo(s)).toBe(true);
    const record = tabStateToRecord(s, { maxSteps: 3 });
    expect(record.past.map((p) => p.label)).toEqual([
      'Add ethane 1',
      'Add ethane 2',
      'Add ethane 3',
    ]);
    expect(tabStateToRecord(s, { maxSteps: 0 }).past).toEqual([]);
  });
});

describe('tabStateFromRecord (R57)', () => {
  it('round trip through JSON: same drawing, the same undo drawings, no redo steps', () => {
    const c = edited(4);
    c.run('undo');
    const s = c.snapshotState();
    const { state, droppedSteps } = restore(viaJson(tabStateToRecord(s, { maxSteps: 100 })));
    expect(droppedSteps).toBe(0);
    expect(tabStateDoc(state)).toEqual(tabStateDoc(s));
    expect(tabStateCanRedo(state)).toBe(false);
    expect(undoChain(tabStateParts(state).history)).toEqual(undoChain(tabStateParts(s).history));
    expect(tabStateParts(state).selection).toEqual(EMPTY_SELECTION);
  });

  it('only the last maxSteps undo steps come back; undoing them all gives that older drawing', () => {
    const c = edited(6);
    const s = c.snapshotState();
    const { state } = restore(viaJson(tabStateToRecord(s, { maxSteps: 2 })));
    const original = undoChain(tabStateParts(s).history);
    expect(undoChain(tabStateParts(state).history)).toEqual(original.slice(0, 3));
  });

  it('the view argument becomes the state view, and is put back by the controller', () => {
    const c = edited(1);
    const { state } = restore(viaJson(tabStateToRecord(c.snapshotState(), { maxSteps: 100 })));
    expect(tabStateView(state)).toEqual(VIEW);
    expect(tabStateParts(state).viewPending).toBe(false);
    const d = make();
    d.putState(state);
    expect(d.store.getState().viewport.zoom).toBe(VIEW.zoom);
    expect(tabStateView(d.snapshotState()).centre.x).toBeCloseTo(VIEW.centre.x, 9);
    expect(tabStateView(d.snapshotState()).centre.y).toBeCloseTo(VIEW.centre.y, 9);
  });

  it("saved: 'current' is clean", () => {
    const record = viaJson(tabStateToRecord(edited(2).snapshotState(), { maxSteps: 100 }));
    const { state } = restore(record, 'current');
    expect(tabStateDirty(state)).toBe(false);
    expect(tabStateCanUndo(state)).toBe(true);
    const d = make();
    d.putState(state);
    expect(d.isDirty()).toBe(false);
    d.run('undo');
    expect(d.isDirty()).toBe(true);
  });

  it("saved: 'unknown' is dirty, even after an undo and a redo back to the same drawing", () => {
    const record = viaJson(tabStateToRecord(edited(2).snapshotState(), { maxSteps: 100 }));
    const { state } = restore(record, 'unknown');
    expect(tabStateDirty(state)).toBe(true);
    const d = make();
    d.putState(state);
    expect(d.isDirty()).toBe(true);
    d.run('undo');
    d.run('redo');
    expect(d.getDoc()).toEqual(tabStateDoc(state));
    expect(d.isDirty()).toBe(true);
    // A switch away and back keeps it unknown.
    const taken = d.takeState();
    expect(tabStateDirty(taken)).toBe(true);
    d.putState(taken);
    expect(d.isDirty()).toBe(true);
  });

  it("saved: 'unknown' becomes clean through markSaved or tabStateMarkSaved", () => {
    const record = viaJson(tabStateToRecord(edited(1).snapshotState(), { maxSteps: 100 }));
    const { state } = restore(record, 'unknown');
    const marked = tabStateMarkSaved(state, tabStateDoc(state));
    expect(tabStateDirty(marked)).toBe(false);
    const d = make();
    d.putState(state);
    d.markSaved();
    expect(d.isDirty()).toBe(false);
    d.run('undo');
    expect(d.isDirty()).toBe(true);
    d.run('redo');
    expect(d.isDirty()).toBe(false);
  });

  it("the next edit is stamped by the clock passed in, not the record's or the system's", () => {
    const record = viaJson(tabStateToRecord(edited(1).snapshotState(), { maxSteps: 100 }));
    const { state } = restore(record, 'current', () => T1);
    const h = transact(
      tabStateParts(state).history,
      'Add atom',
      (d) => addAtom(d, { x: 9, y: 9 })[0],
    );
    expect(current(h).meta.modified).toBe(T1);
  });

  it('a damaged step is dropped with the older ones and the drawing is kept', () => {
    const s = edited(4).snapshotState();
    const record = tabStateToRecord(s, { maxSteps: 100 });
    const json = viaJson(record) as { past: { inverse: unknown[] }[] };
    (json.past[1] as { inverse: unknown[] }).inverse = [
      { op: 'replace', path: ['nextId'], value: -1 },
    ];
    const { state, droppedSteps } = restore(json);
    expect(droppedSteps).toBe(2);
    expect(tabStateDoc(state)).toEqual(tabStateDoc(s));
    expect(tabStateParts(state).history.past).toHaveLength(2);
  });

  const good = (): Record<string, unknown> =>
    viaJson(tabStateToRecord(edited(1).snapshotState(), { maxSteps: 100 })) as Record<
      string,
      unknown
    >;

  const shapeErrors: [string, () => unknown, string][] = [
    ['not an object', () => 'text', 'not-chalkbond'],
    ['null', () => null, 'not-chalkbond'],
    ['an array', () => [], 'not-chalkbond'],
    ['another format', () => ({ ...good(), format: 'chalkbond-tab' }), 'not-chalkbond'],
    ['a newer version', () => ({ ...good(), version: 2 }), 'newer-version'],
    ['an unknown version', () => ({ ...good(), version: '1' }), 'unsupported-version'],
    ['a missing file', () => ({ ...good(), file: undefined }), 'schema'],
    ['past not a list', () => ({ ...good(), past: {} }), 'schema'],
    ['an extra key (strict)', () => ({ ...good(), view: VIEW }), 'schema'],
    ['an extra step key (strict)', () => extraStepKey(good()), 'schema'],
    ['a prototype path', () => protoPath(good()), 'schema'],
    ['a file that is not JSON', () => ({ ...good(), file: '{' }), 'invalid-json'],
    ['a file that is not a drawing', () => ({ ...good(), file: '{}' }), 'not-chalkbond'],
  ];

  it.each(shapeErrors)('%s is a ParseError', (_name, value, code) => {
    const r = tabStateFromRecord(value(), { clock: () => T1, view: VIEW, saved: 'current' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe(code);
    expect(typeof r.error.message).toBe('string');
  });
});

function extraStepKey(r: Record<string, unknown>): Record<string, unknown> {
  const past = r['past'] as Record<string, unknown>[];
  return { ...r, past: past.map((s) => ({ ...s, coalesceKey: 'drag' })) };
}

function protoPath(r: Record<string, unknown>): Record<string, unknown> {
  const past = r['past'] as Record<string, unknown>[];
  const bad = { op: 'replace', path: ['__proto__', 'x'], value: 1 };
  return { ...r, past: past.map((s) => ({ ...s, inverse: [bad] })) };
}

// ---- property: state -> record -> JSON -> state ---------------------------------------------

type Edit =
  | { kind: 'add'; x: number; y: number }
  | { kind: 'move'; pick: number; x: number; y: number }
  | { kind: 'element'; pick: number; element: 'N' | 'O' | 'S' | 'Cl' }
  | { kind: 'bond'; a: number; b: number }
  | { kind: 'delete'; pick: number }
  | { kind: 'undo' };

const coord = fc.integer({ min: -40, max: 40 }).map((n) => n / 4);
const edit: fc.Arbitrary<Edit> = fc.oneof(
  fc.record({ kind: fc.constant('add' as const), x: coord, y: coord }),
  fc.record({ kind: fc.constant('move' as const), pick: fc.nat(), x: coord, y: coord }),
  fc.record({
    kind: fc.constant('element' as const),
    pick: fc.nat(),
    element: fc.constantFrom('N' as const, 'O' as const, 'S' as const, 'Cl' as const),
  }),
  fc.record({ kind: fc.constant('bond' as const), a: fc.nat(), b: fc.nat() }),
  fc.record({ kind: fc.constant('delete' as const), pick: fc.nat() }),
  fc.constant({ kind: 'undo' as const }),
);

function atIndex(doc: Doc, n: number): AtomId | null {
  const ids = Object.keys(doc.atoms) as AtomId[];
  return ids.length === 0 ? null : (ids[n % ids.length] as AtomId);
}

function apply(h: History, e: Edit): History {
  const doc = current(h);
  switch (e.kind) {
    case 'add':
      return transact(h, 'Add atom', (d) => addAtom(d, { x: e.x, y: e.y })[0]);
    case 'move': {
      const id = atIndex(doc, e.pick);
      return id === null ? h : transact(h, 'Move', (d) => updateAtom(d, id, { x: e.x, y: e.y }));
    }
    case 'element': {
      const id = atIndex(doc, e.pick);
      return id === null
        ? h
        : transact(h, 'Element', (d) => updateAtom(d, id, { element: e.element }));
    }
    case 'bond': {
      const a = atIndex(doc, e.a);
      const b = atIndex(doc, e.b);
      return a === null || b === null || a === b || findBond(doc, a, b) !== undefined
        ? h
        : transact(h, 'Bond', (d) => addBond(d, a, b)[0]);
    }
    case 'delete': {
      const id = atIndex(doc, e.pick);
      return id === null
        ? h
        : transact(h, 'Delete', (d) =>
            deleteItems(d, { atoms: new Set([id]), bonds: new Set(), objects: new Set() }),
          );
    }
    case 'undo':
      return h.past.length > 0 ? undo(h) : h;
  }
}

/** A ticking ISO clock without `Date` (state code reads no clock): one second per call. */
function clockFrom(start: number): () => string {
  let n = start;
  const two = (k: number): string => String(k).padStart(2, '0');
  return () => {
    const s = n++;
    return `2026-11-12T${two(8 + Math.floor(s / 3600))}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}.000Z`;
  };
}

const view = fc.record({
  zoom: fc.integer({ min: 25, max: 800 }).map((n) => n / 100),
  centre: fc.record({ x: coord, y: coord }),
});

describe('tab state record property (R57)', () => {
  it('state -> record -> JSON -> state: drawing, the newest undo steps, view, saved baseline', () => {
    fc.assert(
      fc.property(
        fc.array(edit, { minLength: 0, maxLength: 60, size: 'max' }),
        // The host stores 100 (app-shell R50); fewer when it halves maxSteps for size (SS3).
        fc.oneof(fc.integer({ min: 0, max: 30 }), fc.constant(100)),
        view,
        fc.constantFrom('current' as const, 'unknown' as const),
        (edits, maxSteps, v, saved) => {
          const history = edits.reduce(apply, createHistory(emptyDoc(T0), { clock: clockFrom(0) }));
          const original = sealTabState({
            history,
            saved: current(history),
            selection: EMPTY_SELECTION,
            view: { zoom: 1, centre: { x: 0, y: 0 } },
            viewPending: false,
          });
          const record = viaJson(tabStateToRecord(original, { maxSteps }));
          const r = tabStateFromRecord(record, { clock: clockFrom(1000), view: v, saved });
          expect(r.ok).toBe(true);
          if (!r.ok) return;
          const { state, droppedSteps } = r.value;
          expect(droppedSteps).toBe(0);
          expect(tabStateDoc(state)).toEqual(tabStateDoc(original));
          const kept = Math.min(maxSteps, history.past.length);
          expect(tabStateParts(state).history.past).toHaveLength(kept);
          expect(undoChain(tabStateParts(state).history)).toEqual(
            undoChain(history).slice(0, kept + 1),
          );
          expect(tabStateCanRedo(state)).toBe(false);
          expect(tabStateView(state)).toEqual(v);
          expect(tabStateDirty(state)).toBe(saved === 'unknown');
          expect(tabStateDirty(tabStateMarkSaved(state, tabStateDoc(state)))).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});
