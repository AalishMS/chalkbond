import { expectNoNetwork } from './harness';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, type ElectronApplication } from '@playwright/test';

export interface LaunchOptions {
  /** More arguments for the app (after its path). */
  extraArgs?: string[];
  /** `--chalkbond-test-hooks` (default true). False launches as an installed app would start. */
  testHooks?: boolean;
  /**
   * The `userData` folder (`--chalkbond-user-data`). Default: a fresh temp folder per launch,
   * removed when the app exits. Pass one to relaunch with the same data (never removed).
   */
  userData?: string;
  /**
   * Scripted answers for `dialog.showMessageBox`, `showOpenDialog` and `showSaveDialog`, used in
   * order; loads `stub-dialogs.mjs` before the app's code runs.
   */
  dialogs?: unknown[];
}

/**
 * Launches the built app (run `npm run build` first; `npm run test:e2e` does).
 *
 * Linux only: dev machines may lack a root-owned chrome-sandbox helper and a display, so the
 * OS sandbox is disabled and Chromium's headless backend is used.
 *
 * Every platform: `no-os-mouse.mjs` is preloaded into the main process and makes each test window
 * ignore OS mouse input, so the physical cursor cannot interleave real pointer events with
 * Playwright's. `stub-dialogs.mjs` is preloaded only when `dialogs` is given. The production
 * entry point loads neither.
 *
 * `options` may also be a plain array of extra arguments (the older form).
 */
export async function launchApp(
  options: LaunchOptions | string[] = {},
): Promise<ElectronApplication> {
  const opts: LaunchOptions = Array.isArray(options) ? { extraArgs: options } : options;
  const linuxArgs =
    process.platform === 'linux'
      ? ['--no-sandbox', ...(process.env['DISPLAY'] ? [] : ['--ozone-platform=headless'])]
      : [];
  const ownedUserData =
    opts.userData === undefined ? mkdtempSync(join(tmpdir(), 'chalkbond-e2e-')) : undefined;
  const userData = opts.userData ?? ownedUserData;
  const dialogArgs =
    opts.dialogs === undefined ? [] : ['-r', resolve(__dirname, 'stub-dialogs.mjs')];
  const app = await electron.launch({
    args: [
      '-r',
      resolve(__dirname, 'no-os-mouse.mjs'),
      ...dialogArgs,
      resolve(__dirname, '..'),
      ...(opts.testHooks === false ? [] : ['--chalkbond-test-hooks']),
      `--chalkbond-user-data=${userData}`,
      ...(opts.extraArgs ?? []),
      ...linuxArgs,
    ],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ...(opts.dialogs === undefined
        ? {}
        : { CHALKBOND_TEST_DIALOGS: JSON.stringify(opts.dialogs) }),
    },
  });
  if (ownedUserData !== undefined) {
    app.process().once('exit', () => {
      try {
        rmSync(ownedUserData, { recursive: true, force: true });
      } catch {
        // The OS may still hold a file for a moment; a leftover temp folder is harmless.
      }
    });
  }
  const close = app.close.bind(app);
  app.close = async () => {
    try {
      await expectNoNetwork(app, expectedBlocked.get(app) ?? 0);
    } finally {
      await close();
    }
  };
  return app;
}

// Deliberate SEC4 tests declare the precise expected count; all other launches require zero.
const expectedBlocked = new WeakMap<ElectronApplication, number>();
export function expectBlockedRequests(app: ElectronApplication, count: number): void {
  expectedBlocked.set(app, count);
}
