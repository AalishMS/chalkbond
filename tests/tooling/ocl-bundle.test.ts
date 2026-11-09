import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// SPEC-chem-core.md "Verified library facts": the OpenChemLib bundle runs in the sandboxed
// renderer under the strict CSP (no 'unsafe-eval'), so it must never evaluate strings as code.
const require = createRequire(import.meta.url);
// `openchemlib/package.json` is not in the package's exports map; go up from the entry.
const entry = require.resolve('openchemlib');
const pkgDir = dirname(dirname(entry));
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as {
  version: string;
  type: string;
};
const bundle = readFileSync(entry, 'utf8');

describe('openchemlib bundle', () => {
  it('is the pinned version, pure ESM', () => {
    expect(pkg.version).toBe('9.25.2');
    expect(pkg.type).toBe('module');
  });

  it('is about 1.1 MB minified', () => {
    expect(bundle.length).toBeGreaterThan(900_000);
    expect(bundle.length).toBeLessThan(1_400_000);
  });

  it('contains no eval or new Function (CSP-safe)', () => {
    expect(bundle).not.toMatch(/(^|[^\w$.])eval\s*\(/);
    expect(bundle).not.toMatch(/new\s+Function\s*\(/);
  });
});
