// The session store (SPEC-app-shell.md SS2, SS5, SS6, SS11; SEC8, SEC9; LG1) in a temp folder:
// one ordered chain for record writes, index writes and record deletes; atomic store writes that
// never touch the previous record; the damage rule (anything unparsable moved to `damaged/`, never
// deleted); `discarded` records deleted only after a validly read index; paths built from uuids only.
import { mkdir, mkdtemp, readFile, readdir, rm, stat, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionStore, MAX_RECORD_BYTES, type SessionStoreOptions } from './session-store';

const A = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
const B = '6a1f0c2d-3b4e-4f5a-9b6c-7d8e9f0a1b2c';
const D = '9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const O = '1b2c3d4e-5f6a-4b7c-ad8e-9f0a1b2c3d4e';
const P = '2c3d4e5f-6a7b-4c8d-be9f-0a1b2c3d4e5f';
const HASH = 'a'.repeat(64);
const WRITTEN = 'b'.repeat(64);

let root = '';
let folder = '';
let tabs = '';
let damaged = '';
let logged: string[] = [];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'chalkbond-session-'));
  folder = join(root, 'session');
  tabs = join(folder, 'tabs');
  damaged = join(folder, 'damaged');
  logged = [];
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function make(options: Partial<SessionStoreOptions> = {}) {
  return createSessionStore({
    folder,
    log: (message) => logged.push(message),
    normalizePath: (path) => path.toLowerCase(),
    sleep: async () => undefined,
    ...options,
  });
}

/** A record envelope as the renderer writes it (main reads only `format`, `version`, `name`, `kind`). */
const record = (name: string, kind = 'untitled', secret = 'benzene') =>
  JSON.stringify({
    format: 'chalkbond-tab',
    version: 1,
    name,
    kind,
    edited: false,
    editor: { doc: `{"secret":"${secret}"}`, steps: [] },
  });

const tab = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'untitled',
  name: 'Untitled',
  path: null,
  fileHash: null,
  written: null,
  writing: null,
  unsaved: true,
  warning: false,
  view: null,
  ...extra,
});

const index = (value: Record<string, unknown>) => `${JSON.stringify(value, null, 2)}\n`;

async function seed(files: Record<string, string>): Promise<void> {
  for (const [name, text] of Object.entries(files)) {
    const path = join(folder, name);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, text);
  }
}
const list = async (dir: string): Promise<string[]> => (await readdir(dir).catch(() => [])).sort();
const read = (path: string) => readFile(path, 'utf8');
const readIndex = async () =>
  JSON.parse(await read(join(folder, 'index.json'))) as Record<string, unknown>;
const errno = (code: string): NodeJS.ErrnoException =>
  Object.assign(new Error(code), { code }) as NodeJS.ErrnoException;

interface Gate {
  promise: Promise<void>;
  open(): void;
}
function gate(): Gate {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

describe('first run (SS7)', () => {
  it('no index and no records: no session, and nothing is written', async () => {
    const store = make();
    expect(await store.restored()).toBeNull();
    await store.idle();
    expect(await list(root)).toEqual([]);
  });
});

describe('one ordered chain (SS5)', () => {
  it('a record write, an index write and a delete submitted together finish in arrival order', async () => {
    await seed({
      'index.json': index({ version: 1, tabs: [tab(A), tab(B)], active: A, discarded: [] }),
      [`tabs/${A}.json`]: record('Untitled'),
      [`tabs/${B}.json`]: record('Untitled 2'),
    });
    const slow = gate();
    const order: string[] = [];
    const { rename: realRename } = await import('node:fs/promises');
    const store = make({
      rename: async (from, to) => {
        if (basename(to) === `${A}.json`) await slow.promise;
        order.push(`write ${basename(to)}`);
        await realRename(from, to);
      },
      remove: async (path) => {
        order.push(`delete ${basename(path)}`);
        await rm(path, { force: true });
      },
    });
    await store.restored();
    const written = store.writeRecord({ tabId: A, text: record('Untitled', 'untitled', 'v2') });
    void store.updateIndex({
      tabs: [
        { id: A, kind: 'untitled', name: 'Untitled', view: null, unsaved: true, warning: false },
      ],
      active: A,
      discarded: [B],
    });
    void store.deleteDiscarded();
    const idle = store.idle();
    slow.open();
    await idle;
    expect(await written).toEqual({ ok: true });
    expect(order).toEqual([
      `write ${A}.json`,
      'write index.json',
      `delete ${B}.json`,
      'write index.json',
    ]);
    expect(await list(tabs)).toEqual([`${A}.json`]);
    expect(await read(join(tabs, `${A}.json`))).toContain('v2');
    expect((await readIndex())['discarded']).toEqual([]);
  });

  it('a failing task does not stop the next one', async () => {
    const { rename: realRename } = await import('node:fs/promises');
    let failRecords = true;
    const store = make({
      rename: async (from, to) => {
        if (failRecords && basename(to) === `${A}.json`) throw errno('EACCES');
        await realRename(from, to);
      },
    });
    const first = store.writeRecord({ tabId: A, text: record('Untitled') });
    void store.updateIndex({
      tabs: [
        { id: A, kind: 'untitled', name: 'Untitled', view: null, unsaved: true, warning: false },
      ],
      active: A,
      discarded: [],
    });
    await store.idle();
    expect(await first).toEqual({ ok: false, problem: 'write-denied' });
    expect((await readIndex())['tabs']).toHaveLength(1);
    failRecords = false;
    expect(await store.writeRecord({ tabId: A, text: record('Untitled') })).toEqual({ ok: true });
    for (const line of logged) expect(line).not.toContain('benzene');
  });

  it('busy while a task is queued or running; idle settles after the last one', async () => {
    const store = make();
    await store.restored();
    expect(store.busy()).toBe(false);
    void store.writeRecord({ tabId: A, text: record('Untitled') });
    expect(store.busy()).toBe(true);
    await store.idle();
    expect(store.busy()).toBe(false);
  });

  it('a task submitted before the start-up read waits for it', async () => {
    await seed({
      'index.json': index({
        version: 1,
        tabs: [tab(A, { name: 'Untitled 4' })],
        active: A,
        discarded: [],
      }),
    });
    const store = make();
    const answer = store.readRecord(A);
    void store.updateIndex({
      tabs: [
        { id: B, kind: 'untitled', name: 'Untitled', view: null, unsaved: false, warning: false },
      ],
      active: B,
      discarded: [],
    });
    expect(await store.restored()).toEqual({
      tabs: [
        { id: A, kind: 'untitled', name: 'Untitled 4', view: null, unsaved: true, warning: false },
      ],
      active: A,
    });
    expect(await answer).toEqual({ ok: false, problem: 'missing' });
    await store.idle();
    expect((await readIndex())['active']).toBe(B);
  });
});

describe('record writes (N7, SS6, F9)', () => {
  it('writes tabs/<id>.json atomically; no temp file is left', async () => {
    const store = make();
    expect(await store.writeRecord({ tabId: A, text: record('Untitled') })).toEqual({ ok: true });
    expect(await list(tabs)).toEqual([`${A}.json`]);
    expect(await read(join(tabs, `${A}.json`))).toBe(record('Untitled'));
  });

  it('a failed write (disk full, permission) keeps the previous record bytes and reports why', async () => {
    const { rename: realRename } = await import('node:fs/promises');
    let failure: string | null = null;
    const store = make({
      rename: async (from, to) => {
        if (failure !== null) throw errno(failure);
        await realRename(from, to);
      },
    });
    await store.writeRecord({ tabId: A, text: record('Untitled', 'untitled', 'v1') });
    failure = 'ENOSPC';
    expect(
      await store.writeRecord({ tabId: A, text: record('Untitled', 'untitled', 'v2') }),
    ).toEqual({
      ok: false,
      problem: 'disk-full',
    });
    failure = 'EACCES';
    expect(
      await store.writeRecord({ tabId: A, text: record('Untitled', 'untitled', 'v3') }),
    ).toEqual({
      ok: false,
      problem: 'write-denied',
    });
    expect(await read(join(tabs, `${A}.json`))).toBe(record('Untitled', 'untitled', 'v1'));
    expect(await list(tabs)).toEqual([`${A}.json`]);
  });

  it('EBUSY / EPERM on the rename are retried 3 x and then succeed', async () => {
    const { rename: realRename } = await import('node:fs/promises');
    let busy = 3;
    const store = make({
      rename: async (from, to) => {
        if (busy-- > 0) throw errno(busy % 2 === 0 ? 'EBUSY' : 'EPERM');
        await realRename(from, to);
      },
    });
    expect(await store.writeRecord({ tabId: A, text: record('Untitled') })).toEqual({ ok: true });
  });

  it('refuses a text without the "{" signature or over 64 MiB; nothing is written', async () => {
    const store = make();
    for (const text of ['[1]', ' {}', '', `{${'x'.repeat(MAX_RECORD_BYTES)}`]) {
      await expect(store.writeRecord({ tabId: A, text })).rejects.toThrow('Refused');
    }
    await store.idle();
    expect(await list(root)).toEqual([]);
  });

  it('SEC8: a tab id that is not a uuid never reaches a path', async () => {
    const touched: string[] = [];
    const store = make({
      rename: (_from, to) => {
        touched.push(to);
        return Promise.reject(errno('EIO'));
      },
      readBytes: (path) => {
        touched.push(path);
        return Promise.reject(errno('ENOENT'));
      },
    });
    await store.restored();
    touched.length = 0;
    for (const tabId of [
      '../evil',
      '..\\..\\evil',
      `${A}/../../evil`,
      'C:\\Windows\\evil',
      `${A}.json`,
      '',
      'index',
    ]) {
      await expect(store.writeRecord({ tabId, text: '{}' })).rejects.toThrow('Refused');
      await expect(store.readRecord(tabId)).rejects.toThrow('Refused');
    }
    await store.idle();
    expect(touched).toEqual([]);
    expect(await list(root)).toEqual([]);
  });

  it('a write killed halfway leaves the previous record; its temp file is ignored at start', async () => {
    await seed({
      'index.json': index({ version: 1, tabs: [tab(A)], active: A, discarded: [] }),
      [`tabs/${A}.json`]: record('Untitled', 'untitled', 'v1'),
      [`tabs/${A}.json.0a1b2c3d4e5f.tmp`]: '{"format":"chalkbond-tab","vers',
      'index.json.abcdefabcdef.tmp': '{"version":1,"ta',
    });
    const store = make();
    expect((await store.restored())?.tabs.map((t) => t.id)).toEqual([A]);
    expect(await store.readRecord(A)).toEqual({
      ok: true,
      text: record('Untitled', 'untitled', 'v1'),
    });
    await store.idle();
    expect(await list(tabs)).toEqual([`${A}.json`, `${A}.json.0a1b2c3d4e5f.tmp`]);
    expect(await list(folder)).toEqual(['index.json', 'index.json.abcdefabcdef.tmp', 'tabs']);
    expect(await list(damaged)).toEqual([]);
  });
});

describe('record reads (I11)', () => {
  it('answers the text, missing, too-large or unreadable', async () => {
    await seed({
      // Listed, so the start-up read leaves them alone (an orphan over 64 MiB would be moved aside).
      'index.json': index({ version: 1, tabs: [tab(A), tab(B), tab(D)], active: A, discarded: [] }),
      [`tabs/${A}.json`]: record('Untitled'),
      [`tabs/${D}.json`]: '{',
    });
    await mkdir(join(tabs, `${B}.json`));
    await truncate(join(tabs, `${D}.json`), MAX_RECORD_BYTES + 1);
    const store = make();
    expect(await store.readRecord(A)).toEqual({ ok: true, text: record('Untitled') });
    expect(await store.readRecord(O)).toEqual({ ok: false, problem: 'missing' });
    expect(await store.readRecord(B)).toEqual({ ok: false, problem: 'unreadable' });
    expect(await store.readRecord(D)).toEqual({ ok: false, problem: 'too-large' });
  });

  it('EBUSY / EPERM are retried 3 x 100 ms, then unreadable', async () => {
    await seed({ [`tabs/${A}.json`]: record('Untitled') });
    const { readFile: realRead } = await import('node:fs/promises');
    const waits: number[] = [];
    let busy = 3;
    const store = make({
      sleep: async (ms) => {
        waits.push(ms);
      },
      readBytes: async (path) => {
        if (path.endsWith(`${A}.json`) && busy-- > 0) throw errno('EBUSY');
        return new Uint8Array(await realRead(path));
      },
    });
    expect(await store.readRecord(A)).toEqual({ ok: true, text: record('Untitled') });
    expect(waits).toEqual([100, 100, 100]);
    busy = 4;
    expect(await store.readRecord(A)).toEqual({ ok: false, problem: 'unreadable' });
  });

  it('a record without the "{" signature is moved to damaged/ and answers missing', async () => {
    await seed({ [`tabs/${A}.json`]: 'PK\u0003\u0004 benzene', [`tabs/${B}.json`]: record('x') });
    const store = make();
    expect(await store.readRecord(A)).toEqual({ ok: false, problem: 'missing' });
    expect(await list(tabs)).toEqual([`${B}.json`]);
    expect(await read(join(damaged, `${A}.json`))).toBe('PK\u0003\u0004 benzene');
    for (const line of logged) expect(line).not.toContain('benzene');
  });
});

describe('the index (N8, SS3, SS6)', () => {
  it('main keeps its paths and hashes; the renderer sets order, names, views, markers', async () => {
    const chalk = tab(A, {
      kind: 'chalk',
      name: 'ethanol',
      path: '/home/t/ethanol.chalk',
      fileHash: HASH,
      written: WRITTEN,
      unsaved: false,
    });
    await seed({ 'index.json': index({ version: 1, tabs: [chalk], active: A, discarded: [] }) });
    const store = make();
    await store.restored();
    await store.updateIndex({
      tabs: [
        { id: B, kind: 'untitled', name: 'Untitled 2', view: null, unsaved: false, warning: false },
        {
          id: A,
          kind: 'chalk',
          name: 'ethanol',
          view: { zoom: 2, centre: { x: 1, y: -2 } },
          unsaved: false,
          warning: true,
          // Extra keys a renderer might send never reach the index (the schema rejects them too).
          ...({ path: '/evil', fileHash: 'c'.repeat(64) } as object),
        },
      ],
      active: A,
      discarded: [],
    });
    expect(await readIndex()).toEqual({
      version: 1,
      tabs: [
        tab(B, { name: 'Untitled 2', unsaved: false }),
        { ...chalk, view: { zoom: 2, centre: { x: 1, y: -2 } }, warning: true },
      ],
      active: A,
      discarded: [],
    });
  });

  it('an index write that fails is logged and written again at the next change', async () => {
    const { rename: realRename } = await import('node:fs/promises');
    let fail = true;
    const store = make({
      rename: async (from, to) => {
        if (fail) throw errno('ENOSPC');
        await realRename(from, to);
      },
    });
    const update = (name: string) => ({
      tabs: [
        { id: A, kind: 'untitled' as const, name, view: null, unsaved: false, warning: false },
      ],
      active: A,
      discarded: [],
    });
    await store.updateIndex(update('Untitled'));
    expect(logged.some((line) => line.includes('index'))).toBe(true);
    await expect(stat(join(folder, 'index.json'))).rejects.toThrow();
    fail = false;
    await store.updateIndex(update('Untitled 2'));
    expect(((await readIndex())['tabs'] as { name: string }[])[0]?.name).toBe('Untitled 2');
  });

  it('a deleted record id never comes back into discarded', async () => {
    await seed({
      'index.json': index({ version: 1, tabs: [tab(A)], active: A, discarded: [D] }),
      [`tabs/${D}.json`]: record('gone'),
    });
    const store = make();
    await store.restored();
    expect(await list(tabs)).toEqual([]);
    await store.updateIndex({
      tabs: [
        { id: A, kind: 'untitled', name: 'Untitled', view: null, unsaved: true, warning: false },
      ],
      active: A,
      discarded: [D, B],
    });
    expect((await readIndex())['discarded']).toEqual([B]);
  });
});

describe('start-up read (SS11)', () => {
  const chalkFiles = {
    'ethanol.chalk': '{"schemaVersion":1}',
    'photo.png': '\u0089PNG',
    'tabs/notes.chalk': '{"schemaVersion":1}',
    [`tabs/${P}.chalk`]: '{"schemaVersion":1}',
  };
  async function expectUntouched(): Promise<void> {
    for (const [name, text] of Object.entries(chalkFiles)) {
      expect(await read(join(folder, name)), name).toBe(text);
    }
  }

  it('a valid index: tabs in order, active, views; listed records are not read', async () => {
    const view = { zoom: 1.5, centre: { x: 3, y: 4 } };
    await seed({
      'index.json': index({
        version: 1,
        tabs: [tab(A, { name: 'Untitled 2', view }), tab(B, { unsaved: false })],
        active: B,
        discarded: [],
      }),
      [`tabs/${A}.json`]: record('Untitled 2'),
      [`tabs/${B}.json`]: record('Untitled'),
    });
    const reads: string[] = [];
    const { readFile: realRead } = await import('node:fs/promises');
    const store = make({
      readBytes: async (path) => {
        reads.push(basename(path));
        return new Uint8Array(await realRead(path));
      },
    });
    expect(await store.restored()).toEqual({
      tabs: [
        { id: A, kind: 'untitled', name: 'Untitled 2', view, unsaved: true, warning: false },
        { id: B, kind: 'untitled', name: 'Untitled', view: null, unsaved: false, warning: false },
      ],
      active: B,
    });
    expect(reads).toEqual(['index.json']);
  });

  it('an unparsable index is moved to damaged/ (name kept); every record opens as kept', async () => {
    await seed({
      ...chalkFiles,
      'index.json': '{"version":1,"tabs":[{"id": broken benzene',
      [`tabs/${A}.json`]: record('ethanol', 'chalk'),
      [`tabs/${B}.json`]: record('Untitled 2'),
    });
    const store = make();
    const session = await store.restored();
    expect(await read(join(damaged, 'index.json'))).toBe(
      '{"version":1,"tabs":[{"id": broken benzene',
    );
    // Orphans come in id order (A < B).
    expect(session?.tabs.map((t) => [t.id, t.kind, t.name, t.unsaved])).toEqual([
      [A, 'kept', 'ethanol', true],
      [B, 'kept', 'Untitled 2', true],
    ]);
    expect(await list(tabs)).toEqual(
      [`${P}.chalk`, `${A}.json`, `${B}.json`, 'notes.chalk'].sort(),
    );
    expect((await readIndex())['tabs']).toHaveLength(2);
    await expectUntouched();
    expect(logged.some((line) => line.includes('damaged'))).toBe(true);
    for (const line of logged) expect(line).not.toContain('benzene');
  });

  it('an index that is JSON but not an index is damaged too; a second one keeps the first', async () => {
    await seed({ 'index.json': '[1,2]', 'damaged/index.json': 'older' });
    const store = make();
    expect(await store.restored()).toBeNull();
    expect(await list(damaged)).toEqual(['index (2).json', 'index.json']);
    expect(await read(join(damaged, 'index.json'))).toBe('older');
    expect(await read(join(damaged, 'index (2).json'))).toBe('[1,2]');
  });

  it('an unparsable record and a record that is not an envelope are moved aside; nothing else', async () => {
    await seed({
      ...chalkFiles,
      'index.json': index({ version: 1, tabs: [tab(A)], active: A, discarded: [] }),
      [`tabs/${A}.json`]: record('Untitled'),
      [`tabs/${O}.json`]: '{"format":"chalkbond-tab", broken benzene',
      [`tabs/${B}.json`]: '{"format":"other","version":1}',
    });
    const store = make();
    expect((await store.restored())?.tabs.map((t) => t.id)).toEqual([A]);
    expect(await list(damaged)).toEqual([`${B}.json`, `${O}.json`].sort());
    expect(await read(join(damaged, `${O}.json`))).toBe(
      '{"format":"chalkbond-tab", broken benzene',
    );
    expect(await read(join(tabs, `${A}.json`))).toBe(record('Untitled'));
    await expectUntouched();
    for (const line of logged) expect(line).not.toContain('benzene');
  });

  it('an orphan record opens as a kept tab at the end, named from its record', async () => {
    await seed({
      'index.json': index({ version: 1, tabs: [tab(A)], active: A, discarded: [] }),
      [`tabs/${A}.json`]: record('Untitled'),
      [`tabs/${O}.json`]: record('Untitled 3'),
    });
    const store = make();
    expect(await store.restored()).toEqual({
      tabs: [
        { id: A, kind: 'untitled', name: 'Untitled', view: null, unsaved: true, warning: false },
        { id: O, kind: 'kept', name: 'Untitled 3', view: null, unsaved: true, warning: false },
      ],
      active: A,
    });
    expect(((await readIndex())['tabs'] as { id: string }[]).map((t) => t.id)).toEqual([A, O]);
  });

  it('discarded records are deleted after a validly read index, and leave discarded', async () => {
    await seed({
      ...chalkFiles,
      'index.json': index({ version: 1, tabs: [tab(A)], active: A, discarded: [D, B] }),
      [`tabs/${A}.json`]: record('Untitled'),
      [`tabs/${D}.json`]: record('closed'),
    });
    const store = make();
    await store.restored();
    expect(await list(tabs)).toEqual([`${P}.chalk`, `${A}.json`, 'notes.chalk'].sort());
    expect((await readIndex())['discarded']).toEqual([]);
    await expectUntouched();
  });

  it('a damaged index deletes nothing: its records open as kept tabs', async () => {
    await seed({
      'index.json': `{"version":1,"tabs":[],"active":null,"discarded":["${D}"]`,
      [`tabs/${D}.json`]: record('closed'),
    });
    const store = make();
    expect((await store.restored())?.tabs.map((t) => [t.id, t.kind])).toEqual([[D, 'kept']]);
    expect(await list(tabs)).toEqual([`${D}.json`]);
    await store.deleteDiscarded();
    expect(await list(tabs)).toEqual([`${D}.json`]);
  });

  it('an index that cannot be read (EBUSY after retries) is never written and deletes nothing', async () => {
    const original = index({ version: 1, tabs: [tab(A)], active: A, discarded: [D] });
    await seed({
      'index.json': original,
      [`tabs/${A}.json`]: record('Untitled'),
      [`tabs/${D}.json`]: record('closed'),
    });
    const { readFile: realRead } = await import('node:fs/promises');
    const store = make({
      readBytes: async (path) => {
        if (path.endsWith('index.json')) throw errno('EBUSY');
        return new Uint8Array(await realRead(path));
      },
    });
    const session = await store.restored();
    expect(session?.tabs.map((t) => [t.id, t.kind])).toEqual([
      [A, 'kept'],
      [D, 'kept'],
    ]);
    await store.updateIndex({
      tabs: [
        { id: A, kind: 'untitled', name: 'Untitled', view: null, unsaved: true, warning: false },
      ],
      active: A,
      discarded: [],
    });
    await store.deleteDiscarded();
    expect(await read(join(folder, 'index.json'))).toBe(original);
    expect(await list(tabs)).toEqual([`${A}.json`, `${D}.json`].sort());
    expect(await list(damaged)).toEqual([]);
  });

  it('a repaired index is rewritten in its canonical form', async () => {
    await seed({
      'index.json': JSON.stringify({
        version: 1,
        tabs: [{ ...tab(A), extra: 1, view: { zoom: 99, centre: { x: 0, y: 0 } } }],
        active: 'nope',
        discarded: ['not-a-uuid'],
      }),
      [`tabs/${A}.json`]: record('Untitled'),
    });
    const store = make();
    await store.restored();
    expect(await readIndex()).toEqual({
      version: 1,
      tabs: [tab(A, { view: { zoom: 8, centre: { x: 0, y: 0 } } })],
      active: A,
      discarded: [],
    });
  });

  it('a listed tab without a record stays listed (the renderer reads it as missing)', async () => {
    await seed({ 'index.json': index({ version: 1, tabs: [tab(A)], active: A, discarded: [] }) });
    const store = make();
    expect((await store.restored())?.tabs.map((t) => t.id)).toEqual([A]);
    expect(await store.readRecord(A)).toEqual({ ok: false, problem: 'missing' });
  });
});

describe('the store writes only under userData/session (SS2, SEC8)', () => {
  it('writes, moves and deletes leave no other folder in userData', async () => {
    await seed({
      'index.json': '{broken',
      [`tabs/${O}.json`]: 'not a record',
    });
    const store = make();
    await store.restored();
    await store.writeRecord({ tabId: A, text: record('Untitled') });
    await store.updateIndex({
      tabs: [
        { id: A, kind: 'untitled', name: 'Untitled', view: null, unsaved: true, warning: false },
      ],
      active: A,
      discarded: [],
    });
    await store.deleteDiscarded();
    expect(await list(root)).toEqual(['session']);
    expect(await list(folder)).toEqual(['damaged', 'index.json', 'tabs']);
  });
});
