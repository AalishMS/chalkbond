// A17 (SPEC-app-shell.md I2): build/THIRD-PARTY-NOTICES.txt carries the licence text of every
// package bundled into the app, equals what scripts/build-notices.mjs generates, and credits
// PubChem for the compound dictionary.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildNotices } from '../../scripts/build-notices.mjs';

const ROOT = resolve(__dirname, '../..');
const NOTICES = resolve(ROOT, 'build', 'THIRD-PARTY-NOTICES.txt');
const PACKAGES = ['immer', 'openchemlib', 'zod', 'react', 'react-dom', 'scheduler'];

/** Whitespace-insensitive form, so line wrapping never decides a match. */
const squash = (text: string): string => text.replace(/\s+/g, ' ').trim();

describe('THIRD-PARTY-NOTICES.txt (I2)', () => {
  const committed = readFileSync(NOTICES, 'utf8');

  it('names every runtime dependency in package.json among the packages', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    for (const name of Object.keys(pkg.dependencies)) expect(PACKAGES).toContain(name);
  });

  it.each(PACKAGES)('%s: name, version, licence and the full licence text are present', (name) => {
    const dir = resolve(ROOT, 'node_modules', name);
    const pkg = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')) as {
      version: string;
      license: string;
    };
    const licence = readFileSync(resolve(dir, 'LICENSE'), 'utf8');
    expect(committed).toContain(`${name} ${pkg.version}`);
    expect(committed).toContain(pkg.license);
    expect(squash(committed)).toContain(squash(licence));
  });

  it('credits PubChem, states no licence for its data and points to Electron licences', () => {
    expect(committed).toContain('PubChem');
    expect(committed).toContain('pubchem.ncbi.nlm.nih.gov');
    expect(committed).toContain('LICENSES.chromium.html');
  });

  it('uses LF line endings only', () => {
    expect(committed).not.toContain('\r');
  });

  it('equals the generator output, which is deterministic', () => {
    expect(buildNotices(ROOT)).toBe(committed);
    expect(buildNotices(ROOT)).toBe(buildNotices(ROOT));
  });
});
