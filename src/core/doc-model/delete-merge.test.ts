import { describe, expect, it } from 'vitest';
import { kitchenSinkDoc } from './__fixtures__/kitchen-sink';
import { addAtom } from './atoms';
import { addBond } from './bonds';
import { deleteItems } from './delete';
import { emptyDoc } from './doc';
import { DocError, type DocErrorCode } from './errors';
import { createHistory, current, transact, undo } from './history';
import { checkInvariants } from './invariants';
import { mergeAtoms } from './merge';
import { addObject } from './objects';
import type { AtomId, BondId, Doc, ObjectId, Selection } from './types';

const NOW = '2026-11-09T00:00:00.000Z';
const a = (n: number) => `a${n}` as AtomId;
const b = (n: number) => `b${n}` as BondId;
const o = (n: number) => `o${n}` as ObjectId;

function sel(items: { atoms?: number[]; bonds?: number[]; objects?: number[] }): Selection {
  return {
    atoms: new Set((items.atoms ?? []).map(a)),
    bonds: new Set((items.bonds ?? []).map(b)),
    objects: new Set((items.objects ?? []).map(o)),
  };
}

function expectDocError(fn: () => unknown, code: DocErrorCode): void {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(DocError);
  expect((caught as DocError).code).toBe(code);
}

/** Mutable deep copy of the kitchen-sink fixture for building expected docs. */
type Loose = {
  atoms: Record<string, unknown>;
  bonds: Record<string, unknown>;
  objects: Record<string, Record<string, unknown>>;
  zOrder: string[];
  groups: Record<string, { id: string; members: { atoms: string[]; objects: string[] } }>;
};
function expected(edit: (d: Loose) => void): Doc {
  const d = JSON.parse(JSON.stringify(kitchenSinkDoc())) as Loose;
  edit(d);
  return d as unknown as Doc;
}

// Kitchen sink: a1(0,0)–b4–a2(0.866,-0.5)–b5–a3(1.732,0); arrow o6 with text o7 attached;
// curved arrow o8 from atom a3 (+0.2,-0.2) to bond b4 (t .5); caption o10 on a1–a3;
// callout o11 (point anchor); group g14 = {a1,a2,a3,o10}.
describe('deleteItems — cascade table', () => {
  it('atom: its bonds go; captions lose it; anchors to it become points; groups lose it', () => {
    const doc = deleteItems(kitchenSinkDoc(), sel({ atoms: [3] }));
    expect(doc).toEqual(
      expected((d) => {
        delete d.atoms['a3'];
        delete d.bonds['b5'];
        d.objects['o10']!['target'] = ['a1', 'a2'];
        d.objects['o8']!['from'] = { kind: 'point', p: { x: 1.732 + 0.2, y: -0.2 } };
        d.groups['g14']!.members.atoms = ['a1', 'a2'];
      }),
    );
    expect(checkInvariants(doc)).toEqual([]);
  });

  it('atom: a caption whose last target goes is deleted (and leaves zOrder/groups)', () => {
    const doc = deleteItems(kitchenSinkDoc(), sel({ atoms: [1, 2, 3] }));
    expect(doc).toEqual(
      expected((d) => {
        d.atoms = {};
        d.bonds = {};
        delete d.objects['o10'];
        d.zOrder = d.zOrder.filter((id) => id !== 'o10');
        d.objects['o8']!['from'] = { kind: 'point', p: { x: 1.932, y: -0.2 } };
        d.objects['o8']!['to'] = { kind: 'point', p: { x: 0.433, y: -0.25 } };
        delete d.groups['g14'];
      }),
    );
    expect(checkInvariants(doc)).toEqual([]);
  });

  it('bond: anchors to it become points at their last resolved position', () => {
    const doc = deleteItems(kitchenSinkDoc(), sel({ bonds: [4] }));
    expect(doc).toEqual(
      expected((d) => {
        delete d.bonds['b4'];
        d.objects['o8']!['to'] = { kind: 'point', p: { x: 0.433, y: -0.25 } };
      }),
    );
    expect(checkInvariants(doc)).toEqual([]);
  });

  it('arrow: texts attached to it are deleted', () => {
    const doc = deleteItems(kitchenSinkDoc(), sel({ objects: [6] }));
    expect(doc).toEqual(
      expected((d) => {
        delete d.objects['o6'];
        delete d.objects['o7'];
        d.zOrder = d.zOrder.filter((id) => id !== 'o6' && id !== 'o7');
      }),
    );
    expect(checkInvariants(doc)).toEqual([]);
  });

  it('any: removed from zOrder and group memberships; empty groups deleted', () => {
    let doc = deleteItems(kitchenSinkDoc(), sel({ objects: [10] }));
    expect(doc).toEqual(
      expected((d) => {
        delete d.objects['o10'];
        d.zOrder = d.zOrder.filter((id) => id !== 'o10');
        d.groups['g14']!.members.objects = [];
      }),
    );
    doc = deleteItems(doc, sel({ atoms: [1, 2, 3] }));
    expect(doc.groups).toEqual({});
    expect(checkInvariants(doc)).toEqual([]);
  });

  it('deleting the anchoring object itself needs no anchor fix', () => {
    const doc = deleteItems(kitchenSinkDoc(), sel({ atoms: [3], objects: [8] }));
    expect(doc.objects).not.toHaveProperty('o8');
    expect(checkInvariants(doc)).toEqual([]);
  });

  it('an empty selection returns the same doc', () => {
    const doc = kitchenSinkDoc();
    expect(deleteItems(doc, sel({}))).toBe(doc);
  });

  it.each<[string, Selection, DocErrorCode]>([
    ['atom', sel({ atoms: [99] }), 'unknown-atom'],
    ['bond', sel({ bonds: [99] }), 'unknown-bond'],
    ['object', sel({ objects: [99] }), 'unknown-object'],
  ])('rejects an unknown %s', (_name, s, code) => {
    expectDocError(() => deleteItems(kitchenSinkDoc(), s), code);
  });

  it('is one undoable step inside transact', () => {
    let h = createHistory(kitchenSinkDoc());
    h = transact(h, 'Delete', (d) => deleteItems(d, sel({ atoms: [2], objects: [6] })));
    expect(Object.keys(current(h).atoms)).toEqual(['a1', 'a3']);
    expect(undo(h).doc).toEqual(kitchenSinkDoc());
  });
});

/** Cyclopropane a1,a2,a3 with bonds b4 (a1–a2), b5 (a2–a3), b6 (a3–a1). */
function cyclopropane(): Doc {
  let doc = emptyDoc(NOW);
  [doc] = addAtom(doc, { x: 0, y: 0 });
  [doc] = addAtom(doc, { x: 1, y: 0 });
  [doc] = addAtom(doc, { x: 0.5, y: -0.866 });
  [doc] = addBond(doc, a(1), a(2));
  [doc] = addBond(doc, a(2), a(3), { order: 2 });
  [doc] = addBond(doc, a(3), a(1));
  return doc;
}

/** Hexagon a1…a6, bonds b7 (a1–a2) … b12 (a6–a1). */
function hexagon(): Doc {
  let doc = emptyDoc(NOW);
  for (let i = 0; i < 6; i++) {
    [doc] = addAtom(doc, { x: Math.cos((Math.PI / 3) * i), y: Math.sin((Math.PI / 3) * i) });
  }
  for (let i = 1; i <= 6; i++) [doc] = addBond(doc, a(i), a((i % 6) + 1));
  return doc;
}

function pairs(doc: Doc): string[] {
  return Object.values(doc.bonds).map((bd) => [bd.a1, bd.a2].sort().join('-'));
}

describe('mergeAtoms', () => {
  it('ring atoms sharing a neighbour: no duplicate bond, no self-bond', () => {
    // a1 and a3 share neighbour a2.
    const doc = mergeAtoms(hexagon(), a(1), a(3));
    expect(Object.keys(doc.atoms)).toEqual(['a1', 'a2', 'a4', 'a5', 'a6']);
    expect(pairs(doc).sort()).toEqual(['a1-a2', 'a1-a4', 'a1-a6', 'a4-a5', 'a5-a6']);
    expect(Object.values(doc.bonds).every((bd) => bd.a1 !== bd.a2)).toBe(true);
    expect(checkInvariants(doc)).toEqual([]);
  });

  it('bonded atoms: the keep–drop bond is deleted; duplicates collapse into keep’s bonds', () => {
    const doc = mergeAtoms(cyclopropane(), a(1), a(2));
    expect(doc.atoms).not.toHaveProperty('a2');
    expect(doc.bonds).toEqual({ b6: cyclopropane().bonds[b(6)] }); // keep's own a3–a1 survives
    expect(checkInvariants(doc)).toEqual([]);
  });

  it('re-points bonds while keeping their direction (wedge narrow end)', () => {
    let doc = hexagon();
    [doc] = addAtom(doc, { x: 3, y: 3 }); // a13
    [doc] = addBond(doc, a(13), a(4), { stereo: 'wedge' }); // b14: a13 → a4
    doc = mergeAtoms(doc, a(1), a(13));
    expect(doc.bonds[b(14)]).toMatchObject({ a1: 'a1', a2: 'a4', stereo: 'wedge' });
    expect(checkInvariants(doc)).toEqual([]);
  });

  it('moves atom anchors and caption targets to keep, deduplicated', () => {
    let doc = cyclopropane();
    [doc] = addObject(doc, { type: 'caption', runs: [{ text: '1' }], target: [a(1), a(2)] }); // o7
    [doc] = addObject(doc, {
      type: 'callout',
      at: { x: 2, y: 2 },
      runs: [],
      anchor: { kind: 'atom', atom: a(2), offset: { x: 0.1, y: 0 } },
    }); // o8
    doc = mergeAtoms(doc, a(1), a(2));
    expect(doc.objects[o(7)]).toMatchObject({ target: ['a1'] });
    expect(doc.objects[o(8)]).toMatchObject({
      anchor: { kind: 'atom', atom: 'a1', offset: { x: 0.1, y: 0 } },
    });
    expect(checkInvariants(doc)).toEqual([]);
  });

  it('moves bond anchors to the surviving bond, flipping t if its direction is reversed', () => {
    let doc = cyclopropane();
    // b5 is a2→a3; merging a2 into a1 collapses it into b6 (a3→a1): reversed, so t flips.
    [doc] = addObject(doc, {
      type: 'curved-arrow',
      head: 'full',
      from: { kind: 'bond', bond: b(5), t: 0.2 },
      to: { kind: 'bond', bond: b(4) }, // a1–a2 becomes a self-bond → deleted → point
      bend: 0,
    }); // o7
    doc = mergeAtoms(doc, a(1), a(2));
    expect(doc.objects[o(7)]).toMatchObject({
      from: { kind: 'bond', bond: 'b6', t: 0.8 },
      to: { kind: 'point', p: { x: 0.5, y: 0 } },
    });
    expect(checkInvariants(doc)).toEqual([]);
  });

  it('keeps bond anchors unchanged on re-pointed (not merged) bonds', () => {
    let doc = hexagon();
    [doc] = addObject(doc, {
      type: 'callout',
      at: { x: 0, y: 0 },
      runs: [],
      anchor: { kind: 'bond', bond: b(9), t: 0.3 }, // a3–a4, re-pointed to a1–a4
    });
    doc = mergeAtoms(doc, a(1), a(3));
    expect(doc.objects[o(13)]).toMatchObject({ anchor: { kind: 'bond', bond: 'b9', t: 0.3 } });
  });

  it('drops the merged atom from groups', () => {
    const doc = mergeAtoms(kitchenSinkDoc(), a(2), a(3));
    expect(doc.groups['g14' as keyof Doc['groups']]?.members.atoms).toEqual(['a1', 'a2']);
    expect(checkInvariants(doc)).toEqual([]);
  });

  it('rejects unknown atoms and self-merge', () => {
    expectDocError(() => mergeAtoms(hexagon(), a(1), a(99)), 'unknown-atom');
    expectDocError(() => mergeAtoms(hexagon(), a(99), a(1)), 'unknown-atom');
    expectDocError(() => mergeAtoms(hexagon(), a(1), a(1)), 'invalid-value');
  });
});
