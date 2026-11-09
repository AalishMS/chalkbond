import { describe, expect, it } from 'vitest';
import { EMPTY_FORMULA, chargeText, hillFormula, makeFormula, sumFormulas } from './formula';

describe('formula helpers', () => {
  it.each([
    [{ C: 2, H: 6, O: 1 }, 'C2H6O'],
    [{ O: 1, C: 1, H: 1, Cl: 1 }, 'CHClO'],
    [{ H: 2, O: 4, S: 1 }, 'H2O4S'],
    [{ C: 1, D: 1, Cl: 3 }, 'CCl3D'],
    [{ Cl: 3, Fe: 1 }, 'Cl3Fe'],
    [{ C: 1, H: 3, R: 1 }, 'CH3R'],
    [{ C: 1, Boc: 1, '*': 2, H: 0 }, 'C*2Boc'],
    [{}, ''],
  ])('Hill %j → %s', (counts, hill) => {
    expect(hillFormula(counts)).toBe(hill);
  });

  it.each([
    [0, ''],
    [1, '⁺'],
    [-1, '⁻'],
    [2, '²⁺'],
    [-3, '³⁻'],
    [10, '¹⁰⁺'],
  ])('charge %d → %j', (q, text) => {
    expect(chargeText(q)).toBe(text);
  });

  it('sums counts, charge and masses; null mass is contagious', () => {
    const a = makeFormula({ C: 2, H: 3, O: 2 }, -1, 59.04, 59.01);
    const b = makeFormula({ Na: 1 }, 1, 22.99, 22.99);
    const s = sumFormulas([a, b]);
    expect(s).toMatchObject({ hill: 'C2H3NaO2', text: 'C2H3NaO2', charge: 0 });
    expect(s.mw).toBeCloseTo(82.03, 2);
    expect(sumFormulas([a, makeFormula({ R: 1 }, 0, null, null)]).mw).toBeNull();
    expect(sumFormulas([])).toEqual(EMPTY_FORMULA);
  });
});
