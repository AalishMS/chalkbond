# Spec: `app-shell`

Shared stack, commands, style and boundaries: see `SPEC.md`. Module map: `CAPABILITY-MAP.md`.
Depends on: every module (core modules through `@core/<module>`; the editor through
`src/renderer/editor/index.ts`; clipboard-export through its public entry and its renderer and
main folders). Written together with `SPEC-clipboard-export.md`; the two share one UI design
(`docs/mockups/shell/`) and one IPC contract (defined here). Status: **approved 2026-11-10**
(drafted in commit 4dd7d48; reviewed and approved by the delegated reviewer with the shell
mock-ups of commit d3abe4b as the visual source of truth; see "Decisions").

Audience: a grade 11–12 chemistry teacher in Nepal on a Windows 10/11 laptop (often 1366×768),
Office 2021, no network, power cuts common, not a power user. The test for every choice: *what
would this teacher expect?* The window must stay calm: fewer controls done well.

## Objective

Turn the editor into a finished Windows application: one window that opens, saves and reopens
drawings like Notepad or Word does; a native menu bar and right-click menus; an unsaved-changes
prompt; a recovery file that survives a power cut; remembered window, folders and recent files;
an app icon; an offline shortcuts list; and a per-user Windows x64 installer that needs no admin
rights and no network.

User stories served (`SPEC.md`): 7 (save and reopen; exported pictures reopen through Open) and
the frame for all others.

## Scope

**In:** main process (window, menus, dialogs, single instance, file association, file I/O,
settings, recovery, logging, security); preload API; the renderer host (`src/renderer/app/`):
owning the editor controller, the session (file, dirty), file flows, host keys, the menu and
context-menu bridge, the Keyboard shortcuts dialog, the drop overlay, the shared UI primitives and
shell tokens; the e2e test hook; app and file icons; packaging; licence notices.

**Out:** drawing and editing (`editor`); pictures, clipboard formats, embedding, Export
(`clipboard-export`; this module hosts them: menu items, keys, IPC plumbing); chemistry.

**Non-goals (v1):** several windows or tabs; auto-update; telemetry; crash reporting; printing; a
settings screen; themes or dark mode; localisation (English UI, en-US installer); macOS or Linux
packages; code signing; associating `.png` / `.svg`; the Windows Jump List.

## Facts relied on

Checked on 2026-11-10 against the code, `node_modules/electron/electron.d.ts` ("Type definitions
for Electron 45.2.3"), `node_modules/app-builder-lib` (electron-builder 26.18.0: `scheme.json` and
`out/`). Rows marked **probe** are pinned by task A2/A3/A6 e2e before code depends on them.

| Fact (source, quoted) | Consequence |
|---|---|
| Scaffold `src/main/index.ts`: one `BrowserWindow` 1280×800, `minWidth: 960`, `minHeight: 640` (outer size), `show: false` until `ready-to-show`, `contextIsolation`, `sandbox`, `nodeIntegration: false`, `webSecurity`; `setWindowOpenHandler` hands http(s) to `shell.openExternal`; `will-navigate` prevented; `Menu.setApplicationMenu(null)`; `app.setAppUserModelId('com.chalkbond.app')`. `e2e/smoke.spec.ts` asserts `getMinimumSize()` = `[960, 640]` and no menu | Kept except: the minimum becomes a content size (O2), the menu becomes ours (O3), `openExternal` is removed (SEC11); the smoke test changes with A6 |
| `electron.d.ts` 4516–4521, `useContentSize`: "The `width` and `height` would be used as web page's size, which means the actual window's size will include window frame's size and be slightly larger." The typings do not say whether `minWidth` / `minHeight` follow it | **A6 Linux headless probe (2026-11-10):** after `setSize(200, 200)`, content and minimum both measured 960×640 (zero native frame); no fallback needed there. Windows confirmation pending. On creation the app probes the minimum and, if content is smaller, applies `setMinimumSize(960 + dw, 640 + dh)` with measured `[dw, dh] = getSize() − getContentSize()` |
| 4543–4548, `windowStatePersistence`: "… across application restarts … _Experimental_" | Not used; window memory is our own pure rule W2 |
| 23466–23472, `MenuItemConstructorOptions.registerAccelerator`: "If false, the accelerator won't be registered with the system, but it will still be displayed. Defaults to true. @platform linux,win32" | Every item shows its shortcut but never captures the key (M2); the renderer owns all keys, so text fields keep Ctrl+C / V / Z |
| 10227 `getMenuItemById(id: string): (MenuItem) \| (null)`; 10237 `popup(options?: PopupOptions): void` (x, y default to the cursor) | Menus are built from a pure model; e2e clicks items by id; the context menu pops up at the cursor with no coordinate maths |
| 19019–19662 `WebContents`: `copy()`, `cut()`, `delete()`, `paste()`, `redo()`, `selectAll()`, `undo()`; 17326 `on('context-menu', (event, params: ContextMenuParams))`, 22255 `isEditable: boolean` | Edit-menu items act on a focused text field (M3); text fields get the Windows Cut / Copy / Paste menu (CM3) |
| 1730 `requestSingleInstanceLock(additionalData?)`; 828 `on('second-instance', (event, argv, workingDirectory, additionalData))` | Single instance; a double-clicked file reaches the running window (F11). The lock is per `userData` folder, so e2e launches with separate folders do not collide (TH1) |
| 8242 `showMessageBox(window, options)`, 8307 `showOpenDialog(window, options)`, 8403 `showSaveDialog(window, options)` | Native prompts, errors and file dialogs, modal to the window |
| 19620 `setZoomMode(mode: 'default' \| 'isolated' \| 'manual' \| 'disabled')` | Ctrl+wheel and pinch never zoom the page (W5) |
| 9512 `IpcMainInvokeEvent.senderFrame: (WebFrameMain) \| (null)` | Every handler checks the main window's main frame (SEC6) |
| 14330 / 14347 `setPermissionCheckHandler`, `setPermissionRequestHandler`; 20601 `webRequest.onBeforeRequest(filter, listener)` | Deny all permissions; cancel every non-local request (SEC3, SEC4) |
| 20871 `WebUtils.getPathForFile(file: File): string` ("an empty string is returned" for a JS-made `File`), in `namespace Renderer` | The preload turns a dropped `File` into a path itself; the page never handles paths (SEC14). **probe** (A15 e2e): works in the sandboxed preload |
| 2758–2767 `BrowserWindow 'query-session-end'`: "Emitted when a session is about to end due to a shutdown, machine restart, or user log-off. Calling `event.preventDefault()` can delay the system shutdown …" @platform win32 | At shutdown the recovery file is flushed (RC5); no prompt is attempted |
| 791 `app 'render-process-gone'`; 2159 `app.isPackaged: boolean` | F13 crash path; test hooks only when unpackaged (TH1) |
| electron-builder `scheme.json`: `NsisOptions.oneClick` ("Whether to create one-click installer or assisted"), `perMachine`, `createDesktopShortcut`, `createStartMenuShortcut`, `shortcutName`, `uninstallDisplayName`, `runAfterFinish`, `deleteAppDataOnUninstall` ("one-click installer only"), `differentialPackage`, `installerIcon`, `uninstallerIcon`, `installerHeaderIcon` ("one-click installer only"), `artifactName`, `language` ("defaults to 1033 (English - United States)"); root `fileAssociations` (`FileAssociation.icon`: "The path to icon (.icns for MacOS and .ico for Windows), relative to build"), `electronLanguages`, `publish`, `copyright`, `extraResources`, `npmRebuild`; `WindowsConfiguration.icon` (default `build/icon.ico`) | Installer configuration I1 uses only these keys |
| `app-builder-lib/out/util/iconConverter.js` `doConvertIcon`: an `.ico` source is used as is if its largest entry is ≥ 256 (`ERR_ICON_TOO_SMALL` otherwise); a `.png` source is converted by `runIconsTool`, which `toolsets/icons.js` downloads from GitHub (`downloadBuilderToolset`, "icons@1.2.3") at build time. `targets/nsis/NsisTarget.js` 739–760: a file association's icon must be an `.ico` resource (`${ext}.ico` default), copied to `$INSTDIR\resources` | We commit our own `.ico` files (256 px entry included) made without a new dependency (IC3); electron-builder converts nothing. Building NSIS still downloads electron-builder's NSIS toolset once on the build machine (build-time network, like the compound dictionary) |
| `build/icon.ico` and `build/icon.png` are the default Electron logo (scaffold) | Replaced by IC1–IC3 |
| `e2e/harness.ts` `loadDocument` / `readDocument` / `listenEvents` / `heardEvents` walk React fibers; `resizeContent` uses `setContentSize` | Replaced by the test hook (TH2, TH3) |
| electron-vite bundles main and preload; a sandboxed preload can `require` only `electron` | The preload imports channel names only; Zod schemas live in main (SEC5) |
| Editor seam: `canRun({type: 'set-preset'})` is false exactly while a gesture runs or a label/text editor is open; no event is emitted when that changes (clipboard-export editor change 2 adds `busy`); `focus-name-field` is view-only (`canRun` false); CM1 never changes the selection | Host idle = that `canRun`; editor changes 3–4 below |
| `docs/mockups/editor/tokens.css` and `icons.svg` are lifted into `src/renderer/editor/view/` and checked by `tests/tooling/editor-tokens.test.ts` (tokens identical after the leading comment; icons byte-identical) | The shell set follows the same rule in its own files (V1) |

## Decisions

Binding until a spec change. O-rows are the orchestrator's decisions of 2026-11-10; A-rows are the
draft's, kept or amended at review; R-rows are the reviewer's resolutions.

| # | Decision | Reason | Date |
|---|---|---|---|
| O1 | Mock-ups `docs/mockups/shell/` (commit d3abe4b) are approved and are the visual source of truth; `shell-tokens.css` and `shell-icons.svg` there are normative | One visual language, checked by a tooling test | 2026-11-10 |
| O2 | The minimum size is a **content** size of 960×640 (`useContentSize`), so the title bar and menu bar never squeeze the tool rail (A15b) | At 960×640 outer the rail no longer fitted | 2026-11-10 |
| O3 | Native menu bar always visible: File, Edit, View, Help, with the trees and wording of A04–A06; native canvas context menus as A07 | Familiar, discoverable, keyboard- and Narrator-accessible | 2026-11-10 |
| O4 | No settings screen. Remembered automatically: window size and position, recent files (8), last folders, Export choices, and the style of the last preset switch for new drawings | Every remembered choice is one the teacher already made | 2026-11-10 |
| O5 | Recovery file at most 10 s behind; offered at next launch with the wording of A11; closing the box recovers | Power cuts; nothing is lost by accident | 2026-11-10 |
| O6 | Installer: NSIS one-click, per user, no admin, `.chalk` association with the file icon of A16, no auto-update, unsigned (SmartScreen steps on the checklist), version 1.0.0 at the final checkpoint. App icon as A16, tile `#2f6e60`; `.ico` files made without a new dependency (IC3) | Fewest questions; works on school machines without admin | 2026-11-10 |
| O7 | Editor changes approved (each a task that updates `SPEC-editor.md` first): the `actions` slot after Undo/Redo; `controller.notify`; CM1 right-click selects first; a host-callable name-field focus; a proper e2e test hook enabled only in an unpackaged build started with an explicit flag | The seam needs them; the fiber-walking helpers were a stopgap | 2026-11-10 |
| O8 | Keyboard shortcuts dialog (F1) as A12, grouped with headings; About as A14; drop overlay as A13; notices as A17 | Offline, short, always correct | 2026-11-10 |
| O9 | Accepted defaults: do not associate `.png` / `.svg`; en-US installer only; a "Saved" notice after Save; plain error wording without codes | Would hijack pictures; the UI is English; the `*` vanishing is easy to miss | 2026-11-10 |
| A1 | One window, one drawing. Open, New and a double-clicked file replace the drawing after the unsaved-changes prompt | Notepad model; a second window gets lost behind the first | 2026-11-10 |
| A3 | Menu items display shortcuts but never register them; the renderer handles every key | One place decides keys; no accelerator steals an editor or text key | 2026-11-10 |
| A5 | Open shows the file dialog first, validates the file, then asks about unsaved changes | No prompt when the teacher cancels or picks a broken file | 2026-11-10 |
| A6 | A drawing opened from an exported picture is saved as a `.chalk`: Save goes to Save as, suggesting `<name>.chalk` in the picture's folder; the picture is never overwritten | Overwriting a slide's picture with drawing data would break the slide | 2026-11-10 |
| A10 | File errors: native error box, plain words; successes: status-bar notice | A failed save must not be missed; a success must not interrupt | 2026-11-10 |
| R1 | No menu item has a `role` (roles bring their own accelerators and behaviour), except the text-field context menu's Cut / Copy / Paste / Select all (CM3) | Every command goes through our model and is testable as data | 2026-11-10 |
| R2 | While a text field is focused, Edit's Undo, Redo, Cut, Copy, Paste, Delete and Select all act on the text (`webContents.undo()` …) and read as plain "Undo", "Copy" …; Duplicate is disabled (M3) | Native text behaviour must win in text fields, from the menu as from the keyboard | 2026-11-10 |
| R3 | Text fields get the standard Windows Cut / Copy / Paste / Select all right-click menu (CM3); the canvas gets A07's menus | Right-click Paste into a text box is what every Windows user expects; Electron shows no menu by default | 2026-11-10 |
| R4 | After an Alt+click on the canvas, the host swallows the next Alt key-up so the menu bar does not take focus (K3; draft Q7) | Editor Decision 6 "Alt+click picks one atom" must not leave the keyboard in the menu bar | 2026-11-10 |
| R5 | Windows shutdown or log-off does not prompt; it flushes the recovery file (RC5) | Windows ends the session anyway; the recovery offer at the next launch is the honest promise | 2026-11-10 |
| R6 | Save as appends the format's extension when the chosen name lacks it; if that changes the path and the file exists, a native "replace?" box asks first. An existing other extension is kept (`notes.png` → `notes.png.chalk`) | Replacing the extension could overwrite a file the Save dialog never warned about | 2026-11-10 |
| R7 | Save marks the document saved only if it did not change while the file was written (doc identity check, F5) | An edit during the write must stay dirty | 2026-11-10 |
| R8 | The renderer never holds or sends a path: files are opaque `FileRef`s; a dropped file's path is read inside the preload with `webUtils.getPathForFile` and sent by the preload itself (SEC14); native dialog texts come from main's message table, the renderer sends a problem code and a base name (SEC15) | A compromised page cannot name an arbitrary file or put arbitrary text in a native box | 2026-11-10 |
| R9 | e2e launches pass `--chalkbond-test-hooks` and `--chalkbond-user-data=<temp dir>`; both are ignored when `app.isPackaged` (TH1) | Tests must not share settings, recent files, recovery or the single-instance lock | 2026-11-10 |
| R10 | Windows-only e2e specs live in `e2e/win/`, which `playwright.config.ts` ignores on other platforms (`testIgnore`); nothing is skipped | AGENTS.md forbids skipped tests; the project stays green on Linux | 2026-11-10 |
| R11 | The Windows Jump List (`app.addRecentDocument`) is cut | No user story needs it; the in-app recent list covers reopening | 2026-11-10 |
| R12 | Shell tokens and icons are lifted into `src/renderer/app/` as their own files (V1), never merged into the editor's `tokens.css` / `icons.svg` | Each lifted file stays a copy of exactly one normative file; the editor's tooling test is untouched | 2026-11-10 |
| R14 | F4's **Save** answer proceeds with the pending New, Open or close only if the save succeeded **and** the drawing is clean afterwards (`!dirty`). An edit during the write (R7) keeps the newer, dirty drawing and stops the pending action: no replacement, no close, no extra box | An older snapshot reaching disk must never let newer edits be discarded silently | 2026-11-11 |
| R15 | ST4: a settings read that fails (other than `ENOENT`, after 3 × 100 ms retries of `EBUSY` / `EPERM`) runs on in-memory defaults and never writes that file for the rest of the run | Unreadable preferences must never be overwritten by defaults; a busy file (scanner, sync) usually reads a moment later | 2026-11-11 |
| R16 | ST5: the stored window takes int32 integers only (size > 0); anything else is W1 via the ST3 repair | A hand-edited or corrupted rectangle must never reach the native `Rectangle` conversion | 2026-11-11 |
| R17 | F4a: New, Open and close (window close, double-click, drop) first finish an open label or text editor through its commit path, then decide dirty; again after a prompt-triggered Save | A teacher's last typed label must never be lost or saved stale because the native close came while the box was still open | 2026-11-11 |
| R18 | View > "Zoom to &100%", Ctrl+1 and the status-bar readout run one command that sets the zoom to 100 % (editor R49, superseding editor R12's reset to the 150 % default); the default zoom of a new or loaded drawing stays 150 % Slides / 416.67 % Handout | The approved menu (A06) and shortcuts list (A12) say "Zoom to 100%"; the command must do what they say, from every place | 2026-11-11 |
| R19 | Help > Keyboard shortcuts is enabled when idle (not "always"): the K1 rule already says F1 does nothing and the menu shows it disabled while a label or text editor is open. The M1 enabled rules live once in `src/shared/menu.ts` (`commandEnabled`), used by main's menu model and re-checked by the renderer before it runs a menu command; main ignores a click on an item built disabled | One table for the menu and the dispatcher; a stale menu frame never runs a command the current state forbids | 2026-11-11 |
| R13 | Draft open questions resolved: Q1 visible (O3); Q2 remembered (O4); Q3 no (O9); Q4 recover (O5); Q5 one-click per user (O6); Q6 en-US (O9); Q7 → R4; Q8 1.0.0 (O6); Q9 yes (O9); Q10 8 (O4) | Recorded so no question stays open | 2026-11-10 |

---

## UI design

Normative visuals: `docs/mockups/shell/` A01–A17 (native parts drawn approximately; everything
inside the window exactly). Pixel values are CSS px at 100 % scaling; "content" is the page
inside the window.

### Window

| Rule | |
|---|---|
| W1 First launch | `useContentSize: true`. If a 1280×800 content window fits the primary display's work area: that size, centred. Otherwise maximized (normal bounds: that size clipped to the work area, centred) |
| W2 Remembered | On every close that goes ahead (F13 allowed, the renderer gone, or before the first N1) store `getNormalBounds()` (outer) and `isMaximized()`. On launch restore them if at least half of the stored rectangle lies inside the work area of `screen.getDisplayMatching(rect)`; else W1. Maximized is applied after the bounds. Pure: `src/main/model/window-bounds.ts` |
| W3 Title | `windowTitle(name, dirty)`: `*` when dirty, the name, ` - Chalkbond`: `Untitled - Chalkbond`, `*esterification - Chalkbond` (a `.chalk` shows without extension), `ethanol.png - Chalkbond` (a picture keeps its extension), `*Recovered drawing - Chalkbond`. Main calls `setTitle` and prevents `page-title-updated` |
| W4 Menu bar | Always visible (`autoHideMenuBar: false`); Alt or F10 focuses it (Windows) |
| W5 Zoom | `webContents.setZoomMode('disabled')` |
| W6 Minimum | Content ≥ 960×640 (`minWidth: 960`, `minHeight: 640` with `useContentSize`; probe fallback in Facts) |

### Menu bar (native; A04–A06)

**M1** Built from a pure model (`src/main/model/menu-model.ts`: `(MenuState, recent) →
MenuNode[]`) and rebuilt when `MenuState` or the recent list changes. Sentence case; `&` marks the
access key. While an in-window dialog is open (`state.modal`) every item is disabled. "Idle" =
`canRun({type: 'set-preset'})`.

**M2** Every item with a shortcut has `accelerator` set for display and `registerAccelerator:
false`; no item has a `role` (R1).

| Menu | Label | Id | Accelerator (display) | Enabled when | Runs |
|---|---|---|---|---|---|
| **&File** | &New | `file.new` | `CmdOrCtrl+N` | idle | F1 |
| | &Open… | `file.open` | `CmdOrCtrl+O` | idle | F2 |
| | Open &recent ▸ | `file.recent` | | idle and the list is non-empty | submenu `&1 esterification.chalk — Grade 11` … `&8 …` (`file.recent.0` … `.7`, F10), separator, `&Clear recently opened` (`file.recent.clear`) |
| | — | | | | |
| | &Save | `file.save` | `CmdOrCtrl+S` | idle | F5 |
| | Save &as… | `file.save-as` | `CmdOrCtrl+Shift+S` | idle | F6 |
| | — | | | | |
| | &Export… | `file.export` | `CmdOrCtrl+E` | idle, drawing not empty | clipboard-export EX1 |
| | — | | | | |
| | E&xit | `file.exit` | `Alt+F4` | always | closes the window (F13), in main |
| **&Edit** | &Undo *label* | `edit.undo` | `CmdOrCtrl+Z` | `canUndo` | `run('undo')`; label "Undo add bond" (editor `undoLabel()`, first letter lower-cased), plain "Undo" when none |
| | &Redo *label* | `edit.redo` | `CmdOrCtrl+Y` | `canRedo` | `run('redo')`, label as Undo |
| | — | | | | |
| | Cu&t | `edit.cut` | `CmdOrCtrl+X` | `canCut` | `run('cut')` (clipboard-export CB-C3) |
| | &Copy / &Copy whole drawing | `edit.copy` | `CmdOrCtrl+C` | idle, drawing not empty | CB-C1; label "Copy whole drawing" when nothing is selected (A05) |
| | &Paste | `edit.paste` | `CmdOrCtrl+V` | idle | CB-P1 |
| | &Duplicate | `edit.duplicate` | `CmdOrCtrl+D` | `canDuplicate` | `run('duplicate')` |
| | De&lete | `edit.delete` | `Delete` | `canDelete` | `run('delete')` |
| | — | | | | |
| | Select &all | `edit.select-all` | `CmdOrCtrl+A` | `canSelectAll` | `run('select-all')` |
| **&View** | Zoom &in | `view.zoom-in` | `CmdOrCtrl+=` | `canZoomIn` | `run('zoom-in')` |
| | Zoom &out | `view.zoom-out` | `CmdOrCtrl+-` | `canZoomOut` | `run('zoom-out')` |
| | &Fit drawing | `view.zoom-fit` | `CmdOrCtrl+0` | always | `run('zoom-fit')` |
| | Zoom to &100% | `view.zoom-reset` | `CmdOrCtrl+1` | always | `run('zoom-reset')` |
| | — | | | | |
| | &Slides style (radio) | `view.style-slides` | | idle | `run({type: 'set-preset', preset: 'slides'})`; checked when the preset is `slides` |
| | &Handout style (radio) | `view.style-handout` | | idle | `… 'journal'`; checked when `journal` |
| **&Help** | &Keyboard shortcuts | `help.shortcuts` | `F1` | idle (R19) | Keyboard shortcuts dialog |
| | — | | | | |
| | &About Chalkbond | `help.about` | | always | AB1, in main |

**M3 Text focus** (R2): while `MenuState.textFocus` (a text target is `document.activeElement`:
the name field, the label editor or the text editor), Edit shows &Undo, &Redo, Cu&t, &Copy,
&Paste, De&lete, Select &all, all enabled, running `webContents.undo() / redo() / cut() / copy() /
paste() / delete() / selectAll()` in main; &Duplicate is disabled.

Left out on purpose: Print, Close (Exit is enough with one window), Clean up / Kekulé / Tidy /
Flip (on the Select options bar), Find compound (the name field is the largest control), developer
tools, full screen, window menu.

### Keyboard (host keys)

**K1** The host handles exactly these keys in a capture-phase `keydown` listener on `window`
(before the editor's handler); everything else reaches the editor unchanged. "Text target" = an
`input`, `textarea` or `contenteditable` element. While an in-window dialog is open, K1 does
nothing (the dialog handles its keys). Handled keys get `preventDefault()` and
`stopPropagation()`. Pure decision: `src/renderer/app/model/keys.ts`.

| Keys | Condition | Action |
|---|---|---|
| Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S | idle (also in the name field) | F1 / F2 / F5 / F6 |
| Ctrl+E | idle, drawing not empty (also in the name field, as the File menu item) | Export dialog |
| F1 | idle | Keyboard shortcuts dialog |
| Ctrl+C | not a text target, selection empty, drawing not empty | CB-C1 whole drawing (empty drawing: N-C4) |
| Ctrl+V | not a text target, idle | CB-P1 |
| Ctrl+F | the target is outside the editor root (e.g. `body`) | `run('focus-name-field')` (editor change 4) |

While a label or text editor is open the file keys, Ctrl+E and F1 do nothing (the menu shows them
disabled). In a text target Ctrl+C / V / X / Z / Y / A stay native text keys (the editor's own R23
still applies to Ctrl+Z / Y in the empty name field).

**K2 Conflict check** (unit test against the editor's `globalCommand` and `canvasKey` from
`src/renderer/editor/model/keymap.ts`, imported by the test file only): the host's Ctrl+N, O, S,
Shift+S, E and F1 return `null` from `globalCommand` and `canvasKey`, and none is an editor K3 key
(Ctrl+B, I, =, Shift+=, Shift+D, Shift+H). Menu access keys need Alt; editor keys require Alt up.

**K3 Alt after Alt+click** (R4): a `pointerdown` with `altKey` arms a flag; the next `keyup` of
Alt is `preventDefault()`-ed (an unconsumed key event is what makes Electron's menu bar take
focus) and disarms it; any other keydown also disarms it.

### Context menus (native)

- **CM1** On the editor's `context-menu` event (after editor change 3 has selected an unselected
  item) the host sends I6 with `onItem` and the current `MenuState`; main pops up the menu at the
  cursor and resolves with the chosen command or null (Esc, click elsewhere).

  | Right-click on | Items (A07; accelerators display-only) | Enabled |
  |---|---|---|
  | a drawing item | Cu&t `Ctrl+X` · &Copy `Ctrl+C` · &Duplicate `Ctrl+D` · De&lete `Del` · — · &Paste `Ctrl+V` | as the Edit items |
  | empty canvas | &Paste `Ctrl+V` · &Copy whole drawing `Ctrl+C` (&Copy when something is selected) · — · Select &all `Ctrl+A` | Paste idle; Copy drawing not empty; Select all `canSelectAll` |

- **CM2** A chosen item runs the same function as the Edit item (Paste: clipboard-export R3).
  Left out: Clean up, Kekulé, Expand, Flip (on the options bar once selected), z-order,
  Properties.
- **CM3** Text fields (R3): main's `webContents.on('context-menu')` with `params.isEditable`
  pops up Cu&t · &Copy · &Paste · — · Select &all using the `cut`, `copy`, `paste`, `selectAll`
  roles. Non-editable targets are ignored there (the canvas prevents the DOM event; elsewhere
  nothing appears).

### Files

**Prompt** (A09; I4 `save-changes`): native box, `type: 'warning'`, title `Chalkbond`, message
`Do you want to save changes to “esterification”?` (`Untitled`, `Recovered drawing`), detail
`If you don't save, your changes will be lost.`, buttons **Save** · **Don't save** · **Cancel**,
`defaultId` 0, `cancelId` 2, `noLink: true`.

| Rule | Behaviour |
|---|---|
| F1 New | F4; then `controller.load(setStyle(emptyDoc(clock()), { preset: settings.newDrawingStyle }))` (no undo step, not dirty); session Untitled; N4 recovery clear |
| F2 Open | I1 (filter **Chalkbond drawings** `*.chalk;*.png;*.svg` and, under clipboard-export PDF-A, `*.pdf`; starts in the last open folder, else Documents); cancel → nothing. A name without an Open extension (typed `notes.docx`) → main shows the F14 `unsupported` box built from its base name, I1 answers `null`: the drawing is untouched, no prompt, no ref. Only the name is judged here; a missing file, a directory or a read error with an Open extension is reported by I2 with its own F14 row. Then F3 |
| F3 Open a ref | I2 → bytes; `fileKindOf(name)`; `extractDrawing(kind, bytes, decodeUtf8)`; `parse`; any failure → I5 error box (F14), the current drawing untouched, no prompt. Success → F4; then `controller.load(doc)`; session = the file (kind `chalk` or `picture`); N2 (recent, last folder); N4. No notice (the title says it) |
| F4 `confirmDiscard()` | First F4a. Not dirty → proceed. Dirty → prompt: Save → F5, then F4a again (cancelled or failed → stop; succeeded but the drawing changed during the write, or a label or text editor was open, so still dirty → stop, R14); Don't save → proceed; Cancel → stop. The prompt names the session as the title does (`esterification`, `toluene.png`, `Untitled`) |
| F4a Finish editing | (R17) Before F4 decides anything for New, Open (after F3 validated the file) or close (F13, a handed-over open: F11, F12), and again after F4's Save before R14 decides, an open label or text editor is finished through its own commit and formatting path, as a click elsewhere does: the host's DOM-only port `finishEditing(): Promise<void>` (`src/renderer/app/finish-editing.ts`, injected into `file-flows.ts`) sees an open editor through the controller's public `canRun('focus-name-field')` (false only while one is open), subscribes, blurs the editor's box and resolves once the editor has closed (no timeout). An IME composition in progress keeps it open until `compositionend` (editor IME rule). The name field's text is not a drawing edit and is never inserted. A gesture in progress is cancelled by the existing rules, never committed. File keys stay ignored while typing (K1) |
| F5 Save | Session is a `.chalk` file with a writable ref → `before = getDoc()`, write `serialize(before)` (C4); else F6. Success: if `getDoc() === before` then `controller.markSaved()` and `forcedDirty` cleared (R7); else the drawing stays dirty; session file kept; N4; notice "Saved esterification.chalk." (the file's base name). Failure → I5 with the write problem, still dirty |
| F6 Save as | C3 with `format: 'chalk'`, suggested `<session name without extension>.chalk` or `Untitled.chalk`; folder: the picture's folder for a picture-opened drawing, else the last save folder, else Documents. Main decides the folder from the session ref it last received on N2 (the renderer sends no folder or path). Cancel or a failed write changes nothing (session, title, dirty). Then write and F5's success path; the session becomes that file (kind `chalk`, writable ref); N2 |
| F7 Dirty | `dirty = controller.isDirty() \|\| session.forcedDirty`; `forcedDirty` is true only for a recovered drawing until saved. A picture-opened drawing is not dirty until edited |
| F8 Save dialog | `showSaveDialog(win, { defaultPath, filters: [one filter: "Chalkbond drawing" chalk, "PNG picture" png, "SVG drawing" svg, "PDF document" pdf] })`; Windows asks before overwriting what the teacher typed. R6: the extension is appended when missing; if that changes the path and the file exists, a native box (`type: 'warning'`, message `“x.chalk” already exists.`, detail `Do you want to replace it?`, buttons **Replace** · **Cancel**, `cancelId` 1) asks; Cancel → null |
| F9 Atomic write | Write `<target>.<random>.tmp` in the same folder, `FileHandle.sync()`, rename over the target (retry 3 × 100 ms on `EBUSY` / `EPERM`), remove the temp file on failure |
| F10 Recent | ≤ 8 paths, newest first; duplicates (case-insensitive on Windows) move to the top; added on every successful open and save. Label `&n` + base name with `&` doubled; two entries with the same base name get ` — <parent folder name>` (A04). A missing file → F14 "can't be found" and the entry is removed. Clear empties the list |
| F11 Double-click / second launch | The installer associates `.chalk`. `fileArg(argv)` = the last argument that does not start with `-` and ends in an Open extension (case-insensitive). First launch: the path goes into I7's `open`. `second-instance`: restore if minimized, focus, then `main:event {open}` (or I7's `open` if the renderer has not started; latest wins). The renderer runs F3 when no flow is in progress, else queues it (one pending request, latest wins) |
| F12 Drag and drop | Files dragged over the window show the drop overlay (A13); dropping runs I3 on the first file with an Open extension through the preload's `openDroppedFile(file)` (SEC14), then F3. None → I5 `unsupported` with the first file's name. Text drags are left to the editor |
| F13 Close | Window `close` (title-bar ×, Alt+F4, File > Exit) → main prevents it and sends `close-requested`; the renderer runs F4; proceed → N4, N5 → main closes for real. Main intercepts only once the renderer has sent its first N1 (it listens for `main:event` by then). If the renderer is gone (`render-process-gone`) main closes without asking (the recovery file covers it). A close request while a flow runs waits as the pending request (latest wins, like a pending open) |

**F14 File errors** (native box, `type: 'error'`, title `Chalkbond`, button **OK**; wording A10;
message / detail built in main from `{ problem, name }` by `src/main/model/messages.ts`):

| Problem | Message | Detail |
|---|---|---|
| `missing` | “ethanol.chalk” can't be found. | It may have been moved, renamed or deleted. |
| `too-large` | “ethanol.chalk” is too large to open. | Drawings can be up to 20 MB. Pictures made in Chalkbond can be up to 64 MB. *(clipboard-export C9; also when the drawing inside a picture is over 20 MB)* |
| `unsupported` (a drop, F12; or a name typed into Open, F2) | Chalkbond can't open “notes.docx”. | It opens Chalkbond drawings (.chalk) and pictures made in Chalkbond (.png, .svg). *(", .pdf" under PDF-A)* |
| `no-drawing` | “photo.png” has no Chalkbond drawing inside. | Only pictures exported or copied from Chalkbond can be opened and changed. |
| `newer-version` | “ethanol.chalk” was made with a newer version of Chalkbond. | Install the newer Chalkbond to open it. The file has not been changed. |
| `damaged` (and every other `parse` code, a decode failure) | Chalkbond can't open “ethanol.chalk”. | The file is damaged or is not a Chalkbond drawing. The file has not been changed. |
| `unreadable` (`EACCES`, `EPERM`, `EBUSY`, other read errors) | Chalkbond can't read “ethanol.chalk”. | It may be open in another program, or you may not have permission to open it. |
| `write-denied` (`EACCES`, `EPERM`, `EROFS`) | Couldn't save “ethanol.chalk”. | Chalkbond isn't allowed to save in this folder. Choose another folder. |
| `disk-full` (`ENOSPC`) | Couldn't save “ethanol.chalk”. | The disk is full. Free some space or choose another drive. |
| `busy` (`EBUSY`) | Couldn't save “ethanol.chalk”. | The file is open in another program. Close it and try again. |
| `folder-gone` (`ENOENT`) | Couldn't save “ethanol.chalk”. | The folder no longer exists. Choose another folder. |
| `write-failed` (other, PDF print failure) | Couldn't save “ethanol.chalk”. | Something went wrong while saving. Try again, or choose another folder. |

The full error goes to the log (LG1), never to the screen. A failed open never changes the
current drawing; a failed save keeps it dirty.

**Notices** (status-bar hint slot via `controller.notify`, wording A17): N-A1 info "Saved
esterification.chalk." (F5); N-A2 info "Recovered your unsaved drawing. Save it, then open
ethanol.chalk again." (RC4).

### Recovery

| Rule | Behaviour |
|---|---|
| RC1 Write | While dirty, the renderer sends N3 `{ text: serialize(doc), name }` 2 s after the last document change, and never more than 10 s after the first unsaved change of a burst (pure timer `model/recovery-timer.ts`, injected clock). Main writes `userData/recovery/drawing.chalk` and `recovery.json { name, savedAt }` atomically (F9) |
| RC2 Clear | N4 on save success, after New / Open passed F4, on Delete in RC3, on a normal close, and when undo returns to the saved state |
| RC3 Offer | At launch (I7), if `drawing.chalk` parses: native box (A11), `type: 'info'`, title `Chalkbond`, message `Chalkbond closed before your drawing was saved.`, detail `Do you want to recover it? If you delete it, it can't be brought back.`, buttons **Recover** · **Delete**, `defaultId` 0, `cancelId` 0 (closing the box recovers), `noLink`. Recover → load it, session `Recovered drawing`, `forcedDirty`; Save goes to Save as with the old name suggested. Delete → N4. A recovery file that does not parse is deleted silently and logged |
| RC4 With a file request | If a launch carries a file (F11) and a recovery exists, recovery is offered first; after Recover the file is not opened and N-A2 is shown; after Delete the file opens (F3) |
| RC5 Shutdown | On `query-session-end` main sends `main:event {flush-recovery}`; the renderer writes N3 at once when dirty. The session end is not prevented (R5) |
| RC6 Order | Main runs recovery writes and clears strictly in arrival order (one promise chain), so a clear is never overtaken by an older write |

### Settings (no UI)

`userData/settings.json`, read once at start, written atomically 500 ms after a change (main
`settings-io.ts`; pure `model/settings.ts`). Lenient parse: unknown keys dropped, each invalid
field replaced by its default, a broken file replaced by defaults (logged).

```ts
interface Settings {
  version: 1;
  newDrawingStyle: 'slides' | 'journal';                         // ST1; default 'slides'
  export: { format: 'png' | 'svg' | 'pdf'; pngDpi: 150 | 300 | 600; pngWhite: boolean };
                                                                 // default png, 300, false
  window: { x: number; y: number; width: number; height: number; maximized: boolean } | null;
                                                                 // ST5: int32 integers, size > 0
  recent: string[];                                              // ≤ 8 absolute paths
  folders: { open: string | null; save: string | null; export: string | null };
}
```

- **ST1** A document change that switches the preset (status-bar switch, View menu, undo/redo of
  a switch; not a load) stores `newDrawingStyle`. New uses it.
- **ST2** The renderer sees only `RendererSettings = { newDrawingStyle, export }`; paths stay in
  main. Export's Save dialog starts in `folders.export` (else `folders.save`, else Documents).
  `folders.open` / `folders.save` follow N2 (an opened / a Save-as ref); `folders.export` is the
  folder of the file an Export Save dialog returned (C3 with `png`, `svg` or `pdf`). A picture
  session's Save as still starts in the picture's folder (A6). `recent` is parsed and kept; only
  A15 changes it. ST1's "not a load": the host's loads (New, Open, recover, test hook) go through
  one wrapper around `controller.load` that suppresses the memory for that call; dirty and busy
  are not signals (a real switch may undo back to clean, or happen while a save runs).
- **ST3** (A10) A broken file, or one with a repaired field or a dropped key, is logged and
  rewritten valid at start. Writes go to a temp file in the same folder, then a rename. Pending
  changes are flushed on `will-quit`.
- **ST4** (R15) The start-up read retries only `EBUSY` / `EPERM`, 3 × 100 ms (as F9). `ENOENT` is a
  new settings file: defaults, written normally. Any other failure, or `EBUSY` / `EPERM` after the
  retries, is logged; the run uses the defaults in memory (changes still apply in memory) and
  writes that file **never** this run: no repair, no debounced write, no flush on `will-quit`, no
  window bounds on close; the file's bytes stay as they were. No visible warning. The next launch
  that reads it succeeds normally. A read that succeeds but finds broken JSON is ST3 (rewritten).
- **ST5** (R16) `window` holds only signed 32-bit **integers** `x`, `y` and positive 32-bit
  integers `width`, `height`, plus a boolean `maximized`; a fractional, out-of-range,
  non-finite, non-numeric or non-positive value makes `window` null (W1) through ST3's repair, so
  main never passes an invalid `Rectangle` to `screen.getDisplayMatching` or `setBounds`.
- Left out: fonts, bond length, line width, language, theme, autosave interval, clipboard
  options, default folder, update checks, "open last file at start".

### Keyboard shortcuts dialog (`data-testid="shortcuts-dialog"`; A12)

Dialog shell, width `--dialog-w-md` (560), top `--dialog-top` (96), bottom at least
`--dialog-bottom` (32) above the content bottom; the body scrolls with an always-visible thin
scrollbar and ends on a rule above the footer. Title "Keyboard shortcuts". Sections in this order
with `--type-sm` 600 headings, 16 px above each; rows at least 28 high (they grow when alternatives wrap, e.g. C H N O S P F I, never clipped; DEVIATIONS) with a 1 px `--chrome-bg` rule (as `shell.css`); keys in
a 136 px column as key chips (`kbd`, `--kbd-h` 20 high, min-width 20, padding 0 4, 1 px
`--border-control` with a 2 px bottom edge, `--radius-xs`, `--type-xs`, `--chrome-bg`; a
combination is one chip per key joined by a muted "+"; alternatives side by side), meaning on the
right (`--type-sm`). Footer: **Close** (secondary); Enter, Esc and a scrim click close. Content
(`src/renderer/app/model/shortcuts.ts`, exactly the rows of `docs/mockups/shell/pages.mjs`
`SHORTCUTS`):

| Section | Rows (keys → meaning) |
|---|---|
| Tools | V Select · E Erase · B Bond · Z Chain · R Ring · L Atom · A Arrow · + Plus · M Curved arrow · T Text |
| Pointing at an atom | C H N O S P F I "Change it to that element" · L "Change it to chlorine (Cl)" · B "Change it to bromine (Br)" · + − "Add a positive or negative charge" · 1 2 3 "Add a single, double or triple bond" · Enter "Type a label, such as OH or CH3" |
| Pointing at a bond | 1 2 3 "Make it single, double or triple" · W "Make it a wedge" · H "Make it a hash" |
| Editing | Ctrl+Z Undo · Ctrl+Y Redo · Ctrl+C "Copy (the whole drawing when nothing is selected)" · Ctrl+X Cut · Ctrl+V Paste · Ctrl+D Duplicate · Ctrl+A Select all · Delete Delete · ← ↑ → ↓ "Move the selection (hold Shift to move further)" · Esc "Cancel, or clear the selection" |
| Chemistry | Ctrl+F "Type a compound name" · Ctrl+Shift+L Clean up · Ctrl+Shift+K "Show Kekulé or circle" · Ctrl+Shift+T Tidy reaction |
| View | Ctrl+= Zoom in · Ctrl+− Zoom out · Ctrl+0 Fit drawing · Ctrl+1 "Zoom to 100%" · Space+drag "Move around the drawing" |
| Files | Ctrl+N "New drawing" · Ctrl+O Open · Ctrl+S Save · Ctrl+Shift+S Save as · Ctrl+E Export · F1 "This list" |
| While typing text | Enter Finish · Shift+Enter "New line" · Esc Cancel · Ctrl+B Bold · Ctrl+I Italic · Ctrl+= Subscript · Ctrl+Shift+= Superscript · Ctrl+Shift+D "Insert Δ (heat)" · Ctrl+Shift+H "Insert hν (light)" |

The first section (Tools) is fully visible without scrolling at 1280×800 and at 960×640 content.
A unit test checks every row against the editor's keymap (`globalCommand`, `canvasKey`,
`hoverKeys`, the tool keys) or K1.

### About box (AB1, native; A14)

`showMessageBox(win, { type: 'none', icon: nativeImage.createFromPath(<icon.png>), title: 'About
Chalkbond', message: 'Chalkbond <version>', detail, buttons: ['OK', 'Licences'], defaultId: 0,
cancelId: 0, noLink: true })`, detail:

```
Draw chemical structures and reactions for teaching.

Works fully offline. Nothing you draw leaves this computer.

Copyright © 2026 <package.json author>.
Built with OpenChemLib, Electron, React, Immer and Zod.
```

**Licences** opens `THIRD-PARTY-NOTICES.txt` from `process.resourcesPath` (packaged) or `build/`
(dev) with `shell.openPath` (Notepad). `icon.png` comes from the same folder.

### Drop overlay (`data-testid="drop-overlay"`; A13)

Shown while files are dragged over the window (`dragenter` with `Files` in `dataTransfer.types`);
hidden on `dragleave` of the window, `drop` or Esc. Covers the content; background `--drop-bg`;
an inner box inset 8 px with `2px dashed var(--accent)`, radius `--radius-md`; centred "Drop to
open" (`--type-title`, `--active-fg`) and 4 px below "Chalkbond drawings (.chalk) and pictures
made in Chalkbond (.png, .svg)" (`--type-sm`, `--text-muted`; ", .pdf" under PDF-A). `aria-hidden`
(Ctrl+O is the keyboard path). No motion.

### Visual language

- **V1 Normative files and how they enter the app** (R12): `docs/mockups/shell/shell-tokens.css`
  is copied to `src/renderer/app/shell-tokens.css` (identical after the leading comment block) and
  `docs/mockups/shell/shell-icons.svg` to `src/renderer/app/shell-icons.svg` (byte-identical). The
  editor's `tokens.css` / `icons.svg` stay untouched copies of `docs/mockups/editor/`. `App.tsx`
  imports `shell-tokens.css` after the editor's tokens and injects `shell-icons.svg?raw` inline
  once (as the editor injects its sprite: external sprites do not load from `file://`), so
  `<use href="#copy">`, `#check`, `#info` resolve. App and clipboard-export CSS use tokens only.
- **V2 Tooling test** `tests/tooling/shell-tokens.test.ts` checks: (a) both copies equal their
  normative file as above; (b) no custom property is defined in both `shell-tokens.css` and the
  editor's `tokens.css`; (c) no `<symbol id>` appears in both sprites; (d) every `var(--x)` in
  `src/renderer/app/**/*.css` and `src/renderer/clipboard-export/**/*.css` is defined in one of the
  two token files; (e) those CSS files contain no hex or `rgb(` colour literal; (f) contrast
  (WCAG 2.x): `--primary-fg` on `--primary-bg`, `--primary-hover-bg`, `--primary-pressed-bg` ≥ 4.5;
  `--text-muted` on `--active-bg` ≥ 4.5; `--active-fg` on `--drop-bg` composited over
  `--canvas-bg` ≥ 4.5; `--text` on `--canvas-bg` ≥ 4.5; `--accent` on `--canvas-bg` ≥ 3;
  `--border-control` on `--canvas-bg` ≥ 3.
- **V3 Primitives** (`src/renderer/app/ui/`; real `<button>` / `<input>` elements with accessible
  names; disabled = `aria-disabled="true"`, focusable, tooltip says why; focus ring `2px solid
  var(--accent)` offset 2 on `:focus-visible`; no motion except `--motion-fade` on dialog open,
  off under `prefers-reduced-motion`). Boxes as `docs/mockups/shell/shell.css` (A03):

| Primitive | Box | Rest | Hover | Pressed | Selected / checked | Disabled |
|---|---|---|---|---|---|---|
| Primary button | `--control-h` 32, padding 0 16, radius 6, `--type-sm` 600 | `--primary-bg`, `--primary-fg` | `--primary-hover-bg` | `--primary-pressed-bg` | — | `--hover-bg`, `--text-disabled` |
| Secondary button | 32, padding 0 16, radius 6, 1 px `--border-control`, `--type-sm` 600 | `--canvas-bg`, `--text` | `--hover-bg` | `--pressed-bg` | — | border `--border`, `--text-disabled` |
| Radio card | full width, min 56, padding 8 12, radius 6, 1 px `--border`; dot 16 at left; title `--type-sm` 600, description `--type-xs` `--text-muted` at x 36 | `--canvas-bg` | `--hover-bg` | `--pressed-bg` | `--active-bg`, 1 px `--accent` border + 1 px inset; dot 1.5 px `--accent` ring, 8 px centre | — |
| Checkbox | 16 × 16, `--radius-xs`, 1 px `--border-control`; label `--type-sm` 8 px right; help `--type-xs` `--text-muted` below | `--canvas-bg` | box `--hover-bg` | box `--pressed-bg` | box `--accent`, `check` 12 px `--primary-fg` | — |
| Segmented control | 32, 1 px `--border-control` outline and dividers, radius 6; segments min-width 76, padding 0 12, `--type-sm` | transparent, `--text` | `--hover-bg` | `--pressed-bg` | `--active-bg`, `--active-fg`, 600 | — |
| Dialog shell | width per dialog, top `--dialog-top`, centred horizontally, padding 24, radius 6, `--canvas-bg`, `--shadow-dialog`, over `--scrim`; title `--type-title`; footer right-aligned 24 px above the bottom padding, buttons 8 px apart (secondary then primary) | | | | | |

Radio groups and segmented controls: `role="radiogroup"`, children `role="radio"` with
`aria-checked`, one tab stop, arrows move and select, Home / End. Dialog shell: `role="dialog"`,
`aria-modal="true"`, `aria-labelledby`; focus trapped; Esc cancels; focus returns to the element
focused before.

### App and file icons (A16)

- **IC1** Sources (normative, not copied): `docs/mockups/shell/app-icon.svg` (48 px and up) and
  `app-icon-small.svg` (16–32 px), tile `#2f6e60`, chalk-white `#f7f7f2` toluene glyph.
- **IC2** `.chalk` file icon: `docs/mockups/shell/file-icon.svg` and `file-icon-small.svg`.
- **IC3** `npm run icons` (`scripts/build-icons.mjs`, dev-time, no new dependency) renders the
  SVGs with Playwright's Chromium (`@playwright/test`, already a devDependency; `npx playwright
  install chromium` if missing) at 16, 20, 24, 32, 40, 48, 64 and 256 px, and writes ICO files
  whose entries are PNG-compressed (6-byte `ICONDIR`, 16-byte entries, width/height byte 0 for
  256; supported since Windows Vista) with a small pure writer `scripts/ico.mjs`:
  `build/icon.ico` (app), `build/chalk-file.ico` (association), and `build/icon.png` (256, About
  box). Outputs are committed; electron-builder uses the `.ico` files as they are (Facts).

### Left out (deliberately)

| Left out | Why |
|---|---|
| Settings screen | O4 |
| Tabs, several windows | A1 |
| Toolbar buttons for New / Open / Save | The menu and Ctrl+S; the top bar keeps one primary action (Copy) |
| Print | PDF or Word does it better |
| Welcome screen, tips, "what's new" | The editor's empty state already teaches the first step |
| Online help, update check, feedback | Offline |
| Autosave to the real file | Silent overwrites surprise people; the recovery file protects without touching the file |
| Dark theme | Slides and handouts are white |
| `.png` / `.svg` association, Jump List | O9, R11 |

---

## Architecture

### Where the code lives

```
src/shared/channels.ts            channel names only (no imports): preload, main, renderer
src/shared/ipc-types.ts           request/response types (type-only, inferred from the schemas)
src/shared/menu.ts                MenuState, AppCommand ids and the M1 enabled rules (pure, no imports; R19)
src/main/
  index.ts                        lifecycle, single instance, window, wiring
  ipc.ts                          handle(): sender check, Zod, dispatch, logging
  ipc-schemas.ts                  Zod schemas for every channel (main only)
  files.ts  menu.ts  dialogs.ts  recovery.ts  settings-io.ts  log.ts  security.ts
  model/                          pure, no electron or node imports, ≥ 90 % lines
    menu-model.ts  context-menu-model.ts  recent.ts  settings.ts  window-bounds.ts
    args.ts  titles.ts  messages.ts  write-problem.ts  file-refs.ts
  clipboard-export/               SPEC-clipboard-export.md
src/preload/index.ts  api.d.ts    named functions only
src/renderer/app/
  App.tsx                         host: controller, session, flows, dialogs, overlay, test hook
  host-keys.ts                    K1 listener → model/keys.ts
  model/                          pure (DOM-free lint block), ≥ 90 % lines
    session.ts  file-flows.ts  keys.ts  menu-state.ts  shortcuts.ts  recovery-timer.ts
    test-hook.ts
  ui/                             Button, Dialog, RadioCard, Checkbox, Segmented, Icon, Kbd
  ShortcutsDialog.tsx  DropOverlay.tsx  shell-tokens.css  shell-icons.svg  app.css
scripts/build-icons.mjs  scripts/ico.mjs  scripts/build-notices.mjs
build/icon.ico  build/chalk-file.ico  build/icon.png  build/THIRD-PARTY-NOTICES.txt
e2e/app-*.spec.ts  e2e/win/app-*.spec.ts
```

`tsconfig.node.json` and `tsconfig.web.json` include `src/shared/**/*`. Lint (task A1):
`src/main/**` and `src/preload/**` import no `@core/*` and no path into `src/core`;
`src/preload/**` imports at runtime only `electron` and `src/shared/channels`;
`src/main/model/**` imports neither `electron` nor `node:*`; `src/renderer/app/model/**` and
`src/renderer/clipboard-export/model/**` join the editor's DOM-free block; production files in
`src/renderer/{app,clipboard-export}/**` import the editor only through
`src/renderer/editor/index.ts` (test files may import its `model/keymap`).

### Process split and IPC

The renderer owns the document, the editor, rendering and every decision; main owns windows,
menus, dialogs, the clipboard, the file system, settings, recovery and logs. Files are named by
opaque refs main creates:

```ts
type FileRef = { id: string /* crypto.randomUUID() */; name: string /* base name */;
                 kind: 'chalk' | 'png' | 'svg' | 'pdf' };
```

Main keeps `id → { path, kind, writable }` for the session (`model/file-refs.ts`): Save-dialog
refs are writable for their kind; `.chalk` refs the user opened are writable (Save in place);
picture refs are read-only.

**Renderer → main, `invoke`** (one preload function each; every request Zod-validated; a failed
validation rejects and is logged). C1–C5 are clipboard-export's (its "IPC channels used").

| Ch. | Channel / preload function | Request | Response |
|---|---|---|---|
| I1 | `file:choose-open` / `chooseOpen` | `{}` | `FileRef \| null` |
| I2 | `file:read` / `readFile` | `{ ref: uuid }` | `{ ok: true, bytes: Uint8Array } \| { ok: false, problem: 'missing' \| 'too-large' \| 'unreadable' }` |
| I3 | `file:dropped` / `openDroppedFile(file: File)` (path taken in the preload) | `{ path: string ≤ 4096 }` | `{ ok: true, ref } \| { ok: false, problem: 'unsupported' \| 'missing' \| 'too-large', name }` |
| I4 | `dialog:ask` / `ask` | `{ kind: 'save-changes', name: string ≤ 255 } \| { kind: 'recover' }` | `'save' \| 'discard' \| 'cancel'` / `'recover' \| 'delete'` |
| I5 | `dialog:file-error` / `showFileError` | `{ problem: FileProblem, name: string ≤ 255, no / or \ }` | `void` |
| I6 | `context-menu:show` / `showContextMenu` | `{ onItem: boolean, state: MenuState }` | `ContextCommand \| null` |
| I7 | `app:startup` / `startup` | `{}` | `{ settings: RendererSettings, recovery: { text, name } \| null, open: FileRef \| null }` |
| I8 | `settings:set` / `setSettings` | `Partial<RendererSettings>` | `void` |

**Renderer → main, `send`:**

| Ch. | Channel / preload function | Payload | Main does |
|---|---|---|---|
| N1 | `session:update` / `updateSession` | `{ title: string ≤ 300, dirty: boolean, menu: MenuState }` | `setTitle`; rebuilds the menu when `menu` changed; remembers `dirty` |
| N2 | `session:file` / `sessionFile` | `{ ref: uuid \| null }` (null: New, an Untitled session) | the session file for F6's folder; last open folder (an opened ref) or last save folder (a Save-as ref); recent list (F10, A15). An unknown id is ignored and logged |
| N3 | `recovery:write` / `writeRecovery` | `{ text: string ≤ 20 MB starting "{", name: string ≤ 255 }` | RC1, RC6 |
| N4 | `recovery:clear` / `clearRecovery` | `{}` | RC2, RC6 |
| N5 | `app:close-ok` / `closeOk` | `{}` | closes the window (F13) |
| N6 | `log:error` / `logError` | `{ message: string ≤ 4000 }` | LG1 |

**Main → renderer**, one channel `main:event` (preload `onMainEvent(cb)` returns an
unsubscribe): `{ type: 'command', command: AppCommand }` (menu ids) · `{ type: 'open', ref }` ·
`{ type: 'close-requested' }` · `{ type: 'flush-recovery' }`.

```ts
type MenuState = {
  idle: boolean; modal: boolean; textFocus: boolean; empty: boolean; hasSelection: boolean;
  canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null;
  canCut: boolean; canDuplicate: boolean; canDelete: boolean; canSelectAll: boolean;
  canZoomIn: boolean; canZoomOut: boolean; preset: 'slides' | 'journal';
};
```

`model/menu-state.ts` derives it from the controller after each `doc`, `selection`, `history` and
`busy` event, on focus changes and on dialog open / close, at most once per animation frame; N1
is sent only when title, dirty or state changed.

### Security

| # | Rule | Test |
|---|---|---|
| SEC1 | `webPreferences`: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`, `webviewTag: false`, `devTools: !app.isPackaged` | smoke e2e reads `getLastWebPreferences()` |
| SEC2 | `app.on('web-contents-created')` for every webContents: `setWindowOpenHandler(() => ({ action: 'deny' }))`, `will-navigate` and `will-attach-webview` prevented | e2e: `window.open('https://example.com')` leaves one window; `location.href = 'https://example.com'` leaves the URL unchanged |
| SEC3 | `session.defaultSession` permission request and check handlers deny everything | e2e: `Notification.requestPermission()` is `'denied'`; `getUserMedia` rejects |
| SEC4 | `webRequest.onBeforeRequest`: cancel every request whose scheme is not `file:`, `data:`, `blob:`, `devtools:` or (unpackaged only) the electron-vite dev server origin and its `ws:`; each cancel is logged and counted | e2e: a `fetch('https://example.com')` rejects and the counter (TH4) becomes 1; every other e2e file asserts the counter is 0 at its end |
| SEC5 | The preload exposes named functions only, each with a fixed channel; no generic `invoke`, no `ipcRenderer`, no Node objects; it imports at runtime only `electron` and `src/shared/channels` | C7 adds only `clipboardWrite` and `clipboardRead` to the existing `startup`, `updateSession`, `platform`, `logError`, `onMainEvent` bridge. A7 adds `chooseOpen`, `readFile`, `chooseSave`, `writeFile`, `ask`, `showFileError`. A8 adds `sessionFile` and `closeOk`. C12 adds `printPdf` (clipboard-export C5). e2e: `Object.keys(window.chalkbond)` equals the documented list; lint probe |
| SEC6 | Every handler (via `handle()` in `ipc.ts`) checks `event.senderFrame` is the main window's main frame and its URL is the app's `index.html` (or the dev server when unpackaged); otherwise it rejects and logs | unit tests of `handle()` with fake events: null frame, other frame, other URL, bad payload |
| SEC7 | Reads only through refs or a validated drop path: `fs.stat` regular file, extension in the Open list, a `.chalk` ≤ `MAX_FILE_BYTES` (20 MiB) and a picture (`.png`, `.svg`, `.pdf`) ≤ 64 MiB (clipboard-export C9: what C4 may write; the drawing inside still meets `parse`'s 20 MiB) | unit tests of `files.ts` in a temp folder (directory, symlink to a directory, 21 MB `.chalk`, 21 MB and 64 MiB + 1 pictures, `.exe`) |
| SEC8 | Writes only to writable refs of the matching kind; the data's signature must match (`{` chalk, PNG signature, `<svg`, `%PDF-`); ≤ 64 MB; atomic (F9); internal files only under `userData` and the OS temp folder | unit tests: picture ref refused, wrong signature refused, temp file removed after a failed rename |
| SEC9 | The main process imports no `src/core` module and parses no user content beyond size and signature checks | lint probe |
| SEC10 | The hidden PDF window (clipboard-export PD1, CS6) | clipboard-export CS6 |
| SEC11 | `shell.openExternal` is never used; `shell.openPath` only for the bundled `THIRD-PARTY-NOTICES.txt` | tooling test: `src/main/**` contains no `openExternal` and one `openPath` call site |
| SEC12 | Test flags (TH1) are honoured only when `!app.isPackaged` | unit test of `args.ts` `testFlags(argv, isPackaged)`; packaged e2e (A17) finds no `__chalkbondTest` |
| SEC13 | The renderer CSP meta stays `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'` | tooling test reads `src/renderer/index.html` |
| SEC14 | A dropped file's path is read in the preload (`webUtils.getPathForFile`) and sent by the preload; the page cannot pass a path string | e2e: calling `openDroppedFile` with a JS-made `File` returns `unsupported` with an empty name and opens nothing |
| SEC15 | Native box texts come from `model/messages.ts`; the renderer sends only `{ problem, name }` with a base name | unit tests of `messages.ts` (every F14 row) and of the I5 schema (a name with `\` is rejected) |

### Controller ownership and the session

```tsx
// src/renderer/app/App.tsx (shape, not code)
const controller = createEditorController({
  clock: () => new Date().toISOString(),
  doc: setStyle(emptyDoc(now), { preset: startup.settings.newDrawingStyle }),
  shortcuts: 'all',                 // the editor keeps its K1 keys; the host adds its K1 above
  onCopy: copyFlow.onCopy,          // clipboard-export CB-C1 / CB-C3
  logError: (e) => window.chalkbond.logError({ message: String(e) }),
});
<Editor controller={controller} actions={<CopyButton … />} />
```

- **CO1** One controller for the window's lifetime; documents change only through
  `controller.load` (New, Open, Recover, test hook).
- **CO2** `session.ts` holds `{ name, kind: 'untitled' | 'chalk' | 'picture' | 'recovered', ref:
  FileRef | null, forcedDirty }`; `dirty` per F7; the title per W3.
- **CO3** `subscribe`: `dirty`, `doc` → title, N1, RC1 timer, preset tracking (ST1); `selection`,
  `history`, `busy` → menu state; `context-menu` → I6, then the chosen command.
- **CO4** `file-flows.ts` implements F1–F13 over injected ports (`main`, `controller`, `notify`,
  `clock`) with one in-progress flag and one pending request (an open ref or a close; latest
  wins), so every flow is unit-tested in node with fakes. While a flow runs, New, Open (dialog),
  Save and Save as are ignored. Every session change publishes N1 itself (title and dirty are
  derived after the session changed, not only on editor events). Open validates the bytes before
  F4; any failure or cancel leaves the drawing and session unchanged. A `finishEditing` port (F4a)
  runs before F4's dirty check and after its Save.
- **CO5** Startup: I7 → `recovery` ? RC3 (then RC4) : `open` ? F3 : the empty drawing. The canvas
  has focus afterwards (editor K5).

### Test hook

- **TH1** Main reads two flags only when `!app.isPackaged` (`args.ts`): `--chalkbond-test-hooks`
  (load the page with `query: { testHooks: '1' }`, define `globalThis.__chalkbondTestMain`) and
  `--chalkbond-user-data=<dir>` (`app.setPath('userData', dir)` before the single-instance lock).
- **TH2** With `testHooks=1` in `location.search`, `App.tsx` defines `window.__chalkbondTest = {
  load(doc): void /* as an Untitled document */, run(cmd: EditorCommand): void /* host-direct seam tests */, getDoc(): Doc, getSelection(): { atoms: string[];
  bonds: string[]; objects: string[] }, events(): EditorEvent[], clearEvents(): void, notices():
  { kind: string; text: string }[], commands(): string[] }` (editor events, host notices and the
  `main:event` commands received, collected since start or the last clear). Without the query
  nothing is defined.
- **TH3** `e2e/launch.ts` passes both flags (a fresh `mkdtemp(os.tmpdir())` user-data folder per
  launch unless the test passes one, e.g. to relaunch with the same data), keeping any main-process
  preload it already loads (such as `e2e/no-os-mouse.mjs`); `e2e/harness.ts`
  reimplements `loadDocument`, `readDocument`, `listenEvents`, `heardEvents` on the hook with the
  same signatures (editor specs unchanged) and loses its fiber code; `resizeContent` keeps
  `setContentSize` and waits for `innerWidth/innerHeight` to match.
- **TH4** `__chalkbondTestMain = { blockedRequests: number }`. Main calls `dialog.showOpenDialog`,
  `showSaveDialog`, `showMessageBox`, `Menu.prototype.popup` and `shell.openPath` through their
  module objects at call time (never destructured), so a test stubs them with `app.evaluate`;
  application menu items are clicked with `Menu.getApplicationMenu().getMenuItemById(id).click()`.
  Boxes shown during startup (RC3) are scripted before the app's code runs by
  `e2e/stub-dialogs.mjs`, a main-process preload (`-r`, like `e2e/no-os-mouse.mjs`) that
  `launchApp({ dialogs })` adds; it reads the answers from the `CHALKBOND_TEST_DIALOGS`
  environment variable (JSON) and records the options each box received. Production never loads
  it.
- **TH5** Native menus and boxes cannot be captured by Playwright: their content is asserted as
  data (menu model unit tests; the stubbed `showMessageBox` / `popup` receives the options and
  template) and looked at by a human (checklist).
- **TH6** `playwright.config.ts`: project `e2e` sets `testIgnore: /[\\/]win[\\/]/` on non-Windows
  platforms (R10); `shots` unchanged.

### Logging

**LG1** Main appends errors (its own and N6) to `userData/logs/main.log`, one line each (`ISO
time, source, message`); at 1 MB it is renamed to `main.old.log`. No document content. Nothing is
sent anywhere.

### Packaging

**I1** `electron-builder.yml`:

```yaml
appId: com.chalkbond.app
productName: Chalkbond
copyright: Copyright © 2026 Aalish
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
| Build | `npm run dist:win` (existing script: `electron-vite build && electron-builder --win nsis --x64`; runs in PowerShell and cmd) → `dist/Chalkbond-<version>-setup.exe`, `dist/win-unpacked/`, `dist/builder-effective-config.yaml` |
| Install | SmartScreen (unsigned) → **More info** → **Run anyway** → progress bar → Chalkbond opens. No questions, no admin prompt |
| Location | `%LOCALAPPDATA%\Programs\Chalkbond`; data in `%APPDATA%\Chalkbond` (settings, recovery, logs) |
| Shortcuts | Start menu and desktop, "Chalkbond" |
| Association | `.chalk` per user (HKCU), IC2 icon, type "Chalkbond drawing" |
| Uninstall | Settings > Apps: removes program, shortcuts, association; keeps `%APPDATA%\Chalkbond`; never touches drawings |
| Updates, network | none: `publish: null`, no updater code |
| Version | `package.json` 1.0.0 at the release checkpoint |
| Size | measured at A17 and written here |

**I2** `build/THIRD-PARTY-NOTICES.txt` is generated by `scripts/build-notices.mjs` from the
licence files of the packages bundled into the app (runtime `dependencies` plus `react`,
`react-dom`, `scheduler`); a tooling test checks each package's licence text is present. Electron
ships `LICENSES.chromium.html` itself.

## Behaviour rules index

W1–W6, M1–M3, K1–K3, CM1–CM3, F1–F14 (and F4a), RC1–RC6, ST1–ST5, AB1, V1–V3, IC1–IC3, SEC1–SEC15,
CO1–CO5, TH1–TH6, LG1, I1–I2.

## Required changes to finished modules and scaffold

| # | Target | Change | Spec edit |
|---|---|---|---|
| 1, 2 | `editor` | `actions` slot; `notify` and the `busy` event | `SPEC-clipboard-export.md` "Required changes" |
| 3 | `editor` | CM1: if the right-clicked item (atom, bond, object) is not in the selection, the selection becomes what a Select-tool click on it makes (Decision 6: an atom or bond selects its whole fragment; an object itself) and the tool becomes Select; an item already selected, or empty canvas, keeps the selection; then the event is emitted. The controller test "selection is not changed" becomes tests of both cases | `SPEC-editor.md` CM1: "… otherwise, if the H1/H2 hit (atoms, bonds, objects) is not in the selection, the selection becomes what a Select click on it makes (Decision 6) and the tool becomes Select; an item already selected or empty canvas keeps the selection. Then the controller emits `{ type: 'context-menu', target, screen }`. app-shell shows a native menu." Seam comment on `contextMenuAt` updated. Decisions: next free R-row "Right-click on an unselected item selects it first (app-shell CM1)"; Decision 12's "the scaffold ignores it" becomes "app-shell shows a native menu" |
| 4 | `editor` | `run('focus-name-field')` works from the host: `canRun` is true when no label or text editor is open; `run` records a focus request in the store and the view focuses the name-field input when it sees a new request. Ctrl+F in the view goes through the same path | "Seam to the host": replace "`focus-name-field` is carried out by the view … `canRun` is false and `run` does nothing" with "`focus-name-field` asks the view to focus the name field: `canRun` is true when no label or text editor is open; `run` records the request and the view moves DOM focus". Decisions: next free R-row |
| 5 | `editor` | Spec text only: "No test-only globals" becomes "The editor defines no test-only globals; app-shell's test hook (TH1–TH3) exposes the controller to e2e in an unpackaged build started with `--chalkbond-test-hooks`" | `SPEC-editor.md` "Seam to the host", last bullet |
| 6 | Scaffold `src/main/index.ts`, `App.tsx`, `src/preload/*` | replaced per this spec | none |
| 7 | `e2e/launch.ts`, `e2e/harness.ts`, `e2e/smoke.spec.ts`, `playwright.config.ts` | TH3, TH6; smoke asserts the content minimum and our menu | none (tests) |
| 8 | `eslint.config.mjs`, `tsconfig.*.json`, `vitest.config.mts` | lint blocks of "Where the code lives"; `src/shared` in node and web; coverage includes `src/main/model/**` and the thresholds of "Testing" | none (tooling) |
| — | `doc-model`, `chem-core`, `svg-render` | None | — |

## Dependencies

**None new.** Electron 45.2.3, electron-builder 26.18.0, Zod 4.6.7, React; icons rendered with
`@playwright/test` 1.65.0's Chromium at dev time only.

## Testing

| Level | What | Where |
|---|---|---|
| Unit (node) | `menu-model` (every row of M1/M2: label, accelerator text, `registerAccelerator: false`, no `role`, enabled rule, command; undo label casing; `&` doubling; recent labels with duplicates; modal disables all; M3 text focus); `context-menu-model` (CM1 both menus, CM3); `recent`; `settings` (defaults, each invalid field, unknown keys, broken JSON, ST5 fractional and beyond-int32 window); `settings-io` (ST4 injected reader: transient EBUSY / EPERM then success, exhausted retries, EACCES, ENOENT); `window-bounds` (W1 small and large work areas, W2 half-visible rule, two displays); `args` (`fileArg` with flags, Chromium extras, quotes, other extensions; `testFlags` packaged vs not); `titles`; `messages` (every F14 row); `write-problem` (errno → problem); `file-refs`; renderer `keys` (K1 table, text target, idle, dialog open, K2 conflicts, K3); `session`, `file-flows` (F1–F13 with fake ports: every prompt answer, cancel in Save as, failed write keeps dirty, failed open keeps the drawing, picture Save goes to Save as, R7 identity check, recovered `forcedDirty`, queued open request); `recovery-timer` (2 s / 10 s, injected clock); `shortcuts` (every row maps to the editor keymap or K1); IPC `handle()` (SEC6) and every schema (SEC5, SEC15); `files.ts` in a temp folder (SEC7, SEC8, F9) | colocated `*.test.ts` |
| View markup (node) | primitives in every state, shortcuts dialog, drop overlay: roles, names, `aria-*`, test ids | `*.test.tsx` |
| Tooling | V2; ICO structure and `icon.png` size; notices complete; SEC11; SEC13; lint probes of A1 | `tests/tooling/shell-*.test.ts`, `app-*.test.ts` |
| E2E (built app, dialogs stubbed per TH4) | listed per task in `tasks/todo-app-shell.md`; the round trips of "Success criteria" | `e2e/app-*.spec.ts`, `e2e/win/app-*.spec.ts` |
| Shots | per task, compared with A01–A17 (in-window parts only) | `e2e/shots/A<n>.shot.ts` |
| Manual (Windows) | "Windows checks" | `docs/windows-checklist.md` |

Coverage: `src/main/model/**` and `src/renderer/app/model/**` ≥ 90 % lines (thresholds in
`vitest.config.mts`, no file excluded); Electron glue, the preload and views by e2e.

## Windows checks (for `docs/windows-checklist.md`, section "App shell and installer")

Human-only: native chrome, other programs, a clean machine.

- [ ] `npm run dist:win` produces `dist/Chalkbond-1.0.0-setup.exe`; its size and the installed size are written in this spec (I1).
- [ ] On a clean Windows 10 and a clean Windows 11 account **without admin rights**, network disconnected: run the installer. SmartScreen shows "Windows protected your PC"; **More info** → **Run anyway** works; no admin prompt; Chalkbond opens by itself; Start-menu and desktop shortcuts show the new icon (A16).
- [ ] Cold start of the installed app to a usable canvas is under 3 s on the teacher's laptop (`SPEC.md` SC1).
- [ ] Save `test.chalk` on the desktop: Explorer shows the A16 file icon and type "Chalkbond drawing"; double-clicking opens it; double-clicking a second `.chalk` while Chalkbond has unsaved changes shows the save prompt, then opens it in the same window.
- [ ] Menus look like A04–A06 and the context menus like A07 (sentence case, access keys underlined after Alt, shortcuts shown); Alt then F opens File, arrows and Enter work; every shown shortcut works from the canvas; Ctrl+C / Ctrl+V / Ctrl+Z inside the name field act on its text; right-click in the name field shows Cut / Copy / Paste / Select all.
- [ ] Alt+click an atom with Select, release Alt, press B: the Bond tool is chosen and the menu bar is not focused (K3).
- [ ] The save prompt (A09), open errors (A10), recovery box (A11) and About box (A14) look like their mock-ups; Narrator reads their text and buttons.
- [ ] Ctrl+mouse wheel and touchpad pinch zoom the drawing, never the window.
- [ ] Unsaved-changes prompt on title-bar ×, Alt+F4 and File > Exit: Save, Don't save and Cancel each do what they say.
- [ ] Power cut: draw for a minute without saving, wait 15 s, end Chalkbond in Task Manager (or switch the laptop off), start Chalkbond: the recovery box appears and the drawing comes back. Shut Windows down with unsaved changes: at the next start the recovery box appears (RC5).
- [ ] Display scaling 100, 125, 150, 175 %: menu bar, dialogs, Copy button and icons are crisp, nothing is cut off at the 960×640 minimum; the window position is remembered across restarts, also after unplugging an external monitor (the window comes back on the laptop screen).
- [ ] Uninstall from Settings > Apps: shortcuts and the `.chalk` association are gone, `%APPDATA%\Chalkbond` remains, drawings are untouched; reinstalling restores the recent list.
- [ ] Narrator: menu bar, Copy button, dialogs and prompts are announced with their names.
- [ ] About shows version 1.0.0 and the icon; **Licences** opens the notices in Notepad.

## Success criteria

1. `npm run check` green; `src/main/model` and `src/renderer/app/model` ≥ 90 % lines
   (`npm test -- --coverage` thresholds).
2. The menu model unit tests cover every M1 row (label, accelerator text, enabled rule, command),
   every item has `registerAccelerator: false` and no `role` except CM3's; every application menu
   item clicked by id in `e2e/app-menus.spec.ts` runs its command; K2's conflict test passes.
3. Save then Open: the file on disk equals `serialize(doc)` and the reopened document's
   `serialize` equals the original (`e2e/app-files.spec.ts`).
4. With unsaved changes, New, Open (after a file is chosen), a second-instance open and close each
   show the prompt; Save, Don't save and Cancel behave per F4 (`e2e/app-files.spec.ts`,
   `app-instance.spec.ts`, stubbed boxes).
5. Opening an exported PNG and SVG (and PDF under PDF-A) restores an equal document; Save on it
   opens Save as with `<name>.chalk` in the picture's folder (`e2e/app-open-pictures.spec.ts`).
6. A newer-version file and a damaged file show the F14 wording (stubbed box receives it) and
   leave the drawing and the file bytes unchanged (`e2e/app-open-errors.spec.ts`).
7. After an unsaved edit and 12 s, killing the app process and relaunching with the same
   user-data folder offers recovery; Recover restores the drawing as dirty
   (`e2e/app-recovery.spec.ts`).
8. A second launch with a `.chalk` path focuses the first window and opens the file after the
   prompt; the second process exits (`e2e/app-instance.spec.ts`).
9. The test hook exists only with the flag on an unpackaged build (unit test of `testFlags`;
   e2e without the flag finds no `__chalkbondTest`; the packaged smoke finds none); the harness
   has no fiber code; the full editor e2e suite passes on the hook.
10. During the e2e suite no request leaves the app (SEC4 counter 0 at the end of every file) and
    permission requests are denied (`e2e/app-security.spec.ts`).
11. Every IPC handler rejects a payload that fails its schema or comes from another frame (unit
    tests of `handle()` and each schema).
12. At content 960×640 the window cannot be made smaller (content stays ≥ 960×640 after
    `setSize(200, 200)`), and the tool rail's last button (Text) is fully visible
    (`e2e/app-window.spec.ts`).
13. Icons: `build/icon.ico` and `build/chalk-file.ico` hold every IC3 size as PNG entries,
    largest 256 (tooling test); `npm run dist:win` succeeds and the packaged app launches
    (`e2e/packaged/app.packaged.ts`, Playwright project `packaged`, run by `npm run test:packaged` after `npm run dist:win`).
14. The shots of every UI task match their mock-up by eye at the phase checkpoint; the Windows
    checks above are ticked on Windows 10 and 11 (human).

## Boundaries (module-specific)

- **Always:** route every key through K1 or the editor; keep paths in main; validate every IPC
  payload and its sender; write files atomically; one document per window; tokens and primitives
  only (no raw colours or sizes in app CSS); every control has a name, test id and focus ring.
- **Ask first:** any new dependency (icon converter, updater, store library); a new menu item or
  visible control; a settings screen; more file associations; a signed or per-machine installer;
  any network use.
- **Never:** register a menu accelerator; expose `ipcRenderer`, `fs` or paths to the page;
  overwrite a picture with drawing data; show a stack trace or error code; delete a user's file;
  enable the test hook in a packaged build.
