// A7 channel schemas (SPEC-app-shell.md I1, I2, I4, I5; clipboard-export C3, C4): each rejects bad
// payloads, and no channel but I3 accepts a path; none returns one (R8, SEC14).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z, type ZodType } from 'zod';
import * as schemas from './ipc-schemas';

const ID = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const ok = (schema: ZodType, value: unknown) => expect(schema.safeParse(value).success).toBe(true);
const bad = (schema: ZodType, value: unknown) =>
  expect(schema.safeParse(value).success).toBe(false);

describe('A7 schemas', () => {
  it('I1 choose-open takes nothing', () => {
    ok(schemas.chooseOpenSchema, {});
    bad(schemas.chooseOpenSchema, { path: 'C:\\x.chalk' });
    bad(schemas.chooseOpenSchema, null);
  });

  it('I2 read takes a uuid ref only', () => {
    ok(schemas.readFileSchema, { ref: ID });
    for (const v of [{}, { ref: 'C:\\x.chalk' }, { ref: ID, path: '/x' }, { ref: 3 }, 'x'])
      bad(schemas.readFileSchema, v);
  });

  it('I4 ask: save-changes with a base name only (no recover kind, TB21)', () => {
    ok(schemas.askSchema, { kind: 'save-changes', name: 'esterification' });
    for (const v of [
      { kind: 'save-changes' },
      { kind: 'save-changes', name: 'a/b' },
      { kind: 'save-changes', name: 'a\\b' },
      { kind: 'save-changes', name: 'x'.repeat(256) },
      { kind: 'recover' },
      { kind: 'recover', name: 'x' },
      { kind: 'other' },
    ])
      bad(schemas.askSchema, v);
  });

  it('I5 file error: an F14 problem and a base name (no / or \\)', () => {
    ok(schemas.fileErrorSchema, { problem: 'missing', name: 'ethanol.chalk' });
    ok(schemas.fileErrorSchema, { problem: 'unsupported', name: '' }); // SEC14: a JS-made File
    ok(schemas.fileErrorSchema, { problem: 'write-failed', name: 'x'.repeat(255) });
    for (const v of [
      { problem: 'missing', name: 'C:\\Users\\T\\ethanol.chalk' },
      { problem: 'missing', name: '../ethanol.chalk' },
      { problem: 'missing', name: 'x'.repeat(256) },
      { problem: 'gone', name: 'a' },
      { problem: 'missing' },
      { problem: 'missing', name: 'a', detail: 'free text' },
    ])
      bad(schemas.fileErrorSchema, v);
  });

  it('I5 gains open-in-tab and the auto-save and keep contexts (SEC15)', () => {
    ok(schemas.fileErrorSchema, { problem: 'open-in-tab', name: 'ethanol.chalk' });
    for (const problem of [
      'missing',
      'write-denied',
      'disk-full',
      'busy',
      'folder-gone',
      'write-failed',
      'changed-outside',
      'changed-outside-unopenable',
    ])
      ok(schemas.fileErrorSchema, { context: 'auto-save', problem, name: 'ethanol.chalk' });
    for (const problem of ['disk-full', 'write-denied', 'write-failed'])
      ok(schemas.fileErrorSchema, { context: 'keep', problem, name: 'Untitled 2' });
    for (const v of [
      { context: 'auto-save', problem: 'damaged', name: 'a' },
      { context: 'auto-save', problem: 'changed-outside', name: 'a\\b' },
      { context: 'auto-save', problem: 'changed-outside', name: 'a/b' },
      { context: 'keep', problem: 'busy', name: 'a' },
      { context: 'keep', problem: 'missing', name: 'a' },
      { context: 'other', problem: 'missing', name: 'a' },
      { context: 'keep', problem: 'disk-full' },
      { context: 'keep', problem: 'disk-full', name: 'a', detail: 'free text' },
      { problem: 'changed-outside', name: 'a' },
    ])
      bad(schemas.fileErrorSchema, v);
  });

  it('I10 tab-menu: a tab uuid, canReopenTab and a point or null', () => {
    for (const at of [null, { x: 0, y: 0 }, { x: 12.5, y: 30 }])
      for (const canReopenTab of [true, false])
        ok(schemas.tabMenuSchema, { tabId: ID, state: { canReopenTab }, at });
    for (const v of [
      {},
      { tabId: ID, state: { canReopenTab: true } },
      { tabId: 'not-a-uuid', state: { canReopenTab: true }, at: null },
      { tabId: 3, state: { canReopenTab: true }, at: null },
      { tabId: ID, state: {}, at: null },
      { tabId: ID, state: { canReopenTab: 'yes' }, at: null },
      { tabId: ID, state: { canReopenTab: true, extra: 1 }, at: null },
      { tabId: ID, state: { canReopenTab: true }, at: { x: 1 } },
      { tabId: ID, state: { canReopenTab: true }, at: { x: '1', y: 2 } },
      { tabId: ID, state: { canReopenTab: true }, at: { x: Infinity, y: 2 } },
      { tabId: ID, state: { canReopenTab: true }, at: { x: NaN, y: 2 } },
      { tabId: ID, state: { canReopenTab: true }, at: { x: 1, y: 2, z: 3 } },
      { tabId: ID, state: { canReopenTab: true }, at: null, items: [{ role: 'quit' }] },
    ])
      bad(schemas.tabMenuSchema, v);
  });

  it('C3 choose-save: a format and a base name', () => {
    for (const format of ['chalk', 'png', 'svg', 'pdf'])
      ok(schemas.chooseSaveSchema, { format, suggestedName: `Untitled.${format}` });
    for (const v of [
      { format: 'exe', suggestedName: 'a' },
      { format: 'chalk', suggestedName: 'C:\\a.chalk' },
      { format: 'chalk', suggestedName: '/tmp/a.chalk' },
      { format: 'chalk', suggestedName: 'x'.repeat(256) },
      { format: 'chalk' },
      { format: 'chalk', suggestedName: 'a', defaultPath: '/x' },
    ])
      bad(schemas.chooseSaveSchema, v);
  });

  it('C4 write: a uuid ref and bytes up to 64 MB', () => {
    ok(schemas.writeFileSchema, { ref: ID, data: PNG });
    for (const v of [
      { ref: ID, data: 'text' },
      { ref: ID, data: [1, 2] },
      { ref: '/x.png', data: PNG },
      { ref: ID, data: new Uint8Array(64 * 1024 * 1024 + 1) },
      { ref: ID, data: PNG, path: '/x' },
    ])
      bad(schemas.writeFileSchema, v);
  });
});

describe('A8 close schema (N5)', () => {
  it('TB21: no schema is left for the retired channels (N2, N3, N4)', () => {
    for (const name of ['sessionFileSchema', 'writeRecoverySchema', 'clearRecoverySchema'])
      expect(Object.keys(schemas)).not.toContain(name);
  });

  it('N5 close ok: an empty object only', () => {
    ok(schemas.closeOkSchema, {});
    for (const v of [{ force: true }, null, 'x']) bad(schemas.closeOkSchema, v);
  });
});

/** Every object key in a schema, through unions, nullables and nested objects. */
function keysOf(schema: ZodType): string[] {
  if (schema instanceof z.ZodObject)
    return Object.entries(schema.shape as Record<string, ZodType>).flatMap(([k, v]) => [
      k,
      ...keysOf(v),
    ]);
  if (schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion)
    return (schema.options as ZodType[]).flatMap(keysOf);
  if (schema instanceof z.ZodNullable || schema instanceof z.ZodOptional)
    return keysOf(schema.unwrap() as ZodType);
  return [];
}

describe('R8: no path crosses the bridge but I3', () => {
  it('only I3 (file:dropped) has a path field', () => {
    const withPath = Object.entries(schemas as Record<string, ZodType>)
      .filter(([, schema]) => keysOf(schema).includes('path'))
      .map(([name]) => name);
    expect(Object.keys(schemas).length).toBeGreaterThanOrEqual(14);
    expect(withPath).toEqual(['fileDroppedSchema']);
  });

  it('no response type has a path field; the one request type with a path is I3', () => {
    const types = readFileSync(resolve(__dirname, '../shared/ipc-types.ts'), 'utf8');
    const i3 = /export interface FileDroppedRequest \{[^}]*\}/.exec(types)?.[0] ?? '';
    expect(i3).toMatch(/\bpath: string;/);
    const rest = types.replace(i3, '');
    expect(rest).not.toMatch(/\bpath\??\s*:/);
    expect(rest).not.toMatch(/\bfilePath/);
  });
});

describe('A15 I3 file:dropped', () => {
  it('takes a path of up to 4096 characters (empty: a JS-made File)', () => {
    ok(schemas.fileDroppedSchema, { path: '/home/t/ethanol.chalk' });
    ok(schemas.fileDroppedSchema, { path: 'C:\\Users\\T\\a b.chalk' });
    ok(schemas.fileDroppedSchema, { path: '' });
    ok(schemas.fileDroppedSchema, { path: 'x'.repeat(4096) });
  });

  it('rejects a longer path, another type, extras or nothing', () => {
    for (const v of [
      { path: 'x'.repeat(4097) },
      { path: 3 },
      { path: '/a.chalk', ref: ID },
      {},
      null,
    ])
      bad(schemas.fileDroppedSchema, v);
  });
});

describe('A10 I8 settings:set', () => {
  const EXPORT = { format: 'svg', pngDpi: 600, pngWhite: true };
  it('accepts a partial RendererSettings', () => {
    ok(schemas.setSettingsSchema, {});
    ok(schemas.setSettingsSchema, { newDrawingStyle: 'journal' });
    ok(schemas.setSettingsSchema, { export: EXPORT });
    ok(schemas.setSettingsSchema, {
      newDrawingStyle: 'slides',
      export: { ...EXPORT, pngDpi: 150 },
    });
  });

  it('rejects paths, main-only fields, unknown keys and invalid values', () => {
    for (const v of [
      null,
      { newDrawingStyle: 'poster' },
      { export: { ...EXPORT, format: 'jpg' } },
      { export: { ...EXPORT, pngDpi: 72 } },
      { export: { ...EXPORT, pngDpi: '300' } },
      { export: { ...EXPORT, pngWhite: 1 } },
      { export: { format: 'png' } },
      { export: { ...EXPORT, folder: 'C:\\x' } },
      { folders: { open: 'C:\\x' } },
      { window: { x: 0, y: 0, width: 1, height: 1, maximized: false } },
      { recent: ['C:\\x.chalk'] },
      { version: 1 },
    ])
      bad(schemas.setSettingsSchema, v);
  });
});

describe('N1 session update (R32: the title only)', () => {
  it('takes a title of at most 300 characters', () => {
    ok(schemas.sessionUpdateSchema, { title: '*Untitled - Chalkbond' });
    ok(schemas.sessionUpdateSchema, { title: 'x'.repeat(300) });
  });

  it('rejects a missing, extra or mistyped field (no menu, no dirty)', () => {
    for (const v of [
      {},
      { title: 3 },
      { title: 'x'.repeat(301) },
      { title: 'x', dirty: false },
      { title: 'x', menu: {} },
    ])
      bad(schemas.sessionUpdateSchema, v);
  });
});

describe('I9 app-menu:show (M4, R32)', () => {
  const menu = {
    idle: true,
    modal: false,
    textFocus: false,
    empty: false,
    hasSelection: false,
    canUndo: true,
    canRedo: false,
    undoLabel: 'Add bond',
    redoLabel: null,
    canCut: false,
    canDuplicate: false,
    canDelete: false,
    canSelectAll: true,
    canZoomIn: true,
    canZoomOut: true,
    canReopenTab: true,
    preset: 'slides',
  };

  it('takes a full MenuState and finite content coordinates', () => {
    ok(schemas.appMenuSchema, { state: menu, x: 8, y: 44 });
    ok(schemas.appMenuSchema, {
      state: { ...menu, preset: 'journal', undoLabel: null },
      x: 0.5,
      y: -1,
    });
  });

  it('rejects a missing, extra or mistyped field and bad coordinates', () => {
    const { idle: _idle, ...noIdle } = menu;
    const { canReopenTab: _reopen, ...noReopen } = menu;
    for (const v of [
      {},
      { state: menu },
      { state: menu, x: 1 },
      { state: menu, x: '1', y: 2 },
      { state: menu, x: NaN, y: 2 },
      { state: menu, x: 1, y: Infinity },
      { state: menu, x: -Infinity, y: 2 },
      { state: noIdle, x: 1, y: 2 },
      { state: noReopen, x: 1, y: 2 },
      { state: { ...menu, extra: true }, x: 1, y: 2 },
      { state: { ...menu, modal: 'no' }, x: 1, y: 2 },
      { state: { ...menu, preset: 'poster' }, x: 1, y: 2 },
      { state: { ...menu, undoLabel: 3 }, x: 1, y: 2 },
      { state: { ...menu, undoLabel: 'x'.repeat(201) }, x: 1, y: 2 },
      { state: menu, x: 1, y: 2, items: [{ role: 'quit' }] },
    ])
      bad(schemas.appMenuSchema, v);
  });
});

describe('A13 I6 context-menu:show', () => {
  const state = {
    idle: true,
    modal: false,
    textFocus: false,
    empty: false,
    hasSelection: true,
    canUndo: false,
    canRedo: false,
    undoLabel: null,
    redoLabel: null,
    canCut: true,
    canDuplicate: true,
    canDelete: true,
    canSelectAll: true,
    canZoomIn: true,
    canZoomOut: true,
    canReopenTab: false,
    preset: 'journal',
  };
  it('takes onItem and a full MenuState', () => {
    ok(schemas.contextMenuSchema, { onItem: true, state });
    ok(schemas.contextMenuSchema, { onItem: false, state });
  });
  it('rejects a missing, extra or mistyped field', () => {
    const { canDelete: _d, ...partial } = state;
    for (const v of [
      {},
      { onItem: true },
      { onItem: 'yes', state },
      { onItem: true, state: partial },
      { onItem: true, state: { ...state, extra: 1 } },
      { onItem: true, state, x: 1 },
      { onItem: true, state, items: [{ role: 'quit' }] },
    ])
      bad(schemas.contextMenuSchema, v);
  });
});

describe('TB9 I11 session:read-tab, N7 session:write-tab, N8 session:index', () => {
  const MIB64 = 64 * 1024 * 1024;
  it('I11 takes a uuid tab id only (SEC8: no other part of a store path)', () => {
    ok(schemas.readTabRecordSchema, { tabId: ID });
    for (const v of [
      {},
      { tabId: '../index' },
      { tabId: `${ID}/../x` },
      { tabId: 'C:\\x' },
      { tabId: ID, path: '/x' },
      { tabId: 3 },
      null,
    ])
      bad(schemas.readTabRecordSchema, v);
  });

  it('N10 (TB15) takes a uuid tab id only (SEC8)', () => {
    ok(schemas.damagedTabRecordSchema, { tabId: ID });
    for (const v of [
      {},
      { tabId: '../index' },
      { tabId: 'index' },
      { tabId: ID, text: '{}' },
      { tabId: ID, path: '/x' },
      { tabId: 3 },
      null,
    ])
      bad(schemas.damagedTabRecordSchema, v);
  });

  it('N7 takes a uuid and text starting "{" of up to 64 MiB of UTF-8', () => {
    ok(schemas.writeTabRecordSchema, { tabId: ID, text: '{}' });
    ok(schemas.writeTabRecordSchema, { tabId: ID, text: `{${'x'.repeat(MIB64 - 1)}` });
    for (const v of [
      { tabId: ID },
      { tabId: ID, text: '' },
      { tabId: ID, text: '[1]' },
      { tabId: ID, text: ' {}' },
      { tabId: ID, text: `{${'x'.repeat(MIB64)}` },
      { tabId: ID, text: `{${'é'.repeat(MIB64 / 2)}` },
      { tabId: '../x', text: '{}' },
      { tabId: ID, text: '{}', name: 'a' },
    ])
      bad(schemas.writeTabRecordSchema, v);
  });

  const TAB = {
    id: ID,
    kind: 'chalk',
    name: 'esterification (your changes)',
    view: { zoom: 1.5, centre: { x: -3, y: 4.25 } },
    unsaved: false,
    warning: true,
  };
  const OTHER = '6a1f0c2d-3b4e-4f5a-9b6c-7d8e9f0a1b2c';
  const update = { tabs: [TAB], active: ID, discarded: [OTHER] };

  it('N8 takes the renderer fields of each tab, the active id and the discarded ids', () => {
    ok(schemas.sessionIndexSchema, update);
    ok(schemas.sessionIndexSchema, { ...update, tabs: [{ ...TAB, view: null }], discarded: [] });
    for (const kind of ['untitled', 'picture', 'kept']) {
      ok(schemas.sessionIndexSchema, { ...update, tabs: [{ ...TAB, kind }] });
    }
  });

  it('N8 rejects a path or hash from the renderer, bad ids, names and views', () => {
    for (const v of [
      { ...update, tabs: [{ ...TAB, path: '/x/a.chalk' }] },
      { ...update, tabs: [{ ...TAB, fileHash: 'a'.repeat(64) }] },
      { ...update, tabs: [{ ...TAB, written: 'a'.repeat(64) }] },
      { ...update, tabs: [{ ...TAB, writing: 'a'.repeat(64) }] },
      { ...update, tabs: [{ ...TAB, id: 'tab-1' }] },
      { ...update, tabs: [{ ...TAB, kind: 'recovered' }] },
      { ...update, tabs: [{ ...TAB, name: 'C:\\x\\a.chalk' }] },
      { ...update, tabs: [{ ...TAB, name: 'x'.repeat(256) }] },
      { ...update, tabs: [{ ...TAB, view: { zoom: Number.NaN, centre: { x: 0, y: 0 } } }] },
      { ...update, tabs: [{ ...TAB, view: { zoom: 1, centre: { x: Infinity, y: 0 } } }] },
      { ...update, tabs: [{ ...TAB, view: { zoom: 1 } }] },
      { ...update, tabs: [{ ...TAB, unsaved: 'yes' }] },
      { ...update, active: 'x' },
      { ...update, discarded: ['x'] },
      { ...update, extra: 1 },
      { tabs: [TAB], active: ID },
      null,
    ])
      bad(schemas.sessionIndexSchema, v);
  });
});

describe('TB10 I12 tab:bind, I13 file:auto-save, I14 file:check, N9 file:accept-outside', () => {
  const MIB20 = 20 * 1024 * 1024;
  const OTHER = '6a1f0c2d-3b4e-4f5a-9b6c-7d8e9f0a1b2c';
  const REF = '9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
  const SHA = 'a'.repeat(64);

  it('I12: open and save-as name a ref; reopen and take-over name `from`; unbind neither', () => {
    ok(schemas.bindTabSchema, { tabId: ID, ref: REF, reason: 'open', written: SHA });
    ok(schemas.bindTabSchema, { tabId: ID, ref: REF, reason: 'open' });
    ok(schemas.bindTabSchema, { tabId: ID, ref: REF, reason: 'save-as', written: SHA });
    ok(schemas.bindTabSchema, { tabId: ID, ref: null, reason: 'unbind' });
    ok(schemas.bindTabSchema, { tabId: ID, ref: null, reason: 'reopen', from: OTHER });
    ok(schemas.bindTabSchema, {
      tabId: ID,
      ref: null,
      reason: 'take-over',
      from: OTHER,
      written: SHA,
    });
  });

  it('I12 rejects a path, a missing ref or `from`, a bad hash and binding a tab to itself', () => {
    for (const v of [
      { tabId: ID, ref: null, reason: 'open', written: SHA },
      { tabId: ID, ref: REF, reason: 'save-as' },
      { tabId: ID, ref: REF, reason: 'unbind' },
      { tabId: ID, ref: null, reason: 'reopen' },
      { tabId: ID, ref: null, reason: 'unbind', from: OTHER },
      { tabId: ID, ref: REF, reason: 'take-over', from: OTHER },
      { tabId: ID, ref: null, reason: 'reopen', from: ID },
      { tabId: ID, ref: REF, reason: 'open', written: 'A'.repeat(64) },
      { tabId: ID, ref: REF, reason: 'open', written: 'a'.repeat(63) },
      { tabId: ID, ref: REF, reason: 'rename' },
      { tabId: ID, ref: 'C:\\x.chalk', reason: 'open' },
      { tabId: 'tab-1', ref: REF, reason: 'open' },
      { tabId: ID, ref: REF, reason: 'open', path: '/x.chalk' },
      { tabId: ID, reason: 'unbind' },
      null,
    ])
      bad(schemas.bindTabSchema, v);
  });

  it('I13 takes a uuid and text starting "{" of up to 20 MiB of UTF-8 (SEC8)', () => {
    ok(schemas.autoSaveSchema, { tabId: ID, text: '{}' });
    ok(schemas.autoSaveSchema, { tabId: ID, text: `{${'x'.repeat(MIB20 - 1)}` });
    for (const v of [
      { tabId: ID, text: '' },
      { tabId: ID, text: '[1]' },
      { tabId: ID, text: ' {}' },
      { tabId: ID, text: `{${'x'.repeat(MIB20)}` },
      { tabId: ID, text: `{${'é'.repeat(MIB20 / 2)}` },
      { tabId: '../x', text: '{}' },
      { tabId: ID, text: '{}', ref: REF },
      { tabId: ID },
      null,
    ])
      bad(schemas.autoSaveSchema, v);
  });

  it('I14 takes a uuid tab id and, for SS11 (TB18), `wantBytes: true`', () => {
    ok(schemas.checkTabFileSchema, { tabId: ID });
    ok(schemas.checkTabFileSchema, { tabId: ID, wantBytes: true });
    for (const v of [
      {},
      { tabId: 'x' },
      { tabId: ID, path: '/x' },
      { tabId: ID, wantBytes: false },
      { tabId: ID, wantBytes: 'yes' },
      null,
    ])
      bad(schemas.checkTabFileSchema, v);
  });

  it('N9 takes a uuid tab id and the written hash', () => {
    ok(schemas.acceptOutsideSchema, { tabId: ID, written: SHA });
    for (const v of [
      { tabId: ID },
      { tabId: ID, written: 'x' },
      { tabId: 'x', written: SHA },
      { tabId: ID, written: SHA, fileHash: SHA },
      null,
    ])
      bad(schemas.acceptOutsideSchema, v);
  });
});
