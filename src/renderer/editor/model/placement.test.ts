import { createNameIndex, structureFromText } from '@core/chem-core';
import {
  addAtom,
  addBond,
  emptyDoc,
  insert,
  type AtomId,
  type Doc,
  type SubDoc,
} from '@core/doc-model';
import { render } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import type { Point } from './geometry';
import { awayDirection, insertPosition, sproutDirections, subInk } from './placement';

const names = createNameIndex({
  format: 'chalkbond-compounds',
  version: 1,
  source: 'test',
  entries: [
    { name: 'ethanol', synonyms: [], smiles: 'CCO', formula: 'C2H6O', mw: 46.07 },
    { name: 'benzene', synonyms: [], smiles: 'c1ccccc1', formula: 'C6H6', mw: 78.11 },
    {
      name: 'acetic acid',
      synonyms: [],
      smiles: 'CC(=O)O',
      formula: 'C2H4O2',
      mw: 60.05,
    },
  ],
});

function sub(name: string): SubDoc {
  const r = structureFromText(name, names);
  if (!r.ok) throw new Error(name);
  return r.value.sub;
}

const empty = (): Doc => emptyDoc('2026-01-01T00:00:00.000Z');

/** Inserts `name` by P7 and returns the document and the ink box of what was inserted (BLU). */
function place(doc: Doc, name: string, centre = { x: 3, y: 2 }): { doc: Doc; ink: Rect } {
  const s = sub(name);
  const scene = render(doc);
  const at = insertPosition(doc, scene, s, centre);
  const [next, selection] = insert(doc, s, at);
  const after = render(next);
  const boxes = [...selection.atoms, ...selection.bonds]
    .map((id) => after.extents[(id.startsWith('a') ? `atom:${id}` : `bond:${id}`) as never])
    .filter((r): r is Rect => r !== undefined);
  const b = after.style.bondLength;
  const x0 = Math.min(...boxes.map((r) => r.x));
  const y0 = Math.min(...boxes.map((r) => r.y));
  const x1 = Math.max(...boxes.map((r) => r.x + r.w));
  const y1 = Math.max(...boxes.map((r) => r.y + r.h));
  return { doc: next, ink: { x: x0 / b, y: y0 / b, w: (x1 - x0) / b, h: (y1 - y0) / b } };
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

describe('P7 placement', () => {
  it('centres the ink box on the canvas centre in an empty document', () => {
    const { ink } = place(empty(), 'ethanol');
    expect(ink.x + ink.w / 2).toBeCloseTo(3, 1);
    expect(ink.y + ink.h / 2).toBeCloseTo(2, 1);
  });

  it('puts the next structure 1.0 BLU right of the ink box, centred on the rightmost fragment', () => {
    const first = place(empty(), 'ethanol');
    const before = render(first.doc);
    const bl = before.style.bondLength;
    const right = ((before.bounds?.x ?? 0) + (before.bounds?.w ?? 0)) / bl;
    const second = place(first.doc, 'benzene', { x: 40, y: 40 });
    expect(second.ink.x).toBeCloseTo(right + 1, 2);
    expect(second.ink.y + second.ink.h / 2).toBeCloseTo(first.ink.y + first.ink.h / 2, 1);
  });

  it('does not overlap and keeps going right', () => {
    const one = place(empty(), 'benzene');
    const two = place(one.doc, 'acetic acid');
    const three = place(two.doc, 'ethanol');
    expect(two.ink.x).toBeGreaterThan(one.ink.x + one.ink.w);
    expect(three.ink.x).toBeGreaterThan(two.ink.x + two.ink.w);
  });

  it('measures the ink of a sub-document, labels included', () => {
    const ink = subInk(sub('ethanol'), empty().style, '2026-01-01T00:00:00.000Z');
    expect(ink).not.toBeNull();
    expect(ink?.w).toBeGreaterThan(1.5);
  });
});

// P1: the default sprout direction and the next candidates.
const deg = (v: Point): number => Math.round((Math.atan2(-v.y, v.x) * 180) / Math.PI);

/** Atoms at the given BLU points, bonded in order along `pairs` (indices). */
function graph(points: readonly Point[], pairs: readonly (readonly [number, number])[]) {
  let doc = empty();
  const ids: AtomId[] = [];
  for (const p of points) {
    const [d, id] = addAtom(doc, { element: 'C', ...p });
    doc = d;
    ids.push(id);
  }
  for (const [i, j] of pairs) doc = addBond(doc, ids[i] as AtomId, ids[j] as AtomId)[0];
  return { doc, ids };
}

const C30 = Math.cos(Math.PI / 6);

describe('P1 sproutDirections', () => {
  it('n = 0: 30 degrees up and to the right', () => {
    const { doc, ids } = graph([{ x: 2, y: 3 }], []);
    const dirs = sproutDirections(doc, ids[0] as AtomId);
    expect(dirs).toHaveLength(1);
    expect(deg(dirs[0] as Point)).toBe(30);
  });

  it('n = 1, the neighbour has no other neighbours: the zig-zag (nearer horizontal), not the vertical', () => {
    // A at the origin, B up-right of it: sprouting from B goes down-right (propane).
    const { doc, ids } = graph(
      [
        { x: 0, y: 0 },
        { x: C30, y: -0.5 },
      ],
      [[0, 1]],
    );
    const fromB = sproutDirections(doc, ids[1] as AtomId);
    expect(deg(fromB[0] as Point)).toBe(-30);
    expect(deg(fromB[1] as Point)).toBe(90);
    // From A it goes up-left: a valley, still a zig-zag.
    const fromA = sproutDirections(doc, ids[0] as AtomId);
    expect(deg(fromA[0] as Point)).toBe(150);
    expect(deg(fromA[1] as Point)).toBe(-90);
  });

  it('n = 1, the neighbour has other neighbours: the direction farther from them (zig-zag continues)', () => {
    // Propane A-B-C zig-zag; sprouting from C goes up-right, never back down onto A's side.
    const { doc, ids } = graph(
      [
        { x: 0, y: 0 },
        { x: C30, y: -0.5 },
        { x: 2 * C30, y: 0 },
      ],
      [
        [0, 1],
        [1, 2],
      ],
    );
    const dirs = sproutDirections(doc, ids[2] as AtomId);
    expect(deg(dirs[0] as Point)).toBe(30);
    expect(deg(dirs[1] as Point)).toBe(-90);
  });

  it('n = 1, a vertical bond: both candidates are 30 degrees from horizontal; the more rightward wins', () => {
    const { doc, ids } = graph(
      [
        { x: 0, y: 0 },
        { x: 0, y: -1 },
      ],
      [[0, 1]],
    );
    // From the lower atom, up is taken: candidates are down-left and down-right.
    const dirs = sproutDirections(doc, ids[0] as AtomId);
    expect(deg(dirs[0] as Point)).toBe(-30);
    expect(deg(dirs[1] as Point)).toBe(-150);
  });

  it('n >= 2: the bisector of the largest gap, then of the next largest', () => {
    // A carbon with neighbours at 150 and 30 degrees (the middle of a zig-zag, pointing down).
    const { doc, ids } = graph(
      [
        { x: 0, y: 0 },
        { x: -C30, y: -0.5 },
        { x: C30, y: -0.5 },
      ],
      [
        [0, 1],
        [0, 2],
      ],
    );
    const dirs = sproutDirections(doc, ids[0] as AtomId);
    expect(deg(dirs[0] as Point)).toBe(-90);
    expect(dirs).toHaveLength(2);
    expect(deg(dirs[1] as Point)).toBe(90);
  });

  it('n = 3 at 120 degrees: all gaps tie, the gap starting at the smallest angle wins', () => {
    const { doc, ids } = graph(
      [
        { x: 0, y: 0 },
        { x: 0, y: -1 },
        { x: -C30, y: 0.5 },
        { x: C30, y: 0.5 },
      ],
      [
        [0, 1],
        [0, 2],
        [0, 3],
      ],
    );
    // Neighbours at 90, 210 and 330 degrees (counter-clockwise from +x, y up): gaps start at 90,
    // 210 and 330; the first begins at 90 and its bisector is 150.
    const dirs = sproutDirections(doc, ids[0] as AtomId);
    expect(deg(dirs[0] as Point)).toBe(150);
  });

  it('unit vectors', () => {
    const { doc, ids } = graph([{ x: 0, y: 0 }], []);
    const v = sproutDirections(doc, ids[0] as AtomId)[0] as Point;
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 12);
  });
});

describe('P4 awayDirection', () => {
  const near = (v: Point | null, x: number, y: number): void => {
    expect(v?.x).toBeCloseTo(x, 9);
    expect(v?.y).toBeCloseTo(y, 9);
  };

  it('a lone atom: 30 degrees up and to the right', () => {
    const [d, a] = addAtom(empty(), { element: 'C', x: 0, y: 0 });
    near(awayDirection(d, a), Math.cos(Math.PI / 6), -0.5);
  });

  it('one neighbour: straight away from it, not the zig-zag direction of P1', () => {
    const [d1, a] = addAtom(empty(), { element: 'C', x: 0, y: 0 });
    const [d2, b] = addAtom(d1, { element: 'C', x: 0, y: -1 });
    let d = d2;
    d = addBond(d, a, b)[0];
    near(awayDirection(d, a), 0, 1);
    expect(sproutDirections(d, a)[0]?.y).not.toBeCloseTo(1, 3);
  });

  it('two neighbours: the bisector of the largest gap, as P1', () => {
    const [d1, a] = addAtom(empty(), { element: 'C', x: 0, y: 0 });
    const [d2, l] = addAtom(d1, { element: 'C', x: -0.866, y: 0.5 });
    const [d3, r] = addAtom(d2, { element: 'C', x: 0.866, y: 0.5 });
    let d = d3;
    d = addBond(addBond(d, a, l)[0], a, r)[0];
    near(awayDirection(d, a), 0, -1);
  });

  it('an unknown atom: null', () => {
    expect(awayDirection(empty(), 'a9' as AtomId)).toBeNull();
  });
});
