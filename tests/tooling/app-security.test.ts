import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('retains the exact offline CSP', () => {
  expect(readFileSync('src/renderer/index.html', 'utf8')).toContain(
    "content=\"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'\"",
  );
});
it('has no external browser launch in main', () => {
  function inspect(folder: string): void {
    for (const item of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, item.name);
      if (item.isDirectory()) inspect(path);
      else if (path.endsWith('.ts'))
        expect(readFileSync(path, 'utf8')).not.toContain('openExternal');
    }
  }
  inspect('src/main');
});
it('SEC11: main has exactly one shell.openPath call site, for the bundled notices (AB1)', () => {
  const sites: string[] = [];
  function inspect(folder: string): void {
    for (const item of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, item.name);
      if (item.isDirectory()) inspect(path);
      else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) {
        const count = readFileSync(path, 'utf8').split('shell.openPath(').length - 1;
        for (let i = 0; i < count; i++) sites.push(path);
      }
    }
  }
  inspect('src/main');
  expect(sites.map((p) => p.replaceAll('\\', '/'))).toEqual(['src/main/index.ts']);
  const index = readFileSync('src/main/index.ts', 'utf8');
  expect(index).toContain('openPath: (path) => shell.openPath(path)');
  expect(readFileSync('src/main/about.ts', 'utf8')).toContain("'THIRD-PARTY-NOTICES.txt'");
});
