import { describe, expect, it } from 'vitest';
import { labelDisplayRuns } from './chem-text';

const runs = (text: string): string =>
  labelDisplayRuns(text)
    .map((r) => (r.script === undefined ? r.text : `${r.script}(${r.text})`))
    .join(' ');

describe('labelDisplayRuns (L1)', () => {
  it('shows digits after a letter as subscripts', () => {
    expect(runs('NH2')).toBe('NH sub(2)');
    expect(runs('CO2H')).toBe('CO sub(2) H');
    expect(runs('H20')).toBe('H sub(20)');
    expect(runs('OH')).toBe('OH');
  });

  it('shows digits after a closing bracket as subscripts, other digits plain', () => {
    expect(runs('C(CH3)3')).toBe('C(CH sub(3) ) sub(3)');
    expect(runs('2H')).toBe('2H');
  });

  it('shows a trailing charge as a superscript', () => {
    expect(runs('NH4+')).toBe('NH sub(4) sup(+)');
    expect(runs('OH-')).toBe('OH sup(-)');
    expect(runs('O-')).toBe('O sup(-)');
    expect(runs('Ca2+')).toBe('Ca sup(2+)');
    expect(runs('O2-')).toBe('O sup(2-)');
    expect(runs('SO42-')).toBe('SO sub(4) sup(2-)');
    expect(runs('NO3-')).toBe('NO sub(3) sup(-)');
    expect(runs('NH3+')).toBe('NH sub(3) sup(+)');
  });

  it('shows the typographic minus as typed', () => {
    expect(runs('OH−')).toBe('OH sup(−)');
  });

  it('keeps the text: the runs join to the input, never any markup', () => {
    for (const t of ['', 'NH2', 'NH4+', 'a_{2}', 'x^{2}', 'CO2H']) {
      expect(
        labelDisplayRuns(t)
          .map((r) => r.text)
          .join(''),
      ).toBe(t);
    }
  });

  it('is empty for empty text', () => {
    expect(labelDisplayRuns('')).toEqual([]);
  });
});
