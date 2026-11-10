import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

// Lints in-memory source as if it lived at `filePath`, so no probe files exist in the repo.
const eslint = new ESLint({ cwd: process.cwd() });

beforeAll(async () => {
  await eslint.lintText('export {};', { filePath: 'src/main/warm.ts' });
}, 120_000);

async function messages(filePath: string, code: string, ruleId: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === ruleId).map((m) => m.message);
}

const imports = (filePath: string, code: string) =>
  messages(filePath, code, 'no-restricted-imports');
const tsImports = (filePath: string, code: string) =>
  messages(filePath, code, '@typescript-eslint/no-restricted-imports');

const MAIN = 'src/main/x.ts';
const PRELOAD = 'src/preload/x.ts';
const MAIN_MODEL = 'src/main/model/x.ts';
const DOM_FREE_MODELS = ['src/renderer/app/model/x.ts', 'src/renderer/clipboard-export/model/x.ts'];

describe('main and preload never import core', () => {
  it.each([MAIN, PRELOAD])(
    'rejects @core and a relative path into src/core in %s',
    async (file) => {
      const alias = await imports(
        file,
        "import { History } from '@core/doc-model';\nexport { History };",
      );
      expect(alias).toEqual([expect.stringContaining('core')]);
      const relative = await imports(
        file,
        "import { History } from '../core/doc-model';\nexport { History };",
      );
      expect(relative).toEqual([expect.stringContaining('core')]);
    },
  );

  it.each([MAIN, PRELOAD, MAIN_MODEL])('still rejects openchemlib in %s', async (file) => {
    const errors = await imports(
      file,
      "import { Molecule } from 'openchemlib';\nexport { Molecule };",
    );
    expect(errors).toEqual([expect.stringContaining('Only chem-core')]);
  });
});

describe('preload runtime imports', () => {
  it('rejects zod and accepts electron and ../shared/channels', async () => {
    const file = 'src/preload/index.ts';
    expect(await tsImports(file, "import { z } from 'zod';\nexport { z };")).toEqual([
      expect.stringContaining('preload'),
    ]);
    expect(
      await tsImports(file, "import { contextBridge } from 'electron';\nexport { contextBridge };"),
    ).toEqual([]);
    expect(
      await tsImports(file, "import { CHANNELS } from '../shared/channels';\nexport { CHANNELS };"),
    ).toEqual([]);
  });

  it('accepts type-only imports of ../shared/ipc-types', async () => {
    const errors = await tsImports(
      'src/preload/index.ts',
      "import type { IpcRequestMap } from '../shared/ipc-types';\nexport type X = IpcRequestMap;",
    );
    expect(errors).toEqual([]);
  });

  it('rejects a runtime import of ../shared/ipc-types', async () => {
    const errors = await tsImports(
      'src/preload/index.ts',
      "import { IPC } from '../shared/ipc-types';\nexport { IPC };",
    );
    expect(errors).toEqual([expect.stringContaining('preload')]);
  });
});

describe('main model is pure', () => {
  it('rejects electron and node built-ins', async () => {
    for (const mod of ['electron', 'node:fs', 'fs', 'path', 'node:path', 'fs/promises']) {
      const errors = await imports(MAIN_MODEL, `import * as m from '${mod}';\nexport { m };`);
      expect(errors, mod).not.toEqual([]);
    }
  });

  it('accepts a relative import and zod', async () => {
    const errors = await imports(
      MAIN_MODEL,
      "import { z } from 'zod';\nimport { a } from './a';\nexport { z, a };",
    );
    expect(errors).toEqual([]);
  });

  it('rejects export default', async () => {
    const errors = await messages(MAIN_MODEL, 'export default 1;', 'no-restricted-syntax');
    expect(errors).toEqual([expect.stringContaining('named exports')]);
  });

  it('does not restrict the rest of main', async () => {
    const errors = await imports(
      MAIN,
      "import { app } from 'electron';\nimport { join } from 'node:path';\nexport { app, join };",
    );
    expect(errors).toEqual([]);
  });
});

describe('app and clipboard-export models are DOM-free', () => {
  it.each(DOM_FREE_MODELS)('rejects react imports in %s', async (file) => {
    for (const mod of ['react', 'react-dom', 'electron']) {
      const errors = await imports(file, `import * as m from '${mod}';\nexport { m };`);
      expect(errors, mod).not.toEqual([]);
    }
  });

  it.each(DOM_FREE_MODELS)('rejects banned globals in %s', async (file) => {
    for (const name of ['document', 'setTimeout', 'Date']) {
      const errors = await messages(file, `export const x = ${name};`, 'no-restricted-globals');
      expect(errors, name).not.toEqual([]);
    }
  });

  it.each(DOM_FREE_MODELS)('rejects export default in %s', async (file) => {
    const errors = await messages(file, 'export default 1;', 'no-restricted-syntax');
    expect(errors).toEqual([expect.stringContaining('named exports')]);
  });

  it('does not apply the globals ban to the rest of the app', async () => {
    const errors = await messages(
      'src/renderer/app/x.tsx',
      'export const x = document;',
      'no-restricted-globals',
    );
    expect(errors).toEqual([]);
  });
});

describe('app and clipboard-export reach the editor only through its index', () => {
  const FILES = [
    'src/renderer/app/App.tsx',
    'src/renderer/app/model/keys.ts',
    'src/renderer/clipboard-export/Copy.tsx',
    'src/renderer/clipboard-export/model/x.ts',
  ];

  it.each(FILES)('rejects a deep editor import in %s', async (file) => {
    for (const path of ['../editor/state/controller', '../../editor/state/controller']) {
      const errors = await imports(file, `import { x } from '${path}';\nexport { x };`);
      expect(errors, path).toEqual([expect.stringContaining('editor')]);
    }
  });

  it('accepts ../editor and ../../editor', async () => {
    for (const [file, path] of [
      ['src/renderer/app/App.tsx', '../editor'],
      ['src/renderer/app/model/keys.ts', '../../editor'],
      ['src/renderer/clipboard-export/Copy.tsx', '../editor'],
    ] as const) {
      const errors = await imports(file, `import { x } from '${path}';\nexport { x };`);
      expect(errors, `${file} ${path}`).toEqual([]);
    }
  });

  it('accepts editor internals in a test file', async () => {
    const errors = await imports(
      'src/renderer/app/model/keys.test.ts',
      "import { x } from '../../editor/model/keymap';\nexport { x };",
    );
    expect(errors).toEqual([]);
  });

  it('keeps the other renderer import rules in these folders', async () => {
    const errors = await imports(
      'src/renderer/app/App.tsx',
      "import { History } from '@core/doc-model/history';\nexport { History };",
    );
    expect(errors).toEqual([expect.stringContaining('index')]);
  });
});
