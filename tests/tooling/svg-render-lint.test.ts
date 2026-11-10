import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Lints in-memory source as if it lived at `filePath`, so no probe files exist in the repo.
const eslint = new ESLint({ cwd: process.cwd() });

async function ruleIds(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'parse-error');
}

const IN = 'src/core/svg-render/probe.ts';

const BANNED = [
  'export const x = Math.pow(2, 3);',
  'export const x = 2 ** 3;',
  'let x = 2;\nx **= 3;\nexport { x };',
  'export const x = Math.hypot(3, 4);',
  'export const x = Math.exp(1);',
  'export const x = Math.log(2);',
  'export const x = Math.tan(1);',
  'export const x = Math.random();',
  'export const x = Date.now();',
  'export const x = new Date();',
  "export const x = new Intl.NumberFormat('en').format(1);",
  "export const x = 'a'.localeCompare('b');",
  'export const x = (1).toLocaleString();',
];

const ALLOWED = [
  'export const x = Math.sqrt(2) + Math.sin(1) + Math.cos(1) + Math.atan2(1, 2);',
  'export const x = Math.abs(-1) + Math.min(1, 2) + Math.max(1, 2) + Math.round(1.5) + Math.floor(1.5);',
  "export const x = ['b', 'a'].sort();",
];

describe('svg-render determinism lint block (SPEC-svg-render.md "Determinism")', () => {
  it.each(BANNED)('rejects %s in src/core/svg-render', async (code) => {
    const ids = await ruleIds(IN, code);
    expect(
      ids.some(
        (id) =>
          id === 'no-restricted-properties' ||
          id === 'no-restricted-syntax' ||
          id === 'no-restricted-globals',
      ),
    ).toBe(true);
  });

  it.each([
    'src/core/svg-render/sub/deeper.ts',
    'src/core/svg-render/probe.test.ts',
    'src/core/svg-render/__fixtures__/probe.ts',
  ])('applies to %s', async (filePath) => {
    expect((await ruleIds(filePath, 'export const x = Math.tan(1);')).length).toBeGreaterThan(0);
  });

  it.each(ALLOWED)('allows the permitted maths: %s', async (code) => {
    expect(await ruleIds(IN, code)).toEqual([]);
  });

  it.each([
    'src/core/doc-model/probe.ts',
    'src/core/chem-core/probe.ts',
    'src/core/clipboard-export/probe.ts',
    'src/renderer/editor/probe.ts',
    'tests/tooling/probe.ts',
  ])('does not apply to %s', async (filePath) => {
    const code =
      "export const x = Math.pow(2, 3) + 2 ** 3 + Math.tan(1) + Date.now() + 'a'.localeCompare('b');";
    expect(await ruleIds(filePath, code)).toEqual([]);
  });

  it('keeps the named-exports rule inside the block', async () => {
    const ids = await ruleIds(IN, 'const x = 1;\nexport default x;');
    expect(ids).toContain('no-restricted-syntax');
  });

  it('still applies the import boundaries to svg-render', async () => {
    const ids = await ruleIds(IN, "import { x } from '../clipboard-export/index';\nexport { x };");
    expect(ids).toContain('no-restricted-imports');
  });
});

describe('.gitattributes', () => {
  it('pins the goldens to LF', () => {
    const lines = readFileSync('.gitattributes', 'utf8').split(/\r?\n/);
    expect(lines).toContain('src/core/svg-render/__golden__/** text eol=lf');
  });
});
