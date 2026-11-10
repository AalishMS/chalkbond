import { describe, expect, it } from 'vitest';
import { fmt } from './fmt';
import { compareIds, sortedIds } from './order';

describe('fmt', () => {
  it.each([
    [-0, '0'],
    [0, '0'],
    [0.0004, '0'],
    [-0.0004, '0'],
    [0.0005, '0.001'],
    [1e-7, '0'],
    [123456.78901, '123456.789'],
    [0.5, '0.5'],
    [-0.5, '-0.5'],
    [12, '12'],
    [1.2, '1.2'],
    [2.0004, '2'],
    [-12.3456, '-12.346'],
    [1e15, '1000000000000000'],
  ])('fmt(%s) = %s', (n, expected) => {
    expect(fmt(n)).toBe(expected);
  });

  it('never prints an exponent or -0 and keeps the leading 0', () => {
    for (const n of [1e-9, -1e-9, 0.001, 0.999, 5e-4, -5e-4, 3.0000001]) {
      expect(fmt(n)).toMatch(/^-?(0|[1-9]\d*)(\.\d{1,3})?$/);
      expect(fmt(n)).not.toBe('-0');
    }
  });

  it('rejects non-finite numbers', () => {
    expect(() => fmt(NaN)).toThrow(RangeError);
    expect(() => fmt(Infinity)).toThrow(RangeError);
  });
});

describe('id order', () => {
  it('compares by numeric suffix, not text', () => {
    expect(['a10', 'a2', 'a1', 'a100'].sort(compareIds)).toEqual(['a1', 'a2', 'a10', 'a100']);
  });

  it('sorts malformed ids after well-formed ones, by code units', () => {
    expect(['zz', 'a3', 'a03', 'a1', 'b'].sort(compareIds)).toEqual(['a1', 'a3', 'a03', 'b', 'zz']);
  });

  it('is zero for equal ids', () => {
    expect(compareIds('a5', 'a5')).toBe(0);
  });

  it('sortedIds ignores key insertion order', () => {
    expect(sortedIds({ b3: 1, b1: 1, b20: 1, b2: 1 })).toEqual(['b1', 'b2', 'b3', 'b20']);
  });
});
