import { describe, expect, it } from 'vitest';
import { kitchenSinkDoc } from './__fixtures__/kitchen-sink';
import { addAtom } from './atoms';
import { addBond } from './bonds';
import { emptyDoc } from './doc';
import { DocError } from './errors';
import { fragments } from './graph';
import { checkInvariants } from './invariants';
import { everything, extract, insert, type SubDoc } from './subdoc';
import { bounds } from './transform';
import type { AtomId, BondId, Doc, ObjectId, Selection } from './types';

const NOW = '2026-11-09T00:00:00.000Z';
const a = (n: number) => `a${n}` as AtomId;

function sel(items: { atoms?: string[]; bonds?: string[]; objects?: string[] }): Selection {
  return {
    atoms: new Set((items.atoms ?? []) as AtomId[]),
    bonds: new Set((items.bonds ?? []) as BondId[]),
    objects: new Set((items.objects ?? []) as ObjectId[]),
  };
}

describe('fragments', () => {
  it('ethanol + benzene → 2 components, each sorted, ordered by lowest id', () => {
    let doc = emptyDoc(NOW);
    // Interleave creation so ids of the two molecules mix: benzene gets a1, a3–a7.
    [doc] = addAtom(doc, { x: 0, y: 0 }); // a1 benzene
    [doc] = addAtom(doc, { x: 5, y: 0 }); // a2 ethanol
    for (let i = 1; i < 6; i++) {
      [doc] = addAtom(doc, { x: Math.cos((Math.PI / 3) * i), y: Math.sin((Math.PI / 3) * i) }); // a3–a7
    }
    [doc] = addAtom(doc, { x: 6, y: 0 }); // a8
    [doc] = addAtom(doc, { x: 7, y: 0, element: 'O' }); // a9
    const ring = [a(1), a(3), a(4), a(5), a(6), a(7)];
    for (let i = 0; i < 6; i++) [doc] = addBond(doc, ring[i]!, ring[(i + 1) % 6]!, { order: 1.5 });
    [doc] = addBond(doc, a(9), a(8)); // reversed direction on purpose
    [doc] = addBond(doc, a(8), a(2));
    expect(fragments(doc)).toEqual([
      ['a1', 'a3', 'a4', 'a5', 'a6', 'a7'],
      ['a2', 'a8', 'a9'],
    ]);
  });

  it('isolated atoms are their own fragments; empty doc has none', () => {
    let doc = emptyDoc(NOW);
    expect(fragments(doc)).toEqual([]);
    for (let i = 0; i < 12; i++) [doc] = addAtom(doc, { x: i, y: 0 });
    [doc] = addBond(doc, a(12), a(2));
    expect(fragments(doc)[0]).toEqual(['a1']);
    expect(fragments(doc)[1]).toEqual(['a2', 'a12']);
    expect(fragments(doc)).toHaveLength(11);
  });
});

// Kitchen sink: a1(0,0)–b4–a2(0.866,-0.5)–b5–a3(1.732,0)(O); arrow o6 (3,0)→(5,0) with text o7;
// curved arrow o8 atom a3 → bond b4; plus o9; caption o10 on a1–a3; callout o11 (point);
// bracket o12; shape o13; group g14 = {a1,a2,a3,o10}.
describe('extract', () => {
  it('drops bonds with an unselected end; selected bonds bring their atoms', () => {
    const sub = extract(kitchenSinkDoc(), sel({ atoms: ['a1', 'a2'] }));
    expect(Object.keys(sub.atoms)).toEqual(['a1', 'a2']);
    expect(Object.keys(sub.bonds)).toEqual(['b4']);
    const viaBond = extract(kitchenSinkDoc(), sel({ bonds: ['b5'] }));
    expect(Object.keys(viaBond.atoms)).toEqual(['a2', 'a3']);
    expect(Object.keys(viaBond.bonds)).toEqual(['b5']);
  });

  it('turns anchors to unselected atoms/bonds into point anchors (centred coordinates)', () => {
    const sub = extract(kitchenSinkDoc(), sel({ objects: ['o8'] }));
    // o8 from atom a3 + (0.2,-0.2) = (1.932,-0.2); to bond b4 midpoint (0.433,-0.25).
    // Bounds centre = (1.1825, -0.225).
    const o8 = sub.objects['o8' as ObjectId];
    expect(o8).toMatchObject({
      type: 'curved-arrow',
      from: { kind: 'point' },
      to: { kind: 'point' },
    });
    const from = (o8 as { from: { p: { x: number; y: number } } }).from.p;
    const to = (o8 as { to: { p: { x: number; y: number } } }).to.p;
    expect(from.x).toBeCloseTo(0.7495, 9);
    expect(from.y).toBeCloseTo(0.025, 9);
    expect(to.x).toBeCloseTo(-0.7495, 9);
    expect(to.y).toBeCloseTo(-0.025, 9);
  });

  it('keeps atom/bond anchors whose targets are extracted', () => {
    const sub = extract(kitchenSinkDoc(), sel({ atoms: ['a1', 'a2', 'a3'], objects: ['o8'] }));
    expect(sub.objects['o8' as ObjectId]).toMatchObject({
      from: { kind: 'atom', atom: 'a3' },
      to: { kind: 'bond', bond: 'b4' },
    });
  });

  it('attached texts follow their arrow; a text without its arrow becomes free text', () => {
    const withArrow = extract(kitchenSinkDoc(), sel({ objects: ['o6'] }));
    expect(Object.keys(withArrow.objects)).toEqual(['o6', 'o7']);
    expect(withArrow.objects['o7' as ObjectId]).toHaveProperty('attachedTo');
    const alone = extract(kitchenSinkDoc(), sel({ objects: ['o7'] }));
    expect(alone.objects['o7' as ObjectId]).not.toHaveProperty('attachedTo');
  });

  it('captions keep only extracted targets and are dropped without any', () => {
    const some = extract(kitchenSinkDoc(), sel({ atoms: ['a1'], objects: ['o10'] }));
    expect(some.objects['o10' as ObjectId]).toMatchObject({ target: ['a1'] });
    const none = extract(kitchenSinkDoc(), sel({ objects: ['o10'] }));
    expect(none.objects).toEqual({});
    expect(none.zOrder).toEqual([]);
  });

  it('groups keep only extracted members; zOrder keeps the original order', () => {
    const sub = extract(kitchenSinkDoc(), sel({ atoms: ['a2'], objects: ['o13', 'o9'] }));
    expect(sub.groups).toEqual({ g14: { id: 'g14', members: { atoms: ['a2'], objects: [] } } });
    expect(sub.zOrder).toEqual(['o13', 'o9']);
    expect(extract(kitchenSinkDoc(), sel({ objects: ['o9'] })).groups).toEqual({});
  });

  it('centres the result on the origin and is a valid closed sub-document', () => {
    const sub = extract(kitchenSinkDoc(), everything(kitchenSinkDoc()));
    const box = bounds({ ...kitchenSinkDoc(), ...sub });
    expect(box!.x + box!.w / 2).toBeCloseTo(0, 9);
    expect(box!.y + box!.h / 2).toBeCloseTo(0, 9);
    expect(JSON.parse(JSON.stringify(sub))).toEqual(sub);
  });

  it('an empty selection yields an empty sub-document', () => {
    expect(extract(kitchenSinkDoc(), sel({}))).toEqual({
      atoms: {},
      bonds: {},
      objects: {},
      zOrder: [],
      groups: {},
    });
  });

  it('rejects unknown ids', () => {
    expect(() => extract(kitchenSinkDoc(), sel({ atoms: ['a99'] }))).toThrow(/unknown-atom/);
    expect(() => extract(kitchenSinkDoc(), sel({ bonds: ['b99'] }))).toThrow(/unknown-bond/);
    expect(() => extract(kitchenSinkDoc(), sel({ objects: ['o99'] }))).toThrow(/unknown-object/);
  });
});

/** Every coordinate of a doc relative to its bounds centre, keyed by position in id order. */
function relativeGeometry(doc: Doc, s: Selection): number[] {
  const box = bounds(doc, s)!;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const nums: number[] = [];
  // Absolute positions are taken relative to the centre; relative ones (anchor offsets) as-is.
  const walk = (v: unknown, relative = false): void => {
    if (typeof v === 'number') nums.push(v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const x = o['x'];
      const y = o['y'];
      const isPos = typeof x === 'number' && typeof y === 'number';
      if (isPos) nums.push(relative ? x : x - cx, relative ? y : y - cy);
      for (const [k, val] of Object.entries(o)) {
        if (k === 'id' || (isPos && (k === 'x' || k === 'y'))) continue;
        walk(val, k === 'offset');
      }
    }
  };
  for (const id of [...s.atoms].sort(byNum)) walk(doc.atoms[id]);
  for (const id of [...s.objects].sort(byNum)) walk(doc.objects[id]);
  return nums.map((n) => Math.round(n * 1e9) / 1e9);
}
const byNum = (p: string, q: string) => Number(p.slice(1)) - Number(q.slice(1));

describe('insert', () => {
  it('insert(extract(sel)) reproduces relative geometry with all-new ids', () => {
    const source = kitchenSinkDoc();
    const all = everything(source);
    const [doc, inserted] = insert(source, extract(source, all), { x: 20, y: 10 });

    expect(inserted.atoms.size).toBe(3);
    expect(inserted.bonds.size).toBe(2);
    expect(inserted.objects.size).toBe(8);
    const oldIds = new Set([
      ...Object.keys(source.atoms),
      ...Object.keys(source.bonds),
      ...Object.keys(source.objects),
      ...Object.keys(source.groups),
    ]);
    for (const id of [...inserted.atoms, ...inserted.bonds, ...inserted.objects])
      expect(oldIds.has(id)).toBe(false);
    expect(relativeGeometry(doc, inserted)).toEqual(relativeGeometry(source, all));
    expect(checkInvariants(doc)).toEqual([]);

    const box = bounds(doc, inserted)!;
    expect(box.x + box.w / 2).toBeCloseTo(20, 9);
    expect(box.y + box.h / 2).toBeCloseTo(10, 9);
  });

  it('assigns ids in order from nextId and remaps every reference', () => {
    const source = kitchenSinkDoc(); // nextId 15
    const [doc] = insert(emptyDoc(NOW), extract(source, everything(source)), { x: 0, y: 0 });
    expect(Object.keys(doc.atoms)).toEqual(['a1', 'a2', 'a3']);
    expect(Object.keys(doc.bonds)).toEqual(['b4', 'b5']);
    expect(Object.keys(doc.objects)).toEqual(['o6', 'o7', 'o8', 'o9', 'o10', 'o11', 'o12', 'o13']);
    expect(Object.keys(doc.groups)).toEqual(['g14']);
    expect(doc.nextId).toBe(15);
    // Same ids as the source (both start from 1), so references must match exactly.
    expect(doc.zOrder).toEqual(source.zOrder);
    expect(doc.objects['o7' as ObjectId]).toMatchObject({ attachedTo: { arrow: 'o6' } });
    expect(doc.objects['o8' as ObjectId]).toMatchObject({
      from: { atom: 'a3' },
      to: { bond: 'b4' },
    });
    expect(doc.groups['g14' as keyof Doc['groups']]).toEqual(
      source.groups['g14' as keyof Doc['groups']],
    );
  });

  it('pasting twice gives two independent copies', () => {
    const source = kitchenSinkDoc();
    const sub = extract(source, sel({ atoms: ['a1', 'a2', 'a3'] }));
    let doc = emptyDoc(NOW);
    [doc] = insert(doc, sub, { x: 0, y: 0 });
    [doc] = insert(doc, sub, { x: 5, y: 0 });
    expect(fragments(doc)).toEqual([
      ['a1', 'a2', 'a3'],
      ['a7', 'a8', 'a9'], // g6 went to the copied group
    ]);
    expect(checkInvariants(doc)).toEqual([]);
  });

  it('keeps highlight shapes beneath other objects in zOrder', () => {
    const source = kitchenSinkDoc();
    let doc = source;
    [doc] = insert(doc, extract(source, sel({ objects: ['o13', 'o9'] })), { x: 0, y: 5 });
    const types = doc.zOrder.map((id) => doc.objects[id]!.type);
    expect(types.lastIndexOf('shape')).toBeLessThan(types.findIndex((t) => t !== 'shape'));
  });

  it('rejects an invalid sub-document or position', () => {
    const bad = {
      atoms: {},
      bonds: {
        b1: { id: 'b1', a1: 'a1', a2: 'a2', order: 1, stereo: 'none', doublePlacement: 'auto' },
      },
      objects: {},
      zOrder: [],
      groups: {},
    } as unknown as SubDoc;
    expect(() => insert(emptyDoc(NOW), bad, { x: 0, y: 0 })).toThrow(DocError);
    const empty: SubDoc = { atoms: {}, bonds: {}, objects: {}, zOrder: [], groups: {} };
    expect(() => insert(emptyDoc(NOW), empty, { x: NaN, y: 0 })).toThrow(/invalid-value/);
  });
});
