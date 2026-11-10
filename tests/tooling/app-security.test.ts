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
