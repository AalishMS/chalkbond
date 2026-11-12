// The session store (SPEC-app-shell.md SS2, SS5, SS6, SS11; SEC8, SEC9; LG1) in a temp folder:
// one ordered chain for record writes, index writes and record deletes; atomic store writes that
// never touch the previous record; the damage rule (anything unparsable moved to `damaged/`, never
// deleted); `discarded` records deleted only after a validly read index; paths built from uuids only.
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  realpath,
  readFile,
  readdir,
  rm,
  stat,
  truncate,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { symlinkSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { realPathOf } from './files';
import { openTarget } from './model/open-requests';
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

describe('N10: a record the renderer could not parse (SS11, TB15)', () => {
  it('moves tabs/<id>.json to damaged/ (content kept, nothing logged of it); others stay', async () => {
    const broken = '{"format":"chalkbond-tab","version":1,"name":"benzene","kind":"nope"}';
    await seed({
      'index.json': index({ version: 1, tabs: [tab(A), tab(B)], active: A, discarded: [] }),
      [`tabs/${A}.json`]: broken,
      [`tabs/${B}.json`]: record('x'),
    });
    const store = make();
    await store.damagedRecord(A);
    expect(await list(tabs)).toEqual([`${B}.json`]);
    expect(await read(join(damaged, `${A}.json`))).toBe(broken);
    expect(logged.some((line) => line.includes(`${A}.json`))).toBe(true);
    for (const line of logged) expect(line).not.toContain('benzene');
  });

  it('never overwrites an earlier damaged copy of the same tab', async () => {
    await seed({
      'index.json': index({ version: 1, tabs: [tab(A)], active: A, discarded: [] }),
      [`tabs/${A}.json`]: '{"second":1}',
      [`damaged/${A}.json`]: '{"first":1}',
    });
    const store = make();
    await store.damagedRecord(A);
    expect(await list(damaged)).toEqual([`${A} (2).json`, `${A}.json`]);
    expect(await read(join(damaged, `${A}.json`))).toBe('{"first":1}');
    expect(await read(join(damaged, `${A} (2).json`))).toBe('{"second":1}');
  });

  it('a record that is already gone is logged only; nothing is created', async () => {
    const store = make();
    await store.damagedRecord(A);
    expect(await list(damaged)).toEqual([]);
    expect(await list(tabs)).toEqual([]);
    expect(logged.some((line) => line.includes(`${A}.json`))).toBe(true);
  });

  it('runs on the chain in arrival order: after an earlier write, before a later one', async () => {
    await seed({ [`tabs/${A}.json`]: record('old') });
    const store = make();
    await store.restored();
    const first = store.writeRecord({ tabId: A, text: record('first') });
    const moved = store.damagedRecord(A);
    const second = store.writeRecord({ tabId: A, text: record('second') });
    await Promise.all([first, moved, second]);
    expect(await read(join(damaged, `${A}.json`))).toBe(record('first'));
    expect(await read(join(tabs, `${A}.json`))).toBe(record('second'));
  });

  it('SEC8: a tab id that is not a uuid never reaches a path, and the call does not reject', async () => {
    await seed({ [`tabs/${A}.json`]: record('x') });
    const store = make();
    for (const id of ['../index', `${A}/..`, 'index', '']) await store.damagedRecord(id);
    expect(await list(damaged)).toEqual([]);
    expect(await list(tabs)).toEqual([`${A}.json`]);
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

// TB10: the auto-save writer (AS1, AS5, AS8, AS9, SS5, SEC8), I12-I14 and N9, on the same chain.
describe('auto-save writer (TB10)', () => {
  const C = '4d5e6f7a-8b9c-4dad-8ebf-c0d1e2f3a4b5';
  const sha = (text: string | Uint8Array): string =>
    createHash('sha256').update(text).digest('hex');
  const OLD = '{"drawing":"old"}';
  const NEW = '{"drawing":"new"}';
  const REF = '5e6f7a8b-9cad-4ebf-8fc0-d1e2f3a4b5c6';
  let docs = '';
  let ester = '';

  beforeEach(async () => {
    docs = join(root, 'docs');
    ester = join(docs, 'Esterification.chalk');
    await mkdir(docs, { recursive: true });
    await writeFile(ester, OLD);
  });

  const listed = (id: string, kind = 'chalk') => ({
    id,
    kind: kind as 'chalk',
    name: 'Esterification.chalk',
    view: null,
    unsaved: false,
    warning: false,
  });

  /** A started store with tab `id` listed and bound to `path` as opened (file hash = written). */
  async function openTab(
    options: Partial<SessionStoreOptions> = {},
    id = A,
    path = ester,
    others: string[] = [],
  ) {
    const store = make(options);
    await store.restored();
    await store.updateIndex({
      tabs: [listed(id), ...others.map((o) => listed(o))],
      active: id,
      discarded: [],
    });
    const text = await read(path);
    expect(
      await store.bind({
        reason: 'open',
        tabId: id,
        path,
        kind: 'chalk',
        fileHash: sha(text),
        written: sha(text),
      }),
    ).toEqual({ ok: true });
    return store;
  }

  const indexTab = async (id: string) =>
    ((await readIndex())['tabs'] as Record<string, unknown>[]).find((t) => t['id'] === id);

  it('AS1: a same file is written atomically; the answer names the tab and the hash (AS3)', async () => {
    const store = await openTab();
    expect(await store.autoSave({ tabId: A, text: NEW })).toEqual({
      tabId: A,
      ok: true,
      sha256: sha(NEW),
    });
    expect(await read(ester)).toBe(NEW);
    expect(await list(docs)).toEqual(['Esterification.chalk']);
    expect(await indexTab(A)).toMatchObject({
      path: ester,
      fileHash: sha(NEW),
      written: sha(NEW),
      writing: null,
    });
    // The next write checks against the new hash: still ours.
    expect(await store.autoSave({ tabId: A, text: OLD })).toMatchObject({ ok: true });
    expect(await read(ester)).toBe(OLD);
  });

  it('SS5: record, index with `writing`, file, index with the written hash, in that order', async () => {
    const steps: { to: string; writing?: unknown; written?: unknown }[] = [];
    const { rename: realRename } = await import('node:fs/promises');
    const store = await openTab({
      rename: async (from, to) => {
        await realRename(from, to);
        const name = basename(to);
        if (name !== 'index.json') return void steps.push({ to: name });
        const tabsNow = JSON.parse(await read(to))['tabs'] as Record<string, unknown>[];
        steps.push({
          to: name,
          writing: tabsNow[0]?.['writing'],
          written: tabsNow[0]?.['written'],
        });
      },
    });
    steps.length = 0;
    const recordWrite = store.writeRecord({
      tabId: A,
      text: record('Esterification.chalk', 'chalk'),
    });
    const save = store.autoSave({ tabId: A, text: NEW });
    await Promise.all([recordWrite, save]);
    expect(steps).toEqual([
      { to: `${A}.json` },
      { to: 'index.json', writing: sha(NEW), written: sha(OLD) },
      { to: 'Esterification.chalk' },
      { to: 'index.json', writing: null, written: sha(NEW) },
    ]);
  });

  it('item (5): killed between the file write and the index write, a restart finds the in-flight text `same` and promotes it', async () => {
    const { rename: realRename } = await import('node:fs/promises');
    let fileWritten = false;
    const store = await openTab({
      rename: async (from, to) => {
        // The power cut: nothing after the file's rename ever runs.
        if (fileWritten && basename(to) === 'index.json') return new Promise<void>(() => {});
        await realRename(from, to);
        if (to === ester) fileWritten = true;
      },
    });
    void store.autoSave({ tabId: A, text: NEW });
    await expect.poll(() => fileWritten).toBe(true);
    expect(await read(ester)).toBe(NEW);
    expect(await indexTab(A)).toMatchObject({ fileHash: sha(OLD), writing: sha(NEW) });

    const restarted = make();
    await restarted.restored();
    expect(await restarted.checkFile(A)).toEqual({ tabId: A, written: sha(NEW), state: 'same' });
    expect(await indexTab(A)).toMatchObject({
      fileHash: sha(NEW),
      written: sha(NEW),
      writing: null,
    });
    // No false conflict: the next write goes through.
    expect(await restarted.autoSave({ tabId: A, text: OLD })).toMatchObject({ ok: true });
  });

  it('item (5): killed before the file write, the file keeps the written text and is `same`', async () => {
    const { rename: realRename } = await import('node:fs/promises');
    let indexWrites = 0;
    const store = await openTab({
      rename: async (from, to) => {
        if (to === ester) return new Promise<void>(() => {});
        await realRename(from, to);
        if (basename(to) === 'index.json') indexWrites++;
      },
    });
    const before = indexWrites;
    void store.autoSave({ tabId: A, text: NEW });
    await expect.poll(() => indexWrites).toBe(before + 1);
    const restarted = make();
    await restarted.restored();
    expect(await read(ester)).toBe(OLD);
    expect(await restarted.checkFile(A)).toEqual({ tabId: A, written: sha(OLD), state: 'same' });
  });

  it('AS5: a change of the same size and the same modified time is `changed` (FAT32, Explorer copies)', async () => {
    const store = await openTab();
    // FAT32 keeps modified times in 2 s steps: the outside copy lands on the same time.
    const time = new Date('2026-11-12T08:00:00Z');
    await utimes(ester, time, time);
    const before = await stat(ester);
    const outside = '{"drawing":"oth"}';
    expect(outside.length).toBe(OLD.length);
    await writeFile(ester, outside);
    await utimes(ester, time, time);
    const after = await stat(ester);
    expect([after.size, after.mtimeMs]).toEqual([before.size, before.mtimeMs]);
    const check = await store.checkFile(A);
    expect(check).toMatchObject({ tabId: A, written: sha(OLD), state: 'changed' });
    expect(new TextDecoder().decode((check as { bytes: Uint8Array }).bytes)).toBe(outside);
    // AS8: a write over the changed file is refused and its bytes stay.
    const save = await store.autoSave({ tabId: A, text: NEW });
    expect(save).toMatchObject({ tabId: A, ok: false, problem: 'changed' });
    expect(new TextDecoder().decode((save as { bytes: Uint8Array }).bytes)).toBe(outside);
    expect(await read(ester)).toBe(outside);
    expect(await indexTab(A)).toMatchObject({ fileHash: sha(OLD), writing: null });
  });

  it('AS5: an equal file is `same`', async () => {
    const store = await openTab();
    expect(await store.checkFile(A)).toEqual({ tabId: A, written: sha(OLD), state: 'same' });
  });

  it('AS5: a missing file, then a missing folder, is `missing`; the file is never created (AS8)', async () => {
    const store = await openTab();
    await rm(ester);
    expect(await store.checkFile(A)).toEqual({ tabId: A, written: sha(OLD), state: 'missing' });
    expect(await store.autoSave({ tabId: A, text: NEW })).toEqual({
      tabId: A,
      ok: false,
      problem: 'missing',
    });
    expect(await list(docs)).toEqual([]);
    await rm(docs, { recursive: true });
    expect(await store.autoSave({ tabId: A, text: NEW })).toEqual({
      tabId: A,
      ok: false,
      problem: 'missing',
    });
    expect(await list(root)).toEqual(['session']);
    // The stick comes back: `same` again, and the write goes through.
    await mkdir(docs);
    await writeFile(ester, OLD);
    expect(await store.autoSave({ tabId: A, text: NEW })).toMatchObject({ ok: true });
  });

  it('AS5: EBUSY / EPERM are retried 3 × 100 ms, then `unreadable`; a lock that clears is `same`', async () => {
    const waits: number[] = [];
    let attempts = 0;
    let failures = Infinity;
    const store = await openTab({
      sleep: async (ms) => void waits.push(ms),
      readBytes: async (path) => {
        if (path === ester && attempts++ < failures) throw errno(attempts % 2 ? 'EBUSY' : 'EPERM');
        return new Uint8Array(await readFile(path));
      },
    });
    expect(await store.autoSave({ tabId: A, text: NEW })).toEqual({
      tabId: A,
      ok: false,
      problem: 'unreadable',
    });
    expect(attempts).toBe(4);
    expect(waits).toEqual([100, 100, 100]);
    expect(await read(ester)).toBe(OLD);
    attempts = 0;
    failures = 2;
    expect(await store.checkFile(A)).toMatchObject({ state: 'same' });
    expect(logged.join('\n')).toContain('Tab file not read: EPERM');
  });

  it('AS5: a file over 20 MiB is `unreadable` and never written', async () => {
    const store = await openTab();
    await truncate(ester, 20 * 1024 * 1024 + 1);
    expect(await store.autoSave({ tabId: A, text: NEW })).toEqual({
      tabId: A,
      ok: false,
      problem: 'unreadable',
    });
    expect((await stat(ester)).size).toBe(20 * 1024 * 1024 + 1);
  });

  it('AS8: a picture tab and an untitled tab are refused; nothing is written', async () => {
    const png = join(docs, 'ethanol.png');
    await writeFile(png, 'PNG');
    const store = make();
    await store.restored();
    await store.updateIndex({
      tabs: [listed(A, 'picture'), listed(B, 'untitled')],
      active: A,
      discarded: [],
    });
    expect(
      await store.bind({
        reason: 'open',
        tabId: A,
        path: png,
        kind: 'picture',
        fileHash: null,
        written: null,
      }),
    ).toEqual({ ok: true });
    await expect(store.autoSave({ tabId: A, text: NEW })).rejects.toThrow();
    await expect(store.autoSave({ tabId: B, text: NEW })).rejects.toThrow();
    await expect(store.checkFile(A)).rejects.toThrow();
    await expect(store.checkFile(B)).rejects.toThrow();
    expect(await read(png)).toBe('PNG');
    expect(await list(docs)).toEqual(['Esterification.chalk', 'ethanol.png']);
    // A `.chalk` open without the hash of the bytes read is refused too.
    await expect(
      store.bind({
        reason: 'open',
        tabId: B,
        path: ester,
        kind: 'chalk',
        fileHash: null,
        written: null,
      }),
    ).rejects.toThrow();
  });

  it('AS9 (I12 `openIn`): a path bound to another open tab is refused, case-insensitively, and nothing changes', async () => {
    const store = await openTab({}, A, ester, [B]);
    const other = join(docs, 'other.chalk');
    await writeFile(other, OLD);
    expect(
      await store.bind({
        reason: 'open',
        tabId: B,
        path: other,
        kind: 'chalk',
        fileHash: sha(OLD),
        written: sha(OLD),
      }),
    ).toEqual({ ok: true });
    const indexBefore = await read(join(folder, 'index.json'));
    expect(
      await store.bind({
        reason: 'save-as',
        tabId: B,
        path: ester.toUpperCase(),
        written: sha(NEW),
        ref: REF,
      }),
    ).toEqual({ ok: false, openIn: A });
    expect(await read(join(folder, 'index.json'))).toBe(indexBefore);
    expect(await read(ester)).toBe(OLD);
    // B still auto-saves to its own file.
    expect(await store.autoSave({ tabId: B, text: NEW })).toMatchObject({ ok: true });
    expect(await read(other)).toBe(NEW);
    expect(await read(ester)).toBe(OLD);
  });

  it('AS8: a path that two restored tabs are bound to is never written', async () => {
    await seed({
      'index.json': index({
        version: 1,
        tabs: [
          tab(A, { kind: 'chalk', path: ester, fileHash: sha(OLD), written: sha(OLD) }),
          tab(B, { kind: 'chalk', path: ester, fileHash: sha(OLD), written: sha(OLD) }),
        ],
        active: A,
        discarded: [],
      }),
    });
    const store = make();
    await store.restored();
    await expect(store.autoSave({ tabId: A, text: NEW })).rejects.toThrow();
    expect(await read(ester)).toBe(OLD);
  });

  it('AS7(c) take-over: the new tab gets the path and the changed bytes as its file hash; the old tab is unbound', async () => {
    const store = await openTab({}, A, ester, [C]);
    const outside = '{"drawing":"outside"}';
    await writeFile(ester, outside);
    expect(await store.autoSave({ tabId: A, text: NEW })).toMatchObject({ problem: 'changed' });
    expect(
      await store.bind({ reason: 'take-over', tabId: C, from: A, written: sha(outside) }),
    ).toEqual({ ok: true });
    expect(await indexTab(C)).toMatchObject({
      path: ester,
      fileHash: sha(outside),
      written: sha(outside),
      writing: null,
    });
    expect(await indexTab(A)).toMatchObject({ path: ester, fileHash: null, written: null });
    await expect(store.autoSave({ tabId: A, text: NEW })).rejects.toThrow();
    expect(await store.autoSave({ tabId: C, text: NEW })).toMatchObject({ tabId: C, ok: true });
    expect(await read(ester)).toBe(NEW);
    // A take-over from a tab that is no longer a file tab is refused.
    await expect(
      store.bind({ reason: 'take-over', tabId: B, from: A, written: null }),
    ).rejects.toThrow();
  });

  it("T12 reopen: the closed tab's binding moves to the fresh id, hashes and all; an untitled reopen binds nothing", async () => {
    const store = await openTab();
    expect(await store.autoSave({ tabId: A, text: NEW })).toMatchObject({ ok: true });
    await store.updateIndex({ tabs: [listed(B, 'untitled')], active: B, discarded: [A] });
    // A closed tab binds nothing: its path can be opened again.
    expect(await store.bind({ reason: 'reopen', tabId: C, from: A })).toEqual({ ok: true });
    await store.updateIndex({
      tabs: [listed(B, 'untitled'), listed(C)],
      active: C,
      discarded: [A],
    });
    expect(await indexTab(C)).toMatchObject({ fileHash: sha(NEW), written: sha(NEW) });
    expect(await store.checkFile(C)).toEqual({ tabId: C, written: sha(NEW), state: 'same' });
    expect(await store.bind({ reason: 'reopen', tabId: D, from: B })).toEqual({ ok: true });
    await expect(store.checkFile(D)).rejects.toThrow();
  });

  it('N9 (AS7(a)): the changed bytes become the file hash and `written` the written hash', async () => {
    const store = await openTab();
    const outside = '{"drawing":"outside"}';
    await writeFile(ester, outside);
    expect(await store.checkFile(A)).toMatchObject({ state: 'changed' });
    await store.acceptOutside({ tabId: A, written: sha('{"serialized":1}') });
    expect(await indexTab(A)).toMatchObject({
      fileHash: sha(outside),
      written: sha('{"serialized":1}'),
    });
    expect(await store.autoSave({ tabId: A, text: NEW })).toMatchObject({ ok: true });
    // Without a changed check there is nothing to accept.
    await store.acceptOutside({ tabId: A, written: sha(OLD) });
    expect(await indexTab(A)).toMatchObject({ written: sha(NEW) });
    expect(logged).toContain('Outside change not accepted: no changed check');
  });

  it('N9 binds the bytes the check read: a file changed again since stays `changed`', async () => {
    const store = await openTab();
    await writeFile(ester, '{"drawing":"first"}');
    expect(await store.checkFile(A)).toMatchObject({ state: 'changed' });
    await writeFile(ester, '{"drawing":"second"}');
    await store.acceptOutside({ tabId: A, written: sha('{"drawing":"first"}') });
    expect(await store.autoSave({ tabId: A, text: NEW })).toMatchObject({ problem: 'changed' });
    expect(await read(ester)).toBe('{"drawing":"second"}');
  });

  it('every failed write maps through write-problem, clears `writing` and keeps the file', async () => {
    const cases: [string, string][] = [
      ['EACCES', 'write-denied'],
      ['ENOSPC', 'disk-full'],
      ['EBUSY', 'busy'],
      ['ENOENT', 'folder-gone'],
      ['EIO', 'write-failed'],
    ];
    const { rename: realRename } = await import('node:fs/promises');
    let failWith: string | null = null;
    const store = await openTab({
      rename: async (from, to) => {
        if (to === ester && failWith !== null) throw errno(failWith);
        await realRename(from, to);
      },
    });
    for (const [code, problem] of cases) {
      failWith = code;
      expect(await store.autoSave({ tabId: A, text: NEW })).toEqual({
        tabId: A,
        ok: false,
        problem,
      });
      expect(await read(ester)).toBe(OLD);
      expect(await list(docs)).toEqual(['Esterification.chalk']);
      expect(await indexTab(A)).toMatchObject({ fileHash: sha(OLD), writing: null });
    }
    failWith = null;
    expect(await store.autoSave({ tabId: A, text: NEW })).toMatchObject({ ok: true });
  });

  it('SEC8: a text without a leading "{", over 20 MiB, or a tab id that is not a uuid is refused', async () => {
    const store = await openTab();
    await expect(store.autoSave({ tabId: A, text: '[1]' })).rejects.toThrow();
    await expect(store.autoSave({ tabId: A, text: ' {}' })).rejects.toThrow();
    await expect(
      store.autoSave({ tabId: A, text: `{${'x'.repeat(20 * 1024 * 1024)}` }),
    ).rejects.toThrow();
    await expect(
      store.autoSave({ tabId: A, text: `{${'é'.repeat(10 * 1024 * 1024)}` }),
    ).rejects.toThrow();
    await expect(store.autoSave({ tabId: '../x', text: NEW })).rejects.toThrow();
    await expect(store.checkFile('../x')).rejects.toThrow();
    await expect(store.bind({ reason: 'unbind', tabId: 'x' })).rejects.toThrow();
    expect(await read(ester)).toBe(OLD);
  });

  it('F6 Save as: bound before the write; a successful write binds its bytes, a failed one puts the old binding back', async () => {
    const store = await openTab();
    const saved = join(docs, 'copy.chalk');
    expect(
      await store.bind({ reason: 'save-as', tabId: A, path: saved, written: sha(NEW), ref: REF }),
    ).toEqual({ ok: true });
    expect(await indexTab(A)).toMatchObject({ path: saved, written: sha(NEW) });
    await writeFile(saved, NEW);
    expect(await store.settleSaveAs(REF, { ok: true, sha256: sha(NEW) })).toBe(true);
    expect(await indexTab(A)).toMatchObject({ path: saved, fileHash: sha(NEW), written: sha(NEW) });
    expect(await store.autoSave({ tabId: A, text: OLD })).toMatchObject({ ok: true });
    expect(await read(saved)).toBe(OLD);
    // Settled once only; an unknown ref is not a Save as.
    expect(await store.settleSaveAs(REF, { ok: false })).toBe(false);

    const second = '6f7a8b9c-adbe-4fc0-9d1e-2f3a4b5c6d7e';
    const failed = join(docs, 'failed.chalk');
    expect(
      await store.bind({
        reason: 'save-as',
        tabId: A,
        path: failed,
        written: sha(OLD),
        ref: second,
      }),
    ).toEqual({ ok: true });
    expect(await store.settleSaveAs(second, { ok: false })).toBe(true);
    expect(await indexTab(A)).toMatchObject({ path: saved, fileHash: sha(OLD), written: sha(OLD) });
    expect(await store.checkFile(A)).toMatchObject({ state: 'same' });
  });

  it('F6: an untitled tab whose Save-as write fails is unbound again; a binding changed meanwhile stays', async () => {
    const store = make();
    await store.restored();
    await store.updateIndex({ tabs: [listed(B, 'untitled')], active: B, discarded: [] });
    const saved = join(docs, 'untitled.chalk');
    await store.bind({ reason: 'save-as', tabId: B, path: saved, written: sha(NEW), ref: REF });
    expect(await store.settleSaveAs(REF, { ok: false })).toBe(true);
    expect(await indexTab(B)).toMatchObject({ path: null, fileHash: null });

    const second = '6f7a8b9c-adbe-4fc0-9d1e-2f3a4b5c6d7e';
    await store.bind({ reason: 'save-as', tabId: B, path: saved, written: sha(NEW), ref: second });
    await store.bind({ reason: 'unbind', tabId: B });
    expect(await store.settleSaveAs(second, { ok: false })).toBe(true);
    expect(await indexTab(B)).toMatchObject({ path: saved, fileHash: null, written: null });
  });

  it('LG1: the log carries codes, never a drawing', async () => {
    const store = await openTab();
    await writeFile(ester, '{"secret":"benzene"}');
    await store.autoSave({ tabId: A, text: '{"secret":"toluene"}' });
    expect(logged.join('\n')).not.toMatch(/benzene|toluene/);
  });
});

describe('opening a path bound to a tab (TB12: T17, R37)', () => {
  const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
  const TEXT = '{"drawing":"ester"}';
  const tab = (id: string, kind: 'chalk' | 'picture' | 'untitled' = 'chalk') => ({
    id,
    kind,
    name: 'Esterification.chalk',
    view: null,
    unsaved: false,
    warning: false,
  });
  let docs = '';
  let ester = '';

  beforeEach(async () => {
    docs = join(root, 'docs');
    ester = join(docs, 'Esterification.chalk');
    await mkdir(docs, { recursive: true });
    await writeFile(ester, TEXT);
  });

  /** A started store with tab A open on the real path of `ester`, bound as main's I12 binds it. */
  async function boundStore() {
    const store = make();
    await store.restored();
    await store.updateIndex({ tabs: [tab(A), tab(B, 'untitled')], active: A, discarded: [] });
    const bound = await store.bind({
      reason: 'open',
      tabId: A,
      path: await realPathOf(ester),
      kind: 'chalk',
      fileHash: sha(TEXT),
      written: sha(TEXT),
    });
    expect(bound).toEqual({ ok: true });
    return store;
  }

  /** What main does for a second launch, I1 or I3: the real path, the registry, else a ref. */
  const target = (store: ReturnType<typeof make>, path: string, open: () => Promise<string>) =>
    openTarget(path, { realPath: realPathOf, tabOf: (real) => store.tabOf(real), open });

  it('a second launch with the path of tab A answers { focus: A } and opens (reads) nothing', async () => {
    const store = await boundStore();
    const open = vi.fn(() => Promise.resolve('ref'));
    expect(await target(store, ester, open)).toEqual({ focus: A });
    expect(open).not.toHaveBeenCalled();
  });

  it('a differently-cased path, or one through a linked folder, is the same tab', async () => {
    const store = await boundStore();
    const open = vi.fn(() => Promise.resolve('ref'));
    expect(await target(store, join(docs, 'ESTERIFICATION.CHALK'), open)).toEqual({ focus: A });
    symlinkSync(docs, join(root, 'link'), 'junction');
    expect(await target(store, join(root, 'link', 'Esterification.chalk'), open)).toEqual({
      focus: A,
    });
    expect(open).not.toHaveBeenCalled();
  });

  it('a path no open tab is bound to is opened; a closed tab keeps its binding but does not hold the file', async () => {
    const store = await boundStore();
    const open = vi.fn(() => Promise.resolve('ref'));
    await writeFile(join(docs, 'other.chalk'), TEXT);
    expect(await target(store, join(docs, 'other.chalk'), open)).toBe('ref');
    await store.updateIndex({ tabs: [tab(B, 'untitled')], active: B, discarded: [A] });
    expect(await target(store, ester, open)).toBe('ref');
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('a picture tab is bound to its picture', async () => {
    const store = make();
    await store.restored();
    const picture = join(docs, 'Ester.png');
    await writeFile(picture, 'png');
    await store.updateIndex({ tabs: [tab(D, 'picture')], active: D, discarded: [] });
    await store.bind({
      reason: 'open',
      tabId: D,
      path: await realPathOf(picture),
      kind: 'picture',
      fileHash: null,
      written: null,
    });
    expect(await store.tabOf(await realpath(picture))).toBe(D);
    expect(await target(store, join(docs, 'ester.PNG'), () => Promise.resolve('ref'))).toEqual({
      focus: D,
    });
  });

  it('the lookup runs on the chain: a bind sent before it is seen', async () => {
    const store = make();
    await store.restored();
    await store.updateIndex({ tabs: [tab(A)], active: A, discarded: [] });
    const real = await realPathOf(ester);
    const bound = store.bind({
      reason: 'open',
      tabId: A,
      path: real,
      kind: 'chalk',
      fileHash: sha(TEXT),
      written: sha(TEXT),
    });
    const looked = store.tabOf(real);
    expect(await Promise.all([bound, looked])).toEqual([{ ok: true }, A]);
  });
});
