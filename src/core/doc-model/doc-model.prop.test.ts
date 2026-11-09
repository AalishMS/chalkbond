import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { command, editCommand, run } from './__fixtures__/arbitraries';
import { geometrySignature, sameGeometry } from './__fixtures__/geometry-signature';
import { emptyDoc } from './doc';
import { fragments } from './graph';
import { canRedo, canUndo, createHistory, current, redo, undo, type History } from './history';
import { checkInvariants } from './invariants';
import { parse, serialize } from './serialize';
import { everything, extract, insert } from './subdoc';
import { bounds } from './transform';
import type { Doc } from './types';

// SPEC-doc-model.md "Testing": random sequences of 1–50 operations covering every op.
const RUNS = 1000;
const TIMEOUT = 120_000;
const NOW = '2026-11-09T00:00:00.000Z';
// size: 'max' — use the whole 1–50 range (fast-check's default bias keeps arrays short).
const sequence = fc.array(command, { minLength: 1, maxLength: 50, size: 'max' });
const editSequence = fc.array(editCommand, { minLength: 1, maxLength: 50, size: 'max' });

function fixedClock(): () => string {
  let n = 0;
  return () => new Date(Date.parse(NOW) + ++n * 1000).toISOString();
}

function start(): History {
  return createHistory(emptyDoc(NOW), { clock: fixedClock() });
}

function build(cmds: readonly Parameters<typeof run>[1][]): Doc {
  return current(cmds.reduce(run, start()));
}

describe('the command generator', () => {
  it('exercises every op (each succeeds many times) and reaches non-trivial docs', () => {
    const applied = new Map<string, number>();
    const variants = new Set<string>();
    let maxAtoms = 0;
    for (const cmds of fc.sample(sequence, { numRuns: 300, seed: 42 })) {
      let h = start();
      for (const c of cmds) {
        const next = run(h, c);
        if (next !== h) applied.set(c.op, (applied.get(c.op) ?? 0) + 1);
        h = next;
        for (const o of Object.values(current(h).objects)) variants.add(o.type);
      }
      maxAtoms = Math.max(maxAtoms, Object.keys(current(h).atoms).length);
    }
    const ops = [
      'addAtom',
      'addBond',
      'updateAtom',
      'updateBond',
      'addObject',
      'updateObject',
      'delete',
      'merge',
      'transform',
      'paste',
      'drag',
      'undo',
      'redo',
    ];
    for (const op of ops) expect(applied.get(op) ?? 0, op).toBeGreaterThan(20);
    expect([...variants].sort()).toEqual([
      'arrow',
      'bracket',
      'callout',
      'caption',
      'curved-arrow',
      'plus',
      'shape',
      'text',
    ]);
    expect(maxAtoms).toBeGreaterThan(10);
  });
});

describe('doc-model properties', () => {
  it(
    'checkInvariants is empty after every step (edits, undo, redo)',
    () => {
      fc.assert(
        fc.property(sequence, (cmds) => {
          let h = start();
          for (const c of cmds) {
            h = run(h, c);
            const doc = current(h);
            expect(checkInvariants(doc)).toEqual([]);
            // Read-only queries must also work on every reachable doc.
            const frags = fragments(doc);
            expect(frags.flat().sort()).toEqual(Object.keys(doc.atoms).sort());
            bounds(doc);
          }
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );

  it(
    'undo all → the start doc; redo all → the end doc',
    () => {
      fc.assert(
        fc.property(editSequence, (cmds) => {
          let h = start();
          const first = current(h);
          for (const c of cmds) h = run(h, c);
          const last = current(h);
          while (canUndo(h)) h = undo(h);
          expect(current(h)).toEqual(first);
          while (canRedo(h)) h = redo(h);
          expect(current(h)).toEqual(last);
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );

  it(
    'parse(serialize(doc)) deep-equals doc',
    () => {
      fc.assert(
        fc.property(sequence, (cmds) => {
          const doc = build(cmds);
          const r = parse(serialize(doc));
          expect(r).toEqual({ ok: true, value: doc });
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );

  it(
    'insert(extract(doc, everything)) into an empty doc keeps counts and relative geometry',
    () => {
      fc.assert(
        fc.property(
          sequence,
          fc.record({ x: fc.integer({ min: -10, max: 10 }), y: fc.integer({ min: -10, max: 10 }) }),
          (cmds, at) => {
            const doc = build(cmds);
            const all = everything(doc);
            const [copy, inserted] = insert(emptyDoc(NOW), extract(doc, all), at);
            expect(Object.keys(copy.atoms)).toHaveLength(Object.keys(doc.atoms).length);
            expect(Object.keys(copy.bonds)).toHaveLength(Object.keys(doc.bonds).length);
            expect(Object.keys(copy.objects)).toHaveLength(Object.keys(doc.objects).length);
            expect(checkInvariants(copy)).toEqual([]);
            expect(
              sameGeometry(geometrySignature(copy, inserted), geometrySignature(doc, all)),
            ).toBe(true);
          },
        ),
        { numRuns: RUNS },
      );
    },
    TIMEOUT,
  );
});
