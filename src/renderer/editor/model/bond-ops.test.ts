import {
  addAtom,
  addBond,
  addObject,
  emptyDoc,
  type AtomId,
  type BondId,
  type Doc,
  type ObjectId,
} from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import {
  addedKeys,
  bondSpec,
  clickBond,
  dragBond,
  dragEnd,
  joinBond,
  newBond,
  reverseBond,
  setBondOrder,
  setBondStereo,
  sprout,
} from './bond-ops';
import type { Point } from './geometry';

const SINGLE = bondSpec('single');
const C30 = Math.cos(Math.PI / 6);
const empty = (): Doc => emptyDoc('2026-01-01T00:00:00.000Z');

/** Two bonded carbons: A at the origin, B up-right of it. */
function ab(): { doc: Doc; a: AtomId; b: AtomId; bond: BondId } {
  const [d1, a] = addAtom(empty(), { element: 'C', x: 0, y: 0 });
  const [d2, b] = addAtom(d1, { element: 'C', x: C30, y: -0.5 });
  const [d3, bond] = addBond(d2, a, b);
  return { doc: d3, a, b, bond };
}

const pos = (d: Doc, id: AtomId): Point => ({ x: d.atoms[id]?.x ?? NaN, y: d.atoms[id]?.y ?? NaN });
const len = (d: Doc, bond: BondId): number => {
  const b = d.bonds[bond];
  if (!b) return NaN;
  const [p, q] = [pos(d, b.a1), pos(d, b.a2)];
  return Math.hypot(q.x - p.x, q.y - p.y);
};
const firstBond = (d: Doc): BondId => Object.keys(d.bonds)[0] as BondId;
const freshAtom = (after: Doc, before: Doc): AtomId =>
  Object.keys(after.atoms).find((id) => !(id in before.atoms)) as AtomId;

describe('bondSpec', () => {
  it('maps the option to order and stereo', () => {
    expect(bondSpec('single')).toEqual({ order: 1, stereo: 'none' });
    expect(bondSpec('double')).toEqual({ order: 2, stereo: 'none' });
    expect(bondSpec('triple')).toEqual({ order: 3, stereo: 'none' });
    expect(bondSpec('wedge')).toEqual({ order: 1, stereo: 'wedge' });
    expect(bondSpec('hash')).toEqual({ order: 1, stereo: 'hash' });
  });
});

describe('B1 newBond', () => {
  it('two carbons 1.0 apart, the second 30 degrees up and to the right of the first', () => {
    const { doc } = newBond(empty(), { x: 2, y: 3 }, SINGLE);
    const [a1, a2] = Object.values(doc.atoms);
    expect(a1).toMatchObject({ x: 2, y: 3, element: 'C' });
    expect(a2?.x).toBeCloseTo(2 + C30, 12);
    expect(a2?.y).toBeCloseTo(2.5, 12);
    expect(Object.values(doc.bonds)).toHaveLength(1);
    expect(Object.values(doc.bonds)[0]).toMatchObject({ a1: a1?.id, a2: a2?.id, order: 1 });
  });

  it('carries the option: a wedge starts at the first atom', () => {
    const { doc } = newBond(empty(), { x: 0, y: 0 }, bondSpec('wedge'));
    expect(Object.values(doc.bonds)[0]).toMatchObject({ order: 1, stereo: 'wedge' });
  });
});

describe('B3 sprout', () => {
  it('propane then butane: each new bond is 1.0 long and the chain zig-zags', () => {
    const { doc, b } = ab();
    const d1 = sprout(doc, b, SINGLE)?.doc as Doc;
    const c = freshAtom(d1, doc);
    expect(pos(d1, c).x).toBeCloseTo(2 * C30, 12);
    expect(pos(d1, c).y).toBeCloseTo(0, 12);
    const d2 = sprout(d1, c, SINGLE)?.doc as Doc;
    const d = freshAtom(d2, d1);
    expect(pos(d2, d).x).toBeCloseTo(3 * C30, 12);
    expect(pos(d2, d).y).toBeCloseTo(-0.5, 12);
    for (const bond of Object.keys(d2.bonds) as BondId[]) expect(len(d2, bond)).toBeCloseTo(1, 12);
  });

  it('never lands on an atom it is already bonded to: the next candidate is used', () => {
    // A bonded atom sits where the default would go (down-right of B).
    const { doc, b } = ab();
    const [d1, x] = addAtom(doc, { element: 'C', x: 2 * C30, y: 0 });
    const d2 = addBond(d1, b, x)[0];
    const out = sprout(d2, b, SINGLE)?.doc as Doc;
    const fresh = freshAtom(out, d2);
    // Two neighbours (A down-left, x down-right): the bisector of the biggest gap is straight up.
    expect(pos(out, fresh).x).toBeCloseTo(C30, 12);
    expect(pos(out, fresh).y).toBeCloseTo(-1.5, 12);
  });

  it('ring closure: a candidate within 0.25 BLU of an unbonded atom bonds to that atom', () => {
    const { doc, b } = ab();
    const [d1, x] = addAtom(doc, { element: 'C', x: 2 * C30 + 0.2, y: 0 });
    const e = sprout(d1, b, SINGLE);
    expect(e?.merge).toBe(x);
    const out = e?.doc as Doc;
    expect(Object.keys(out.atoms)).toHaveLength(3);
    expect(Object.values(out.bonds).some((bd) => bd.a1 === b && bd.a2 === x)).toBe(true);
  });

  it('an atom 0.3 BLU from the candidate is not a ring closure', () => {
    const { doc, b } = ab();
    const [d1] = addAtom(doc, { element: 'C', x: 2 * C30 + 0.3, y: 0 });
    const e = sprout(d1, b, SINGLE);
    expect(e?.merge).toBeUndefined();
    expect(Object.keys((e as { doc: Doc }).doc.atoms)).toHaveLength(4);
  });
});

describe('B2 drag geometry', () => {
  it('snaps the direction to 30 degrees and fixes the length at 1.0', () => {
    const from = { x: 1, y: 1 };
    const to = {
      x: from.x + 5 * Math.cos((37 * Math.PI) / 180),
      y: from.y - 5 * Math.sin((37 * Math.PI) / 180),
    };
    const end = dragEnd(from, to, false);
    expect(end.x).toBeCloseTo(1 + C30, 12);
    expect(end.y).toBeCloseTo(0.5, 12);
  });

  it('Shift frees the angle (37 degrees stays 37)', () => {
    const from = { x: 0, y: 0 };
    const to = {
      x: 4 * Math.cos((37 * Math.PI) / 180),
      y: -4 * Math.sin((37 * Math.PI) / 180),
    };
    const end = dragEnd(from, to, true);
    expect(Math.hypot(end.x, end.y)).toBeCloseTo(1, 12);
    expect((Math.atan2(-end.y, end.x) * 180) / Math.PI).toBeCloseTo(37, 9);
  });

  it('joinBond from empty canvas creates the first atom at the press point', () => {
    const e = joinBond(empty(), { point: { x: 1, y: 2 } }, { at: { x: 2, y: 2 } }, SINGLE);
    const atoms = Object.values((e as { doc: Doc }).doc.atoms);
    expect(atoms[0]).toMatchObject({ x: 1, y: 2 });
    expect(atoms[1]).toMatchObject({ x: 2, y: 2 });
  });

  it('joinBond ending on an existing atom bonds to it and creates no atom', () => {
    const { doc, b } = ab();
    const [d1, c] = addAtom(doc, { element: 'C', x: 2, y: 0 });
    const out = joinBond(d1, { atom: b }, { atom: c }, SINGLE)?.doc as Doc;
    expect(Object.keys(out.atoms)).toHaveLength(3);
    expect(Object.values(out.bonds).some((x) => x.a1 === b && x.a2 === c)).toBe(true);
  });

  it('joinBond to an atom it is already bonded to, or to itself, is nothing', () => {
    const { doc, a, b } = ab();
    expect(joinBond(doc, { atom: a }, { atom: b }, SINGLE)).toBeNull();
    expect(joinBond(doc, { atom: a }, { atom: a }, SINGLE)).toBeNull();
  });
});

describe('B2 dragBond', () => {
  it('a drag from an atom to empty canvas adds one atom, snapped, 1.0 away', () => {
    const { doc, b } = ab();
    const pointer = { x: C30 + 3, y: -0.5 - 0.1 };
    const e = dragBond(doc, { atom: b }, pointer, false, null, SINGLE);
    const fresh = freshAtom(e?.doc as Doc, doc);
    expect(pos(e?.doc as Doc, fresh).x).toBeCloseTo(C30 + 1, 12);
    expect(pos(e?.doc as Doc, fresh).y).toBeCloseTo(-0.5, 12);
  });

  it('ending on a target joins it; if they are bonded already it is nothing', () => {
    const { doc, a, b } = ab();
    const [d1, c] = addAtom(doc, { element: 'C', x: 3, y: 3 });
    expect(dragBond(d1, { atom: a }, { x: 3, y: 3 }, false, c, SINGLE)?.merge).toBe(c);
    expect(dragBond(d1, { atom: a }, pos(d1, b), false, b, SINGLE)).toBeNull();
  });

  it('a snapped end that lands within 0.25 BLU of an atom closes onto it', () => {
    const { doc, a } = ab();
    const [d1, c] = addAtom(doc, { element: 'C', x: 1.1, y: 0.05 });
    const e = dragBond(d1, { atom: a }, { x: 4, y: 0.4 }, false, null, SINGLE);
    expect(e?.merge).toBe(c);
  });

  it('no direction yet (pointer on the start) is nothing', () => {
    expect(
      dragBond(empty(), { point: { x: 1, y: 1 } }, { x: 1, y: 1 }, false, null, SINGLE),
    ).toBeNull();
  });
});

describe('B5 clickBond', () => {
  const click = (doc: Doc, bond: BondId, variant: string, p: Point = { x: 0, y: 0 }) =>
    clickBond(doc, bond, variant, p);

  it('single: 1 -> 2 -> 3 -> 1, and 1.5 -> 2', () => {
    const { doc, bond } = ab();
    const d2 = click(doc, bond, 'single') as Doc;
    expect(d2.bonds[bond]?.order).toBe(2);
    const d3 = click(d2, bond, 'single') as Doc;
    expect(d3.bonds[bond]?.order).toBe(3);
    expect((click(d3, bond, 'single') as Doc).bonds[bond]?.order).toBe(1);
    const arom = setBondOrder(doc, bond, 1.5) as Doc;
    expect((click(arom, bond, 'single') as Doc).bonds[bond]?.order).toBe(2);
  });

  it('single clears stereo first, keeping the order', () => {
    const { doc, bond, a } = ab();
    const wedge = click(doc, bond, 'wedge', pos(doc, a)) as Doc;
    expect(Object.values(wedge.bonds)[0]?.stereo).toBe('wedge');
    const cleared = click(wedge, firstBond(wedge), 'single') as Doc;
    expect(Object.values(cleared.bonds)[0]).toMatchObject({ order: 1, stereo: 'none' });
  });

  it('double sets order 2, then cycles the placement auto -> left -> right -> center -> auto', () => {
    const { doc, bond } = ab();
    let d = click(doc, bond, 'double') as Doc;
    expect(d.bonds[bond]?.order).toBe(2);
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      d = click(d, bond, 'double') as Doc;
      seen.push(d.bonds[bond]?.doublePlacement ?? '');
    }
    expect(seen).toEqual(['left', 'right', 'center', 'auto']);
  });

  it('triple sets 3 and does nothing if it already is 3', () => {
    const { doc, bond } = ab();
    const d = click(doc, bond, 'triple') as Doc;
    expect(d.bonds[bond]?.order).toBe(3);
    expect(click(d, bond, 'triple')).toBeNull();
  });

  it('wedge: set with the narrow end at the atom nearer the click, reversing if needed', () => {
    const { doc, a, b, bond } = ab();
    // Click near B (a2): the narrow end must be B, so the bond is reversed.
    const d = click(doc, bond, 'wedge', pos(doc, b)) as Doc;
    expect(Object.values(d.bonds)[0]).toMatchObject({ stereo: 'wedge', a1: b, a2: a });
    // Click near A (a1) on a plain bond: no reversal.
    const d2 = click(doc, bond, 'hash', pos(doc, a)) as Doc;
    expect(Object.values(d2.bonds)[0]).toMatchObject({ stereo: 'hash', a1: a, a2: b });
  });

  it('a second wedge click reverses the direction', () => {
    const { doc, a, b, bond } = ab();
    const d1 = click(doc, bond, 'wedge', pos(doc, a)) as Doc;
    expect(Object.values(d1.bonds)[0]).toMatchObject({ a1: a, a2: b });
    const d2 = click(d1, firstBond(d1), 'wedge', pos(doc, a)) as Doc;
    expect(Object.values(d2.bonds)[0]).toMatchObject({ stereo: 'wedge', a1: b, a2: a });
    expect(Object.keys(d2.bonds)).toHaveLength(1);
  });
});

describe('reverseBond re-anchors curved arrows with t -> 1 - t', () => {
  it('a curved arrow anchored at t 0.3 ends at t 0.7 on the new bond', () => {
    const { doc, a, b, bond } = ab();
    const [d1, arrow] = addObject(doc, {
      type: 'curved-arrow',
      head: 'full',
      from: { kind: 'bond', bond, t: 0.3 },
      to: { kind: 'atom', atom: a },
      bend: 0.4,
    });
    const d2 = reverseBond(d1, bond);
    const nb = Object.values(d2.bonds)[0];
    expect(nb).toMatchObject({ a1: b, a2: a });
    const obj = d2.objects[arrow as ObjectId];
    expect(obj).toMatchObject({
      from: { kind: 'bond', bond: nb?.id },
      to: { kind: 'atom', atom: a },
    });
    expect((obj as { from: { t: number } }).from.t).toBeCloseTo(0.7, 12);
  });

  it('keeps order and stereo', () => {
    const { doc, bond, a, b } = ab();
    const hashed = clickBond(doc, bond, 'hash', pos(doc, a)) as Doc;
    const d = reverseBond(hashed, firstBond(hashed));
    expect(Object.values(d.bonds)[0]).toMatchObject({ stereo: 'hash', order: 1, a1: b, a2: a });
  });
});

describe('setBondOrder / setBondStereo (hover keys)', () => {
  it('an order key clears stereo and is a no-op when nothing changes', () => {
    const { doc, bond, a } = ab();
    const wedge = clickBond(doc, bond, 'wedge', pos(doc, a)) as Doc;
    const id = firstBond(wedge);
    expect(setBondOrder(wedge, id, 1)?.bonds[id]).toMatchObject({ order: 1, stereo: 'none' });
    expect(setBondOrder(doc, bond, 1)).toBeNull();
    expect(setBondOrder(doc, bond, 2)?.bonds[bond]?.order).toBe(2);
  });

  it('W / H: sets the stereo, again reverses', () => {
    const { doc, bond, a, b } = ab();
    const w1 = setBondStereo(doc, bond, 'wedge');
    expect(Object.values(w1.bonds)[0]).toMatchObject({ stereo: 'wedge', a1: a, a2: b });
    const w2 = setBondStereo(w1, firstBond(w1), 'wedge');
    expect(Object.values(w2.bonds)[0]).toMatchObject({ stereo: 'wedge', a1: b, a2: a });
    const h = setBondStereo(w2, firstBond(w2), 'hash');
    expect(Object.values(h.bonds)[0]).toMatchObject({ stereo: 'hash', a1: b, a2: a });
  });
});

describe('addedKeys', () => {
  it('names the atoms and bonds a recipe added, by item key', () => {
    const before = empty();
    const { doc } = newBond(before, { x: 0, y: 0 }, SINGLE);
    expect([...addedKeys(before, doc)].sort()).toEqual(['atom:a1', 'atom:a2', 'bond:b3']);
  });
});
