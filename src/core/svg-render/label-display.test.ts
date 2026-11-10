import { describe, expect, it } from 'vitest';
import { ABBREVIATIONS } from '../chem-core';
import { LABEL_DISPLAY, labelDisplay } from './label-display';

const REVERSED: Record<string, [reversed: string, attach: string]> = {
  OMe: ['MeO', 'O'],
  OEt: ['EtO', 'O'],
  OPh: ['PhO', 'O'],
  OAc: ['AcO', 'O'],
  CO2H: ['HO2C', 'C'],
  COOH: ['HOOC', 'C'],
  CO2Me: ['MeO2C', 'C'],
  CO2Et: ['EtO2C', 'C'],
  CHO: ['OHC', 'C'],
  COCl: ['ClOC', 'C'],
  CONH2: ['H2NOC', 'C'],
  CN: ['NC', 'C'],
  NO2: ['O2N', 'N'],
  SO3H: ['HO3S', 'S'],
};
const SYMMETRIC = ['Me', 'Et', 'Pr', 'iPr', 'Bu', 'tBu', 'Ph', 'Bn', 'Ac'];

describe('LABEL_DISPLAY', () => {
  it('has an entry for every ABBREVIATIONS key, and no others (fails if one is added)', () => {
    expect(Object.keys(LABEL_DISPLAY).sort()).toEqual(Object.keys(ABBREVIATIONS).sort());
  });

  it('lists the reversed text and attachment glyph of each reversible label', () => {
    for (const [label, [reversed, attach]] of Object.entries(REVERSED)) {
      expect(labelDisplay(label), label).toEqual({ reversed, attach });
    }
  });

  it('has no reversed form for the symmetric groups', () => {
    for (const label of SYMMETRIC) expect(labelDisplay(label), label).toBeNull();
  });

  it('attaches through the first glyph when typed and the last when reversed', () => {
    for (const [label, display] of Object.entries(LABEL_DISPLAY)) {
      if (!display) continue;
      expect(label.startsWith(display.attach), label).toBe(true);
      expect(display.reversed.endsWith(display.attach), label).toBe(true);
      // Same letters either way round.
      expect([...display.reversed].sort().join('')).toBe([...label].sort().join(''));
    }
  });

  it('knows nothing about unknown labels or inherited object keys', () => {
    expect(labelDisplay('Foo')).toBeNull();
    expect(labelDisplay('toString')).toBeNull();
    expect(labelDisplay('__proto__')).toBeNull();
    expect(labelDisplay('')).toBeNull();
  });
});
