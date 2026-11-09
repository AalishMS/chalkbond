import { describe, expect, it } from 'vitest';
import { kitchenSinkDoc } from './__fixtures__/kitchen-sink';
import { emptyDoc } from './doc';
import { checkInvariants, type InvariantCode } from './invariants';
import type { Doc } from './types';

type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;

// Loose view used only to break fixtures in ways the types forbid.
type Loose = Mutable<Doc> & {
  atoms: Record<string, Mutable<Doc['atoms'][keyof Doc['atoms']]>>;
  bonds: Record<string, Mutable<Doc['bonds'][keyof Doc['bonds']]>>;
  objects: Record<string, Record<string, unknown>>;
  groups: Record<string, Mutable<Doc['groups'][keyof Doc['groups']]>>;
  zOrder: string[];
};

/** Kitchen-sink doc with one deliberate breakage applied. */
function broken(edit: (d: Loose) => void): Doc {
  const d = JSON.parse(JSON.stringify(kitchenSinkDoc())) as Loose;
  edit(d);
  return d as unknown as Doc;
}

function codes(doc: Doc): InvariantCode[] {
  return checkInvariants(doc).map((v) => v.code);
}

describe('checkInvariants — valid docs', () => {
  it('emptyDoc has no violations', () => {
    expect(checkInvariants(emptyDoc('2026-11-09T00:00:00.000Z'))).toEqual([]);
  });

  it('the kitchen-sink fixture (every item kind) has no violations', () => {
    expect(checkInvariants(kitchenSinkDoc())).toEqual([]);
  });
});

describe('checkInvariants — one failing fixture per invariant', () => {
  const cases: [number, string, (d: Loose) => void, InvariantCode, string?][] = [
    // 1. Every bond's a1, a2 exist and differ.
    [
      1,
      'bond to a missing atom',
      (d) => void (d.bonds['b4']!.a2 = 'a99' as never),
      'bond-missing-atom',
      'b4',
    ],
    [1, 'self-bond', (d) => void (d.bonds['b4']!.a2 = d.bonds['b4']!.a1), 'self-bond', 'b4'],
    // 2. At most one bond per unordered atom pair.
    [
      2,
      'duplicate pair in reverse direction',
      (d) => {
        d.bonds['b20'] = {
          ...d.bonds['b4']!,
          id: 'b20' as never,
          a1: d.bonds['b4']!.a2,
          a2: d.bonds['b4']!.a1,
        };
        d.nextId = 21;
      },
      'duplicate-bond',
      'b20',
    ],
    // 3. zOrder ↔ objects, exactly once.
    [
      3,
      'zOrder lists an unknown object',
      (d) => void d.zOrder.push('o99'),
      'zorder-unknown-object',
      'o99',
    ],
    [3, 'zOrder lists an object twice', (d) => void d.zOrder.push('o6'), 'zorder-duplicate', 'o6'],
    [
      3,
      'object missing from zOrder',
      (d) => void d.zOrder.splice(d.zOrder.indexOf('o9'), 1),
      'zorder-missing-object',
      'o9',
    ],
    // 4. Anchor and caption targets exist.
    [
      4,
      'atom anchor to a missing atom',
      (d) => void ((d.objects['o8']!['from'] as { atom: string }).atom = 'a99'),
      'unknown-anchor-target',
      'o8',
    ],
    [
      4,
      'bond anchor to a missing bond',
      (d) => void ((d.objects['o8']!['to'] as { bond: string }).bond = 'b99'),
      'unknown-anchor-target',
      'o8',
    ],
    [
      4,
      'caption targeting a missing atom',
      (d) => void (d.objects['o10']!['target'] as string[]).push('a99'),
      'unknown-caption-target',
      'o10',
    ],
    // 5. attachedTo refers to an arrow.
    [
      5,
      'text attached to a plus sign',
      (d) => void (d.objects['o7']!['attachedTo'] = { arrow: 'o9', slot: 'above' }),
      'attachment-not-arrow',
      'o7',
    ],
    [
      5,
      'text attached to a missing object',
      (d) => void (d.objects['o7']!['attachedTo'] = { arrow: 'o99', slot: 'below' }),
      'attachment-not-arrow',
      'o7',
    ],
    // 6. Group members exist; at most one group per item.
    [
      6,
      'group with a missing member',
      (d) => void d.groups['g14']!.members.objects.push('o99' as never),
      'unknown-group-member',
      'g14',
    ],
    [
      6,
      'item in two groups',
      (d) =>
        void (d.groups['g13'] = {
          id: 'g13' as never,
          members: { atoms: ['a1' as never], objects: [] },
        }),
      'multiple-groups',
      'a1',
    ],
    [
      6,
      'item listed twice in one group',
      (d) => void d.groups['g14']!.members.atoms.push('a1' as never),
      'multiple-groups',
      'a1',
    ],
    // 7. Finite coordinates, charge range, colours, fillOpacity.
    [7, 'NaN atom coordinate', (d) => void (d.atoms['a1']!.x = NaN), 'non-finite', 'a1'],
    [
      7,
      'infinite arrow end',
      (d) => void ((d.objects['o6']!['to'] as { x: number }).x = Infinity),
      'non-finite',
      'o6',
    ],
    [7, 'charge +5', (d) => void (d.atoms['a1']!.charge = 5), 'charge-out-of-range', 'a1'],
    [
      7,
      'fractional charge',
      (d) => void (d.atoms['a1']!.charge = 0.5),
      'charge-out-of-range',
      'a1',
    ],
    [
      7,
      'short colour on an atom',
      (d) => void (d.atoms['a3']!.color = '#c00'),
      'invalid-color',
      'a3',
    ],
    [
      7,
      'named colour in a text run',
      (d) => void ((d.objects['o11']!['runs'] as { color: string }[])[0]!.color = 'red'),
      'invalid-color',
      'o11',
    ],
    [
      7,
      'fillOpacity 1.5',
      (d) => void (d.objects['o13']!['fillOpacity'] = 1.5),
      'fill-opacity-out-of-range',
      'o13',
    ],
    [
      7,
      'negative rect width',
      (d) => void ((d.objects['o12']!['rect'] as { w: number }).w = -1),
      'negative-rect-size',
      'o12',
    ],
    [
      7,
      'bond anchor t = 2',
      (d) => void ((d.objects['o8']!['to'] as { t: number }).t = 2),
      'anchor-t-out-of-range',
      'o8',
    ],
    // 8. Id suffixes below nextId; valid ids and element symbols.
    [8, 'id not below nextId', (d) => void (d.nextId = 14), 'id-out-of-range', 'g14'],
    [8, 'nextId zero', (d) => void (d.nextId = 0), 'invalid-next-id'],
    [8, 'unknown element', (d) => void (d.atoms['a1']!.element = 'Xx'), 'invalid-element', 'a1'],
    [
      8,
      'element in wrong case',
      (d) => void (d.atoms['a1']!.element = 'cl'),
      'invalid-element',
      'a1',
    ],
    [
      8,
      'record key differs from id',
      (d) => void (d.atoms['a1']!.id = 'a2' as never),
      'id-key-mismatch',
      'a1',
    ],
    [
      8,
      'atom id with a bond prefix',
      (d) => {
        d.atoms['b20'] = { ...d.atoms['a1']!, id: 'b20' as never };
        d.nextId = 21;
      },
      'invalid-id',
      'b20',
    ],
  ];

  it.each(cases)('invariant %i: %s', (invariant, _name, edit, code, id) => {
    const violations = checkInvariants(broken(edit));
    expect(violations).toContainEqual(
      expect.objectContaining({ invariant, code, ...(id === undefined ? {} : { id }) }),
    );
  });

  it.each(cases)('invariant %i: %s — reports nothing else', (_inv, _name, edit, code) => {
    expect(new Set(codes(broken(edit)))).toEqual(new Set([code]));
  });

  it('covers all eight invariants', () => {
    expect(new Set(cases.map(([n]) => n))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
  });

  it('every violation carries a human-readable message', () => {
    const violations = checkInvariants(broken((d) => void (d.atoms['a1']!.charge = 9)));
    expect(violations[0]?.message).toMatch(/charge 9/);
  });
});
