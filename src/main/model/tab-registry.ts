// The tab registry (SPEC-app-shell.md "Tabs, auto-save and session": I12, T17, AS5, AS8, AS9,
// SS5): main's tab id -> binding. Pure and immutable: every transition returns a new registry.
// Paths stay in main (R8); the renderer names tabs by id only. Paths are compared through an
// injected key (`fs.realpath.native` then case-folded on Windows, done by the caller).
import type { MainTabFields, SessionIndex } from './session-index';

/** `path` -> the key two spellings of one file share. */
export type NormalizePath = (path: string) => string;

/** The key of a real path: case-insensitive on Windows (T17), exact elsewhere. */
export function pathKeyOf(caseInsensitive: boolean): NormalizePath {
  return caseInsensitive ? (path) => path.toLowerCase() : (path) => path;
}

/**
 * `chalk`: a file tab, auto-saved to `path`; `picture`: bound to its picture, never written (A6);
 * `former`: a kept tab's former file, kept for F6's folder only: it binds nothing.
 */
export type BindingKind = 'chalk' | 'picture' | 'former';

export interface TabBinding {
  readonly kind: BindingKind;
  readonly path: string;
  readonly pathKey: string;
  /** chalk only: SHA-256 of the file's bytes as last written or read. */
  readonly fileHash: string | null;
  /** chalk only: SHA-256 of `serialize(drawing)` for the drawing the file holds. */
  readonly written: string | null;
  /** chalk only: the hash of a write in flight (SS5). */
  readonly writing: string | null;
}

export type TabRegistry = ReadonlyMap<string, TabBinding>;

/** I12 requests, with the path main resolved from the ref and the hashes main computed. */
export type BindRequest =
  /** T17: `fileHash` of the bytes read; `written` the renderer's hash of `serialize(drawing)`. */
  | {
      reason: 'open';
      tabId: string;
      path: string;
      kind: 'chalk' | 'picture';
      fileHash: string;
      written: string | null;
    }
  /** F6: `fileHash` of the bytes written; `written` the renderer's hash. */
  | { reason: 'save-as'; tabId: string; path: string; fileHash: string; written: string }
  /** AS7: the tab keeps only its former file. */
  | { reason: 'unbind'; tabId: string }
  /** T12: the binding of the closed tab `from` moves to the fresh id `tabId`, hashes and all. */
  | { reason: 'reopen'; tabId: string; from: string }
  /**
   * AS7(c): `tabId` takes `from`'s path and file hash (or `fileHash`, the hash of the bytes the
   * changed check read, so its next check is `same`); `from` keeps only its former file.
   */
  | { reason: 'take-over'; tabId: string; from: string; fileHash?: string; written: string | null };

export type BindResult =
  | { ok: true; registry: TabRegistry }
  /** T17, AS9: the path is bound to this other open tab; nothing changed. */
  | { ok: false; openIn: string }
  /** `reopen` or `take-over` from a tab with no (file) binding; nothing changed. */
  | { ok: false; notBound: string };

/** AS5's read of the bound file: its SHA-256, or why it could not be read. */
export type FileRead =
  { ok: true; bytesHash: string } | { ok: false; problem: 'missing' | 'unreadable' };

export type CheckResult =
  | { outcome: 'same' | 'missing' | 'unreadable'; entry: TabBinding }
  | { outcome: 'changed'; entry: TabBinding; bytesHash: string };

const NO_FIELDS: MainTabFields = { path: null, fileHash: null, written: null, writing: null };

export function emptyRegistry(): TabRegistry {
  return new Map();
}

const owns = (binding: TabBinding): boolean => binding.kind !== 'former';

/**
 * T17, AS9: the open tab bound to the file with `pathKey` (a picture tab is bound to its
 * picture), or null. Closed tabs (not in `openTabs`) and former files bind nothing.
 */
export function openIn(
  registry: TabRegistry,
  pathKey: string,
  openTabs: ReadonlySet<string>,
  except: readonly string[] = [],
): string | null {
  for (const [tabId, binding] of registry) {
    if (!openTabs.has(tabId) || except.includes(tabId)) continue;
    if (owns(binding) && binding.pathKey === pathKey) return tabId;
  }
  return null;
}

const withEntry = (registry: TabRegistry, tabId: string, entry: TabBinding): TabRegistry =>
  new Map(registry).set(tabId, entry);

const formerOf = (binding: TabBinding): TabBinding => ({
  kind: 'former',
  path: binding.path,
  pathKey: binding.pathKey,
  fileHash: null,
  written: null,
  writing: null,
});

/** I12: the registry after `request`, or why it was refused (nothing changed then). */
export function bindTab(
  registry: TabRegistry,
  request: BindRequest,
  openTabs: ReadonlySet<string>,
  normalizePath: NormalizePath,
): BindResult {
  const conflict = (pathKey: string, except: readonly string[]): string | null =>
    openIn(registry, pathKey, openTabs, except);
  switch (request.reason) {
    case 'open':
    case 'save-as': {
      const pathKey = normalizePath(request.path);
      const owner = conflict(pathKey, [request.tabId]);
      if (owner !== null) return { ok: false, openIn: owner };
      const chalk = request.reason === 'save-as' || request.kind === 'chalk';
      const entry: TabBinding = {
        kind: chalk ? 'chalk' : 'picture',
        path: request.path,
        pathKey,
        fileHash: chalk ? request.fileHash : null,
        written: chalk ? request.written : null,
        writing: null,
      };
      return { ok: true, registry: withEntry(registry, request.tabId, entry) };
    }
    case 'unbind': {
      const binding = registry.get(request.tabId);
      if (binding === undefined) return { ok: true, registry };
      return { ok: true, registry: withEntry(registry, request.tabId, formerOf(binding)) };
    }
    case 'reopen': {
      const binding = registry.get(request.from);
      if (binding === undefined) return { ok: false, notBound: request.from };
      if (owns(binding)) {
        const owner = conflict(binding.pathKey, [request.tabId, request.from]);
        if (owner !== null) return { ok: false, openIn: owner };
      }
      const next = new Map(registry);
      next.delete(request.from);
      return { ok: true, registry: next.set(request.tabId, binding) };
    }
    case 'take-over': {
      const binding = registry.get(request.from);
      if (binding?.kind !== 'chalk') return { ok: false, notBound: request.from };
      const owner = conflict(binding.pathKey, [request.tabId, request.from]);
      if (owner !== null) return { ok: false, openIn: owner };
      const entry: TabBinding = {
        ...binding,
        fileHash: request.fileHash ?? binding.fileHash,
        written: request.written,
        writing: null,
      };
      const next = new Map(registry).set(request.from, formerOf(binding));
      return { ok: true, registry: next.set(request.tabId, entry) };
    }
  }
}

/** Applies `step` to a chalk binding; any other tab leaves the registry as it is. */
function onChalk(
  registry: TabRegistry,
  tabId: string,
  step: (entry: TabBinding) => TabBinding,
): TabRegistry {
  const entry = registry.get(tabId);
  return entry?.kind === 'chalk' ? withEntry(registry, tabId, step(entry)) : registry;
}

/** SS5: `writing` is set (and stored in the index) before the file is written. */
export function startWrite(registry: TabRegistry, tabId: string, sha256: string): TabRegistry {
  return onChalk(registry, tabId, (entry) => ({ ...entry, writing: sha256 }));
}

/** SS5: the write succeeded: its hash is now both the file hash and the written hash. */
export function finishWrite(registry: TabRegistry, tabId: string, sha256: string): TabRegistry {
  return onChalk(registry, tabId, (entry) => ({
    ...entry,
    fileHash: sha256,
    written: sha256,
    writing: null,
  }));
}

/** SS5: a failed or refused write clears `writing` at once. */
export function failWrite(registry: TabRegistry, tabId: string): TabRegistry {
  return onChalk(registry, tabId, (entry) => ({ ...entry, writing: null }));
}

/** N9 (AS7(a)): the file's current bytes become the file hash, `written` the written hash. */
export function acceptOutside(
  registry: TabRegistry,
  tabId: string,
  bytesHash: string,
  written: string,
): TabRegistry {
  return onChalk(registry, tabId, (entry) => ({
    ...entry,
    fileHash: bytesHash,
    written,
    writing: null,
  }));
}

/**
 * AS5: the file's bytes compared with the binding. Equal to the file hash, or to the hash of a
 * write in flight, is `same` (an in-flight hash is promoted to the file hash and the written hash,
 * so a power cut between the file write and the index write leaves no stale written hash);
 * different bytes are `changed`. Only `same` lets AS1 write (AS8). A binding without a file hash
 * (a picture, a former file) is never `same`.
 */
export function checkOutcome(entry: TabBinding, read: FileRead): CheckResult {
  if (!read.ok) return { outcome: read.problem, entry };
  if (entry.kind === 'chalk' && entry.fileHash !== null && read.bytesHash === entry.fileHash) {
    return { outcome: 'same', entry };
  }
  if (entry.kind === 'chalk' && entry.writing !== null && read.bytesHash === entry.writing) {
    const promoted: TabBinding = {
      ...entry,
      fileHash: entry.writing,
      written: entry.writing,
      writing: null,
    };
    return { outcome: 'same', entry: promoted };
  }
  return { outcome: 'changed', entry, bytesHash: read.bytesHash };
}

/** The index fields main stores for a tab (SS3); all null for a tab without a binding. */
export function mainFieldsOf(registry: TabRegistry, tabId: string): MainTabFields {
  const binding = registry.get(tabId);
  if (binding === undefined) return { ...NO_FIELDS };
  return {
    path: binding.path,
    fileHash: binding.fileHash,
    written: binding.written,
    writing: binding.writing,
  };
}

/** A restart: the bindings of a parsed index (chalk and picture tabs, a kept tab's former file). */
export function registryFromIndex(index: SessionIndex, normalizePath: NormalizePath): TabRegistry {
  const registry = new Map<string, TabBinding>();
  for (const tab of index.tabs) {
    if (tab.path === null || tab.kind === 'untitled') continue;
    const kind: BindingKind =
      tab.kind === 'chalk' ? 'chalk' : tab.kind === 'picture' ? 'picture' : 'former';
    const chalk = kind === 'chalk';
    registry.set(tab.id, {
      kind,
      path: tab.path,
      pathKey: normalizePath(tab.path),
      fileHash: chalk ? tab.fileHash : null,
      written: chalk ? tab.written : null,
      writing: chalk ? tab.writing : null,
    });
  }
  return registry;
}

/** The registry without the bindings of `tabIds` (their records are deleted, SS3). */
export function withoutTabs(registry: TabRegistry, tabIds: readonly string[]): TabRegistry {
  const next = new Map(registry);
  for (const tabId of tabIds) next.delete(tabId);
  return next;
}
