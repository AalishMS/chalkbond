import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Lints in-memory source as if it lived at `filePath`, so no probe files exist in the repo.
const eslint = new ESLint({ cwd: process.cwd() });

async function restrictedImportErrors(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === 'no-restricted-imports')
    .map((m) => m.message);
}

describe('core import boundaries (SPEC.md + CAPABILITY-MAP.md)', () => {
  it.each([
    ["import { useState } from 'react';", 'react'],
    ["import { app } from 'electron';", 'electron'],
    ["import { readFileSync } from 'node:fs';", 'node:fs'],
    ["import { join } from 'path';", 'path'],
    ["import { App } from '../../renderer/app/App';", 'renderer code'],
  ])('rejects %s in src/core', async (code) => {
    const errors = await restrictedImportErrors('src/core/doc-model/probe.ts', code);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects doc-model importing chem-core', async () => {
    const errors = await restrictedImportErrors(
      'src/core/doc-model/probe.ts',
      "import { x } from '../chem-core/index';",
    );
    expect(errors).toEqual([expect.stringContaining('doc-model may only import')]);
  });

  it('rejects openchemlib outside chem-core', async () => {
    const errors = await restrictedImportErrors(
      'src/core/svg-render/probe.ts',
      "import OCL from 'openchemlib';",
    );
    expect(errors).toEqual([expect.stringContaining('Only chem-core')]);
  });

  it.each([
    'src/core/doc-model/probe.ts',
    'src/core/svg-render/probe.ts',
    'src/core/clipboard-export/probe.ts',
    'src/renderer/editor/probe.ts',
    'src/renderer/app/probe.tsx',
    'src/main/probe.ts',
    'src/preload/probe.ts',
    'tests/tooling/probe.ts',
    'e2e/probe.ts',
  ])('rejects openchemlib in %s (outside chem-core)', async (filePath) => {
    const errors = await restrictedImportErrors(
      filePath,
      "import { Molecule } from 'openchemlib';\nexport { Molecule };",
    );
    expect(errors).toEqual([expect.stringContaining('Only chem-core')]);
  });

  it('rejects openchemlib in chem-core files other than the ocl.ts adapter', async () => {
    const errors = await restrictedImportErrors(
      'src/core/chem-core/perceive.ts',
      "import { Molecule } from 'openchemlib';\nexport { Molecule };",
    );
    expect(errors).toEqual([expect.stringContaining('only ocl.ts')]);
  });

  it('still applies core restrictions to chem-core files', async () => {
    const errors = await restrictedImportErrors(
      'src/core/chem-core/perceive.ts',
      "import { x } from '../svg-render/index';\nexport { x };",
    );
    expect(errors).toEqual([expect.stringContaining('chem-core may only import')]);
  });

  it('allows chem-core to import doc-model, and ocl.ts / tests to import openchemlib', async () => {
    for (const filePath of ['src/core/chem-core/ocl.ts', 'src/core/chem-core/ocl-facts.test.ts']) {
      const errors = await restrictedImportErrors(
        filePath,
        "import { x } from '../doc-model/index';\nimport OCL from 'openchemlib';\nexport { x, OCL };",
      );
      expect(errors).toEqual([]);
    }
  });

  it('allows renderer code to import react', async () => {
    const errors = await restrictedImportErrors(
      'src/renderer/app/probe.tsx',
      "import { useState } from 'react';\nexport { useState };",
    );
    expect(errors).toEqual([]);
  });
});
