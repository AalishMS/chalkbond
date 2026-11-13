// TB21 (SPEC-app-shell.md R35, SS7, SEC5): the recovery file and its offer are retired. No source
// file of main, the preload, the shared channel files or the renderer's host mentions recovery
// except the one comment that says the old `userData/recovery` folder of earlier builds is ignored.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const FOLDERS = ['src/main', 'src/preload', 'src/shared', 'src/renderer/app'];
const IGNORED_FOLDER_NOTE = /userData\/recovery folder of earlier builds is ignored/;

function sources(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((item) => {
    const path = join(folder, item.name);
    if (item.isDirectory()) return sources(path);
    const source = /\.tsx?$/.test(item.name) && !/\.test\.tsx?$/.test(item.name);
    return source ? [path.split('\\').join('/')] : [];
  });
}

it('no recovery identifier, file or channel remains outside the SS7 comment', () => {
  const found: string[] = [];
  for (const path of FOLDERS.flatMap(sources)) {
    readFileSync(path, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (/recovery|\brecover(ed)?\b/i.test(line) && !IGNORED_FOLDER_NOTE.test(line))
          found.push(`${path}:${index + 1}: ${line.trim()}`);
      });
  }
  expect(found).toEqual([]);
});

it('the one allowed mention is the SS7 comment in main/index.ts', () => {
  const lines = readFileSync('src/main/index.ts', 'utf8')
    .split('\n')
    .filter((line) => /recovery/i.test(line));
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(IGNORED_FOLDER_NOTE);
});
