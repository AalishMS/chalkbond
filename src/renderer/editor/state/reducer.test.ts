import { describe, expect, it } from 'vitest';
import { OPTIONS, TOOLS } from './catalog';
import { initialState, TOOL_IDS } from './editor-state';
import { reduce } from './reducer';

describe('initial state (Decision 5)', () => {
  it('starts with Bond and its Single variant', () => {
    const s = initialState();
    expect(s.tool).toBe('bond');
    expect(s.variants.bond).toBe('single');
  });

  it('defaults the other tools to their first option, Atom to carbon', () => {
    expect(initialState().variants).toEqual({
      bond: 'single',
      ring: 'benzene',
      atom: 'C',
      arrow: 'forward',
      curved: 'full',
    });
  });
});

describe('select-tool', () => {
  it('changes only the tool', () => {
    const s = initialState();
    const next = reduce(s, { type: 'select-tool', tool: 'ring' });
    expect(next.tool).toBe('ring');
    expect(next.variants).toBe(s.variants);
  });

  it('returns the same state object when the tool is already active', () => {
    const s = initialState();
    expect(reduce(s, { type: 'select-tool', tool: 'bond' })).toBe(s);
  });

  it('reaches every tool', () => {
    for (const tool of TOOL_IDS) {
      expect(reduce(initialState(), { type: 'select-tool', tool }).tool).toBe(tool);
    }
  });
});

describe('select-variant', () => {
  it('changes only that tool variant and keeps the active tool', () => {
    const s = reduce(initialState(), { type: 'select-tool', tool: 'ring' });
    const next = reduce(s, { type: 'select-variant', tool: 'ring', variant: 'cyclopentane' });
    expect(next.tool).toBe('ring');
    expect(next.variants.ring).toBe('cyclopentane');
    expect(next.variants.bond).toBe('single');
  });

  it('ignores a variant the tool does not offer', () => {
    const s = initialState();
    expect(reduce(s, { type: 'select-variant', tool: 'bond', variant: 'wavy' })).toBe(s);
    expect(reduce(s, { type: 'select-variant', tool: 'ring', variant: 'single' })).toBe(s);
  });

  it('accepts every catalogued option', () => {
    for (const tool of ['bond', 'ring', 'atom', 'arrow', 'curved'] as const) {
      for (const o of OPTIONS[tool]) {
        const next = reduce(initialState(), { type: 'select-variant', tool, variant: o.id });
        expect(next.variants[tool]).toBe(o.id);
      }
    }
  });
});

describe('catalogue', () => {
  it('lists the ten tools in rail order with their captions and keys', () => {
    expect(TOOLS.map((t) => t.id)).toEqual(TOOL_IDS);
    expect(TOOLS.map((t) => t.caption)).toEqual([
      'Select',
      'Erase',
      'Bond',
      'Chain',
      'Ring',
      'Atom',
      'Arrow',
      'Plus',
      'Curly',
      'Text',
    ]);
    expect(TOOLS.map((t) => t.key)).toEqual(['V', 'E', 'B', 'Z', 'R', 'L', 'A', '+', 'M', 'T']);
  });
});
