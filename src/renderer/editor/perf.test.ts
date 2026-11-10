// SPEC-editor.md "Performance" budgets (medians; timing assertions are skipped under coverage).
import { addAtom, addBond, emptyDoc, type AtomId, type Doc } from '@core/doc-model';
import { render } from '@core/svg-render';
import { expect, it } from 'vitest';
import { hitTest, HIT_ALL } from './model/hit-test';
import type { Viewport } from './model/viewport';

declare const performance: { now(): number };
declare const process: { env: Record<string, string | undefined> };

const budget = it.skipIf(process.env['CHALKBOND_COVERAGE'] === '1');

function median(samples: number[]): number {
  const s = [...samples].sort((p, q) => p - q);
  return s[Math.floor(s.length / 2)] as number;
}

function time(runs: number, fn: () => void): number {
  for (let i = 0; i < 20; i++) fn();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  return median(samples);
}

/** A zig-zag chain of n carbons: n atoms, n - 1 bonds. */
function chain(n: number): Doc {
  let doc = emptyDoc('2026-01-01T00:00:00.000Z');
  let prev: AtomId | null = null;
  for (let i = 0; i < n; i++) {
    let id: AtomId;
    [doc, id] = addAtom(doc, {
      element: 'C',
      x: (i % 25) * 0.87,
      y: Math.floor(i / 25) * 1.5 + (i % 2) * 0.5,
    });
    if (prev !== null && i % 25 !== 0) [doc] = addBond(doc, prev, id);
    prev = id;
  }
  return doc;
}

budget('hitTest on a 500-atom document takes under 0.5 ms (median)', () => {
  const doc = chain(500);
  expect(Object.keys(doc.atoms)).toHaveLength(500);
  const scene = render(doc);
  const viewport: Viewport = { zoom: 1.5, pan: { x: 100, y: 100 }, size: { w: 1200, h: 700 } };
  // Points that hit an atom, a bond and nothing, so every branch of the scan is exercised.
  const points = [
    { x: 100, y: 100 },
    { x: 400, y: 330 },
    { x: 1190, y: 690 },
    { x: 700, y: 20 },
  ];
  let k = 0;
  const ms = time(500, () => {
    hitTest(doc, scene, viewport, points[k++ % points.length] as { x: number; y: number }, HIT_ALL);
  });
  expect(ms).toBeLessThan(0.5);
});
