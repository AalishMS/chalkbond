import { createClipboard } from './clipboard-export/clipboard';
import { join } from 'node:path';
import { app, BrowserWindow, Menu, screen, clipboard, ClipboardItem } from 'electron';
import { firstWindowBounds } from './model/window-bounds';
import type { StartupResponse } from '../shared/ipc-types';
import { testFlags } from './model/args';

import { pathToFileURL } from 'node:url';
import { CHANNELS } from '../shared/channels';
import { createIpc } from './ipc';
import {
  logErrorSchema,
  startupSchema,
  sessionUpdateSchema,
  clipboardWriteSchema,
  clipboardReadSchema,
} from './ipc-schemas';
import { createLogger } from './log';
import { DEV_ORIGIN, installSessionSecurity, installWebContentsSecurity } from './security';

installWebContentsSecurity();
let mainWindow: BrowserWindow | undefined;
const APP_ID = 'com.chalkbond.app';

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    useContentSize: true,
    autoHideMenuBar: false,
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'Untitled - Chalkbond',
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

  win.webContents.setZoomMode('disabled');
  win.on('page-title-updated', (event) => event.preventDefault());
  const [outerWidth = 0, outerHeight = 0] = win.getSize();
  const [contentWidth = 0, contentHeight = 0] = win.getContentSize();
  const frame: [number, number] = [outerWidth - contentWidth, outerHeight - contentHeight];
  // W6: minWidth/minHeight can constrain outer rather than content dimensions.
  win.setSize(200, 200);
  const minimum = win.getContentSize();
  if ((minimum[0] ?? 0) < 960 || (minimum[1] ?? 0) < 640) {
    win.setMinimumSize(960 + frame[0], 640 + frame[1]);
  }
  const { maximized, ...bounds } = firstWindowBounds(screen.getPrimaryDisplay().workArea, frame);
  win.setBounds(bounds);
  if (maximized) win.maximize();
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
  const clipboardPort = createClipboard(clipboard, ClipboardItem, (message) =>
    log('clipboard', message),
  );
  ipc.handle(CHANNELS.clipboardWrite, clipboardWriteSchema, clipboardPort.write);
  ipc.handle(CHANNELS.clipboardRead, clipboardReadSchema, clipboardPort.read);
  ipc.on(CHANNELS.logError, logErrorSchema, ({ message }) => log('renderer', message));
  ipc.handle(CHANNELS.startup, startupSchema, (): StartupResponse => ({
    settings: {
      newDrawingStyle: 'slides',
      export: { format: 'png', pngDpi: 300, pngWhite: false },
    },
    recovery: null,
    open: null,
  }));
  let session: { title: string; dirty: boolean } | undefined;
  ipc.on(CHANNELS.updateSession, sessionUpdateSchema, (value) => {
    if (session?.title !== value.title) mainWindow?.setTitle(value.title);
    session = value;
  });
  mainWindow = createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
