import { ChemError, createNameIndex, structureFromText } from '@core/chem-core';
import { describe, expect, it } from 'vitest';
import compounds from '../../../../resources/compounds/compounds.json';
import { chipText, isSingleName, nameError, suggestionRows } from './suggestions';

const names = createNameIndex(compounds);

describe('isSingleName (R9)', () => {
  it('is true for one name, with brackets and locants', () => {
    expect(isSingleName('ethanol')).toBe(true);
    expect(isSingleName('2-methylbutan-2-ol')).toBe(true);
    expect(isSingleName('[NH4+]')).toBe(true);
    expect(isSingleName('tetraammine (copper+) sulfate')).toBe(true);
  });
  it('is false for a plus or an arrow outside brackets', () => {
    expect(isSingleName('ethanol + acetic acid')).toBe(false);
    expect(isSingleName('A+B')).toBe(false);
    for (const arrow of ['->', '→', '=>', '<=>', '⇌']) {
      expect(isSingleName(`ethanol ${arrow} ethene`)).toBe(false);
    }
    expect(isSingleName('NH3 [H+] -> x')).toBe(false);
  });
});

describe('suggestionRows (N1, R10)', () => {
  it('needs two typed characters', () => {
    expect(suggestionRows(names, 'e')).toEqual([]);
    expect(suggestionRows(names, ' e ')).toEqual([]);
  });

  it('gives at most 8 rows for "eth", ethane first, the typed prefix bold', () => {
    const rows = suggestionRows(names, 'eth');
    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({ bold: 'eth', rest: 'ane', alias: null });
    expect(rows[0]?.entry.name).toBe('ethane');
    expect(rows[1]?.entry.name).toBe('ethene');
  });

  it('shows the matching synonym, then the display name, for "ethanoic"', () => {
    const rows = suggestionRows(names, 'ethanoic');
    expect(rows[0]).toMatchObject({ bold: 'ethanoic', rest: ' acid', alias: 'acetic acid' });
  });

  it('keeps the typed spelling length across spaces and hyphens', () => {
    const rows = suggestionRows(names, 'acetic a');
    expect(rows[0]).toMatchObject({ bold: 'acetic a', rest: 'cid' });
  });

  it('gives nothing for a reaction text', () => {
    expect(suggestionRows(names, 'ethanol + eth')).toEqual([]);
  });
});

describe('nameError (N2)', () => {
  const fail = (text: string): ChemError => {
    const r = structureFromText(text, names);
    if (r.ok) throw new Error('expected a failure');
    return r.error;
  };

  it('names the text and offers the closest names, closest first', () => {
    const state = nameError('ethanl', fail('ethanl'));
    expect(state.message).toBe('No compound named “ethanl”.');
    expect(state.suggestions).toEqual(['ethanol', 'ethane', 'acetaldehyde']);
  });

  it('shows the too-large wording without chips', () => {
    const state = nameError('x', new ChemError('too-large'));
    expect(state.message).toBe('That structure is too big to draw (over 1000 atoms).');
    expect(state.suggestions).toEqual([]);
  });

  it('shows other chem-core messages as given', () => {
    const state = nameError('x', new ChemError('invalid-molfile', 'Bad molfile.'));
    expect(state).toEqual({ message: 'Bad molfile.', suggestions: [] });
  });
});

describe('chipText (N3)', () => {
  const error = { message: 'x', suggestions: [], span: { start: 10, end: 20 } };
  it('replaces just the failing part of a reaction', () => {
    expect(chipText('ethanol + acetic acd -> water', error, 'acetic acid')).toBe(
      'ethanol + acetic acid -> water',
    );
  });
  it('is the chip alone for a single name', () => {
    expect(chipText('ethanl', { message: 'x', suggestions: [] }, 'ethanol')).toBe('ethanol');
  });
});
