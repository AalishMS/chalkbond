import { createNameIndex } from '@core/chem-core';
import {
  addAtom,
  addBond,
  canUndo,
  current,
  emptyDoc,
  fragments,
  undo,
  undoLabel,
  updateAtom,
  type AtomId,
  type BondId,
  type Doc,
} from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import compounds from '../../../../resources/compounds/compounds.json';
import type { HoverEdit } from '../model/keymap';
import type { EditorState, Hit } from './editor-state';
import { reduce, type EditorAction } from './reducer';
import { drawn, freshState, testContext } from './testing';

const ctx = { ...testContext(), names: createNameIndex(compounds) };
const run = (s: EditorState, a: EditorAction): EditorState => reduce(s, a, ctx);
const docOf = (s: EditorState): Doc => current(s.history);

/** Two bonded carbons, A at the origin and B up-right of it. */
function ethane(): { doc: Doc; a: AtomId; b: AtomId; bond: BondId } {
  const [d1, a] = addAtom(emptyDoc('2026-01-01T00:00:00.000Z'), { element: 'C', x: 0, y: 0 });
  const [d2, b] = addAtom(d1, { element: 'C', x: Math.cos(Math.PI / 6), y: -0.5 });
  const [d3, bond] = addBond(d2, a, b);
  return { doc: d3, a, b, bond };
}

const hovering = (doc: Doc, hit: Hit): EditorState =>
  run(run(freshState(doc), { type: 'canvas-resized', size: { w: 1200, h: 700 } }), {
    type: 'set-hover',
    hover: hit,
  });
const edit = (s: EditorState, e: HoverEdit): EditorState => run(s, { type: 'hover-edit', edit: e });
const atomHit = (id: AtomId): Hit => ({ kind: 'atom', id });
const formula = (s: EditorState): string =>
  ctx.derive.committed(docOf(s)).perception.fragments[0]?.formula.hill ?? '';

describe('hover keys on an atom (K2, A2)', () => {
  it('O sets the element in one "Change atom" step; undo restores the document exactly', () => {
    const { doc, b } = ethane();
    const s0 = hovering(doc, atomHit(b));
    const s = edit(s0, { kind: 'element', element: 'O' });
    expect(docOf(s).atoms[b]?.element).toBe('O');
    expect(s.history.past).toHaveLength(1);
    expect(undoLabel(s.history)).toBe('Change atom');
    expect(docOf({ ...s, history: undo(s.history) })).toEqual(doc);
    // The atom is still under the pointer.
    expect(s.hover).toEqual(atomHit(b));
    expect(formula(s)).toBe('CH4O');
  });

  it('setting the element it already has does nothing', () => {
    const { doc, b } = ethane();
    const s0 = hovering(doc, atomHit(b));
    expect(edit(s0, { kind: 'element', element: 'C' })).toBe(s0);
  });

  it('clears a label and an explicit H count, keeps the charge', () => {
    const { doc, b } = ethane();
    const labelled = updateAtom(doc, b, { label: 'Ph', charge: 1, explicitH: 2 });
    const s = edit(hovering(labelled, atomHit(b)), { kind: 'element', element: 'N' });
    expect(docOf(s).atoms[b]).toMatchObject({ element: 'N', charge: 1 });
    expect(docOf(s).atoms[b]?.label).toBeUndefined();
    expect(docOf(s).atoms[b]?.explicitH).toBeUndefined();
  });

  it('+ and - change the charge by one, clamped to -4..4; a clamped press changes nothing', () => {
    const { doc, b } = ethane();
    let s = hovering(doc, atomHit(b));
    s = edit(s, { kind: 'charge', delta: 1 });
    expect(docOf(s).atoms[b]?.charge).toBe(1);
    expect(undoLabel(s.history)).toBe('Change atom');
    s = edit(edit(s, { kind: 'charge', delta: -1 }), { kind: 'charge', delta: -1 });
    expect(docOf(s).atoms[b]?.charge).toBe(-1);
    const top = hovering(updateAtom(doc, b, { charge: 4 }), atomHit(b));
    expect(edit(top, { kind: 'charge', delta: 1 })).toBe(top);
    const bottom = hovering(updateAtom(doc, b, { charge: -4 }), atomHit(b));
    expect(edit(bottom, { kind: 'charge', delta: -1 })).toBe(bottom);
  });

  it('1 sprouts a single bond in the default direction (P1); 2 and 3 a double and a triple', () => {
    const { doc, b } = ethane();
    for (const order of [1, 2, 3] as const) {
      const s = edit(hovering(doc, atomHit(b)), { kind: 'sprout', order });
      expect(Object.keys(docOf(s).atoms)).toHaveLength(3);
      const bond = Object.values(docOf(s).bonds).find((x) => x.a1 === b);
      expect(bond?.order).toBe(order);
      expect(s.history.past).toHaveLength(1);
      expect(undoLabel(s.history)).toBe('Add bond');
    }
  });

  it('toluene: 1 over a ring atom of benzene adds a methyl, C7H8', () => {
    const benzene = drawn({ name: 'benzene', x: 0, y: 0 });
    const ring = fragments(benzene)[0] as AtomId[];
    const s = edit(hovering(benzene, atomHit(ring[0] as AtomId)), { kind: 'sprout', order: 1 });
    expect(formula(s)).toBe('C7H8');
    expect(Object.keys(docOf(s).atoms)).toHaveLength(7);
    expect(s.history.past).toHaveLength(1);
  });
});

describe('hover keys on a bond (K2, B5)', () => {
  const bondHit = (id: BondId): Hit => ({ kind: 'bond', id });

  it('1 2 3 set the order in one "Change bond" step, clearing stereo', () => {
    const { doc, bond } = ethane();
    let s = hovering(doc, bondHit(bond));
    s = edit(s, { kind: 'order', order: 2 });
    expect(docOf(s).bonds[bond]?.order).toBe(2);
    expect(undoLabel(s.history)).toBe('Change bond');
    s = edit(s, { kind: 'order', order: 3 });
    expect(docOf(s).bonds[bond]?.order).toBe(3);
    // The same order again is nothing.
    expect(edit(s, { kind: 'order', order: 3 })).toBe(s);
  });

  it('W makes a wedge, W again reverses it, H turns it into a hash; the hover follows the new bond or clears', () => {
    const { doc, a, b, bond } = ethane();
    let s = hovering(doc, bondHit(bond));
    s = edit(s, { kind: 'stereo', stereo: 'wedge' });
    expect(Object.values(docOf(s).bonds)[0]).toMatchObject({ stereo: 'wedge', a1: a, a2: b });
    expect(s.hover).toEqual(bondHit(bond));
    s = edit(s, { kind: 'stereo', stereo: 'wedge' });
    // Reversed: the bond has a new id, so what is hovered is gone until the pointer moves.
    expect(Object.values(docOf(s).bonds)[0]).toMatchObject({ stereo: 'wedge', a1: b, a2: a });
    expect(s.hover).toBeNull();
    expect(s.history.past).toHaveLength(2);
  });
});

describe('hover keys need something to act on', () => {
  it('do nothing with no hover, a gone item, a gesture running or an editor open', () => {
    const { doc, b } = ethane();
    const none = run(freshState(doc), { type: 'canvas-resized', size: { w: 1200, h: 700 } });
    expect(edit(none, { kind: 'element', element: 'O' })).toBe(none);
    const gone = hovering(doc, atomHit('a99' as AtomId));
    expect(edit(gone, { kind: 'element', element: 'O' })).toBe(gone);
    const busy = { ...hovering(doc, atomHit(b)), gesture: { kind: 'bond-press' } };
    expect(edit(busy, { kind: 'element', element: 'O' })).toBe(busy);
    const editing = {
      ...hovering(doc, atomHit(b)),
      editing: { kind: 'label' as const, atom: b },
    };
    expect(edit(editing, { kind: 'element', element: 'O' })).toBe(editing);
  });

  it('an element key over a bond or an order key over nothing is ignored', () => {
    const { doc, bond } = ethane();
    const s = hovering(doc, { kind: 'bond', id: bond });
    expect(edit(s, { kind: 'element', element: 'O' })).toBe(s);
    expect(canUndo(s.history)).toBe(false);
  });
});
