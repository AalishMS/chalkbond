import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// SPEC-chem-core.md "Name lookup": the dictionary is built at dev time by
// scripts/build-compounds.mjs (network) and committed; the app itself never goes online.

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('compound dictionary build', () => {
  it('list and JSON are consistent (build-compounds.mjs --check, offline)', () => {
    const out = execFileSync(process.execPath, ['scripts/build-compounds.mjs', '--check'], {
      encoding: 'utf8',
    });
    expect(out).toMatch(/^ok: \d+ compounds/);
  });

  it('the app sources contain no network code (the lookup script lives outside src/)', () => {
    const offenders = sourceFiles('src').filter((file) =>
      /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|pubchem\.ncbi/i.test(
        readFileSync(file, 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
