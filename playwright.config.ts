import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'e2e', testMatch: /.*\.spec\.ts/ },
    { name: 'shots', testMatch: /.*\.shot\.ts/ },
  ],
});
