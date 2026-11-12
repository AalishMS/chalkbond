import { describe, expect, it } from 'vitest';
import { emptyDoc } from './doc';
import { DocError } from './errors';
import { canUndo, createHistory, current, transact, undo } from './history';
import { checkInvariants } from './invariants';
import { parse, serialize } from './serialize';
import { setStyle } from './style';
import type { Doc, StyleSettings } from './types';

const NOW = '2026-11-10T00:00:00.000Z';

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

const frozen = (): Doc => deepFreeze(emptyDoc(NOW));

describe('setStyle', () => {
  it('changes the preset on a frozen doc without touching the input', () => {
    const doc = frozen();
    const next = setStyle(doc, { preset: 'journal' });
    expect(next.style.preset).toBe('journal');
    expect(doc.style.preset).toBe('slides');
  });

  it('is one undo step inside transact; undo restores slides', () => {
    const h0 = createHistory(emptyDoc(NOW));
    const h1 = transact(h0, 'Style', (d) => setStyle(d, { preset: 'journal' }));
    expect(current(h1).style.preset).toBe('journal');
    const h2 = undo(h1);
    expect(current(h2).style.preset).toBe('slides');
    expect(canUndo(h2)).toBe(false);
  });

  it('overrides replaces the whole object', () => {
    const a = setStyle(frozen(), { overrides: { bondLength: 30, fontSize: 12 } });
    expect(a.style.overrides).toEqual({ bondLength: 30, fontSize: 12 });
    const b = setStyle(a, { overrides: { lineWidth: 2 } });
    expect(b.style.overrides).toEqual({ lineWidth: 2 });
    const c = setStyle(b, { overrides: {} });
    expect(c.style.overrides).toEqual({});
    expect(b.style.preset).toBe('slides');
  });

  it('preset and overrides can change together', () => {
    const d = setStyle(frozen(), { preset: 'journal', overrides: { fontFamily: 'Arial' } });
    expect(d.style).toEqual({ preset: 'journal', overrides: { fontFamily: 'Arial' } });
  });

  it('formula structural is one undo step; skeletal afterwards deep-equals the start', () => {
    const start = emptyDoc(NOW);
    const h1 = transact(createHistory(start), 'Formula', (d) =>
      setStyle(d, { formula: 'structural' }),
    );
    expect(current(h1).style.formula).toBe('structural');
    const h2 = transact(h1, 'Formula', (d) => setStyle(d, { formula: 'skeletal' }));
    expect(current(h2).style).toEqual(start.style);
    expect('formula' in current(h2).style).toBe(false);
    expect({ ...current(h2), meta: start.meta }).toEqual(start); // history stamps meta.modified
    const h3 = undo(undo(h2));
    expect(current(h3)).toEqual(start);
    expect(canUndo(h3)).toBe(false);
  });

  it('formula changes on a frozen doc without touching the input, and is a v2 file', () => {
    const doc = frozen();
    const next = setStyle(doc, { formula: 'structural' });
    expect(next.style.formula).toBe('structural');
    expect('formula' in doc.style).toBe(false);
    expect(checkInvariants(next)).toEqual([]);
    const r = parse(serialize(next));
    expect(r.ok && r.value).toEqual(next);
    expect(setStyle(next, { formula: 'skeletal' })).toEqual(doc);
  });

  it('formula combines with preset and overrides in one patch', () => {
    const d = setStyle(frozen(), {
      preset: 'journal',
      overrides: { bondLength: 30 },
      formula: 'structural',
    });
    expect(d.style).toEqual({
      preset: 'journal',
      overrides: { bondLength: 30 },
      formula: 'structural',
    });
  });

  it('a formula patch that changes nothing records no history step', () => {
    const skeletal = createHistory(frozen());
    expect(canUndo(transact(skeletal, 'Noop', (d) => setStyle(d, { formula: 'skeletal' })))).toBe(
      false,
    );
    const structural = createHistory(setStyle(frozen(), { formula: 'structural' }));
    expect(
      canUndo(transact(structural, 'Noop', (d) => setStyle(d, { formula: 'structural' }))),
    ).toBe(false);
  });

  it('an empty patch changes nothing and records no history step', () => {
    const doc = frozen();
    expect(setStyle(doc, {})).toBe(doc);
    const h = transact(createHistory(doc), 'Noop', (d) => setStyle(d, {}));
    expect(canUndo(h)).toBe(false);
  });

  const bad: [string, unknown][] = [
    ['unknown preset', { preset: 'x' }],
    ['bondLength 0', { overrides: { bondLength: 0 } }],
    ['bondLength NaN', { overrides: { bondLength: NaN } }],
    ['lineWidth -1', { overrides: { lineWidth: -1 } }],
    ['fontSize Infinity', { overrides: { fontSize: Infinity } }],
    ['doubleBondSpacing 0', { overrides: { doubleBondSpacing: 0 } }],
    ['fontFamily number', { overrides: { fontFamily: 3 } }],
    ['bondLength string', { overrides: { bondLength: '30' } }],
    ['unknown key', { overrides: { colour: 'red' } }],
    ['overrides null', { overrides: null }],
    ['overrides array', { overrides: [] }],
    ['formula x', { formula: 'x' }],
    ['formula empty', { formula: '' }],
    ['formula null', { formula: null }],
    ['formula number', { formula: 1 }],
  ];
  it.each(bad)('%s throws invalid-value and leaves the doc unchanged', (_name, patch) => {
    const doc = frozen();
    const run = () => setStyle(doc, patch as Parameters<typeof setStyle>[1]);
    expect(run).toThrow(DocError);
    try {
      run();
    } catch (e) {
      expect((e as DocError).code).toBe('invalid-value');
    }
    expect(doc).toEqual(emptyDoc(NOW));
  });

  it('a failing patch inside transact leaves the history unchanged', () => {
    const h = createHistory(emptyDoc(NOW));
    expect(() =>
      transact(h, 'Bad', (d) => setStyle(d, { preset: 'journal', overrides: { bondLength: 0 } })),
    ).toThrow(DocError);
    expect(current(h).style.preset).toBe('slides');
  });

  it('a valid result passes checkInvariants and round-trips serialize/parse', () => {
    const overrides: Partial<StyleSettings> = {
      bondLength: 40,
      lineWidth: 1.5,
      doubleBondSpacing: 0.2,
      fontFamily: 'Arial',
      fontSize: 14,
    };
    const doc = setStyle(frozen(), { preset: 'journal', overrides });
    expect(checkInvariants(doc)).toEqual([]);
    const r = parse(serialize(doc));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(doc);
  });
});
