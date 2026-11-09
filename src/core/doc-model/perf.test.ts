import { describe, expect, it } from 'vitest';
import { benzeneDoc } from './__fixtures__/schemes';
import { updateAtom } from './atoms';
import { addBond } from './bonds';
import { emptyDoc } from './doc';
import { fragments } from './graph';
import { createHistory, current, transact, type History } from './history';
import { everything, extract, insert } from './subdoc';
import type { AtomId, Doc } from './types';

// SPEC-doc-model.md perf budgets on a 500-atom doc: transact median < 2 ms, fragments < 1 ms.
// `performance` exists at runtime in Node/Vitest; core's tsconfig has no DOM/Node types.
declare const performance: { now(): number };

function median(samples: number[]): number {
  const s = [...samples].sort((p, q) => p - q);
  return s[Math.floor(s.length / 2)] as number;
}

function time(runs: number, fn: (i: number) => void): number {
  for (let i = 0; i < 20; i++) fn(i); // warm-up (JIT)
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
