import { describe, expect, it } from 'vitest';
import { kitchenSinkDoc } from './__fixtures__/kitchen-sink';
import { benzeneDoc, FIXTURE_TIME, mechanismDoc, twoStepReactionDoc } from './__fixtures__/schemes';
import { addAtom, updateAtom } from './atoms';
import { addBond } from './bonds';
import { deleteItems } from './delete';
import { emptyDoc } from './doc';
import {
  canRedo,
  canUndo,
  createHistory,
  current,
  HISTORY_DEPTH,
  redo,
  transact,
  undo,
  undoLabel,
  type History,
} from './history';
import { applyPatches, type Patch } from 'immer';
import {
  applyPatchesInPlace,
  historyFromRecord,
  historyToRecord,
  type HistoryRecord,
  type PatchRecord,
  type StepRecord,
} from './history-record';
import { addObject } from './objects';
import { serialize } from './serialize';
import { setStyle } from './style';
import type { AtomId, Doc } from './types';

/** Clock that returns T+1s, T+2s, … so every transact gets a distinct stamp. */
function tickingClock(): () => string {
  let n = 0;
  return () => new Date(Date.parse(FIXTURE_TIME) + ++n * 1000).toISOString();
}

const LATER = '2026-11-12T08:00:00.000Z';

/** `n` varied edits (move, add with bond, formula switch, plus sign, delete), one step each. */
function edit(h: History, n: number): History {
  for (let i = 0; i < n; i++) {
    const atoms = Object.keys(current(h).atoms) as AtomId[];
    const some = atoms[i % atoms.length] as AtomId;
    switch (i % 5) {
      case 0:
        h = transact(h, 'Move atom', (d) =>
          updateAtom(d, some, { x: (d.atoms[some]?.x ?? 0) + 0.25 }),
        );
        break;
      case 1:
        h = transact(h, 'Add bond', (d) => {
          const [d1, added] = addAtom(d, { x: i, y: 5, element: i % 2 ? 'N' : 'C' });
          return addBond(d1, some, added, { order: 2 })[0];
        });
        break;
      case 2:
        h = transact(h, 'Switch formula', (d) =>
          setStyle(d, { formula: d.style.formula ? 'skeletal' : 'structural' }),
        );
        break;
      case 3:
        h = transact(h, 'Add plus', (d) => addObject(d, { type: 'plus', at: { x: i, y: -3 } })[0]);
        break;
      default:
        h = transact(h, 'Delete', (d) =>
          deleteItems(d, {
            atoms: new Set([atoms[atoms.length - 1] as AtomId]),
            bonds: new Set(),
            objects: new Set(),
          }),
        );
    }
  }
  return h;
}

/** The drawings met while undoing `count` steps, newest first, with each undone step's label. */
function undoTrail(h: History, count: number): (Doc | string | undefined)[] {
  const trail: (Doc | string | undefined)[] = [];
  for (let i = 0; i < count; i++) {
    trail.push(current(h), undoLabel(h));
    h = undo(h);
  }
  trail.push(current(h));
  return trail;
}

/** The record as the session store would hand it back: through JSON text. */
function viaJson(record: HistoryRecord): unknown {
  return JSON.parse(JSON.stringify(record));
}

function restore(value: unknown): { history: History; dropped: number } {
  const r = historyFromRecord(value, { clock: () => LATER });
  if (!r.ok) throw new Error(`restore failed: ${r.error.code} ${r.error.message}`);
  return r.value;
}

function errorCode(value: unknown): string | undefined {
  const r = historyFromRecord(value);
  return r.ok ? undefined : r.error.code;
}

function smallHistory(steps = 5): History {
  return edit(createHistory(benzeneDoc(), { clock: tickingClock() }), steps);
}

function smallRecord(steps = 5): HistoryRecord {
  return viaJson(historyToRecord(smallHistory(steps), { maxSteps: 100 })) as HistoryRecord;
}

function withStep(record: HistoryRecord, index: number, change: Partial<StepRecord>): unknown {
  const past = record.past.map((s, i) => (i === index ? { ...s, ...change } : s));
  return { ...record, past };
}

const FIXTURES: [string, () => Doc][] = [
  ['benzene', benzeneDoc],
  ['two-step reaction', twoStepReactionDoc],
  ['mechanism', mechanismDoc],
  ['kitchen sink', kitchenSinkDoc],
];

describe('historyToRecord', () => {
  it('writes the format, version, the current drawing as .chalk text and the undo steps', () => {
    const h = smallHistory(3);
    const record = historyToRecord(h, { maxSteps: 100 });
    expect(Object.keys(record).sort()).toEqual(['file', 'format', 'past', 'version']);
    expect(record.format).toBe('chalkbond-history');
    expect(record.version).toBe(1);
    expect(record.file).toBe(serialize(current(h)));
    expect(record.past.map((s) => s.label)).toEqual(['Move atom', 'Add bond', 'Switch formula']);
    for (const step of record.past) {
      expect(Object.keys(step).sort()).toEqual(['inverse', 'label', 'patches']);
      for (const p of [...step.patches, ...step.inverse]) {
        expect(['op', 'path', 'value']).toEqual(expect.arrayContaining(Object.keys(p)));
      }
    }
    expect(viaJson(record)).toEqual(record);
  });

  it('keeps only the newest maxSteps undo steps', () => {
    const h = smallHistory(7);
    const record = historyToRecord(h, { maxSteps: 3 });
    expect(record.past.map((s) => s.label)).toEqual(['Delete', 'Move atom', 'Add bond']);
  });

  it('keeps every step when maxSteps is larger than the history', () => {
    expect(historyToRecord(smallHistory(4), { maxSteps: 100 }).past).toHaveLength(4);
  });

  it('keeps no step when maxSteps is 0, but still the drawing', () => {
    const h = smallHistory(4);
    const record = historyToRecord(h, { maxSteps: 0 });
    expect(record.past).toEqual([]);
    const { history, dropped } = restore(viaJson(record));
    expect(dropped).toBe(0);
    expect(current(history)).toEqual(current(h));
    expect(canUndo(history)).toBe(false);
  });

  it('does not record redo steps', () => {
    const h = undo(undo(smallHistory(5)));
    expect(canRedo(h)).toBe(true);
    const record = historyToRecord(h, { maxSteps: 100 });
    expect(record.past.map((s) => s.label)).toEqual(['Move atom', 'Add bond', 'Switch formula']);
    const { history } = restore(viaJson(record));
    expect(current(history)).toEqual(current(h));
    expect(canRedo(history)).toBe(false);
  });

  it('shortens a label longer than 200 characters, so the record stays valid', () => {
    const long = 'L'.repeat(250);
    const h = transact(createHistory(benzeneDoc()), long, (d) =>
      setStyle(d, { preset: 'journal' }),
    );
    const record = historyToRecord(h, { maxSteps: 100 });
    expect(record.past[0]?.label).toBe('L'.repeat(200));
    expect(restore(viaJson(record)).dropped).toBe(0);
  });
});

describe('historyFromRecord: round trip', () => {
  it.each(FIXTURES)('%s with 100 steps undoes to the same drawings as before', (_name, build) => {
    const h = edit(createHistory(build(), { clock: tickingClock() }), 130);
    const record = viaJson(historyToRecord(h, { maxSteps: 100 }));
    const { history, dropped } = restore(record);
    expect(dropped).toBe(0);
    expect(canRedo(history)).toBe(false);
    expect(undoTrail(history, 100)).toEqual(undoTrail(h, 100));
    let back = history;
    for (let i = 0; i < 100; i++) back = undo(back);
    expect(canUndo(back)).toBe(false);
  });

  it('redoes what it undid after a restore', () => {
    const h = smallHistory(5);
    const { history } = restore(viaJson(historyToRecord(h, { maxSteps: 100 })));
    expect(current(redo(redo(undo(undo(history)))))).toEqual(current(h));
  });

  it('uses the given clock for the next step and ends coalescing at the restore', () => {
    const start = createHistory(benzeneDoc(), { clock: tickingClock() });
    const dragged = transact(start, 'Move', (d) => updateAtom(d, 'a1' as AtomId, { x: 1 }), {
      coalesceKey: 'drag',
    });
    const { history } = restore(viaJson(historyToRecord(dragged, { maxSteps: 100 })));
    const next = transact(history, 'Move', (d) => updateAtom(d, 'a1' as AtomId, { x: 2 }), {
      coalesceKey: 'drag',
    });
    expect(current(next).meta.modified).toBe(LATER);
    expect(current(undo(next)).atoms['a1' as AtomId]?.x).toBe(1);
    expect(canUndo(undo(next))).toBe(true);
  });

  it('defaults to the system clock', () => {
    const r = historyFromRecord(smallRecord());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const next = transact(r.value.history, 'Journal', (d) => setStyle(d, { preset: 'journal' }));
    expect(Number.isNaN(Date.parse(current(next).meta.modified))).toBe(false);
  });

  it('keeps at most HISTORY_DEPTH steps; older ones count as dropped', () => {
    let h = createHistory(emptyDoc(FIXTURE_TIME), { clock: tickingClock() });
    for (let i = 0; i <= HISTORY_DEPTH; i++) {
      h = transact(h, `Add ${i}`, (d) => addAtom(d, { x: i, y: 0 })[0]);
    }
    // The history itself dropped "Add 0"; put it back in front of the record by hand (same
    // clock, so the step is valid and only the depth limit drops it).
    const oldest = historyToRecord(
      transact(
        createHistory(emptyDoc(FIXTURE_TIME), { clock: tickingClock() }),
        'Add 0',
        (d) => addAtom(d, { x: 0, y: 0 })[0],
      ),
      { maxSteps: 1 },
    ).past;
    let oldestDrawing = h;
    while (canUndo(oldestDrawing)) oldestDrawing = undo(oldestDrawing);
    const alone = viaJson({ ...historyToRecord(oldestDrawing, { maxSteps: 0 }), past: oldest });
    expect(restore(alone).dropped).toBe(0);
    const record = historyToRecord(h, { maxSteps: HISTORY_DEPTH });
    expect(record.past).toHaveLength(HISTORY_DEPTH);
    const full = viaJson({ ...record, past: [...oldest, ...record.past] });
    const { history, dropped } = restore(full);
    expect(dropped).toBe(1);
    expect(undoTrail(history, HISTORY_DEPTH)).toEqual(undoTrail(h, HISTORY_DEPTH));
  });
});

describe('historyFromRecord: shape errors', () => {
  const ok = smallRecord();

  it.each<[string, unknown, string]>([
    ['null', null, 'not-chalkbond'],
    ['an array', [ok], 'not-chalkbond'],
    ['a string', JSON.stringify(ok), 'not-chalkbond'],
    ['a wrong format', { ...ok, format: 'chalkbond' }, 'not-chalkbond'],
    ['no format', { version: 1, file: ok.file, past: [] }, 'not-chalkbond'],
    ['a newer version', { ...ok, version: 2 }, 'newer-version'],
    ['version 0', { ...ok, version: 0 }, 'unsupported-version'],
    ['a version string', { ...ok, version: '1' }, 'unsupported-version'],
    ['no version', { format: 'chalkbond-history', file: ok.file, past: [] }, 'unsupported-version'],
    ['no file', { format: 'chalkbond-history', version: 1, past: [] }, 'schema'],
    ['a file that is no string', { ...ok, file: { doc: 1 } }, 'schema'],
    ['no past', { format: 'chalkbond-history', version: 1, file: ok.file }, 'schema'],
    ['a past that is no array', { ...ok, past: {} }, 'schema'],
    ['an extra key', { ...ok, future: [] }, 'schema'],
  ])('rejects %s', (_name, value, code) => {
    expect(errorCode(value)).toBe(code);
  });

  const patch = (p: unknown): unknown => withStep(ok, 1, { inverse: [p as PatchRecord] });

  it.each<[string, unknown]>([
    ['a step that is no object', { ...ok, past: [1] }],
    ['a step without inverse', withStep(ok, 0, { inverse: undefined })],
    ['a step with an extra key', { ...ok, past: [{ ...ok.past[0], when: 1 }] }],
    ['a label that is no string', withStep(ok, 0, { label: 3 as unknown as string })],
    ['a label of 201 characters', withStep(ok, 0, { label: 'x'.repeat(201) })],
    ['patches that are no array', withStep(ok, 0, { patches: {} as PatchRecord[] })],
    ['a bad op', patch({ op: 'move', path: ['nextId'], value: 3 })],
    ['a missing op', patch({ path: ['nextId'], value: 3 })],
    ['a path that is no array', patch({ op: 'replace', path: 'nextId', value: 3 })],
    ['a path with an object segment', patch({ op: 'replace', path: [{}], value: 3 })],
    ['a path with a negative index', patch({ op: 'remove', path: ['zOrder', -1] })],
    ['a path with a fractional index', patch({ op: 'remove', path: ['zOrder', 0.5] })],
    ['a patch with an extra key', patch({ op: 'remove', path: ['zOrder', 0], from: [] })],
  ])('rejects %s', (_name, value) => {
    expect(errorCode(value)).toBe('schema');
  });

  it('accepts a label of exactly 200 characters', () => {
    expect(errorCode(withStep(ok, 0, { label: 'x'.repeat(200) }))).toBeUndefined();
  });

  it.each(['__proto__', 'constructor', 'prototype'])(
    'rejects the path segment %s in patches and in inverse patches',
    (segment) => {
      const bad: PatchRecord = { op: 'replace', path: ['atoms', segment, 'x'], value: 1 };
      expect(errorCode(withStep(ok, 0, { patches: [bad] }))).toBe('schema');
      expect(errorCode(withStep(ok, 0, { inverse: [bad] }))).toBe('schema');
      const deep: PatchRecord = { op: 'add', path: [segment], value: {} };
      expect(errorCode(withStep(ok, 2, { inverse: [deep] }))).toBe('schema');
    },
  );

  it('lists the schema issues in details', () => {
    const r = historyFromRecord({ ...ok, past: {} });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.details?.[0]).toMatch(/^past: /);
  });
});

describe('historyFromRecord: damaged contents', () => {
  it('a corrupt file is an error, even with good steps', () => {
    const ok = smallRecord();
    expect(errorCode({ ...ok, file: '{not json' })).toBe('invalid-json');
    expect(errorCode({ ...ok, file: '{"format":"other"}' })).toBe('not-chalkbond');
    expect(errorCode({ ...ok, file: ok.file.replace('"nextId": ', '"nextId": -') })).toBe('schema');
  });

  // Each corruption is applied to the inverse (or the patches) of step 2 of 5.
  it.each<[string, Partial<StepRecord>]>([
    ['an inverse that cannot apply', { inverse: [{ op: 'remove', path: ['atoms', 'a999', 'x'] }] }],
    [
      'an inverse that breaks the schema',
      { inverse: [{ op: 'replace', path: ['nextId'], value: -1 }] },
    ],
    ['an inverse that breaks an invariant', { inverse: [{ op: 'remove', path: ['atoms', 'a1'] }] }],
    [
      'patches that do not redo the step',
      { patches: [{ op: 'replace', path: ['nextId'], value: 999 }] },
    ],
    [
      'patches that cannot apply',
      { patches: [{ op: 'remove', path: ['bonds', 'b999', 'order'] }] },
    ],
  ])('%s drops that step and every older one and keeps the drawing', (_name, change) => {
    const h = smallHistory(5);
    const record = viaJson(historyToRecord(h, { maxSteps: 100 })) as HistoryRecord;
    const { history, dropped } = restore(withStep(record, 2, change));
    expect(dropped).toBe(3);
    expect(current(history)).toEqual(current(h));
    expect(undoTrail(history, 2)).toEqual(undoTrail(h, 2));
    expect(canUndo(undo(undo(history)))).toBe(false);
  });

  it('a damaged newest step leaves the drawing with no undo steps', () => {
    const h = smallHistory(5);
    const record = viaJson(historyToRecord(h, { maxSteps: 100 })) as HistoryRecord;
    const damaged = withStep(record, 4, {
      inverse: [{ op: 'replace', path: ['nextId'], value: 0 }],
    });
    const { history, dropped } = restore(damaged);
    expect(dropped).toBe(5);
    expect(current(history)).toEqual(current(h));
    expect(canUndo(history)).toBe(false);
  });
});

describe('historyFromRecord: how a step is written', () => {
  it('restores a step written as one replacement of the whole drawing', () => {
    const start = createHistory(benzeneDoc(), { clock: tickingClock() });
    // A recipe that returns a fresh object makes Immer write one patch at the root path.
    const h = transact(start, 'Fresh', (d) => ({ ...d, nextId: d.nextId + 5 }));
    expect(h.past[0]?.inverse[0]?.path).toEqual([]);
    const { history, dropped } = restore(viaJson(historyToRecord(h, { maxSteps: 100 })));
    expect(dropped).toBe(0);
    expect(current(undo(history))).toEqual(current(undo(h)));
  });

  it('a whole-drawing inverse that breaks the schema is dropped', () => {
    const record = smallRecord(2);
    const damaged = withStep(record, 1, { inverse: [{ op: 'replace', path: [], value: 7 }] });
    expect(restore(damaged).dropped).toBe(2);
  });

  it('restores a step written at the level of a whole record', () => {
    const start = createHistory(benzeneDoc(), { clock: tickingClock() });
    const h = transact(start, 'Move', (d) => updateAtom(d, 'a1' as AtomId, { x: 9 }));
    const before = current(start);
    const record = viaJson(historyToRecord(h, { maxSteps: 1 })) as HistoryRecord;
    const inverse: PatchRecord[] = [
      { op: 'replace', path: ['atoms'], value: before.atoms },
      { op: 'replace', path: ['meta', 'modified'], value: before.meta.modified },
    ];
    const { history, dropped } = restore(withStep(record, 0, { inverse }));
    expect(dropped).toBe(0);
    expect(current(undo(history))).toEqual(before);
  });

  it('restores the delete of an atom without bonds (an atom id that comes and goes)', () => {
    const start = createHistory(emptyDoc(FIXTURE_TIME), { clock: tickingClock() });
    const added = transact(start, 'Add', (d) => addAtom(d, { x: 0, y: 0 })[0]);
    const h = transact(added, 'Delete', (d) =>
      deleteItems(d, { atoms: new Set(['a1' as AtomId]), bonds: new Set(), objects: new Set() }),
    );
    const { history, dropped } = restore(viaJson(historyToRecord(h, { maxSteps: 100 })));
    expect(dropped).toBe(0);
    expect(undoTrail(history, 2)).toEqual(undoTrail(h, 2));
  });

  it('patches that redo an atom to another place are dropped', () => {
    const start = createHistory(benzeneDoc(), { clock: tickingClock() });
    const h = transact(start, 'Move', (d) => updateAtom(d, 'a2' as AtomId, { x: 9 }));
    const record = viaJson(historyToRecord(h, { maxSteps: 1 })) as HistoryRecord;
    const patches = (record.past[0]?.patches ?? []).map((p) =>
      p.path[0] === 'atoms' ? { ...p, value: 8 } : p,
    );
    expect(restore(withStep(record, 0, { patches })).dropped).toBe(1);
  });

  // A move writes one atom in place: only that atom is checked, so these prove the check runs.
  it.each<[string, PatchRecord]>([
    ['an unknown element', { op: 'replace', path: ['atoms', 'a2', 'element'], value: 'Xx' }],
    ['an id that is not its key', { op: 'replace', path: ['atoms', 'a2', 'id'], value: 'a3' }],
  ])('an atom-only inverse giving %s is dropped', (_name, bad) => {
    const start = createHistory(benzeneDoc(), { clock: tickingClock() });
    const h = transact(start, 'Move', (d) => updateAtom(d, 'a2' as AtomId, { x: 9 }));
    const record = viaJson(historyToRecord(h, { maxSteps: 1 })) as HistoryRecord;
    const inverse = [...(record.past[0]?.inverse ?? []), bad];
    expect(restore(withStep(record, 0, { inverse })).dropped).toBe(1);
  });
});

describe('applyPatchesInPlace', () => {
  const T = '2026-11-12T00:00:00.000Z';

  function plain(doc: Doc): unknown {
    return JSON.parse(JSON.stringify(doc));
  }

  it('gives what Immer gives for every step of an edit run, both ways', () => {
    for (const [, build] of FIXTURES) {
      const h = edit(createHistory(build(), { clock: tickingClock() }), 40);
      let doc = current(h);
      for (const step of [...h.past].reverse()) {
        const work = { doc: plain(doc) };
        applyPatchesInPlace(work, step.inverse);
        const before = applyPatches(doc, step.inverse as Patch[]);
        expect(work.doc).toEqual(plain(before));
        applyPatchesInPlace(work, step.patches);
        expect(work.doc).toEqual(plain(doc));
        doc = before;
      }
    }
  });

  it('applies add, replace and remove in arrays as Immer does', () => {
    const patches: Patch[] = [
      { op: 'add', path: ['zOrder', 0], value: 'o9' },
      { op: 'add', path: ['zOrder', 2], value: 'o8' },
      { op: 'replace', path: ['zOrder', 1], value: 'o7' },
      { op: 'remove', path: ['zOrder', 0] },
    ];
    const doc = { ...emptyDoc(T), zOrder: ['o1'] } as unknown as Doc;
    const work = { doc: plain(doc) };
    applyPatchesInPlace(work, patches);
    expect(work.doc).toEqual(plain(applyPatches(doc, patches)));
  });

  it('copies the values it writes', () => {
    const value = { x: 1, y: 2 };
    const work: { doc: unknown } = { doc: { p: null } };
    applyPatchesInPlace(work, [{ op: 'replace', path: ['p'], value }]);
    value.x = 5;
    expect(work.doc).toEqual({ p: { x: 1, y: 2 } });
  });

  it.each<[string, Patch]>([
    ['add at the root', { op: 'add', path: [], value: {} }],
    ['remove at the root', { op: 'remove', path: [] }],
    ['a missing key on the way', { op: 'replace', path: ['atoms', 'a99', 'x'], value: 1 }],
    ['a value that is no object on the way', { op: 'replace', path: ['nextId', 'x'], value: 1 }],
    ['a number key on an object on the way', { op: 'replace', path: [0, 'x'], value: 1 }],
    ['a string index on the way', { op: 'replace', path: ['zOrder', 'first', 'x'], value: 1 }],
    ['a number key on an object', { op: 'replace', path: ['meta', 0], value: 1 }],
    ['a string index', { op: 'add', path: ['zOrder', '-'], value: 'o2' }],
    ['a fractional index', { op: 'replace', path: ['zOrder', 0.5], value: 'o2' }],
    ['an add past the end', { op: 'add', path: ['zOrder', 2], value: 'o2' }],
    ['a replace past the end', { op: 'replace', path: ['zOrder', 1], value: 'o2' }],
    ['a remove past the end', { op: 'remove', path: ['zOrder', 1] }],
    ['a remove of a missing key', { op: 'remove', path: ['atoms', 'a99'] }],
    ['a write into a string', { op: 'replace', path: ['meta', 'created', 'x'], value: 1 }],
  ])('refuses %s', (_name, patch) => {
    const work = { doc: plain({ ...emptyDoc(T), zOrder: ['o1'] } as unknown as Doc) };
    expect(() => applyPatchesInPlace(work, [patch])).toThrow();
  });
});
