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
import { createFiles, realPathOf, sha256Hex } from './files';
import { createFileRefs } from './model/file-refs';
import { createSessionFolders, folderOf } from './model/session-folders';
import {
  firstWindowBounds,
  restoredWindowBounds,
  type RememberedWindow,
} from './model/window-bounds';
import { rendererSettings, withRendererSettings } from './model/settings';
import { createSettingsStore } from './settings-io';
import type {
  BindTabResponse,
  FileDroppedResponse,
  FileRef,
  MainEvent,
  OpenTarget,
  ReadFileResponse,
  StartupResponse,
} from '../shared/ipc-types';
import { fileArg, testFlags } from './model/args';
import { kindOfPath } from './model/file-refs';
import { guardClose, installQuitFlush } from './lifecycle';
import { createSessionStore } from './session-store';
import { pathKeyOf } from './model/tab-registry';
import { createRecent } from './model/recent';
import { createOpenRequests, openTarget, type OpenRequest } from './model/open-requests';

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
  closeOkSchema,
  setSettingsSchema,
  contextMenuSchema,
  tabMenuSchema,
  appMenuSchema,
  fileDroppedSchema,
  readTabRecordSchema,
  writeTabRecordSchema,
  sessionIndexSchema,
  bindTabSchema,
  autoSaveSchema,
  checkTabFileSchema,
  acceptOutsideSchema,
  damagedTabRecordSchema,
} from './ipc-schemas';
import { createLogger } from './log';
import { createContextMenus } from './menu';
import { DEV_ORIGIN, installSessionSecurity, installWebContentsSecurity } from './security';

installWebContentsSecurity();
let mainWindow: BrowserWindow | undefined;
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
  // W1: a fractional display scale rounds the measured frame up to whole DIPs, so the content of
  // a W1 window is 1 DIP larger than 1280 x 800. Asking for the content size again is exact.
  if (restored === null && !maximized) win.setContentSize(1280, 800);
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

// F11, R37: a file a launch asks to open (the first launch's command line, then each second
// launch's, and Open recent) waits in a first-in-first-out queue of at most 20: the first before I7
// is I7's `open`, the rest go by `main:event` once the renderer listens, one at a time and in order;
// F13's `close-requested` waits in the same queue behind earlier opens.
let deliverRequest: (request: OpenRequest) => Promise<void> = () => Promise.resolve();
let logRequest: (message: string) => void = () => undefined;
const openRequests = createOpenRequests(fileArg(process.argv), {
  deliver: (request) => deliverRequest(request),
  log: (message) => logRequest(message),
});

// F11 single instance: the lock lives in userData, set above (TH1). A second process hands its
// command line to this one through `second-instance` and quits with code 0, without a window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const win = mainWindow;
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    const path = fileArg(argv);
    if (path !== null) openRequests.request(path);
  });
  void app.whenReady().then(startApp);
}

async function startApp(): Promise<void> {
  const log = createLogger(app.getPath('userData'));
  logRequest = (message) => log('open', message);
  // R32, W4: there is no application menu: the ☰ button opens the same trees as one native popup
  // (I9). Electron's default menu would register Ctrl+0, Ctrl+= and friends and steal editor keys,
  // and a menu bar would take a row of the window; none is wanted. Cleared before the window exists.
  Menu.setApplicationMenu(null);
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
  await store.load();
  // F10: the recent list (paths stay here); every change is stored. The ☰ popup reads it when it
  // is built.
  const recent = createRecent({
    initial: store.get().recent,
    caseInsensitive: process.platform === 'win32',
    changed: (list) => {
      store.update((s) => ({ ...s, recent: [...list] }));
    },
  });
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
  /**
   * T17 (R37): the tab `path` is open in (its `fs.realpath.native` path compared through the
   * registry, case-insensitively on Windows; a picture tab is bound to its picture), else `open()`.
   * Nothing is read for a bound path.
   */
  const targetOf = <R>(path: string, open: () => R | Promise<R>) =>
    openTarget(path, {
      realPath: realPathOf,
      tabOf: (real) => sessionStore.tabOf(real),
      open,
    });
  /** An opened ref for a path main chose (F10, F11), or the tab that holds it; null: no Open kind. */
  const openedTarget = (path: string): Promise<OpenTarget | null> => {
    const kind = kindOfPath(path);
    return kind === null
      ? Promise.resolve(null)
      : targetOf<FileRef>(path, () => refs.add(path, kind, 'opened'));
  };
  // Session store (SS2, SS5, SS11): userData/session, one ordered chain; the start-up read runs
  // first on it (damaged files moved aside, discarded records deleted after a valid read). The
  // tab bindings (I12), the auto-save writer (I13), the AS5 check (I14) and N9 run on the same
  // chain; I7 returns `restored()`.
  // SS7, R35: the userData/recovery folder of earlier builds is ignored: neither read nor deleted.
  const sessionStore = createSessionStore({
    folder: join(app.getPath('userData'), 'session'),
    log: (message) => log('session', message),
    normalizePath: pathKeyOf(process.platform === 'win32'),
  });
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
    // I12 decides the folders for this run (A10 persists them); F6 (TB20): the active tab's.
    folders: {
      open: () => folders.openFolder(),
      save: (format) =>
        format === 'chalk' && saveAsFolder !== null ? saveAsFolder : folders.saveFolder(format),
    },
  });
  /** F6 (TB20): the folder the Save as dialog of the active tab starts in, while it is asked for. */
  let saveAsFolder: string | null = null;
  const tabSaveFolder = async (): Promise<string> => {
    const active = await sessionStore.activeBinding();
    if (active === null) return folders.tabSaveFolder(null);
    const folder = folderOf(active.path);
    const folderExists = await stat(folder).then(
      (info) => info.isDirectory(),
      () => false,
    );
    return folders.tabSaveFolder({ ...active, folderExists });
  };
  // I1 (T17): a chosen file already open in a tab answers that tab; nothing is read.
  ipc.handle(CHANNELS.chooseOpen, chooseOpenSchema, async (): Promise<OpenTarget | null> => {
    const ref = await dialogs.chooseOpen();
    return ref === null ? null : targetOf(entryOf(ref.id).path, () => ref);
  });
  ipc.handle(CHANNELS.readFile, readFileSchema, async ({ ref }): Promise<ReadFileResponse> => {
    const path = entryOf(ref).path;
    const result = await files.read(path);
    // I12 `open`: the tab's file hash is the hash of exactly these bytes (AS5).
    if (result.ok) {
      refs.noteHash(ref, sha256Hex(result.bytes));
      return result;
    }
    // F10: a missing file leaves the recent list (the renderer shows "can't be found").
    if (result.problem === 'missing') recent.remove(path);
    // A ref always has an Open extension, so `unsupported` cannot answer I2.
    return { ok: false, problem: result.problem === 'unsupported' ? 'unreadable' : result.problem };
  });
  ipc.handle(CHANNELS.chooseSave, chooseSaveSchema, async ({ format, suggestedName }) => {
    // F6: the renderer's Save as is always for the active tab (the flows run one at a time).
    saveAsFolder = format === 'chalk' ? await tabSaveFolder() : null;
    let ref: FileRef | null;
    try {
      ref = await dialogs.chooseSave(format, suggestedName);
    } finally {
      saveAsFolder = null;
    }
    // ST2: an Export Save dialog (every format but .chalk) remembers its folder.
    const entry = ref === null || format === 'chalk' ? undefined : refs.get(ref.id);
    if (entry) folders.exported(entry);
    return ref;
  });
  ipc.handle(CHANNELS.writeFile, writeFileSchema, async ({ ref, data }) => {
    const entry = entryOf(ref);
    const result = await files.write(entry, data);
    const sha256 = result.ok ? sha256Hex(data) : null;
    if (sha256 !== null) refs.noteHash(ref, sha256);
    // F6 (I12 `save-as` is sent before this write): success binds the bytes written and the folders
    // and recent list follow it; a failed write puts the tab's previous binding back.
    const savedAs =
      entry.kind === 'chalk' &&
      (await sessionStore.settleSaveAs(
        ref,
        sha256 === null ? { ok: false } : { ok: true, sha256 },
      ));
    if (savedAs && sha256 !== null) {
      folders.sessionFile(entry);
      recent.add(entry.path);
    }
    return result;
  });
  // I12 (T12, T17, AS7, AS9): the ref is resolved here, so paths stay in main (R8). `open` binds
  // the hash of the bytes I2 gave the renderer; `save-as` takes a Save-dialog `.chalk` ref only.
  ipc.handle(CHANNELS.bindTab, bindTabSchema, async (request): Promise<BindTabResponse> => {
    const { tabId } = request;
    const given = <T>(value: T | null | undefined): T => {
      if (value === null || value === undefined) throw new Error('Refused bind');
      return value;
    };
    switch (request.reason) {
      case 'open': {
        const ref = given(request.ref);
        const entry = entryOf(ref);
        const answer = await sessionStore.bind({
          reason: 'open',
          tabId,
          // T17: bindings are keyed by the real path, as `targetOf` looks them up.
          path: await realPathOf(entry.path),
          kind: entry.kind === 'chalk' ? 'chalk' : 'picture',
          fileHash: refs.hashOf(ref),
          written: request.written ?? null,
        });
        // The last open folder and the recent list follow an open (F10).
        if (answer.ok) {
          folders.sessionFile(entry);
          recent.add(entry.path);
        }
        return answer;
      }
      case 'save-as': {
        const ref = given(request.ref);
        const entry = entryOf(ref);
        if (entry.kind !== 'chalk' || entry.how !== 'saved') throw new Error('Refused bind');
        return sessionStore.bind({
          reason: 'save-as',
          tabId,
          path: await realPathOf(entry.path),
          written: given(request.written),
          ref,
        });
      }
      case 'unbind':
        return sessionStore.bind({ reason: 'unbind', tabId });
      case 'reopen':
        return sessionStore.bind({ reason: 'reopen', tabId, from: given(request.from) });
      case 'take-over':
        return sessionStore.bind({
          reason: 'take-over',
          tabId,
          from: given(request.from),
          written: request.written ?? null,
        });
    }
  });
  // I13 (AS1, AS5, AS8), I14 (AS5) and N9 (AS7(a)) run on the session chain.
  ipc.handle(CHANNELS.autoSave, autoSaveSchema, (request) => sessionStore.autoSave(request));
  ipc.handle(CHANNELS.checkTabFile, checkTabFileSchema, ({ tabId, wantBytes }) =>
    sessionStore.checkFile(tabId, wantBytes === true),
  );
  ipc.on(
    CHANNELS.acceptOutsideChange,
    acceptOutsideSchema,
    (value) => void sessionStore.acceptOutside(value),
  );
  // I3 (F12, SEC14): a dropped file's path, read by the preload; a file open in a tab answers that
  // tab unchecked (T17); else checked as SEC7, then a ref.
  ipc.handle(
    CHANNELS.fileDropped,
    fileDroppedSchema,
    async ({ path }): Promise<FileDroppedResponse> => {
      const target = await targetOf(path, () => files.inspect(path));
      if ('focus' in target) return { ok: true, focus: target.focus };
      return target.ok ? { ok: true, ref: refs.add(path, target.kind, 'opened') } : target;
    },
  );
  // F10, F11, F13 (R37): the open queue's deliveries, one at a time. An open becomes a ref for F3,
  // or `focus-tab` for a file already open in a tab; a close is F13's `close-requested`.
  const sendEvent = (event: MainEvent): void => {
    const win = mainWindow;
    if (win && !win.isDestroyed()) win.webContents.send(CHANNELS.mainEvent, event);
  };
  deliverRequest = async (request) => {
    if (request.kind === 'close') return sendEvent({ type: 'close-requested' });
    const win = mainWindow;
    if (!win || win.isDestroyed()) return;
    const target = await openedTarget(request.path);
    if (target === null) return;
    sendEvent(
      'focus' in target
        ? { type: 'focus-tab', tabId: target.focus }
        : { type: 'open', ref: target },
    );
  };
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
  ipc.handle(CHANNELS.ask, askSchema, async (request) => {
    return dialogs.ask(request);
  });
  ipc.handle(CHANNELS.showFileError, fileErrorSchema, (request) => dialogs.showFileError(request));
  ipc.on(CHANNELS.logError, logErrorSchema, ({ message }) => log('renderer', message));
  // CM1–CM3 (A13): the canvas menu on request (I6); the text-field menu from webContents.
  const contextMenus = createContextMenus({
    Menu,
    window: () => mainWindow,
    app: {
      text: (method) => mainWindow?.webContents[method](),
      exit: () => mainWindow?.close(),
      about: () => void about.show(),
      // F10, R21: the path captured when the popup was built; it waits in the open queue (R37)
      // and then opens by T17 in the renderer.
      openRecent: (path) => openRequests.request(path),
      clearRecent: () => recent.clear(),
      recent: () => recent.entries(),
    },
  });
  ipc.handle(CHANNELS.showContextMenu, contextMenuSchema, (request) => contextMenus.show(request));
  // I9 (M4, R32): the ☰ menu shares the popup slot with CM1 and T15 (M5).
  ipc.handle(CHANNELS.showAppMenu, appMenuSchema, (request) => contextMenus.showApp(request));
  // I10 (T15, CM4): the tab menu shares the popup slot with CM1 (M5); the tab strip asks for it.
  ipc.handle(CHANNELS.showTabMenu, tabMenuSchema, (request) => contextMenus.showTab(request));
  // The session store's record and index channels (I11, N7, N8).
  ipc.handle(CHANNELS.readTabRecord, readTabRecordSchema, ({ tabId }) =>
    sessionStore.readRecord(tabId),
  );
  ipc.handle(CHANNELS.writeTabRecord, writeTabRecordSchema, (request) =>
    sessionStore.writeRecord(request),
  );
  ipc.on(
    CHANNELS.updateSessionIndex,
    sessionIndexSchema,
    (update) => void sessionStore.updateIndex(update),
  );
  // N10 (SS11, TB15): a record the renderer could not parse goes to damaged/ on the chain.
  ipc.on(
    CHANNELS.damagedTabRecord,
    damagedTabRecordSchema,
    ({ tabId }) => void sessionStore.damagedRecord(tabId),
  );
  // Quit waits for one flush of settings (a change younger than 500 ms, e.g. the window bounds)
  // and of the session chain.
  installQuitFlush(app, {
    pending: () => store.pending() || sessionStore.busy(),
    flush: () => Promise.all([store.flush(), sessionStore.idle()]),
    log: (message) => log('quit', message),
  });
  // I7 with ST2: the renderer's view only (no path, folder, window or recent list). SS7 (TB12): the restored session from the store's start-up read; the
  // launch's file is looked up after it, so a file a restored tab holds answers that tab (T17).
  ipc.handle(CHANNELS.startup, startupSchema, async (): Promise<StartupResponse> => {
    const path = openRequests.takeStartup();
    const session = await sessionStore.restored();
    return {
      settings: rendererSettings(store.get()),
      session,
      open: path === null ? null : await openedTarget(path),
    };
  });
  // I8: a strict partial RendererSettings (preset switches, Export choices).
  ipc.handle(CHANNELS.setSettings, setSettingsSchema, (change) => {
    store.update((s) => withRendererSettings(s, change));
  });
  let shownTitle: string | undefined;
  let closing: ReturnType<typeof guardClose> | undefined;
  ipc.on(CHANNELS.updateSession, sessionUpdateSchema, (value) => {
    if (shownTitle !== value.title) mainWindow?.setTitle(value.title);
    shownTitle = value.title;
    closing?.rendererReady();
    openRequests.listening();
  });
  // N5 (F13, SS10): the renderer ran its close flush and agreed to close; main closes once the
  // session chain is empty, with the discarded records deleted.
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
    closing = guardClose(win, {
      closing: () => rememberWindow(win),
      // TB13 (SS10): N5 waits for the session chain, then the discarded records are deleted.
      sessionChain: sessionStore,
      // R37: `close-requested` waits behind every open that arrived before it.
      requestClose: () => openRequests.close(),
    });
    // CM3 (R3): editable targets only; the canvas prevents the DOM event, so it never gets here.
    win.webContents.on('context-menu', (_event, params) => contextMenus.text(params));
  };
  openWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
