import { freeze } from 'immer';
import { checkInvariants } from './invariants';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS, type Migrations } from './migrations';
import type { z } from 'zod';
import { DOC_SCHEMA_V1, DOC_SCHEMA_V2 } from './schema';
import type { Doc } from './types';

/** File format id in the `.chalk` envelope. */
export const FILE_FORMAT = 'chalkbond';
/** Files larger than this (UTF-8 bytes) are rejected. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_LISTED = 10;

export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export type ParseErrorCode =
  | 'too-large'
  | 'invalid-json'
  | 'not-chalkbond'
  | 'newer-version'
  | 'unsupported-version'
  | 'migration-failed'
  | 'schema'
  | 'invariants';

export interface ParseError {
  readonly code: ParseErrorCode;
  readonly message: string;
  /** Up to the first 10 schema issues or invariant violations. */
  readonly details?: readonly string[];
}

// Keys that lead their object, in this order; the rest follow alphabetically.
const LEADING_KEYS = ['format', 'schemaVersion', 'id', 'type', 'kind', 'x', 'y', 'w', 'h'];
const ID_KEY = /^[a-z]([1-9]\d*)$/;

/**
 * `.chalk` file text for a doc: `{ format, schemaVersion, doc }`, 2-space JSON, trailing newline.
 * Deterministic — equal docs give byte-identical text regardless of key insertion order:
 * records are ordered by id number, other keys by a fixed order then alphabetically.
 */
export function serialize(doc: Doc): string {
  const version = fileVersion(doc);
  const envelope = {
    format: FILE_FORMAT,
    schemaVersion: version,
    doc: { ...doc, schemaVersion: version },
  };
  return `${JSON.stringify(canonical(envelope), null, 2)}\n`;
}

/** D1: the lowest version that holds the document, so a skeletal doc stays v1 byte for byte. */
function fileVersion(doc: Doc): 1 | 2 {
  return doc.style.formula === undefined ? 1 : 2;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return Object.is(value, -0) ? 0 : value;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, v]) => v !== undefined,
  );
  entries.sort(([p], [q]) => compareKeys(p, q));
  return Object.fromEntries(entries.map(([k, v]) => [k, canonical(v)]));
}

function compareKeys(p: string, q: string): number {
  const lp = LEADING_KEYS.indexOf(p);
  const lq = LEADING_KEYS.indexOf(q);
  if (lp !== -1 || lq !== -1) return (lp === -1 ? Infinity : lp) - (lq === -1 ? Infinity : lq);
  const mp = ID_KEY.exec(p);
  const mq = ID_KEY.exec(q);
  if (mp && mq && p[0] === q[0]) return Number(mp[1]) - Number(mq[1]);
  return p < q ? -1 : p > q ? 1 : 0;
}

/** Parses `.chalk` text: size, JSON, envelope, version, migrations, schema, invariants. */
export function parse(text: string): Result<Doc, ParseError> {
  return parseWith(text, MIGRATIONS, CURRENT_SCHEMA_VERSION);
}

/** One strict schema per file version (D1). */
export type Schemas = Readonly<Record<number, z.ZodType>>;
const SCHEMAS: Schemas = { 1: DOC_SCHEMA_V1, 2: DOC_SCHEMA_V2 };

/**
 * `parse` with an explicit migration table, current version and schema per version (for testing
 * migrations). A file is validated with the schema of its own version, then migrated, then
 * validated once more with `schemas[currentVersion]`.
 */
export function parseWith(
  text: string,
  migrations: Migrations,
  currentVersion: number,
  schemas: Schemas = SCHEMAS,
): Result<Doc, ParseError> {
  if (utf8Length(text, MAX_FILE_BYTES) > MAX_FILE_BYTES) {
    return fail('too-large', `File is larger than ${MAX_FILE_BYTES / (1024 * 1024)} MB.`);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return fail('invalid-json', `File is not valid JSON: ${(e as Error).message}`);
  }
  if (!isRecord(json) || json['format'] !== FILE_FORMAT || !('doc' in json)) {
    return fail('not-chalkbond', 'Not a Chalkbond document.');
  }

  const version = json['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    return fail('unsupported-version', `Unsupported schemaVersion: ${String(version)}.`);
  }
  if (version > currentVersion) {
    return fail('newer-version', 'This file was created by a newer version of Chalkbond.');
  }

  const ownSchema = schemas[version];
  if (!ownSchema) return fail('unsupported-version', `Unsupported schemaVersion: ${version}.`);
  const own = ownSchema.safeParse(json['doc']);
  if (!own.success) return schemaFailure(own.error);

  let doc: unknown = own.data;
  for (let v = version; v < currentVersion; v++) {
    const migrate = migrations[v];
    if (!migrate) return fail('unsupported-version', `No migration from schemaVersion ${v}.`);
    try {
      doc = migrate(doc);
    } catch (e) {
      return fail(
        'migration-failed',
        `Migration from schemaVersion ${v} failed: ${(e as Error).message}`,
      );
    }
  }

  const currentSchema = schemas[currentVersion];
  if (!currentSchema) {
    return fail('unsupported-version', `No schema for schemaVersion ${currentVersion}.`);
  }
  const parsed = currentSchema.safeParse(doc);
  if (!parsed.success) return schemaFailure(parsed.error);

  const violations = checkInvariants(parsed.data as Doc);
  if (violations.length > 0) {
    const details = violations.slice(0, MAX_LISTED).map((v) => `${v.code}: ${v.message}`);
    return fail(
      'invariants',
      `The document is inconsistent (${violations.length} problems).`,
      details,
    );
  }
  return { ok: true, value: freeze(parsed.data as Doc, true) };
}

function schemaFailure(error: z.ZodError): Result<Doc, ParseError> {
  const details = error.issues
    .slice(0, MAX_LISTED)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  return fail('schema', 'The document does not match the Chalkbond format.', details);
}

function fail(
  code: ParseErrorCode,
  message: string,
  details?: readonly string[],
): Result<Doc, ParseError> {
  return { ok: false, error: details ? { code, message, details } : { code, message } };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** UTF-8 byte length of `s`, stopping early once it exceeds `limit`. */
function utf8Length(s: string, limit: number): number {
  if (s.length * 3 <= limit) return s.length; // can't exceed the limit; exact size not needed
  let bytes = 0;
  for (let i = 0; i < s.length && bytes <= limit; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4;
      i++; // low surrogate
    } else bytes += 3;
  }
  return bytes;
}
