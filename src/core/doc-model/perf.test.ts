import { describe, expect, it } from 'vitest';
import { benzeneDoc, twoStepReactionDoc } from './__fixtures__/schemes';
import { addAtom, updateAtom } from './atoms';
import { addBond } from './bonds';
import { emptyDoc } from './doc';
import { fragments } from './graph';
import { createHistory, current, transact, type History } from './history';
import { historyFromRecord, historyToRecord } from './history-record';
import { everything, extract, insert } from './subdoc';
import type { AtomId, Doc } from './types';

// SPEC-doc-model.md perf budgets on a 500-atom doc: transact median < 2 ms, fragments < 1 ms.
// D2: restoring 100 undo steps of the 500-atom doc <= 150 ms median, of the two-step scheme
// fixture <= 30 ms median.
// `performance` exists at runtime in Node/Vitest; core's tsconfig has no DOM/Node types.
declare const performance: { now(): number };
declare const process: { env: Record<string, string | undefined> };

/** Timings are meaningless under coverage instrumentation (vitest.config.mts sets this). */
const budget = it.skipIf(process.env['CHALKBOND_COVERAGE'] === '1');

function median(samples: number[]): number {
  const s = [...samples].sort((p, q) => p - q);
  return s[Math.floor(s.length / 2)] as number;
}

function time(runs: number, fn: (i: number) => void, warmUp = 20): number {
  for (let i = 0; i < warmUp; i++) fn(i); // warm-up (JIT)
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn(i);
    samples.push(performance.now() - t0);
  }
  return median(samples);
}

/** 84 benzene rings (504 atoms, 504 + 83 bonds) linked into one chain of rings. */
function bigDoc(): Doc {
  const ring = extract(benzeneDoc(), everything(benzeneDoc()));
  let doc = emptyDoc('2026-11-09T00:00:00.000Z');
  let prev: AtomId | undefined;
  for (let i = 0; i < 84; i++) {
    let inserted;
    [doc, inserted] = insert(doc, ring, { x: (i % 12) * 3, y: Math.floor(i / 12) * 3 });
    const atoms = [...inserted.atoms];
    if (prev) [doc] = addBond(doc, prev, atoms[0] as AtomId);
    prev = atoms[3];
  }
  return doc;
}

describe('performance budgets (500 atoms)', () => {
  const doc = bigDoc();

  it('builds the benchmark doc', () => {
    expect(Object.keys(doc.atoms).length).toBeGreaterThanOrEqual(500);
    expect(fragments(doc)).toHaveLength(1);
  });

  it('transact median < 2 ms', () => {
    let h: History = createHistory(doc, { clock: () => '2026-11-09T00:00:00.000Z' });
    const ids = Object.keys(doc.atoms) as AtomId[];
    const ms = time(200, (i) => {
      const id = ids[i % ids.length] as AtomId;
      h = transact(h, 'Move', (d) => updateAtom(d, id, { x: (d.atoms[id]?.x ?? 0) + 0.01 }));
    });
    expect(Object.keys(current(h).atoms)).toHaveLength(ids.length);
    expect(ms, `transact median ${ms.toFixed(3)} ms`).toBeLessThan(2);
  });

  it('fragments median < 1 ms', () => {
    const ms = time(100, () => fragments(doc));
    expect(ms, `fragments median ${ms.toFixed(3)} ms`).toBeLessThan(1);
  });
});

/** 100 undo steps on `doc` (moves, additions with a bond), as the session store reads them back. */
function storedRecord(doc: Doc): unknown {
  let h: History = createHistory(doc, { clock: () => '2026-11-09T00:00:00.000Z' });
  const ids = Object.keys(doc.atoms) as AtomId[];
  for (let i = 0; i < 100; i++) {
    const id = ids[(i * 7) % ids.length] as AtomId;
    h =
      i % 4 === 3
        ? transact(h, 'Add bond', (d) => {
            const [d1, added] = addAtom(d, { x: i, y: -4 });
            return addBond(d1, id, added)[0];
          })
        : transact(h, 'Move', (d) => updateAtom(d, id, { x: (d.atoms[id]?.x ?? 0) + 0.1 }));
  }
  return JSON.parse(JSON.stringify(historyToRecord(h, { maxSteps: 100 })));
}

describe('history record restore budgets (D2)', () => {
  budget.each<[string, () => Doc, number]>([
    ['the 500-atom doc', bigDoc, 150],
    ['the two-step scheme fixture', twoStepReactionDoc, 30],
  ])('restoring 100 steps of %s stays within budget', (name, build, limit) => {
    const record = storedRecord(build());
    const first = historyFromRecord(record);
    expect(first.ok && first.value.dropped).toBe(0);
    // One restore is 100 steps, so a few runs warm it up; 15 timed runs fit the 5 s test limit.
    const ms = time(15, () => historyFromRecord(record), 5);
    expect(ms, `restore of ${name}: median ${ms.toFixed(1)} ms`).toBeLessThanOrEqual(limit);
  });
});
