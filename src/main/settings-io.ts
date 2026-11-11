// settings.json on disk (SPEC-app-shell.md "Settings (no UI)"): read once at start; written
// atomically (temp file in the same folder, then rename) 500 ms after the last change; flushed
// before quit. A broken or repaired file is logged and rewritten valid at once. ST4: a read that
// fails (EBUSY / EPERM after 3 × 100 ms retries, or any other error but ENOENT) runs on defaults
// in memory and never writes that file this run. The rules are the pure `model/settings.ts`.
import { randomBytes } from 'node:crypto';
import { open, readFile, rename, unlink } from 'node:fs/promises';
import { defaultSettings, parseSettings, serializeSettings, type Settings } from './model/settings';

export const SETTINGS_DELAY_MS = 500;
/** ST4 (like F9): a read that meets EBUSY / EPERM is retried 3 times, 100 ms apart. */
export const SETTINGS_READ_RETRIES = 3;
export const SETTINGS_READ_RETRY_MS = 100;

export interface SettingsStoreOptions {
  /** The absolute path of `settings.json`. */
  file: string;
  log(message: string): void;
  /** Schedules `fn` after `ms`; returns a cancel function. Default `setTimeout`. */
  setTimer?(fn: () => void, ms: number): () => void;
  /** Reads the file as UTF-8; injected so tests can make it fail. Default `fs.readFile`. */
  readText?(file: string): Promise<string>;
  /** Waits between read retries; injected so tests do not wait. */
  sleep?(ms: number): Promise<void>;
}

const codeOf = (error: unknown): unknown => (error as { code?: unknown } | null)?.code;

export function createSettingsStore({
  file,
  log,
  setTimer = defaultTimer,
  readText = (path) => readFile(path, 'utf8'),
  sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
}: SettingsStoreOptions) {
  let current: Settings = defaultSettings();
  /** ST4: the read failed; the file is never written this run (its bytes are kept). */
  let locked = false;
  let written = serializeSettings(current);
  let cancel: (() => void) | null = null;
  /** The write in progress (writes never overlap). */
  let writing: Promise<void> = Promise.resolve();

  /** Atomic write of `text`; true when it reached the file. */
  async function writeNow(text: string): Promise<boolean> {
    const temp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
    let created = false;
    try {
      const handle = await open(temp, 'wx');
      created = true;
      try {
        await handle.writeFile(text, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temp, file);
      return true;
    } catch (error) {
      log(`Settings write failed: ${String(error)}`);
      if (created) await unlink(temp).catch(() => undefined);
      return false;
    }
  }

  /** Writes the current settings if they differ from the file's; queued behind any write. */
  function save(): Promise<void> {
    cancel?.();
    cancel = null;
    writing = writing.then(async () => {
      const text = serializeSettings(current);
      if (locked || text === written) return;
      if (await writeNow(text)) written = text;
    });
    return writing;
  }

  return {
    /** Reads the file once. Missing: defaults. Broken or repaired: logged and rewritten now. */
    async load(): Promise<Settings> {
      let text: string | null = null;
      for (let attempt = 0; ; attempt++) {
        try {
          text = await readText(file);
          break;
        } catch (error) {
          const code = codeOf(error);
          if (code === 'ENOENT') break;
          if (attempt < SETTINGS_READ_RETRIES && (code === 'EBUSY' || code === 'EPERM')) {
            await sleep(SETTINGS_READ_RETRY_MS);
            continue;
          }
          log(`Settings read failed: ${String(error)}; defaults used, the file is left as it is`);
          locked = true;
          break;
        }
      }
      const { settings, problem } = parseSettings(text);
      current = settings;
      if (text !== null && problem === null) written = serializeSettings(settings);
      else written = text === null ? serializeSettings(settings) : '';
      if (problem !== null) {
        log(`Settings file ${problem}; ${problem === 'broken' ? 'defaults used' : 'fields reset'}`);
        await save();
      }
      return current;
    },
    get(): Settings {
      return current;
    },
    /** Applies a change; the file is written 500 ms after the last one that changed anything. */
    update(change: (settings: Settings) => Settings): void {
      const next = change(current);
      if (serializeSettings(next) === serializeSettings(current)) return;
      current = next;
      if (locked) return;
      cancel?.();
      cancel = setTimer(() => {
        cancel = null;
        void save();
      }, SETTINGS_DELAY_MS);
    },
    /** True while a change has not reached the file (never after a failed read: ST4). */
    pending(): boolean {
      return !locked && serializeSettings(current) !== written;
    },
    /** Writes a pending change now and waits for it (before quit). */
    flush(): Promise<void> {
      return save();
    },
  };
}
export type SettingsStore = ReturnType<typeof createSettingsStore>;

function defaultTimer(fn: () => void, ms: number): () => void {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
}
