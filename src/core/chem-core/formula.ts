// Molecular formula assembly: counts → Hill string and display text; summing fragments.
import type { Formula } from './types';
import { PERIODIC_SYMBOLS } from '../doc-model/index';

const REAL = new Set([...PERIODIC_SYMBOLS, 'D', 'T']);
const SUPERSCRIPT: Record<string, string> = {
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
};

/**
 * Hill order: with carbon, C then H then the rest alphabetically; without, all alphabetically.
 * D and T sort as their own symbols (as in OCL). Pseudo-atoms and unknown labels follow the
 * real elements, alphabetically. A count of 1 is not written.
 */
export function hillFormula(counts: Readonly<Record<string, number>>): string {
  const symbols = Object.keys(counts).filter((s) => (counts[s] ?? 0) > 0);
  const real = symbols.filter((s) => REAL.has(s)).sort();
  const pseudo = symbols.filter((s) => !REAL.has(s)).sort();
  const order = real.includes('C')
    ? ['C', ...(real.includes('H') ? ['H'] : []), ...real.filter((s) => s !== 'C' && s !== 'H')]
    : real;
  return [...order, ...pseudo]
    .map((s) => {
      const n = counts[s] ?? 0;
      return n === 1 ? s : `${s}${n}`;
    })
    .join('');
}

/** '⁻', '²⁺', … for a net charge; '' for 0. */
export function chargeText(charge: number): string {
  if (charge === 0) return '';
  const sign = charge > 0 ? '⁺' : '⁻';
  const magnitude = Math.abs(charge);
  if (magnitude === 1) return sign;
  return [...String(magnitude)].map((d) => SUPERSCRIPT[d] ?? d).join('') + sign;
}

export function makeFormula(
  counts: Readonly<Record<string, number>>,
  charge: number,
  mw: number | null,
  exactMass: number | null,
): Formula {
  const hill = hillFormula(counts);
  return { counts, charge, hill, text: hill + chargeText(charge), mw, exactMass };
}

export const EMPTY_FORMULA: Formula = makeFormula({}, 0, 0, 0);

/** Sum of formulas (masses null if any is null). */
export function sumFormulas(formulas: Iterable<Formula>): Formula {
  const counts: Record<string, number> = {};
  let charge = 0;
  let mw: number | null = 0;
  let exactMass: number | null = 0;
  for (const f of formulas) {
    for (const [s, n] of Object.entries(f.counts)) counts[s] = (counts[s] ?? 0) + n;
    charge += f.charge;
    mw = mw === null || f.mw === null ? null : mw + f.mw;
    exactMass = exactMass === null || f.exactMass === null ? null : exactMass + f.exactMass;
  }
  return makeFormula(counts, charge, mw, exactMass);
}
