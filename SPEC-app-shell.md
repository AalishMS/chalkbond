# Spec: `app-shell`

Shared stack, commands, style and boundaries: see `SPEC.md`. Module map: `CAPABILITY-MAP.md`.
Depends on: every module (core modules through `@core/<module>`; the editor through
`src/renderer/editor/index.ts`). Drafted together with `SPEC-clipboard-export.md`; the two share
one UI design and one IPC contract (defined here). Status: **draft 2026-11-10**, awaiting
approval.

Audience: a grade 11–12 chemistry teacher in Nepal on a Windows 10/11 laptop (often 1366×768),
Office 2021, no network, power cuts common, not a power user. The test for every choice: *what
would this teacher expect?* The window must stay calm: fewer controls done well.

## Objective

Turn the editor into a finished Windows application: one window that opens, saves and reopens
drawings like Notepad or Word does, a native menu bar and right-click menu, an unsaved-changes
prompt, a recovery file that survives a power cut, remembered window and recent files, an app
icon, an offline shortcuts page, and a per-user Windows x64 installer that needs no admin rights
and no network.

User stories served (`SPEC.md`): 7 (save and reopen; exported pictures reopen through Open) and
the frame for all others.

## Scope

**In:** main process (window, menus, dialogs, single instance, file associations, file I/O,
settings, recovery, logging, security); preload API; the renderer host (`src/renderer/app/`):
owning the editor controller, the session (file name, dirty), file flows, host keys, the
context-menu bridge, the shortcuts dialog, the drop overlay, the shared UI primitives and app
tokens; the e2e test hook; app and file icons; packaging (`electron-builder.yml`); licence
notices.

**Out:** drawing and editing (`editor`); pictures, clipboard formats, embedding, Export
(`clipboard-export`; this module hosts them: menu item, keys, IPC plumbing); chemistry; how a
figure looks.

**Non-goals (v1):** several windows or tabs; auto-update; telemetry; crash reporting; printing
(PDF export, then print); a settings dialog; themes or dark mode; localisation (English UI);
macOS or Linux packages; code signing.

## Facts relied on

Checked 2026-11-10 against the code and `node_modules/electron/electron.d.ts` (Electron 45.2.3)
and `node_modules/app-builder-lib/scheme.json` (electron-builder 26.18.0).

| Fact (source) | Consequence |
|---|---|
| Scaffold `src/main/index.ts`: one `BrowserWindow` 1280×800, min 960×640, `show: false` until `ready-to-show`, `contextIsolation`, `sandbox`, `nodeIntegration: false`, `webSecurity`; `setWindowOpenHandler` opens http(s) externally; `will-navigate` prevented; `Menu.setApplicationMenu(null)` (the default menu bound Ctrl+0 / Ctrl+= to page zoom); `app.setAppUserModelId('com.chalkbond.app')` | Kept, except the menu (now our own, Decision A3) and the external-link opener (removed: the app has no links, SEC2) |
| Preload (`src/preload/index.ts`) exposes `window.chalkbond = { platform }` via `contextBridge.exposeInMainWorld`; `api.d.ts` types it | Grows into the function list of "Process split and IPC"; never `ipcRenderer` itself |
| `App.tsx` creates the controller with `{ clock }` only and renders `<Editor controller>` inside `data-testid="canvas-area"` | app-shell replaces it with the host of "Controller ownership" |
| Editor seam (`SPEC-editor.md`, `controller.ts`): `getDoc`, `getSelection`, `load(doc)` (new history, marks saved), `markSaved`, `isDirty`, `run`, `canRun`, `undoLabel`, `redoLabel`, `subscribe` → `doc \| selection \| dirty \| history \| notice \| context-menu{target, screen}` (screen = canvas px); `shortcuts: 'all'` makes the editor handle every K1 Ctrl key itself; `canRun({type: 'set-preset'})` is true exactly when no gesture runs and no label/text editor is open | The host keeps `shortcuts: 'all'` and adds only keys the editor does not use (rule K1); "idle" = that `canRun` |
| `MenuItemConstructorOptions.registerAccelerator`: "If false, the accelerator won't be registered with the system, but it will still be displayed" (`@platform linux,win32`) | Every menu item shows its shortcut but never captures the key; the renderer owns all keys, so text fields keep Ctrl+C / Ctrl+V / Ctrl+Z (Decision A3) |
| `Menu.buildFromTemplate`, `Menu.setApplicationMenu`, `menu.getMenuItemById`, `menu.popup({ window, x, y, callback })` | Menus are built from a pure data model and rebuilt when their state changes; items have ids, so e2e clicks them through `getMenuItemById(id).click()` |
| `app.requestSingleInstanceLock(additionalData?)`; `'second-instance'(event, argv, workingDirectory, additionalData)`, "guaranteed to be emitted after `ready`" | Single instance; a double-clicked file reaches the running window (rule F11) |
| `app.addRecentDocument(path)`, `app.clearRecentDocuments()` (`@platform darwin,win32`) | Windows Jump List recents, in addition to the in-app list |
| `dialog.showMessageBox(window, { type, buttons, defaultId, cancelId, noLink, title, message, detail, icon })`, `showOpenDialog`, `showSaveDialog(window, { defaultPath, filters, properties })` | Native prompts, errors and file dialogs, modal to the window |
| `webContents.setZoomMode('disabled')`: "All zooming in this webContents is disabled" | Ctrl+wheel and pinch never zoom the page; the editor owns zoom |
| `IpcMainInvokeEvent.senderFrame: WebFrameMain \| null` | Every handler checks the sender is the main window's main frame (SEC6) |
| `session.setPermissionRequestHandler`, `setPermissionCheckHandler`; `webRequest.onBeforeRequest(filter, listener)` | Deny all permissions; cancel every non-local request (SEC3, SEC4) |
| `webUtils.getPathForFile(file: File): string` exists in the `Renderer` namespace | The preload turns a dropped `File` into a path (rule F12); probe A-P1 confirms it works in the sandboxed preload |
| `BrowserWindow`: `'close'` event (preventable), `'page-title-updated'`, `setTitle`, `getNormalBounds`, `isMaximized`, `isMinimized`, `restore`, `focus`, `loadFile(path, { query })`; `screen.getDisplayMatching(rect)`, `getPrimaryDisplay()`, `Display.workArea`; `app.getPath('userData' \| 'documents' \| 'temp' \| 'logs')`; `shell.openPath`; `nativeImage.createFromPath`; `process.resourcesPath`; `webPreferences.devTools` | Window, title, bounds, data folders, About box, test-hook query |
| electron-builder 26.18.0 `NsisOptions`: `oneClick` (default true), `perMachine` (default false), `createDesktopShortcut`, `createStartMenuShortcut`, `shortcutName`, `uninstallDisplayName`, `runAfterFinish`, `deleteAppDataOnUninstall` (one-click only, default false), `installerIcon`, `uninstallerIcon`, `installerHeaderIcon`, `differentialPackage`, `artifactName`; root `fileAssociations: [{ ext, name, description, icon }]` (icon relative to `build/`), `copyright`, `publish`, `electronLanguages`, `extraResources` | Installer configuration in rule I1 |
| `build/icon.ico` (16–256) and `build/icon.png` (512) are the **default Electron logo** (scaffold commit 6496cbc) | A real app icon is part of this module (rule IC1) |
| `e2e/harness.ts` `loadDocument` / `readDocument` / `listenEvents` reach the controller through React fibers; `resizeContent` assumes no menu bar | Replaced by the test hook (TH1–TH3); the harness corrects the page size for the menu bar |
| doc-model `parse` error codes; `MAX_FILE_BYTES` 20 MB; `serialize` deterministic; `emptyDoc(now)`, `setStyle` | File errors map from `ParseError.code` (rule F14); New builds its document with `setStyle` so it starts clean (no undo step) |

## Decisions

| # | Decision | Reason |
|---|---|---|
| A1 | **One window, one drawing.** Open, New and a double-clicked file replace the drawing in the same window, after the unsaved-changes prompt | Notepad model; a second window is something this teacher would lose behind the first |
| A2 | **Native Windows menu bar, always visible** (File, Edit, View, Help) | Familiar, discoverable, keyboard- and screen-reader-accessible for free; costs about 20 px of height, which 1366×768 can spare |
| A3 | Menu items **display** shortcuts but never register them (`registerAccelerator: false`); the renderer handles every key | One place decides keys, so text fields keep their own Ctrl+C / V / Z and no accelerator can steal an editor key |
| A4 | Native right-click menu on the canvas; a right-click on an unselected molecule selects it first (editor required change 3) | Windows and PowerPoint behaviour: right-click acts on the thing under the pointer |
| A5 | **Open shows the file dialog first**, then validates the file, then asks about unsaved changes | No prompt when the teacher cancels the dialog or picks a broken file |
| A6 | Opening an exported PNG / SVG gives an **unsaved-to-chalk** drawing: Save asks for a `.chalk` name next to it and never overwrites the picture | Overwriting a picture with drawing data would break the slide it came from |
| A7 | **Recovery file** written while there are unsaved changes (≤ 10 s behind), offered on the next launch | Power cuts: losing an hour of work once would end the teacher's trust |
| A8 | **No settings dialog.** Remembered automatically: window size and position, recent files (8), folders, Export choices, and the style of new drawings (the last preset the teacher switched to) | Every remembered choice is one the teacher already made; there is nothing left to configure |
| A9 | Help = one **Keyboard shortcuts** dialog (F1), generated from the editor's keymap; About is a native message box | Offline, short, always correct; a manual would be out of date and unread |
| A10 | Errors about files: **native error box**, plain words, no codes or stack traces; successes: status-bar notice | A failed save must not be missed; a success must not interrupt |
| A11 | Installer: **NSIS one-click, per user**, no admin, `%LOCALAPPDATA%\Programs\Chalkbond`, Start-menu and desktop shortcuts, `.chalk` association, runs after install, no update or network, unsigned | Fewest questions for a non-power user; works on school machines without admin |
| A12 | Shared UI primitives and app tokens (below) are **normative in `docs/mockups/app/`** and lifted byte-for-byte, like the editor's | One visual language; drift is caught by a tooling test |
| A13 | **No new dependency**. Icons are rendered with the Playwright Chromium already in devDependencies and packed into `.ico` by a small Node script | `SPEC.md` "Ask first"; the alternative (`png-to-ico`, `sharp`) adds native or unpinned code for a one-off build step |

---

## UI design

### Window

| Rule | |
|---|---|
| W1 First launch | If the primary display's work area is at least 1280×800: a 1280×800 window centred in it. Otherwise: maximized (normal bounds 1280×800 clipped to the work area, centred). Minimum 960×640 (scaffold) |
| W2 Remembered | On close, store `getNormalBounds()` and `isMaximized()`. On launch, restore them if at least half of the stored rectangle lies inside the work area of `screen.getDisplayMatching(rect)`; else W1. Maximized is applied after the bounds |
| W3 Title | `windowTitle(name, dirty)` = `*` when dirty, then the name, then ` - Chalkbond`: `Untitled - Chalkbond`, `*ethanol - Chalkbond` (a `.chalk` file shows without extension), `ethanol.png - Chalkbond` (a drawing opened from a picture keeps its extension: it is not a `.chalk` yet), `*Recovered drawing - Chalkbond`. Main sets it with `setTitle` and prevents `page-title-updated` |
| W4 Menu bar | Visible (`autoHideMenuBar: false`); Alt or F10 moves focus to it (Windows standard) |
| W5 Zoom | `setZoomMode('disabled')` on the main window's `webContents` |

### Menu bar (native)

Labels in sentence case like Windows 11 apps; `&` marks the access key. Every accelerator is
display-only (A3); the key itself is handled by the renderer (K1) or the editor (editor K1).
"Idle" = no gesture and no label/text editor open. While an in-window dialog (Export, Keyboard
shortcuts) is open, every item is disabled.

| Menu | Item (label) | Id | Shortcut shown | Enabled when | Runs |
|---|---|---|---|---|---|
| **&File** | &New | `file.new` | Ctrl+N | idle | F1 New |
| | &Open… | `file.open` | Ctrl+O | idle | F2 Open |
| | Open &recent ▸ | `file.recent` | | idle and the list is non-empty | submenu: `&1 ethanol.chalk` … `&8 …` (rule F10), separator, `&Clear recently opened` (`file.recent.clear`) |
| | — | | | | |
| | &Save | `file.save` | Ctrl+S | idle | F5 Save |
| | Save &as… | `file.save-as` | Ctrl+Shift+S | idle | F6 Save as |
| | — | | | | |
| | &Export… | `file.export` | Ctrl+E | idle and the drawing is not empty | clipboard-export EX1 |
| | — | | | | |
| | E&xit | `file.exit` | Alt+F4 | always | closes the window (F13) |
| **&Edit** | &Undo *label* | `edit.undo` | Ctrl+Z | `canRun('undo')` | `run('undo')`; label `Undo add bond` (editor `undoLabel()` with its first letter lower-cased), plain `Undo` when none |
| | &Redo *label* | `edit.redo` | Ctrl+Y | `canRun('redo')` | `run('redo')`, label as Undo |
| | — | | | | |
| | Cu&t | `edit.cut` | Ctrl+X | `canRun('cut')` | `run('cut')` (clipboard-export CB-C3) |
| | &Copy | `edit.copy` | Ctrl+C | idle and the drawing is not empty | clipboard-export CB-C1 (selection, else whole drawing) |
| | &Paste | `edit.paste` | Ctrl+V | idle | clipboard-export CB-P1 |
| | &Duplicate | `edit.duplicate` | Ctrl+D | `canRun('duplicate')` | `run('duplicate')` |
| | De&lete | `edit.delete` | Del | `canRun('delete')` | `run('delete')` |
| | — | | | | |
| | Select &all | `edit.select-all` | Ctrl+A | `canRun('select-all')` | `run('select-all')` |
| **&View** | Zoom &in | `view.zoom-in` | Ctrl+= | `canRun('zoom-in')` | `run('zoom-in')` |
| | Zoom &out | `view.zoom-out` | Ctrl+- | `canRun('zoom-out')` | `run('zoom-out')` |
| | &Fit drawing | `view.zoom-fit` | Ctrl+0 | always | `run('zoom-fit')` |
| | &Reset zoom | `view.zoom-reset` | Ctrl+1 | always | `run('zoom-reset')` |
| | — | | | | |
| | &Slides style (radio) | `view.style-slides` | | idle | `run({type: 'set-preset', preset: 'slides'})`; checked when the drawing's preset is `slides` |
| | &Handout style (radio) | `view.style-handout` | | idle | `… 'journal'`; checked when `journal` |
| **&Help** | &Keyboard shortcuts | `help.shortcuts` | F1 | always | opens the Keyboard shortcuts dialog |
| | — | | | | |
| | &About Chalkbond | `help.about` | | always | About box (rule AB1) |

Left out of the menus, on purpose: Print (PDF export, then print), Close (one window: Exit),
Clean up / Show Kekulé / Tidy reaction / Flip (always visible in the Select options bar with
their shortcuts), Find compound (the name field is the largest control on screen; Ctrl+F still
works), developer tools, full screen, window menu.

### Keyboard (host keys)

**K1** The renderer host handles exactly these keys, in a `keydown` listener on `window` in the
capture phase (so it runs before the editor's handler); everything else reaches the editor
unchanged. "Text target" = an `input`, `textarea` or `contenteditable` element (the name field,
the label and text editors). While an in-window dialog is open, K1 does nothing (the dialog
handles Enter / Esc / Tab).

| Keys | Condition | Action |
|---|---|---|
| Ctrl+N | idle | F1 New |
| Ctrl+O | idle | F2 Open |
| Ctrl+S | idle | F5 Save |
| Ctrl+Shift+S | idle | F6 Save as |
| Ctrl+E | idle, drawing not empty | Export dialog |
| F1 | always | Keyboard shortcuts dialog |
| Ctrl+V | not a text target | clipboard-export CB-P1 (the editor's own Ctrl+V is not reached) |
| Ctrl+C | not a text target, selection empty, drawing not empty | clipboard-export CB-C1 "whole drawing" |

Handled keys get `preventDefault()` and `stopPropagation()`. In a text target, Ctrl+N / O / S /
Shift+S / E do nothing while the editor is not idle (finish typing first); Ctrl+C / V / X / Z /
A stay native text keys.

**K2 Conflict check** (unit-tested against the editor's `globalCommand` and tool-key tables):
the host's Ctrl+N, Ctrl+O, Ctrl+S, Ctrl+Shift+S, Ctrl+E and F1 are unused by editor K1 (Ctrl+Z,
Y, Shift+Z, C, X, V, D, A, F, =, +, −, 0, 1, Shift+K, Shift+L, Shift+T), K2 (unmodified letters,
digits, `+`, `-`, Enter, Delete) and K3 (Ctrl+B, I, =, Shift+=, Shift+D, Shift+H). Menu access
keys need Alt; editor keys require Alt up (editor R6). Page-zoom keys are bound nowhere (W5,
`registerAccelerator: false`).

### Canvas context menu (native)

On the editor's `context-menu` event the host shows a native popup at the pointer
(`menu.popup({ window, x: canvasLeft + screen.x, y: canvasTop + screen.y })`, rounded). By then
editor rule CM1 (as amended, required change 3) has selected the right-clicked molecule.

| Right-click on | Items (shortcut shown, display-only) | Enabled when |
|---|---|---|
| a drawing item | Cu&t `Ctrl+X` · &Copy `Ctrl+C` · &Duplicate `Ctrl+D` · De&lete `Del` · — · &Paste `Ctrl+V` | as the Edit menu items |
| empty canvas | &Paste `Ctrl+V` · &Copy `Ctrl+C` (label **Copy whole drawing** when nothing is selected) · — · Select &all `Ctrl+A` | Paste: idle; Copy: drawing not empty; Select all: `canRun('select-all')` |

A chosen item runs the same function as the Edit menu item. Esc or a click elsewhere closes the
menu with no effect. Left out: Clean up, Kekulé, Expand, Flip (the Select options bar shows them
as soon as the molecule is selected), Bring to front (no z-order op), Properties.

### Files

**Prompt (I4 `save-changes`)**: native message box, `type: 'warning'`, title `Chalkbond`,
message `Do you want to save changes to “ethanol”?` (`Untitled`, `Recovered drawing`), detail
`If you don't save, your changes will be lost.`, buttons **Save** · **Don't save** · **Cancel**,
`defaultId` 0 (Save), `cancelId` 2, `noLink: true`. Esc = Cancel.

| Rule | Behaviour |
|---|---|
| F1 New | `confirmDiscard()` (below); then `controller.load(setStyle(emptyDoc(clock()), { preset: settings.newDrawingStyle }))` (no undo step, not dirty); session Untitled; recovery cleared |
| F2 Open | `file:choose-open` (filter **Chalkbond drawings (\*.chalk, \*.png, \*.svg)**, starting in the last open folder, else Documents); cancel → nothing. Then F3 |
| F3 Open a file ref | `file:read` → bytes; `extractDrawing(kind, bytes)`; doc-model `parse`; any failure → error box (F14), current drawing untouched, no prompt. Success → `confirmDiscard()`; then `controller.load(doc)`; session = the file (kind `chalk` or `picture`, A6); `session:file` (N2; main adds it to recent); recovery cleared; status notice none (the title says it) |
| F4 `confirmDiscard()` | Not dirty → proceed. Dirty → prompt: Save → F5 (if it is cancelled or fails, stop); Don't save → proceed; Cancel → stop |
| F5 Save | Session is a `.chalk` file → write `serialize(getDoc())` to it (atomic, F9); else → F6. Success: `controller.markSaved()`, session not dirty, recovery cleared, notice "Saved ethanol.chalk." |
| F6 Save as | `file:choose-save` with `format: 'chalk'`, suggested name: `ethanol.chalk` (session name with any extension replaced), `Untitled.chalk`; folder: the picture's folder for a picture-opened drawing, else the last save folder, else Documents. Then write, then as F5 success; session becomes that `.chalk` file; `session:file` |
| F7 Dirty | `dirty = controller.isDirty() \|\| session.forcedDirty`; `forcedDirty` is true only for a recovered drawing until it is saved. A drawing opened from a picture is not dirty until edited |
| F8 Save dialog | `showSaveDialog(win, { defaultPath, filters: [one filter for the format: "Chalkbond drawing (*.chalk)", "PNG picture (*.png)", "SVG drawing (*.svg)", "PDF document (*.pdf)"] })`; Windows asks before overwriting. The chosen path's extension is forced to the format's (`name.png.chalk` is never produced: an existing different extension is replaced) |
| F9 Atomic write | Write `<target>.<random>.tmp` in the same folder, `FileHandle.sync()`, rename over the target (retry 3 × 100 ms on `EBUSY` / `EPERM`), delete the temp file on failure. Never a half-written drawing after a power cut |
| F10 Recent | Up to 8 paths, newest first, duplicates (case-insensitive on Windows) moved to the top; added on every successful open and save. Label: `&n` + base name, with `&` doubled; two entries with the same base name get ` — <parent folder name>`. Clicking a missing file → error box "can't be found" (F14) and the entry is removed. Clear recently opened empties the list and calls `app.clearRecentDocuments()`. `.chalk` paths also go to `app.addRecentDocument` (Jump List) |
| F11 Double-click in Explorer / second launch | The installer associates `.chalk`. A second launch (`'second-instance'`) or the first launch's own argv carries the path: `fileArg(argv)` = the last argument that does not start with `-` and ends in `.chalk`, `.png` or `.svg` (case-insensitive). The window is restored if minimized and focused; then F3. A request that arrives while a prompt or dialog is open waits until it closes |
| F12 Drag and drop | Dragging files over the window shows the drop overlay; dropping runs F3 on the first dropped file with a supported extension (path from the preload's `pathForDroppedFile`, validated by main: extension, regular file, size). Unsupported → error box "Chalkbond can't open “x.docx”". Text drags (not files) are left to the editor |
| F13 Close | Window `close` → main prevents it once and sends `close-requested`; the renderer runs `confirmDiscard()`; proceed → recovery cleared, `app:close-ok` → main closes. If the renderer has crashed (`render-process-gone`), main closes without asking (the recovery file covers it) |

**F14 File errors** (native box, `type: 'error'`, title `Chalkbond`, button **OK**; message /
detail):

| Cause | Message | Detail |
|---|---|---|
| file missing | “ethanol.chalk” can't be found. | It may have been moved, renamed or deleted. |
| over 20 MB | “ethanol.chalk” is too large to open. | Chalkbond opens drawings up to 20 MB. |
| unsupported type (drop) | Chalkbond can't open “notes.docx”. | It opens Chalkbond drawings (.chalk) and pictures made in Chalkbond (.png, .svg). |
| picture without a drawing (`no-drawing`) | “photo.png” has no Chalkbond drawing inside. | Only pictures exported or copied from Chalkbond can be opened and changed. |
| `newer-version` | “ethanol.chalk” was made with a newer version of Chalkbond. | Install the newer Chalkbond to open it. The file has not been changed. |
| `damaged` or any other `parse` code (`invalid-json`, `not-chalkbond`, `unsupported-version`, `migration-failed`, `schema`, `invariants`, a UTF-8 decode error) | Chalkbond can't open “ethanol.chalk”. | The file is damaged or is not a Chalkbond drawing. The file has not been changed. |
| unreadable (`EACCES`, `EPERM`, `EBUSY`, other) | Chalkbond can't read “ethanol.chalk”. | It may be open in another program, or you may not have permission to open it. |
| write: `EACCES`, `EPERM`, `EROFS` | Couldn't save “ethanol.chalk”. | Chalkbond isn't allowed to save in this folder. Choose another folder. |
| write: `ENOSPC` | Couldn't save “ethanol.chalk”. | The disk is full. Free some space or choose another drive. |
| write: `EBUSY` | Couldn't save “ethanol.chalk”. | The file is open in another program. Close it and try again. |
| write: `ENOENT` | Couldn't save “ethanol.chalk”. | The folder no longer exists. Choose another folder. |
| write: anything else, PDF failure | Couldn't save “ethanol.chalk”. | Something went wrong while saving. Try again, or choose another folder. |

The full error goes to the log (LG1), never to the screen. A failed open never changes the
current drawing; a failed save keeps it dirty.

### Recovery

| Rule | Behaviour |
|---|---|
| RC1 Write | While dirty, the renderer sends `recovery:write { text: serialize(doc), name }` 2 s after the last document change, and at most 10 s after the first unsaved change of a burst. Main writes `userData/recovery/drawing.chalk` and `recovery.json { name, savedAt }` atomically (F9) |
| RC2 Clear | On save success, on New / Open after the prompt, when a recovery is discarded, on a normal close, and when undo returns to the saved state (not dirty) |
| RC3 Offer | At launch, if `drawing.chalk` exists and parses: native box, `type: 'warning'`, title `Chalkbond`, message `Chalkbond closed before your drawing was saved.`, detail `Do you want to recover it?`, buttons **Recover** · **Discard**, `defaultId` 0, `cancelId` 0 (closing the box recovers: nothing is ever lost by accident), `noLink`. Recover → load it, session `Recovered drawing`, `forcedDirty` true; Save goes to Save as with the old name suggested. Discard → delete. A recovery file that does not parse is deleted silently (logged) |
| RC4 With a file request | If a launch carries a file (F11) and a recovery exists, recovery is offered first; after Recover the file is not opened and the notice says "Recovered your drawing. Open ethanol.chalk again after saving it." |

### Settings (no UI)

`userData/settings.json` (main, `src/main/model/settings.ts`), read once at start, written
atomically 500 ms after a change. Lenient parse: unknown keys dropped, each invalid field
replaced by its default, a broken file replaced by defaults (logged).

```ts
interface Settings {
  version: 1;
  newDrawingStyle: 'slides' | 'journal';               // ST1; default 'slides'
  export: { format: 'png' | 'svg' | 'pdf'; pngDpi: 150 | 300 | 600; pngWhite: boolean };
                                                       // default png, 300, false
  window: { x: number; y: number; width: number; height: number; maximized: boolean } | null;
  recent: string[];                                    // ≤ 8 absolute paths
  folders: { open: string | null; save: string | null; export: string | null };
}
```

- **ST1** `newDrawingStyle` follows the teacher: when a document change switches the preset (the
  status-bar switch, View menu, or undo/redo of a switch, not a load), it is stored. New uses it.
- **ST2** The renderer sees only `{ newDrawingStyle, export }` (`RendererSettings`); paths stay in
  main.
- **Deliberately left out:** font, bond length and line width (two presets cover the uses);
  language; theme; autosave interval; clipboard formats and resolution; default folder;
  update checks; "open last file at start" (the recovery covers the case that matters).

### Keyboard shortcuts dialog (`data-testid="shortcuts-dialog"`)

Dialog shell, `--dialog-w-md` (560 px), max height `calc(100vh - 96px)`, body scrolls. Title
"Keyboard shortcuts". Sections (`--type-sm` 600, 16 px above each), rows 28 high: keys on the
left in key chips (`kbd`, 20 high, padding 0 6, 1 px `--border-control`, radius `--radius-xs`,
`--type-xs`, `--chrome-bg`), meaning on the right (`--type-sm`). Footer: **Close** (secondary;
Enter and Esc close). Content (generated from `src/renderer/app/model/shortcuts.ts`, which a
unit test checks against the editor's keymap and K1):

| Section | Rows |
|---|---|
| Tools | V Select · E Erase · B Bond · Z Chain · R Ring · L Atom · A Arrow · + Plus · M Curved arrow · T Text |
| Pointing at an atom | C H N O S P F I set the element · L chlorine · B bromine · + / − charge · 1 2 3 add a single / double / triple bond · Enter type a label |
| Pointing at a bond | 1 2 3 single / double / triple · W wedge · H hash |
| Editing | Ctrl+Z undo · Ctrl+Y redo · Ctrl+C copy (the whole drawing when nothing is selected) · Ctrl+X cut · Ctrl+V paste · Ctrl+D duplicate · Ctrl+A select all · Delete delete · arrow keys nudge (Shift: further) · Esc cancel / deselect |
| Chemistry | Ctrl+F type a compound name · Ctrl+Shift+L clean up · Ctrl+Shift+K Kekulé / circle · Ctrl+Shift+T tidy reaction |
| View | Ctrl+= zoom in · Ctrl+− zoom out · Ctrl+0 fit drawing · Ctrl+1 reset zoom · Space + drag pan |
| Files | Ctrl+N new · Ctrl+O open · Ctrl+S save · Ctrl+Shift+S save as · Ctrl+E export · F1 this list |
| While typing text | Enter finish · Shift+Enter new line · Esc cancel · Ctrl+B bold · Ctrl+I italic · Ctrl+= subscript · Ctrl+Shift+= superscript · Ctrl+Shift+D Δ · Ctrl+Shift+H hν |

### About box (AB1, native)

`showMessageBox(win, { type: 'none', icon: nativeImage.createFromPath(<icon.png>), title: 'About
Chalkbond', message: 'Chalkbond <version>', detail: <text>, buttons: ['OK', 'Licences'],
defaultId: 0, cancelId: 0, noLink: true })`. Detail:

```
Draw chemical structures and reactions for teaching.

Works fully offline. Nothing you draw leaves this computer.

Copyright © 2026 <package.json author>.
Built with OpenChemLib, Electron, React, Immer and Zod.
```

**Licences** opens `THIRD-PARTY-NOTICES.txt` from `process.resourcesPath` with `shell.openPath`
(Notepad). The icon is `icon.png` from `process.resourcesPath` (packaged) or `build/` (dev).

### Drop overlay (`data-testid="drop-overlay"`)

Shown while files are dragged over the window (`dragenter` with `Files` in
`dataTransfer.types`; hidden on `dragleave` of the window, `drop`, or Esc). Covers the page;
background `--drop-bg`; an inner box inset 8 px with `2px dashed var(--accent)`, radius
`--radius-md`; centred: "Drop to open" (`--type-title`, `--active-fg`) and 4 px below
"Chalkbond drawings (.chalk) and pictures made in Chalkbond (.png, .svg)" (`--type-sm`,
`--text-muted`). `aria-hidden` (Ctrl+O is the keyboard path). No motion.

### Visual language additions (normative: `docs/mockups/app/app-tokens.css`, `icons.svg`)

Editor tokens apply unchanged. New tokens (lifted byte-for-byte into
`src/renderer/app/app-tokens.css`; a tooling test compares them and checks the contrast pairs):

| Token | Value | Use |
|---|---|---|
| `--primary-bg` | `#1f5fd1` | Copy, dialog Save… |
| `--primary-hover-bg` | `#1a4fb0` | |
| `--primary-pressed-bg` | `#163f8c` | |
| `--primary-fg` | `#ffffff` | |
| `--scrim` | `rgba(31, 35, 40, 0.32)` | behind in-window dialogs |
| `--drop-bg` | `rgba(227, 236, 251, 0.94)` | drop overlay |
| `--type-title` | `600 16px / 24px var(--font-ui)` | dialog titles, drop overlay |
| `--dialog-w-sm` / `--dialog-w-md` | `400px` / `560px` | dialog widths |
| `--dialog-top` | `96px` | dialog top edge below the window top |
| `--copy-min-w` | `84px` | Copy button with label |
| `--radio-size` / `--check-size` | `16px` / `16px` | radio dot, checkbox |

Contrast pairs added to the test (WCAG 2.x): `--primary-fg` on `--primary-bg` (5.8 : 1),
`--primary-hover-bg`, `--primary-pressed-bg` ≥ 4.5; `--text-muted` on `--active-bg` ≥ 4.5
(radio-card description); `--active-fg` on `--drop-bg` (over white) ≥ 4.5; `--accent` focus ring
on `--canvas-bg` ≥ 3.

**App icons** (`icons.svg`, same rules as the editor sprite: 24 grid, stroke 1.5, round caps and
joins, `currentColor`):

```svg
<symbol id="copy" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="11" height="12" rx="2"/><path d="M8 8V6A2 2 0 0 1 10 4H18A2 2 0 0 1 20 6V14A2 2 0 0 1 18 16H15"/></g></symbol>
<symbol id="check" viewBox="0 0 24 24"><path d="M5 12.5L10 17.5L19 7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></symbol>
```

**Primitives** (`src/renderer/app/ui/`; every one a real `<button>` / `<input>` with an
accessible name; disabled = `aria-disabled="true"`, focusable, tooltip says why; focus ring
`2px solid var(--accent)` offset 2 px on `:focus-visible`; no transitions except `--motion-fade`
on dialog open):

| Primitive | Box | Rest | Hover | Pressed | Selected / checked | Disabled |
|---|---|---|---|---|---|---|
| Primary button | 32 high, padding 0 16 (Copy: see clipboard-export), radius 6, `--type-sm` 600 | `--primary-bg`, `--primary-fg` | `--primary-hover-bg` | `--primary-pressed-bg` | — | `--hover-bg`, `--text-disabled` |
| Secondary button | 32 high, padding 0 16, radius 6, 1 px `--border-control`, `--type-sm` 600 | `--canvas-bg`, `--text` | `--hover-bg` | `--pressed-bg` | — | border `--border`, `--text-disabled` |
| Radio card | full width, min 56 high, padding 8 12, radius 6, 1 px `--border`; radio dot 16 at left (top 10), title `--type-sm` 600 `--text` and description `--type-xs` `--text-muted` at x 36 | `--canvas-bg` | `--hover-bg` | `--pressed-bg` | `--active-bg`, border 1 px `--accent` + inset 1 px `--accent`; dot: 1.5 px `--accent` ring with an 8 px `--accent` centre (unselected: 1 px `--border-control` ring) | — |
| Checkbox | 16 × 16 box, radius `--radius-xs`, 1 px `--border-control`, label `--type-sm` 8 px right, help `--type-xs` `--text-muted` under the label | `--canvas-bg` | box `--hover-bg` | box `--pressed-bg` | box `--accent`, `check` icon 12 px `--primary-fg` | — |
| Segmented control | 32 high, 1 px `--border` outline, radius 6; segments padding 0 12, `--type-sm`, 1 px `--border` between | transparent, `--text` | `--hover-bg` | `--pressed-bg` | `--active-bg`, `--active-fg`, 600 | — |
| Dialog shell | width per dialog, top `--dialog-top`, centred horizontally, padding 24, radius 6, `--canvas-bg`, `--shadow-1`, over `--scrim`; title `--type-title`, 16 px below it the body; footer right-aligned, 24 px above, buttons 8 px apart (secondary then primary) | | | | | |

Radio groups and segmented controls: `role="radiogroup"`, children `role="radio"` with
`aria-checked`, one tab stop, arrows move and select, Home / End. Dialog shell: `role="dialog"`,
`aria-modal="true"`, `aria-labelledby` the title; focus trapped; Esc = cancel; focus returns to
the element focused before (normally the canvas).

### App and file icons

- **IC1 App icon**: chalk-white benzene with a substituent on a chalkboard-green tile (toluene
  read as "a drawing"). Source `build/icon-source/app.svg` (48 px and up):

  ```svg
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
    <rect x="8" y="8" width="240" height="240" rx="48" fill="#24584a"/>
    <g transform="translate(-5 -20)" fill="none" stroke="#f7f7f2" stroke-width="14"
       stroke-linecap="round" stroke-linejoin="round">
      <path d="M112 72L177.8 110L177.8 186L112 224L46.2 186L46.2 110Z"/>
      <circle cx="112" cy="148" r="40" stroke-width="10"/>
      <path d="M177.8 110L219.4 86"/>
    </g>
  </svg>
  ```

  `app-small.svg` (16, 20, 24, 32 px): the same without the circle, stroke width 22.
- **IC2 File icon** (`.chalk` in Explorer), `build/icon-source/file.svg`: a page
  `M56 16H160L208 64V240H56Z` filled `#ffffff`, stroke `#7a828e` width 8, folded corner
  `M160 16V64H208`; inside it the hexagon and bond of IC1 in `#24584a`, scaled to a 96-px-wide
  ring centred at (132, 150); small sizes drop the circle.
- **IC3 Build** (`npm run icons` → `scripts/build-icons.mjs`, dev-time, no new dependency):
  renders the SVGs with Playwright's Chromium (already used by `golden:sheet`) to PNGs at 16, 20,
  24, 32, 40, 48, 64, 256 px, and writes `build/icon.ico` and `build/chalk-file.ico` as ICO files
  with PNG-compressed entries (6-byte header, 16-byte directory entries, PNG data; supported since
  Windows Vista) plus `build/icon.png` (512). Outputs are committed. A tooling test reads both ICO
  headers: every size present, every entry a PNG.

### Left out (deliberately)

| Left out | Why |
|---|---|
| Settings dialog, preferences | A8: everything worth keeping is remembered from what the teacher did |
| Tabs, multiple windows | A1 |
| Toolbar buttons for New / Open / Save | The menu and Ctrl+S; the top bar keeps one primary action (Copy) |
| Print | PDF or Word does it better; one fewer dialog |
| Welcome screen, tips, "what's new" | The editor's empty state already teaches the first step |
| Online help, update check, "send feedback" | Offline (`SPEC.md`) |
| Autosave to the real file | Silent overwrites surprise people; the recovery file protects without touching their file |
| Dark theme | Slides and handouts are white; one theme to keep right |
| Associating `.png` / `.svg` with Chalkbond | Would hijack the teacher's pictures; Open handles them |

### Mock-up screens to build before implementation

Static HTML in `docs/mockups/app/` rendered to PNG at 1280×800 (A15 at 960×640), like the editor
mock-ups; native chrome (title bar, menus, message boxes) drawn as close Windows 11 replicas.

| # | Screen | Must show |
|---|---|---|
| A01 | Main window | Windows title bar `*ethanol - Chalkbond`, menu bar, editor with the SC3 scheme, Copy button (label) before Undo/Redo, nothing selected |
| A02 | Copied | Copy button in its "Copied" state; status bar "Copied the whole drawing. Paste into PowerPoint or Word with Ctrl+V." |
| A03 | States sheet | Copy button rest / hover / pressed / copied / disabled / focus, icon-only variant; secondary button, radio card, checkbox, segmented control in every state; key chip |
| A04 | File menu | File open with Open recent submenu showing 3 entries (one pair with the same name and folder suffix) |
| A05 | Edit menu | "Undo add bond", disabled Redo, all shortcuts |
| A06 | View menu | Zoom items, style radio with Slides checked |
| A07 | Context menus | right-click on a molecule (molecule selected) and on empty canvas ("Copy whole drawing"), side by side |
| A08a/b/c | Export dialog | PNG (Print, transparent, pixel line), SVG, PDF (with the "can't be opened again" line) |
| A09 | Save prompt | "Do you want to save changes to “ethanol”?" over the window |
| A10 | Open errors | the `no-drawing` and `newer-version` boxes |
| A11 | Recovery | the recovery prompt over a fresh window |
| A12 | Shortcuts | Keyboard shortcuts dialog scrolled to the top |
| A13 | Drop | drop overlay over a drawing |
| A14 | About | About box with the app icon |
| A15 | Minimum window | 960×640: menu bar, icon-only Copy, Select options bar |
| A16 | Icons | app icon at 16, 20, 24, 32, 48, 256 on light and dark taskbars; `.chalk` file icon in an Explorer details list and large-icon view |
| A17 | Notices | status bar with each copy / paste / export / save notice (info and error) |

---

## Architecture

### Where the code lives

```
src/shared/ipc.ts                 channel names, Zod schemas, inferred types (main validates;
                                  preload and renderer import types and names only)
src/main/
  index.ts                        app lifecycle, single instance, window, wiring
  ipc.ts                          handlers (sender check, Zod, dispatch)
  files.ts                        refs, read, atomic write, dialogs
  menu.ts                         builds and applies native menus from menu-model
  recovery.ts  settings-io.ts  log.ts  security.ts
  model/                          pure, unit-tested in node (≥ 90 % lines)
    menu-model.ts                 (MenuState, recent) → MenuNode[]; context menu model
    recent.ts  settings.ts  window-bounds.ts  args.ts  titles.ts  write-problem.ts
  clipboard-export/               (SPEC-clipboard-export.md)
src/preload/index.ts  api.d.ts    named functions only ("Process split and IPC")
src/renderer/app/
  App.tsx                         host: controller, session, flows, dialogs, overlay
  host-keys.ts                    capture-phase key listener (K1) → model/keys.ts
  model/                          pure (≥ 90 % lines)
    session.ts  file-flows.ts  keys.ts  menu-state.ts  shortcuts.ts  messages.ts
    recovery-timer.ts  test-hook.ts
  ui/                             primitives (Button, Dialog, RadioCard, Checkbox, Segmented, Icon)
  ShortcutsDialog.tsx  DropOverlay.tsx  app-tokens.css  icons.svg  app.css
build/icon-source/*.svg  build/icon.ico  build/icon.png  build/chalk-file.ico
build/THIRD-PARTY-NOTICES.txt     generated by scripts/build-notices.mjs
docs/mockups/app/                 normative tokens and icons; mock-up screens
```

`electron.vite.config.ts` adds the `@core` alias to the main and preload builds only if they
ever need it (they do not: SEC9). `tsconfig.node.json` and `tsconfig.web.json` include
`src/shared/**/*`.

### Process split and IPC

The renderer owns the document, the editor, rendering and every decision; the main process owns
windows, menus, dialogs, the clipboard, the file system, settings, recovery and logs. The
renderer never sees a path except one it was handed by a drop, and never writes one: files are
named by opaque `FileRef`s that main creates.

```ts
type FileRef = { id: string /* crypto.randomUUID() */; name: string /* base name */;
                 kind: 'chalk' | 'png' | 'svg' | 'pdf' };
```

Main keeps `id → { path, kind, writable }`: refs from the Save dialog are writable for their
format; refs of `.chalk` files opened by the user are writable (Save in place); picture refs are
read-only.

**Renderer → main, `invoke`** (each wrapped by one preload function of the same name in
camelCase; every request Zod-validated in main; a failed validation rejects and is logged):

| Ch. | Channel | Request | Response |
|---|---|---|---|
| C1–C5 | `clipboard:write`, `clipboard:read`, `file:choose-save`, `file:write`, `file:write-pdf` | see `SPEC-clipboard-export.md` "Process split and IPC" | |
| I1 | `file:choose-open` | `{}` | `FileRef \| null` |
| I2 | `file:ref-from-drop` | `{ path: string ≤ 4096 }` | `{ ok: true, ref } \| { ok: false, problem: 'unsupported' \| 'missing' \| 'too-large', name }` |
| I3 | `file:read` | `{ ref: string }` | `{ ok: true, bytes: Uint8Array } \| { ok: false, problem: 'missing' \| 'too-large' \| 'unreadable' }` |
| I4 | `dialog:ask` | `{ kind: 'save-changes', name: string ≤ 255 } \| { kind: 'recover' }` | `'save' \| 'discard' \| 'cancel'` / `'recover' \| 'discard'` |
| I5 | `dialog:tell` | `{ kind: 'error' \| 'info', message: string ≤ 300, detail: string ≤ 1000 }` | `void` |
| I6 | `context-menu:show` | `{ onItem: boolean, state: MenuState, x: number, y: number }` | `ContextCommand \| null` |
| I7 | `app:startup` | `{}` | `{ settings: RendererSettings, recovery: { text: string, name: string } \| null, open: FileRef \| null }` |
| I8 | `settings:set` | `Partial<RendererSettings>` | `void` |

**Renderer → main, `send`:**

| Ch. | Channel | Payload | Main does |
|---|---|---|---|
| N1 | `session:update` | `{ title: string ≤ 300, dirty: boolean, menu: MenuState }` | `setTitle`; rebuilds the menu when `menu` changed; remembers `dirty` for F13 |
| N2 | `session:file` | `{ ref: string }` | recent list (F10), last folder |
| N3 | `recovery:write` | `{ text: string ≤ 20 MB, name: string ≤ 255 }` | RC1 |
| N4 | `recovery:clear` | `{}` | RC2 |
| N5 | `app:close-ok` | `{}` | closes the window (F13) |
| N6 | `log:error` | `{ message: string ≤ 4000 }` | LG1 |

**Main → renderer**, one channel `main:event` (preload `onMainEvent(cb)`, returns an
unsubscribe): `{ type: 'command', command: AppCommand }` (menu clicks: the menu ids above) ·
`{ type: 'open', ref: FileRef }` (second instance, recent item) · `{ type: 'close-requested' }`.

```ts
type MenuState = {
  idle: boolean; modal: boolean; empty: boolean; hasSelection: boolean;
  canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null;
  canCut: boolean; canDuplicate: boolean; canDelete: boolean; canSelectAll: boolean;
  canZoomIn: boolean; canZoomOut: boolean; preset: 'slides' | 'journal';
};
```

`menu-state.ts` derives it from the controller after each `doc`, `selection` or `history`
event (and on dialog open / close), at most once per animation frame, and N1 is sent only when
something changed.

### Security

| # | Rule |
|---|---|
| SEC1 | `webPreferences`: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`, `devTools: !app.isPackaged`; CSP meta unchanged (`script-src 'self'`, `object-src 'none'`, `img-src 'self' data: blob:`) |
| SEC2 | `app.on('web-contents-created')`, for every webContents: `setWindowOpenHandler(() => ({ action: 'deny' }))` (no external opener at all), `will-navigate` and `will-attach-webview` prevented |
| SEC3 | `session.defaultSession.setPermissionRequestHandler((_w, _p, cb) => cb(false))` and `setPermissionCheckHandler(() => false)`: no camera, notifications, clipboard-read permission or anything else (the clipboard is main's) |
| SEC4 | `webRequest.onBeforeRequest`: cancel every request whose scheme is not `file:`, `data:`, `blob:` or `devtools:`, or (unpackaged only) the electron-vite dev server origin; each cancel is logged. "No network" is enforced, not just intended |
| SEC5 | The preload exposes named functions only; each fixes its channel; no generic `invoke(channel)`, no `ipcRenderer`, no Node objects |
| SEC6 | Every handler checks `event.senderFrame` is the main window's main frame and its URL is the app's `file:` index (or the dev server when unpackaged) |
| SEC7 | Reads: only through refs or a validated drop path; `fs.stat` must report a regular file ≤ 20 MB (`MAX_FILE_BYTES`); extension in the allow-list (`.chalk .png .svg`) |
| SEC8 | Writes: only to writable refs; the data's signature must match the ref's kind (`{` for chalk, the PNG signature, `<svg`, `%PDF-` after printing); atomic (F9); internal files only under `userData` and the OS temp folder |
| SEC9 | The main process imports no `src/core` module and parses no user content beyond size and signature checks; parsing happens in the sandboxed renderer |
| SEC10 | The hidden PDF window: `sandbox`, `javascript: false`, no preload, a temp file under `app.getPath('temp')` deleted afterwards (clipboard-export PD1) |
| SEC11 | `shell.openPath` only for the bundled `THIRD-PARTY-NOTICES.txt`; `shell.openExternal` is not used |

### Controller ownership and the session

```tsx
// src/renderer/app/App.tsx (shape, not code)
const controller = createEditorController({
  clock: () => new Date().toISOString(),
  doc: setStyle(emptyDoc(now), { preset: settings.newDrawingStyle }),
  shortcuts: 'all',                       // the editor keeps its K1 keys; the host adds K1 here
  onCopy: copyFlow.onCopy,                // clipboard-export CB-C1/C3
  logError: (e) => window.chalkbond.logError(String(e)),
});
<Editor controller={controller} actions={<CopyButton … />} />
```

- **CO1** One controller for the window's lifetime; documents change only through
  `controller.load` (New, Open, Recover, test hook).
- **CO2** `session.ts` holds `{ name, kind: 'untitled' | 'chalk' | 'picture' | 'recovered', ref:
  FileRef | null, forcedDirty }`; `dirty` per F7; the title per W3.
- **CO3** `subscribe`: `dirty`, `doc` → title, N1, RC1 timer, preset tracking (ST1);
  `selection`, `history` → menu state; `context-menu` → I6, then the chosen command; `notice` →
  nothing.
- **CO4** `file-flows.ts` implements F1–F13 over injected ports (`main`, `controller`, `notify`,
  `clock`), so every flow is unit-tested in node with fakes (prompt answers, read results, write
  failures).
- **CO5** Startup: I7 → if `recovery` → RC3; else if `open` → F3; else the empty drawing.

### Test hook (replaces the React-fiber helpers)

- **TH1** Main appends `query: { testHooks: '1' }` to `loadFile` only when `!app.isPackaged`
  and `process.argv` contains `--chalkbond-test-hooks`. An installed app can never enable it.
- **TH2** With `testHooks=1` in `location.search`, `App.tsx` defines
  `window.__chalkbondTest = { load(doc): void /* as an Untitled document */, getDoc(): Doc,
  getSelection(): { atoms: string[]; bonds: string[]; objects: string[] }, events(): EditorEvent[],
  clearEvents(): void }` (events collected from `subscribe` since start or the last clear).
- **TH3** `e2e/launch.ts` passes `--chalkbond-test-hooks`; `e2e/harness.ts` reimplements
  `loadDocument`, `readDocument`, `listenEvents`, `heardEvents` on the hook (same signatures, so
  the editor specs are unchanged) and deletes the fiber code. `resizeContent` sets the content
  size, then corrects it once by `requested − window.inner{Width,Height}`, so the page is exactly
  the requested size with the menu bar.
- **TH4** Native dialogs and menus in e2e: main calls `dialog.showOpenDialog`,
  `showSaveDialog`, `showMessageBox` and `Menu.prototype.popup` through the module objects at call
  time (never destructured at import), so a test stubs them with `app.evaluate`; menu items are
  clicked with `Menu.getApplicationMenu().getMenuItemById(id).click()`.

### Logging

**LG1** Main appends errors (main's own and N6) to `app.getPath('logs')/main.log` as one line
each (`ISO time, source, message`); at 1 MB it is renamed to `main.old.log`. Logs contain no
document content. Nothing is sent anywhere.

### Packaging

**I1** `electron-builder.yml`:

```yaml
appId: com.chalkbond.app
productName: Chalkbond
copyright: Copyright © 2026 <package.json author>
directories: { buildResources: build, output: dist }
files: [out/**, package.json]
extraResources:
  - { from: build/THIRD-PARTY-NOTICES.txt, to: THIRD-PARTY-NOTICES.txt }
  - { from: build/icon.png, to: icon.png }
electronLanguages: [en-US]
publish: null
fileAssociations:
  - { ext: chalk, name: Chalkbond drawing, description: Chalkbond drawing, icon: chalk-file.ico }
win:
  target: [{ target: nsis, arch: [x64] }]
  executableName: Chalkbond
  icon: build/icon.ico
nsis:
  oneClick: true
  perMachine: false
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Chalkbond
  uninstallDisplayName: Chalkbond
  runAfterFinish: true
  deleteAppDataOnUninstall: false
  differentialPackage: false
  installerIcon: icon.ico
  uninstallerIcon: icon.ico
  installerHeaderIcon: icon.ico
  artifactName: Chalkbond-${version}-setup.${ext}
npmRebuild: false
```

| Item | Result |
|---|---|
| Install | Double-click `Chalkbond-<version>-setup.exe` → SmartScreen (unsigned, below) → a progress bar → Chalkbond opens. No questions, no admin prompt |
| Location | `%LOCALAPPDATA%\Programs\Chalkbond`; data in `%APPDATA%\Chalkbond` (settings, recovery, logs) |
| Shortcuts | Start menu and desktop, both "Chalkbond" |
| Association | `.chalk` (per user, HKCU) with the IC2 icon and "Chalkbond drawing" as type name |
| Uninstall | Settings > Apps > Chalkbond > Uninstall: removes the program, shortcuts and association; keeps `%APPDATA%\Chalkbond` (a reinstall keeps recent files) and never touches the teacher's drawings |
| Updates, network | None: `publish: null` writes no update metadata; no updater code |
| Strings | Product "Chalkbond"; version from `package.json` (Q8); publisher and copyright: `package.json` author |
| Signing | None (`SPEC.md` decision). SmartScreen shows "Windows protected your PC … Unknown publisher"; the teacher clicks **More info** → **Run anyway** once. The checklist covers it and the hand-over note explains it |
| Size | about 85–100 MB installer, about 300 MB installed (Electron 45 x64, one locale); measured at the checkpoint and written in this spec |

**I2** `build/THIRD-PARTY-NOTICES.txt` is generated by `scripts/build-notices.mjs` from the
licence files of the packages bundled into the app (runtime `dependencies` plus `react`,
`react-dom`, `scheduler`); a tooling test checks every one of them is present. Electron ships its
own `LICENSES.chromium.html` in the install folder.

## Behaviour rules index

W1–W5 (window), menu table, K1–K2 (keys), context menu, F1–F14 (files), RC1–RC4
(recovery), ST1–ST2 (settings), AB1 (About), IC1–IC3 (icons), SEC1–SEC11, CO1–CO5, TH1–TH4, LG1,
I1–I2.

## Required changes to finished modules and scaffold

| # | Target | Change | Spec edit |
|---|---|---|---|
| 1, 2 | `editor` | `actions` prop, `notify` (owned by clipboard-export) | `SPEC-clipboard-export.md` "Required changes" |
| 3 | `editor` | CM1: if the right-clicked item (atom, bond, object) is not in the selection, the selection becomes what a Select-tool click on it makes (Decision 6: an atom or bond selects its whole fragment; an object itself) and the tool becomes Select; on an item already selected, or empty canvas, the selection is kept. Then the event is emitted as before. The controller test "selection is not changed" is replaced by tests of both cases | `SPEC-editor.md` CM1 becomes: "A `contextmenu` event on the canvas is default-prevented; if a gesture is active it is cancelled and nothing else happens. Otherwise, if the H1/H2 hit (atoms, bonds, objects) is not in the selection, the selection becomes what a Select click on it makes (Decision 6) and the tool becomes Select; an item already selected or empty canvas keeps the selection. Then the controller emits `{ type: 'context-menu', target, screen }` (handles and slots → null)." Decisions: add R41 "Right-click on an unselected item selects it first (app-shell A4)"; Decision 12's "the scaffold ignores it" becomes "app-shell shows a native menu". |
| 4 | Scaffold `src/main/index.ts` | `Menu.setApplicationMenu(null)` → the menu of the menu table; remove the http(s) `openExternal`; everything else per this spec | none (scaffold) |
| 5 | Scaffold `App.tsx` | replaced by the host | none |
| 6 | `e2e/harness.ts`, `e2e/launch.ts` | TH3 | none (tests) |
| 7 | `playwright.config.ts` | add project `e2e-win` (`testMatch: /win\/.*\.spec\.ts/`, included only when `process.platform === 'win32'`); `npm run test:e2e` runs `--project=e2e --project=e2e-win` on Windows | none |
| — | `doc-model`, `chem-core`, `svg-render` | None | — |

## Dependencies

**None new.** Electron 45.2.3, electron-builder 26.18.0, Zod 4.6.7 (IPC and settings
validation), React; icons via `@playwright/test` 1.65.0's Chromium at build time only.

## Testing

| Level | What | Where |
|---|---|---|
| Unit (node) | `menu-model` (every item's enabled / checked / label per `MenuState`; undo label casing; `&` escaping; recent submenu labels with duplicates; modal disables all; context menu for item / empty); `recent` (add, dedupe case-insensitively, cap 8, remove missing); `settings` (defaults, each invalid field, unknown keys, broken JSON); `window-bounds` (W1 small and large work areas, W2 half-visible rule, multi-display); `args` (`fileArg` with flags, Chromium extras, quotes, other extensions); `titles` (W3 cases); `write-problem` (errno → problem); renderer `keys` (K1 table, text target, idle, dialog open; K2 conflicts against the editor's `globalCommand` and tool keys); `session`, `file-flows` (F1–F13 with fake ports: every prompt answer, cancel in Save as, failed write keeps dirty, failed open keeps the drawing, picture Save goes to Save as, recovered `forcedDirty`, queued open request); `recovery-timer` (2 s / 10 s with an injected clock); `shortcuts` (every row maps to the editor keymap or K1) | colocated `*.test.ts` |
| View markup (node) | primitives in every state, shortcuts dialog, drop overlay: roles, names, `aria-*`, test ids | `*.test.tsx` |
| Tooling | `app-tokens.css` / `icons.svg` identical to `docs/mockups/app/`; contrast pairs; ICO structure; notices list complete | `tests/tooling/app-*.test.ts` |
| Probe (Windows) | A-P1 `webUtils.getPathForFile` works from the sandboxed preload; A-P2 `registerAccelerator: false` items do not consume their keys (Ctrl+C in the name field copies text with the menu installed); A-P3 page size with the menu bar | `e2e/win/app-facts.spec.ts` |
| E2E (built app, dialogs stubbed per TH4) | title and dirty marker; New / Open / Save / Save as round trip (`.chalk` bytes equal `serialize`); the unsaved prompt (each answer) on New, Open and close; open a PNG and an SVG exported by clipboard-export → equal document, Save asks for `.chalk`; newer-version and damaged files → error box, drawing unchanged; recent menu (add, click, missing file, clear); `second-instance` with a path (emitted in main) opens it after the prompt; drag and drop of a `.chalk` (synthetic drop with a file path) opens it; recovery: write after an edit, kill the app (`app.process().kill()`), relaunch → prompt → recovered and dirty; every menu item runs its command (clicked by id); context menu items (popup stubbed) incl. right-click selection; K1 keys; F1 dialog keyboard; window bounds remembered across launches; no request leaves the app (SEC4 counter stays 0 through the whole suite) | `e2e/app-*.spec.ts` |
| Shots | `A<n>/*.png` for every in-window state of the mock-up list (native menus and boxes are not capturable: checked by hand) | `e2e/shots/A<n>.shot.ts` |
| Manual (Windows) | "Windows checks" below | `docs/windows-checklist.md` |

Coverage: `src/main/model/**` and `src/renderer/app/model/**` ≥ 90 % lines (thresholds in
`vitest.config.mts`); Electron glue and views are covered by e2e. No file excluded to reach a
number.

## Windows checks (for `docs/windows-checklist.md`, section "App shell and installer")

- [ ] `npm run dist:win` produces `dist/Chalkbond-<version>-setup.exe`; record its size and the installed size in this spec.
- [ ] On a clean Windows 10 and a clean Windows 11 user account **without admin rights** (no Node, no dev tools), with the network disconnected: run the installer. SmartScreen shows "Windows protected your PC"; **More info** → **Run anyway** works; no admin prompt appears; Chalkbond opens by itself; Start menu and desktop shortcuts exist and show the new icon.
- [ ] Cold start of the installed app to a usable canvas is under 3 s on the teacher's laptop (`SPEC.md` SC1).
- [ ] Save a drawing as `test.chalk` on the desktop: Explorer shows the `.chalk` file icon and "Chalkbond drawing" as its type; double-clicking it opens it; double-clicking a second `.chalk` while Chalkbond is open (with unsaved changes) shows the save prompt, then opens it in the same window.
- [ ] Right-click the taskbar icon: recent `.chalk` files are listed (Jump List) and open the file.
- [ ] Menu bar: Alt then F opens File; arrows and Enter work; every shortcut shown in the menus works from the canvas; Ctrl+C / Ctrl+V / Ctrl+Z inside the name field act on its text.
- [ ] Alt+click on an atom with Select (pick one atom), release Alt, then press B: the Bond tool is chosen and the menu bar is **not** focused. If the menu bar takes focus, record it (open question Q7).
- [ ] Ctrl+mouse wheel and touchpad pinch zoom the drawing, never the whole window.
- [ ] Unsaved-changes prompt on close (title bar ×, Alt+F4, File > Exit, and shutting Windows down with Chalkbond open): Save, Don't save and Cancel each do what they say.
- [ ] Power-cut test: draw for a minute without saving, wait 15 s, end the Chalkbond process in Task Manager (or switch off the laptop), start Chalkbond: the recovery prompt appears and the drawing comes back.
- [ ] Display scaling 100 %, 125 %, 150 %, 175 %: menu bar, dialogs, Copy button and icons are crisp, nothing is cut off at 960×640; the window position is remembered across restarts on a laptop with and without an external monitor (unplug the monitor between runs: the window comes back on the laptop screen).
- [ ] Uninstall from Settings > Apps: shortcuts and the `.chalk` association are gone, `%APPDATA%\Chalkbond` remains, drawings are untouched; reinstalling restores the recent list.
- [ ] Narrator: the menu bar, Copy button, dialogs and prompts are announced with their names.
- [ ] About box shows the version and the icon; **Licences** opens the notices in Notepad.

## Success criteria

1. `npm run check` green; `src/main/model` and `src/renderer/app/model` ≥ 90 % lines.
2. The menu model unit tests cover every item in the menu table (label, shortcut text,
   enabled rule, command); every menu item clicked by id in e2e runs its command.
3. No accelerator is registered with the system (`registerAccelerator: false` on every item,
   unit test) and K2's conflict test passes against the editor's keymap.
4. Save then Open of a drawing gives a document whose `serialize` equals the original; the file
   on disk equals `serialize(doc)` (e2e).
5. With unsaved changes, New, Open (after a file is chosen), a second-instance open and close
   each show the prompt; Save, Don't save and Cancel behave per F4 (e2e, prompt stubbed).
6. Opening an exported PNG and SVG restores an equal document, and Save on it opens Save as with
   a `.chalk` name (e2e).
7. A newer-version file and a damaged file show the F14 wording and leave the current drawing
   and the file unchanged (e2e: file bytes compared before and after).
8. After an unsaved edit and 12 s, killing the app and relaunching offers recovery; Recover
   restores the drawing as dirty (e2e).
9. The test hook exists only with the flag on an unpackaged build (unit test of the main
   condition; e2e without the flag finds no `__chalkbondTest`); the harness has no React-fiber
   code; the full editor e2e suite passes on the hook.
10. During the whole e2e suite no request leaves the app (SEC4 counter 0) and every permission
    request is denied (e2e).
11. Every IPC handler rejects a payload that fails its schema or comes from another frame (unit
    tests of the handlers with a fake event).
12. Icons: `build/icon.ico` and `build/chalk-file.ico` contain every listed size as PNG (tooling
    test); the mock-up sheet A16 is approved.
13. The Windows checks above are ticked on Windows 10 and 11.

## Boundaries (module-specific)

- **Always:** route every key through K1 or the editor; keep paths in main; validate every IPC
  payload and its sender; write files atomically; keep the window to one document; use tokens and
  primitives only (no raw colours or sizes in app CSS); give every control a name, test id and
  focus ring.
- **Ask first:** any new dependency (an icon converter, an updater, a store library); a new menu
  item or visible control; a settings dialog; associating more file types; a signed or
  per-machine installer; any network use.
- **Never:** register a menu accelerator; expose `ipcRenderer`, `fs` or paths to the renderer
  beyond F2; overwrite a picture with drawing data; show a stack trace or error code; delete a
  user's file; enable the test hook in a packaged build.

## Suggested phases

(clipboard-export phases X1–X5 come first; X3 builds `src/shared/ipc.ts`, the preload pattern,
the app tokens, icons and primitives.)

| Phase | Tasks |
|---|---|
| A1 Foundation | security baseline SEC1–SEC11 and handlers' sender check; test hook TH1–TH3 and harness migration (editor e2e green on it); probes A-P1–A-P3; `e2e-win` project |
| A2 Files | refs, read, atomic write, F1–F14 flows, session and title, prompts, error boxes, open of exported PNG / SVG |
| A3 Menus and keys | menu model and native menu, K1–K2, context menu (editor change 3 first), shortcuts dialog, About |
| A4 Safety net and memory | recovery RC1–RC4, settings ST1–ST2, window bounds W1–W2, recent list and Jump List, single instance and drop (F10–F12), logging |
| A5 Icon and installer | icon sources, `scripts/build-icons.mjs`, notices, `electron-builder.yml`, `dist:win` |
| Checkpoint | `npm run check`, e2e on Windows, Windows checks on 10 and 11, installer size recorded, `AGENTS.md` and `CAPABILITY-MAP.md` statuses updated |

## Open questions

| # | Question | Default | Reason |
|---|---|---|---|
| Q1 | Menu bar always visible, or hidden until Alt (`autoHideMenuBar`)? | **Visible** | A teacher looks for "File" to save; a hidden menu is a hidden feature |
| Q2 | Style of new drawings: remembered from the last switch, or a View menu choice? | **Remembered** (ST1) | No new control; the switch is visible on every new drawing if it is wrong |
| Q3 | Associate `.png` / `.svg` with Chalkbond? | **No** | Would take over the teacher's pictures; Open and drag-drop handle them |
| Q4 | Recovery prompt: what does closing the box do? | **Recover** | Nothing is lost by accident; Discard needs a deliberate click |
| Q5 | One-click or assisted installer? | **One-click, per user** | No questions, no admin; reinstalling over it just works |
| Q6 | Keep only the en-US Electron locale? | **Yes** | The UI is English; saves about 40 MB; native dialogs follow Windows' language anyway |
| Q7 | If Windows focuses the menu bar after an Alt+click (editor Decision 6 "pick one atom"), what then? | Keep the menu bar; if the checklist confirms the problem, the editor swallows the Alt key-up that follows an Alt+click (`preventDefault` on `keyup` of Alt after a pointer press), specified then | Do not trade a standard menu for a rare modifier; fix it narrowly if real |
| Q8 | Version of the first installer handed to the teacher | **1.0.0** (`package.json` bumped at the checkpoint) | "0.1.0" reads as unfinished; the file format is already versioned separately |
| Q9 | Show a status-bar notice after Save? | **Yes**, "Saved ethanol.chalk." | The title's `*` disappearing is easy to miss; a notice is quiet and expires |
| Q10 | Number of recent files | **8** | Fits the menu with access keys 1–8; a teacher works on a handful at a time |
