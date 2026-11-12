// A tab's session record (SPEC-app-shell.md SS3; SS2's 64 MiB cap; SS11's renderer half; R50: the
// newest 100 undo steps). Pure: values in, values or strings out; never throws on stored text.
//
// The record is our own data (no compatibility): `{ format: 'chalkbond-tab'; version: 1; name;
// kind; edited; editor }`, where `editor` is the editor's `tabStateToRecord` (doc-model's
// HistoryRecord, D2). The view and the written hash are not in it: they live in main's index.
// A record that does not parse here, or whose history does not, is SS11's damage: `loadTabRecord`
// sends N10 (`damagedTabRecord`) so main moves it to `damaged/`; the caller goes on by SS11.
import { z } from 'zod';
import {
  tabStateDirty,
  tabStateFromRecord,
  tabStateToRecord,
  type EditorTabState,
} from '../../editor';
import type { ReadTabRecordResponse } from '../../../shared/ipc-types';
import type { TabKind } from './tabs';

export const RECORD_FORMAT = 'chalkbond-tab';
export const RECORD_VERSION = 1;
/** SS2, SEC8: the largest record main writes (UTF-8 bytes). */
export const MAX_RECORD_BYTES = 64 * 1024 * 1024;
/** R50: the undo steps a record keeps. */
export const STORED_STEPS = 100;
/** SS3: a tab's name in the index (and so in its record) is at most 255 characters. */
const MAX_NAME = 255;

/** A record as `parseRecord` returns it: the envelope checked; `editor` is checked by `restoreRecord`. */
export interface TabRecord {
  readonly format: typeof RECORD_FORMAT;
  readonly version: typeof RECORD_VERSION;
  readonly name: string;
  readonly kind: TabKind;
  /** Picture tabs only: edited since opened (F7); false for every other kind. */
  readonly edited: boolean;
  /** The editor's `EditorTabRecord`; its strict check is the editor's (`restoreRecord`). */
  readonly editor: unknown;
}

/**
 * Why a stored record cannot be used (SS11): not JSON, not a record (wrong shape, format, version,
 * kind ...), or its history or drawing does not parse (D2).
 */
export type RecordDamage = 'not-json' | 'not-a-record' | 'history';

const RECORD_SCHEMA = z.strictObject({
  format: z.literal(RECORD_FORMAT),
  version: z.literal(RECORD_VERSION),
  name: z.string().max(MAX_NAME),
  kind: z.enum(['untitled', 'chalk', 'picture', 'kept']),
  edited: z.boolean(),
  // The top of doc-model's HistoryRecord; the steps and the drawing are checked by D2.
  editor: z.strictObject({
    format: z.literal('chalkbond-history'),
    version: z.literal(1),
    file: z.string(),
    past: z.array(z.unknown()),
  }),
});

/** The UTF-8 length of `text` (a lone surrogate counts 3, as `TextEncoder` writes U+FFFD). */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        bytes += 4;
        i++;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

/** Whether `text` is at most `max` UTF-8 bytes, without counting when the answer is plain. */
function fits(text: string, max: number): boolean {
  if (text.length > max) return false; // at least one byte per UTF-16 unit
  if (text.length * 3 <= max) return true; // at most three bytes per UTF-16 unit
  return utf8Length(text) <= max;
}

export interface BuiltRecord {
  /** The record as JSON text (starts with `{`), ready for N7. */
  readonly text: string;
  /** The undo steps asked for after halving (R50: 100, then 50, 25 ... 0). */
  readonly maxSteps: number;
}

export interface BuildRecordOptions {
  /** R50: 100. */
  readonly maxSteps?: number;
  /** SS2: 64 MiB of UTF-8; a test may pass a smaller cap. */
  readonly maxBytes?: number;
}

/**
 * SS3: the record of a tab. If its JSON is over the cap, `maxSteps` is halved until it fits (the
 * oldest steps go first); a record is never refused: at 0 steps the drawing alone is the record
 * (a drawing is at most 20 MiB, so it always fits the real cap).
 */
export function buildRecord(
  tab: { readonly kind: TabKind; readonly name: string },
  state: EditorTabState,
  options: BuildRecordOptions = {},
): BuiltRecord {
  const maxBytes = options.maxBytes ?? MAX_RECORD_BYTES;
  const edited = tab.kind === 'picture' && tabStateDirty(state);
  let maxSteps = Math.max(0, Math.floor(options.maxSteps ?? STORED_STEPS));
  for (;;) {
    const record: TabRecord = {
      format: RECORD_FORMAT,
      version: RECORD_VERSION,
      name: tab.name,
      kind: tab.kind,
      edited,
      editor: tabStateToRecord(state, { maxSteps }),
    };
    const text = JSON.stringify(record);
    if (maxSteps === 0 || fits(text, maxBytes)) return { text, maxSteps };
    maxSteps = Math.floor(maxSteps / 2);
  }
}

/** SS3, SS11: a stored record's text, strictly; anything else is damage. Never throws. */
export function parseRecord(
  text: string,
):
  | { readonly ok: true; readonly record: TabRecord }
  | { readonly ok: false; readonly damage: RecordDamage } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, damage: 'not-json' };
  }
  const result = RECORD_SCHEMA.safeParse(raw);
  if (!result.success) return { ok: false, damage: 'not-a-record' };
  return { ok: true, record: result.data };
}

export type RestoreRecordOptions = Parameters<typeof tabStateFromRecord>[1];

/**
 * The tab's editor state from a parsed record (editor R57, D2). A history or drawing that does not
 * parse is damage (SS11); a damaged undo step drops it and every older one (`droppedSteps`) and
 * keeps the drawing.
 */
export function restoreRecord(
  record: TabRecord,
  options: RestoreRecordOptions,
):
  | { readonly ok: true; readonly state: EditorTabState; readonly droppedSteps: number }
  | { readonly ok: false; readonly damage: RecordDamage } {
  const restored = tabStateFromRecord(record.editor, options);
  if (!restored.ok) return { ok: false, damage: 'history' };
  return { ok: true, state: restored.value.state, droppedSteps: restored.value.droppedSteps };
}

/** The two store channels `loadTabRecord` uses (the preload's I11 and N10). */
export interface RecordPorts {
  readTabRecord(tabId: string): Promise<ReadTabRecordResponse>;
  damagedTabRecord(tabId: string): void;
}

export type LoadedRecord =
  | {
      readonly ok: true;
      readonly record: TabRecord;
      readonly state: EditorTabState;
      readonly droppedSteps: number;
    }
  /** Nothing to move: no record, or one that cannot be read now (a later read may succeed). */
  | { readonly ok: false; readonly problem: 'missing' | 'unreadable' }
  /** SS11: the record was sent to `damaged/` (N10); the caller goes on by SS11. */
  | {
      readonly ok: false;
      readonly problem: 'damaged';
      readonly damage: RecordDamage | 'too-large';
    };

/**
 * SS7, T8 (2), T11: reads a tab's record (I11) and parses it strictly. A record that does not parse,
 * whose history or drawing does not, or that is over 64 MiB is SS11's damage: N10 asks main to move
 * it to `damaged/`. A refused or failed read is `unreadable`. Never throws.
 */
export async function loadTabRecord(
  tabId: string,
  ports: RecordPorts,
  options: RestoreRecordOptions,
): Promise<LoadedRecord> {
  let read: ReadTabRecordResponse;
  try {
    read = await ports.readTabRecord(tabId);
  } catch {
    return { ok: false, problem: 'unreadable' };
  }
  const damaged = (damage: RecordDamage | 'too-large'): LoadedRecord => {
    ports.damagedTabRecord(tabId);
    return { ok: false, problem: 'damaged', damage };
  };
  if (!read.ok) {
    return read.problem === 'too-large'
      ? damaged('too-large')
      : { ok: false, problem: read.problem };
  }
  const parsed = parseRecord(read.text);
  if (!parsed.ok) return damaged(parsed.damage);
  const restored = restoreRecord(parsed.record, options);
  if (!restored.ok) return damaged(restored.damage);
  return {
    ok: true,
    record: parsed.record,
    state: restored.state,
    droppedSteps: restored.droppedSteps,
  };
}
