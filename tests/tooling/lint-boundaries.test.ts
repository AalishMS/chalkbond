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

  it('allows chem-core to import doc-model and openchemlib', async () => {
    const errors = await restrictedImportErrors(
      'src/core/chem-core/probe.ts',
      "import { x } from '../doc-model/index';\nimport OCL from 'openchemlib';\nexport { x, OCL };",
    );
    expect(errors).toEqual([]);
  });

  it('allows renderer code to import react', async () => {
    const errors = await restrictedImportErrors(
      'src/renderer/app/probe.tsx',
      "import { useState } from 'react';\nexport { useState };",
    );
    expect(errors).toEqual([]);
  });
});
