import { builtinModules } from 'node:module';
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

/**
 * app-shell and clipboard-export (renderer) reach the editor only through its public index:
 * `../editor` or `../../editor`. Tests are exempt.
 */
const EDITOR_INDEX_ONLY = {
  regex: '(^|/)editor/',
  message:
    'Import the editor only through its index (../editor); its internals are not public (SPEC-app-shell.md).',
};

function rendererConfigs() {
  // Pure folders: the editor's model, tools and state, plus the pure models of the shell.
  const pureDirs = [
    'src/renderer/editor/model',
    'src/renderer/editor/tools',
    'src/renderer/editor/state',
    'src/renderer/app/model',
    'src/renderer/clipboard-export/model',
  ];
  const shellDirs = ['src/renderer/app', 'src/renderer/clipboard-export'];
  const pureFiles = pureDirs.map((d) => `${d}/**/*.{ts,tsx}`);
  const pureTestFiles = pureDirs.map((d) => `${d}/**/*.test.{ts,tsx}`);
  const shellFiles = shellDirs.map((d) => `${d}/**/*.{ts,tsx}`);
  const shellPureFiles = pureFiles.filter((f) => !f.includes('/editor/'));
  const domMessage =
    'Editor and shell model, tools and state must stay DOM-free (SPEC-editor.md, SPEC-app-shell.md).';
  const pureImports = (allowFixtures, extraPatterns = []) =>
    rendererImportRules(
      allowFixtures,
      ['react', 'react-dom', 'electron'].map((name) => ({ name, message: domMessage })),
      [{ regex: '^(react|react-dom|electron)/', message: domMessage }, ...extraPatterns],
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
      files: shellFiles,
      ignores: ['**/*.test.{ts,tsx}'],
      rules: { 'no-restricted-imports': rendererImportRules(false, [], [EDITOR_INDEX_ONLY]) },
    },
    {
      files: shellPureFiles,
      ignores: ['**/*.test.{ts,tsx}'],
      rules: { 'no-restricted-imports': pureImports(false, [EDITOR_INDEX_ONLY]) },
    },
    {
      files: pureFiles.filter((f) => f.includes('/editor/')),
      rules: { 'no-restricted-imports': pureImports(false) },
    },
    {
      files: pureFiles,
      rules: {
        'no-restricted-globals': [
          'error',
          ...EDITOR_PURE_GLOBALS.map((name) => ({
            name,
            message: `${name} is banned in editor and shell model, tools and state (pure logic).`,
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

/** main and preload may not reach core at all (SPEC-app-shell.md "Code"): not `@core`, not a path. */
const NO_CORE_PATTERNS = [
  {
    regex: '^@core(/|$)',
    message: 'main and preload must not import src/core; core runs in the renderer.',
  },
  {
    regex: '(^|/)core(/|$)',
    message: 'main and preload must not import src/core (no relative path into it either).',
  },
];

/** `src/main/model` is pure: no Electron, no Node built-in, in or out of tests. */
const NODE_BUILTIN_NAMES = builtinModules.filter((name) => !name.startsWith('_'));
const MAIN_MODEL_MESSAGE =
  'src/main/model must stay pure: no electron and no Node built-ins (SPEC-app-shell.md).';

const PRELOAD_MESSAGE =
  'preload may import at runtime only electron and ../shared/channels (type-only imports are free).';

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
    // A block that sets no-restricted-imports replaces the earlier one: the openchemlib ban is
    // repeated here.
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [OCL_CHEM_CORE_ONLY], patterns: NO_CORE_PATTERNS },
      ],
    },
  },
  {
    files: ['src/preload/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!electron$|\\.\\./shared/channels$)',
              allowTypeImports: true,
              message: PRELOAD_MESSAGE,
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/main/model/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            OCL_CHEM_CORE_ONLY,
            { name: 'electron', message: MAIN_MODEL_MESSAGE },
            ...NODE_BUILTIN_NAMES.map((name) => ({ name, message: MAIN_MODEL_MESSAGE })),
          ],
          patterns: [
            ...NO_CORE_PATTERNS,
            { regex: '^(node:|electron/)', message: MAIN_MODEL_MESSAGE },
          ],
        },
      ],
    },
  },
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
