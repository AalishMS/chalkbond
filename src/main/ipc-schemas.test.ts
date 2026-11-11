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

  it('I4 ask: save-changes with a base name, or recover', () => {
    ok(schemas.askSchema, { kind: 'save-changes', name: 'esterification' });
    ok(schemas.askSchema, { kind: 'recover' });
    for (const v of [
      { kind: 'save-changes' },
      { kind: 'save-changes', name: 'a/b' },
      { kind: 'save-changes', name: 'a\\b' },
      { kind: 'save-changes', name: 'x'.repeat(256) },
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

describe('A8 session schemas (N2, N5)', () => {
  it('N2 session file: a uuid ref or null (New, Untitled), nothing else', () => {
    ok(schemas.sessionFileSchema, { ref: ID });
    ok(schemas.sessionFileSchema, { ref: null });
    for (const v of [{}, { ref: '/x.chalk' }, { ref: ID, path: '/x' }, { ref: 3 }, null])
      bad(schemas.sessionFileSchema, v);
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

describe('A11 N1 session update with the menu state', () => {
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
    preset: 'slides',
  };
  const update = { title: '*Untitled - Chalkbond', dirty: true, menu };

  it('takes a title, dirty and every MenuState field', () => {
    ok(schemas.sessionUpdateSchema, update);
    ok(schemas.sessionUpdateSchema, { ...update, menu: { ...menu, preset: 'journal' } });
  });

  it('rejects a missing, extra or mistyped field', () => {
    const { idle: _idle, ...noIdle } = menu;
    for (const v of [
      { title: 'x', dirty: false },
      { ...update, extra: 1 },
      { ...update, menu: noIdle },
      { ...update, menu: { ...menu, extra: true } },
      { ...update, menu: { ...menu, modal: 'no' } },
      { ...update, menu: { ...menu, preset: 'poster' } },
      { ...update, menu: { ...menu, undoLabel: 3 } },
      { ...update, menu: { ...menu, undoLabel: 'x'.repeat(201) } },
      { ...update, title: 'x'.repeat(301) },
    ])
      bad(schemas.sessionUpdateSchema, v);
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

describe('A14 N3 recovery:write and N4 recovery:clear', () => {
  it('N3: text starting "{" up to 20 MiB and a base name', () => {
    ok(schemas.writeRecoverySchema, { text: '{"a":1}', name: 'esterification.chalk' });
    ok(schemas.writeRecoverySchema, { text: '{', name: 'Untitled' });
    ok(schemas.writeRecoverySchema, { text: `{${'x'.repeat(20 * 1024 * 1024 - 1)}`, name: 'a' });
  });
  it('N3 rejects other text, a path as name, extras', () => {
    for (const v of [
      {},
      { text: '{}' },
      { text: '[1]', name: 'a' },
      { text: ' {}', name: 'a' },
      { text: `{${'x'.repeat(20 * 1024 * 1024)}`, name: 'a' },
      { text: `{${'é'.repeat(10 * 1024 * 1024)}`, name: 'a' },
      { text: '{}', name: 'C:\\x\\a.chalk' },
      { text: '{}', name: '/tmp/a.chalk' },
      { text: '{}', name: 'x'.repeat(256) },
      { text: '{}', name: 'a', path: '/tmp' },
    ])
      bad(schemas.writeRecoverySchema, v);
  });
  it('N4: an empty object only', () => {
    ok(schemas.clearRecoverySchema, {});
    bad(schemas.clearRecoverySchema, { all: true });
    bad(schemas.clearRecoverySchema, null);
  });
});
