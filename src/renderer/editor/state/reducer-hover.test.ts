import { describe, expect, it } from 'vitest';
import type { Hit } from './editor-state';
import { reduce } from './reducer';
import { atomId, bondId, freshState, testContext } from './testing';

const ctx = testContext();
const atom: Hit = { kind: 'atom', id: atomId(1) };

describe('set-hover', () => {
  it('stores the hit and returns the same state for an equal hit', () => {
    const s = reduce(freshState(), { type: 'set-hover', hover: atom }, ctx);
    expect(s.hover).toEqual(atom);
    expect(reduce(s, { type: 'set-hover', hover: { kind: 'atom', id: atomId(1) } }, ctx)).toBe(s);
    expect(reduce(s, { type: 'set-hover', hover: { kind: 'bond', id: bondId(1) } }, ctx)).not.toBe(
      s,
    );
  });

  it('clears with null, and null on null changes nothing', () => {
    const s = freshState();
    expect(reduce(s, { type: 'set-hover', hover: null }, ctx)).toBe(s);
    const hovered = reduce(s, { type: 'set-hover', hover: atom }, ctx);
    expect(reduce(hovered, { type: 'set-hover', hover: null }, ctx).hover).toBeNull();
  });

  it('a tool switch clears the hover (the new tool may not see that item)', () => {
    const hovered = reduce(freshState(), { type: 'set-hover', hover: atom }, ctx);
    expect(reduce(hovered, { type: 'select-tool', tool: 'text' }, ctx).hover).toBeNull();
  });
});
