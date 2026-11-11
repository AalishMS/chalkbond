// SPEC-chem-core.md perf budgets (medians): perceive on a 500-atom fragment < 16 ms (a frame);
// cached perceiver after a one-atom label change in a 10-fragment doc < 3 ms; parseSmiles of a
// 50-heavy-atom molecule < 20 ms. Also the timing row of "Verified library facts" (aspirin), which
// is an OpenChemLib fact like those in ocl-facts.test.ts but is timed here, on a quiet CPU.
import { Molecule } from 'openchemlib';
import { describe, expect, it } from 'vitest';
import {
  addBond,
  emptyDoc,
  everything,
  extract,
  insert,
  updateAtom,
  type AtomId,
  type Doc,
  type SubDoc,
} from '../doc-model/index';
import { AROMATICS, NOW, build } from './__fixtures__/build';
import { parseSmiles } from './convert';
import { perceive } from './perceive';
import { createPerceiver } from './perceiver';

declare const performance: { now(): number };
declare const process: { env: Record<string, string | undefined> };

/** Timings are meaningless under coverage instrumentation (vitest.config.mts sets this). */
const budget = it.skipIf(process.env['CHALKBOND_COVERAGE'] === '1');

function median(samples: number[]): number {
  const s = [...samples].sort((p, q) => p - q);
  return s[Math.floor(s.length / 2)] as number;
}

function time(runs: number, fn: (i: number) => void): number {
  for (let i = 0; i < 10; i++) fn(i); // warm-up (JIT)
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn(i);
    samples.push(performance.now() - t0);
  }
  return median(samples);
}

const benzene = (): SubDoc => {
  const b = build(AROMATICS.benzene!.atoms, AROMATICS.benzene!.bonds).doc;
  return extract(b, everything(b));
};

/** `rings` benzene rings (1.5 bonds) chained into one fragment, starting at `origin`. */
function chain(doc: Doc, rings: number, origin: { x: number; y: number }): [Doc, AtomId[]] {
  const ring = benzene();
  const atoms: AtomId[] = [];
  let prev: AtomId | undefined;
  for (let i = 0; i < rings; i++) {
    let inserted;
    [doc, inserted] = insert(doc, ring, {
      x: origin.x + (i % 12) * 3,
      y: origin.y + Math.floor(i / 12) * 3,
    });
    const ids = [...inserted.atoms];
    if (prev) [doc] = addBond(doc, prev, ids[0] as AtomId);
    prev = ids[3];
    atoms.push(...ids);
  }
  return [doc, atoms];
}

describe('chem-core performance budgets', () => {
  budget('perceive on a 500-atom single-fragment doc: median < 16 ms', () => {
    const [doc, atoms] = chain(emptyDoc(NOW), 84, { x: 0, y: 0 });
    expect(atoms.length).toBeGreaterThanOrEqual(500);
    expect(perceive(doc).fragments).toHaveLength(1);
    const ms = time(20, () => perceive(doc));
    expect(ms, `perceive median ${ms.toFixed(2)} ms`).toBeLessThan(16);
  });

  budget(
    'cached perceiver after a one-atom label change in a 10-fragment doc: median < 3 ms',
    () => {
      let doc = emptyDoc(NOW);
      const firsts: AtomId[] = [];
      for (let f = 0; f < 10; f++) {
        let atoms: AtomId[];
        [doc, atoms] = chain(doc, 8, { x: 0, y: f * 10 });
        firsts.push(atoms[0] as AtomId);
      }
      const perceiver = createPerceiver();
      expect(perceiver(doc).fragments).toHaveLength(10);
      const target = firsts[4] as AtomId;
      const labels = ['OMe', 'Ph', 'CO2H', 'Et'];
      const ms = time(40, (i) => {
        perceiver(updateAtom(doc, target, { label: labels[i % labels.length] }));
      });
      expect(ms, `cached perceive median ${ms.toFixed(2)} ms`).toBeLessThan(3);
    },
  );

  budget('parseSmiles of a 50-heavy-atom molecule: median < 20 ms', () => {
    // cholesteryl ester of a nitro / triether benzoic acid: 50 heavy atoms, 8 stereo centres
    const smiles =
      'CC(C)CCC[C@@H](C)[C@H]1CC[C@H]2[C@@H]3CC=C4C[C@@H](OC(=O)c5cc(OCCOCCOCCOC)c(cc5)[N+](=O)[O-])CC[C@]4(C)[C@H]3CC[C@]12C';
    const r = parseSmiles(smiles);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.value.atoms).length).toBeGreaterThanOrEqual(50);
    const ms = time(20, () => parseSmiles(smiles));
    expect(ms, `parseSmiles median ${ms.toFixed(2)} ms`).toBeLessThan(20);
  });
});

// SPEC-chem-core.md "Verified library facts" (openchemlib 9.25.2): re-run before upgrading OCL.
describe('openchemlib library facts (timing)', () => {
  budget('parses and computes the formula of aspirin quickly (≈0.4 ms; budget 5 ms median)', () => {
    const run = () => Molecule.fromSmiles('CC(=O)Oc1ccccc1C(O)=O').getMolecularFormula();
    for (let i = 0; i < 20; i++) run();
    const samples = [];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      run();
      samples.push(performance.now() - t0);
    }
    samples.sort((p, q) => p - q);
    expect(samples[25]).toBeLessThan(5);
  });
});
