// The recovery files (SPEC-app-shell.md RC1, RC3, RC6; F9; LG1): `<userData>/recovery/drawing.chalk`
// and `recovery.json { name, savedAt }`. Writes (N3) and clears (N4) run strictly in arrival order on
// one promise chain; a failed job is logged (never the drawing) and the chain goes on. Main parses
// nothing of the drawing (SEC9): at startup it checks only the size and the `{` signature, and reads
// the metadata's name; the renderer's `parse` decides whether the drawing is usable.
import { readFile, rm, stat, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { WriteFileResponse } from '../shared/ipc-types';
import { createFiles, MAX_READ_BYTES } from './files';

export const RECOVERY_DRAWING = 'drawing.chalk';
export const RECOVERY_META = 'recovery.json';
/** When the metadata is missing or its name is not a safe base name (RC3). */
const FALLBACK_NAME = 'Untitled';

export interface RecoveryOptions {
  /** `<userData>/recovery`. */
  folder: string;
  /** LG1 (no document content). */
  log(message: string): void;
  /** ISO time for `savedAt`. */
  now(): string;
  /** An atomic write (F9; `files.write` with a `{` signature). */
  writeFile?: (path: string, bytes: Uint8Array) => Promise<WriteFileResponse>;
  /** Removes a file; a missing one is not an error. */
  remove?: (path: string) => Promise<void>;
}

const codeOf = (error: unknown): string =>
  (error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined) ??
  (error instanceof Error ? error.name : 'unknown');

/** A base name for a native box or a suggested file name: 1–255 characters, no `/` or `\`. */
const isBaseName = (name: unknown): name is string =>
  typeof name === 'string' &&
  name.length > 0 &&
  name.length <= 255 &&
  !/[/\\]/.test(name) &&
  name !== '.' &&
  name !== '..';

export function createRecovery(options: RecoveryOptions) {
  const drawingPath = join(options.folder, RECOVERY_DRAWING);
  const metaPath = join(options.folder, RECOVERY_META);
  const remove = options.remove ?? ((path: string) => rm(path, { force: true }));
  const files = createFiles({ log: () => undefined });
  const writeFile =
    options.writeFile ??
    ((path: string, bytes: Uint8Array) =>
      files.write({ path, kind: 'chalk', writable: true }, bytes));
  const encoder = new TextEncoder();
  let chain: Promise<void> = Promise.resolve();
  let queued = 0;

  /** Appends a job; the returned promise settles when it has run (it never rejects). */
  const enqueue = (job: () => Promise<void>, failure: string): Promise<void> => {
    queued++;
    const run = chain
      .then(job)
      .catch((error: unknown) => {
        options.log(`${failure}: ${codeOf(error)}`);
      })
      .finally(() => {
        queued--;
      });
    chain = run;
    return run;
  };

  const writeOne = async (path: string, text: string): Promise<void> => {
    const result = await writeFile(path, encoder.encode(text));
    if (!result.ok) throw Object.assign(new Error(result.problem), { code: result.problem });
  };

  const clearFiles = async (): Promise<void> => {
    await remove(drawingPath);
    await remove(metaPath);
  };

  return {
    /** N3 (RC1): the drawing, then its metadata, each atomically. */
    write({ text, name }: { text: string; name: string }): Promise<void> {
      return enqueue(async () => {
        await mkdir(options.folder, { recursive: true });
        await writeOne(drawingPath, text);
        await writeOne(metaPath, JSON.stringify({ name, savedAt: options.now() }));
      }, 'Recovery write failed');
    },

    /** N4 (RC2): both files go. */
    clear(): Promise<void> {
      return enqueue(clearFiles, 'Recovery clear failed');
    },

    /** Settles once every job queued so far has run (a normal close, quit). */
    idle(): Promise<void> {
      return chain;
    },

    /** A job is queued or running. */
    busy(): boolean {
      return queued > 0;
    },

    /**
     * I7 (RC3): the drawing's text and its name, or null. A drawing over 20 MiB or without the `{`
     * signature is deleted and logged; a missing or bad name becomes `Untitled`. Runs on the chain.
     */
    read(): Promise<{ text: string; name: string } | null> {
      let found: { text: string; name: string } | null = null;
      return enqueue(async () => {
        const info = await stat(drawingPath).catch(() => null);
        if (info === null || !info.isFile()) return;
        const text = info.size <= MAX_READ_BYTES ? await readFile(drawingPath, 'utf8') : '';
        if (!text.startsWith('{') || Buffer.byteLength(text, 'utf8') > MAX_READ_BYTES) {
          options.log(`Recovery file not a drawing (${info.size} bytes): deleted`);
          await clearFiles();
          return;
        }
        let name: unknown = null;
        try {
          const meta: unknown = JSON.parse(await readFile(metaPath, 'utf8'));
          if (meta !== null && typeof meta === 'object' && !Array.isArray(meta)) {
            name = (meta as { name?: unknown }).name;
          }
        } catch {
          // No metadata, or not JSON: the drawing is still offered (as Untitled).
        }
        found = { text, name: isBaseName(name) ? name : FALLBACK_NAME };
      }, 'Recovery read failed').then(() => found);
    },
  };
}
export type RecoveryFiles = ReturnType<typeof createRecovery>;
