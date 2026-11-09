/** Schema version this build reads and writes. */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * `MIGRATIONS[n]` turns a version-n `doc` (untrusted JSON) into version n+1. Applied in
 * sequence by `parse`; the result is then validated against the current schema. v1 is the
 * first version, so the table is empty — `parseWith` lets tests exercise the mechanism.
 */
export type Migration = (doc: unknown) => unknown;
export type Migrations = Readonly<Record<number, Migration>>;

export const MIGRATIONS: Migrations = {};
