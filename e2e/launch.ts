import { expectNoNetwork } from './harness';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
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
  /**
   * TB31 perf probe: loads `probe-main.mjs` (a count of every IPC handle channel's calls on
   * `globalThis.__chalkbondProbe`, and a renderer preload that times the restore at start).
   */
  probe?: boolean;
  /** UI success shots only: stub main clipboard.write, retaining real flow and rasterisation. */
  clipboardWriteSuccess?: boolean;
  /** UI/model-success shots only: main's clipboard is an in-memory store (stub-clipboard-memory). */
  clipboardMemory?: boolean;
  /**
   * A packaged app (`dist/<platform>-unpacked/...`) instead of the built sources (A17). Nothing
   * is preloaded: a packaged Electron ignores `-r`, so the OS-mouse guard and the dialog stubs
   * cannot load, and the test flags (TH1) are not added (pass `extraArgs` to prove they are
   * ignored). `userData`, `dialogs` and the clipboard stubs do not apply. Only the Linux
   * switches are added.
   */
  executablePath?: string;
  /** Extra environment variables for the app (a packaged Linux run sets `XDG_CONFIG_HOME`). */
  env?: Record<string, string>;
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
  if (opts.executablePath !== undefined) {
    const packaged = await electron.launch({
      executablePath: opts.executablePath,
      args: [...(opts.extraArgs ?? []), ...linuxSwitches()],
      env: { ...inheritedEnv(), ...opts.env },
    });
    return withCloseGuard(packaged);
  }
  const ownedUserData =
    opts.userData === undefined ? mkdtempSync(join(tmpdir(), 'chalkbond-e2e-')) : undefined;
  const userData = opts.userData ?? ownedUserData ?? '';
  const app = await electron.launch({ args: appArgs(opts, userData), env: appEnv(opts) });
  if (ownedUserData !== undefined) {
    app.process().once('exit', () => {
      try {
        rmSync(ownedUserData, { recursive: true, force: true });
      } catch {
        // The OS may still hold a file for a moment; a leftover temp folder is harmless.
      }
    });
  }
  return withCloseGuard(app);
}

/** `close()` checks SEC4 (no unexpected request), then destroys the windows and closes. */
function withCloseGuard(app: ElectronApplication): ElectronApplication {
  const close = app.close.bind(app);
  app.close = async () => {
    try {
      await expectNoNetwork(app, expectedBlocked.get(app) ?? 0);
    } finally {
      // Teardown is not a test of closing: F13 would ask about a dirty drawing (a native box that
      // nobody answers). The windows are destroyed on the next turn, which skips their `close`
      // event as a gone renderer does; specs that test F13 close the window themselves.
      await app
        .evaluate(({ BrowserWindow }) => {
          setImmediate(() => {
            for (const win of BrowserWindow.getAllWindows()) win.destroy();
          });
        })
        .catch(() => undefined);
      await close();
    }
  };
  return app;
}

/**
 * The command line of every launch: the OS-mouse guard first, the optional stubs, the app, the
 * test flags (TH1), the extra arguments, then the Linux switches.
 */
function appArgs(opts: LaunchOptions, userData: string): string[] {
  return [
    '-r',
    resolve(__dirname, 'no-os-mouse.mjs'),
    ...(opts.dialogs === undefined ? [] : ['-r', resolve(__dirname, 'stub-dialogs.mjs')]),
    ...(opts.probe ? ['-r', resolve(__dirname, 'probe-main.mjs')] : []),
    ...(opts.clipboardWriteSuccess ? ['-r', resolve(__dirname, 'stub-clipboard-write.mjs')] : []),
    ...(opts.clipboardMemory ? ['-r', resolve(__dirname, 'stub-clipboard-memory.mjs')] : []),
    resolve(__dirname, '..'),
    ...(opts.testHooks === false ? [] : ['--chalkbond-test-hooks']),
    `--chalkbond-user-data=${userData}`,
    ...(opts.extraArgs ?? []),
    ...linuxSwitches(),
  ];
}

function linuxSwitches(): string[] {
  return process.platform === 'linux'
    ? ['--no-sandbox', ...(process.env['DISPLAY'] ? [] : ['--ozone-platform=headless'])]
    : [];
}

function inheritedEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

function appEnv(opts: LaunchOptions): Record<string, string> {
  return {
    ...inheritedEnv(),
    NODE_ENV: 'production',
    ...(opts.dialogs === undefined ? {} : { CHALKBOND_TEST_DIALOGS: JSON.stringify(opts.dialogs) }),
  };
}

/** The Electron binary Playwright launches (`require('electron')` outside Electron is its path). */
function electronBinary(): string {
  const resolved: unknown = createRequire(__filename)('electron');
  if (typeof resolved !== 'string') throw new Error('electron did not resolve to its binary');
  return resolved;
}

/**
 * F11, SC8: starts a second app process exactly as `launchApp` would (the OS-mouse guard, the same
 * flags and user-data folder) and resolves with its exit once it has ended. A running first app
 * holds the single-instance lock of that folder, so the second process hands its command line over
 * and quits. `userData` is required: without the first app's folder there is no lock to meet.
 * Rejects if the process has not exited within `timeoutMs` (it is killed then).
 */
export function launchSecondInstance(
  opts: LaunchOptions & { userData: string },
  timeoutMs = 15_000,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  const child = spawn(electronBinary(), appArgs(opts, opts.userData), {
    env: appEnv(opts),
    stdio: 'ignore',
  });
  return new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('the second instance did not exit'));
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolveExit({ code, signal });
    });
  });
}

// Deliberate SEC4 tests declare the precise expected count; all other launches require zero.
const expectedBlocked = new WeakMap<ElectronApplication, number>();
export function expectBlockedRequests(app: ElectronApplication, count: number): void {
  expectedBlocked.set(app, count);
}
