import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Module dependency rules from CAPABILITY-MAP.md. Each core module may import only the core
 * modules listed here. Keep in sync with the map.
 */
const CORE_DEPS = {
  'doc-model': [],
  'chem-core': ['doc-model'],
  'svg-render': ['doc-model', 'chem-core'],
  'clipboard-export': ['doc-model', 'svg-render'],
};
const CORE_MODULES = Object.keys(CORE_DEPS);

const NODE_BUILTINS = ['fs', 'path', 'os', 'child_process', 'crypto', 'url', 'util', 'stream'];

/** Restrictions shared by every file under src/core. */
const coreBaseRestrictions = {
  paths: [
    { name: 'react', message: 'src/core must stay UI-free (see SPEC.md boundaries).' },
    { name: 'react-dom', message: 'src/core must stay UI-free.' },
    { name: 'electron', message: 'src/core must not depend on Electron.' },
    ...NODE_BUILTINS.map((name) => ({ name, message: 'src/core must not use Node APIs.' })),
  ],
  patterns: [
    { regex: '^node:', message: 'src/core must not use Node APIs.' },
    {
      regex: '(^|/)(main|preload|renderer)(/|$)',
      message: 'src/core must not import app-shell or editor code.',
    },
  ],
};

function coreModuleConfig(mod) {
  const forbidden = CORE_MODULES.filter((m) => m !== mod && !CORE_DEPS[mod].includes(m));
  const patterns = [...coreBaseRestrictions.patterns];
  if (forbidden.length > 0) {
    patterns.push({
      regex: `(^|/|@core/)(${forbidden.join('|')})(/|$)`,
      message: `${mod} may only import: ${CORE_DEPS[mod].join(', ') || '(no other core modules)'} — see CAPABILITY-MAP.md.`,
    });
  }
  const paths = [...coreBaseRestrictions.paths];
  if (mod !== 'chem-core') {
    paths.push({ name: 'openchemlib', message: 'Only chem-core may import openchemlib.' });
  }
  return {
    files: [`src/core/${mod}/**/*.{ts,tsx}`],
    rules: { 'no-restricted-imports': ['error', { paths, patterns }] },
  };
}

export default tseslint.config(
  {
    ignores: ['out/**', 'dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Use named exports (SPEC.md code style).',
        },
      ],
    },
  },
  {
    // Config files are loaded by tools that require a default export.
    files: ['*.config.{ts,mts,mjs,js}'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // In tests `!` only asserts the shape of a fixture; a wrong guess fails the test anyway.
    files: ['**/*.test.{ts,tsx}', '**/__fixtures__/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    languageOptions: { globals: {} },
    rules: { 'no-restricted-imports': ['error', coreBaseRestrictions] },
  },
  ...CORE_MODULES.map(coreModuleConfig),
  prettier,
);
