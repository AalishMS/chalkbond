// SPEC-editor.md "Performance" budgets (medians; timing assertions are skipped under coverage).
import { createNameIndex } from '@core/chem-core';
import {
  addAtom,
  addBond,
  current,
  emptyDoc,
  setStyle,
  type AtomId,
  type Doc,
} from '@core/doc-model';
import { render } from '@core/svg-render';
import { expect, it } from 'vitest';
import compounds from '../../../resources/compounds/compounds.json';
import type { CanvasEvent } from './model/canvas-event';
import { hitTest, HIT_ALL } from './model/hit-test';
import { planPatch } from './model/patch';
import { messyScheme } from './model/tidy-fixtures';
import { bluToScreen, screenToBlu, type Viewport } from './model/viewport';
import type { EditorState } from './state/editor-state';
import { reduce } from './state/reducer';
import { createEditorController } from './state/controller';
import { drawn, freshState, testContext } from './state/testing';

declare const performance: { now(): number };
declare const process: { env: Record<string, string | undefined> };

const budget = it.skipIf(process.env['CHALKBOND_COVERAGE'] === '1');

function median(samples: number[]): number {
  const s = [...samples].sort((p, q) => p - q);
  return s[Math.floor(s.length / 2)] as number;
}

function time(runs: number, fn: (i: number) => void): number {
  for (let i = 0; i < 20; i++) fn(i);
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn(i);
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

function hitTestMedian(formula: 'skeletal' | 'structural'): number {
  const doc = formula === 'structural' ? setStyle(chain(500), { formula }) : chain(500);
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
  console.log(`PERF hitTest, 500 atoms, ${formula}: median ${ms.toFixed(3)} ms`);
  return ms;
}

budget('hitTest on a 500-atom document takes under 0.5 ms (median)', () => {
  expect(hitTestMedian('skeletal')).toBeLessThan(0.5);
});

budget('hitTest on a 500-atom structural document takes under 0.5 ms (median)', () => {
  expect(hitTestMedian('structural')).toBeLessThan(0.5);
});

// ---- the SPEC-editor.md "Performance" node budgets ---------------------------------------------

const ctx = testContext();
const SIZE = { w: 1280, h: 722 };

/** The 40-atom scheme: eight molecules, an arrow and pluses, on a sized canvas. */
function scheme40(formula: 'skeletal' | 'structural' = 'skeletal'): EditorState {
  const plain = drawn(
    { name: 'ethanol', x: 0, y: 0 },
    { name: 'acetic acid', x: 4, y: 0 },
    { name: 'ethyl acetate', x: 9, y: 0 },
    { name: 'water', x: 15, y: 0 },
    { name: 'toluene', x: 0, y: 5 },
    { name: 'cyclohexane', x: 5, y: 5 },
    { name: 'ethanol', x: 10, y: 5 },
    { name: 'pentane', x: 15, y: 5 },
    { name: 'benzene', x: 20, y: 5 },
  );
  const doc = formula === 'structural' ? setStyle(plain, { formula }) : plain;
  return reduce(freshState(doc), { type: 'canvas-resized', size: SIZE }, ctx);
}

function bondDragMedian(formula: 'skeletal' | 'structural'): number {
  const start = scheme40(formula);
  const doc = current(start.history);
  expect(Object.keys(doc.atoms).length).toBeGreaterThanOrEqual(40);
  const { scene } = ctx.derive.committed(doc);
  const bl = scene.style.ptPerBlu;
  const first = Object.values(doc.atoms).reduce((a, b) => (b.x < a.x ? b : a));
  if (first === undefined) throw new Error('no atom');
  const at = bluToScreen(start.viewport, first, bl);
  const ev = (type: 'down' | 'move' | 'up', x: number, y: number): CanvasEvent => ({
    type,
    p: screenToBlu(start.viewport, { x, y }, bl),
    screen: { x, y },
    button: 0,
    mods: { shift: false, alt: false, ctrl: false },
  });
  const down = reduce(start, { type: 'pointer', event: ev('down', at.x, at.y) }, ctx);
  expect(down.gesture).not.toBeNull();
  const mounted = scene.parts.map((p) => ({ key: p.key, svg: p.svg }));
  let drawn = 0;
  const ms = time(300, (i) => {
    // Leftwards from the leftmost atom: free canvas, so every step is a new ghost bond.
    const angle = Math.PI * (0.6 + 0.8 * ((i % 40) / 40));
    const moved = reduce(
      down,
      {
        type: 'pointer',
        event: ev('move', at.x + 70 * Math.cos(angle), at.y + 70 * Math.sin(angle)),
      },
      ctx,
    );
    if (moved.preview === null) throw new Error(`no preview at step ${i}`);
    const parts = ctx.derive.preview(moved.preview.doc).scene.parts;
    drawn = planPatch(mounted, parts).length;
  });
  expect(drawn).toBeGreaterThan(0);
  console.log(`PERF bond-drag preview step, ${formula}: median ${ms.toFixed(3)} ms`);
  return ms;
}

budget('one bond-drag preview step on the 40-atom scheme takes under 10 ms (median)', () => {
  expect(bondDragMedian('skeletal')).toBeLessThan(10);
});

budget(
  'one bond-drag preview step on the structural 40-atom scheme takes under 10 ms (median)',
  () => {
    expect(bondDragMedian('structural')).toBeLessThan(10);
  },
);

budget('tidyReaction on the 4-molecule scheme takes under 25 ms (median)', () => {
  const start = reduce(freshState(messyScheme().doc), { type: 'canvas-resized', size: SIZE }, ctx);
  let steps = 0;
  const ms = time(100, () => {
    const done = reduce(start, { type: 'tidy' }, ctx);
    steps = done.history.past.length;
  });
  expect(steps).toBe(1);
  console.log(`PERF tidyReaction: median ${ms.toFixed(3)} ms`);
  expect(ms).toBeLessThan(25);
});

budget('createNameIndex(compounds.json) takes under 30 ms (median)', () => {
  let size = 0;
  const ms = time(15, () => {
    size = createNameIndex(compounds).suggest('eth', 8).length;
  });
  expect(size).toBeGreaterThan(0);
  console.log(`PERF createNameIndex: median ${ms.toFixed(3)} ms`);
  expect(ms).toBeLessThan(30);
});

// ---- R57: the editor's share of a tab switch (app-shell T11: 100 ms to the first painted frame) --

budget('putState of a 100-atom tab to its first derived scene takes under 100 ms (median)', () => {
  const c = createEditorController({ clock: () => '2026-01-01T00:00:00.000Z' });
  c.store.dispatch({ type: 'canvas-resized', size: SIZE });
  const first = chain(100);
  const second = chain(100);
  expect(Object.keys(first.atoms)).toHaveLength(100);
  c.load(first);
  c.run('zoom-in');
  const a = c.takeState();
  c.load(second);
  c.store.dispatch({ type: 'pan-by', dx: 40, dy: 20 });
  const b = c.takeState();
  let parts = 0;
  // Alternate, so every run puts the other drawing and the one-entry derive cache misses.
  const ms = time(60, (i) => {
    c.putState(i % 2 === 0 ? a : b);
    parts = c.derive.committed(c.getDoc()).scene.parts.length;
  });
  expect(parts).toBeGreaterThan(90);
  console.log(`PERF putState to first derived scene, 100 atoms: median ${ms.toFixed(3)} ms`);
  expect(ms).toBeLessThan(100);
});
