import { createClipboard } from './clipboard-export/clipboard';
import { createPdfPrinter } from './clipboard-export/pdf';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  app,
  BrowserWindow,
  Menu,
  screen,
  clipboard,
  ClipboardItem,
  dialog,
  nativeImage,
  shell,
} from 'electron';
import packageJson from '../../package.json';
import { createAbout } from './about';
import { createDialogs } from './dialogs';
import { createFiles } from './files';
import { createFileRefs } from './model/file-refs';
import { createSessionFolders } from './model/session-folders';
import {
  firstWindowBounds,
  restoredWindowBounds,
  type RememberedWindow,
} from './model/window-bounds';
import { rendererSettings, withRendererSettings } from './model/settings';
import { createSettingsStore, type SettingsStore } from './settings-io';
import type { ReadFileResponse, StartupResponse } from '../shared/ipc-types';
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
  askSchema,
  chooseOpenSchema,
  chooseSaveSchema,
  fileErrorSchema,
  readFileSchema,
  writeFileSchema,
  printPdfSchema,
  sessionFileSchema,
  closeOkSchema,
  setSettingsSchema,
  contextMenuSchema,
} from './ipc-schemas';
import { createLogger } from './log';
import { createAppMenu, createContextMenus } from './menu';
import { DEV_ORIGIN, installSessionSecurity, installWebContentsSecurity } from './security';

installWebContentsSecurity();
let mainWindow: BrowserWindow | undefined;
let settings: SettingsStore | undefined;
const APP_ID = 'com.chalkbond.app';

function createMainWindow(remembered: RememberedWindow | null): BrowserWindow {
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
  // W2: the remembered window if half of it lies on the display it matches best; else W1.
  const restored =
    remembered === null
      ? null
      : restoredWindowBounds(remembered, screen.getDisplayMatching(remembered).workArea);
  const { maximized, ...bounds } =
    restored ?? firstWindowBounds(screen.getPrimaryDisplay().workArea, frame);
  win.setBounds(bounds);
  // Maximize after the bounds, so un-maximizing gives the remembered normal bounds back.
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

void app.whenReady().then(async () => {
  const log = createLogger(app.getPath('userData'));
  // M1–M3 (O3): our menu replaces Electron's default, whose registered accelerators (Ctrl+0,
  // Ctrl+=) would zoom the page and steal editor keys. Installed before the window exists, so W6
  // measures the frame with the menu bar in it.
  const appMenu = createAppMenu({
    Menu,
    command: (command) =>
      mainWindow?.webContents.send(CHANNELS.mainEvent, { type: 'command', command }),
    text: (method) => mainWindow?.webContents[method](),
    exit: () => mainWindow?.close(),
    about: () => void about.show(),
    // Open recent (A15): the list is empty until then, so these items are never enabled.
    recent: () => undefined,
  });
  appMenu.apply(appMenu.state());
  // AB1: the icon and the licence notices ship in resources/ (I1) or sit in build/ (dev).
  const about = createAbout({
    box: (options) =>
      mainWindow ? dialog.showMessageBox(mainWindow, options) : dialog.showMessageBox(options),
    // SEC11: the only shell.openPath call site; it opens nothing but the bundled notices.
    openPath: (path) => shell.openPath(path),
    image: (path) => nativeImage.createFromPath(path),
    folder: app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'build'),
    version: app.getVersion(),
    author: packageJson.author,
    log: (message) => log('about', message),
  });
  // Settings (ST1, ST2, W2): read once before the window exists; written 500 ms after a change.
  const store = createSettingsStore({
    file: join(app.getPath('userData'), 'settings.json'),
    log: (message) => log('settings', message),
  });
  settings = store;
  await store.load();
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
  // Files (A7): the renderer holds opaque refs only (R8); paths stay in this registry.
  const refs = createFileRefs(() => randomUUID());
  const files = createFiles({ log: (message) => log('files', message) });
  const entryOf = (id: string) => {
    const entry = refs.get(id);
    if (!entry) throw new Error('Unknown file ref');
    return entry;
  };
  const documents = (): string => app.getPath('documents');
  // F2, F6, ST2: the last open, save and export folders, remembered in settings.json.
  const folders = createSessionFolders(documents, store.get().folders, (next) =>
    store.update((s) => ({ ...s, folders: next })),
  );
  const dialogs = createDialogs({
    port: {
      open: (options) =>
        mainWindow ? dialog.showOpenDialog(mainWindow, options) : dialog.showOpenDialog(options),
      save: (options) =>
        mainWindow ? dialog.showSaveDialog(mainWindow, options) : dialog.showSaveDialog(options),
      box: (options) =>
        mainWindow ? dialog.showMessageBox(mainWindow, options) : dialog.showMessageBox(options),
    },
    refs,
    exists: (path) =>
      stat(path).then(
        () => true,
        () => false,
      ),
    // N2 decides the folders for this run (A10 persists them).
    folders: { open: () => folders.openFolder(), save: (format) => folders.saveFolder(format) },
  });
  ipc.handle(CHANNELS.chooseOpen, chooseOpenSchema, () => dialogs.chooseOpen());
  ipc.handle(CHANNELS.readFile, readFileSchema, async ({ ref }): Promise<ReadFileResponse> => {
    const result = await files.read(entryOf(ref).path);
    if (result.ok) return result;
    // A ref always has an Open extension, so `unsupported` cannot answer I2.
    return { ok: false, problem: result.problem === 'unsupported' ? 'unreadable' : result.problem };
  });
  ipc.handle(CHANNELS.chooseSave, chooseSaveSchema, async ({ format, suggestedName }) => {
    const ref = await dialogs.chooseSave(format, suggestedName);
    // ST2: an Export Save dialog (every format but .chalk) remembers its folder.
    const entry = ref === null || format === 'chalk' ? undefined : refs.get(ref.id);
    if (entry) folders.exported(entry);
    return ref;
  });
  ipc.handle(CHANNELS.writeFile, writeFileSchema, ({ ref, data }) =>
    files.write(entryOf(ref), data),
  );
  // C5 (PD1): a hidden window prints the export SVG; window and temp folder go in a finally.
  ipc.handle(
    CHANNELS.printPdf,
    printPdfSchema,
    createPdfPrinter({
      tempRoot: () => app.getPath('temp'),
      mkdtemp: (prefix) => mkdtemp(prefix),
      writeFile: (path, text) => writeFile(path, text, 'utf8'),
      rm: (path) => rm(path, { recursive: true, force: true }),
      newWindow: (options) => new BrowserWindow(options),
      log: (message) => log('pdf', message),
    }),
  );
  ipc.handle(CHANNELS.ask, askSchema, (request) => dialogs.ask(request));
  ipc.handle(CHANNELS.showFileError, fileErrorSchema, ({ problem, name }) =>
    dialogs.showFileError(problem, name),
  );
  ipc.on(CHANNELS.logError, logErrorSchema, ({ message }) => log('renderer', message));
  // CM1–CM3 (A13): the canvas menu on request (I6); the text-field menu from webContents.
  const contextMenus = createContextMenus({ Menu, window: () => mainWindow });
  ipc.handle(CHANNELS.showContextMenu, contextMenuSchema, (request) => contextMenus.show(request));
  // I7 with ST2: the renderer's view only (no path, folder, window or recent list).
  ipc.handle(CHANNELS.startup, startupSchema, (): StartupResponse => ({
    settings: rendererSettings(store.get()),
    recovery: null,
    open: null,
  }));
  // I8: a strict partial RendererSettings (preset switches, Export choices).
  ipc.handle(CHANNELS.setSettings, setSettingsSchema, (change) => {
    store.update((s) => withRendererSettings(s, change));
  });
  let session: { title: string; dirty: boolean } | undefined;
  let closing: ReturnType<typeof guardClose> | undefined;
  ipc.on(CHANNELS.updateSession, sessionUpdateSchema, (value) => {
    if (session?.title !== value.title) mainWindow?.setTitle(value.title);
    session = { title: value.title, dirty: value.dirty };
    appMenu.apply(value.menu);
    closing?.rendererReady();
  });
  // N2: the session file by ref (null after New). An unknown id is ignored and logged.
  ipc.on(CHANNELS.sessionFile, sessionFileSchema, ({ ref }) => {
    if (ref === null) return folders.sessionFile(null);
    const entry = refs.get(ref);
    if (entry) folders.sessionFile(entry);
    else log('files', 'Unknown session file ref');
  });
  // N5 (F13): the renderer ran F4 and agreed to close.
  ipc.on(CHANNELS.closeOk, closeOkSchema, () => closing?.closeOk());
  /** W2: on a real close, the outer normal bounds and the maximized flag. */
  const rememberWindow = (win: BrowserWindow): void => {
    const bounds = win.getNormalBounds();
    const maximized = win.isMaximized();
    store.update((s) => ({ ...s, window: { ...bounds, maximized } }));
  };
  const openWindow = (): void => {
    const win = createMainWindow(store.get().window);
    mainWindow = win;
    closing = guardClose(win, () => rememberWindow(win));
    // CM3 (R3): editable targets only; the canvas prevents the DOM event, so it never gets here.
    win.webContents.on('context-menu', (_event, params) => contextMenus.text(params));
  };
  openWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow();
  });
});

/**
 * F13: a window close (title-bar ×, Alt+F4, File > Exit) is prevented and handed to the renderer
 * (`close-requested`), which runs F4 and answers with N5. Main intercepts only once the renderer
 * has sent its first N1 (it listens for main events by then), and never once the renderer is gone
 * (`render-process-gone`): then the window closes without asking (the recovery file covers it).
 * `closing` runs for every close that goes ahead (W2 remembers the bounds then).
 */
function guardClose(win: BrowserWindow, closing: () => void) {
  let ready = false;
  let allowed = false;
  win.webContents.on('render-process-gone', () => {
    allowed = true;
  });
  win.on('close', (event) => {
    if (allowed || !ready || win.webContents.isCrashed()) {
      closing();
      return;
    }
    event.preventDefault();
    win.webContents.send(CHANNELS.mainEvent, { type: 'close-requested' });
  });
  return {
    rendererReady(): void {
      ready = true;
    },
    closeOk(): void {
      allowed = true;
      win.close();
    },
  };
}

// Settings are flushed before quit: a change younger than 500 ms (the window bounds) still lands.
let flushed = false;
app.on('will-quit', (event) => {
  if (flushed || settings === undefined || !settings.pending()) return;
  event.preventDefault();
  void settings.flush().finally(() => {
    flushed = true;
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
