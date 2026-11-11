// A7 channel schemas (SPEC-app-shell.md I1, I2, I4, I5; clipboard-export C3, C4): each rejects bad
// payloads, and no channel accepts or returns a path (R8; I3 arrives in A15).
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

describe('R8: no path crosses the bridge', () => {
  it('no request schema has a path field', () => {
    const all: ZodType[] = Object.values(schemas);
    expect(all.length).toBeGreaterThanOrEqual(11);
    for (const schema of all) expect(keysOf(schema)).not.toContain('path');
  });

  it('no response type has a path field', () => {
    const types = readFileSync(resolve(__dirname, '../shared/ipc-types.ts'), 'utf8');
    expect(types).not.toMatch(/\bpath\??\s*:/);
    expect(types).not.toMatch(/\bfilePath/);
  });
});
