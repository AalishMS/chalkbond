import { resolve } from 'node:path';
import { _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * Launches the built app (run `npm run build` first; `npm run test:e2e` does).
 *
 * Linux only: dev machines may lack a root-owned chrome-sandbox helper and a display, so the
 * OS sandbox is disabled and Chromium's headless backend is used.
 *
 * Every platform: `no-os-mouse.mjs` is preloaded into the main process and makes each test window
 * ignore OS mouse input, so the physical cursor cannot interleave real pointer events with
 * Playwright's. The production entry point never loads it.
 */
export async function launchApp(extraArgs: string[] = []): Promise<ElectronApplication> {
  const linuxArgs =
    process.platform === 'linux'
      ? ['--no-sandbox', ...(process.env['DISPLAY'] ? [] : ['--ozone-platform=headless'])]
      : [];
  return electron.launch({
    args: [
      '-r',
      resolve(__dirname, 'no-os-mouse.mjs'),
      resolve(__dirname, '..'),
      ...extraArgs,
      ...linuxArgs,
    ],
    env: { ...process.env, NODE_ENV: 'production' },
  });
}
