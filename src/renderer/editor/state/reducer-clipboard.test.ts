import { createNameIndex } from '@core/chem-core';
import {
  canUndo,
  current,
  extract,
  fragments,
  undo,
  undoLabel,
  type AtomId,
  type Doc,
} from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import compounds from '../../../../resources/compounds/compounds.json';
import type { Point } from '../model/geometry';
import { screenToBlu } from '../model/viewport';
import { EMPTY_SELECTION, type EditorState } from './editor-state';
import { reduce, type EditorAction } from './reducer';
import { drawn, freshState, testContext, wholeOf } from './testing';

const ctx = { ...testContext(), names: createNameIndex(compounds) };
const run = (s: EditorState, a: EditorAction): EditorState => reduce(s, a, ctx);
const BL = 40;

const docOf = (s: EditorState): Doc => current(s.history);

/** Ethanol at the origin, selected, with Select active. */
const ethanol = (): EditorState => {
  const doc = drawn({ name: 'ethanol', x: 0, y: 0 });
  let s = run(freshState(doc), { type: 'canvas-resized', size: { w: 1200, h: 700 } });
  s = run(s, { type: 'select-tool', tool: 'select' });
  return run(s, {
    type: 'set-selection',
    selection: wholeOf(doc, fragments(doc)[0] as AtomId[]),
  });
};

/** The atoms of a document that `before` did not have. */
const added = (before: Doc, after: Doc): AtomId[] =>
  (Object.keys(after.atoms) as AtomId[]).filter((id) => !(id in before.atoms));

const centreOf = (d: Doc, ids: readonly AtomId[]): Point => {
  const xs = ids.map((id) => (d.atoms[id] as Point).x);
  const ys = ids.map((id) => (d.atoms[id] as Point).y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
};

describe('CB1 copy', () => {
  it('stores the extracted selection, touches neither document nor history', () => {
    const s0 = ethanol();
    const s = run(s0, { type: 'copy' });
    expect(s.clipboard).toEqual(extract(docOf(s0), s0.selection));
    expect(docOf(s)).toBe(docOf(s0));
    expect(canUndo(s.history)).toBe(false);
    expect(s.selection).toBe(s0.selection);
  });

  it('does nothing with nothing selected', () => {
    const s0 = run(ethanol(), { type: 'set-selection', selection: EMPTY_SELECTION });
    expect(run(s0, { type: 'copy' })).toBe(s0);
  });
});

describe('CB1 paste', () => {
  it('does nothing until something is copied', () => {
    const s0 = ethanol();
    expect(run(s0, { type: 'paste', at: { x: 600, y: 350 } })).toBe(s0);
  });

  it('inserts at the pointer, selects the paste, one "Paste" step', () => {
    const s0 = run(ethanol(), { type: 'copy' });
    const at = { x: 900, y: 500 };
    const s = run(s0, { type: 'paste', at });
    expect(undoLabel(s.history)).toBe('Paste');
    expect(s.history.past).toHaveLength(1);
    const fresh = added(docOf(s0), docOf(s));
    expect(fresh).toHaveLength(3);
    expect([...s.selection.atoms].sort()).toEqual([...fresh].sort());
    expect(s.selection.bonds.size).toBe(2);
    // The centre of the pasted atoms is the pointer.
    const c = centreOf(docOf(s), fresh);
    const want = screenToBlu(s.viewport, at, BL);
    expect(c.x).toBeCloseTo(want.x, 9);
    expect(c.y).toBeCloseTo(want.y, 9);
    expect(s.tool).toBe('select');
    // Undo takes the paste away again.
    expect(docOf({ ...s, history: undo(s.history) })).toEqual(docOf(s0));
  });

  it('without a pointer position it goes to the centre of the canvas', () => {
    const s0 = run(ethanol(), { type: 'copy' });
    const s = run(s0, { type: 'paste', at: null });
    const c = centreOf(docOf(s), added(docOf(s0), docOf(s)));
    const want = screenToBlu(s.viewport, { x: 600, y: 350 }, BL);
    expect(c.x).toBeCloseTo(want.x, 9);
    expect(c.y).toBeCloseTo(want.y, 9);
  });

  it('the paste keeps the clipboard: pasting twice gives two copies', () => {
    let s = run(ethanol(), { type: 'copy' });
    s = run(s, { type: 'paste', at: { x: 700, y: 300 } });
    s = run(s, { type: 'paste', at: { x: 700, y: 500 } });
    expect(Object.keys(docOf(s).atoms)).toHaveLength(9);
    expect(s.history.past).toHaveLength(2);
  });

  it('V5: a paste that lands off screen is revealed', () => {
    const s0 = run(ethanol(), { type: 'copy' });
    const s = run(s0, { type: 'paste', at: { x: 1190, y: 350 } });
    expect(s.viewport.pan.x).toBeLessThan(s0.viewport.pan.x);
  });

  it('a sub-document from the host pastes the same way', () => {
    const sub = extract(
      drawn({ name: 'ethanol', x: 0, y: 0 }),
      wholeOf(drawn({ name: 'ethanol', x: 0, y: 0 }), [
        'a1' as AtomId,
        'a2' as AtomId,
        'a3' as AtomId,
      ]),
    );
    const s0 = ethanol();
    const s = run(s0, { type: 'paste', at: { x: 800, y: 400 }, sub });
    expect(added(docOf(s0), docOf(s))).toHaveLength(3);
    expect(undoLabel(s.history)).toBe('Paste');
  });
});

describe('CB1 cut', () => {
  it('copies and deletes in one "Cut" step; Paste brings it back', () => {
    const s0 = ethanol();
    const s = run(s0, { type: 'cut' });
    expect(undoLabel(s.history)).toBe('Cut');
    expect(s.history.past).toHaveLength(1);
    expect(Object.keys(docOf(s).atoms)).toHaveLength(0);
    expect(s.clipboard).toEqual(extract(docOf(s0), s0.selection));
    expect(s.selection).toBe(EMPTY_SELECTION);
    const back = run(s, { type: 'paste', at: { x: 600, y: 350 } });
    expect(Object.keys(docOf(back).atoms)).toHaveLength(3);
  });

  it('does nothing with nothing selected', () => {
    const s0 = run(ethanol(), { type: 'set-selection', selection: EMPTY_SELECTION });
    expect(run(s0, { type: 'cut' })).toBe(s0);
  });
});

describe('CB1 duplicate', () => {
  it('inserts a copy 1.0 BLU right and down, selected, one "Duplicate" step', () => {
    const s0 = ethanol();
    const s = run(s0, { type: 'duplicate' });
    expect(undoLabel(s.history)).toBe('Duplicate');
    expect(s.history.past).toHaveLength(1);
    const before = docOf(s0);
    const fresh = added(before, docOf(s));
    expect(fresh).toHaveLength(3);
    const old = Object.keys(before.atoms) as AtomId[];
    const [o, n] = [centreOf(before, old), centreOf(docOf(s), fresh)];
    expect(n.x).toBeCloseTo(o.x + 1, 9);
    expect(n.y).toBeCloseTo(o.y + 1, 9);
    expect([...s.selection.atoms].sort()).toEqual([...fresh].sort());
    expect(s.clipboard).toBeNull();
  });

  it('does nothing with nothing selected', () => {
    const s0 = run(ethanol(), { type: 'set-selection', selection: EMPTY_SELECTION });
    expect(run(s0, { type: 'duplicate' })).toBe(s0);
  });
});
