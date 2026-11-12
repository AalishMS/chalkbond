/**
 * Newest schema version this build reads, and the `schemaVersion` of every in-memory `Doc`.
 * Not what `serialize` writes: it writes the lowest version that holds the document (D1).
 */
export const CURRENT_SCHEMA_VERSION = 2;

/**
 * `MIGRATIONS[n]` turns a version-n `doc` (untrusted JSON) into version n+1. Applied in
 * sequence by `parse`; the file is validated with its own version's schema first and the result
 * with the current schema. `parseWith` lets tests exercise the mechanism.
 */
export type Migration = (doc: unknown) => unknown;
export type Migrations = Readonly<Record<number, Migration>>;

export const MIGRATIONS: Migrations = {
  // v1 → v2 (D1): v2 only adds the optional `style.formula`; a v1 doc has none (skeletal).
  1: (doc) => ({ ...(doc as object), schemaVersion: 2 }),
};
