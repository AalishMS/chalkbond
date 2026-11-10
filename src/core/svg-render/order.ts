// Deterministic iteration order for id-keyed records. doc-model exports no comparator, and
// object-key order must never decide output (SPEC-svg-render.md "Determinism"). No
// `localeCompare`: plain code-unit comparison only.

const ID_PATTERN = /^[a-z]([1-9]\d*)$/;

function idNum(id: string): number | null {
  const m = ID_PATTERN.exec(id);
  return m ? Number(m[1]) : null;
}

/** Ascending numeric suffix; well-formed ids before malformed ones; ties by code units. */
export function compareIds(a: string, b: string): number {
  const na = idNum(a);
  const nb = idNum(b);
  if (na !== null && nb !== null && na !== nb) return na - nb;
  if ((na === null) !== (nb === null)) return na === null ? 1 : -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The keys of a record, sorted with {@link compareIds}. */
export function sortedIds<K extends string>(record: Readonly<Record<K, unknown>>): K[] {
  return (Object.keys(record) as K[]).sort(compareIds);
}

/**
 * Compile-time exhaustiveness for a `switch` over a union: the `default` branch passes the
 * leftover value here, so a new variant fails `typecheck`. At run time (a hand-edited file with
 * an unknown variant) it does nothing and the caller falls back to its plain case.
 */
export function exhaustive(_value: never): void {
  // Intentionally empty.
}
