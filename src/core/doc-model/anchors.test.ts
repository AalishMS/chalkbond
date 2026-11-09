import { describe, expect, it } from 'vitest';
import { kitchenSinkDoc } from './__fixtures__/kitchen-sink';
import { resolveAnchor } from './anchors';
import { DocError } from './errors';
import type { AtomId, BondId, Doc } from './types';

describe('resolveAnchor', () => {
  const doc = kitchenSinkDoc(); // a1 (0,0), a2 (0.866,-0.5); b4 = a1–a2
  it.each([
    ['point', { kind: 'point', p: { x: 3, y: 4 } }, { x: 3, y: 4 }],
    ['atom', { kind: 'atom', atom: 'a2' as AtomId }, { x: 0.866, y: -0.5 }],
    [
      'atom + offset',
      { kind: 'atom', atom: 'a1' as AtomId, offset: { x: 1, y: 2 } },
      { x: 1, y: 2 },
    ],
    ['bond midpoint', { kind: 'bond', bond: 'b4' as BondId }, { x: 0.433, y: -0.25 }],
    ['bond at t = 0', { kind: 'bond', bond: 'b4' as BondId, t: 0 }, { x: 0, y: 0 }],
  ] as const)('resolves a %s anchor', (_name, anchor, p) => {
    expect(resolveAnchor(doc, anchor)).toEqual(p);
  });

  it('throws for unknown atoms and bonds', () => {
    expect(() => resolveAnchor(doc, { kind: 'atom', atom: 'a99' as AtomId })).toThrow(DocError);
    expect(() => resolveAnchor(doc, { kind: 'bond', bond: 'b99' as BondId })).toThrow(DocError);
  });

  it('throws if a bond end is missing (corrupt doc)', () => {
    const broken = { ...doc, atoms: {} } as Doc;
    expect(() => resolveAnchor(broken, { kind: 'bond', bond: 'b4' as BondId })).toThrow(
      /unknown-atom: a1/,
    );
    const half = { ...doc, atoms: { a1: doc.atoms['a1' as AtomId] } } as unknown as Doc;
    expect(() => resolveAnchor(half, { kind: 'bond', bond: 'b4' as BondId })).toThrow(
      /unknown-atom: a2/,
    );
  });
});
