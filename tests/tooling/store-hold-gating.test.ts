// TB28 (SPEC-app-shell.md TH7, SEC12): the session store's test hold is built in one place only, and
// only when the test flags are honoured (`flags.hooks`, which `testFlags` clears for a packaged
// build), so a packaged or flagless run passes the store no hold and nothing reads
// `__chalkbondTestMain.hold`. The packaged smoke test (`e2e/packaged`) asserts the object is absent.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

function sources(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((item) => {
    const path = join(folder, item.name);
    if (item.isDirectory()) return sources(path);
    const source = /\.tsx?$/.test(item.name) && !/\.test\.tsx?$/.test(item.name);
    return source ? [path.split('\\').join('/')] : [];
  });
}

const FOLDERS = ['src/main', 'src/preload', 'src/shared', 'src/renderer'];

it('createStoreHold is called once, in main/index.ts, inside a flags.hooks condition', () => {
  const calls = FOLDERS.flatMap(sources)
    .filter((path) => path !== 'src/main/model/store-hold.ts') // the definition
    .filter((path) => /\bcreateStoreHold\(/.test(readFileSync(path, 'utf8')));
  expect(calls).toEqual(['src/main/index.ts']);
  const text = readFileSync('src/main/index.ts', 'utf8');
  expect(text.match(/\bcreateStoreHold\(/g)).toHaveLength(1);
  const before = text.slice(0, text.indexOf('createStoreHold(')).split('\n').slice(-6).join('\n');
  expect(before).toMatch(/\.\.\.\(flags\.hooks\b/);
});

it('only the store, its seam and the wiring in index.ts (a comment) mention the hold; the renderer never does', () => {
  const readers = FOLDERS.flatMap(sources).filter((path) =>
    /\bhold\?\.\(|\.hold\b/.test(readFileSync(path, 'utf8')),
  );
  expect(readers.sort()).toEqual([
    'src/main/index.ts',
    'src/main/model/store-hold.ts',
    'src/main/session-store.ts',
  ]);
});
