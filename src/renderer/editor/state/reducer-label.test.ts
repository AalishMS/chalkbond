import {
  canRedo,
  canUndo,
  current,
  setStyle,
  undoLabel,
  type AtomId,
  type Doc,
} from '@core/doc-model';
import { ringAtoms } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import type { CanvasEvent } from '../model/canvas-event';
import { fromText, insertText, selectionOf, textOf } from '../model/text-edit';
import { bluToScreen, screenToBlu } from '../model/viewport';
import type { EditorState, Hit } from './editor-state';
import { reduce, type EditorAction } from './reducer';
import { drawn, freshState, testContext } from './testing';

const ctx = testContext();
const run = (s: EditorState, a: EditorAction): EditorState => reduce(s, a, ctx);
const docOf = (s: EditorState): Doc => current(s.history);
const BL = 40;

/** Ethanol, the oxygen being the last atom. */
function ethanol(tool: EditorState['tool'] = 'select'): { s: EditorState; o: AtomId; c: AtomId } {
  let s = run(freshState(drawn({ name: 'ethanol', x: 0, y: 0 })), {
    type: 'canvas-resized',
    size: { w: 1200, h: 700 },
  });
  s = run(s, { type: 'select-tool', tool });
  const atoms = Object.values(docOf(s).atoms);
  const o = atoms.find((a) => a.element === 'O')?.id as AtomId;
  const c = atoms.find((a) => a.element === 'C')?.id as AtomId;
  return { s, o, c };
}

const atomHit = (id: AtomId): Hit => ({ kind: 'atom', id });
const hovering = (s: EditorState, id: AtomId): EditorState => ({ ...s, hover: atomHit(id) });
const open = (s: EditorState, id: AtomId): EditorState => run(s, { type: 'open-label', atom: id });
const typeInto = (s: EditorState, text: string): EditorState => {
  if (s.editing === null) throw new Error('no editor');
  return run(s, { type: 'edit-set', edit: insertText(s.editing.edit, text) });
};

describe('opening the label editor (L1)', () => {
  it('fills the box with the label or the element, all selected', () => {
    const { s, o } = ethanol();
    const e = open(s, o).editing;
    expect(e).toMatchObject({ kind: 'label', atom: o });
    expect(textOf(e?.edit as never)).toBe('O');
    expect(selectionOf(e?.edit as never)).toEqual({ start: 0, end: 1 });
  });

  it('Enter over a hovered atom opens it with any tool except Erase and Text', () => {
    for (const tool of ['select', 'bond', 'chain', 'ring', 'atom', 'arrow'] as const) {
      const { s, o } = ethanol(tool);
      const next = run(hovering(s, o), { type: 'hover-edit', edit: { kind: 'label' } });
      expect(next.editing).toMatchObject({ kind: 'label', atom: o });
    }
  });

  it('opening clears the hover and the hover ghost, and does not touch the document', () => {
    const { s, o } = ethanol('bond');
    const next = run(hovering(s, o), { type: 'hover-edit', edit: { kind: 'label' } });
    expect(next.hover).toBeNull();
    expect(next.preview).toBeNull();
    expect(docOf(next)).toBe(docOf(s));
    expect(canUndo(next.history)).toBe(false);
  });

  it('does nothing without a hovered atom, with a gesture running, or while one is open', () => {
    const { s, o } = ethanol('bond');
    expect(run(s, { type: 'hover-edit', edit: { kind: 'label' } })).toBe(s);
    const g = { ...hovering(s, o), gesture: { kind: 'bond-press' } };
    expect(run(g, { type: 'hover-edit', edit: { kind: 'label' } })).toBe(g);
    const opened = open(s, o);
    expect(open(opened, o)).toBe(opened);
  });

  it('a double-click on an atom with Select opens it (R2, S7)', () => {
    const { s, o } = ethanol('select');
    const at = bluToScreen(s.viewport, docOf(s).atoms[o] as { x: number; y: number }, BL);
    const ev: CanvasEvent = { type: 'dblclick', screen: at, p: screenToBlu(s.viewport, at, BL) };
    expect(run(s, { type: 'pointer', event: ev }).editing).toMatchObject({ atom: o });
  });

  it('a double-click with the Bond tool opens nothing and adds nothing (R2)', () => {
    const { s, o } = ethanol('bond');
    const at = bluToScreen(s.viewport, docOf(s).atoms[o] as { x: number; y: number }, BL);
    const ev: CanvasEvent = { type: 'dblclick', screen: at, p: screenToBlu(s.viewport, at, BL) };
    const next = run(s, { type: 'pointer', event: ev });
    expect(next.editing).toBeNull();
    expect(docOf(next)).toBe(docOf(s));
  });

  it('a double-click on empty canvas opens nothing', () => {
    const { s } = ethanol('select');
    const at = { x: 1100, y: 650 };
    const ev: CanvasEvent = { type: 'dblclick', screen: at, p: screenToBlu(s.viewport, at, BL) };
    expect(run(s, { type: 'pointer', event: ev }).editing).toBeNull();
  });
});

describe('while the editor is open', () => {
  it('pointer events, hover and Undo / Redo leave the document and the editor alone (R7)', () => {
    const { s, o } = ethanol();
    const base = open(s, o);
    expect(run(base, { type: 'undo' })).toBe(base);
    expect(run(base, { type: 'redo' })).toBe(base);
    expect(run(base, { type: 'delete' })).toBe(base);
  });

  it('edit-set replaces the editing model', () => {
    const { s, o } = ethanol();
    const next = typeInto(open(s, o), 'N');
    expect(textOf(next.editing?.edit as never)).toBe('N');
  });

  it('edit-set without an editor does nothing', () => {
    const { s } = ethanol();
    const edit = { runs: [], anchor: 0, focus: 0, pending: null, undo: [], redo: [] } as const;
    expect(run(s, { type: 'edit-set', edit })).toBe(s);
  });
});

describe('committing (L3)', () => {
  it('NH2 on the oxygen: one "Change atom" undo step, the editor closed', () => {
    const { s, o } = ethanol();
    const next = run(typeInto(open(s, o), 'NH2'), { type: 'edit-commit' });
    expect(next.editing).toBeNull();
    expect(docOf(next).atoms[o]).toMatchObject({ element: 'N' });
    expect(next.history.past).toHaveLength(s.history.past.length + 1);
    expect(undoLabel(next.history)).toBe('Change atom');
    const undone = run(next, { type: 'undo' });
    expect(docOf(undone).atoms[o]).toMatchObject({ element: 'O' });
  });

  it('typing replaces the selected text; Ph becomes an abbreviation', () => {
    const { s, o } = ethanol();
    const next = run(typeInto(open(s, o), 'Ph'), { type: 'edit-commit' });
    expect(docOf(next).atoms[o]).toMatchObject({ element: 'C', label: 'Ph' });
  });

  it('committing without a change records no undo step', () => {
    const { s, o } = ethanol();
    const next = run(open(s, o), { type: 'edit-commit' });
    expect(next.editing).toBeNull();
    expect(next.history).toBe(s.history);
    expect(canRedo(next.history)).toBe(false);
  });

  it("an unknown label is kept as typed (the warning is the overlay's)", () => {
    const { s, o } = ethanol();
    const next = run(typeInto(open(s, o), 'H20'), { type: 'edit-commit' });
    expect(docOf(next).atoms[o]).toMatchObject({ element: '*', label: 'H20' });
  });

  it('empty text makes the atom a plain carbon', () => {
    const { s, o } = ethanol();
    const emptied = run(open(s, o), { type: 'edit-set', edit: fromText('') });
    const next = run(emptied, { type: 'edit-commit' });
    expect(docOf(next).atoms[o]).toMatchObject({ element: 'C' });
  });

  it('edit-commit without an editor does nothing', () => {
    const { s } = ethanol();
    expect(run(s, { type: 'edit-commit' })).toBe(s);
  });
});

describe('cancelling', () => {
  it('Esc (edit-cancel) closes the editor and changes nothing', () => {
    const { s, o } = ethanol();
    const next = run(typeInto(open(s, o), 'NH2'), { type: 'edit-cancel' });
    expect(next.editing).toBeNull();
    expect(next.history).toBe(s.history);
  });

  it('the Esc ladder also closes the editor', () => {
    const { s, o } = ethanol();
    expect(run(open(s, o), { type: 'escape' }).editing).toBeNull();
  });
});

describe('the label editor in structural mode (L1, R52 U11, R53)', () => {
  const structural = (name: string): { s: EditorState } => {
    const s = run(freshState(setStyle(drawn({ name, x: 0, y: 0 }), { formula: 'structural' })), {
      type: 'canvas-resized',
      size: { w: 1200, h: 700 },
    });
    return { s };
  };
  const carbons = (s: EditorState): Doc['atoms'][AtomId][] =>
    Object.values(docOf(s).atoms).filter((a) => a.element === 'C');

  it('a chain carbon opens filled with the text it shows: CH3 for the methyl, CH2 for the next', () => {
    const { s } = structural('ethanol');
    const texts = carbons(s).map((a) => textOf(open(s, a.id).editing?.edit as never));
    expect(texts.sort()).toEqual(['CH2', 'CH3']);
  });

  it('the same carbon opens as C in skeletal mode', () => {
    const base = ethanol().s;
    for (const a of carbons(base)) {
      expect(textOf(open(base, a.id).editing?.edit as never)).toBe('C');
    }
  });

  it('Enter on the unchanged text records no history step', () => {
    const { s } = structural('ethanol');
    for (const a of carbons(s)) {
      const next = run(open(s, a.id), { type: 'edit-commit' });
      expect(next.editing).toBeNull();
      expect(next.history).toBe(s.history);
    }
  });

  it('a ring carbon of toluene opens with C; the methyl with CH3', () => {
    const { s } = structural('toluene');
    const doc = docOf(s);
    const rings = ringAtoms(doc);
    const ring = carbons(s).filter((a) => rings.has(a.id));
    const chain = carbons(s).filter((a) => !rings.has(a.id));
    expect(ring).toHaveLength(6);
    for (const a of ring) expect(textOf(open(s, a.id).editing?.edit as never)).toBe('C');
    expect(chain).toHaveLength(1);
    expect(textOf(open(s, chain[0]!.id).editing?.edit as never)).toBe('CH3');
  });

  it('a carbon with a label opens with the label; a heteroatom as before', () => {
    const { s } = structural('ethanol');
    const o = Object.values(docOf(s).atoms).find((a) => a.element === 'O')!;
    expect(textOf(open(s, o.id).editing?.edit as never)).toBe('O');
  });
});
