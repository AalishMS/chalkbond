// File I/O (SPEC-app-shell.md SEC7 reads, SEC8 + F9 atomic writes). Main parses nothing beyond
// size and signature (SEC9); the renderer decides what the bytes mean.
import { randomBytes } from 'node:crypto';
import { open, readFile, rename as fsRename, stat, unlink } from 'node:fs/promises';
import type { ReadProblem, WriteFileResponse } from '../shared/ipc-types';
import { kindOfPath, type FileEntry, type FileKind } from './model/file-refs';
import { readProblem, writeProblem } from './model/write-problem';

/** clipboard-export `MAX_FILE_BYTES`: the largest drawing file main reads (SEC7). */
export const MAX_READ_BYTES = 20 * 1024 * 1024;
/** The largest file main writes (SEC8). */
export const MAX_WRITE_BYTES = 64 * 1024 * 1024;
/** F9: a rename that meets EBUSY / EPERM (a virus scanner, an indexer) is retried 3 × 100 ms. */
const RENAME_RETRIES = 3;
const RENAME_RETRY_MS = 100;

export type ReadResult = { ok: true; bytes: Uint8Array } | { ok: false; problem: ReadProblem };

export interface FilesOptions {
  /** LG1: the full error goes to the log, never to the screen. */
  log?: (message: string) => void;
  /** Waits between rename retries; injected so tests do not wait. */
  sleep?: (ms: number) => Promise<void>;
  /** `fs.rename`; injected so tests can make it fail. */
  rename?: (from: string, to: string) => Promise<void>;
}

const SIGNATURES: Record<FileKind, readonly number[]> = {
  chalk: [0x7b], // {
  png: [137, 80, 78, 71, 13, 10, 26, 10],
  svg: [0x3c, 0x73, 0x76, 0x67], // <svg
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
};

/** SEC8: the bytes start with the signature of the ref's kind. */
function signatureMatches(kind: FileKind, data: Uint8Array): boolean {
  return SIGNATURES[kind].every((byte, i) => data[i] === byte);
}

const codeOf = (error: unknown): string | undefined =>
  error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;

export function createFiles(options: FilesOptions = {}) {
  const log = options.log ?? (() => {});
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const rename = options.rename ?? fsRename;

  async function renameWithRetries(from: string, to: string): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(from, to);
        return;
      } catch (error) {
        const code = codeOf(error);
        if (attempt >= RENAME_RETRIES || (code !== 'EBUSY' && code !== 'EPERM')) throw error;
        await sleep(RENAME_RETRY_MS);
      }
    }
  }

  return {
    /** SEC7: a regular file (links followed) with an Open extension, at most 20 MB. */
    async read(path: string): Promise<ReadResult> {
      if (kindOfPath(path) === null) return { ok: false, problem: 'unsupported' };
      try {
        const info = await stat(path);
        if (!info.isFile()) return { ok: false, problem: 'unreadable' };
        if (info.size > MAX_READ_BYTES) return { ok: false, problem: 'too-large' };
        const bytes = new Uint8Array(await readFile(path));
        // The file may have grown between stat and read.
        if (bytes.length > MAX_READ_BYTES) return { ok: false, problem: 'too-large' };
        return { ok: true, bytes };
      } catch (error) {
        log(`Read failed: ${String(error)}`);
        return { ok: false, problem: readProblem(codeOf(error)) };
      }
    },

    /**
     * SEC8 + F9. A read-only ref, bytes of another kind or more than 64 MB are refused (the call
     * rejects; the IPC wrapper logs it): the renderer never asks for that. Otherwise the bytes go
     * to `<target>.<random>.tmp` in the same folder, are synced, and the temp file is renamed over
     * the target; on any failure the temp file is removed and the target is left as it was.
     */
    async write(entry: FileEntry, data: Uint8Array): Promise<WriteFileResponse> {
      if (!entry.writable || data.length > MAX_WRITE_BYTES || !signatureMatches(entry.kind, data)) {
        throw new Error('Refused write');
      }
      const temp = `${entry.path}.${randomBytes(6).toString('hex')}.tmp`;
      let created = false;
      try {
        const handle = await open(temp, 'wx');
        created = true;
        try {
          await handle.writeFile(data);
          await handle.sync();
        } finally {
          await handle.close();
        }
        await renameWithRetries(temp, entry.path);
        return { ok: true };
      } catch (error) {
        log(`Write failed: ${String(error)}`);
        if (created) await unlink(temp).catch(() => undefined);
        return { ok: false, problem: writeProblem(codeOf(error)) };
      }
    },
  };
}
export type Files = ReturnType<typeof createFiles>;
