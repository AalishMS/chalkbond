import { join } from 'node:path';
import { app, BrowserWindow, Menu } from 'electron';
import { testFlags } from './model/args';

import { pathToFileURL } from 'node:url';
import { CHANNELS } from '../shared/channels';
import { createIpc } from './ipc';
import { logErrorSchema } from './ipc-schemas';
import { createLogger } from './log';
import { DEV_ORIGIN, installSessionSecurity, installWebContentsSecurity } from './security';

installWebContentsSecurity();
let mainWindow: BrowserWindow | undefined;
const APP_ID = 'com.chalkbond.app';

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'Chalkbond',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
      devTools: !app.isPackaged,
    },
  });

  win.once('ready-to-show', () => win.show());

  const devUrl = process.env['ELECTRON_RENDERER_URL'] === DEV_ORIGIN ? DEV_ORIGIN : undefined;
  if (!app.isPackaged && devUrl) {
    void win.loadURL(flags.hooks ? `${devUrl}?testHooks=1` : devUrl);
  } else {
    void win.loadFile(
      join(__dirname, '../renderer/index.html'),
      flags.hooks ? { query: { testHooks: '1' } } : undefined,
    );
  }
  return win;
}

// Test flags (TH1): honoured only for an unpackaged build. The user-data folder is set before
// anything else, so settings, logs and the single-instance lock all live in it.
const flags = testFlags(process.argv, app.isPackaged);
if (flags.userData !== null) app.setPath('userData', flags.userData);
if (flags.hooks) {
  (globalThis as { __chalkbondTestMain?: { blockedRequests: number } }).__chalkbondTestMain = {
    blockedRequests: 0,
  };
}

app.setAppUserModelId(APP_ID);

void app.whenReady().then(() => {
  // No default menu: its accelerators (Ctrl+0, Ctrl+=) would zoom the page and steal editor keys.
  Menu.setApplicationMenu(null);
  const log = createLogger(app.getPath('userData'));
  installSessionSecurity(
    (message) => log('security', message),
    () => {
      const hook = (globalThis as { __chalkbondTestMain?: { blockedRequests: number } })
        .__chalkbondTestMain;
      if (hook) hook.blockedRequests++;
    },
  );
  const appUrl =
    !app.isPackaged && process.env['ELECTRON_RENDERER_URL'] === DEV_ORIGIN
      ? new URL(DEV_ORIGIN).href
      : pathToFileURL(join(__dirname, '../renderer/index.html')).href;
  const ipc = createIpc(
    () => mainWindow,
    appUrl,
    (message) => log('ipc', message),
  );
  ipc.on(CHANNELS.logError, logErrorSchema, ({ message }) => log('renderer', message));
  mainWindow = createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
