import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Coverage instrumentation slows code several-fold; perf-budget tests skip their timing
// assertions when this is set (they still run uninstrumented in `npm test`).
const coverage = process.argv.some((a) => a === '--coverage' || a.startsWith('--coverage.'));

export default defineConfig({
  resolve: {
    alias: { '@core': resolve(import.meta.dirname, 'src/core') },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    environment: 'node',
    env: { CHALKBOND_COVERAGE: coverage ? '1' : '' },
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts', 'src/renderer/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/__fixtures__/**', '**/index.ts'],
      reporter: ['text', 'html'],
    },
  },
});
