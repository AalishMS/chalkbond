// The session store (SPEC-app-shell.md "Session store": SS2, SS5, SS6, SS11; SEC8, SEC9; LG1).
// Owns `<userData>/session/index.json` and one record per tab, `<userData>/session/tabs/<uuid>.json`;
// unparsable files go to `<userData>/session/damaged/`, and nothing else is ever written. A tab id
// is a uuid and never part of a path otherwise. One promise chain runs every record write, index
// write, record delete, record read, tab binding (I12), auto-save write (I13) and AS5 check (I14)
// in arrival order (RC6 generalised). Every store write is F9's atomic writer from `files.ts`, so a
// failed record write never touches the previous record. Main checks a record only for its size and
// its `{` signature (SEC9); it reads a record's envelope (name, kind) only on SS11's damage path.
// The pure rules are `model/session-index.ts` and `model/tab-registry.ts`.
//
// Auto-save (TB10: AS1, AS5, AS8, AS9, SS5, SEC8): a tab's `.chalk` file is written only to the
// path bound to that tab id, only after AS5 read and hashed the file (no `stat` shortcut) and found
// it `same`, and in SS5's order: the index with `writing`, the file, the index with the written
// hash. A file whose check is not `same` is never written; it is never created, a picture is never
// written, and a path another open tab is bound to is never written.
import { mkdir, readdir, readFile, rename as fsRename, rm, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type {
  AcceptOutsideRequest,
  AutoSaveRequest,
  AutoSaveResponse,
  BindTabResponse,
  CheckTabFileResponse,
  ReadTabRecordResponse,
  WriteTabRecordRequest,
  WriteTabRecordResponse,
} from '../shared/ipc-types';
import { createFiles, MAX_READ_BYTES, sha256Hex } from './files';
import {
  classifyRecords,
  emptyIndex,
  mergeRendererIndex,
  parseRecordEnvelope,
  parseSessionIndex,
  recordFileName,
  recordIdOf,
  rendererSession,
  serializeSessionIndex,
  withMainFields,
  withOrphans,
  withoutDiscarded,
  type RendererIndexUpdate,
  type RendererSession,
  type SessionIndex,
} from './model/session-index';
import {
  acceptOutside,
  bindTab,
  checkOutcome,
  emptyRegistry,
  failWrite,
  finishWrite,
  mainFieldsOf,
  openIn,
  openTabsOf,
  registryFromIndex,
  startWrite,
  withBinding,
  withoutTabs,
  type BindRequest,
  type CheckResult,
  type NormalizePath,
  type TabBinding,
  type TabRegistry,
} from './model/tab-registry';
import type { HoldPoint } from './model/store-hold';
import { writeProblem } from './model/write-problem';

/** SS2, SEC8: the largest record main writes or reads (UTF-8 bytes). */
export const MAX_RECORD_BYTES = 64 * 1024 * 1024;
export const INDEX_FILE = 'index.json';
export const TABS_FOLDER = 'tabs';
export const DAMAGED_FOLDER = 'damaged';
/** Like F9's rename: a read that meets EBUSY / EPERM (a scanner, OneDrive) is retried 3 × 100 ms. */
const READ_RETRIES = 3;
const READ_RETRY_MS = 100;
const SIGNATURE = 0x7b; // {

export interface SessionStoreOptions {
  /** `<userData>/session`. */
  folder: string;
  /** LG1: codes and file names only, never a record's content. */
  log(message: string): void;
  /** A path's key for the tab registry (T17: case-insensitive on Windows). */
  normalizePath: NormalizePath;
  /** Waits between retries; injected so tests do not wait. */
  sleep?(ms: number): Promise<void>;
  /** F9's rename (atomic writes only); injected so tests can make a write fail. */
  rename?(from: string, to: string): Promise<void>;
  /** Deletes a discarded record; injected so tests can observe the order. */
  remove?(path: string): Promise<void>;
  /** Reads a store file; injected so tests can make a read fail. */
  readBytes?(path: string): Promise<Uint8Array>;
  /**
   * TB28, TH7: asked after a record write and after an auto-save's file write, each time it has
   * landed; the chain waits for the answer. Only a test build passes it (index.ts), so a test can
   * kill the process exactly there; production never does.
   */
  hold?(point: HoldPoint, tabId: string): Promise<void>;
}

type ReadProblem = 'missing' | 'unreadable' | 'too-large';
type StoreRead = { ok: true; text: string } | { ok: false; problem: ReadProblem };
type BytesRead = { ok: true; bytes: Uint8Array } | { ok: false; problem: ReadProblem };

/**
 * I12 with the ref resolved by the caller (paths stay in main, R8). `open`: `fileHash` is the hash
 * of the bytes the renderer was given (required for a `.chalk`); `save-as` is sent before the C4
 * write of `ref`, whose result `settleSaveAs` reports.
 */
export type StoreBindRequest =
  | {
      reason: 'open';
      tabId: string;
      path: string;
      kind: 'chalk' | 'picture';
      fileHash: string | null;
      written: string | null;
    }
  | { reason: 'save-as'; tabId: string; path: string; written: string; ref: string }
  | { reason: 'unbind'; tabId: string }
  | { reason: 'reopen'; tabId: string; from: string }
  | { reason: 'take-over'; tabId: string; from: string; written: string | null };

/** A request the renderer never makes (AS8, SEC8): refused inside the chain, so the call rejects. */
const REFUSED = Symbol('refused');
type Refused = typeof REFUSED;

const codeOf = (error: unknown): string | undefined =>
  error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;

const refused = (): Promise<never> => Promise.reject(new Error('Refused session request'));

/** SEC8: `<uuid>.json` for a uuid tab id, else null (the id never reaches `join`). */
function recordNameOf(tabId: string): string | null {
  const name = recordFileName(tabId);
  return recordIdOf(name) === tabId ? name : null;
}

export function createSessionStore(options: SessionStoreOptions) {
  const { folder, log, normalizePath } = options;
  const tabsFolder = join(folder, TABS_FOLDER);
  const damagedFolder = join(folder, DAMAGED_FOLDER);
  const indexPath = join(folder, INDEX_FILE);
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const remove = options.remove ?? ((path: string) => rm(path, { force: true }));
  const readBytes =
    options.readBytes ?? (async (path: string) => new Uint8Array(await readFile(path)));
  const files = createFiles({
    log: (message) => log(message),
    sleep,
    ...(options.rename ? { rename: options.rename } : {}),
  });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let index: SessionIndex = emptyIndex();
  let registry: TabRegistry = emptyRegistry();
  /** Records deleted this run: their ids never come back into `discarded` (ids are never reused). */
  const deleted = new Set<string>();
  /** SS11: only a validly read index lets main delete the records it lists in `discarded`. */
  let validRead = false;
  /** The index file could not be read or moved aside: it is never written this run (its bytes stay). */
  let indexLocked = false;
  /** The index text last written, so an unchanged index is not written again. */
  let lastIndexText: string | null = null;
  /**
   * AS7: the hash of the bytes each tab's last `changed` check read (and sent to the renderer).
   * N9 and `take-over` bind exactly those bytes, so a file changed again since is `changed` again.
   */
  const changedBytes = new Map<string, string>();
  /** F6: Save-as bindings waiting for the C4 write of their ref, with the binding they replaced. */
  const pendingSaveAs = new Map<
    string,
    { tabId: string; pathKey: string; previous: TabBinding | undefined }
  >();

  let chain: Promise<unknown> = Promise.resolve();
  let queued = 0;

  /** Appends a task; it settles when the task has run. A failure is logged and answers `fallback`. */
  function enqueue<T>(label: string, task: () => Promise<T>, fallback: T): Promise<T> {
    queued++;
    const run = chain
      .then(task)
      .catch((error: unknown) => {
        log(`${label} failed: ${codeOf(error) ?? 'unknown'}`);
        return fallback;
      })
      .finally(() => {
        queued--;
      });
    chain = run;
    return run;
  }

  /**
   * A file of at most `max` bytes. The file or its folder gone (`ENOENT`, `ENOTDIR`) → `missing`;
   * EBUSY / EPERM are retried 3 × 100 ms, then (like any other error) → `unreadable`, logged with
   * `what` and the code only (LG1).
   */
  async function readLimited(path: string, max: number, what: string): Promise<BytesRead> {
    for (let attempt = 0; ; attempt++) {
      try {
        const info = await stat(path);
        if (!info.isFile()) return { ok: false, problem: 'unreadable' };
        if (info.size > max) return { ok: false, problem: 'too-large' };
        const bytes = await readBytes(path);
        if (bytes.length > max) return { ok: false, problem: 'too-large' };
        return { ok: true, bytes };
      } catch (error) {
        const code = codeOf(error);
        if (code === 'ENOENT' || code === 'ENOTDIR') return { ok: false, problem: 'missing' };
        if (attempt < READ_RETRIES && (code === 'EBUSY' || code === 'EPERM')) {
          await sleep(READ_RETRY_MS);
          continue;
        }
        log(`${what} not read: ${code ?? 'unknown'}`);
        return { ok: false, problem: 'unreadable' };
      }
    }
  }

  /** A store file of at most `max` bytes as UTF-8. */
  async function readStoreFile(path: string, max: number): Promise<StoreRead> {
    const read = await readLimited(path, max, 'Session file');
    return read.ok ? { ok: true, text: decoder.decode(read.bytes) } : read;
  }

  /** `name` in `damaged/`, or `<stem> (n)<ext>` when an earlier one has it (never overwritten). */
  async function freeDamagedName(name: string): Promise<string> {
    const taken = new Set(await readdir(damagedFolder).catch(() => [] as string[]));
    if (!taken.has(name)) return name;
    const ext = extname(name);
    const stem = name.slice(0, name.length - ext.length);
    for (let n = 2; ; n++) {
      const candidate = `${stem} (${n})${ext}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  /** SS11: moves an unparsable store file to `damaged/` (never deleted); true when it moved. */
  async function moveToDamaged(path: string, name: string): Promise<boolean> {
    try {
      await mkdir(damagedFolder, { recursive: true });
      const target = await freeDamagedName(name);
      await fsRename(path, join(damagedFolder, target));
      log(`Session file damaged: ${name} moved to ${DAMAGED_FOLDER}/${target}`);
      return true;
    } catch (error) {
      log(`Session file damaged: ${name} not moved (${codeOf(error) ?? 'unknown'})`);
      return false;
    }
  }

  /** SS6: the index, atomically (F9); a failure is logged and the next change writes it again. */
  async function writeIndex(): Promise<void> {
    if (indexLocked) return;
    const text = serializeSessionIndex(index);
    if (text === lastIndexText) return;
    try {
      await mkdir(folder, { recursive: true });
    } catch (error) {
      log(`Session index not written: ${writeProblem(codeOf(error))}`);
      return;
    }
    const result = await files.write(
      { path: indexPath, kind: 'chalk', writable: true },
      encoder.encode(text),
    );
    if (result.ok) lastIndexText = text;
    else log(`Session index not written: ${result.problem}`);
  }

  /** SS4, SS5: the index with main's fields refreshed from the registry, written (F9). */
  async function persistBindings(): Promise<void> {
    index = withMainFields(index, (id) => mainFieldsOf(registry, id));
    await writeIndex();
  }

  /** T17, AS9: listed or bound tabs that are not closed. */
  const openTabs = (): Set<string> =>
    openTabsOf(
      registry,
      index.tabs.map((tab) => tab.id),
      [...index.discarded, ...deleted],
    );

  /**
   * AS5 for a chalk tab (else null): read the bound file (≤ 20 MiB) and hash it, no `stat`
   * shortcut. A file over 20 MiB cannot be one the app wrote or can open: `unreadable` (AS6,
   * retried). A promoted in-flight hash is stored and written to the index at once; the hash of
   * `changed` bytes is kept for N9 and `take-over`.
   */
  async function checkTab(
    tabId: string,
  ): Promise<{ result: CheckResult; bytes: Uint8Array | null } | null> {
    const entry = registry.get(tabId);
    if (entry?.kind !== 'chalk') return null;
    const read = await readLimited(entry.path, MAX_READ_BYTES, 'Tab file');
    const result = checkOutcome(
      entry,
      read.ok
        ? { ok: true, bytesHash: sha256Hex(read.bytes) }
        : { ok: false, problem: read.problem === 'too-large' ? 'unreadable' : read.problem },
    );
    if (result.outcome === 'changed') changedBytes.set(tabId, result.bytesHash);
    else if (result.outcome === 'same') changedBytes.delete(tabId);
    if (result.outcome !== 'same') log(`Tab file check: ${result.outcome}`);
    if (result.entry !== entry) {
      registry = withBinding(registry, tabId, result.entry);
      await persistBindings();
    }
    return { result, bytes: read.ok ? read.bytes : null };
  }

  /** I12 inside the chain: the registry transition, the index written after any change. */
  async function bindInChain(request: StoreBindRequest): Promise<BindTabResponse | Refused> {
    const { tabId } = request;
    let pure: BindRequest;
    switch (request.reason) {
      case 'open':
        if (request.kind === 'chalk' && request.fileHash === null) return REFUSED;
        pure = { ...request, fileHash: request.fileHash ?? '' };
        break;
      case 'save-as':
        pure = {
          reason: 'save-as',
          tabId,
          path: request.path,
          fileHash: request.written,
          written: request.written,
        };
        break;
      case 'take-over': {
        const fileHash = changedBytes.get(request.from);
        pure = { ...request, ...(fileHash === undefined ? {} : { fileHash }) };
        break;
      }
      default:
        pure = request;
    }
    const previous = registry.get(tabId);
    const result = bindTab(registry, pure, openTabs(), normalizePath);
    if (!result.ok) {
      if ('openIn' in result) return { ok: false, openIn: result.openIn };
      // Reopening a tab that had no file binds nothing; a take-over needs a file tab.
      return request.reason === 'reopen' ? { ok: true } : REFUSED;
    }
    registry = result.registry;
    if (request.reason === 'save-as') {
      pendingSaveAs.set(request.ref, {
        tabId,
        pathKey: normalizePath(request.path),
        previous,
      });
    }
    if (request.reason === 'take-over') changedBytes.delete(request.from);
    if (request.reason !== 'reopen') changedBytes.delete(tabId);
    await persistBindings();
    return { ok: true };
  }

  /** I13 inside the chain: AS8's refusals, AS5's check, then SS5's three steps. */
  async function autoSaveInChain(
    tabId: string,
    bytes: Uint8Array,
  ): Promise<AutoSaveResponse | Refused> {
    const entry = registry.get(tabId);
    if (entry?.kind !== 'chalk') return REFUSED;
    if (openIn(registry, entry.pathKey, openTabs(), [tabId]) !== null) return REFUSED;
    const checked = await checkTab(tabId);
    if (checked === null) return REFUSED;
    const { result } = checked;
    if (result.outcome === 'changed') {
      return { tabId, ok: false, problem: 'changed', bytes: checked.bytes ?? new Uint8Array() };
    }
    if (result.outcome !== 'same') return { tabId, ok: false, problem: result.outcome };
    const sha256 = sha256Hex(bytes);
    registry = startWrite(registry, tabId, sha256);
    await persistBindings();
    const written = await files.write(
      { path: result.entry.path, kind: 'chalk', writable: true },
      bytes,
    );
    if (written.ok) await options.hold?.('file-written', tabId);
    registry = written.ok ? finishWrite(registry, tabId, sha256) : failWrite(registry, tabId);
    await persistBindings();
    if (!written.ok) {
      log(`Auto-save not written: ${written.problem}`);
      return { tabId, ok: false, problem: written.problem };
    }
    return { tabId, ok: true, sha256 };
  }

  /** Runs a chain task whose `REFUSED` answer rejects the call (the IPC wrapper logs it). */
  function enqueueChecked<T>(label: string, task: () => Promise<T | Refused>): Promise<T> {
    return enqueue<T | Refused>(label, task, REFUSED).then((answer) =>
      answer === REFUSED ? refused() : answer,
    );
  }

  async function recordNames(): Promise<string[]> {
    try {
      return await readdir(tabsFolder);
    } catch (error) {
      const code = codeOf(error);
      if (code !== 'ENOENT') log(`Session records not listed: ${code ?? 'unknown'}`);
      return [];
    }
  }

  /**
   * SS3, SS11: deletes the records of `ids` (only ever called after a valid index read); those
   * deleted, and `stale` ids whose record is already gone, leave `discarded` for good.
   */
  async function deleteRecords(ids: readonly string[], stale: readonly string[]): Promise<boolean> {
    const gone = [...stale];
    for (const id of ids) {
      try {
        await remove(join(tabsFolder, recordFileName(id)));
        gone.push(id);
      } catch (error) {
        log(`Session record not deleted: ${codeOf(error) ?? 'unknown'}`);
      }
    }
    for (const id of gone) deleted.add(id);
    index = withoutDiscarded(index, gone);
    registry = withoutTabs(registry, gone);
    return gone.length > 0;
  }

  /** SS11: an orphan record named from its envelope, or moved aside when it is not a record. */
  async function readOrphan(id: string): Promise<{ id: string; name: string } | null> {
    const name = recordFileName(id);
    const path = join(tabsFolder, name);
    const read = await readStoreFile(path, MAX_RECORD_BYTES);
    if (!read.ok && read.problem !== 'too-large') return null; // left for a later start
    const envelope = read.ok ? parseRecordEnvelope(read.text) : null;
    if (envelope === null) {
      await moveToDamaged(path, name);
      return null;
    }
    return { id, name: envelope.name };
  }

  /**
   * The start-up read (SS7, SS11). A damaged index is moved to `damaged/` and replaced by an empty
   * one; an index that cannot be read is left as it is and not written this run. Orphan records
   * (every record, after a damaged or unreadable index) open as `kept` tabs at the end, named from
   * their records; one that is not a record is moved aside. Only after a valid read are the
   * `discarded` records deleted. Temp files of a killed write are other names: never touched.
   */
  async function start(): Promise<RendererSession | null> {
    const read = await readStoreFile(indexPath, MAX_RECORD_BYTES);
    let changed = false;
    let damaged = false;
    if (read.ok || read.problem === 'missing') {
      const parsed = parseSessionIndex(read.ok ? read.text : null);
      index = parsed.index;
      damaged = parsed.problem === 'damaged';
      changed = parsed.problem !== null;
    } else if (read.problem === 'too-large') {
      damaged = true;
    } else {
      indexLocked = true;
      log('Session index unreadable: not written this run');
    }
    if (damaged) {
      index = emptyIndex();
      if (!(await moveToDamaged(indexPath, INDEX_FILE))) indexLocked = true;
    }
    validRead = !damaged && !indexLocked;

    const sorted = classifyRecords(await recordNames(), index);
    const orphans: { id: string; name: string }[] = [];
    for (const id of sorted.orphans) {
      const orphan = await readOrphan(id);
      if (orphan !== null) orphans.push(orphan);
    }
    if (orphans.length > 0) {
      index = withOrphans(index, orphans);
      changed = true;
    }
    registry = registryFromIndex(index, normalizePath);
    if (validRead && (await deleteRecords(sorted.discarded, sorted.staleDiscarded))) changed = true;
    if (changed) await writeIndex();
    else if (read.ok && !indexLocked) lastIndexText = read.text;
    return rendererSession(index);
  }

  const started = enqueue('Session start', start, null);

  return {
    /** SS7: the index as the renderer may see it (no path, no hash), after the start-up read. */
    restored(): Promise<RendererSession | null> {
      return started;
    },

    /** I11 (SS7): a record's text, checked for size and signature only; not a record → moved aside. */
    readRecord(tabId: string): Promise<ReadTabRecordResponse> {
      const name = recordNameOf(tabId);
      if (name === null) return refused();
      const path = join(tabsFolder, name);
      return enqueue<ReadTabRecordResponse>(
        'Session record read',
        async () => {
          const read = await readStoreFile(path, MAX_RECORD_BYTES);
          if (!read.ok || read.text.charCodeAt(0) === SIGNATURE) return read;
          await moveToDamaged(path, name);
          return { ok: false, problem: 'missing' };
        },
        { ok: false, problem: 'unreadable' },
      );
    },

    /**
     * N7 (SS4, SS6): a record, atomically (F9). A text without the `{` signature or over 64 MiB,
     * or a tab id that is not a uuid, is refused before anything is queued (the call rejects).
     * A failed write keeps the previous record and answers the problem.
     */
    writeRecord({ tabId, text }: WriteTabRecordRequest): Promise<WriteTabRecordResponse> {
      const name = recordNameOf(tabId);
      if (name === null || text.length > MAX_RECORD_BYTES) return refused();
      const bytes = encoder.encode(text);
      if (bytes.length > MAX_RECORD_BYTES || bytes[0] !== SIGNATURE) return refused();
      return enqueue<WriteTabRecordResponse>(
        'Session record write',
        async () => {
          try {
            await mkdir(tabsFolder, { recursive: true });
          } catch (error) {
            return { ok: false, problem: writeProblem(codeOf(error)) };
          }
          const written = await files.write(
            { path: join(tabsFolder, name), kind: 'chalk', writable: true },
            bytes,
          );
          if (written.ok) await options.hold?.('record-written', tabId);
          return written;
        },
        { ok: false, problem: 'write-failed' },
      );
    },

    /** N8 (SS4): the renderer's fields merged with main's paths and hashes, then written. */
    updateIndex(update: RendererIndexUpdate): Promise<void> {
      return enqueue(
        'Session index update',
        async () => {
          index = mergeRendererIndex(index, update, (id) => mainFieldsOf(registry, id), deleted);
          await writeIndex();
        },
        undefined,
      );
    },

    /**
     * I12 (T12, T17, AS7, AS9, F6). Answers `{ ok: false, openIn }` when the path is bound to
     * another open tab (nothing changes, nothing is written); a `.chalk` open without the hash of
     * the bytes read, or a take-over from a tab that is not a file tab, is refused (rejects).
     */
    bind(request: StoreBindRequest): Promise<BindTabResponse> {
      if (recordNameOf(request.tabId) === null) return refused();
      return enqueueChecked('Tab bind', () => bindInChain(request));
    },

    /**
     * T17 (R37, TB12): the open tab a real path (`files.ts` `realPathOf`) is bound to, compared
     * through `normalizePath`; a picture tab is bound to its picture; a closed tab holds nothing.
     * On the chain, so a bind sent before it is seen. Reads no file.
     */
    tabOf(realPath: string): Promise<string | null> {
      return enqueue(
        'Tab lookup',
        () => Promise.resolve(openIn(registry, normalizePath(realPath), openTabs())),
        null,
      );
    },

    /**
     * F6's folder (TB20): the binding of the active tab of the index the renderer sent last (its
     * file, its picture or a kept tab's former file), or null. On the chain, so an index update
     * or a bind sent before it is seen.
     */
    activeBinding(): Promise<{ kind: TabBinding['kind']; path: string } | null> {
      return enqueue(
        'Active tab lookup',
        () => {
          const binding = index.active === null ? undefined : registry.get(index.active);
          return Promise.resolve(
            binding === undefined ? null : { kind: binding.kind, path: binding.path },
          );
        },
        null,
      );
    },

    /**
     * F6: the C4 write of a Save-as ref has finished. Success: the bytes written become the file
     * hash. Failure: the tab's previous binding comes back (a failed Save as changes nothing).
     * Answers whether `ref` was a pending Save-as (main then updates the folders and recent list).
     */
    settleSaveAs(
      ref: string,
      write: { ok: true; sha256: string } | { ok: false },
    ): Promise<boolean> {
      return enqueue(
        'Save as settle',
        async () => {
          const pending = pendingSaveAs.get(ref);
          if (pending === undefined) return false;
          pendingSaveAs.delete(ref);
          const current = registry.get(pending.tabId);
          // Bound elsewhere since (a later Save as, an unbind): that newer binding stays.
          if (current?.kind !== 'chalk' || current.pathKey !== pending.pathKey) return true;
          registry = write.ok
            ? acceptOutside(registry, pending.tabId, write.sha256, current.written ?? write.sha256)
            : withBinding(registry, pending.tabId, pending.previous);
          await persistBindings();
          return true;
        },
        false,
      );
    },

    /**
     * I13 (AS1, AS5, AS8, SS5, SEC8). A text without the `{` signature, over 20 MiB or for a tab
     * id that is not a uuid is refused before anything is queued; a tab that is not a file tab (a
     * picture, untitled, kept) or whose path another open tab is bound to is refused in the chain
     * (both reject). Every answer names `tabId`.
     */
    autoSave({ tabId, text }: AutoSaveRequest): Promise<AutoSaveResponse> {
      if (recordNameOf(tabId) === null || text.length > MAX_READ_BYTES) return refused();
      const bytes = encoder.encode(text);
      if (bytes.length > MAX_READ_BYTES || bytes[0] !== SIGNATURE) return refused();
      return enqueueChecked<AutoSaveResponse>('Auto-save', async () => {
        try {
          return await autoSaveInChain(tabId, bytes);
        } catch (error) {
          registry = failWrite(registry, tabId);
          log(`Auto-save failed: ${codeOf(error) ?? 'unknown'}`);
          return { tabId, ok: false, problem: 'write-failed' };
        }
      });
    },

    /**
     * I14 (AS5 (b), (c)): the bound file's state and the written hash, an in-flight hash promoted
     * by this check included. A tab that is not a file tab is refused (rejects). With `wantBytes`
     * (SS11, TB18) a `same` answer also carries the bytes the check hashed.
     */
    checkFile(tabId: string, wantBytes = false): Promise<CheckTabFileResponse> {
      if (recordNameOf(tabId) === null) return refused();
      return enqueueChecked<CheckTabFileResponse>('Tab file check', async () => {
        const checked = await checkTab(tabId);
        if (checked === null) return REFUSED;
        const { result } = checked;
        const written = result.entry.written;
        if (result.outcome === 'changed') {
          return { tabId, written, state: 'changed', bytes: checked.bytes ?? new Uint8Array() };
        }
        if (result.outcome === 'same' && wantBytes && checked.bytes !== null) {
          return { tabId, written, state: 'same', bytes: checked.bytes };
        }
        return { tabId, written, state: result.outcome };
      });
    },

    /**
     * N9 (AS7(a)): the changed bytes the tab's last check read become its file hash and `written`
     * its written hash. Without such a check there is nothing to accept (logged, ignored).
     */
    acceptOutside({ tabId, written }: AcceptOutsideRequest): Promise<void> {
      return enqueue(
        'Outside change accept',
        async () => {
          const bytesHash = changedBytes.get(tabId);
          if (bytesHash === undefined || registry.get(tabId)?.kind !== 'chalk') {
            log('Outside change not accepted: no changed check');
            return;
          }
          changedBytes.delete(tabId);
          registry = acceptOutside(registry, tabId, bytesHash, written);
          await persistBindings();
        },
        undefined,
      );
    },

    /**
     * SS3, SS11: deletes the records the index lists in `discarded`, only when the index was read
     * validly at start (a damaged or unreadable index deletes nothing). At start this runs by
     * itself; the window close calls it once the chain is empty (TB13).
     */
    deleteDiscarded(): Promise<void> {
      return enqueue(
        'Session record delete',
        async () => {
          if (!validRead) return;
          const sorted = classifyRecords(await recordNames(), index);
          if (await deleteRecords(sorted.discarded, sorted.staleDiscarded)) await writeIndex();
        },
        undefined,
      );
    },

    /**
     * N10 (SS11, TB15): the renderer's strict parse of this tab's record (or of its drawing)
     * failed, so its record goes to `damaged/` on the chain, after every earlier task; a record
     * already gone is logged only. A tab id that is not a uuid is logged and ignored (SEC8).
     */
    damagedRecord(tabId: string): Promise<void> {
      const name = recordNameOf(tabId);
      if (name === null) {
        log('Session record damaged: refused (not a tab id)');
        return Promise.resolve();
      }
      return enqueue(
        'Session record damaged',
        async () => {
          await moveToDamaged(join(tabsFolder, name), name);
        },
        undefined,
      );
    },

    /** Settles once every task queued so far has run (the window close, quit). */
    idle(): Promise<void> {
      return chain.then(() => undefined);
    },

    /** A task is queued or running. */
    busy(): boolean {
      return queued > 0;
    },
  };
}
export type SessionStore = ReturnType<typeof createSessionStore>;
