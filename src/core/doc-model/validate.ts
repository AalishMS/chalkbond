import { isValidElement } from './elements';
import { DocError } from './errors';
import type { Atom, Bond, Color, Point } from './types';

// Input checks for ops, so no op can create an invariant-7/8 violation.

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const BOND_ORDERS: readonly number[] = [1, 2, 3, 1.5];

export function isColor(c: string): c is Color {
  return COLOR_RE.test(c);
}

export function invalid(detail: string): never {
  throw new DocError('invalid-value', detail);
}

export function checkFinite(what: string, ...values: number[]): void {
  if (!values.every(Number.isFinite)) invalid(`${what} must be finite`);
}

export function checkPoint(what: string, p: Point): void {
  checkFinite(what, p.x, p.y);
}

export function checkColor(what: string, c: string | undefined): void {
  if (c !== undefined && !isColor(c)) invalid(`${what} must be #rrggbb, got '${c}'`);
}

export function checkAtom(atom: Omit<Atom, 'id'>): void {
  checkFinite('atom position', atom.x, atom.y);
  if (!isValidElement(atom.element)) invalid(`unknown element '${atom.element}'`);
  if (!(Number.isInteger(atom.charge) && atom.charge >= -4 && atom.charge <= 4)) {
    invalid(`charge must be an integer in [-4, 4], got ${atom.charge}`);
  }
  checkColor('atom colour', atom.color);
}

export function checkBond(bond: Omit<Bond, 'id'>): void {
  if (!BOND_ORDERS.includes(bond.order)) invalid(`bond order must be 1, 2, 3 or 1.5`);
  checkColor('bond colour', bond.color);
}

/**
 * Copies `o` without the `omit` keys (fields callers may not set, such as `id`). With
 * `dropUndefined`, undefined values are dropped too (for `init` objects).
 */
export function settable(
  o: object,
  omit: readonly string[],
  dropUndefined: boolean,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(o).filter(([k, v]) => !omit.includes(k) && !(dropUndefined && v === undefined)),
  );
}

/**
 * Applies a patch to an item (plain copy or draft). `undefined` values delete optional keys
 * (so "clear the label" is `{ label: undefined }`); required keys can't be removed.
 */
export function applyPatch(
  target: object,
  patch: Record<string, unknown>,
  required: readonly string[],
): void {
  const rec = target as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      if (required.includes(key)) invalid(`'${key}' is required`);
      Reflect.deleteProperty(rec, key);
    } else {
      rec[key] = value;
    }
  }
}
