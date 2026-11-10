import type { TextRun } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { finishText, labelDisplayRuns } from './chem-text';
import { fromStored, fromText, type EditRun } from './text-edit';

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

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const SUP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '−': '⁻',
};

/** The runs as one string, scripts in Unicode so a table row reads like the chemistry. */
function show(runs: readonly TextRun[]): string {
  return runs
    .map((r) => {
      if (r.script === undefined) return r.text;
      return [...r.text]
        .map((c) => {
          if (r.script === 'sub') return /[0-9]/.test(c) ? (SUB[Number(c)] ?? c) : `⟨sub:${c}⟩`;
          return SUP[c] ?? `⟨sup:${c}⟩`;
        })
        .join('');
    })
    .join('');
}

const typed = (text: string): EditRun[] => [{ text }];
const finish = (text: string): string => show(finishText(typed(text), {}));

describe('finishText (T4): formula tokens', () => {
  const table: [string, string][] = [
    ['H2SO4', 'H₂SO₄'],
    ['CH3COOH', 'CH₃COOH'],
    ['Cu(NH3)4', 'Cu(NH₃)₄'],
    ['LiAlH4', 'LiAlH₄'],
    ['[Cu(NH3)4]', '[Cu(NH₃)₄]'],
    ['(NH4)2SO4', '(NH₄)₂SO₄'],
    ['H3O+', 'H₃O⁺'],
    ['OH-', 'OH⁻'],
    ['Cl-', 'Cl⁻'],
    ['conc. H2SO4, 170 °C', 'conc. H₂SO₄, 170 °C'],
    ['2 H2O', '2 H₂O'],
    ['conc. H2SO4, Δ', 'conc. H₂SO₄, Δ'],
    ['NaOH (aq)', 'NaOH (aq)'],
    ['heat', 'heat'],
    ['25', '25'],
    ['25 °C', '25 °C'],
    ['2nd', '2nd'],
    ['Pd/C', 'Pd/C'],
    ['Δ', 'Δ'],
    ['C2l', 'C2l'],
  ];
  it.each(table)('%s -> %s', (input, expected) => {
    expect(finish(input)).toBe(expected);
  });

  it('leaves the reaction mechanism names alone', () => {
    for (const word of ['SN1', 'SN2', 'SNi', 'E1', 'E2', 'E1cb', 'SN1 and SN2', 'E1cb, E2']) {
      expect(finish(word)).toBe(word);
    }
  });

  it('never makes a digit-first token a formula', () => {
    expect(finish('2H2O')).toBe('2H2O');
    expect(finish('3Cl2')).toBe('3Cl2');
  });

  it('a word that is not a formula is untouched, whatever its digits', () => {
    expect(finish('step3 Hello2 aq2')).toBe('step3 Hello2 aq2');
  });

  it('a charge sign followed by more letters is not a charge', () => {
    expect(finish('NaOH+HCl')).toBe('NaOH+HCl');
    expect(finish('NaOH + HCl')).toBe('NaOH + HCl');
  });

  it('NH4^+ and Fe^2+ typed with the marker still work', () => {
    expect(finish('NH4^+')).toBe('NH₄⁺');
    expect(finish('Fe^2+')).toBe('Fe²⁺');
  });
});

describe('finishText (T4): trailing ion charges after a digit', () => {
  it.each([
    // one element symbol and one digit: the digit is the charge
    ['Fe2+', 'Fe²⁺'],
    ['Cu2+', 'Cu²⁺'],
    ['Al3+', 'Al³⁺'],
    ['Ca2+', 'Ca²⁺'],
    ['O2-', 'O²⁻'],
    ['S2-', 'S²⁻'],
    ['N3-', 'N³⁻'],
    // a one-digit run in a larger formula: the digit is a count
    ['NH4+', 'NH₄⁺'],
    ['NO3-', 'NO₃⁻'],
    ['MnO4-', 'MnO₄⁻'],
    ['HCO3-', 'HCO₃⁻'],
    // a longer run: the last digit is the charge
    ['SO42-', 'SO₄²⁻'],
    ['CO32-', 'CO₃²⁻'],
    ['PO43-', 'PO₄³⁻'],
    ['Cr2O72-', 'Cr₂O₇²⁻'],
    ['S2O32-', 'S₂O₃²⁻'],
    ['Hg22+', 'Hg₂²⁺'],
    ['O22-', 'O₂²⁻'],
    // a sign after a letter, and things that are not formulas
    ['H3O+', 'H₃O⁺'],
    ['OH-', 'OH⁻'],
    ['2+', '2+'],
    ['10-', '10-'],
    ['pH-', 'pH-'],
    ['C-C', 'C-C'],
    ['Fe2+ and SO42- ions', 'Fe²⁺ and SO₄²⁻ ions'],
  ])('%s -> %s', (input, expected) => {
    expect(finish(input)).toBe(expected);
  });

  it('a sign followed by a letter or digit is never a charge', () => {
    expect(finish('Fe2+Cl')).toBe('Fe₂+Cl');
    expect(finish('NH4-2')).toBe('NH₄-2');
  });

  it('explicit characters win', () => {
    const plainDigit: EditRun[] = [{ text: 'Fe' }, { text: '2', explicit: true }, { text: '+' }];
    expect(show(finishText(plainDigit, {}))).toBe('Fe2+');
    const plainSign: EditRun[] = [{ text: 'NH4' }, { text: '+', explicit: true }];
    expect(show(finishText(plainSign, {}))).toBe('NH₄+');
  });

  it('formatting the output again changes nothing', () => {
    for (const t of ['Fe2+', 'SO42-', 'NH4+', 'Cr2O72-']) {
      const once = finishText(typed(t), {});
      const twice = finishText(
        once.map((r) => ({
          text: r.text,
          ...(r.script === undefined ? {} : { script: r.script }),
        })),
        {},
      );
      expect(twice).toEqual(once);
    }
  });

  it('a hyphen charge is the true minus', () => {
    const sup = finishText(typed('SO42-'), {}).find((r) => r.script === 'sup');
    expect(sup?.text).toBe('2−');
  });
});

describe('finishText (T4): typed shortcuts', () => {
  it.each([
    ['Fe^3+', 'Fe³⁺'],
    ['SO4^2-', 'SO₄²⁻'],
    ['Cu(NH3)4^2+', 'Cu(NH₃)₄²⁺'],
    ['x^{2}', 'x²'],
    ['H_{2}O', 'H₂O'],
    ['a^b', 'a^b'],
    ['x^{2', 'x^{2'],
    ['10^-3', '10⁻³'],
  ])('%s -> %s', (input, expected) => {
    expect(finish(input)).toBe(expected);
  });

  it('x_{ab} is a subscript of the braced text, markers removed', () => {
    expect(finishText(typed('x_{ab}'), {})).toEqual([{ text: 'x' }, { text: 'ab', script: 'sub' }]);
  });

  it('a minus in a superscript is the true minus sign, not the hyphen', () => {
    const runs = finishText(typed('SO4^2-'), {});
    const sup = runs.find((r) => r.script === 'sup');
    expect(sup?.text).toBe('2−');
    expect(runs.map((r) => r.text).join('')).not.toContain('-');
  });

  it('a hyphen elsewhere stays a hyphen', () => {
    expect(finish('re-flux')).toBe('re-flux');
    expect(finish('CH3-CH3')).toBe('CH₃-CH₃');
  });

  it('a superscript the shortcut made is not subscripted again as part of the formula', () => {
    // Fe^3+: the 3 follows a letter but is already a superscript.
    expect(finishText(typed('Fe^3+'), {})).toEqual([{ text: 'Fe' }, { text: '3+', script: 'sup' }]);
  });
});

describe('finishText (T4): arrows', () => {
  it('-> becomes the arrow', () => {
    expect(finish('A -> B')).toBe('A → B');
    expect(finish('->')).toBe('→');
    expect(finish('H2 -> 2 H')).toBe('H₂ → 2 H');
  });

  it('never produces an equilibrium arrow', () => {
    expect(finish('A <=> B')).toBe('A <=> B');
    expect(show(finishText(typed('A <-> B'), {}))).not.toContain('⇌');
  });

  it('the arrow does not make a charge: OH-> reads OH then the arrow', () => {
    expect(finish('OH->')).toBe('OH→');
  });
});

describe('finishText (T4): explicit characters', () => {
  it('an explicit plain 2 in CO2 stays plain', () => {
    const runs: EditRun[] = [{ text: 'CO' }, { text: '2', explicit: true }];
    expect(show(finishText(runs, {}))).toBe('CO2');
  });

  it('an explicit subscript is kept, the free digits around it are formatted', () => {
    const runs: EditRun[] = [{ text: 'H2SO' }, { text: '4', script: 'sub', explicit: true }];
    expect(show(finishText(runs, {}))).toBe('H₂SO₄');
  });

  it('explicit characters still make up the token the free ones are read in', () => {
    // "H" explicit plain, "2" free: the token H2 is a formula, 2 is formatted.
    const runs: EditRun[] = [{ text: 'H', explicit: true }, { text: '2' }];
    expect(show(finishText(runs, {}))).toBe('H₂');
  });

  it('a stored text that is merely reopened is not reformatted', () => {
    const stored: TextRun[] = [{ text: 'CO2 and H2SO4' }, { text: ' ->', bold: true }];
    const edit = fromStored(stored);
    const out = finishText(edit.runs, {});
    expect(out.map((r) => r.text).join('')).toBe('CO2 and H2SO4 ->');
    expect(out.every((r) => r.script === undefined)).toBe(true);
  });

  it('typing into a reopened text formats only what was typed', () => {
    // Stored "CO2" (all explicit plain), then "H2O" typed after it.
    const runs: EditRun[] = [...fromStored([{ text: 'CO2 ' }]).runs, { text: 'H2O' }];
    expect(show(finishText(runs, {}))).toBe('CO2 H₂O');
  });

  it('fromText is all free', () => {
    expect(show(finishText(fromText('H2O').runs, {}))).toBe('H₂O');
  });

  it('a character that already has a script is never changed', () => {
    const runs: EditRun[] = [{ text: 'x' }, { text: '2', script: 'sup' }];
    expect(finishText(runs, {})).toEqual([{ text: 'x' }, { text: '2', script: 'sup' }]);
  });

  it('shortcut markers next to explicit characters are not consumed', () => {
    const runs: EditRun[] = [{ text: 'x^' }, { text: '2', explicit: true }];
    expect(show(finishText(runs, {}))).toBe('x^2');
  });
});

describe('finishText (T4): runs and style', () => {
  it('adjacent runs with equal script merge', () => {
    const out = finishText([{ text: 'a' }, { text: 'b' }, { text: 'c', script: 'sub' }], {});
    expect(out).toEqual([{ text: 'ab' }, { text: 'c', script: 'sub' }]);
  });

  it('bold and italic come from the object and go on every run', () => {
    const out = finishText(typed('H2O'), { bold: true, italic: true });
    expect(out).toEqual([
      { text: 'H', bold: true, italic: true },
      { text: '2', script: 'sub', bold: true, italic: true },
      { text: 'O', bold: true, italic: true },
    ]);
  });

  it('no style means no bold or italic keys', () => {
    expect(finishText(typed('O'), {})).toEqual([{ text: 'O' }]);
    expect(finishText(typed('O'), { bold: false })).toEqual([{ text: 'O' }]);
  });

  it('empty input gives no runs', () => {
    expect(finishText([], {})).toEqual([]);
    expect(finishText([{ text: '' }], {})).toEqual([]);
  });

  it('handles characters outside the BMP without splitting them', () => {
    const face = String.fromCodePoint(0x1f600);
    expect(show(finishText(typed(`${face} H2O`), {}))).toBe(`${face} H₂O`);
  });
});
