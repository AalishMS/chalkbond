import { createNameIndex } from '@core/chem-core';
import { canUndo, current, undoLabel } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import compounds from '../../../../resources/compounds/compounds.json';
import { ptToScreen } from '../model/viewport';
import type { EditorState } from './editor-state';
import { reduce, type EditorAction } from './reducer';
import { freshState, testContext } from './testing';

const ctx = { ...testContext(), names: createNameIndex(compounds) };
const run = (s: EditorState, a: EditorAction): EditorState => reduce(s, a, ctx);
const sized = (): EditorState =>
  run(freshState(), { type: 'canvas-resized', size: { w: 1215, h: 722 } });
const typed = (s: EditorState, text: string): EditorState => run(s, { type: 'name-text', text });
const atomCount = (s: EditorState): number => Object.keys(current(s.history).atoms).length;
const inkOf = (s: EditorState) => {
  const b = ctx.derive.committed(current(s.history)).scene.bounds;
  if (b === null) throw new Error('empty scene');
  return b;
};

describe('name-text (N1)', () => {
  it('opens the dropdown from two characters with the first row highlighted', () => {
    const s = typed(sized(), 'eth');
    expect(s.nameField).toEqual({ text: 'eth', open: true, highlighted: 0, error: null });
  });

  it('stays closed for one character, no match, and reaction text', () => {
    expect(typed(sized(), 'e').nameField.open).toBe(false);
    expect(typed(sized(), 'qqqqzz').nameField.open).toBe(false);
    expect(typed(sized(), 'ethanol + eth').nameField.open).toBe(false);
  });

  it('editing the text clears the not-found panel and resets the highlight', () => {
    let s = typed(sized(), 'ethanl');
    s = run(s, { type: 'name-enter' });
    expect(s.nameField.error).not.toBeNull();
    s = typed(s, 'ethan');
    expect(s.nameField.error).toBeNull();
    expect(s.nameField.highlighted).toBe(0);
  });
});

describe('name-highlight', () => {
  it('moves down and up and stops at the ends', () => {
    let s = typed(sized(), 'eth');
    s = run(s, { type: 'name-highlight', dir: -1 });
    expect(s.nameField.highlighted).toBe(0);
    for (let i = 0; i < 20; i++) s = run(s, { type: 'name-highlight', dir: 1 });
    expect(s.nameField.highlighted).toBe(7);
    s = run(s, { type: 'name-highlight', dir: -1 });
    expect(s.nameField.highlighted).toBe(6);
  });

  it('does nothing while the dropdown is closed', () => {
    const s = sized();
    expect(run(s, { type: 'name-highlight', dir: 1 })).toBe(s);
  });
});

describe('name-enter and insert-text (N2)', () => {
  it('Enter inserts the highlighted row, one undo step labelled "Insert ethene"', () => {
    let s = typed(sized(), 'eth');
    s = run(s, { type: 'name-highlight', dir: 1 });
    s = run(s, { type: 'name-enter' });
    expect(undoLabel(s.history)).toBe('Insert ethene');
    expect(atomCount(s)).toBe(2);
  });

  it('Enter with the dropdown closed inserts the typed text', () => {
    const s = run(typed(sized(), 'ethanol'), { type: 'name-enter' });
    expect(atomCount(s)).toBe(3);
    expect(undoLabel(s.history)).toBe('Insert ethanol');
  });

  it('clears the field, selects the inserted items, switches to Select, announces it', () => {
    const s = run(typed(sized(), 'ethanol'), { type: 'name-enter' });
    expect(s.nameField).toEqual({ text: '', open: false, highlighted: 0, error: null });
    expect(s.selection.atoms.size).toBe(3);
    expect(s.selection.bonds.size).toBe(2);
    expect(s.tool).toBe('select');
    expect(s.notice).toMatchObject({ kind: 'info', text: 'Inserted ethanol' });
  });

  it('centres the first structure on the canvas centre', () => {
    const s = run(sized(), { type: 'insert-text', text: 'ethanol' });
    const b = inkOf(s);
    const mid = ptToScreen(s.viewport, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
    expect(Math.abs(mid.x - 1215 / 2)).toBeLessThan(1);
    expect(Math.abs(mid.y - 722 / 2)).toBeLessThan(1);
    expect(s.viewport.zoom).toBe(1.5);
  });

  it('puts the second structure to the right and keeps everything in view', () => {
    let s = run(sized(), { type: 'insert-text', text: 'ethanol' });
    s = run(s, { type: 'insert-text', text: 'benzene' });
    const b = inkOf(s);
    const left = ptToScreen(s.viewport, { x: b.x, y: b.y });
    const right = ptToScreen(s.viewport, { x: b.x + b.w, y: b.y + b.h });
    expect(left.x).toBeGreaterThanOrEqual(48 - 1e-6);
    expect(right.x).toBeLessThanOrEqual(1215 - 48 + 1e-6);
    expect(s.viewport.zoom).toBeLessThanOrEqual(1.5);
    expect(s.selection.atoms.size).toBe(6);
  });

  it('frames the whole drawing: centred as one group at 150 % (R22, V7)', () => {
    const mid = (s: EditorState) => {
      const b = inkOf(s);
      const a = ptToScreen(s.viewport, { x: b.x, y: b.y });
      const c = ptToScreen(s.viewport, { x: b.x + b.w, y: b.y + b.h });
      return { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
    };
    let s = run(sized(), { type: 'insert-text', text: 'ethanol' });
    s = run(s, { type: 'insert-text', text: 'benzene' });
    expect(s.viewport.zoom).toBe(1.5);
    expect(Math.abs(mid(s).x - 1215 / 2)).toBeLessThan(1);
    expect(Math.abs(mid(s).y - 722 / 2)).toBeLessThan(1);
    s = run(s, { type: 'insert-text', text: 'acetic acid' });
    expect(Math.abs(mid(s).x - 1215 / 2)).toBeLessThan(1);
    expect(Math.abs(mid(s).y - 722 / 2)).toBeLessThan(1);
    // Selection is what was inserted, tool is Select.
    expect(s.tool).toBe('select');
    expect(s.selection.atoms.size).toBe(4);
  });

  it('selects the inserted items and switches to Select even from another tool', () => {
    let s = run(sized(), { type: 'select-tool', tool: 'ring' });
    s = run(s, { type: 'insert-text', text: 'benzene' });
    expect(s.tool).toBe('select');
    expect(s.selection.atoms.size).toBe(6);
  });

  it('a drawing too wide for the view zooms out, never in', () => {
    let s = run(sized(), { type: 'canvas-resized', size: { w: 400, h: 400 } });
    s = run(s, { type: 'insert-text', text: 'benzene' });
    s = run(s, { type: 'insert-text', text: 'ethanol' });
    expect(s.viewport.zoom).toBeLessThan(1.5);
  });

  it('an unknown name inserts nothing and shows the not-found state', () => {
    const s = run(typed(sized(), 'ethanl'), { type: 'name-enter' });
    expect(canUndo(s.history)).toBe(false);
    expect(s.nameField.text).toBe('ethanl');
    expect(s.nameField.error).toEqual({
      message: 'No compound named “ethanl”.',
      suggestions: ['ethanol', 'ethane', 'acetaldehyde'],
    });
  });

  it('a chip inserts its compound and clears the not-found state', () => {
    let s = run(typed(sized(), 'ethanl'), { type: 'name-enter' });
    s = run(s, { type: 'insert-text', text: 'ethanol' });
    expect(s.nameField).toEqual({ text: '', open: false, highlighted: 0, error: null });
    expect(undoLabel(s.history)).toBe('Insert ethanol');
  });

  it('empty text does nothing', () => {
    const s = sized();
    expect(run(s, { type: 'insert-text', text: '   ' })).toBe(s);
    expect(run(s, { type: 'name-enter' })).toBe(s);
  });

  it('a SMILES string inserts as "Insert structure"', () => {
    const s = run(sized(), { type: 'insert-text', text: 'CC(C)O' });
    expect(undoLabel(s.history)).toBe('Insert structure');
    expect(atomCount(s)).toBe(4);
  });

  it('undo removes the whole structure', () => {
    let s = run(sized(), { type: 'insert-text', text: 'ethanol' });
    s = run(s, { type: 'undo' });
    expect(atomCount(s)).toBe(0);
  });
});

describe('name-dismiss and name-clear (Esc ladder)', () => {
  it('dismiss closes the dropdown and the not-found panel but keeps the text', () => {
    let s = typed(sized(), 'eth');
    s = run(s, { type: 'name-dismiss' });
    expect(s.nameField).toEqual({ text: 'eth', open: false, highlighted: 0, error: null });
    s = run(typed(sized(), 'ethanl'), { type: 'name-enter' });
    s = run(s, { type: 'name-dismiss' });
    expect(s.nameField.error).toBeNull();
    expect(s.nameField.text).toBe('ethanl');
  });

  it('clear empties the field', () => {
    const s = run(typed(sized(), 'eth'), { type: 'name-clear' });
    expect(s.nameField).toEqual({ text: '', open: false, highlighted: 0, error: null });
  });
});

describe('two-atom molecules insert horizontally (N2, N3)', () => {
  const atomsOf = (s: EditorState) => Object.values(current(s.history).atoms);

  it('chlorine inserts Cl-Cl with the bond horizontal, first atom on the left', () => {
    const s = run(sized(), { type: 'insert-text', text: 'chlorine' });
    const [a, b] = atomsOf(s);
    if (a === undefined || b === undefined) throw new Error('expected two atoms');
    expect([a.element, b.element]).toEqual(['Cl', 'Cl']);
    expect(a.y).toBeCloseTo(b.y, 9);
    expect(a.x).toBeLessThan(b.x);
  });

  it('2 H2 + O2 -> 2 H2O lays H-H and O=O flat; water is untouched', () => {
    const s = run(sized(), { type: 'insert-text', text: '2 H2 + O2 -> 2 H2O' });
    const atoms = atomsOf(s);
    const h = atoms.filter((a) => a.element === 'H');
    const o = atoms.filter((a) => a.element === 'O');
    expect(h.length + o.length).toBe(atoms.length);
    const doc = current(s.history);
    for (const bond of Object.values(doc.bonds)) {
      const p = doc.atoms[bond.a1];
      const q = doc.atoms[bond.a2];
      if (p === undefined || q === undefined) throw new Error('dangling bond');
      if (p.element === q.element) expect(p.y).toBeCloseTo(q.y, 9);
    }
  });
});
