// The session index (SPEC-app-shell.md "Session store": SS3, SS4, SS7, SS11): the pure model of
// `userData/session/index.json`. Lenient parse like `settings.ts`: unknown keys are dropped and
// each invalid field is replaced by its default; a file that is not an index at all is a damaged
// index, replaced by the empty one (every record then opens as a `kept` tab, SS11). Main owns the
// paths and hashes (they come from the tab registry, never from the renderer, N8); the renderer
// sees only `rendererSession` (no path, no hash, no discarded id).
import { z } from 'zod';

export type TabKind = 'chalk' | 'untitled' | 'picture' | 'kept';
export const TAB_KINDS: readonly TabKind[] = ['chalk', 'untitled', 'picture', 'kept'];

export const MAX_TAB_NAME = 255;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;
const MAX_PATH = 4096;
/** The name of a tab whose stored name is unusable (T4's first name). */
const DEFAULT_NAME = 'Untitled';

/** Zoom and the drawing point at the canvas centre (BLU): the only stored copy of the view. */
export interface TabView {
  zoom: number;
  centre: { x: number; y: number };
}

/** Main's own fields of a tab: never taken from the renderer. */
export interface MainTabFields {
  /** chalk: the file; picture: the picture; kept: the former file (F6's folder). */
  path: string | null;
  /** chalk only: SHA-256 of the file's bytes as last written or read (AS5 compares with it). */
  fileHash: string | null;
  /** chalk only: SHA-256 of `serialize(drawing)` for the drawing the file holds. */
  written: string | null;
  /** chalk only: the hash of a write in flight (SS5). */
  writing: string | null;
}

/** N8's fields of a tab: what the renderer decides and may see (I7, SS7). */
export interface RendererTab {
  id: string;
  kind: TabKind;
  name: string;
  view: TabView | null;
  /** T6's marker for a tab not loaded yet. */
  unsaved: boolean;
  warning: boolean;
}

export interface IndexTab extends RendererTab, MainTabFields {}

export interface SessionIndex {
  version: 1;
  tabs: IndexTab[];
  /** A listed tab's id; null only when `tabs` is empty. */
  active: string | null;
  /** Closed tabs whose records main still has to delete; never a listed id (SS3, SS4). */
  discarded: string[];
}

/** `null`: valid as written (or no file); `repaired`: rewrite it; `damaged`: move it aside. */
export type IndexProblem = 'damaged' | 'repaired' | null;

/** N8: the renderer's part of the index. */
export interface RendererIndexUpdate {
  tabs: readonly RendererTab[];
  active: string;
  discarded: readonly string[];
}

/** SS7 / I7: the index as the renderer may see it. */
export interface RendererSession {
  tabs: RendererTab[];
  active: string;
}

/** SS11: the store folder's file names sorted against the index. */
export interface RecordClassification {
  /** Records of listed tabs, in strip order. */
  listed: string[];
  /** Records the index lists in `discarded`: to delete (only after a valid index read). */
  discarded: string[];
  /** Records neither listed nor discarded, sorted: they open as `kept` tabs at the end. */
  orphans: string[];
  /** Listed tabs without a record. */
  missing: string[];
  /** Discarded ids without a record: they can leave `discarded` at once. */
  staleDiscarded: string[];
  /** Other names (temp files of a killed write, anything else): never touched. */
  ignored: string[];
}

const uuidSchema = z.uuid();
const SHA256 = /^[0-9a-f]{64}$/;

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isUuid = (v: unknown): v is string => uuidSchema.safeParse(v).success;
const shaOrNull = (v: unknown): string | null =>
  typeof v === 'string' && SHA256.test(v) ? v : null;
const pathOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= MAX_PATH ? v : null;
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nameOf = (v: unknown): string =>
  typeof v === 'string' && v.length > 0 && v.length <= MAX_TAB_NAME ? v : DEFAULT_NAME;
const isKind = (v: unknown): v is TabKind => TAB_KINDS.includes(v as TabKind);

/** A positive finite zoom is clamped to 0.25..8; anything else drops the view. */
function viewOf(v: unknown): TabView | null {
  if (!isPlain(v) || !isPlain(v['centre'])) return null;
  const { zoom } = v;
  const { x, y } = v['centre'];
  if (!isFiniteNumber(zoom) || zoom <= 0 || !isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  return { zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)), centre: { x, y } };
}

const copyView = (view: TabView | null): TabView | null =>
  view === null ? null : { zoom: view.zoom, centre: { x: view.centre.x, y: view.centre.y } };

export function emptyIndex(): SessionIndex {
  return { version: 1, tabs: [], active: null, discarded: [] };
}

/**
 * One stored tab, made consistent: a chalk or picture tab without a usable path becomes `kept`
 * (it can never be written); only chalk tabs carry hashes; an untitled tab has no path.
 */
function tabOf(raw: Plain, id: string): IndexTab {
  const path = pathOrNull(raw['path']);
  let kind: TabKind = isKind(raw['kind']) ? raw['kind'] : 'kept';
  if ((kind === 'chalk' || kind === 'picture') && path === null) kind = 'kept';
  const chalk = kind === 'chalk';
  return {
    id,
    kind,
    name: nameOf(raw['name']),
    path: kind === 'untitled' ? null : path,
    fileHash: chalk ? shaOrNull(raw['fileHash']) : null,
    written: chalk ? shaOrNull(raw['written']) : null,
    writing: chalk ? shaOrNull(raw['writing']) : null,
    unsaved: typeof raw['unsaved'] === 'boolean' ? raw['unsaved'] : false,
    warning: typeof raw['warning'] === 'boolean' ? raw['warning'] : false,
    view: viewOf(raw['view']),
  };
}

const activeOf = (active: unknown, tabs: readonly { id: string }[]): string | null =>
  tabs.some((t) => t.id === active) ? (active as string) : (tabs[0]?.id ?? null);

/** Unique uuids, never a listed tab's id (its record would be deleted under it). */
function discardedOf(ids: readonly unknown[], tabs: readonly { id: string }[]): string[] {
  const listed = new Set(tabs.map((t) => t.id));
  return [...new Set(ids.filter(isUuid))].filter((id) => !listed.has(id));
}

/** The index in `text` (null: no file) and whether the file must be rewritten or moved aside. */
export function parseSessionIndex(text: string | null): {
  index: SessionIndex;
  problem: IndexProblem;
} {
  if (text === null) return { index: emptyIndex(), problem: null };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { index: emptyIndex(), problem: 'damaged' };
  }
  if (!isPlain(raw) || raw['version'] !== 1 || !Array.isArray(raw['tabs'])) {
    return { index: emptyIndex(), problem: 'damaged' };
  }
  const tabs: IndexTab[] = [];
  for (const entry of raw['tabs']) {
    if (!isPlain(entry) || !isUuid(entry['id'])) continue;
    const id = entry['id'];
    if (tabs.some((t) => t.id === id)) continue;
    tabs.push(tabOf(entry, id));
  }
  const index: SessionIndex = {
    version: 1,
    tabs,
    active: activeOf(raw['active'], tabs),
    discarded: discardedOf(Array.isArray(raw['discarded']) ? raw['discarded'] : [], tabs),
  };
  // Any repair or dropped key shows as a difference from the canonical form of what was read.
  const same = canonical(raw) === canonical(index);
  return { index, problem: same ? null : 'repaired' };
}

/** JSON with object keys sorted, so key order alone never counts as a repair. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    isPlain(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v,
  );
}

export function serializeSessionIndex(index: SessionIndex): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}

const rendererTabOf = (tab: RendererTab): RendererTab => ({
  id: tab.id,
  kind: tab.kind,
  name: tab.name,
  view: copyView(tab.view),
  unsaved: tab.unsaved,
  warning: tab.warning,
});

const mainOf = (fields: MainTabFields): MainTabFields => ({
  path: fields.path,
  fileHash: fields.fileHash,
  written: fields.written,
  writing: fields.writing,
});

/**
 * N8: order, kinds, names, views, markers, active and newly closed tabs from the renderer; paths
 * and hashes only from `mainFieldsOf` (the tab registry). Each field is copied by name, so extra
 * keys on a renderer object never reach the index. `discarded` keeps every id not yet deleted and
 * never takes back an id in `deleted` (its record is gone; ids are never reused).
 */
export function mergeRendererIndex(
  index: SessionIndex,
  update: RendererIndexUpdate,
  mainFieldsOf: (tabId: string) => MainTabFields,
  deleted: ReadonlySet<string>,
): SessionIndex {
  const tabs: IndexTab[] = [];
  for (const tab of update.tabs) {
    if (tabs.some((t) => t.id === tab.id)) continue;
    tabs.push({
      id: tab.id,
      kind: tab.kind,
      name: tab.name,
      view: viewOf(tab.view),
      unsaved: tab.unsaved,
      warning: tab.warning,
      ...mainOf(mainFieldsOf(tab.id)),
    });
  }
  return {
    version: 1,
    tabs,
    active: activeOf(update.active, tabs),
    discarded: discardedOf([...index.discarded, ...update.discarded], tabs).filter(
      (id) => !deleted.has(id),
    ),
  };
}

/** The index with every tab's paths and hashes refreshed from main (after a bind or a write). */
export function withMainFields(
  index: SessionIndex,
  mainFieldsOf: (tabId: string) => MainTabFields,
): SessionIndex {
  return {
    ...index,
    tabs: index.tabs.map((tab) => ({ ...tab, ...mainOf(mainFieldsOf(tab.id)) })),
    discarded: [...index.discarded],
  };
}

/** The index once the records of `ids` are deleted (or found gone): they leave `discarded`. */
export function withoutDiscarded(index: SessionIndex, ids: readonly string[]): SessionIndex {
  const gone = new Set(ids);
  return {
    ...index,
    tabs: [...index.tabs],
    discarded: index.discarded.filter((id) => !gone.has(id)),
  };
}

/** SS7 / I7: tabs and active without paths, hashes or discarded ids; null when there is no tab. */
export function rendererSession(index: SessionIndex): RendererSession | null {
  if (index.active === null || index.tabs.length === 0) return null;
  return { tabs: index.tabs.map(rendererTabOf), active: index.active };
}

/** `userData/session/tabs/<id>.json`. */
export function recordFileName(tabId: string): string {
  return `${tabId}.json`;
}

/** The tab id of a record file name, or null for any other name (temp files included). */
export function recordIdOf(fileName: string): string | null {
  if (!fileName.endsWith('.json')) return null;
  const id = fileName.slice(0, -'.json'.length);
  return isUuid(id) ? id : null;
}

/** SS11: which records are listed, discarded or orphans. A damaged index lists nothing. */
export function classifyRecords(
  fileNames: readonly string[],
  index: SessionIndex,
): RecordClassification {
  const present = new Set<string>();
  const ignored: string[] = [];
  for (const name of fileNames) {
    const id = recordIdOf(name);
    if (id === null) ignored.push(name);
    else present.add(id);
  }
  const listedIds = new Set(index.tabs.map((t) => t.id));
  const discardedIds = new Set(index.discarded);
  return {
    listed: index.tabs.filter((t) => present.has(t.id)).map((t) => t.id),
    discarded: index.discarded.filter((id) => present.has(id)),
    orphans: [...present].filter((id) => !listedIds.has(id) && !discardedIds.has(id)).sort(),
    missing: index.tabs.filter((t) => !present.has(t.id)).map((t) => t.id),
    staleDiscarded: index.discarded.filter((id) => !present.has(id)),
    ignored,
  };
}

/**
 * SS11: orphan records (or every record, after a damaged index) appended as `kept` tabs named from
 * their records, unsaved, without a path. An id already listed or discarded is not added.
 */
export function withOrphans(
  index: SessionIndex,
  orphans: readonly { id: string; name: string }[],
): SessionIndex {
  const tabs = [...index.tabs];
  const discarded = new Set(index.discarded);
  for (const { id, name } of orphans) {
    if (discarded.has(id) || tabs.some((t) => t.id === id)) continue;
    tabs.push({
      id,
      kind: 'kept',
      name: nameOf(name),
      path: null,
      fileHash: null,
      written: null,
      writing: null,
      unsaved: true,
      warning: false,
      view: null,
    });
  }
  return { ...index, tabs, active: activeOf(index.active, tabs), discarded: [...index.discarded] };
}

/**
 * The part of a tab record main reads (SS11: a record that is not an envelope is moved aside;
 * an orphan is named from its record). The renderer parses the rest strictly.
 */
export function parseRecordEnvelope(text: string): { name: string; kind: TabKind } | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isPlain(raw) || raw['format'] !== 'chalkbond-tab' || raw['version'] !== 1) return null;
  const { name, kind } = raw;
  if (typeof name !== 'string' || name.length > MAX_TAB_NAME) return null;
  if (!isKind(kind) || !isPlain(raw['editor'])) return null;
  return { name, kind };
}
