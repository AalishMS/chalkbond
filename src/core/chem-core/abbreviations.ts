// Grade 11–12 abbreviation table (SPEC-chem-core.md "Labels and abbreviations"). Each group is
// plain SMILES attached through its FIRST atom (OCL reads '*' as carbon, so no marker). Adding a
// group is a data change; labels.test.ts checks every entry's formula.

export interface AbbreviationDef {
  readonly smiles: string;
}

export const ABBREVIATIONS: Readonly<Record<string, AbbreviationDef>> = Object.freeze({
  Me: { smiles: 'C' },
  Et: { smiles: 'CC' },
  Pr: { smiles: 'CCC' },
  iPr: { smiles: 'C(C)C' },
  Bu: { smiles: 'CCCC' },
  tBu: { smiles: 'C(C)(C)C' },
  Ph: { smiles: 'c1ccccc1' },
  Bn: { smiles: 'Cc1ccccc1' },
  Ac: { smiles: 'C(C)=O' },
  OMe: { smiles: 'OC' },
  OEt: { smiles: 'OCC' },
  OPh: { smiles: 'Oc1ccccc1' },
  OAc: { smiles: 'OC(C)=O' },
  CO2H: { smiles: 'C(=O)O' },
  COOH: { smiles: 'C(=O)O' },
  CO2Me: { smiles: 'C(=O)OC' },
  CO2Et: { smiles: 'C(=O)OCC' },
  CHO: { smiles: 'C=O' },
  COCl: { smiles: 'C(=O)Cl' },
  CONH2: { smiles: 'C(=O)N' },
  CN: { smiles: 'C#N' },
  NO2: { smiles: '[N+](=O)[O-]' },
  SO3H: { smiles: 'S(=O)(=O)O' },
});

/** Element of a group's attachment atom: the first atom of its SMILES ('c' → 'C'). */
export function attachmentElement(smiles: string): string {
  const match = /^\[?(Cl|Br|[BCNOSPFI]|[cnosp])/.exec(smiles);
  if (!match?.[1]) throw new Error(`abbreviation SMILES must start with an atom: ${smiles}`);
  const symbol = match[1];
  return symbol.length === 1 ? symbol.toUpperCase() : symbol;
}
