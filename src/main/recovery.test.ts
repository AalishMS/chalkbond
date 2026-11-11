// Main recovery files (SPEC-app-shell.md RC1, RC3, RC6, F9, LG1) in a temp folder: atomic writes,
// one ordered chain for writes and clears, failures logged without the drawing, startup checks of
// size, signature and metadata only (main never parses the drawing, SEC9).
import { mkdtemp, readFile, readdir, rm, truncate, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRecovery, type RecoveryOptions } from './recovery';

const SAVED_AT = '2026-11-11T09:00:00.000Z';
let root = '';
let folder = '';
let logged: string[] = [];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'chalkbond-recovery-'));
  folder = join(root, 'recovery');
  logged = [];
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function make(options: Partial<RecoveryOptions> = {}) {
  return createRecovery({
    folder,
    now: () => SAVED_AT,
    log: (message) => logged.push(message),
    ...options,
  });
}
const files = async (): Promise<string[]> => (await readdir(folder).catch(() => [])).sort();
const drawing = (atoms: number) => `{"schemaVersion":1,"atoms":${atoms},"secret":"benzene"}`;

interface Deferred {
  promise: Promise<void>;
  resolve(): void;
}
function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('write and clear (RC1, RC6)', () => {
  it('writes drawing.chalk and recovery.json { name, savedAt }; no temp file is left', async () => {
    const recovery = make();
    await recovery.write({ text: drawing(3), name: 'esterification.chalk' });
    expect(await files()).toEqual(['drawing.chalk', 'recovery.json']);
    expect(await readFile(join(folder, 'drawing.chalk'), 'utf8')).toBe(drawing(3));
    expect(JSON.parse(await readFile(join(folder, 'recovery.json'), 'utf8'))).toEqual({
      name: 'esterification.chalk',
      savedAt: SAVED_AT,
    });
  });

  it('write then clear in quick succession leaves no file', async () => {
    const recovery = make();
    void recovery.write({ text: drawing(1), name: 'Untitled' });
    void recovery.clear();
    await recovery.idle();
    expect(await files()).toEqual([]);
  });

  it('jobs run strictly in arrival order, even when an earlier write is slow', async () => {
    const gate = deferred();
    const order: string[] = [];
    const recovery = make({
      writeFile: async (path, bytes) => {
        const text = new TextDecoder().decode(bytes);
        if (text.includes('"atoms":1')) await gate.promise;
        order.push(`${path.endsWith('.json') ? 'json' : 'chalk'} ${text.slice(0, 30)}`);
        await mkdir(folder, { recursive: true });
        await writeFile(path, bytes);
        return { ok: true };
      },
    });
    void recovery.write({ text: drawing(1), name: 'a' });
    void recovery.write({ text: drawing(2), name: 'b' });
    void recovery.clear();
    void recovery.write({ text: drawing(4), name: 'c' });
    const idle = recovery.idle();
    gate.resolve();
    await idle;
    expect(order.map((o) => o.split(' ')[0])).toEqual([
      'chalk',
      'json',
      'chalk',
      'json',
      'chalk',
      'json',
    ]);
    expect(await readFile(join(folder, 'drawing.chalk'), 'utf8')).toBe(drawing(4));
    expect(JSON.parse(await readFile(join(folder, 'recovery.json'), 'utf8')).name).toBe('c');
  });

  it('a failed write or clear is logged without the drawing and later jobs still run', async () => {
    let fail = true;
    const recovery = make({
      writeFile: async (path, bytes) => {
        if (fail) return { ok: false, problem: 'disk-full' as const };
        await mkdir(folder, { recursive: true });
        await writeFile(path, bytes);
        return { ok: true };
      },
      remove: async () => {
        if (fail) throw Object.assign(new Error('EBUSY: busy'), { code: 'EBUSY' });
      },
    });
    void recovery.write({ text: drawing(1), name: 'a' });
    void recovery.clear();
    await recovery.idle();
    fail = false;
    await recovery.write({ text: drawing(2), name: 'b' });
    expect(await readFile(join(folder, 'drawing.chalk'), 'utf8')).toBe(drawing(2));
    expect(logged).toHaveLength(2);
    for (const line of logged) {
      expect(line).not.toContain('benzene');
      expect(line).not.toContain('secret');
    }
  });

  it('a writer that throws is logged too, and the chain goes on', async () => {
    const recovery = make({
      writeFile: () => Promise.reject(new Error('boom')),
    });
    await recovery.write({ text: drawing(1), name: 'a' });
    await recovery.clear();
    expect(logged).toEqual([expect.stringContaining('Recovery write failed')]);
  });
});

describe('read at startup (RC3)', () => {
  it('nothing there → null', async () => {
    expect(await make().read()).toBeNull();
  });

  it('a written recovery reads back with its name', async () => {
    const recovery = make();
    await recovery.write({ text: drawing(3), name: 'toluene.png' });
    expect(await make().read()).toEqual({ text: drawing(3), name: 'toluene.png' });
  });

  it('missing or bad metadata: the drawing with the name "Untitled"', async () => {
    const recovery = make();
    await recovery.write({ text: drawing(3), name: 'a.chalk' });
    for (const meta of [
      null,
      'not json',
      '{"name": 3}',
      '{"name": "C:\\\\Users\\\\x\\\\a.chalk"}',
      '{"name": "../a.chalk"}',
      `{"name": "${'x'.repeat(256)}"}`,
      '{"name": ""}',
      '[]',
    ]) {
      if (meta === null) await rm(join(folder, 'recovery.json'), { force: true });
      else await writeFile(join(folder, 'recovery.json'), meta);
      expect(await make().read(), String(meta)).toEqual({ text: drawing(3), name: 'Untitled' });
    }
  });

  it('a file without the "{" signature or over 20 MiB is deleted and logged, never returned', async () => {
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'drawing.chalk'), 'PK\u0003\u0004 benzene');
    await writeFile(join(folder, 'recovery.json'), '{"name":"a"}');
    expect(await make().read()).toBeNull();
    expect(await files()).toEqual([]);
    await writeFile(join(folder, 'drawing.chalk'), '{');
    await truncate(join(folder, 'drawing.chalk'), 20 * 1024 * 1024 + 1);
    expect(await make().read()).toBeNull();
    expect(await files()).toEqual([]);
    expect(logged).toHaveLength(2);
    for (const line of logged) expect(line).not.toContain('benzene');
  });

  it('an empty file is not a drawing either', async () => {
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'drawing.chalk'), '');
    expect(await make().read()).toBeNull();
    expect(await files()).toEqual([]);
  });
});

describe('busy and idle', () => {
  it('busy while a job is queued or running; idle settles after the last one', async () => {
    const recovery = make();
    expect(recovery.busy()).toBe(false);
    void recovery.write({ text: drawing(1), name: 'a' });
    expect(recovery.busy()).toBe(true);
    await recovery.idle();
    expect(recovery.busy()).toBe(false);
  });
});
