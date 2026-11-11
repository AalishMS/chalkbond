// SEC7 reads, SEC8 + F9 atomic writes (SPEC-app-shell.md), in a real temp folder.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { open, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFiles, MAX_READ_BYTES, MAX_WRITE_BYTES } from './files';
import type { FileEntry } from './model/file-refs';

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
const CHALK = new TextEncoder().encode('{"format":"chalkbond"}');
let dir = '';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chalkbond-files-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const errno = (code: string): NodeJS.ErrnoException =>
  Object.assign(new Error(code), { code }) as NodeJS.ErrnoException;
const entry = (name: string, kind: FileEntry['kind'], writable = true): FileEntry => ({
  path: join(dir, name),
  kind,
  writable,
});
const tmpFiles = (): string[] => readdirSync(dir).filter((f) => f.endsWith('.tmp'));
const files = (over: Parameters<typeof createFiles>[0] = {}) =>
  createFiles({ log: () => {}, sleep: async () => {}, ...over });

describe('read (SEC7)', () => {
  it('returns the bytes of a regular file with an Open extension', async () => {
    await writeFile(join(dir, 'ethanol.chalk'), CHALK);
    expect(await files().read(join(dir, 'ethanol.chalk'))).toEqual({ ok: true, bytes: CHALK });
    await writeFile(join(dir, 'pic.PNG'), PNG);
    const png = await files().read(join(dir, 'pic.PNG'));
    expect(png.ok && Array.from(png.bytes)).toEqual(Array.from(PNG));
  });

  it('a missing file → missing; a missing folder → missing', async () => {
    expect(await files().read(join(dir, 'gone.chalk'))).toEqual({ ok: false, problem: 'missing' });
    expect(await files().read(join(dir, 'no', 'gone.chalk'))).toEqual({
      ok: false,
      problem: 'missing',
    });
  });

  it('a directory, or a link to one, named like a drawing → unreadable', async () => {
    mkdirSync(join(dir, 'folder.chalk'));
    expect(await files().read(join(dir, 'folder.chalk'))).toEqual({
      ok: false,
      problem: 'unreadable',
    });
    mkdirSync(join(dir, 'target'));
    symlinkSync(join(dir, 'target'), join(dir, 'link.chalk'), 'junction');
    expect(await files().read(join(dir, 'link.chalk'))).toEqual({
      ok: false,
      problem: 'unreadable',
    });
  });

  it('a 21 MB file → too-large without reading it; exactly 20 MB is read', async () => {
    expect(MAX_READ_BYTES).toBe(20 * 1024 * 1024);
    const big = await open(join(dir, 'big.chalk'), 'w');
    await big.truncate(21 * 1024 * 1024);
    await big.close();
    expect(await files().read(join(dir, 'big.chalk'))).toEqual({
      ok: false,
      problem: 'too-large',
    });
    const edge = await open(join(dir, 'edge.svg'), 'w');
    await edge.truncate(MAX_READ_BYTES);
    await edge.close();
    const read = await files().read(join(dir, 'edge.svg'));
    expect(read.ok && read.bytes.length).toBe(MAX_READ_BYTES);
  });

  it('a .exe or a name without an Open extension → unsupported, never read', async () => {
    await writeFile(join(dir, 'setup.exe'), PNG);
    await writeFile(join(dir, 'notes'), CHALK);
    for (const name of ['setup.exe', 'notes'])
      expect(await files().read(join(dir, name))).toEqual({ ok: false, problem: 'unsupported' });
  });
});

describe('write (SEC8, F9)', () => {
  it('writes a new file and replaces an existing target; no temp file is left', async () => {
    const target = entry('ethanol.chalk', 'chalk');
    expect(await files().write(target, CHALK)).toEqual({ ok: true });
    expect(readFileSync(target.path)).toEqual(Buffer.from(CHALK));
    const next = new TextEncoder().encode('{"format":"chalkbond","v":2}');
    expect(await files().write(target, next)).toEqual({ ok: true });
    expect(readFileSync(target.path)).toEqual(Buffer.from(next));
    expect(tmpFiles()).toEqual([]);
  });

  it('writes through a sibling temp file that is synced, then renamed over the target', async () => {
    const renames: [string, string][] = [];
    const real = (await import('node:fs/promises')).rename;
    const target = entry('a.png', 'png');
    await files({
      rename: async (from, to) => {
        renames.push([from, to]);
        expect(readFileSync(from)).toEqual(Buffer.from(PNG)); // complete before the rename
        await real(from, to);
      },
    }).write(target, PNG);
    expect(renames).toHaveLength(1);
    const [from, to] = renames[0] ?? ['', ''];
    expect(to).toBe(target.path);
    expect(from.startsWith(`${target.path}.`) && from.endsWith('.tmp')).toBe(true);
  });

  it('refuses a read-only ref, wrong-kind bytes and more than 64 MB (nothing is written)', async () => {
    expect(MAX_WRITE_BYTES).toBe(64 * 1024 * 1024);
    await expect(files().write(entry('photo.png', 'png', false), PNG)).rejects.toThrow(/refused/i);
    await expect(files().write(entry('ethanol.chalk', 'chalk'), PNG)).rejects.toThrow(/refused/i);
    await expect(files().write(entry('a.svg', 'svg'), CHALK)).rejects.toThrow(/refused/i);
    await expect(
      files().write(entry('a.pdf', 'pdf'), new TextEncoder().encode('%PDF')),
    ).rejects.toThrow(/refused/i);
    const huge = new Uint8Array(MAX_WRITE_BYTES + 1);
    huge.set(PNG);
    await expect(files().write(entry('a.png', 'png'), huge)).rejects.toThrow(/refused/i);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('accepts each kind with its signature: {, PNG, <svg, %PDF-', async () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    for (const [name, kind, data] of [
      ['a.chalk', 'chalk', enc('{}')],
      ['a.png', 'png', PNG],
      ['a.svg', 'svg', enc('<svg xmlns="http://www.w3.org/2000/svg"/>')],
      ['a.pdf', 'pdf', enc('%PDF-1.4\n')],
    ] as const)
      expect(await files().write(entry(name, kind), data)).toEqual({ ok: true });
  });

  it('a failed rename removes the temp file and keeps the old target', async () => {
    const target = entry('ethanol.chalk', 'chalk');
    await writeFile(target.path, CHALK);
    const log = vi.fn();
    const result = await files({
      log,
      rename: async () => {
        throw errno('EIO');
      },
    }).write(target, new TextEncoder().encode('{"new":1}'));
    expect(result).toEqual({ ok: false, problem: 'write-failed' });
    expect(tmpFiles()).toEqual([]);
    expect(readFileSync(target.path)).toEqual(Buffer.from(CHALK));
    expect(log).toHaveBeenCalled();
  });

  it('retries the rename exactly 3 × 100 ms on EBUSY / EPERM, then succeeds', async () => {
    const sleep = vi.fn(async () => {});
    const real = (await import('node:fs/promises')).rename;
    let calls = 0;
    const result = await files({
      sleep,
      rename: async (from, to) => {
        calls++;
        if (calls <= 3) throw errno(calls === 2 ? 'EPERM' : 'EBUSY');
        await real(from, to);
      },
    }).write(entry('a.chalk', 'chalk'), CHALK);
    expect(result).toEqual({ ok: true });
    expect(calls).toBe(4);
    expect(sleep.mock.calls).toEqual([[100], [100], [100]]);
  });

  it.each([
    ['EBUSY', 'busy'],
    ['EPERM', 'write-denied'],
  ] as const)('gives up after 3 retries of %s → %s, temp file removed', async (code, problem) => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const result = await files({
      sleep,
      rename: async () => {
        calls++;
        throw errno(code);
      },
    }).write(entry('a.chalk', 'chalk'), CHALK);
    expect(result).toEqual({ ok: false, problem });
    expect(calls).toBe(4);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(tmpFiles()).toEqual([]);
  });

  it('does not retry other errors', async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    await files({
      sleep,
      rename: async () => {
        calls++;
        throw errno('EACCES');
      },
    }).write(entry('a.chalk', 'chalk'), CHALK);
    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('a deleted folder → folder-gone', async () => {
    const target = { path: join(dir, 'gone', 'a.chalk'), kind: 'chalk', writable: true } as const;
    expect(await files().write(target, CHALK)).toEqual({ ok: false, problem: 'folder-gone' });
  });
});
