import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { ItemKey } from '@core/svg-render';
import { applyPatch, planPatch, type Mounted, type PatchOp } from './patch';

const part = (key: string, svg = `<g>${key}</g>`): Mounted => ({
  key: key as ItemKey,
  svg,
});
const parts = (...keys: string[]): Mounted[] => keys.map((k) => part(k));
const kinds = (ops: readonly PatchOp[]): string[] => ops.map((o) => o.op);

describe('planPatch', () => {
  it('empty to a list: all inserts, in order, appended', () => {
    const next = parts('bond:b1', 'atom:a1', 'atom:a2');
    const ops = planPatch([], next);
    expect(kinds(ops)).toEqual(['insert', 'insert', 'insert']);
    expect(applyPatch([], ops)).toEqual(next);
  });

  it('nothing changed: no operations', () => {
    const list = parts('atom:a1', 'bond:b1', 'obj:o1');
    expect(
      planPatch(
        list,
        list.map((p) => ({ ...p })),
      ),
    ).toEqual([]);
  });

  it('one changed svg: exactly one replace', () => {
    const old = parts('atom:a1', 'bond:b1', 'obj:o1');
    const next = [old[0] as Mounted, part('bond:b1', '<g>moved</g>'), old[2] as Mounted];
    expect(planPatch(old, next)).toEqual([{ op: 'replace', key: 'bond:b1', svg: '<g>moved</g>' }]);
  });

  it('a removed key: one remove', () => {
    const old = parts('atom:a1', 'bond:b1', 'obj:o1');
    const next = parts('atom:a1', 'obj:o1');
    expect(planPatch(old, next)).toEqual([{ op: 'remove', key: 'bond:b1' }]);
  });

  it('a new key: one insert before its successor', () => {
    const old = parts('atom:a1', 'obj:o1');
    const next = parts('atom:a1', 'bond:b1', 'obj:o1');
    expect(planPatch(old, next)).toEqual([
      { op: 'insert', key: 'bond:b1', svg: '<g>bond:b1</g>', before: 'obj:o1' },
    ]);
  });

  it('a new last key is appended', () => {
    const ops = planPatch(parts('atom:a1'), parts('atom:a1', 'obj:o9'));
    expect(ops).toEqual([{ op: 'insert', key: 'obj:o9', svg: '<g>obj:o9</g>', before: null }]);
  });

  it('a reorder is moves only, and as few as possible', () => {
    const old = parts('a', 'b', 'c', 'd');
    const next = parts('c', 'a', 'b', 'd');
    const ops = planPatch(old, next);
    expect(kinds(ops)).toEqual(['move']);
    expect(applyPatch(old, ops)).toEqual(next);
  });

  it('reversing n keys moves n - 1 of them', () => {
    const old = parts('a', 'b', 'c', 'd', 'e');
    const next = parts('e', 'd', 'c', 'b', 'a');
    const ops = planPatch(old, next);
    expect(ops).toHaveLength(4);
    expect(kinds(ops).every((k) => k === 'move')).toBe(true);
    expect(applyPatch(old, ops)).toEqual(next);
  });

  it('mixes removes, inserts, moves and replaces', () => {
    const old = parts('a', 'b', 'c', 'd');
    const next = [part('d'), part('x'), part('a', '<g>changed</g>'), part('c')];
    const ops = planPatch(old, next);
    expect(new Set(kinds(ops))).toEqual(new Set(['remove', 'insert', 'move', 'replace']));
    expect(applyPatch(old, ops)).toEqual(next);
  });

  it('removes come first so a later move never refers to a removed node', () => {
    const old = parts('a', 'b', 'c');
    const next = parts('c', 'a');
    const ops = planPatch(old, next);
    expect(ops[0]).toEqual({ op: 'remove', key: 'b' });
    expect(applyPatch(old, ops)).toEqual(next);
  });
});

describe('applyPatch', () => {
  it('throws on an operation that refers to a key that is not mounted', () => {
    expect(() => applyPatch(parts('a'), [{ op: 'remove', key: 'zz' as ItemKey }])).toThrow();
    expect(() =>
      applyPatch(parts('a'), [{ op: 'replace', key: 'zz' as ItemKey, svg: '' }]),
    ).toThrow();
    expect(() =>
      applyPatch(parts('a'), [{ op: 'move', key: 'zz' as ItemKey, before: null }]),
    ).toThrow();
    expect(() =>
      applyPatch(parts('a'), [
        { op: 'insert', key: 'n' as ItemKey, svg: '', before: 'zz' as ItemKey },
      ]),
    ).toThrow();
  });
});

describe('planPatch properties', () => {
  const keyArb = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => `atom:${c}`));
  const listArb = fc.uniqueArray(keyArb, { maxLength: 20 }).chain((keys) =>
    fc
      .array(fc.constantFrom('<g>1</g>', '<g>2</g>', '<g>3</g>'), {
        minLength: keys.length,
        maxLength: keys.length,
      })
      .map((svgs) => keys.map((k, i) => part(k, svgs[i]))),
  );

  it('applying the plan to the old list yields the new list', () => {
    fc.assert(
      fc.property(listArb, listArb, (old, next) => {
        expect(applyPatch(old, planPatch(old, next))).toEqual(next);
      }),
      { numRuns: 500 },
    );
  });

  it('plans nothing for equal lists, and never more than one op per key touched', () => {
    fc.assert(
      fc.property(listArb, listArb, (old, next) => {
        expect(planPatch(old, old)).toEqual([]);
        const ops = planPatch(old, next);
        const oldKeys = new Set(old.map((p) => p.key));
        const nextKeys = new Set(next.map((p) => p.key));
        const removed = old.filter((p) => !nextKeys.has(p.key)).length;
        const added = next.filter((p) => !oldKeys.has(p.key)).length;
        const kept = next.length - added;
        // Removes and inserts are exactly the key differences; moves and replaces touch kept keys.
        expect(ops.filter((o) => o.op === 'remove')).toHaveLength(removed);
        expect(ops.filter((o) => o.op === 'insert')).toHaveLength(added);
        expect(ops.filter((o) => o.op === 'move').length).toBeLessThanOrEqual(
          Math.max(0, kept - 1),
        );
        expect(ops.filter((o) => o.op === 'replace').length).toBeLessThanOrEqual(kept);
      }),
      { numRuns: 300 },
    );
  });

  it('a pure shuffle of an unchanged list is moves only', () => {
    fc.assert(
      fc.property(
        listArb.chain((l) =>
          fc.tuple(fc.constant(l), fc.shuffledSubarray(l, { minLength: l.length })),
        ),
        ([old, next]) => {
          const ops = planPatch(old, next);
          expect(ops.every((o) => o.op === 'move')).toBe(true);
          expect(applyPatch(old, ops)).toEqual(next);
        },
      ),
      { numRuns: 200 },
    );
  });
});
