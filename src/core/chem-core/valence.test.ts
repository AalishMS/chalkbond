import { describe, expect, it } from 'vitest';
import { allowedValences, fillHydrogens, isOverValence, isoelectronicSymbol } from './valence';

describe('valence model', () => {
  it.each([
    ['N', 1, 'C'],
    ['O', -1, 'F'],
    ['C', -1, 'N'],
    ['C', 1, 'B'],
    ['B', -1, 'C'],
    ['S', 1, 'P'],
    ['C', 0, 'C'],
  ])('%s with charge %d is isoelectronic with %s', (el, q, iso) => {
    expect(isoelectronicSymbol(el, q)).toBe(iso);
  });

  it('has no isoelectronic symbol off the table', () => {
    expect(isoelectronicSymbol('R', 0)).toBeUndefined();
    expect(isoelectronicSymbol('H', 1)).toBeUndefined();
  });

  it.each([
    ['C', 0, 0, [4]],
    ['N', 0, 0, [3]],
    ['N', 1, 0, [4]],
    ['O', -1, 0, [1]],
    ['O', 1, 0, [3]],
    ['S', 0, 0, [2, 4, 6]],
    ['P', 0, 0, [3, 5]],
    ['Cl', 0, 0, [1, 3, 5, 7]],
    ['Al', -1, 0, [4]],
    ['C', 0, 1, [3]],
    ['C', 0, 2, [2]],
    ['H', 0, 1, [0]],
  ] as const)('%s charge %d radical %d → %o', (el, q, r, expected) => {
    expect(allowedValences(el, q, r)).toEqual(expected);
  });

  it('returns null outside the table (metals, noble gases, pseudo-atoms, bare ions)', () => {
    expect(allowedValences('Fe', 0, 0)).toBeNull();
    expect(allowedValences('Na', 1, 0)).toBeNull();
    expect(allowedValences('Cl', -1, 0)).toBeNull();
    expect(allowedValences('R', 0, 0)).toBeNull();
  });

  it.each([
    [[4], 0, 4, false],
    [[4], 3, 1, false],
    [[4], 4, 0, false],
    [[4], 5, 0, true],
    [[3], 4, 0, true],
    [[2, 4, 6], 1, 1, false],
    [[2, 4, 6], 3, 0, true],
    [[2, 4, 6], 4, 0, false],
    [[2, 4, 6], 6, 0, false],
    [[1, 3, 5, 7], 0, 1, false],
    [[1, 3, 5, 7], 2, 0, true],
    [[1, 3, 5, 7], 7, 0, false],
    [[], 0, 0, false],
    [[], 1, 0, true],
  ])('allowed %j, bonds %d → %d H, over %s', (allowed, used, h, over) => {
    expect(fillHydrogens(allowed, used)).toEqual({ h, over });
  });

  it('accepts under-valence and allowed hypervalence, rejects the rest', () => {
    expect(isOverValence([2], 1)).toBe(false);
    expect(isOverValence([2, 4, 6], 5)).toBe(true);
    expect(isOverValence([2, 4, 6], 6)).toBe(false);
    expect(isOverValence([2, 4, 6], 8)).toBe(true);
  });
});
