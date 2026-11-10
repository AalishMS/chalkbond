// The only number formatter for SVG output (SPEC-svg-render.md "Determinism").

/**
 * Rounds to 3 decimals and prints without exponent or trailing zeros: `0.5`, `12`, `0.001`.
 * `-0` and anything that rounds to zero print `0`. The caller must never pass a non-finite
 * number (an offending item is skipped with a notice instead), so that is a programming error.
 */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError(`fmt: non-finite number ${String(n)}`);
  const r = Math.round(n * 1000) / 1000;
  return r === 0 ? '0' : String(r);
}
