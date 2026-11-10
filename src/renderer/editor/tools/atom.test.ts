import { formulaOf } from '@core/chem-core';
import { addAtom, addBond, emptyDoc, type AtomId, type Doc } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { formulaText } from '../model/formula';
import { atomTool } from './atom';
import { DRAG_PX } from './tool';
import {
  at,
  atomsOf,
  BOND_PX,
  click,
  drag,
  NOW,
  rig,
  screenOf,
  screenPos,
  send,
  SHIFT,
  type Rig,
} from './testing';

const atomRig = (variant: string, doc: Doc = emptyDoc(NOW)): Rig => rig(atomTool, doc, variant);
const ORIGIN = screenOf({ x: 0, y: 0 });
const carbon = (): { doc: Doc; a: AtomId } => {
  const [doc, a] = addAtom(emptyDoc(NOW), { element: 'C', x: 0, y: 0 });
  return { doc, a };
};
const formula = (d: Doc): string => formulaText(formulaOf(d, Object.keys(d.atoms) as AtomId[]));

describe('A1 element option', () => {
  it('a click on a carbon with O makes it O, one "Change atom" step', () => {
    const { doc, a } = carbon();
    const r = atomRig('O', doc);
    click(r, ORIGIN);
    expect(r.commits).toHaveLength(1);
    expect(r.commits[0]?.label).toBe('Change atom');
    expect(r.doc.atoms[a]?.element).toBe('O');
  });

  it('the same element again: no step', () => {
    const { doc } = carbon();
    const r = atomRig('C', doc);
    click(r, ORIGIN);
    expect(r.commits).toHaveLength(0);
  });

  it('a click on empty canvas with N adds a lone N that draws as NH3', () => {
    const r = atomRig('N');
    click(r, ORIGIN);
    expect(r.commits).toHaveLength(1);
    expect(r.commits[0]?.label).toBe('Add atom');
    expect(formula(r.doc)).toBe('H3N · 17.03 g/mol');
    expect(screenPos(r.doc, atomsOf(r.doc)[0] as AtomId)).toEqual(ORIGIN);
  });

  it('a drag from an atom with Cl bonds a new Cl, 80 px away, with a ghost; one step', () => {
    const { doc, a } = carbon();
    const r = atomRig('Cl', doc);
    const to = { x: ORIGIN.x + 2 * BOND_PX, y: ORIGIN.y };
    const seen = drag(r, ORIGIN, to);
    expect(seen?.doc.atoms).toBeDefined();
    expect(r.commits).toHaveLength(1);
    expect(r.commits[0]?.label).toBe('Add bond');
    const fresh = atomsOf(r.doc).find((id) => id !== a) as AtomId;
    expect(r.doc.atoms[fresh]?.element).toBe('Cl');
    expect(
      Math.hypot(
        ...[0, 1].map((i) => (i === 0 ? r.doc.atoms[fresh]?.x : r.doc.atoms[fresh]?.y) ?? 0),
      ),
    ).toBeCloseTo(1, 9);
    expect(seen?.doc).toEqual(r.doc);
    expect(Object.keys(r.doc.bonds)).toHaveLength(1);
  });

  it('a drag from empty canvas, or a press released far away, adds nothing', () => {
    const r = atomRig('Cl');
    drag(r, ORIGIN, { x: ORIGIN.x + 160, y: ORIGIN.y });
    expect(r.commits).toHaveLength(0);
    expect(r.gesture).toBeNull();
    const { doc } = carbon();
    const r2 = atomRig('Cl', doc);
    send(r2, at(ORIGIN, 'down'));
    send(r2, at({ x: ORIGIN.x + DRAG_PX + 2, y: ORIGIN.y }, 'move'));
    send(r2, { type: 'cancel' });
    expect(r2.commits).toHaveLength(0);
  });

  it('Shift on the drag frees the angle', () => {
    const { doc, a } = carbon();
    const r = atomRig('O', doc);
    drag(r, ORIGIN, { x: ORIGIN.x + 160, y: ORIGIN.y - 120 }, SHIFT);
    const fresh = atomsOf(r.doc).find((id) => id !== a) as AtomId;
    const p = r.doc.atoms[fresh] as { x: number; y: number };
    expect((Math.atan2(-p.y, p.x) * 180) / Math.PI).toBeCloseTo(36.87, 1);
  });

  it('a click on a bond does nothing', () => {
    let d = emptyDoc(NOW);
    const [d1, a] = addAtom(d, { element: 'C', x: 0, y: 0 });
    const [d2, b] = addAtom(d1, { element: 'C', x: 1, y: 0 });
    d = addBond(d2, a, b)[0];
    const r = atomRig('O', d);
    click(r, screenOf({ x: 0.5, y: 0 }));
    expect(r.commits).toHaveLength(0);
  });
});

describe('A3 marks', () => {
  it('positive charge twice is +2, Shift+click is +1; each click is one "Change atom" step', () => {
    const { doc, a } = carbon();
    const r = atomRig('plus', doc);
    click(r, ORIGIN);
    click(r, ORIGIN);
    expect(r.doc.atoms[a]?.charge).toBe(2);
    click(r, ORIGIN, SHIFT);
    expect(r.doc.atoms[a]?.charge).toBe(1);
    expect(r.commits.map((c) => c.label)).toEqual(Array(3).fill('Change atom'));
  });

  it('negative charge clamps at -4 without a further step', () => {
    const { doc, a } = carbon();
    const r = atomRig('minus', doc);
    for (let i = 0; i < 6; i++) click(r, ORIGIN);
    expect(r.doc.atoms[a]?.charge).toBe(-4);
    expect(r.commits).toHaveLength(4);
  });

  it('lone pairs cycle to 4 and back to 0', () => {
    const { doc, a } = carbon();
    const r = atomRig('lone-pair', doc);
    for (let i = 0; i < 5; i++) click(r, ORIGIN);
    expect(r.doc.atoms[a]?.lonePairs).toBe(0);
    expect(r.commits).toHaveLength(5);
  });

  it('a radical toggles', () => {
    const { doc, a } = carbon();
    const r = atomRig('radical', doc);
    click(r, ORIGIN);
    expect(r.doc.atoms[a]?.radical).toBe(1);
    click(r, ORIGIN);
    expect(r.doc.atoms[a]?.radical).toBe(0);
  });

  it('delta+ is set, then cleared by the same option', () => {
    const { doc, a } = carbon();
    const r = atomRig('delta-plus', doc);
    click(r, ORIGIN);
    expect(r.doc.atoms[a]?.partialCharge).toBe('δ+');
    click(r, ORIGIN);
    expect(r.doc.atoms[a]?.partialCharge).toBeUndefined();
  });

  it('a mark on empty canvas: an info notice, no step', () => {
    const r = atomRig('plus');
    send(r, at(ORIGIN, 'down'));
    const step = send(r, at(ORIGIN, 'up'));
    expect(step.notice).toEqual({ kind: 'info', text: 'Click an atom to add this.' });
    expect(r.commits).toHaveLength(0);
    expect(Object.keys(r.doc.atoms)).toHaveLength(0);
  });

  it('a drag with a mark option adds nothing', () => {
    const { doc } = carbon();
    const r = atomRig('plus', doc);
    drag(r, ORIGIN, { x: ORIGIN.x + 160, y: ORIGIN.y });
    expect(r.commits).toHaveLength(0);
  });
});
