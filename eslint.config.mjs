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
  const configs = [];
  if (mod === 'chem-core') {
    // Inside chem-core, only the adapter (and tests pinning library facts) touch OpenChemLib.
    configs.push({
      files: [`src/core/${mod}/**/*.{ts,tsx}`],
      rules: {
        'no-restricted-imports': ['error', { paths: coreBaseRestrictions.paths, patterns }],
      },
    });
    configs.push({
      files: [`src/core/${mod}/**/*.{ts,tsx}`],
      ignores: [`src/core/${mod}/ocl.ts`, `src/core/${mod}/**/*.test.ts`],
      rules: {
        'no-restricted-imports': [
          'error',
          { paths: [...coreBaseRestrictions.paths, OCL_ADAPTER_ONLY], patterns },
        ],
      },
    });
  } else {
    configs.push({
      files: [`src/core/${mod}/**/*.{ts,tsx}`],
      rules: {
        'no-restricted-imports': [
          'error',
          { paths: [...coreBaseRestrictions.paths, OCL_CHEM_CORE_ONLY], patterns },
        ],
      },
    });
  }
  return configs;
}

const OCL_CHEM_CORE_ONLY = {
  name: 'openchemlib',
  message: 'Only chem-core may import openchemlib.',
};
const OCL_ADAPTER_ONLY = {
  name: 'openchemlib',
  message: 'Within chem-core only ocl.ts may import openchemlib; use its adapter.',
};

/**
 * Renderer code reaches core only through a module's public index (`@core/<module>`), never by a
 * relative path into src/core or a deep file. Fixtures are the one exception, in tests only.
 * A block that sets no-restricted-imports REPLACES the earlier one for its files, so every block
 * below repeats the openchemlib ban and these patterns.
 */
function rendererImportRules(allowFixtures, extraPaths = [], extraPatterns = []) {
  return [
    'error',
    {
      paths: [OCL_CHEM_CORE_ONLY, ...extraPaths],
      patterns: [
        {
          regex: '(^|/)core/',
          message: 'Import core modules as @core/<module>, not by a relative path into src/core.',
        },
        {
          regex: allowFixtures ? '^@core/[^/]+/(?!__fixtures__/)' : '^@core/[^/]+/',
          message:
            'Import core modules through their index (@core/<module>); deep paths are not public.',
        },
        ...extraPatterns,
      ],
    },
  ];
}

/** Editor logic (model, tools, state) must run in plain node: no React, DOM, clock or timers. */
const EDITOR_PURE_GLOBALS = [
  'window',
  'document',
  'navigator',
  'requestAnimationFrame',
  'performance',
  'setTimeout',
  'Date',
];

function rendererConfigs() {
  const pureFiles = ['model', 'tools', 'state'].map(
    (d) => `src/renderer/editor/${d}/**/*.{ts,tsx}`,
  );
  const pureTestFiles = ['model', 'tools', 'state'].map(
    (d) => `src/renderer/editor/${d}/**/*.test.{ts,tsx}`,
  );
  const domMessage = 'Editor model, tools and state must stay DOM-free (SPEC-editor.md).';
  const pureImports = (allowFixtures) =>
    rendererImportRules(
      allowFixtures,
      ['react', 'react-dom', 'electron'].map((name) => ({ name, message: domMessage })),
      [{ regex: '^(react|react-dom|electron)/', message: domMessage }],
    );
  return [
    {
      files: ['src/renderer/**/*.{ts,tsx}'],
      rules: { 'no-restricted-imports': rendererImportRules(false) },
    },
    {
      files: ['src/renderer/**/*.test.{ts,tsx}'],
      rules: { 'no-restricted-imports': rendererImportRules(true) },
    },
    {
      files: pureFiles,
      rules: {
        'no-restricted-imports': pureImports(false),
        'no-restricted-globals': [
          'error',
          ...EDITOR_PURE_GLOBALS.map((name) => ({
            name,
            message: `${name} is banned in editor model, tools and state (pure logic).`,
          })),
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
      files: pureTestFiles,
      rules: { 'no-restricted-imports': pureImports(true) },
    },
  ];
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
  {
    // Outside src/core: app-shell, editor, tests and tooling never touch OpenChemLib directly.
    files: ['src/{main,preload,renderer}/**/*.{ts,tsx}', 'tests/**/*.ts', 'e2e/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { paths: [OCL_CHEM_CORE_ONLY] }] },
  },
  ...CORE_MODULES.flatMap(coreModuleConfig),
  ...rendererConfigs(),
  {
    // svg-render output must be byte-identical on every machine (SPEC-svg-render.md
    // "Determinism"): no maths whose V8 results have differed between platforms, no clock,
    // randomness or locale. Overriding no-restricted-syntax replaces the global rule, so the
    // named-exports restriction is repeated here.
    files: ['src/core/svg-render/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...['pow', 'hypot', 'exp', 'log', 'tan', 'random'].map((property) => ({
          object: 'Math',
          property,
          message: `Math.${property} is banned in svg-render (determinism).`,
        })),
        ...['localeCompare', 'toLocaleString'].map((property) => ({
          property,
          message: `${property} is locale-dependent; banned in svg-render (determinism).`,
        })),
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'No clock in svg-render (determinism).' },
        { name: 'Intl', message: 'No locale formatting in svg-render (determinism).' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Use named exports (SPEC.md code style).',
        },
        {
          selector: "BinaryExpression[operator='**'], AssignmentExpression[operator='**=']",
          message: '`**` is banned in svg-render (determinism); multiply instead.',
        },
      ],
    },
  },
  prettier,
);
