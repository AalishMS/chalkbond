import { join } from 'node:path';
import { app, BrowserWindow, Menu, shell } from 'electron';
import { testFlags } from './model/args';

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
    },
  });

  win.once('ready-to-show', () => win.show());

  // Never open new Electron windows from page content; hand http(s) links to the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
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
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
