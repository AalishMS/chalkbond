// SEC7 reads, SEC8 + F9 atomic writes (SPEC-app-shell.md), in a real temp folder.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { open, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFiles,
  MAX_PICTURE_READ_BYTES,
  MAX_READ_BYTES,
  MAX_WRITE_BYTES,
  realPathOf,
  sha256Hex,
} from './files';
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
const entry = (
  name: string,
  kind: FileEntry['kind'],
  writable = true,
): Pick<FileEntry, 'path' | 'kind' | 'writable'> => ({
  path: join(dir, name),
  kind,
  writable,
});
const tmpFiles = (): string[] => readdirSync(dir).filter((f) => f.endsWith('.tmp'));
const files = (over: Parameters<typeof createFiles>[0] = {}) =>
  createFiles({ log: () => {}, sleep: async () => {}, ...over });

describe('sha256Hex (AS5)', () => {
  it('hashes bytes to lowercase hex (known vectors)', () => {
    expect(sha256Hex(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

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

  it('pictures (.png, .svg, .pdf) may be up to 64 MiB; a .chalk stays at 20 MiB (C9)', async () => {
    expect(MAX_PICTURE_READ_BYTES).toBe(64 * 1024 * 1024);
    const sized = async (name: string, size: number) => {
      const handle = await open(join(dir, name), 'w');
      await handle.truncate(size);
      await handle.close();
      return files().read(join(dir, name));
    };
    expect(await sized('over.chalk', MAX_READ_BYTES + 1)).toEqual({
      ok: false,
      problem: 'too-large',
    });
    for (const ext of ['png', 'svg', 'pdf']) {
      const read = await sized(`big.${ext}`, 21 * 1024 * 1024);
      expect(read.ok && read.bytes.length).toBe(21 * 1024 * 1024);
      expect(await sized(`huge.${ext}`, MAX_PICTURE_READ_BYTES + 1)).toEqual({
        ok: false,
        problem: 'too-large',
      });
    }
    const edge = await sized('edge.png', MAX_PICTURE_READ_BYTES);
    expect(edge.ok && edge.bytes.length).toBe(MAX_PICTURE_READ_BYTES);
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

describe('inspect (I3 drop, SEC7)', () => {
  it('a regular file with an Open extension → its kind and base name', async () => {
    await writeFile(join(dir, 'ethanol.chalk'), CHALK);
    await writeFile(join(dir, 'pic.PDF'), PNG);
    expect(await files().inspect(join(dir, 'ethanol.chalk'))).toEqual({
      ok: true,
      kind: 'chalk',
      name: 'ethanol.chalk',
    });
    expect(await files().inspect(join(dir, 'pic.PDF'))).toEqual({
      ok: true,
      kind: 'pdf',
      name: 'pic.PDF',
    });
  });

  it('another extension, an empty path (JS-made File) or a directory → unsupported', async () => {
    await writeFile(join(dir, 'notes.docx'), CHALK);
    mkdirSync(join(dir, 'folder.chalk'));
    expect(await files().inspect(join(dir, 'notes.docx'))).toEqual({
      ok: false,
      problem: 'unsupported',
      name: 'notes.docx',
    });
    expect(await files().inspect('')).toEqual({ ok: false, problem: 'unsupported', name: '' });
    expect(await files().inspect(join(dir, 'folder.chalk'))).toEqual({
      ok: false,
      problem: 'unsupported',
      name: 'folder.chalk',
    });
  });

  it('a missing file → missing (logged)', async () => {
    const log = vi.fn();
    expect(await files({ log }).inspect(join(dir, 'gone.svg'))).toEqual({
      ok: false,
      problem: 'missing',
      name: 'gone.svg',
    });
    expect(log).toHaveBeenCalled();
  });

  it('size limits as read: .chalk 20 MiB, pictures 64 MiB', async () => {
    const sized = async (name: string, size: number): Promise<string> => {
      const handle = await open(join(dir, name), 'w');
      await handle.truncate(size);
      await handle.close();
      return join(dir, name);
    };
    expect(await files().inspect(await sized('ok.chalk', MAX_READ_BYTES))).toMatchObject({
      ok: true,
    });
    expect(await files().inspect(await sized('big.chalk', MAX_READ_BYTES + 1))).toEqual({
      ok: false,
      problem: 'too-large',
      name: 'big.chalk',
    });
    expect(await files().inspect(await sized('ok.png', MAX_PICTURE_READ_BYTES))).toMatchObject({
      ok: true,
    });
    expect(await files().inspect(await sized('big.pdf', MAX_PICTURE_READ_BYTES + 1))).toEqual({
      ok: false,
      problem: 'too-large',
      name: 'big.pdf',
    });
  });
});

describe('realPathOf (T17, R37: the path a binding is keyed by)', () => {
  it('a file reached through a linked folder is its real path; a differently-cased name is the same file', async () => {
    mkdirSync(join(dir, 'real'));
    await writeFile(join(dir, 'real', 'Ethanol.chalk'), CHALK);
    symlinkSync(join(dir, 'real'), join(dir, 'link'), 'junction');
    const real = await realpath(join(dir, 'real', 'Ethanol.chalk'));
    expect(await realPathOf(join(dir, 'link', 'Ethanol.chalk'))).toBe(real);
    // Windows: the on-disk name; elsewhere (case-sensitive) the name is kept under the real folder.
    expect(await realPathOf(join(dir, 'link', 'ETHANOL.chalk'))).toBe(
      process.platform === 'win32'
        ? real
        : join(await realpath(join(dir, 'real')), 'ETHANOL.chalk'),
    );
  });

  it('a missing file keeps its name under its real folder; a missing folder keeps the path', async () => {
    expect(await realPathOf(join(dir, 'gone.chalk'))).toBe(join(await realpath(dir), 'gone.chalk'));
    const nowhere = join(dir, 'no-folder', 'gone.chalk');
    expect(await realPathOf(nowhere)).toBe(nowhere);
  });
});
