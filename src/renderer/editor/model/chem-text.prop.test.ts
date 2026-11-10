// SPEC-editor.md T4 properties: (a) explicit characters are never changed, (b) formatting is
// idempotent, (c) the text only loses consumed markers and gains the documented replacements.
import type { TextRun } from '@core/doc-model';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { finishText } from './chem-text';
import type { EditRun } from './text-edit';

/** The characters of runs as (char, script) pairs. */
function cellsOf(runs: readonly (TextRun | EditRun)[]): string[] {
  return runs.flatMap((r) => [...r.text].map((c) => `${r.script ?? 'plain'}:${c}`));
}

const textOf = (runs: readonly TextRun[]): string => runs.map((r) => r.text).join('');

/** Free text pieces: formulas, words, numbers, spaces, shortcuts and half-shortcuts. */
const FREE_PIECES = [
  'H2SO4',
  'CH3COOH',
  'Cu(NH3)4',
  'LiAlH4',
  'H3O+',
  'OH-',
  'Fe^3+',
  'SO4^2-',
  'x_{ab}',
  'x^{2}',
  '->',
  '<=>',
  'SN1',
  'E1cb',
  'conc.',
  'heat',
  '25',
  '2nd',
  'Pd/C',
  '°C',
  ' ',
  ', ',
  '^',
  '_',
  '{',
  '}',
  '+',
  '-',
  '(',
  ')',
  'NaOH',
  'Hello2',
  'Δ',
] as const;

const freeText = fc.array(fc.constantFrom(...FREE_PIECES), { maxLength: 8 }).map((a) => a.join(''));

/** Runs of free (non-explicit) text, each with an optional script already on it. */
const freeRuns = fc.array(
  fc.record({ text: freeText, script: fc.constantFrom(undefined, 'sub', 'sup') }),
  { maxLength: 4 },
);

const toEdit = (r: { text: string; script?: 'sub' | 'sup' | undefined }): EditRun =>
  r.script === undefined ? { text: r.text } : { text: r.text, script: r.script };

describe('finishText properties (T4)', () => {
  it('(a) explicit characters are never changed, never moved relative to each other', () => {
    // Explicit characters come from an alphabet the free text never uses, so they can be found
    // again in the output.
    const explicitChar = fc.constantFrom('Z', 'Q', 'z', '9', '#');
    const segment = fc.oneof(
      freeText.map((text): EditRun => ({ text })),
      fc
        .tuple(
          fc.array(explicitChar, { minLength: 1, maxLength: 3 }).map((a) => a.join('')),
          fc.constantFrom(undefined, 'sub', 'sup'),
        )
        .map(([text, script]): EditRun =>
          script === undefined ? { text, explicit: true } : { text, script, explicit: true },
        ),
    );
    fc.assert(
      fc.property(fc.array(segment, { maxLength: 6 }), (runs) => {
        const only = (cells: string[]): string[] => cells.filter((c) => /[ZQz9#]$/.test(c));
        const want = only(cellsOf(runs.filter((r) => r.explicit === true)));
        // The free alphabet has no 'Z', 'Q', 'z', '#'; its '9' never appears either.
        const got = only(cellsOf(finishText(runs, {})));
        expect(got).toEqual(want);
      }),
    );
  });

  it('(a) an all-explicit text comes out as it went in', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            text: freeText,
            script: fc.constantFrom(undefined, 'sub', 'sup'),
          }),
          { maxLength: 5 },
        ),
        (parts) => {
          const runs = parts.map((p): EditRun => ({ ...toEdit(p), explicit: true }));
          expect(cellsOf(finishText(runs, {}))).toEqual(cellsOf(runs));
        },
      ),
    );
  });

  it('(b) idempotent: formatting the formatted output, scripts kept but not explicit, changes nothing', () => {
    fc.assert(
      fc.property(freeRuns, fc.boolean(), fc.boolean(), (parts, bold, italic) => {
        const style = { bold, italic };
        const once = finishText(parts.map(toEdit), style);
        const again = finishText(once.map(toEdit), style);
        expect(again).toEqual(once);
      }),
      { numRuns: 500 },
    );
  });

  it('(b) idempotent on every piece alone', () => {
    for (const piece of FREE_PIECES) {
      const once = finishText([{ text: piece }], {});
      const again = finishText(
        once.map((r): EditRun => toEdit(r)),
        {},
      );
      expect(again, piece).toEqual(once);
    }
  });

  it('(c) the text keeps everything except consumed markers, and the arrow and minus replacements', () => {
    // Oracle for marker-free pieces only: the text is the input with `->` as an arrow and `-` as
    // the true minus where a charge or superscript made it so. Compare with `-` and `−` equal.
    const safe = fc
      .array(
        fc.constantFrom(
          'H2SO4',
          'Cu(NH3)4',
          'H3O+',
          'OH-',
          'conc.',
          'heat',
          '25',
          '2nd',
          'Pd/C',
          '°C',
          ' ',
          ', ',
          'NaOH',
          'SN2',
          '<=>',
          'Δ',
        ),
        { maxLength: 8 },
      )
      .map((a) => a.join(''));
    fc.assert(
      fc.property(safe, (text) => {
        const out = textOf(finishText([{ text }], {}));
        expect(out.replaceAll('−', '-')).toBe(text.replaceAll('->', '→'));
      }),
    );
  });

  it('(c) with shortcuts: the markers go, nothing else is lost', () => {
    const pieces: [string, string][] = [
      ['Fe^3+', 'Fe3+'],
      ['SO4^2-', 'SO42-'],
      ['x_{ab}', 'xab'],
      ['x^{2}', 'x2'],
      ['H2O', 'H2O'],
      [' ', ' '],
      ['->', '→'],
      ['a^b', 'a^b'],
    ];
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...pieces), { maxLength: 8 }), (parts) => {
        const input = parts.map(([i]) => i).join('');
        const want = parts.map(([, o]) => o).join('');
        const out = textOf(finishText([{ text: input }], {}));
        expect(out.replaceAll('−', '-')).toBe(want);
      }),
    );
  });

  it('never produces an equilibrium arrow from text that has none', () => {
    fc.assert(
      fc.property(freeRuns, (parts) => {
        expect(textOf(finishText(parts.map(toEdit), {}))).not.toContain('⇌');
      }),
    );
  });

  it('every output run has text, and no two neighbours are alike', () => {
    fc.assert(
      fc.property(freeRuns, (parts) => {
        const out = finishText(parts.map(toEdit), {});
        for (const [i, r] of out.entries()) {
          expect(r.text.length).toBeGreaterThan(0);
          if (i > 0) expect(out[i - 1]?.script).not.toBe(r.script);
        }
      }),
    );
  });
});
