import { ChemError } from '@core/chem-core';
import {
  addAtom,
  canRedo,
  canUndo,
  current,
  DocError,
  undoLabel,
  type AtomId,
  type Doc,
} from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION } from './editor-state';
import { isDirty, reduce } from './reducer';
import { addEthane, atomId, freshState, labelEditing, testContext, testDoc } from './testing';

const A1 = atomId(1);
const A99 = atomId(99);

const commitEthane = { type: 'commit', label: 'Add bond', recipe: addEthane } as const;
const addOxygen = (d: Doc): Doc => addAtom(d, { element: 'O', x: 5, y: 5 })[0];
const throwing = (error: Error) =>
  ({
    type: 'commit',
    label: 'Bad',
    recipe: () => {
      throw error;
    },
  }) as const;
const selecting = (...atoms: AtomId[]) => ({ ...EMPTY_SELECTION, atoms: new Set(atoms) });

describe('commit', () => {
  it('is one undo step with its label, and the doc changes', () => {
    const ctx = testContext();
    const s = reduce(freshState(), commitEthane, ctx);
    expect(Object.keys(current(s.history).atoms)).toHaveLength(2);
    expect(undoLabel(s.history)).toBe('Add bond');
    const undone = reduce(s, { type: 'undo' }, ctx);
    expect(Object.keys(current(undone.history).atoms)).toHaveLength(0);
    expect(canUndo(undone.history)).toBe(false);
  });

  it('coalesces commits that share a key into one step', () => {
    const ctx = testContext();
    let s = reduce(freshState(), { ...commitEthane, coalesceKey: 'nudge' }, ctx);
    s = reduce(s, { type: 'commit', label: 'Nudge', coalesceKey: 'nudge', recipe: addOxygen }, ctx);
    s = reduce(s, { type: 'undo' }, ctx);
    expect(Object.keys(current(s.history).atoms)).toHaveLength(0);
  });

  it('sets the selection after the commit, else keeps only the ids that still exist', () => {
    const ctx = testContext();
    const sel = selecting(A1);
    const s = reduce(freshState(), { ...commitEthane, selection: sel }, ctx);
    expect(s.selection).toBe(sel);
    const kept = reduce(s, { type: 'commit', label: 'More', recipe: addOxygen }, ctx);
    expect(kept.selection).toBe(sel);
    const stale = { ...s, selection: selecting(A1, A99) };
    const pruned = reduce(stale, { type: 'commit', label: 'X', recipe: (d) => d }, ctx);
    expect([...pruned.selection.atoms]).toEqual([A1]);
  });

  it('clears gesture, preview and the old notice', () => {
    const ctx = testContext();
    let s = reduce(freshState(), { type: 'notice-show', kind: 'info', text: 'hi' }, ctx);
    s = reduce(s, { type: 'set-gesture', gesture: { kind: 'bond' } }, ctx);
    s = reduce(s, commitEthane, ctx);
    expect(s.gesture).toBeNull();
    expect(s.preview).toBeNull();
    expect(s.notice).toBeNull();
  });
});

describe('X1: a commit that throws', () => {
  it('leaves history unchanged; a DocError says so and is logged', () => {
    const ctx = testContext();
    const before = reduce(freshState(), commitEthane, ctx);
    const boom = new DocError('unknown-atom', 'a99');
    const s = reduce({ ...before, gesture: { kind: 'bond' } }, throwing(boom), ctx);
    expect(s.history).toBe(before.history);
    expect(s.gesture).toBeNull();
    expect(s.notice).toMatchObject({ kind: 'error', text: "That edit isn't possible here." });
    expect(ctx.logged).toEqual([boom]);
  });

  it('uses the rule wording for ChemError and its message otherwise; not logged', () => {
    const ctx = testContext();
    const text = (error: Error): string | undefined =>
      reduce(freshState(), throwing(error), ctx).notice?.text;
    expect(text(new ChemError('too-large'))).toBe(
      'That structure is too big to draw (over 1000 atoms).',
    );
    expect(text(new ChemError('cannot-kekulize'))).toBe(
      "This ring can't be shown with alternating double bonds.",
    );
    expect(text(new ChemError('not-found', 'No compound named "x".'))).toBe(
      'No compound named "x".',
    );
    expect(ctx.logged).toEqual([]);
  });

  it('treats any other exception like a DocError and logs it', () => {
    const ctx = testContext();
    const s = reduce(freshState(), throwing(new TypeError('oops')), ctx);
    expect(s.notice?.text).toBe("That edit isn't possible here.");
    expect(ctx.logged).toHaveLength(1);
  });
});

describe('undo and redo (G2, R7)', () => {
  const busyState = () => {
    const ctx = testContext();
    let s = reduce(freshState(), { ...commitEthane, selection: selecting(A1) }, ctx);
    s = reduce(s, { type: 'set-hover', hover: { kind: 'atom', id: A1 } }, ctx);
    s = reduce(s, { type: 'set-gesture', gesture: { kind: 'bond' } }, ctx);
    s = reduce(s, { type: 'set-preview', preview: { doc: testDoc(), added: new Set() } }, ctx);
    return { s, ctx };
  };

  it('clear selection, hover, gesture and preview', () => {
    const { s, ctx } = busyState();
    const u = reduce(s, { type: 'undo' }, ctx);
    expect(u.selection).toBe(EMPTY_SELECTION);
    expect([u.hover, u.gesture, u.preview]).toEqual([null, null, null]);
    expect(canRedo(u.history)).toBe(true);
    const busy = { ...u, hover: { kind: 'atom', id: A1 } as const, selection: selecting(A1) };
    const r = reduce(busy, { type: 'redo' }, ctx);
    expect(r.hover).toBeNull();
    expect(r.selection).toBe(EMPTY_SELECTION);
    expect(canRedo(r.history)).toBe(false);
  });

  it('do nothing when there is nothing to undo or redo', () => {
    const ctx = testContext();
    const s = freshState();
    expect(reduce(s, { type: 'undo' }, ctx)).toBe(s);
    expect(reduce(s, { type: 'redo' }, ctx)).toBe(s);
  });

  it('are refused while an editor is open', () => {
    const { s, ctx } = busyState();
    const editing = labelEditing(A1);
    const open = { ...s, editing };
    expect(reduce(open, { type: 'undo' }, ctx)).toBe(open);
    const openRedo = { ...reduce(s, { type: 'undo' }, ctx), editing };
    expect(reduce(openRedo, { type: 'redo' }, ctx)).toBe(openRedo);
  });
});

describe('dirty, load and markSaved', () => {
  it('is clean at start, dirty after an edit, clean after undoing back to saved', () => {
    const ctx = testContext();
    let s = freshState();
    expect(isDirty(s)).toBe(false);
    s = reduce(s, commitEthane, ctx);
    expect(isDirty(s)).toBe(true);
    s = reduce(s, { type: 'undo' }, ctx);
    expect(isDirty(s)).toBe(false);
  });

  it('is clean after markSaved and dirty again after the next edit', () => {
    const ctx = testContext();
    let s = reduce(freshState(), commitEthane, ctx);
    s = reduce(s, { type: 'mark-saved' }, ctx);
    expect(isDirty(s)).toBe(false);
    expect(reduce(s, { type: 'mark-saved' }, ctx)).toBe(s);
    s = reduce(s, { type: 'commit', label: 'More', recipe: addOxygen }, ctx);
    expect(isDirty(s)).toBe(true);
  });

  it('ignores meta.modified: an edit that changes nothing stays clean', () => {
    const s = reduce(
      freshState(),
      { type: 'commit', label: 'No-op', recipe: (d) => d },
      testContext(),
    );
    expect(isDirty(s)).toBe(false);
  });

  it('load resets history, selection and notice, and marks the new doc saved', () => {
    const ctx = testContext();
    const edited = reduce(freshState(), { ...commitEthane, selection: selecting(A1) }, ctx);
    const doc = addEthane(testDoc());
    const withNotice = { ...edited, notice: { id: 1, kind: 'info', text: 'x' } } as const;
    const s = reduce(withNotice, { type: 'load', doc }, ctx);
    expect(current(s.history)).toBe(doc);
    expect(canUndo(s.history)).toBe(false);
    expect(s.selection).toBe(EMPTY_SELECTION);
    expect(s.notice).toBeNull();
    expect(isDirty(s)).toBe(false);
  });
});

describe('notices', () => {
  it('ids rise; expiry clears only the notice it was set for', () => {
    const ctx = testContext();
    let s = reduce(freshState(), { type: 'notice-show', kind: 'error', text: 'one' }, ctx);
    const first = s.notice?.id ?? 0;
    s = reduce(s, { type: 'notice-show', kind: 'info', text: 'two' }, ctx);
    expect(s.notice?.id).toBeGreaterThan(first);
    expect(reduce(s, { type: 'notice-expired', id: first }, ctx)).toBe(s);
    expect(reduce(s, { type: 'notice-expired', id: s.notice?.id ?? 0 }, ctx).notice).toBeNull();
  });

  it('an id is never reissued after the notice is cleared', () => {
    const ctx = testContext();
    let s = reduce(freshState(), { type: 'notice-show', kind: 'info', text: 'one' }, ctx);
    const first = s.notice?.id ?? 0;
    s = reduce(s, { type: 'notice-clear' }, ctx);
    expect(reduce(s, { type: 'notice-clear' }, ctx)).toBe(s);
    s = reduce(s, { type: 'notice-show', kind: 'info', text: 'two' }, ctx);
    expect(s.notice?.id).not.toBe(first);
  });
});

describe('G3: tool switch', () => {
  it('cancels the gesture and keeps the selection only into Select', () => {
    const ctx = testContext();
    const sel = selecting(A1);
    const s = { ...freshState(), selection: sel, gesture: { kind: 'bond' } };
    const ring = reduce(s, { type: 'select-tool', tool: 'ring' }, ctx);
    expect(ring.gesture).toBeNull();
    expect(ring.selection).toBe(EMPTY_SELECTION);
    expect(reduce(s, { type: 'select-tool', tool: 'select' }, ctx).selection).toBe(sel);
  });
});

describe('small state actions', () => {
  it('set selection and space', () => {
    const ctx = testContext();
    const sel = selecting(A1);
    let s = reduce(freshState(), { type: 'set-selection', selection: sel }, ctx);
    s = reduce(s, { type: 'set-space', held: true }, ctx);
    expect(s.selection).toBe(sel);
    expect(s.spaceHeld).toBe(true);
    expect(reduce(s, { type: 'set-space', held: true }, ctx)).toBe(s);
    s = reduce(s, { type: 'set-editing', editing: labelEditing(A1) }, ctx);
    expect(s.editing).toEqual(labelEditing(A1));
  });
});

describe('replace-doc (R58)', () => {
  const whole = reduce(freshState(), commitEthane, testContext()).history.doc;

  it('is one commit labelled as given, selection cleared, nothing marked saved', () => {
    const ctx = testContext();
    const sel = selecting(A1);
    const base = { ...freshState(), selection: sel, hover: { kind: 'atom', id: A1 } as const };
    const s = reduce(base, { type: 'replace-doc', doc: whole, label: 'Load changed file' }, ctx);
    expect(s.history.doc.atoms).toEqual(whole.atoms);
    expect(undoLabel(s.history)).toBe('Load changed file');
    expect(s.selection).toBe(EMPTY_SELECTION);
    expect(s.hover).toBeNull();
    expect(isDirty(s)).toBe(true);
    const undone = reduce(s, { type: 'undo' }, ctx);
    expect(Object.keys(current(undone.history).atoms)).toHaveLength(0);
    expect(canUndo(undone.history)).toBe(false);
  });

  it('leaves the state untouched while a gesture runs or an editor is open', () => {
    const ctx = testContext();
    const action = { type: 'replace-doc', doc: whole, label: 'L' } as const;
    const gesturing = { ...freshState(), gesture: { kind: 'test' } } as never;
    expect(reduce(gesturing, action, ctx)).toBe(gesturing);
    const editing = { ...freshState(), editing: labelEditing(A1) };
    expect(reduce(editing, action, ctx)).toBe(editing);
  });
});
