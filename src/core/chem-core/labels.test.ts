import { describe, expect, it } from 'vitest';
import { ABBREVIATIONS, attachmentElement } from './abbreviations';
import { interpretLabel } from './labels';
import { molFormula, readMol, smilesToMol } from './ocl';

describe('interpretLabel: element + H grammar', () => {
  it.each([
    ['O', { element: 'O' }],
    ['OH', { element: 'O', hCount: 1 }],
    ['HO', { element: 'O', hCount: 1 }],
    ['NH2', { element: 'N', hCount: 2 }],
    ['H2N', { element: 'N', hCount: 2 }],
    ['NH4+', { element: 'N', hCount: 4, charge: 1 }],
    ['NH3+', { element: 'N', hCount: 3, charge: 1 }],
    ['O-', { element: 'O', charge: -1 }],
    ['OH-', { element: 'O', hCount: 1, charge: -1 }],
    ['O2-', { element: 'O', charge: -2 }],
    ['Fe3+', { element: 'Fe', charge: 3 }],
    ['N+2', { element: 'N', charge: 2 }],
    ['O−', { element: 'O', charge: -1 }],
    ['O⁻', { element: 'O', charge: -1 }],
    ['N⁺', { element: 'N', charge: 1 }],
    ['Cl', { element: 'Cl' }],
    ['HCl', { element: 'Cl', hCount: 1 }],
    ['CH3', { element: 'C', hCount: 3 }],
    ['H2O', { element: 'O', hCount: 2 }],
    ['H', { element: 'H' }],
    ['Hg', { element: 'Hg' }],
    ['Ho', { element: 'Ho' }],
    [' OH ', { element: 'O', hCount: 1 }],
    ['R', { element: 'R' }],
    ['X', { element: 'X' }],
    ['*', { element: '*' }],
  ])('%j → %j', (text, expected) => {
    expect(interpretLabel(text)).toEqual({ kind: 'element', ...expected });
  });

  it.each(['', 'HOH', 'Xx', 'ME', 'ph', 'CO', 'O5-', 'O0+', 'H2', 'R1', 'D', 'Boc', 'OHH', 'c'])(
    '%j is unknown',
    (text) => {
      expect(interpretLabel(text)).toEqual({ kind: 'unknown' });
    },
  );
});

describe('interpretLabel: abbreviations', () => {
  it.each([
    ['Ph', 'C'],
    ['OMe', 'O'],
    ['CO2H', 'C'],
    ['NO2', 'N'],
    ['SO3H', 'S'],
    ['CN', 'C'],
    // Abbreviations win over element symbols (acetyl, propyl — not actinium, praseodymium).
    ['Ac', 'C'],
    ['Pr', 'C'],
  ])('%s → abbreviation attached through %s', (key, element) => {
    expect(interpretLabel(key)).toEqual({ kind: 'abbreviation', key, element });
  });

  it('is case-sensitive and ignores inherited object keys', () => {
    expect(interpretLabel('ME').kind).toBe('unknown');
    expect(interpretLabel('me').kind).toBe('unknown');
    expect(interpretLabel('toString').kind).toBe('unknown');
    expect(interpretLabel('constructor').kind).toBe('unknown');
  });
});

describe('ABBREVIATIONS', () => {
  // Group formula = the SMILES' formula minus the H its attachment atom gives up.
  const GROUP_FORMULA: Record<string, string> = {
    Me: 'CH3',
    Et: 'C2H5',
    Pr: 'C3H7',
    iPr: 'C3H7',
    Bu: 'C4H9',
    tBu: 'C4H9',
    Ph: 'C6H5',
    Bn: 'C7H7',
    Ac: 'C2H3O',
    OMe: 'CH3O',
    OEt: 'C2H5O',
    OPh: 'C6H5O',
    OAc: 'C2H3O2',
    CO2H: 'CHO2',
    COOH: 'CHO2',
    CO2Me: 'C2H3O2',
    CO2Et: 'C3H5O2',
    CHO: 'CHO',
    COCl: 'CClO',
    CONH2: 'CH2NO',
    CN: 'CN',
    NO2: 'NO2',
    SO3H: 'HO3S',
  };

  it('is exactly the v1 table from the spec', () => {
    expect(Object.keys(ABBREVIATIONS).sort()).toEqual(Object.keys(GROUP_FORMULA).sort());
  });

  it.each(Object.entries(GROUP_FORMULA))('%s has formula %s', (key, formula) => {
    const smiles = ABBREVIATIONS[key]!.smiles;
    // Attached to a methyl through its first atom ('C' + SMILES bonds to it), the group adds
    // exactly its formula. The first atom must be the element interpretLabel reports.
    const capped = counts(molFormula(smilesToMol(`C${smiles}`, { coordinates: false })).formula);
    capped['C'] = (capped['C'] ?? 0) - 1;
    capped['H'] = (capped['H'] ?? 0) - 3;
    expect(withoutZeros(capped)).toEqual(counts(formula));
    const first = readMol(smilesToMol(smiles, { coordinates: false })).atoms[0]!;
    expect(first.atomicNo).toBe({ C: 6, N: 7, O: 8, S: 16 }[attachmentElement(smiles)]);
  });

  it('attachmentElement reads the first atom, incl. aromatic and bracket atoms', () => {
    expect(attachmentElement('c1ccccc1')).toBe('C');
    expect(attachmentElement('[N+](=O)[O-]')).toBe('N');
    expect(attachmentElement('ClC')).toBe('Cl');
    expect(() => attachmentElement('=O')).toThrow();
  });
});

/** Element counts of a formula string, in any element order: 'CHOCl' → { C:1, H:1, O:1, Cl:1 }. */
function counts(formula: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [, el, n] of formula.matchAll(/([A-Z][a-z]?)(\d*)/g)) {
    out[el!] = (out[el!] ?? 0) + (n === '' ? 1 : Number(n));
  }
  return out;
}

function withoutZeros(c: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(c).filter(([, n]) => n !== 0));
}
