import { addAtom, addBond, emptyDoc, type AtomId, type Doc } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { chainTool } from './chain';
import { DRAG_PX } from './tool';
import {
  at,
  atomsOf,
  BOND_PX,
  click,
  dist,
  drag,
  NONE,
  NOW,
  rig,
  screenOf,
  screenPos,
  send,
  SHIFT,
  type Rig,
} from './testing';

const chainRig = (doc: Doc = emptyDoc(NOW)): Rig => rig(chainTool, doc);
const START = screenOf({ x: 0, y: 0 });
const bondCount = (d: Doc): number => Object.keys(d.bonds).length;

describe('P2 chain drag', () => {
  it('dragging 4 bonds of travel to the right commits one zig-zag in one undo step', () => {
    const r = chainRig();
    const to = { x: START.x + 3.5 * BOND_PX, y: START.y };
    const seen = drag(r, START, to);
    expect(r.commits).toHaveLength(1);
    expect(r.commits[0]?.label).toBe('Add chain');
    expect(bondCount(r.doc)).toBe(4);
    expect(atomsOf(r.doc)).toHaveLength(5);
    // The ghost showed the same document, with every new part marked added.
    expect(seen?.doc).toEqual(r.doc);
    expect(seen?.hovering).toBeUndefined();
    expect(seen?.added.size).toBe(9);
    const [a, b] = atomsOf(r.doc);
    expect(dist(screenPos(r.doc, a as AtomId), START)).toBeLessThan(1e-9);
    expect(dist(screenPos(r.doc, a as AtomId), screenPos(r.doc, b as AtomId))).toBeCloseTo(
      BOND_PX,
      9,
    );
    expect(r.gesture).toBeNull();
    expect(r.preview).toBeNull();
  });

  it('the count label follows the pointer, 12 px below and right of it', () => {
    const r = chainRig();
    send(r, at(START, 'down'));
    const to = { x: START.x + 2.5 * BOND_PX, y: START.y };
    send(r, at(to, 'move'));
    const count = r.gesture?.overlay?.count;
    expect(count?.n).toBe(3);
    expect(count?.at).toEqual({ x: to.x + 12, y: to.y + 12 });
    send(r, at({ x: to.x + 70, y: to.y }, 'move'));
    expect(r.gesture?.overlay?.count?.n).toBe(4);
  });

  it('Shift keeps the pointer angle instead of snapping to 30 degrees', () => {
    const r = chainRig();
    drag(r, START, { x: START.x + 200, y: START.y - 150 }, SHIFT);
    const [a, , c] = atomsOf(r.doc);
    const pa = screenPos(r.doc, a as AtomId);
    const pc = screenPos(r.doc, c as AtomId);
    expect(Math.atan2(-(pc.y - pa.y), pc.x - pa.x) * (180 / Math.PI)).toBeCloseTo(36.87, 1);
  });

  it('a drag from an atom grows the chain from it', () => {
    const [d, a] = addAtom(emptyDoc(NOW), { element: 'C', x: 0, y: 0 });
    const r = chainRig(d);
    drag(r, START, { x: START.x + 3 * BOND_PX, y: START.y });
    expect(r.commits).toHaveLength(1);
    expect(r.doc.atoms[a]).toEqual(d.atoms[a]);
    expect(atomsOf(r.doc).length).toBeGreaterThan(2);
  });

  it('a drag of a few px adds one bond', () => {
    const r = chainRig();
    drag(r, START, { x: START.x + DRAG_PX + 3, y: START.y });
    expect(bondCount(r.doc)).toBe(1);
  });

  it('Esc cancels: nothing is committed and the ghost goes', () => {
    const r = chainRig();
    send(r, at(START, 'down'));
    send(r, at({ x: START.x + 200, y: START.y }, 'move'));
    expect(r.preview).not.toBeNull();
    send(r, { type: 'cancel' });
    expect(r.gesture).toBeNull();
    expect(r.preview).toBeNull();
    expect(r.commits).toHaveLength(0);
  });

  it('a release at the press point after a drag back adds nothing', () => {
    const r = chainRig();
    send(r, at(START, 'down'));
    send(r, at({ x: START.x + 200, y: START.y }, 'move'));
    send(r, at(START, 'move'));
    send(r, at(START, 'up'));
    expect(r.commits).toHaveLength(0);
  });

  it('a right-button press starts nothing', () => {
    const r = chainRig();
    send(r, at(START, 'down', NONE, 2));
    expect(r.gesture).toBeNull();
  });
});

describe('P2 chain click', () => {
  it('a click on empty canvas adds one bond as B1, one undo step', () => {
    const r = chainRig();
    click(r, START);
    expect(r.commits).toHaveLength(1);
    expect(r.commits[0]?.label).toBe('Add chain');
    expect(bondCount(r.doc)).toBe(1);
    expect(atomsOf(r.doc)).toHaveLength(2);
  });

  it('a click on an atom sprouts one bond from it as B3', () => {
    const [d] = addAtom(emptyDoc(NOW), { element: 'C', x: 0, y: 0 });
    const r = chainRig(d);
    click(r, START);
    expect(bondCount(r.doc)).toBe(1);
    expect(atomsOf(r.doc)).toHaveLength(2);
  });

  it('a click on a bond does nothing', () => {
    const [d1, a] = addAtom(emptyDoc(NOW), { element: 'C', x: 0, y: 0 });
    const [d2, b] = addAtom(d1, { element: 'C', x: 1, y: 0 });
    let d = d2;
    d = addBond(d, a, b)[0];
    const r = chainRig(d);
    click(r, screenOf({ x: 0.5, y: 0 }));
    expect(r.commits).toHaveLength(0);
  });
});
