// A17 (SPEC-app-shell.md "Packaging", SEC12, I1): a smoke test of the unpacked packaged app.
// Build it first: `npm run dist:win` (Windows, release gate) or, as a development check on Linux,
// `npx electron-vite build && npx electron-builder --linux dir`. Run: `npm run test:packaged`.
//
// Exception to the usual e2e rules: a packaged Electron ignores `-r`, so `no-os-mouse.mjs` and
// `stub-dialogs.mjs` cannot be loaded into it. This test therefore sends no pointer input and
// asserts nothing that depends on hover. On Windows it uses the real `%APPDATA%\Chalkbond` (test
// flags are ignored by design; it only reads and closes); on Linux a fresh `XDG_CONFIG_HOME`.
import { expect, test, type ElectronApplication } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { clickMenu } from '../app-menu';
import { launchApp } from '../launch';

const ROOT = resolve(__dirname, '../..');
const VERSION = (
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }
).version;

function unpackedExecutable(): string {
  return process.platform === 'win32'
    ? join(ROOT, 'dist', 'win-unpacked', 'Chalkbond.exe')
    : join(ROOT, 'dist', 'linux-unpacked', 'chalkbond');
}

let configHome: string | undefined;
let app: ElectronApplication;

test.beforeAll(async () => {
  const executablePath = unpackedExecutable();
  expect(existsSync(executablePath), `build the unpacked app first: ${executablePath}`).toBe(true);
  if (process.platform !== 'win32') configHome = mkdtempSync(join(tmpdir(), 'chalkbond-packaged-'));
  app = await launchApp({
    executablePath,
    // SEC12: the flag is passed and must be ignored by a packaged app.
    extraArgs: ['--chalkbond-test-hooks'],
    ...(configHome === undefined ? {} : { env: { XDG_CONFIG_HOME: configHome } }),
  });
});

test.afterAll(async () => {
  await app.close();
  if (configHome !== undefined) rmSync(configHome, { recursive: true, force: true });
});

test('the packaged app starts with the untitled window title', async () => {
  await app.firstWindow();
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle()))
    .toBe('Untitled - Chalkbond');
  expect(await app.evaluate(({ app: electronApp }) => electronApp.isPackaged)).toBe(true);
});

test('SEC12: no test hook exists although the flag was passed', async () => {
  const page = await app.firstWindow();
  expect(
    await page.evaluate(() => 'undefined' === typeof (window as never)['__chalkbondTest']),
  ).toBe(true);
  expect(
    await app.evaluate(
      () => (globalThis as { __chalkbondTestMain?: unknown }).__chalkbondTestMain === undefined,
    ),
  ).toBe(true);
});

test('the application menu has File, Edit, View and Help', async () => {
  const labels = await app.evaluate(({ Menu }) =>
    (Menu.getApplicationMenu()?.items ?? []).map((item) => item.label),
  );
  expect(labels).toEqual(['&File', '&Edit', '&View', '&Help']);
});

test('About shows the package.json version', async () => {
  // The native box is replaced from the test's side (main-process evaluate), as a dialog stub
  // cannot be preloaded into a packaged app.
  await app.evaluate(({ dialog }) => {
    const seen: unknown[] = [];
    (globalThis as { __aboutSeen?: unknown[] }).__aboutSeen = seen;
    (dialog as { showMessageBox: unknown }).showMessageBox = (...args: unknown[]) => {
      seen.push(args[args.length - 1]);
      return Promise.resolve({ response: 0, checkboxChecked: false });
    };
  });
  await clickMenu(app, 'help.about');
  await expect
    .poll(() =>
      app.evaluate(
        () =>
          ((globalThis as { __aboutSeen?: { message?: string }[] }).__aboutSeen ?? [])[0]?.message,
      ),
    )
    .toBe(`Chalkbond ${VERSION}`);
});

test('resources hold THIRD-PARTY-NOTICES.txt and icon.png', async () => {
  const resources = await app.evaluate(() => process.resourcesPath);
  expect(existsSync(join(resources, 'THIRD-PARTY-NOTICES.txt'))).toBe(true);
  expect(existsSync(join(resources, 'icon.png'))).toBe(true);
});

test('Electron and Chromium licence files ship beside the executable (named in the notices)', () => {
  const beside = dirname(unpackedExecutable());
  expect(existsSync(join(beside, 'LICENSE.electron.txt'))).toBe(true);
  expect(existsSync(join(beside, 'LICENSES.chromium.html'))).toBe(true);
});

test('I1: the effective electron-builder config', () => {
  const file = join(ROOT, 'dist', 'builder-effective-config.yaml');
  expect(
    existsSync(file),
    'electron-builder writes it only when its output is a terminal and CI is unset',
  ).toBe(true);
  const yaml = readFileSync(file, 'utf8');
  for (const line of [
    '  oneClick: true',
    '  perMachine: false',
    '  - ext: chalk',
    '    icon: chalk-file.ico',
    'publish: null',
    'electronLanguages:\n  - en-US\n',
  ]) {
    expect(yaml, line).toContain(line);
  }
});

test('R29: the app archive holds only out/main, out/preload and out/renderer under out/', () => {
  // The asar CLI that electron-builder brings (no dependency of ours); it lists every entry.
  const archive = join(dirname(unpackedExecutable()), 'resources', 'app.asar');
  expect(existsSync(archive), `no app archive: ${archive}`).toBe(true);
  const entries = execFileSync(
    process.execPath,
    [join(ROOT, 'node_modules', '@electron', 'asar', 'bin', 'asar.js'), 'list', archive],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
    .split(/\r?\n/)
    .filter((line) => line !== '')
    .map((line) => line.split(String.fromCharCode(92)).join('/').replace(/^[/]/, ''));
  const underOut = new Set(
    entries.filter((e) => e.startsWith('out/')).map((e) => e.split('/')[1] ?? ''),
  );
  expect([...underOut].sort()).toEqual(['main', 'preload', 'renderer']);
  expect(entries).toContain('package.json');
});
