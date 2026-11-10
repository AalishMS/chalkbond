import { formulaOf } from '@core/chem-core';
import { addAtom, addBond, emptyDoc, type AtomId, type Doc, type Point } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { chainEdit, MAX_CHAIN } from './chain-ops';
import { formulaText } from './formula';
import { angleDeg, distance } from './geometry';

const NOW = '2026-01-01T00:00:00.000Z';
const empty = (): Doc => emptyDoc(NOW);
const C30 = Math.cos(Math.PI / 6);
const atomsOf = (d: Doc): AtomId[] => Object.keys(d.atoms) as AtomId[];
const at = (d: Doc, id: AtomId): Point => d.atoms[id] as Point;
/** The atoms of a chain in the order they were drawn. */
const path = (d: Doc): Point[] => atomsOf(d).map((id) => at(d, id));

describe('P2 chain', () => {
  it('a drag of 3.5 BLU makes 4 bonds of length 1.0 alternating up and down', () => {
    const edit = chainEdit(empty(), { point: { x: 0, y: 0 } }, { x: 3.5, y: 0 }, false);
    expect(edit?.count).toBe(4);
    const pts = path(edit?.doc as Doc);
    expect(pts).toHaveLength(5);
    expect(Object.keys(edit?.doc.bonds ?? {})).toHaveLength(4);
    for (let i = 1; i < pts.length; i++) {
      expect(Math.abs(distance(pts[i - 1] as Point, pts[i] as Point) - 1)).toBeLessThan(1e-9);
    }
    // The first bond goes up; the zig-zag alternates, every x step is cos 30.
    expect(pts.map((p) => Math.round(p.y * 1000) / 1000)).toEqual([0, -0.5, 0, -0.5, 0]);
    expect(pts.map((p) => Math.round(p.x * 1000) / 1000)).toEqual(
      [0, 1, 2, 3, 4].map((k) => Math.round(k * C30 * 1000) / 1000),
    );
  });

  it('every angle in the chain is 120 degrees', () => {
    const pts = path(
      chainEdit(empty(), { point: { x: 0, y: 0 } }, { x: 2.6, y: -1.5 }, false)?.doc as Doc,
    );
    for (let i = 1; i + 1 < pts.length; i++) {
      const a = angleDeg(pts[i] as Point, pts[i - 1] as Point);
      const b = angleDeg(pts[i] as Point, pts[i + 1] as Point);
      const between = Math.abs(((a - b + 540) % 360) - 180);
      expect(Math.abs(between - 120)).toBeLessThan(1e-6);
    }
  });

  it('a 4 BLU drag is five bonds (n = round(projected / cos 30)): hexane, not pentane', () => {
    const edit = chainEdit(empty(), { point: { x: 0, y: 0 } }, { x: 4, y: 0 }, false);
    expect(edit?.count).toBe(5);
    expect(formulaText(formulaOf(edit?.doc as Doc, atomsOf(edit?.doc as Doc)))).toBe(
      'C6H14 · 86.18 g/mol',
    );
  });

  it('the direction snaps to 30 degrees; Shift keeps the angle', () => {
    // Atom 2 of a zig-zag lies on the axis: its direction from the start is the drag direction.
    const snapped = chainEdit(empty(), { point: { x: 0, y: 0 } }, { x: 2, y: -1.7 }, false);
    const pts = path(snapped?.doc as Doc);
    expect(angleDeg(pts[0] as Point, pts[2] as Point)).toBeCloseTo(-30, 9);
    const free = chainEdit(empty(), { point: { x: 0, y: 0 } }, { x: 2.4, y: -1.8 }, true);
    const q = path(free?.doc as Doc);
    expect(angleDeg(q[0] as Point, q[2] as Point)).toBeCloseTo(-36.8699, 3);
  });

  it('from an atom with a neighbour the first zig continues the zig-zag (P1)', () => {
    const [d1, a] = addAtom(empty(), { element: 'C', x: 0, y: 0 });
    const [d2, b] = addAtom(d1, { element: 'C', x: C30, y: -0.5 });
    let d = d2;
    d = addBond(d, a, b)[0];
    const edit = chainEdit(d, { atom: b }, { x: C30 + 2.5, y: -0.5 }, false);
    const out = edit?.doc as Doc;
    const added = atomsOf(out).filter((id) => !(id in d.atoms));
    expect(added).toHaveLength(3);
    // Propane's zig-zag: the next atom is down-right of b, not up-right.
    expect(at(out, added[0] as AtomId).y).toBeCloseTo(0, 9);
    expect(at(out, added[1] as AtomId).y).toBeCloseTo(-0.5, 9);
  });

  it('1 to 20 bonds', () => {
    const tiny = chainEdit(empty(), { point: { x: 0, y: 0 } }, { x: 0.1, y: 0 }, false);
    expect(tiny?.count).toBe(1);
    const huge = chainEdit(empty(), { point: { x: 0, y: 0 } }, { x: 60, y: 0 }, false);
    expect(huge?.count).toBe(MAX_CHAIN);
    expect(Object.keys(huge?.doc.bonds ?? {})).toHaveLength(20);
  });

  it('no movement: no chain', () => {
    expect(chainEdit(empty(), { point: { x: 1, y: 1 } }, { x: 1, y: 1 }, false)).toBeNull();
  });

  it('atoms within 0.15 BLU of existing atoms are merged (P6)', () => {
    const [d1, hit] = addAtom(empty(), { element: 'C', x: 2 * C30 + 0.1, y: 0 });
    const d = d1;
    const edit = chainEdit(d, { point: { x: 0, y: 0 } }, { x: 3, y: 0 }, false);
    const out = edit?.doc as Doc;
    expect(out.atoms[hit]).toEqual(d.atoms[hit]);
    expect(edit?.merge).toBe(hit);
    expect(Object.keys(out.bonds).length).toBe(edit?.count);
  });

  it('a chain from an atom keeps the atom and adds count atoms', () => {
    const [d, a] = addAtom(empty(), { element: 'C', x: 5, y: 5 });
    const edit = chainEdit(d, { atom: a }, { x: 9, y: 5 }, false);
    expect(atomsOf(edit?.doc as Doc)).toHaveLength(1 + (edit?.count ?? 0));
    expect(edit?.doc.atoms[a]).toEqual(d.atoms[a]);
  });
});
