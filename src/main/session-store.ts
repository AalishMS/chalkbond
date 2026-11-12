// The session store (SPEC-app-shell.md "Session store": SS2, SS5, SS6, SS11; SEC8, SEC9; LG1).
// Owns `<userData>/session/index.json` and one record per tab, `<userData>/session/tabs/<uuid>.json`;
// unparsable files go to `<userData>/session/damaged/`, and nothing else is ever written. A tab id
// is a uuid and never part of a path otherwise. One promise chain runs every record write, index
// write, record delete and record read in arrival order (RC6 generalised; TB10 adds the auto-save
// write and the AS5 check to it). Every store write is F9's atomic writer from `files.ts`, so a
// failed record write never touches the previous record. Main checks a record only for its size and
// its `{` signature (SEC9); it reads a record's envelope (name, kind) only on SS11's damage path.
// The pure rules are `model/session-index.ts` and `model/tab-registry.ts`.
import { mkdir, readdir, readFile, rename as fsRename, rm, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type {
  ReadTabRecordResponse,
  WriteTabRecordRequest,
  WriteTabRecordResponse,
} from '../shared/ipc-types';
import { createFiles } from './files';
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
  withOrphans,
  withoutDiscarded,
  type RendererIndexUpdate,
  type RendererSession,
  type SessionIndex,
} from './model/session-index';
import {
  emptyRegistry,
  mainFieldsOf,
  registryFromIndex,
  withoutTabs,
  type NormalizePath,
  type TabRegistry,
} from './model/tab-registry';
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
}

type StoreRead =
  { ok: true; text: string } | { ok: false; problem: 'missing' | 'unreadable' | 'too-large' };

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

  /** A store file of at most `max` bytes as UTF-8; EBUSY / EPERM are retried 3 × 100 ms. */
  async function readStoreFile(path: string, max: number): Promise<StoreRead> {
    for (let attempt = 0; ; attempt++) {
      try {
        const info = await stat(path);
        if (!info.isFile()) return { ok: false, problem: 'unreadable' };
        if (info.size > max) return { ok: false, problem: 'too-large' };
        const bytes = await readBytes(path);
        if (bytes.length > max) return { ok: false, problem: 'too-large' };
        return { ok: true, text: decoder.decode(bytes) };
      } catch (error) {
        const code = codeOf(error);
        if (code === 'ENOENT' || code === 'ENOTDIR') return { ok: false, problem: 'missing' };
        if (attempt < READ_RETRIES && (code === 'EBUSY' || code === 'EPERM')) {
          await sleep(READ_RETRY_MS);
          continue;
        }
        log(`Session file not read: ${code ?? 'unknown'}`);
        return { ok: false, problem: 'unreadable' };
      }
    }
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
          return files.write(
            { path: join(tabsFolder, name), kind: 'chalk', writable: true },
            bytes,
          );
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
