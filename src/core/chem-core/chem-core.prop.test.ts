// Property tests (SPEC-chem-core.md "Testing"): reuse doc-model's command generator, so every
// doc reachable by doc-model ops is fair game.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { command, run } from '../doc-model/__fixtures__/arbitraries';
import { createHistory, current, emptyDoc, type Doc, type History } from '../doc-model/index';
import { NOW, build, type AtomSpec, type BondSpec } from './__fixtures__/build';
import { aromatize, kekulize } from './aromatic';
import { cleanStructure } from './clean';
import { canonicalId, toSmiles } from './convert';
import { ChemError } from './errors';
import { perceive } from './perceive';
import { createPerceiver } from './perceiver';

const sequence = fc.array(command, { minLength: 1, maxLength: 50, size: 'max' });
const start = (): History => createHistory(emptyDoc(NOW), { clock: () => NOW });
const docs = (cmds: readonly Parameters<typeof run>[1][]): Doc[] => {
  const out: Doc[] = [];
  let h = start();
  for (const c of cmds) {
    h = run(h, c);
    out.push(current(h));
  }
  return out;
};
const hills = (doc: Doc) => perceive(doc).fragments.map((f) => f.formula.text);

describe('chem-core properties', () => {
  // Correctness property, not a timing check: wall time depends on parallel load (perf budgets
  // live in perf.test.ts). 60 s matches the --coverage testTimeout so it is never lowered there.
  it('perceive never throws on a reachable doc', () => {
    fc.assert(
      fc.property(sequence, (cmds) => {
        for (const doc of docs(cmds)) perceive(doc);
      }),
      { numRuns: 300 },
    );
  }, 60_000);

  it('a cached perceiver always equals perceive across an edit sequence (never stale)', () => {
    fc.assert(
      fc.property(sequence, (cmds) => {
        const perceiver = createPerceiver();
        for (const doc of docs(cmds)) expect(perceiver(doc)).toEqual(perceive(doc));
      }),
      { numRuns: 300 },
    );
  }, 60_000);

  it('toSmiles never throws; aromatize keeps formulas; kekulize keeps them or refuses', () => {
    fc.assert(
      fc.property(sequence, (cmds) => {
        const doc = docs(cmds).at(-1) as Doc;
        toSmiles(doc);
        const before = hills(doc);
        expect(hills(aromatize(doc))).toEqual(before);
        try {
          expect(hills(kekulize(doc))).toEqual(before);
        } catch (e) {
          expect(e).toBeInstanceOf(ChemError);
        }
      }),
      { numRuns: 200 },
    );
  });

  // Configuration the drawing defines is preserved (unit tests: wedges, mirror images). Random
  // docs also stack atoms on one point, leaving E/Z undefined; cleaning then defines it, so here:
  // the stereo-free structure never changes, and a cleaned configuration is stable.
  it('cleanStructure keeps formulas and the structure; configuration is stable once defined', () => {
    fc.assert(
      fc.property(sequence, (cmds) => {
        const doc = docs(cmds).at(-1) as Doc;
        const all = () => Object.keys(doc.atoms) as never;
        const cleaned = cleanStructure(doc, all());
        expect(hills(cleaned)).toEqual(hills(doc));
        expect(canonicalId(cleaned, undefined, { stereo: false })).toBe(
          canonicalId(doc, undefined, { stereo: false }),
        );
        // Stability is only meaningful for valid chemistry: e.g. a pentavalent =C(≡C)– puts a
        // substituent on the alkyne axis, so its "E/Z" is degenerate and may flip.
        if (perceive(doc).warnings.length === 0) {
          expect(canonicalId(cleanStructure(cleaned, all()))).toBe(canonicalId(cleaned));
        }
      }),
      { numRuns: 100 },
    );
  });

  // doc-model's generator draws no H atoms, explicit H counts or 1.5 bonds next to Kekulé ones;
  // this one does (Checkpoint G review: drawn H in unusual bonding, partial toggles, fixed H).
  const molecule = fc
    .integer({ min: 1, max: 9 })
    .chain((n) =>
      fc.record({
        atoms: fc.array(
          fc.record(
            {
              element: fc.constantFrom('H', 'H', 'C', 'C', 'C', 'N', 'O', 'S', 'Cl', 'B', 'P', 'R'),
              charge: fc.constantFrom(0, 0, 0, 1, -1),
              explicitH: fc.integer({ min: 0, max: 4 }),
            },
            { requiredKeys: ['element', 'charge'] },
          ),
          { minLength: n, maxLength: n },
        ),
        bonds: fc.uniqueArray(
          fc.tuple(
            fc.integer({ min: 0, max: n - 1 }),
            fc.integer({ min: 0, max: n - 1 }),
            fc.constantFrom(1, 1, 1.5, 1.5, 2, 3),
          ),
          {
            maxLength: 2 * n,
            selector: ([p, q]) => `${Math.min(p, q)}-${Math.max(p, q)}`,
          },
        ),
      }),
    )
    .map(({ atoms, bonds }) =>
      build(atoms as AtomSpec[], bonds.filter(([p, q]) => p !== q) as BondSpec[]),
    );

  it('drawn H, fixed H counts, charges and mixed 1.5 bonds: never throws, H counts agree', () => {
    fc.assert(
      fc.property(molecule, ({ doc }) => {
        const p = perceive(doc);
        expect(createPerceiver()(doc)).toEqual(p);
        for (const id of Object.keys(doc.atoms)) expect(p.atoms[id as never]).toBeDefined();
        for (const f of p.fragments) {
          // formula H = drawn H atoms + the H shown on atoms (no labels in this generator)
          const drawn = f.atoms.filter((a) => doc.atoms[a]!.element === 'H').length;
          const shown = f.atoms.reduce((sum, a) => sum + p.atoms[a]!.implicitH, 0);
          expect(f.formula.counts['H'] ?? 0).toBe(drawn + shown);
          for (const a of f.atoms) {
            const fixed = doc.atoms[a]!.explicitH;
            if (fixed !== undefined && doc.atoms[a]!.element !== 'R') {
              expect(p.atoms[a]!.implicitH).toBe(fixed);
            }
          }
        }
        toSmiles(doc);
        const before = hills(doc);
        expect(hills(aromatize(doc))).toEqual(before);
        try {
          expect(hills(kekulize(doc))).toEqual(before);
        } catch (e) {
          expect(e).toBeInstanceOf(ChemError);
        }
      }),
      { numRuns: 500 },
    );
  });
});
