// What a tab's status is (SPEC-app-shell.md Terms of "Tabs, auto-save and session"; F7 as amended
// by R33 and R41; SS6 unkept; T6 markers; T16 accessible names; W3 title; N8's `unsaved` and
// `warning`). Pure: values in, values out; the SHA-256 is an injected port (`crypto.subtle` in
// the host).
//
// Two notions per tab (F7). *Pending* (a file tab has unwritten changes: the SHA-256 of
// `serialize(drawing)` differs from its written hash; `controller.isDirty()`, which ignores
// `meta.modified`, is not used) drives AS2 only. *Unsaved* (the drawing exists only in the session
// store) drives W3's `*`, T6's dot and T8's prompt. *Unkept* (SS6): unsaved, and its record could
// not be written.
import { serialize, type Doc } from '@core/doc-model';
import { tabStateDirty, tabStateDoc } from '../../editor';
import type { SessionTab, WriteTabRecordResponse } from '../../../shared/ipc-types';
import { label, type Tab, type TabKind } from './tabs';

/** SHA-256 of a text's UTF-8 bytes as 64 lower-case hex digits. */
export type Sha256 = (text: string) => Promise<string>;

/** T6 (as the tab strip draws it): nothing, the dot, or the warning icon for AS6 or SS6. */
export type TabMarker = 'none' | 'dot' | 'unavailable' | 'unkept';

/** What decides a loaded tab's status. */
export interface TabFacts {
  readonly kind: TabKind;
  /** A file tab: false while AS6 holds. Ignored for every other kind (only a file tab is bound). */
  readonly available: boolean;
  /** The drawing has no atom and no object. */
  readonly empty: boolean;
  /** A picture tab: edited since opened (its state is dirty). False for every other kind. */
  readonly edited: boolean;
  /** A file tab: it has unwritten changes (`hasUnwrittenChanges`). False for every other kind. */
  readonly unwritten: boolean;
  /** SS6: the tab's last record write failed (N7 answered a problem). */
  readonly recordFailed: boolean;
}

/** A tab's entry in the index (I7, N8): what is known of a tab not loaded in this run. */
export type StoredFlags = Pick<SessionTab, 'kind' | 'unsaved' | 'warning'>;

/** The SHA-256 of `serialize(doc)`: what a file tab's written hash is compared with. */
export function drawingHash(doc: Doc, sha256: Sha256): Promise<string> {
  return sha256(serialize(doc));
}

/**
 * Terms: a file tab has unwritten changes when the hash of `serialize(drawing)` differs from its
 * written hash. No written hash known (null) counts as unwritten, so nothing is taken as written.
 */
export async function hasUnwrittenChanges(
  doc: Doc,
  written: string | null,
  sha256: Sha256,
): Promise<boolean> {
  if (written === null) return true;
  return (await drawingHash(doc, sha256)) !== written;
}

/** SS6: whether a tab's record write failed, from N7's answer (the first success clears it). */
export const recordFailedAfter = (response: WriteTabRecordResponse): boolean => !response.ok;

/** The facts of a loaded tab; null for a tab not loaded in this run (its index flags hold). */
export function tabFacts(
  tab: Tab,
  extra: { readonly unwritten: boolean; readonly recordFailed: boolean },
): TabFacts | null {
  if (tab.state === null) return null;
  const doc = tabStateDoc(tab.state);
  return {
    kind: tab.kind,
    available: tab.available,
    empty: Object.keys(doc.atoms).length === 0 && Object.keys(doc.objects).length === 0,
    edited: tab.kind === 'picture' && tabStateDirty(tab.state),
    unwritten: tab.kind === 'chalk' && extra.unwritten,
    recordFailed: extra.recordFailed,
  };
}

const unavailableFile = (f: TabFacts): boolean => f.kind === 'chalk' && !f.available;

/** F7 *pending*: a file tab with unwritten changes (drives AS2 only). */
export const isPending = (f: TabFacts): boolean => f.kind === 'chalk' && f.unwritten;

/**
 * F7 *unsaved* (Terms): the drawing exists only in the store: an `untitled` tab with a non-empty
 * drawing, a `picture` tab edited since opened, a `kept` tab, or an unavailable file tab with
 * unwritten changes.
 */
export function isUnsaved(f: TabFacts): boolean {
  switch (f.kind) {
    case 'untitled':
      return !f.empty;
    case 'picture':
      return f.edited;
    case 'kept':
      return true;
    case 'chalk':
      return unavailableFile(f) && f.unwritten;
  }
}

/** SS6 *unkept*: its record could not be written and its drawing exists only in the store. */
export const isUnkept = (f: TabFacts): boolean => f.recordFailed && isUnsaved(f);

/** T6: unkept, else an unavailable file tab (warning icon); else unsaved (dot); else nothing. */
export function tabMarker(f: TabFacts): TabMarker {
  if (isUnkept(f)) return 'unkept';
  if (unavailableFile(f)) return 'unavailable';
  return isUnsaved(f) ? 'dot' : 'none';
}

/** N8: the flags stored for T6's marker of a tab that is not loaded in a later run. */
export function indexFlags(f: TabFacts): { unsaved: boolean; warning: boolean } {
  const marker = tabMarker(f);
  return { unsaved: isUnsaved(f), warning: marker === 'unavailable' || marker === 'unkept' };
}

/**
 * T6 for a tab not loaded in this run: the marker stored in the index. A warning on a file tab is
 * shown as unavailable, on any other kind as unkept (only those two give the warning icon).
 */
export function storedMarker(flags: StoredFlags): TabMarker {
  if (flags.warning) return flags.kind === 'chalk' ? 'unavailable' : 'unkept';
  return flags.unsaved ? 'dot' : 'none';
}

/** T6: a loaded tab's own marker, else the stored one. */
export const markerOf = (facts: TabFacts | null, stored: StoredFlags): TabMarker =>
  facts === null ? storedMarker(stored) : tabMarker(facts);

/** T16: the tab's accessible name: its label plus what the marker says. */
export function accessibleName(tabLabel: string, marker: TabMarker): string {
  switch (marker) {
    case 'dot':
      return `${tabLabel}, not saved as a file yet`;
    case 'unavailable':
      return `${tabLabel}, couldn't save`;
    case 'unkept':
      return `${tabLabel}, couldn't keep`;
    case 'none':
      return tabLabel;
  }
}

/**
 * W3: `*` when the active tab is unsaved (never because an auto-save is due), its label (T3), then
 * ` - Chalkbond`. A tab not loaded yet takes its `*` from its stored flag.
 */
export function windowTitleOf(
  tab: Pick<Tab, 'kind' | 'name'>,
  facts: TabFacts | null,
  stored?: StoredFlags,
): string {
  const unsaved = facts === null ? (stored?.unsaved ?? false) : isUnsaved(facts);
  return `${unsaved ? '*' : ''}${label(tab)} - Chalkbond`;
}
