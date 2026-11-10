import { resolve } from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';

// Coverage instrumentation slows code several-fold; perf-budget tests skip their timing
// assertions when this is set (they still run uninstrumented in `npm test`).
const coverage = process.argv.some((a) => a === '--coverage' || a.startsWith('--coverage.'));

const TESTS = ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'];
const PERF = 'src/**/perf.test.ts';
const TOOLING = 'tests/tooling/**/*.test.ts';

export default defineConfig({
  resolve: {
    alias: { '@core': resolve(import.meta.dirname, 'src/core') },
  },
  test: {
    environment: 'node',
    env: { CHALKBOND_COVERAGE: coverage ? '1' : '' },
    // Instrumentation also pushes the heavy property / dictionary tests past the 5 s default.
    testTimeout: coverage ? 60_000 : 5_000,
    // Perf budgets time medians on a quiet CPU: they run as a second group, after every other
    // file has finished, one file at a time (in parallel with the rest they read ~3x slower).
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: TESTS, exclude: [PERF, TOOLING, ...configDefaults.exclude] },
      },
      {
        // ESLint probes and child processes pay a cold start (config load, type-aware setup)
        // that blew the 5 s default when 59 files ran in parallel. They run after the unit and
        // perf groups on a quiet CPU, with a generous timeout; probe files also warm ESLint in
        // a beforeAll so no single probe pays for it.
        extends: true,
        test: {
          name: 'tooling',
          include: [TOOLING],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
          sequence: { groupOrder: 2 },
        },
      },
      {
        extends: true,
        test: {
          name: 'perf',
          include: [PERF],
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts', 'src/renderer/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/__fixtures__/**', '**/index.ts'],
      reporter: ['text', 'html'],
    },
  },
});
