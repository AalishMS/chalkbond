import { freeze, type Patch } from 'immer';
import { z } from 'zod';
import { createHistory, HISTORY_DEPTH, type CreateHistoryOptions, type History } from './history';
import { checkInvariants } from './invariants';
import { DOC_SCHEMA_V2 } from './schema';
import { parse, serialize, type ParseError, type ParseErrorCode, type Result } from './serialize';
import type { AtomId, Doc } from './types';

// D2 (SPEC-doc-model.md): a serialisable undo record for app-shell's session store. The record
// carries the current drawing as `.chalk` text and the newest undo steps as Immer patches (plain
// JSON, because `Doc` is). Restoring trusts nothing: the shape is checked strictly, the file goes
// through `parse`, and every step is verified from the current drawing backwards.

/** One Immer patch, as plain JSON. */
export interface PatchRecord {
  readonly op: 'add' | 'remove' | 'replace';
  readonly path: readonly (string | number)[];
  readonly value?: unknown;
}

/** One undo step: its label (at most 200 characters) and its patches both ways. */
export interface StepRecord {
  readonly label: string;
  readonly patches: readonly PatchRecord[];
  readonly inverse: readonly PatchRecord[];
}

/** A history as JSON: the current drawing (`serialize`) and its undo steps, oldest first. */
export interface HistoryRecord {
  readonly format: 'chalkbond-history';
  readonly version: 1;
  readonly file: string;
  readonly past: readonly StepRecord[];
}

const RECORD_FORMAT = 'chalkbond-history';
const RECORD_VERSION = 1;
const MAX_LABEL = 200;
const MAX_LISTED = 10;
const RESERVED_SEGMENTS: readonly string[] = ['__proto__', 'constructor', 'prototype'];

/** The strict schema of the in-memory document (CURRENT_SCHEMA_VERSION 2). */
const CURRENT_DOC_SCHEMA = DOC_SCHEMA_V2;

const pathSegment = z.union([
  z.string().refine((s) => !RESERVED_SEGMENTS.includes(s), 'reserved path segment'),
  z.number().int().nonnegative(),
]);
const patchRecord = z.strictObject({
  op: z.enum(['add', 'remove', 'replace']),
  path: z.array(pathSegment),
  value: z.unknown().optional(),
});
const stepRecord = z.strictObject({
  label: z.string().max(MAX_LABEL),
  patches: z.array(patchRecord),
  inverse: z.array(patchRecord),
});
const RECORD_SCHEMA = z.strictObject({
  format: z.literal(RECORD_FORMAT),
  version: z.literal(RECORD_VERSION),
  file: z.string(),
  past: z.array(stepRecord),
});

type Step = History['past'][number];

interface HistoryToRecordOptions {
  /** How many of the newest undo steps to keep (0 keeps none). */
  readonly maxSteps: number;
}

/**
 * The newest `maxSteps` undo steps of `h` and its current drawing, as JSON-serialisable data.
 * Redo steps, the open coalescing key and the clock are not kept. A label longer than 200
 * characters is shortened to 200 so the record is always valid.
 */
export function historyToRecord(h: History, opts: HistoryToRecordOptions): HistoryRecord {
  const keep = Math.max(0, Math.floor(opts.maxSteps)) || 0;
  const past = h.past.slice(Math.max(0, h.past.length - keep));
  return {
    format: RECORD_FORMAT,
    version: RECORD_VERSION,
    file: serialize(h.doc),
    past: past.map((s) => ({
      label: s.label.slice(0, MAX_LABEL),
      patches: s.patches.map(toPatchRecord),
      inverse: s.inverse.map(toPatchRecord),
    })),
  };
}

function toPatchRecord(p: Patch): PatchRecord {
  const path = [...p.path];
  return p.value === undefined ? { op: p.op, path } : { op: p.op, path, value: p.value };
}

/**
 * Restores a history from a record (untrusted data). The shape is checked by a strict schema
 * and `file` by `parse`; either failure is the error. Then each undo step is verified from the
 * current drawing backwards: its inverse must apply and give a drawing that passes the current
 * strict schema and `checkInvariants`, and its patches must redo exactly the drawing it was
 * undone from. The first step that fails is dropped with every older one (`dropped` counts
 * them, as it counts steps beyond HISTORY_DEPTH), so a damaged history never costs the drawing.
 * The restored history has no redo steps and no open coalescing key.
 */
export function historyFromRecord(
  value: unknown,
  opts: CreateHistoryOptions = {},
): Result<{ history: History; dropped: number }, ParseError> {
  if (!isRecord(value) || value['format'] !== RECORD_FORMAT) {
    return fail('not-chalkbond', 'Not a Chalkbond history record.');
  }
  const version = value['version'];
  if (typeof version === 'number' && Number.isInteger(version) && version > RECORD_VERSION) {
    return fail('newer-version', 'This history was written by a newer version of Chalkbond.');
  }
  if (version !== RECORD_VERSION) {
    return fail('unsupported-version', `Unsupported history version: ${String(version)}.`);
  }
  const shape = RECORD_SCHEMA.safeParse(value);
  if (!shape.success) {
    const details = shape.error.issues
      .slice(0, MAX_LISTED)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    return fail('schema', 'The history does not match the Chalkbond format.', details);
  }

  const file = parse(shape.data.file);
  if (!file.ok) return file;

  const records = shape.data.past;
  const oldest = Math.max(0, records.length - HISTORY_DEPTH);
  const kept: Step[] = [];
  // One mutable copy of the drawing walks back through the steps (see `verifyUndo`).
  const work: Holder = { doc: copyJson(file.value) };
  for (let i = records.length - 1; i >= oldest; i--) {
    const step = toStep(records[i] as StepRecord);
    if (!verifyUndo(work, step)) break;
    kept.push(step);
  }
  kept.reverse();

  const history = Object.freeze({ ...createHistory(file.value, opts), past: kept });
  return { ok: true, value: { history, dropped: records.length - kept.length } };
}

/** A frozen step with its own copies of the patch values (the record stays the caller's). */
function toStep(r: StepRecord): Step {
  const patch = (p: PatchRecord): Patch =>
    p.value === undefined
      ? { op: p.op, path: [...p.path] }
      : { op: p.op, path: [...p.path], value: copyJson(p.value) };
  return freeze(
    { label: r.label, patches: r.patches.map(patch), inverse: r.inverse.map(patch) },
    true,
  );
}

/** The working drawing; a holder, so a patch at the root path can replace it. */
export interface Holder {
  doc: unknown;
}

const RECORD_KEYS: readonly string[] = ['atoms', 'bonds', 'objects', 'groups'];
/** Top-level keys that `checkInvariants` does not read. */
const UNCHECKED_KEYS: readonly string[] = ['schemaVersion', 'style', 'meta'];

/**
 * Where a step writes. Every patch writes inside one slot: the whole drawing (root path), one
 * top-level field, or one entry of an id-keyed record (`atoms`, `bonds`, `objects`, `groups`).
 */
type Slots = 'root' | Map<string, 'whole' | Set<string>>;

function slotsOf(patches: readonly Patch[]): Slots {
  const slots = new Map<string, 'whole' | Set<string>>();
  for (const { path } of patches) {
    const [top, entry] = path;
    if (top === undefined) return 'root';
    const key = String(top);
    const known = slots.get(key);
    if (known === 'whole') continue;
    if (entry === undefined || !RECORD_KEYS.includes(key)) slots.set(key, 'whole');
    else slots.set(key, (known ?? new Set<string>()).add(String(entry)));
  }
  return slots;
}

/** Copies of the values at a step's slots (`undefined` = absent), to compare and to put back. */
type Snapshot = { readonly root: unknown } | Map<string, unknown>;

function snapshot(doc: unknown, slots: Slots): Snapshot {
  if (slots === 'root') return { root: copyJson(doc) };
  const out = new Map<string, unknown>();
  const top = isRecord(doc) ? doc : {};
  for (const [key, slot] of slots) {
    const value = top[key];
    if (slot === 'whole' || !isRecord(value)) out.set(key, copyJson(value));
    else out.set(key, new Map([...slot].map((e) => [e, copyJson(value[e])] as const)));
  }
  return out;
}

/** Whether `doc` equals the snapshot at every slot. */
function matches(doc: unknown, shot: Snapshot): boolean {
  if (!(shot instanceof Map)) return sameJson(doc, shot.root);
  if (!isRecord(doc)) return false;
  for (const [key, saved] of shot) {
    const value = doc[key];
    if (!(saved instanceof Map)) {
      if (!sameJson(value, saved)) return false;
    } else if (!isRecord(value) || [...saved].some(([e, v]) => !sameJson(value[e], v))) {
      return false;
    }
  }
  return true;
}

/** Puts a snapshot of a valid drawing back into `work`, which has the same top-level shape. */
function putBack(work: Holder, shot: Snapshot): void {
  if (!(shot instanceof Map)) {
    work.doc = copyJson(shot.root);
    return;
  }
  const doc = work.doc as Record<string, unknown>;
  for (const [key, saved] of shot) {
    if (!(saved instanceof Map)) setOrDelete(doc, key, copyJson(saved));
    else {
      const record = doc[key] as Record<string, unknown>;
      for (const [entry, v] of saved) setOrDelete(record, entry, copyJson(v));
    }
  }
}

// Keys come from patch paths, whose schema never allows `__proto__`.
function setOrDelete(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined) Reflect.deleteProperty(target, key);
  else target[key] = value;
}

/**
 * Verifies one undo step against the valid drawing in `work` and, if it verifies, leaves the
 * drawing before the step in `work`. The inverse must apply and give a drawing that passes the
 * strict schema and `checkInvariants`; then the patches must give back exactly the drawing the
 * step was undone from. Only the step's slots are copied, checked and compared, so a step costs
 * what it wrote, not the size of the drawing (`checkInvariants` aside, see `invariantProbe`).
 * On failure `work` is left damaged; the caller stops there.
 */
function verifyUndo(work: Holder, step: Step): boolean {
  const slots = slotsOf([...step.inverse, ...step.patches]);
  const after = snapshot(work.doc, slots);
  try {
    applyPatchesInPlace(work, step.inverse);
    if (!CURRENT_DOC_SCHEMA.safeParse(schemaProbe(work.doc, slots)).success) return false;
    const doc = work.doc as Doc; // it passed the strict schema
    if (checkInvariants(invariantProbe(doc, slots, after)).length > 0) return false;
    const before = snapshot(doc, slots);
    applyPatchesInPlace(work, step.patches);
    if (!matches(work.doc, after)) return false;
    putBack(work, before);
    return true;
  } catch {
    // A patch the applier refuses (see `applyPatchesInPlace`): the step is damaged.
    return false;
  }
}

/**
 * What the strict schema has to see of `doc` to decide it as a whole: every top-level field,
 * with each id-keyed record cut down to the entries the step wrote. The doc schema has no
 * refinement across entries (each entry and its key are checked on their own), and the entries
 * the step did not write passed it before, so the probe passes exactly when `doc` would.
 */
function schemaProbe(doc: unknown, slots: Slots): unknown {
  if (slots === 'root' || !isRecord(doc)) return doc;
  const probe: Record<string, unknown> = { ...doc };
  for (const key of RECORD_KEYS) {
    const slot = slots.get(key);
    const record = doc[key];
    if (slot === undefined) probe[key] = {};
    else if (slot !== 'whole' && isRecord(record)) {
      // fromEntries makes own properties, so every written entry is seen by the schema.
      probe[key] = Object.fromEntries(
        [...slot].filter((e) => record[e] !== undefined).map((e) => [e, record[e]]),
      );
    }
  }
  return probe;
}

/**
 * What `checkInvariants` has to see of `doc` (which passed the schema) to decide it as a whole.
 * When the step wrote only atom entries in place (each present before and after) and fields
 * that `checkInvariants` does not read, the cross-reference invariants are those of the valid
 * drawing it was undone from (none): atoms are referred to by id only, and no invariant reads
 * one atom's fields while checking another item. Then only the written atoms are checked, alone
 * in the probe, so nothing can refer to a missing item. Any other step gets the whole drawing.
 */
function invariantProbe(doc: Doc, slots: Slots, after: Snapshot): Doc {
  if (slots === 'root' || !(after instanceof Map)) return doc;
  let written = new Set<string>();
  for (const [key, slot] of slots) {
    if (UNCHECKED_KEYS.includes(key)) continue;
    if (key !== 'atoms' || slot === 'whole') return doc;
    written = slot;
  }
  const previous = after.get('atoms');
  const atoms: Record<string, Doc['atoms'][AtomId]> = {};
  for (const id of written) {
    const atom = doc.atoms[id as AtomId];
    const inPlace = previous instanceof Map && previous.get(id) !== undefined;
    if (atom === undefined || !inPlace) return doc;
    atoms[id] = atom;
  }
  return { ...doc, atoms, bonds: {}, objects: {}, groups: {}, zOrder: [] };
}

/**
 * Applies Immer patches to plain JSON data in place, with Immer's meaning (`applyPatches`) for
 * every patch it accepts; values are copied. It refuses (throws) what Immer never writes for a
 * document edit and might read differently: an array index that is not an in-range integer, a
 * number key on an object, a missing key on the way or for `remove`, and `add` or `remove` at
 * the root. A refused step is dropped, which is always safe.
 */
export function applyPatchesInPlace(work: Holder, patches: readonly Patch[]): void {
  for (const { op, path, value } of patches) {
    if (path.length === 0) {
      if (op !== 'replace') throw new Error(`${op} at the root`);
      work.doc = copyJson(value);
      continue;
    }
    let base: unknown = work.doc;
    for (const segment of path.slice(0, -1)) base = childOf(base, segment);
    const key = path[path.length - 1];
    if (Array.isArray(base)) {
      if (!isIndex(key) || (op === 'add' ? key > base.length : key >= base.length)) {
        throw badPath(path);
      }
      if (op === 'add') base.splice(key, 0, copyJson(value));
      else if (op === 'replace') base[key] = copyJson(value);
      else base.splice(key, 1);
    } else if (isRecord(base) && typeof key === 'string') {
      if (op !== 'remove') base[key] = copyJson(value);
      else if (hasOwn(base, key)) Reflect.deleteProperty(base, key);
      else throw badPath(path);
    } else {
      throw badPath(path);
    }
  }
}

function childOf(base: unknown, segment: string | number): unknown {
  let child: unknown;
  if (Array.isArray(base)) child = isIndex(segment) ? base[segment] : undefined;
  else if (isRecord(base) && typeof segment === 'string' && hasOwn(base, segment)) {
    child = base[segment];
  }
  if (!isObject(child)) throw new Error(`no object at path segment ${String(segment)}`);
  return child;
}

function isIndex(key: unknown): key is number {
  return typeof key === 'number' && Number.isInteger(key) && key >= 0;
}

function hasOwn(o: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, key);
}

function badPath(path: readonly (string | number)[]): Error {
  return new Error(`patch path /${path.join('/')} does not apply`);
}

/** Deep equality of JSON data; a key holding `undefined` counts as absent. */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!isObject(a) || !isObject(b) || Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => sameJson(v, b[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = Object.keys(ra).filter((k) => ra[k] !== undefined);
  return (
    keys.length === Object.keys(rb).filter((k) => rb[k] !== undefined).length &&
    keys.every((k) => sameJson(ra[k], rb[k]))
  );
}

/** A copy of JSON data (own data properties only, so a `__proto__` key stays a plain key). */
function copyJson(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(copyJson);
  if (!isObject(v)) return v;
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copyJson(x)]));
}

function isObject(v: unknown): v is object {
  return typeof v === 'object' && v !== null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return isObject(v) && !Array.isArray(v);
}

function fail(
  code: ParseErrorCode,
  message: string,
  details?: readonly string[],
): Result<never, ParseError> {
  return { ok: false, error: details ? { code, message, details } : { code, message } };
}
