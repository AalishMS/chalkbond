// The tab list (SPEC-app-shell.md "Tabs, auto-save and session": T1, T3, T4, T7, T8, T11, T12, T13,
// T17's replace-empty rule, T18; R39). Pure and DOM-free: immutable values in, new values out, ids
// and the editor's states come in through ports. A tab never holds a path (R8): `ref` is the
// opaque handle main binds to the tab (I12).
//
// A list is never empty and has exactly one active tab. Every operation returns the very same
// list object when it changes nothing, so a caller can test `next === list`.
import { emptyDoc, setStyle, type Doc } from '@core/doc-model';
import { tabStateCanRedo, tabStateCanUndo, tabStateDoc, type EditorTabState } from '../../editor';
import type { FileRef } from '../../../shared/ipc-types';

export type TabKind = 'untitled' | 'chalk' | 'picture' | 'kept';

export interface Tab {
  /** Opaque, made by the renderer (`crypto.randomUUID()`), never reused (T12). */
  readonly id: string;
  readonly kind: TabKind;
  /**
   * What is stored (SS3): `untitled` its T4 name; `chalk` and `picture` the file's name with its
   * extension; `kept` its whole label (T3). Read the shown label through `label`.
   */
  readonly name: string;
  /** The file (`chalk`) or picture (`picture`) bound to the tab; null for `untitled` and `kept`. */
  readonly ref: FileRef | null;
  /** False while AS6 holds (the file is missing, unreadable or could not be written). */
  readonly available: boolean;
  /** The editor's data for the tab; null while it is not loaded in this run (SS7). */
  readonly state: EditorTabState | null;
}

/** A closed tab on the reopen list (T12). */
export interface ClosedTab {
  /** The id the tab had; it stays in `discarded` and is never reused. */
  readonly oldId: string;
  readonly kind: TabKind;
  readonly name: string;
  /** The binding marker: which file or picture the tab was bound to. */
  readonly ref: FileRef | null;
  readonly available: boolean;
  readonly state: EditorTabState | null;
  /** The position the tab had in the strip. */
  readonly index: number;
}

export interface TabList {
  readonly tabs: readonly Tab[];
  readonly active: string;
  /** The last closed tabs of this run, newest first, at most `REOPEN_LIMIT` (T12). */
  readonly closed: readonly ClosedTab[];
  /** Ids whose records main deletes (SS3); never reused. */
  readonly discarded: readonly string[];
}

export const REOPEN_LIMIT = 10;
export const UNTITLED = 'Untitled';
const YOUR_CHANGES = ' (your changes)';

export interface TabPorts {
  newId(): string;
  /** What the editor's `newState(doc)` makes. */
  newState(doc: Doc): EditorTabState;
  /** ISO timestamp for a new document. */
  clock(): string;
}

export type NewDrawingStyle = 'slides' | 'journal';

// ---- reading -------------------------------------------------------------------------------

export const activeTab = (list: TabList): Tab => {
  const tab = list.tabs.find((t) => t.id === list.active);
  // A list is built only through this module, which keeps `active` in `tabs`.
  return tab ?? (list.tabs[0] as Tab);
};

export const indexOfTab = (list: TabList, id: string): number =>
  list.tabs.findIndex((t) => t.id === id);

export const findTab = (list: TabList, id: string): Tab | undefined =>
  list.tabs.find((t) => t.id === id);

/** T3: the label a tab shows. */
export function label(tab: Pick<Tab, 'kind' | 'name'>): string {
  if (tab.kind === 'chalk') return tab.name.replace(/\.chalk$/i, '');
  return tab.name;
}

/** AS7(c): the name of the `kept` tab made from `tab`: `<label> (your changes)` for a file tab. */
export function keptName(tab: Pick<Tab, 'kind' | 'name'>): string {
  return tab.kind === 'chalk' ? `${label(tab)}${YOUR_CHANGES}` : label(tab);
}

const emptyDrawing = (doc: Doc): boolean =>
  Object.keys(doc.atoms).length === 0 && Object.keys(doc.objects).length === 0;

/** T8 / R39: an `untitled` tab with an empty drawing and no undo step. */
function isBlank(tab: Tab): boolean {
  return (
    tab.kind === 'untitled' &&
    tab.state !== null &&
    emptyDrawing(tabStateDoc(tab.state)) &&
    !tabStateCanUndo(tab.state)
  );
}

/** T17: the active tab is `untitled`, empty, and has no undo and no redo step: a file opens in it. */
export function canOpenInto(list: TabList): boolean {
  const tab = activeTab(list);
  return isBlank(tab) && !tabStateCanRedo(tab.state as EditorTabState);
}

// ---- T4 names ------------------------------------------------------------------------------

/** T4: `Untitled`, then `Untitled 2`, `Untitled 3` ...: the smallest number no open tab uses. */
export function freeUntitledName(tabs: readonly Pick<Tab, 'name'>[]): string {
  const used = new Set<number>();
  for (const t of tabs) {
    const m = /^Untitled(?: (\d+))?$/.exec(t.name);
    if (m === null) continue;
    used.add(m[1] === undefined ? 1 : Number(m[1]));
  }
  let n = 1;
  while (used.has(n)) n++;
  return n === 1 ? UNTITLED : `${UNTITLED} ${n}`;
}

// ---- building ------------------------------------------------------------------------------

/** A list of `tabs` (at least one) with `active` active (the first when `active` is not among them). */
export function createTabs(tabs: readonly Tab[], active?: string): TabList {
  if (tabs.length === 0) throw new Error('createTabs: a tab list is never empty');
  const known = active !== undefined && tabs.some((t) => t.id === active);
  return {
    tabs,
    active: known ? (active as string) : (tabs[0] as Tab).id,
    closed: [],
    discarded: [],
  };
}

function blankTab(ports: TabPorts, style: NewDrawingStyle, name: string): Tab {
  // T18 / ST1: the style of the remembered preset; R28: skeletal (no `formula`).
  const doc = setStyle(emptyDoc(ports.clock()), { preset: style });
  return {
    id: ports.newId(),
    kind: 'untitled',
    name,
    ref: null,
    available: true,
    state: ports.newState(doc),
  };
}

/** A list holding one new empty `Untitled` (start-up with no session, SS7). */
export function initialTabs(ports: TabPorts, style: NewDrawingStyle): TabList {
  const tab = blankTab(ports, style, UNTITLED);
  return createTabs([tab], tab.id);
}

/** T7: a new empty `untitled` tab at the end, activated. Always adds. */
export function newUntitled(list: TabList, ports: TabPorts, style: NewDrawingStyle): TabList {
  const tab = blankTab(ports, style, freeUntitledName(list.tabs));
  return { ...list, tabs: [...list.tabs, tab], active: tab.id };
}

export interface OpenedTab {
  readonly id: string;
  readonly kind: 'chalk' | 'picture';
  /** The file's name with its extension. */
  readonly name: string;
  readonly ref: FileRef;
  readonly state: EditorTabState;
}

/** T17: a file opened in a new tab at the end, activated. */
export function open(list: TabList, tab: OpenedTab): TabList {
  const added: Tab = { ...tab, available: true };
  return { ...list, tabs: [...list.tabs, added], active: added.id };
}

/**
 * T17 (R37): when `canOpenInto` the file opens in the active tab, which keeps its id (the label,
 * kind, binding and state change); otherwise as `open`. `tab.id` is used only in the second case.
 */
export function openInto(list: TabList, tab: OpenedTab): TabList {
  if (!canOpenInto(list)) return open(list, tab);
  const replaced: Tab = {
    id: list.active,
    kind: tab.kind,
    name: tab.name,
    ref: tab.ref,
    available: true,
    state: tab.state,
  };
  return { ...list, tabs: list.tabs.map((t) => (t.id === list.active ? replaced : t)) };
}

// ---- changing one tab ----------------------------------------------------------------------

export type TabPatch = Partial<Pick<Tab, 'kind' | 'name' | 'ref' | 'available' | 'state'>>;

/** Changes fields of one tab (Save as binds an `untitled` tab, AS6 flips `available`, a switch stores a state). */
export function update(list: TabList, id: string, patch: TabPatch): TabList {
  if (!list.tabs.some((t) => t.id === id)) return list;
  return { ...list, tabs: list.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

/** AS7(c) (T3): the tab becomes `kept`: unbound, named by `keptName`. */
export function markKept(list: TabList, id: string): TabList {
  const tab = findTab(list, id);
  if (tab === undefined) return list;
  return update(list, id, { kind: 'kept', name: keptName(tab), ref: null });
}

/** The ids main may now forget: they leave `discarded` once their records are deleted (SS3). */
export function clearDiscarded(list: TabList, ids: readonly string[]): TabList {
  const gone = new Set(ids);
  const rest = list.discarded.filter((id) => !gone.has(id));
  return rest.length === list.discarded.length ? list : { ...list, discarded: rest };
}

// ---- switching -----------------------------------------------------------------------------

export function activate(list: TabList, id: string): TabList {
  if (id === list.active || !list.tabs.some((t) => t.id === id)) return list;
  return { ...list, active: id };
}

function step(list: TabList, delta: 1 | -1): TabList {
  const n = list.tabs.length;
  const next = list.tabs[(indexOfTab(list, list.active) + delta + n) % n] as Tab;
  return activate(list, next.id);
}

/** T11: Ctrl+Tab, wraps. */
export const next = (list: TabList): TabList => step(list, 1);
/** T11: Ctrl+Shift+Tab, wraps. */
export const previous = (list: TabList): TabList => step(list, -1);

/** T11: Ctrl+1 ... Ctrl+8: tab `n` (1-based); nothing when there is none. */
export function byNumber(list: TabList, n: number): TabList {
  if (!Number.isInteger(n) || n < 1 || n > 8) return list;
  const tab = list.tabs[n - 1];
  return tab === undefined ? list : activate(list, tab.id);
}

/** T11: Ctrl+9: the last tab. */
export const last = (list: TabList): TabList => activate(list, (list.tabs.at(-1) as Tab).id);

/** T13: drag a tab from index `from` to index `to` (both inside the list); the others make room. */
export function move(list: TabList, from: number, to: number): TabList {
  const n = list.tabs.length;
  const ok = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < n;
  if (!ok(from) || !ok(to) || from === to) return list;
  const tabs = [...list.tabs];
  const [tab] = tabs.splice(from, 1);
  tabs.splice(to, 0, tab as Tab);
  return { ...list, tabs };
}

// ---- closing and reopening -----------------------------------------------------------------

const withoutDuplicate = (ids: readonly string[], id: string): string[] =>
  ids.includes(id) ? [...ids] : [...ids, id];

/**
 * T8 (the list part): closes tab `id`. The closed tab goes first on the reopen list (at most 10, the
 * oldest dropped) and its id into `discarded`. Closing the active tab activates its right
 * neighbour, else its left. R39: closing the last tab leaves one new empty `Untitled`, and when
 * that tab already is an empty `untitled` tab with no undo step nothing happens (the same list).
 */
export function close(list: TabList, id: string, ports: TabPorts, style: NewDrawingStyle): TabList {
  const at = indexOfTab(list, id);
  if (at < 0) return list;
  const tab = list.tabs[at] as Tab;
  if (list.tabs.length === 1 && isBlank(tab)) return list;

  const entry: ClosedTab = {
    oldId: tab.id,
    kind: tab.kind,
    name: tab.name,
    ref: tab.ref,
    available: tab.available,
    state: tab.state,
    index: at,
  };
  const closed = [entry, ...list.closed].slice(0, REOPEN_LIMIT);
  const discarded = withoutDuplicate(list.discarded, tab.id);
  const rest = list.tabs.filter((t) => t.id !== id);

  if (rest.length === 0) {
    const fresh = blankTab(ports, style, UNTITLED);
    return { tabs: [fresh], active: fresh.id, closed, discarded };
  }
  const active = id !== list.active ? list.active : ((rest[at] ?? rest[at - 1]) as Tab).id;
  return { tabs: rest, active, closed, discarded };
}

export interface ReopenResult {
  readonly list: TabList;
  /**
   * `reopened`: `tab` is the new tab (fresh id; the host writes its record, rebinds its ref with
   * `reason: 'reopen'` and re-checks a file tab). `focused`: the entry's file is open in tab `tab`
   * meanwhile; that tab is activated and the entry dropped. `none`: the list was empty.
   */
  readonly outcome: 'reopened' | 'focused' | 'none';
  readonly tab: Tab | null;
}

/** T12: reopens the newest closed tab at its old position (clamped), under a fresh id. */
export function reopen(list: TabList, newId: () => string): ReopenResult {
  const entry = list.closed[0];
  if (entry === undefined) return { list, outcome: 'none', tab: null };
  const closed = list.closed.slice(1);

  // The binding marker names the file: a tab bound to the same ref already shows it.
  if (entry.ref !== null) {
    const same = list.tabs.find((t) => t.ref !== null && t.ref.id === entry.ref?.id);
    if (same !== undefined) {
      return {
        list: { ...list, active: same.id, closed },
        outcome: 'focused',
        tab: same,
      };
    }
  }

  const name = entry.kind === 'untitled' ? freeNameFor(list, entry.name) : entry.name;
  const tab: Tab = {
    id: newId(),
    kind: entry.kind,
    name,
    ref: entry.ref,
    available: entry.available,
    state: entry.state,
  };
  const tabs = [...list.tabs];
  tabs.splice(Math.min(entry.index, tabs.length), 0, tab);
  return {
    list: {
      tabs,
      active: tab.id,
      closed,
      discarded: withoutDuplicate(list.discarded, entry.oldId),
    },
    outcome: 'reopened',
    tab,
  };
}

/** T4 / T12: the old name when no open tab uses it, else the smallest free one. */
function freeNameFor(list: TabList, wanted: string): string {
  return list.tabs.some((t) => t.name === wanted) ? freeUntitledName(list.tabs) : wanted;
}
