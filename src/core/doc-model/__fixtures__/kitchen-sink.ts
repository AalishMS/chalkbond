import type { AtomId, BondId, Doc, GroupId, ObjectId } from '../types';

const a = (n: number) => `a${n}` as AtomId;
const b = (n: number) => `b${n}` as BondId;
const o = (n: number) => `o${n}` as ObjectId;
const g = (n: number) => `g${n}` as GroupId;

/**
 * A hand-built valid doc that uses every item kind and every DrawObject variant, so each
 * invariant test can break exactly one thing. Ethanol (a1–a3) → arrow with conditions.
 */
export function kitchenSinkDoc(): Doc {
  return {
    schemaVersion: 2,
    atoms: {
      [a(1)]: { id: a(1), x: 0, y: 0, element: 'C', charge: 0, radical: 0 },
      [a(2)]: { id: a(2), x: 0.866, y: -0.5, element: 'C', charge: 0, radical: 0 },
      [a(3)]: {
        id: a(3),
        x: 1.732,
        y: 0,
        element: 'O',
        label: 'OH',
        charge: 0,
        radical: 0,
        lonePairs: 2,
        partialCharge: 'δ-',
        color: '#cc0000',
      },
    },
    bonds: {
      [b(4)]: { id: b(4), a1: a(1), a2: a(2), order: 1, stereo: 'none', doublePlacement: 'auto' },
      [b(5)]: {
        id: b(5),
        a1: a(2),
        a2: a(3),
        order: 1,
        stereo: 'none',
        doublePlacement: 'auto',
        color: '#0000ff',
      },
    },
    objects: {
      [o(6)]: {
        type: 'arrow',
        id: o(6),
        kind: 'forward',
        from: { x: 3, y: 0 },
        to: { x: 5, y: 0 },
      },
      [o(7)]: {
        type: 'text',
        id: o(7),
        at: { x: 4, y: -0.4 },
        runs: [
          { text: 'H' },
          { text: '2', script: 'sub' },
          { text: 'SO' },
          { text: '4', script: 'sub' },
        ],
        align: 'center',
        attachedTo: { arrow: o(6), slot: 'above' },
      },
      [o(8)]: {
        type: 'curved-arrow',
        id: o(8),
        head: 'full',
        from: { kind: 'atom', atom: a(3), offset: { x: 0.2, y: -0.2 } },
        to: { kind: 'bond', bond: b(4), t: 0.5 },
        bend: 0.3,
      },
      [o(9)]: { type: 'plus', id: o(9), at: { x: 6, y: 0 } },
      [o(10)]: {
        type: 'caption',
        id: o(10),
        runs: [{ text: '1', bold: true }],
        target: [a(1), a(2), a(3)],
      },
      [o(11)]: {
        type: 'callout',
        id: o(11),
        at: { x: 1, y: 2 },
        runs: [{ text: 'nucleophile', italic: true, color: '#333333' }],
        anchor: { kind: 'point', p: { x: 1.7, y: 0 } },
      },
      [o(12)]: {
        type: 'bracket',
        id: o(12),
        shape: 'square',
        rect: { x: -0.5, y: -1, w: 2.7, h: 1.5 },
        corner: [{ text: '‡' }],
      },
      [o(13)]: {
        type: 'shape',
        id: o(13),
        shape: 'ellipse',
        rect: { x: 1.4, y: -0.3, w: 0.7, h: 0.6 },
        fill: '#ffff00',
        fillOpacity: 0.4,
      },
    },
    zOrder: [o(13), o(6), o(7), o(8), o(9), o(10), o(11), o(12)],
    groups: {
      [g(14)]: { id: g(14), members: { atoms: [a(1), a(2), a(3)], objects: [o(10)] } },
    },
    nextId: 15,
    style: { preset: 'slides', overrides: {} },
    meta: {
      title: 'kitchen sink',
      created: '2026-11-09T00:00:00.000Z',
      modified: '2026-11-09T00:00:00.000Z',
    },
  };
}
