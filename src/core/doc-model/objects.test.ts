import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addAtom } from './atoms';
import { addBond } from './bonds';
import { emptyDoc } from './doc';
import { DocError, type DocErrorCode } from './errors';
import { checkInvariants } from './invariants';
import { addObject, updateObject, type ObjectInit } from './objects';
import type { AtomId, BondId, Doc, ObjectId } from './types';
import { paintLayers } from './z-order';

const NOW = '2026-11-09T00:00:00.000Z';

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

/** Ethanol skeleton a1–a2–a3 (bonds b4, b5) plus a forward arrow o6. */
function base(): Doc {
  let doc = emptyDoc(NOW);
  [doc] = addAtom(doc, { x: 0, y: 0 });
  [doc] = addAtom(doc, { x: 1, y: 0 });
  [doc] = addAtom(doc, { x: 2, y: 0, element: 'O' });
  [doc] = addBond(doc, 'a1' as AtomId, 'a2' as AtomId);
  [doc] = addBond(doc, 'a2' as AtomId, 'a3' as AtomId);
  [doc] = addObject(doc, {
    type: 'arrow',
    kind: 'forward',
    from: { x: 3, y: 0 },
    to: { x: 5, y: 0 },
  });
  return doc;
}

const a = (n: number) => `a${n}` as AtomId;
const b = (n: number) => `b${n}` as BondId;
const ARROW = 'o6' as ObjectId;

/** One valid init per variant, with an update that changes something meaningful. */
const VARIANTS: [string, ObjectInit, Record<string, unknown>][] = [
  [
    'arrow',
    { type: 'arrow', kind: 'equilibrium', from: { x: 0, y: 2 }, to: { x: 2, y: 2 } },
    { kind: 'retro', to: { x: 3, y: 2 } },
  ],
  [
    'curved-arrow',
    {
      type: 'curved-arrow',
      head: 'full',
      from: { kind: 'atom', atom: a(3), offset: { x: 0.1, y: -0.2 } },
      to: { kind: 'bond', bond: b(4), t: 0.5 },
      bend: 0.4,
    },
    { head: 'fishhook', bend: -0.4, to: { kind: 'point', p: { x: 1, y: 1 } } },
  ],
  ['plus', { type: 'plus', at: { x: 6, y: 0 } }, { at: { x: 7, y: 0 } }],
  [
    'text',
    {
      type: 'text',
      at: { x: 4, y: -0.5 },
      runs: [
        { text: 'H' },
        { text: '2', script: 'sub' },
        { text: 'SO' },
        { text: '4', script: 'sub' },
      ],
      align: 'center',
      attachedTo: { arrow: ARROW, slot: 'above' },
    },
    { runs: [{ text: 'Δ' }], attachedTo: { arrow: ARROW, slot: 'below' } },
  ],
  [
    'caption',
    { type: 'caption', runs: [{ text: '1', bold: true }], target: [a(1), a(2), a(3)] },
    { runs: [{ text: '2a', bold: true }], target: [a(1)] },
  ],
  [
    'callout',
    {
      type: 'callout',
      at: { x: 1, y: 2 },
      runs: [{ text: 'nucleophile', italic: true }],
      anchor: { kind: 'atom', atom: a(3) },
    },
    { anchor: { kind: 'bond', bond: b(5) } },
  ],
  [
    'bracket',
    {
      type: 'bracket',
      shape: 'square',
      rect: { x: -0.5, y: -1, w: 3, h: 2 },
      corner: [{ text: '‡' }],
    },
    { shape: 'round', corner: undefined },
  ],
  [
    'shape',
    {
      type: 'shape',
      shape: 'ellipse',
      rect: { x: 1.5, y: -0.4, w: 1, h: 0.8 },
      fill: '#ffff00',
      fillOpacity: 0.4,
    },
    { fillOpacity: 0.2, stroke: '#ff0000' },
  ],
];

describe('addObject / updateObject — every variant', () => {
  it.each(VARIANTS)('%s can be added and updated; invariants hold', (_name, init, patch) => {
    const [doc, id] = addObject(base(), init);
    expect(id).toBe('o7');
    expect(doc.objects[id]).toEqual({ ...init, id });
    expect(checkInvariants(doc)).toEqual([]);

    const updated = updateObject(doc, id, patch);
    const expected = Object.fromEntries(
      Object.entries({ ...init, ...patch, id }).filter(([, v]) => v !== undefined),
    );
    expect(updated.objects[id]).toEqual(expected);
    expect(checkInvariants(updated)).toEqual([]);
  });

  it('covers all eight variants', () => {
    expect(VARIANTS.map(([n]) => n).sort()).toEqual([
      'arrow',
      'bracket',
      'callout',
      'caption',
      'curved-arrow',
      'plus',
      'shape',
      'text',
    ]);
  });

  it('never changes id or type, even if a patch carries them', () => {
    const [doc, id] = addObject(base(), { type: 'plus', at: { x: 0, y: 0 } });
    const patch = { id: 'o99', type: 'arrow', at: { x: 1, y: 1 } } as unknown as {
      at: { x: number; y: number };
    };
    expect(updateObject(doc, id, patch).objects[id]).toEqual({
      type: 'plus',
      id,
      at: { x: 1, y: 1 },
    });
  });

  it('rejects removing a required field', () => {
    expectDocError(() => updateObject(base(), ARROW, { to: undefined }), 'invalid-value');
  });

  it('rejects an unknown object id', () => {
    expectDocError(
      () => updateObject(base(), 'o99' as ObjectId, { at: { x: 0, y: 0 } }),
      'unknown-object',
    );
  });
});

describe('attachedTo', () => {
  const textOn = (arrow: string): ObjectInit => ({
    type: 'text',
    at: { x: 0, y: 0 },
    runs: [{ text: 'hν' }],
    align: 'center',
    attachedTo: { arrow: arrow as ObjectId, slot: 'above' },
  });

  it('rejects attaching to a non-arrow', () => {
    const [doc] = addObject(base(), { type: 'plus', at: { x: 6, y: 0 } });
    expectDocError(() => addObject(doc, textOn('o7')), 'invalid-attachment');
  });

  it('rejects attaching to a missing object', () => {
    expectDocError(() => addObject(base(), textOn('o99')), 'invalid-attachment');
  });

  it('rejects re-attaching via update to a non-arrow', () => {
    const [withText, text] = addObject(base(), textOn('o6'));
    const [doc] = addObject(withText, { type: 'plus', at: { x: 6, y: 0 } });
    expectDocError(
      () => updateObject(doc, text, { attachedTo: { arrow: 'o8' as ObjectId, slot: 'below' } }),
      'invalid-attachment',
    );
    expectDocError(
      () => updateObject(doc, text, { attachedTo: { arrow: text, slot: 'below' } }),
      'invalid-attachment',
    );
  });
});

describe('object value validation', () => {
  it.each<[string, ObjectInit, DocErrorCode]>([
    [
      'arrow with NaN end',
      { type: 'arrow', kind: 'forward', from: { x: 0, y: 0 }, to: { x: NaN, y: 0 } },
      'invalid-value',
    ],
    [
      'curved arrow to a missing atom',
      {
        type: 'curved-arrow',
        head: 'full',
        from: { kind: 'atom', atom: a(99) },
        to: { kind: 'point', p: { x: 0, y: 0 } },
        bend: 0,
      },
      'unknown-atom',
    ],
    [
      'curved arrow to a missing bond',
      {
        type: 'curved-arrow',
        head: 'full',
        from: { kind: 'point', p: { x: 0, y: 0 } },
        to: { kind: 'bond', bond: b(99) },
        bend: 0,
      },
      'unknown-bond',
    ],
    [
      'bond anchor t = 1.2',
      {
        type: 'curved-arrow',
        head: 'full',
        from: { kind: 'point', p: { x: 0, y: 0 } },
        to: { kind: 'bond', bond: b(4), t: 1.2 },
        bend: 0,
      },
      'invalid-value',
    ],
    [
      'infinite bend',
      {
        type: 'curved-arrow',
        head: 'full',
        from: { kind: 'point', p: { x: 0, y: 0 } },
        to: { kind: 'point', p: { x: 1, y: 0 } },
        bend: Infinity,
      },
      'invalid-value',
    ],
    [
      'atom anchor with NaN offset',
      {
        type: 'callout',
        at: { x: 0, y: 0 },
        runs: [],
        anchor: { kind: 'atom', atom: a(1), offset: { x: NaN, y: 0 } },
      },
      'invalid-value',
    ],
    ['plus at Infinity', { type: 'plus', at: { x: Infinity, y: 0 } }, 'invalid-value'],
    [
      'text with a bad colour',
      { type: 'text', at: { x: 0, y: 0 }, runs: [{ text: 'x', color: '#abc' }], align: 'left' },
      'invalid-value',
    ],
    [
      'caption with no target',
      { type: 'caption', runs: [{ text: '1' }], target: [] },
      'invalid-value',
    ],
    [
      'caption on a missing atom',
      { type: 'caption', runs: [{ text: '1' }], target: [a(99)] },
      'unknown-atom',
    ],
    [
      'callout at NaN',
      {
        type: 'callout',
        at: { x: NaN, y: 0 },
        runs: [],
        anchor: { kind: 'point', p: { x: 0, y: 0 } },
      },
      'invalid-value',
    ],
    [
      'bracket with negative height',
      { type: 'bracket', shape: 'curly', rect: { x: 0, y: 0, w: 1, h: -1 } },
      'invalid-value',
    ],
    [
      'bracket with a bad corner colour',
      {
        type: 'bracket',
        shape: 'curly',
        rect: { x: 0, y: 0, w: 1, h: 1 },
        corner: [{ text: 'n', color: 'blue' as `#${string}` }],
      },
      'invalid-value',
    ],
    [
      'shape with NaN rect',
      { type: 'shape', shape: 'rect', rect: { x: 0, y: NaN, w: 1, h: 1 }, fillOpacity: 0.5 },
      'invalid-value',
    ],
    [
      'shape with opacity 2',
      { type: 'shape', shape: 'rect', rect: { x: 0, y: 0, w: 1, h: 1 }, fillOpacity: 2 },
      'invalid-value',
    ],
    [
      'shape with a bad fill',
      {
        type: 'shape',
        shape: 'rect',
        rect: { x: 0, y: 0, w: 1, h: 1 },
        fill: '#gggggg',
        fillOpacity: 1,
      },
      'invalid-value',
    ],
  ])('rejects %s', (_name, init, code) => {
    expectDocError(() => addObject(base(), init), code);
  });
});

describe('zOrder', () => {
  it('puts new objects on top, and new highlights on top of the highlight layer', () => {
    let doc = base(); // o6 arrow
    [doc] = addObject(doc, { type: 'plus', at: { x: 6, y: 0 } }); // o7
    [doc] = addObject(doc, {
      type: 'shape',
      shape: 'rect',
      rect: { x: 0, y: 0, w: 1, h: 1 },
      fillOpacity: 0.3,
    }); // o8
    [doc] = addObject(doc, { type: 'plus', at: { x: 7, y: 0 } }); // o9
    [doc] = addObject(doc, {
      type: 'shape',
      shape: 'ellipse',
      rect: { x: 0, y: 0, w: 1, h: 1 },
      fillOpacity: 0.3,
    }); // o10
    expect(doc.zOrder).toEqual(['o8', 'o10', 'o6', 'o7', 'o9']);
    expect(paintLayers(doc)).toEqual({ beneath: ['o8', 'o10'], above: ['o6', 'o7', 'o9'] });
  });

  it('update leaves zOrder unchanged', () => {
    const doc = updateObject(base(), ARROW, { kind: 'resonance' });
    expect(doc.zOrder).toEqual(['o6']);
  });

  it('contains each object exactly once, highlights first, after any add/update sequence', () => {
    const step = fc.oneof(
      fc.record({
        op: fc.constant('add' as const),
        variant: fc.integer({ min: 0, max: VARIANTS.length - 1 }),
      }),
      fc.record({ op: fc.constant('update' as const), pick: fc.nat() }),
    );
    fc.assert(
      fc.property(fc.array(step, { maxLength: 30 }), (steps) => {
        let doc = base();
        for (const s of steps) {
          if (s.op === 'add') {
            [doc] = addObject(doc, VARIANTS[s.variant]![1]);
          } else {
            const ids = Object.keys(doc.objects) as ObjectId[];
            const id = ids[s.pick % ids.length]!;
            const type = doc.objects[id]!.type;
            const patch = VARIANTS.find(([n]) => n === type)![2];
            doc = updateObject(doc, id, patch);
          }
        }
        expect([...doc.zOrder].sort()).toEqual(Object.keys(doc.objects).sort());
        const types = doc.zOrder.map((id) => doc.objects[id]!.type);
        const firstOther = types.findIndex((t) => t !== 'shape');
        expect(firstOther === -1 || types.slice(firstOther).every((t) => t !== 'shape')).toBe(true);
        expect(checkInvariants(doc)).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });
});
