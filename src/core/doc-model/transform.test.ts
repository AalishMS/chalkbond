import { describe, expect, it } from 'vitest';
import { kitchenSinkDoc } from './__fixtures__/kitchen-sink';
import { addAtom } from './atoms';
import { addBond } from './bonds';
import { emptyDoc } from './doc';
import { DocError } from './errors';
import {
  applyAffine,
  boundingRect,
  determinant,
  IDENTITY,
  rotation,
  scaling,
  transformRect,
  translation,
} from './geometry';
import { checkInvariants } from './invariants';
import { addObject } from './objects';
import { bounds, transformItems } from './transform';
import type { Affine, AtomId, BondId, Doc, ObjectId, Selection } from './types';

const NOW = '2026-11-09T00:00:00.000Z';
const EPS = 9; // toBeCloseTo digits → |diff| < 5e-10

function sel(items: { atoms?: string[]; bonds?: string[]; objects?: string[] }): Selection {
  return {
    atoms: new Set((items.atoms ?? []) as AtomId[]),
    bonds: new Set((items.bonds ?? []) as BondId[]),
    objects: new Set((items.objects ?? []) as ObjectId[]),
  };
}

/** Deep numeric comparison to 1e-9. */
function expectClose(actual: unknown, expected: unknown): void {
  if (typeof expected === 'number') {
    expect(actual).toBeCloseTo(expected, EPS);
  } else if (expected && typeof expected === 'object') {
    expect(Object.keys(actual as object).sort()).toEqual(Object.keys(expected).sort());
    for (const [k, v] of Object.entries(expected)) {
      expectClose((actual as Record<string, unknown>)[k], v);
    }
  } else {
    expect(actual).toEqual(expected);
  }
}

/**
 * One item of each positioned kind at known coordinates:
 * a1 (1,0), a2 (1,2) bonded by b3; arrow o4 (0,0)→(2,0); plus o5 at (3,1);
 * curved arrow o6 point (1,1) → atom a1, bend 0.5; callout o7 at (0,3) anchored at point (1,1);
 * shape o8 rect (0,0, 2×1); bracket o9 rect (1,1, 4×2).
 */
function layout(): Doc {
  let doc = emptyDoc(NOW);
  [doc] = addAtom(doc, { x: 1, y: 0 });
  [doc] = addAtom(doc, { x: 1, y: 2 });
  [doc] = addBond(doc, 'a1' as AtomId, 'a2' as AtomId);
  [doc] = addObject(doc, {
    type: 'arrow',
    kind: 'forward',
    from: { x: 0, y: 0 },
    to: { x: 2, y: 0 },
  });
  [doc] = addObject(doc, { type: 'plus', at: { x: 3, y: 1 } });
  [doc] = addObject(doc, {
    type: 'curved-arrow',
    head: 'full',
    from: { kind: 'point', p: { x: 1, y: 1 } },
    to: { kind: 'atom', atom: 'a1' as AtomId },
    bend: 0.5,
  });
  [doc] = addObject(doc, {
    type: 'callout',
    at: { x: 0, y: 3 },
    runs: [{ text: 'note' }],
    anchor: { kind: 'point', p: { x: 1, y: 1 } },
  });
  [doc] = addObject(doc, {
    type: 'shape',
    shape: 'rect',
    rect: { x: 0, y: 0, w: 2, h: 1 },
    fillOpacity: 0.3,
  });
  [doc] = addObject(doc, { type: 'bracket', shape: 'square', rect: { x: 1, y: 1, w: 4, h: 2 } });
  return doc;
}

const ALL = sel({ atoms: ['a1', 'a2'], objects: ['o4', 'o5', 'o6', 'o7', 'o8', 'o9'] });

/** Where each coordinate of `layout()` lands under a point map + rect map. */
function expectedLayout(
  p: (x: number, y: number) => { x: number; y: number },
  rect: (r: { x: number; y: number; w: number; h: number }) => object,
  bend: number,
) {
  return {
    a1: p(1, 0),
    a2: p(1, 2),
    o4: { from: p(0, 0), to: p(2, 0) },
    o5: p(3, 1),
    o6: { from: p(1, 1), bend },
    o7: { at: p(0, 3), anchor: p(1, 1) },
    o8: rect({ x: 0, y: 0, w: 2, h: 1 }),
    o9: rect({ x: 1, y: 1, w: 4, h: 2 }),
  };
}

function actualLayout(doc: Doc) {
  const o = (id: string) => doc.objects[id as ObjectId] as unknown as Record<string, unknown>;
  const at = (v: unknown) => v as { x: number; y: number };
  const anchorP = (v: unknown) => (v as { p: { x: number; y: number } }).p;
  const xy = (id: string) => {
    const a = doc.atoms[id as AtomId]!;
    return { x: a.x, y: a.y };
  };
  return {
    a1: xy('a1'),
    a2: xy('a2'),
    o4: { from: at(o('o4')['from']), to: at(o('o4')['to']) },
    o5: at(o('o5')['at']),
    o6: { from: anchorP(o('o6')['from']), bend: o('o6')['bend'] },
    o7: { at: at(o('o7')['at']), anchor: anchorP(o('o7')['anchor']) },
    o8: o('o8')['rect'],
    o9: o('o9')['rect'],
  };
}

describe('transformItems — exact coordinates (1e-9)', () => {
  it('translate by (1, -2)', () => {
    const doc = transformItems(layout(), ALL, translation(1, -2));
    expectClose(
      actualLayout(doc),
      expectedLayout(
        (x, y) => ({ x: x + 1, y: y - 2 }),
        (r) => ({ ...r, x: r.x + 1, y: r.y - 2 }),
        0.5,
      ),
    );
    expect(checkInvariants(doc)).toEqual([]);
  });

  it('rotate 90° about the origin (rects swap width and height)', () => {
    const doc = transformItems(layout(), ALL, rotation(Math.PI / 2));
    // (x, y) → (-y, x); rect centre maps the same way, w/h swap.
    const rot = (r: { x: number; y: number; w: number; h: number }) => {
      const cx = -(r.y + r.h / 2);
      const cy = r.x + r.w / 2;
      return { x: cx - r.h / 2, y: cy - r.w / 2, w: r.h, h: r.w };
    };
    expectClose(
      actualLayout(doc),
      expectedLayout((x, y) => ({ x: -y, y: x }), rot, 0.5),
    );
    expect(checkInvariants(doc)).toEqual([]);
  });

  it('flip horizontal about x = 1 (bend negates)', () => {
    const doc = transformItems(layout(), ALL, scaling(-1, 1, { x: 1, y: 0 }));
    const flip = (r: { x: number; y: number; w: number; h: number }) => ({
      ...r,
      x: 2 - r.x - r.w,
    });
    expectClose(
      actualLayout(doc),
      expectedLayout((x, y) => ({ x: 2 - x, y }), flip, -0.5),
    );
  });

  it('mirroring a zero bend gives 0, not -0 (JSON has no -0; save/open must round-trip)', () => {
    const [start, id] = addObject(emptyDoc(NOW), {
      type: 'curved-arrow',
      head: 'full',
      from: { kind: 'point', p: { x: 0, y: 0 } },
      to: { kind: 'point', p: { x: 1, y: 0 } },
      bend: 0,
    });
    const doc = transformItems(
      start,
      { atoms: new Set(), bonds: new Set(), objects: new Set([id]) },
      scaling(-1, 1),
    );
    const obj = doc.objects[id]!;
    expect(obj.type === 'curved-arrow' && Object.is(obj.bend, 0)).toBe(true);
  });

  it('scale ×2 about the origin', () => {
    const doc = transformItems(layout(), ALL, scaling(2));
    const dbl = (r: { x: number; y: number; w: number; h: number }) => ({
      x: 2 * r.x,
      y: 2 * r.y,
      w: 2 * r.w,
      h: 2 * r.h,
    });
    expectClose(
      actualLayout(doc),
      expectedLayout((x, y) => ({ x: 2 * x, y: 2 * y }), dbl, 0.5),
    );
  });

  it('leaves atom/bond anchors untouched (they follow their atom)', () => {
    const doc = transformItems(layout(), sel({ objects: ['o6'] }), translation(5, 5));
    expect(doc.objects['o6' as ObjectId]).toMatchObject({
      from: { kind: 'point', p: { x: 6, y: 6 } },
      to: { kind: 'atom', atom: 'a1' },
    });
    expect(doc.atoms['a1' as AtomId]).toMatchObject({ x: 1, y: 0 });
  });

  it('leaves unselected items unchanged (same references)', () => {
    const before = layout();
    const doc = transformItems(before, sel({ atoms: ['a1'], objects: ['o5'] }), translation(1, 1));
    expect(doc.atoms['a1' as AtomId]).toMatchObject({ x: 2, y: 1 });
    expect(doc.atoms['a2' as AtomId]).toBe(before.atoms['a2' as AtomId]);
    for (const id of ['o4', 'o6', 'o7', 'o8', 'o9']) {
      expect(doc.objects[id as ObjectId]).toBe(before.objects[id as ObjectId]);
    }
  });

  it('a selected bond moves both its atoms', () => {
    const doc = transformItems(layout(), sel({ bonds: ['b3'] }), translation(0, 1));
    expect(doc.atoms['a1' as AtomId]).toMatchObject({ x: 1, y: 1 });
    expect(doc.atoms['a2' as AtomId]).toMatchObject({ x: 1, y: 3 });
  });

  it('a selected arrow brings its attached conditions text', () => {
    const doc = transformItems(kitchenSinkDoc(), sel({ objects: ['o6'] }), translation(1, 0));
    expect(doc.objects['o7' as ObjectId]).toMatchObject({ at: { x: 5, y: -0.4 } });
  });

  it('captions have no own position and are unchanged', () => {
    const before = kitchenSinkDoc();
    const doc = transformItems(before, sel({ objects: ['o10'] }), translation(1, 0));
    expect(doc.objects['o10' as ObjectId]).toEqual(before.objects['o10' as ObjectId]);
  });

  it('an empty selection returns the same doc', () => {
    const doc = layout();
    expect(transformItems(doc, sel({}), translation(1, 1))).toBe(doc);
  });

  it('rejects a non-finite affine and unknown ids', () => {
    expect(() => transformItems(layout(), ALL, [1, 0, 0, 1, NaN, 0])).toThrow(/invalid-value/);
    expect(() => transformItems(layout(), ALL, [1, 0, 0, 1] as unknown as Affine)).toThrow(
      DocError,
    );
    expect(() => transformItems(layout(), sel({ atoms: ['a9'] }), IDENTITY)).toThrow(
      /unknown-atom/,
    );
    expect(() => transformItems(layout(), sel({ bonds: ['b9'] }), IDENTITY)).toThrow(
      /unknown-bond/,
    );
    expect(() => transformItems(layout(), sel({ objects: ['o99'] }), IDENTITY)).toThrow(
      /unknown-object/,
    );
  });
});

describe('geometry helpers', () => {
  it('rotation about a centre keeps the centre fixed', () => {
    const m = rotation(Math.PI / 3, { x: 2, y: 3 });
    expectClose(applyAffine(m, { x: 2, y: 3 }), { x: 2, y: 3 });
    expect(determinant(m)).toBeCloseTo(1, EPS);
    expect(determinant(scaling(-1, 1))).toBe(-1);
  });

  it('transformRect keeps a circle the same size under any rotation', () => {
    const r = transformRect(rotation(0.7, { x: 1, y: 1 }), { x: 0, y: 0, w: 2, h: 2 });
    expectClose(r, { x: 0, y: 0, w: 2, h: 2 });
  });

  it('boundingRect of nothing is null; of points and rects is their hull', () => {
    expect(boundingRect([])).toBeNull();
    expect(boundingRect([{ x: 1, y: 5 }], [{ x: -1, y: 0, w: 1, h: 1 }])).toEqual({
      x: -1,
      y: 0,
      w: 2,
      h: 5,
    });
  });
});

describe('bounds', () => {
  function benzene(): Doc {
    let doc = emptyDoc(NOW);
    for (let i = 0; i < 6; i++) {
      [doc] = addAtom(doc, { x: Math.cos((Math.PI / 3) * i), y: Math.sin((Math.PI / 3) * i) });
    }
    for (let i = 1; i <= 6; i++)
      [doc] = addBond(doc, `a${i}` as AtomId, `a${(i % 6) + 1}` as AtomId, { order: 1.5 });
    return doc;
  }

  it('of an empty selection or empty doc is null', () => {
    expect(bounds(benzene(), sel({}))).toBeNull();
    expect(bounds(emptyDoc(NOW))).toBeNull();
  });

  it('of benzene is its atom hull', () => {
    const h = Math.sin(Math.PI / 3);
    expectClose(bounds(benzene()), { x: -1, y: -h, w: 2, h: 2 * h });
  });

  it('of a bond is the hull of its atoms', () => {
    expectClose(bounds(benzene(), sel({ bonds: ['b7'] })), {
      x: Math.cos(Math.PI / 3),
      y: 0,
      w: 1 - Math.cos(Math.PI / 3),
      h: Math.sin(Math.PI / 3),
    });
  });

  it('includes arrow ends, points, rects and resolved anchors', () => {
    expectClose(bounds(layout()), { x: 0, y: 0, w: 5, h: 3 });
    expectClose(bounds(layout(), sel({ objects: ['o6'] })), { x: 1, y: 0, w: 0, h: 1 });
    expectClose(bounds(layout(), sel({ objects: ['o7'] })), { x: 0, y: 1, w: 1, h: 2 });
  });

  it('of a caption is the hull of its target atoms', () => {
    expectClose(bounds(kitchenSinkDoc(), sel({ objects: ['o10'] })), {
      x: 0,
      y: -0.5,
      w: 1.732,
      h: 0.5,
    });
  });
});
