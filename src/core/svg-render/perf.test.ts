// SPEC-svg-render.md perf budgets (medians, `perception` supplied since `perceive` has its own
// budget): slide-sized scheme (4 molecules of ~10 atoms, 3 arrows, 6 texts) render < 8 ms;
// a 500-atom single fragment plus 20 objects < 40 ms.
import { describe, expect, it } from 'vitest';
import {
  addAtom,
  addBond,
  addObject,
  emptyDoc,
  setStyle,
  type AtomId,
  type Doc,
  type ObjectInit,
} from '../doc-model';
import { perceive } from '../chem-core';
import { render } from './render';

declare const performance: { now(): number };
declare const process: { env: Record<string, string | undefined> };

/** Timings are meaningless under coverage instrumentation (vitest.config.mts sets this). */
const budget = it.skipIf(process.env['CHALKBOND_COVERAGE'] === '1');

function median(samples: number[]): number {
  const s = [...samples].sort((p, q) => p - q);
  return s[Math.floor(s.length / 2)] as number;
}

function time(runs: number, fn: () => void): number {
  for (let i = 0; i < 10; i++) fn(); // warm-up (JIT)
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  return median(samples);
}

const NOW = '2026-11-09T00:00:00.000Z';
const RING_ANGLES = [-90, -30, 30, 90, 150, 210].map((d) => (d * Math.PI) / 180);

/** A benzene ring (1.5 bonds) centred at (cx, cy), radius 1; returns its atom ids. */
function ring(doc: Doc, cx: number, cy: number): [Doc, AtomId[]] {
  const ids: AtomId[] = [];
  for (const a of RING_ANGLES) {
    let id: AtomId;
    [doc, id] = addAtom(doc, { element: 'C', x: cx + Math.cos(a), y: cy + Math.sin(a) });
    ids.push(id);
  }
  for (let i = 0; i < 6; i++) {
    [doc] = addBond(doc, ids[i] as AtomId, ids[(i + 1) % 6] as AtomId, { order: 1.5 });
  }
  return [doc, ids];
}

/** Ring plus four heteroatom substituents (labels with implicit H, charge-free): 10 atoms. */
function substituted(doc: Doc, cx: number, cy: number): Doc {
  let ids: AtomId[];
  [doc, ids] = ring(doc, cx, cy);
  const elements = ['O', 'N', 'Cl', 'S'];
  for (let k = 0; k < 4; k++) {
    const host = ids[k] as AtomId;
    const a = (RING_ANGLES[k] as number) + 0;
    let id: AtomId;
    [doc, id] = addAtom(doc, {
      element: elements[k] as string,
      x: cx + 2 * Math.cos(a),
      y: cy + 2 * Math.sin(a),
    });
    [doc] = addBond(doc, host, id, { order: 1 });
  }
  return doc;
}

const text = (x: number, y: number): ObjectInit => ({
  type: 'text',
  at: { x, y },
  align: 'center',
  runs: [{ text: 'H' }, { text: '2', script: 'sub' }, { text: 'SO' }, { text: '4', script: 'sub' }],
});

function slideScheme(): Doc {
  let doc = emptyDoc(NOW);
  for (let m = 0; m < 4; m++) doc = substituted(doc, m * 6, 0);
  for (let k = 0; k < 3; k++) {
    [doc] = addObject(doc, {
      type: 'arrow',
      kind: k === 1 ? 'equilibrium' : 'forward',
      from: { x: k * 6 + 2.6, y: 0 },
      to: { x: k * 6 + 3.4, y: 0 },
    });
  }
  for (let k = 0; k < 6; k++) [doc] = addObject(doc, text(k * 3 + 3, -1.4));
  return doc;
}

function bigFragment(): Doc {
  let doc = emptyDoc(NOW);
  let prev: AtomId | undefined;
  for (let i = 0; i < 84; i++) {
    let ids: AtomId[];
    [doc, ids] = ring(doc, (i % 12) * 3, Math.floor(i / 12) * 3);
    if (prev) [doc] = addBond(doc, prev, ids[0] as AtomId);
    prev = ids[3];
  }
  for (let k = 0; k < 20; k++) {
    [doc] = addObject(doc, k % 2 ? text(k, -2) : { type: 'plus', at: { x: k, y: -3 } });
  }
  return doc;
}

// The structural variants (Decision 15) run the same scenes with `formula: 'structural'` and the
// same budgets: the chain carbons between the rings and the substituents' carbons are written.
const FORMULAS = [
  ['', 'skeletal'],
  [' (structural)', 'structural'],
] as const;

describe('svg-render performance budgets', () => {
  for (const [suffix, formula] of FORMULAS) {
    budget(
      `slide-sized scheme (4 molecules, 3 arrows, 6 texts): render median < 8 ms${suffix}`,
      () => {
        const doc = setStyle(slideScheme(), { formula });
        const perception = perceive(doc);
        expect(Object.keys(doc.atoms)).toHaveLength(40);
        const ms = time(50, () => render(doc, { perception }));
        expect(ms, `slide scheme render median ${ms.toFixed(2)} ms${suffix}`).toBeLessThan(8);
      },
    );

    budget(`500-atom fragment plus 20 objects: render median < 40 ms${suffix}`, () => {
      const doc = setStyle(bigFragment(), { formula });
      const perception = perceive(doc);
      expect(Object.keys(doc.atoms).length).toBeGreaterThanOrEqual(500);
      expect(perception.fragments).toHaveLength(1);
      const ms = time(20, () => render(doc, { perception }));
      expect(ms, `500-atom render median ${ms.toFixed(2)} ms${suffix}`).toBeLessThan(40);
    });
  }
});
