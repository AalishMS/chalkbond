import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@core': resolve(import.meta.dirname, 'src/core') },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts', 'src/renderer/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/__fixtures__/**', '**/index.ts'],
      reporter: ['text', 'html'],
    },
  },
});
