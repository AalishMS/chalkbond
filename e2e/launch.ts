import { resolve } from 'node:path';
import { _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * Launches the built app (run `npm run build` first; `npm run test:e2e` does).
 *
 * Linux only: dev machines may lack a root-owned chrome-sandbox helper and a display, so the
 * OS sandbox is disabled and Chromium's headless backend is used. Windows runs unmodified.
 */
export async function launchApp(): Promise<ElectronApplication> {
  const linuxArgs =
    process.platform === 'linux'
      ? ['--no-sandbox', ...(process.env['DISPLAY'] ? [] : ['--ozone-platform=headless'])]
      : [];
  return electron.launch({
    args: [resolve(__dirname, '..'), ...linuxArgs],
    env: { ...process.env, NODE_ENV: 'production' },
  });
}
