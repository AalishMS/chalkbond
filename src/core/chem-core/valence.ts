// chem-core's valence model. OpenChemLib tolerates hypervalence (a neutral 4-bonded N, a divalent
// Cl) that a teacher should be warned about, so the common organic elements use this table;
// anything outside it falls back to OpenChemLib (see SPEC-chem-core.md "Valence model").
import { PERIODIC_SYMBOLS } from '../doc-model/index';

/** Allowed valences of neutral, non-radical atoms (sum of bond orders + H), ascending. */
const NEUTRAL_VALENCES: Readonly<Record<string, readonly number[]>> = {
  H: [1],
  B: [3],
  C: [4],
  Si: [4],
  N: [3],
  P: [3, 5],
  As: [3, 5],
  O: [2],
  S: [2, 4, 6],
  Se: [2, 4, 6],
  F: [1],
  Cl: [1, 3, 5, 7],
  Br: [1, 3, 5, 7],
  I: [1, 3, 5, 7],
};

const atomicNumber = (symbol: string): number => PERIODIC_SYMBOLS.indexOf(symbol) + 1;

/**
 * The symbol whose neutral valences a charged atom takes: the isoelectronic element
 * (N⁺ → C, O⁻ → F, C⁻ → N, C⁺ → B, B⁻ → C, S⁺ → P). Undefined off the periodic table.
 */
export function isoelectronicSymbol(element: string, charge: number): string | undefined {
  const z = atomicNumber(element);
  if (z === 0) return undefined;
  return PERIODIC_SYMBOLS[z - charge - 1];
}

/**
 * Allowed total valences (bond orders + H) of an atom, ascending, or `null` when the element /
 * charge state is outside chem-core's table (metals, noble gases, pseudo-atoms…).
 * A doublet radical uses one valence, a triplet two.
 */
export function allowedValences(
  element: string,
  charge: number,
  radical: 0 | 1 | 2,
): readonly number[] | null {
  const symbol = isoelectronicSymbol(element, charge);
  const table = symbol === undefined ? undefined : NEUTRAL_VALENCES[symbol];
  if (!table) return null;
  return table.map((v) => v - radical).filter((v) => v >= 0);
}

/**
 * Implicit H for an atom whose bonds use `used` valence: H fills up to the element's lowest
 * (normal) valence only. Higher allowed valences are hypervalent states (SF6, H3PO4, DMSO,
 * HClO4) that must be reached by bonds exactly; implicit H never makes them up, so a divalent Cl
 * is not turned into "HClR2".
 */
export function fillHydrogens(
  allowed: readonly number[],
  used: number,
): { h: number; over: boolean } {
  const lowest = allowed[0];
  if (lowest === undefined) return { h: 0, over: used > 0 };
  const h = used <= lowest ? lowest - used : 0;
  return { h, over: isOverValence(allowed, used + h) };
}

/** A total valence (bonds + H) is over when it exceeds the lowest one and isn't allowed. */
export function isOverValence(allowed: readonly number[], total: number): boolean {
  const lowest = allowed[0];
  if (lowest === undefined) return total > 0;
  return total > lowest && !allowed.includes(total);
}
