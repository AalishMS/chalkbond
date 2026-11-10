import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  projects: [
    // `os-input` moves the real mouse cursor, so it has its own project and script.
    { name: 'e2e', testMatch: /.*\.spec\.ts/, testIgnore: /[\\/]os-input[\\/]/ },
    { name: 'shots', testMatch: /.*\.shot\.ts/ },
    { name: 'os-input', testMatch: /[\\/]os-input[\\/].*\.spec\.ts/ },
  ],
});
