import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

// Lints in-memory source as if it lived at `filePath`, so no probe files exist in the repo.
const eslint = new ESLint({ cwd: process.cwd() });

beforeAll(async () => {
  await eslint.lintText('export {};', { filePath: 'src/renderer/editor/model/warm.ts' });
}, 120_000);

async function messages(filePath: string, code: string, ruleId: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === ruleId).map((m) => m.message);
}

const imports = (filePath: string, code: string) =>
  messages(filePath, code, 'no-restricted-imports');

const VIEW = 'src/renderer/editor/view/x.tsx';
const PURE_FILES = [
  'src/renderer/editor/model/x.ts',
  'src/renderer/editor/tools/x.ts',
  'src/renderer/editor/state/x.ts',
];

describe('renderer import boundary', () => {
  it('rejects a deep @core path', async () => {
    const errors = await imports(
      VIEW,
      "import { History } from '@core/doc-model/history';\nexport { History };",
    );
    expect(errors).toEqual([expect.stringContaining('index')]);
  });

  it('rejects a relative import into src/core', async () => {
    const errors = await imports(
      VIEW,
      "import { History } from '../../core/doc-model';\nexport { History };",
    );
    expect(errors).toEqual([expect.stringContaining('@core/<module>')]);
  });

  it('accepts the public @core index', async () => {
    const errors = await imports(
      VIEW,
      "import { History } from '@core/doc-model';\nexport { History };",
    );
    expect(errors).toEqual([]);
  });

  it('accepts @core fixtures in a test file but not in source', async () => {
    const code =
      "import { arbDoc } from '@core/doc-model/__fixtures__/arbitraries';\nexport { arbDoc };";
    expect(await imports('src/renderer/editor/model/x.test.ts', code)).toEqual([]);
    expect(await imports('src/renderer/editor/model/x.ts', code)).not.toEqual([]);
  });

  it('still rejects openchemlib in renderer files (block repeats the ban)', async () => {
    const code = "import { Molecule } from 'openchemlib';\nexport { Molecule };";
    for (const filePath of [VIEW, 'src/renderer/app/x.tsx', ...PURE_FILES]) {
      expect(await imports(filePath, code)).toEqual([expect.stringContaining('Only chem-core')]);
    }
  });

  it('accepts react in a view file', async () => {
    const errors = await imports(VIEW, "import { useState } from 'react';\nexport { useState };");
    expect(errors).toEqual([]);
  });
});

describe('editor model, tools and state are DOM-free', () => {
  it.each(PURE_FILES)('rejects react, react-dom and electron imports in %s', async (filePath) => {
    for (const mod of ['react', 'react-dom', 'electron', 'react-dom/server']) {
      const errors = await imports(filePath, `import * as m from '${mod}';\nexport { m };`);
      expect(errors, mod).not.toEqual([]);
    }
  });

  it.each(PURE_FILES)('rejects banned globals in %s', async (filePath) => {
    for (const name of [
      'document',
      'window',
      'navigator',
      'requestAnimationFrame',
      'performance',
      'setTimeout',
      'Date',
    ]) {
      const errors = await messages(filePath, `export const x = ${name};`, 'no-restricted-globals');
      expect(errors, name).not.toEqual([]);
    }
  });

  it.each(PURE_FILES)('rejects export default in %s', async (filePath) => {
    const errors = await messages(filePath, 'export default 1;', 'no-restricted-syntax');
    expect(errors).toEqual([expect.stringContaining('named exports')]);
  });

  it('does not apply the global ban to view files', async () => {
    const errors = await messages(VIEW, 'export const x = document;', 'no-restricted-globals');
    expect(errors).toEqual([]);
  });
});
