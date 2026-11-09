// SPEC.md success criterion 6 / SPEC-chem-core.md "Reference set": formula and MW of ≥ 30
// compounds match PubChem (MW to 0.01). Values were copied from PubChem (PUG-REST, 2026-11-09/10)
// and are kept here independently of resources/compounds/compounds.json.
import { describe, expect, it } from 'vitest';
import { emptyDoc, insert } from '../doc-model/index';
import { NOW } from './__fixtures__/build';
import { parseSmiles } from './convert';
import { perceive } from './perceive';

/** [name, SMILES, PubChem formula, PubChem MW, PubChem exact mass?] */
const REFERENCE: readonly [string, string, string, number, number?][] = [
  ['methane', 'C', 'CH4', 16.043],
  ['ethanol', 'CCO', 'C2H6O', 46.07],
  ['acetic acid', 'CC(=O)O', 'C2H4O2', 60.05],
  ['benzene', 'c1ccccc1', 'C6H6', 78.11],
  ['toluene', 'Cc1ccccc1', 'C7H8', 92.14],
  ['phenol', 'Oc1ccccc1', 'C6H6O', 94.11],
  ['aniline', 'Nc1ccccc1', 'C6H7N', 93.13],
  ['pyridine', 'c1ccncc1', 'C5H5N', 79.1],
  ['nitrobenzene', 'O=[N+]([O-])c1ccccc1', 'C6H5NO2', 123.11],
  ['acetone', 'CC(C)=O', 'C3H6O', 58.08],
  ['benzaldehyde', 'O=Cc1ccccc1', 'C7H6O', 106.12],
  ['benzoic acid', 'OC(=O)c1ccccc1', 'C7H6O2', 122.12],
  ['urea', 'NC(N)=O', 'CH4N2O', 60.056],
  ['glycine', 'NCC(O)=O', 'C2H5NO2', 75.07],
  ['L-alanine', 'C[C@H](N)C(O)=O', 'C3H7NO2', 89.09],
  ['L-cysteine', 'N[C@@H](CS)C(O)=O', 'C3H7NO2S', 121.16],
  ['L-methionine', 'CSCC[C@H](N)C(O)=O', 'C5H11NO2S', 149.21],
  ['aspirin', 'CC(=O)Oc1ccccc1C(O)=O', 'C9H8O4', 180.16],
  ['paracetamol', 'CC(=O)Nc1ccc(O)cc1', 'C8H9NO2', 151.16],
  ['caffeine', 'Cn1cnc2c1c(=O)n(C)c(=O)n2C', 'C8H10N4O2', 194.19],
  ['glucose', 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O', 'C6H12O6', 180.16],
  ['dimethyl sulfoxide', 'CS(C)=O', 'C2H6OS', 78.14],
  ['thiophene', 'c1ccsc1', 'C4H4S', 84.14],
  ['sulfanilic acid', 'Nc1ccc(cc1)S(O)(=O)=O', 'C6H7NO3S', 173.19],
  ['phosphoric acid', 'OP(O)(O)=O', 'H3O4P', 97.995],
  ['trifluoroacetic acid', 'OC(=O)C(F)(F)F', 'C2HF3O2', 114.02],
  ['chloroform', 'ClC(Cl)Cl', 'CHCl3', 119.37],
  ['bromobenzene', 'Brc1ccccc1', 'C6H5Br', 157.01],
  ['iodoform', 'IC(I)I', 'CHI3', 393.732],
  ['iodomethane', 'CI', 'CH3I', 141.939],
  ['TNT', 'Cc1c(cc(cc1[N+]([O-])=O)[N+]([O-])=O)[N+]([O-])=O', 'C7H5N3O6', 227.13],
  ['thionyl chloride', 'ClS(Cl)=O', 'Cl2OS', 118.97],
  ['hydrogen cyanide', 'C#N', 'CHN', 27.025],
  ['ethyl acetate', 'CCOC(C)=O', 'C4H8O2', 88.11],
  ['benzenesulfonyl chloride', 'ClS(=O)(=O)c1ccccc1', 'C6H5ClO2S', 176.62],
  ['picric acid', 'Oc1c(cc(cc1[N+]([O-])=O)[N+]([O-])=O)[N+]([O-])=O', 'C6H3N3O7', 229.1],
  // charged species
  ['acetate', 'CC(=O)[O-]', 'C2H3O2-', 59.04, 59.013304334],
  ['ammonium', '[NH4+]', 'H4N+', 18.039, 18.034374132],
  ['phenoxide', '[O-]c1ccccc1', 'C6H5O-', 93.1, 93.034039779],
  ['methylammonium', 'C[NH3+]', 'CH6N+', 32.065, 32.050024196],
  ['hydroxide', '[OH-]', 'HO-', 17.007, 17.002739651],
  // isotope-labelled (PubChem folds D into H in the formula)
  ['chloroform-d', '[2H]C(Cl)(Cl)Cl', 'CHCl3', 120.38, 118.92066],
  ['methanol-d4', '[2H]C([2H])([2H])O[2H]', 'CH4O', 36.066, 36.051321731],
  ['deuterium oxide', '[2H]O[2H]', 'H2O', 20.028, 20.023118175],
];

/** Element counts of a PubChem formula (charge suffix dropped). */
function counts(formula: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [, el, n] of formula.replace(/[+-]\d*$/, '').matchAll(/([A-Z][a-z]?)(\d*)/g)) {
    out[el!] = (out[el!] ?? 0) + (n === '' ? 1 : Number(n));
  }
  return out;
}

const charge = (formula: string): number => {
  const m = /([+-])(\d*)$/.exec(formula);
  return m ? (m[1] === '-' ? -1 : 1) * Number(m[2] || 1) : 0;
};

describe('reference set vs PubChem (SPEC.md criterion 6)', () => {
  it('has ≥ 30 compounds covering C, H, N, O, S, P, F, Cl, Br, I, ions and isotopes', () => {
    expect(REFERENCE.length).toBeGreaterThanOrEqual(30);
    const all = REFERENCE.map(([, , f]) => f).join('');
    for (const el of ['C', 'H', 'N', 'O', 'S', 'P', 'F', 'Cl', 'Br', 'I']) {
      expect(
        REFERENCE.some(([, , f]) => el in counts(f)),
        el,
      ).toBe(true);
    }
    expect(all).toMatch(/[+-]/);
    expect(REFERENCE.some(([, s]) => s.includes('[2H]'))).toBe(true);
  });

  it.each(REFERENCE)('%s: formula and MW (to 0.01) match', (_, smiles, formula, mw, exact) => {
    const r = parseSmiles(smiles);
    if (!r.ok) throw r.error;
    const p = perceive(insert(emptyDoc(NOW), r.value, { x: 0, y: 0 })[0]);
    expect(p.fragments).toHaveLength(1);
    const f = p.fragments[0]!.formula;
    // chem-core counts D/T separately (OCL convention); PubChem folds them into H.
    const ours: Record<string, number> = {};
    for (const [el, n] of Object.entries(f.counts)) {
      const key = el === 'D' || el === 'T' ? 'H' : el;
      ours[key] = (ours[key] ?? 0) + n;
    }
    expect(ours).toEqual(counts(formula));
    expect(f.charge).toBe(charge(formula));
    expect(Math.abs((f.mw as number) - mw)).toBeLessThanOrEqual(0.01);
    if (exact !== undefined) expect(Math.abs((f.exactMass as number) - exact)).toBeLessThan(0.001);
    expect(p.warnings).toEqual([]);
  });
});
