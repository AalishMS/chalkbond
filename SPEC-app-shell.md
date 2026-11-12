# Spec: `app-shell`

Shared stack, commands, style and boundaries: see `SPEC.md`. Module map: `CAPABILITY-MAP.md`.
Depends on: every module (core modules through `@core/<module>`; the editor through
`src/renderer/editor/index.ts`; clipboard-export through its public entry and its renderer and
main folders). Written together with `SPEC-clipboard-export.md`; the two share one UI design
(`docs/mockups/shell/`) and one IPC contract (defined here). Status: **approved 2026-11-10**
(drafted in commit 4dd7d48; reviewed and approved by the delegated reviewer with the shell
mock-ups of commit d3abe4b as the visual source of truth; see "Decisions"). Amended 2026-11-12:
the shortcuts list names the tool number keys (R27); the formula switch needs no menu (R28); new
mock-up A15c (the Select bar at the minimum window). Implemented 2026-11-12 (feature tasks N1-N14, `tasks/todo-features-2026-11.md`); The automated gates of the final checkpoint (N12) passed at `e34414b` on 2026-11-12; the owner's hand re-checks on the final installer (`docs/windows-checklist.md`) are open. The release is not declared.
**Amended 2026-11-12, approved by the owner 2026-11-12 (tabs feature set):** the owner's decisions R30–R36
(tabs in one window, the tab strip under the top bar, no native menu bar but a ☰ menu, auto-save
of named files, closing a tab, closing the app never prompts and everything comes back, Chrome's
tab keys), the owner's answers R46–R50 (no Zoom to 100% key, the File menu's tab items, the
reopen list, the last tab, undo depth) and the proposals R37–R45, approved by the owner 2026-11-12 (revised after an
independent review), specified in "Tabs, auto-save and session" (T1–T18, AS1–AS9, SS1–SS12) and
amended in place below; mock-ups A18–A21 and A01 (updated) in `docs/mockups/shell/`. Not
implemented. The owner answered every open question (R46–R51).

Audience: a grade 11–12 chemistry teacher in Nepal on a Windows 10/11 laptop (often 1366×768; Windows 10 was not tested by hand before 1.0.0 (owner decision 2026-11-12)),
Office 2021, no network, power cuts common, not a power user. The test for every choice: *what
would this teacher expect?* The window must stay calm: fewer controls done well.

## Objective

Turn the editor into a finished Windows application: one window that opens, saves and reopens
drawings like Notepad or Word does; a native menu bar and right-click menus; an unsaved-changes
prompt; a recovery file that survives a power cut; remembered window, folders and recent files;
an app icon; an offline shortcuts list; and a per-user Windows x64 installer that needs no admin
rights and no network.

Amended 2026-11-12 (R30–R36): the window holds several drawings as tabs; the native menu bar is
replaced by a ☰ button that opens the same menus; a drawing that is a `.chalk` file saves itself;
drawings without a file are kept by the app until she names them; closing the app never asks and
the next launch brings back every tab with its undo history. The unsaved-changes prompt on New,
Open and close and the recovery file with its offer are gone (superseded by T8–T9 and SS1–SS12).

User stories served (`SPEC.md`): 7 (save and reopen; exported pictures reopen through Open), 9
(tabs, auto-save, everything comes back) and the frame for all others.

## Scope

**In:** main process (window, menus, dialogs, single instance, file association, file I/O,
settings, session store (replaces recovery, R35), auto-save writes, logging, security); preload
API; the renderer host (`src/renderer/app/`): owning the editor controller, the tabs (each with
its file, dirty and unsaved state) and swapping their editor state, file flows, host keys, the ☰
menu, tab-menu and context-menu bridge, the tab strip, the Keyboard shortcuts dialog, the drop
overlay, the shared UI primitives and shell tokens; the e2e test hook; app and file icons;
packaging; licence notices.

**Out:** drawing and editing (`editor`); pictures, clipboard formats, embedding, Export
(`clipboard-export`; this module hosts them: menu items, keys, IPC plumbing); chemistry.

**Non-goals (v1):** several windows (tabs in one window since R30, 2026-11-12); tearing a tab
out into a window; pinned tabs or tab groups; auto-update; telemetry; crash reporting; printing; a
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
| 2758–2767 `BrowserWindow 'query-session-end'`: "Emitted when a session is about to end due to a shutdown, machine restart, or user log-off. Calling `event.preventDefault()` can delay the system shutdown …" @platform win32 | A question, not an end: the user can still cancel the shutdown (Windows' "apps are preventing shutdown" screen), and then the window keeps running. Main only asks the renderer to flush the recovery file (RC5) and changes no close-guard state (R24) |
| 2857–2863 `BrowserWindow 'session-end'`: "Emitted when a session is about to end due to a shutdown, machine restart, or user log-off. Once this event fires, there is no way to prevent the session from ending." @platform win32 (the same sentence at 5315 and 5338–5340 for the `WindowSessionEndEvent` docs) | The only signal that the end is real: from then on a `close` skips F4 and never clears recovery (R24) |
| 289–290 `app 'before-quit'` and 1085–1086 `app 'will-quit'`: "On Windows, this event will not be emitted if the app is closed due to a shutdown/restart of the system or a user logout." | At a Windows session end the quit flush (`installQuitFlush`: settings write and recovery chain) does not run. A settings change younger than 500 ms (ST1, for example the window bounds) can be lost at shutdown; documented, no code (R24) |
| 791 `app 'render-process-gone'`; 2159 `app.isPackaged: boolean` | F13 crash path; test hooks only when unpackaged (TH1) |
| electron-builder `scheme.json`: `NsisOptions.oneClick` ("Whether to create one-click installer or assisted"), `perMachine`, `createDesktopShortcut`, `createStartMenuShortcut`, `shortcutName`, `uninstallDisplayName`, `runAfterFinish`, `deleteAppDataOnUninstall` ("one-click installer only"), `differentialPackage`, `installerIcon`, `uninstallerIcon`, `installerHeaderIcon` ("one-click installer only"), `artifactName`, `language` ("defaults to 1033 (English - United States)"); root `fileAssociations` (`FileAssociation.icon`: "The path to icon (.icns for MacOS and .ico for Windows), relative to build"), `electronLanguages`, `publish`, `copyright`, `extraResources`, `npmRebuild`; `WindowsConfiguration.icon` (default `build/icon.ico`) | Installer configuration I1 uses only these keys |
| `app-builder-lib/out/util/iconConverter.js` `doConvertIcon`: an `.ico` source is used as is if its largest entry is ≥ 256 (`ERR_ICON_TOO_SMALL` otherwise); a `.png` source is converted by `runIconsTool`, which `toolsets/icons.js` downloads from GitHub (`downloadBuilderToolset`, "icons@1.2.3") at build time. `targets/nsis/NsisTarget.js` 739–760: a file association's icon must be an `.ico` resource (`${ext}.ico` default), copied to `$INSTDIR\resources` | We commit our own `.ico` files (256 px entry included) made without a new dependency (IC3); electron-builder converts nothing. Building NSIS still downloads electron-builder's NSIS toolset once on the build machine (build-time network, like the compound dictionary) |
| `build/icon.ico` and `build/icon.png` are the default Electron logo (scaffold) | Replaced by IC1–IC3 |
| `e2e/harness.ts` `loadDocument` / `readDocument` / `listenEvents` / `heardEvents` walk React fibers; `resizeContent` uses `setContentSize` | Replaced by the test hook (TH2, TH3) |
| electron-vite bundles main and preload; a sandboxed preload can `require` only `electron` | The preload imports channel names only; Zod schemas live in main (SEC5) |
| Editor seam: `canRun({type: 'set-preset'})` is false exactly while a gesture runs or a label/text editor is open; no event is emitted when that changes (clipboard-export editor change 2 adds `busy`); `focus-name-field` is view-only (`canRun` false); CM1 never changes the selection | Host idle = that `canRun`; editor changes 3–4 below |
| `docs/mockups/editor/tokens.css` and `icons.svg` are lifted into `src/renderer/editor/view/` and checked by `tests/tooling/editor-tokens.test.ts` (tokens identical after the leading comment; icons byte-identical) | The shell set follows the same rule in its own files (V1) |
| (2026-11-12, tabs) `src/main/menu.ts` already pops up built menus with `Menu.buildFromTemplate(template).popup({ window })` (CM1) and installs the application menu with `Menu.setApplicationMenu`; `src/main/index.ts` creates the window with `autoHideMenuBar: false` | The ☰ menu (M4) reuses the popup path with `x`, `y` (`PopupOptions`: "Must be declared if y is declared"); the application menu is set to `null` again, as in the scaffold. **probe** (Windows): a popup opened from a key press gets keyboard focus (arrows, access keys, Esc) and Narrator reads it |
| `src/core/doc-model/history.ts`: `History` holds `doc`, `past` / `future` steps of Immer `patches` / `inverse` (plain JSON values, since `Doc` is JSON), `openKey` and a `clock` function; `HISTORY_DEPTH = 500`; the interface is documented "Treat as opaque" | Persisting undo needs a serialisable record of the steps without the clock: doc-model D2 (`SPEC-doc-model.md`); the app never reads `past` / `future` itself |
| `src/renderer/editor/state/controller.ts`: one store per controller; `load` replaces `history`, `saved`, `selection` and the viewport; the in-app `clipboard`, `tool` and `variants` live in the same `EditorState` | One controller can serve every tab if the per-tab part (history, saved, selection, viewport) can be taken out and put back: editor R57 |
| `src/renderer/editor/model/keymap.ts` `globalCommand`: Ctrl+1 → `zoom-reset`, Ctrl+Shift+T → `tidy-reaction`, matched on `KeyboardEvent.key`; no Ctrl+R, Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+PageUp / PageDown or Ctrl+2…9 binding; `src/renderer/app/model/keys.ts` `hostKey` binds none of them either; the editor's K3 text keys are Ctrl+B, I, =, Shift+=, Shift+D, Shift+H | Ctrl+Shift+R and the tab keys are free (R36); Ctrl+1 and Ctrl+Shift+T leave the editor's keymap (editor R59) |
| `KeyboardEvent.key` for Ctrl+Shift+0 is the layout's shifted character, not `0`: `)` on US English, `=` on German (where it would read as the existing Ctrl+= zoom in). Widely reported Windows behaviour (Excel's Ctrl+Shift+0 "Unhide columns"): with two or more input languages installed, Windows' "switch keyboard layout" hot key (Ctrl+Shift by default) swallows Ctrl+Shift+0 before the application sees it. **Not probed** on the development machine | The key would likely be dead on a laptop with a Nepali keyboard installed; the owner chose no key for Zoom to 100% (R46) |
| With a non-Latin layout active (Nepali), `KeyboardEvent.key` of Ctrl+digit is not guaranteed to be the ASCII digit; `KeyboardEvent.code` (`Digit1`…) names the physical key on every layout. **probe** (Windows, Nepali layout active) | Ctrl+1…Ctrl+9 match `code` (R45); recorded as a Windows check |
| `fs.realpath.native` resolves a path's real case and 8.3 short names on Windows; Node's `crypto.createHash('sha256')` hashes bytes in main without parsing them | Main decides "this file is already open in a tab" (T17) and "changed outside Chalkbond" (AS5) without the renderer holding a path (R8) and without parsing user content (SEC9) |

## Decisions

Binding until a spec change. O-rows are the orchestrator's decisions of 2026-11-10; A-rows are the
draft's, kept or amended at review; R-rows are the reviewer's resolutions.

| # | Decision | Reason | Date |
|---|---|---|---|
| O1 | Mock-ups `docs/mockups/shell/` (commit d3abe4b) are approved and are the visual source of truth; `shell-tokens.css` and `shell-icons.svg` there are normative | One visual language, checked by a tooling test | 2026-11-10 |
| O2 | The minimum size is a **content** size of 960×640 (`useContentSize`), so the title bar and menu bar never squeeze the tool rail (A15b) | At 960×640 outer the rail no longer fitted | 2026-11-10 |
| O3 | **Superseded by R32 (2026-11-12): no menu bar; the same trees open from the ☰ button (M4).** Native menu bar always visible: File, Edit, View, Help, with the trees and wording of A04–A06; native canvas context menus as A07 | Familiar, discoverable, keyboard- and Narrator-accessible | 2026-11-10 |
| O4 | No settings screen. **Amended by R35 (2026-11-12): the open tabs, their drawings, views and undo history are kept by the session store (SS), not as settings.** Remembered automatically: window size and position, recent files (8), last folders, Export choices, and the style of the last preset switch for new drawings | Every remembered choice is one the teacher already made | 2026-11-10 |
| O5 | **Superseded by R35 (2026-11-12): the session store (SS1–SS12) replaces the recovery file and its offer; the 10 s bound stays (SS10).** Recovery file at most 10 s behind; offered at next launch with the wording of A11; closing the box recovers | Power cuts; nothing is lost by accident | 2026-11-10 |
| O6 | Installer: NSIS one-click, per user, no admin, `.chalk` association with the file icon of A16, no auto-update, unsigned (SmartScreen steps on the checklist), version 1.0.0 at the final checkpoint. App icon as A16, tile `#2f6e60`; `.ico` files made without a new dependency (IC3) | Fewest questions; works on school machines without admin | 2026-11-10 |
| O7 | Editor changes approved (each a task that updates `SPEC-editor.md` first): the `actions` slot after Undo/Redo; `controller.notify`; CM1 right-click selects first; a host-callable name-field focus; a proper e2e test hook enabled only in an unpackaged build started with an explicit flag | The seam needs them; the fiber-walking helpers were a stopgap | 2026-11-10 |
| O8 | Keyboard shortcuts dialog (F1) as A12, grouped with headings; About as A14; drop overlay as A13; notices as A17 | Offline, short, always correct | 2026-11-10 |
| O9 | Accepted defaults: do not associate `.png` / `.svg`; en-US installer only; a "Saved" notice after Save (**amended by R41, 2026-11-12: after an explicit Save or Save as only, never after an auto-save**); plain error wording without codes | Would hijack pictures; the UI is English; the `*` vanishing is easy to miss | 2026-11-10 |
| A1 | **Superseded by R30 (2026-11-12): one window, one tab per drawing; Open, New and a double-clicked file open a tab (T7, T17) and never ask about unsaved changes.** One window, one drawing. Open, New and a double-clicked file replace the drawing after the unsaved-changes prompt | Notepad model; a second window gets lost behind the first | 2026-11-10 |
| A3 | Menu items display shortcuts but never register them; the renderer handles every key | One place decides keys; no accelerator steals an editor or text key | 2026-11-10 |
| A5 | Open shows the file dialog first, validates the file, then asks about unsaved changes (**amended by R30, 2026-11-12: there is nothing to ask; the file opens in a tab, T17**) | No prompt when the teacher cancels or picks a broken file | 2026-11-10 |
| A6 | A drawing opened from an exported picture is saved as a `.chalk`: Save goes to Save as, suggesting `<name>.chalk` in the picture's folder; the picture is never overwritten | Overwriting a slide's picture with drawing data would break the slide | 2026-11-10 |
| A10 | File errors: native error box, plain words; successes: status-bar notice | A failed save must not be missed; a success must not interrupt | 2026-11-10 |
| R1 | No menu item has a `role` (roles bring their own accelerators and behaviour), except the text-field context menu's Cut / Copy / Paste / Select all (CM3) | Every command goes through our model and is testable as data | 2026-11-10 |
| R2 | While a text field is focused, Edit's Undo, Redo, Cut, Copy, Paste, Delete and Select all act on the text (`webContents.undo()` …) and read as plain "Undo", "Copy" …; Duplicate is disabled (M3) | Native text behaviour must win in text fields, from the menu as from the keyboard | 2026-11-10 |
| R3 | Text fields get the standard Windows Cut / Copy / Paste / Select all right-click menu (CM3); the canvas gets A07's menus | Right-click Paste into a text box is what every Windows user expects; Electron shows no menu by default | 2026-11-10 |
| R4 | **Amended by R32 (2026-11-12): there is no menu bar; the same guard stops that Alt key-up from opening the ☰ menu (K3).** After an Alt+click on the canvas, the host swallows the next Alt key-up so the menu bar does not take focus (K3; draft Q7) | Editor Decision 6 "Alt+click picks one atom" must not leave the keyboard in the menu bar | 2026-11-10 |
| R5 | Windows shutdown or log-off does not prompt; it asks for a best-effort flush of the recovery file (RC5, R24) (**amended by R35, 2026-11-12: of the session store and the active tab's pending auto-save, SS10; no close prompts at all any more**) | Windows ends the session anyway; the recovery offer at the next launch is the honest promise | 2026-11-10 |
| R6 | Save as appends the format's extension when the chosen name lacks it; if that changes the path and the file exists, a native "replace?" box asks first. An existing other extension is kept (`notes.png` → `notes.png.chalk`) | Replacing the extension could overwrite a file the Save dialog never warned about | 2026-11-10 |
| R7 | Save marks the document saved only if it did not change while the file was written (doc identity check, F5) | An edit during the write must stay dirty | 2026-11-10 |
| R8 | The renderer never holds or sends a path: files are opaque `FileRef`s; a dropped file's path is read inside the preload with `webUtils.getPathForFile` and sent by the preload itself (SEC14); native dialog texts come from main's message table, the renderer sends a problem code and a base name (SEC15) | A compromised page cannot name an arbitrary file or put arbitrary text in a native box | 2026-11-10 |
| R9 | e2e launches pass `--chalkbond-test-hooks` and `--chalkbond-user-data=<temp dir>`; both are ignored when `app.isPackaged` (TH1) | Tests must not share settings, recent files, recovery or the single-instance lock | 2026-11-10 |
| R10 | Windows-only e2e specs live in `e2e/win/`, which `playwright.config.ts` ignores on other platforms (`testIgnore`); nothing is skipped | AGENTS.md forbids skipped tests; the project stays green on Linux | 2026-11-10 |
| R11 | The Windows Jump List (`app.addRecentDocument`) is cut | No user story needs it; the in-app recent list covers reopening | 2026-11-10 |
| R12 | Shell tokens and icons are lifted into `src/renderer/app/` as their own files (V1), never merged into the editor's `tokens.css` / `icons.svg` | Each lifted file stays a copy of exactly one normative file; the editor's tooling test is untouched | 2026-11-10 |
| R14 | (2026-11-12, R34: F4 now runs only for closing an unsaved tab, T9; the rule applies there unchanged.) F4's **Save** answer proceeds with the pending New, Open or close only if the save succeeded **and** the drawing is clean afterwards (`!dirty`). An edit during the write (R7) keeps the newer, dirty drawing and stops the pending action: no replacement, no close, no extra box | An older snapshot reaching disk must never let newer edits be discarded silently | 2026-11-11 |
| R15 | ST4: a settings read that fails (other than `ENOENT`, after 3 × 100 ms retries of `EBUSY` / `EPERM`) runs on in-memory defaults and never writes that file for the rest of the run | Unreadable preferences must never be overwritten by defaults; a busy file (scanner, sync) usually reads a moment later | 2026-11-11 |
| R16 | ST5: the stored window takes int32 integers only (size > 0); anything else is W1 via the ST3 repair | A hand-edited or corrupted rectangle must never reach the native `Rectangle` conversion | 2026-11-11 |
| R17 | (2026-11-12, R30–R35: F4a now runs before a tab closes, a tab switch by click, a Save or Save as, and the window close; New, Open, double-click and drop no longer replace a drawing.) F4a: New, Open and close (window close, double-click, drop) first finish an open label or text editor through its commit path, then decide dirty; again after a prompt-triggered Save | A teacher's last typed label must never be lost or saved stale because the native close came while the box was still open | 2026-11-11 |
| R18 | (**Amended by R36 and R46, 2026-11-12: Zoom to 100% has no key any more; Ctrl+1 goes to tab 1. View > "Zoom to &100%" in the ☰ menu and the status-bar readout run the command.**) View > "Zoom to &100%", Ctrl+1 and the status-bar readout run one command that sets the zoom to 100 % (editor R49, superseding editor R12's reset to the 150 % default); the default zoom of a new or loaded drawing stays 150 % Slides / 416.67 % Handout | The approved menu (A06) and shortcuts list (A12) say "Zoom to 100%"; the command must do what they say, from every place | 2026-11-11 |
| R19 | Help > Keyboard shortcuts is enabled when idle (not "always"): the K1 rule already says F1 does nothing and the menu shows it disabled while a label or text editor is open. The M1 enabled rules live once in `src/shared/menu.ts` (`commandEnabled`), used by main's menu model and re-checked by the renderer before it runs a menu command; main ignores a click on an item built disabled | One table for the menu and the dispatcher; a stale menu frame never runs a command the current state forbids | 2026-11-11 |
| R20 | **Superseded by R35 (2026-11-12): there is no recovery file to clear; SS5 orders the session writes.** RC2 safety: a successful Save clears the recovery file only if the drawing is clean afterwards; a newer edit (committed, or a label or text draft finished by F4a) that keeps it dirty after the write (R7, R14) keeps or refreshes the recovery file, and an older snapshot's save never clears a newer recovery write. A cancelled or failed Save or Open leaves it; New and Open clear it only after F4 passed; undo back to the saved state clears it unless the drawing is a recovered one (`forcedDirty`). A normal close clears it (N4) and main closes only after that clear has run; a crash, a gone renderer and a close after `session-end` (R24) never clear it | A save of an older snapshot must never delete the only copy of newer work | 2026-11-11 |
| R21 | Open recent: each entry's click opens the path captured when that menu was built; paths stay in main and the renderer only receives a fresh opened ref | A click after the list reordered (an open or save elsewhere, a removed entry) must never open a different file than the one the teacher read | 2026-11-11 |
| R22 | (**Amended by R37, 2026-11-12: waiting open requests form a queue, first in first out, at most 20 waiting; a 21st waiting request is dropped and logged without its path (TB12, 2026-11-12).**) An OS file request (second launch, F11) that arrives while Export or Keyboard shortcuts is open waits until the dialog closes (one pending ref, latest wins) and leaves the dialog alone; a drop while one is open opens nothing and shows no overlay, but navigation is still prevented | The modal's state is the teacher's; a file drop onto a dialog is ambiguous; a double-click from Explorer must not be lost | 2026-11-11 |
| R23 | **Superseded by R35 (2026-11-12): there is no startup offer.** RC4 covers requests arriving during the startup recovery offer: latest wins, Recover drops them all (N-A2 names the latest), Delete opens only the latest; RC1 tracking is suspended until the answer (RC7) | Last run's only copy must survive until the teacher answers; one open after Delete, never two in a row | 2026-11-11 |
| R24 | (**Amended by R35, 2026-11-12: the event is `flush-session` and the flush covers the session store and the active tab's pending auto-save (SS10); a close never prompts, so "skip F4" reads "skip the renderer's flush". The rest stands.**) Session end (Windows). `query-session-end` is a question: main sends `flush-recovery` and changes no close-guard state, prevents nothing, waits for nothing. `session-end` (documented as irrevocable) is the only thing that lets a following `close` skip F4 and the recovery clear. A gone or crashed renderer keeps its behaviour. The shutdown flush is **best effort**: no `preventDefault`, no acknowledgement wait, no sleep; the exposure is RC1's (changes older than 2 s, 10 s in a burst), as after a power cut. Consequence of the `will-quit` / `before-quit` note: the quit flush does not run at a Windows session end, so a settings change younger than 500 ms can be lost then (documented only) | Before, `query-session-end` disarmed the guard for good: if the shutdown was cancelled, the next ordinary close skipped the save prompt and the recovery clear. Holding the shutdown (`preventDefault`, acknowledgement, exit) cannot be verified off Windows, and a defect there would block the teacher's shutdown; the exposure is bounded by RC1, which a power cut imposes anyway. To be revisited only with Windows evidence | 2026-11-11 |
| R25 | (**Amended by R35, 2026-11-12: `flush-session`, SS10; unchanged otherwise.**) An open label or text draft at shutdown: `flush-recovery` (RC5) finishes the open editor through its commit path first (not during an IME composition, which is left alone and whose draft is not recoverable), then writes N3, all synchronously and without waiting. Host code only (`finish-editing.ts`, the recovery model's `beforeFlush`); the editor's public surface is unchanged | The shutdown flush covered the committed drawing only, so a label typed but not yet confirmed was lost. Waiting for a composition (as F4a does) could delay the flush past Windows' grace, and the flush must stay best effort (R24) | 2026-11-11 |
| R26 | In a dialog whose body scrolls, Arrow Up/Down, Page Up/Down, Home and End scroll the body while the focused control does not use the key itself (radio cards and segments keep their arrow keys, text fields keep theirs; no Ctrl/Alt/Meta). Focus does not move and no tab stop is added. | At 960×640 a keyboard-only user could not read the whole shortcuts list (found by A18); guarded by `e2e/app-a11y.spec.ts` | 2026-11-11 |
| R27 | (**Amended by R36, 2026-11-12: the shortcuts list gains a Tabs section and the moved keys; see "Keyboard shortcuts dialog".**) **Shortcuts list names the number keys** (editor R50, feature F1, 2026-11-12). A12's Tools rows show the tool's digit then its letter as alternatives: `1 V` Select · `2 E` Erase · `3 B` Bond · `4 Z` Chain · `5 R` Ring · `6 L` Atom · `7 A` Arrow · `8 +` Plus · `9 M` Curved arrow · `0 T` Text. The "Pointing at an atom" and "Pointing at a bond" rows (`1 2 3`) are unchanged: their section headings already say they apply while pointing, which is R50's exception. No menu item names a tool key (there is no Tools menu), so no menu text changes. **UI decision (W9, U4):** digit first, as the rail badge shows it | One list, always correct (O8); the badge is what the teacher sees first | 2026-11-12 |
| R28 | **Formula switch and the shell** (editor R51, feature F2, 2026-11-12). No menu entry (M1 "Left out on purpose" already leaves the options-bar actions Clean up, Kekulé, Tidy and Flip out of the menus; the switch joins them; UI decision U9). New drawings start skeletal: F1 does not remember the formula setting (ST1 remembers only the preset; U10). Save, Open, recovery and the title need nothing new: the setting is part of the document (`SPEC-doc-model.md` D1), a skeletal drawing is still written as v1, and a structural drawing opened in the 1.0.0 build gets F14 `newer-version`. **Proposed, not decided (U7):** if the orchestrator approves editor R51's key Ctrl+Shift+F, A12's Chemistry section gains `Ctrl+Shift+F` "Show structural or skeletal formula" after Show Kekulé, and K2's conflict check lists it; until then neither changes | The shell's existing rules already cover a document setting; only the key is a new question | 2026-11-12 |
| R29 | **The package holds only the application** (packaging defect found 2026-11-12). `files` names the three application folders `out/main`, `out/preload`, `out/renderer` and `package.json`, never `out/**`: `out/` is also where `npm run shots`, the mock-up builds, `golden:sheet` and the probes write their output, so `out/**` put hundreds of development PNGs, `golden-sheet.html` and `pdf-facts` into the installer (the 2026-11-12 build grew from 109,915,593 to 114,524,658 bytes for that reason alone, and the installer hand-tested on 2026-11-11 contained them too). Runtime reads of `out/`: main loads `../preload/index.js` and `../renderer/index.html` relative to `out/main`; nothing else. `extraResources` (notices, icon) and the runtime `node_modules` electron-builder adds are unchanged. Checked by `tests/tooling/app-packaging.test.ts` (the `files` list) and by `e2e/packaged/app.packaged.ts` (the archive lists nothing under `out/` except `main`, `preload` and `renderer`). | The packaging rule took a folder that is shared with test output; on a clean clone it happened to be empty of those | 2026-11-12 |
| R30 | **Tabs (owner).** Chrome-style horizontal tabs in one window; each tab is one drawing: a `.chalk` file, an unnamed drawing, or a drawing opened from a picture (T1–T18). Supersedes A1 and the non-goal "several windows or tabs" (still one window) | The teacher works on several figures for one lesson at a time; one window with tabs keeps them together and none gets lost behind another | 2026-11-12 |
| R31 | **Placement (owner).** The tab strip sits directly below the editor's top bar, to the right of the tool rail, across the canvas column, above the canvas; the rail keeps its place. It is a new editor layout slot that the host fills (editor R56) | The tabs belong to the canvas they switch; the rail and top bar stay where she learned them | 2026-11-12 |
| R32 | **No native menu bar; native title bar kept (owner).** Windows' title bar, caption buttons and Snap layouts stay. The File / Edit / View / Help bar is removed (`Menu.setApplicationMenu(null)`); a ☰ button at the far left of the top bar opens the same trees as submenus of one native popup (`Menu.popup`), with the same wording, shortcuts shown and enabled rules (`src/shared/menu.ts`) (M4). Alt or F10 opens it (K1, K3). The title shows the active tab's name (W3). Supersedes O3 and W4; R4 amended | One row of chrome less on a 768-px-high screen; the menus stay native, keyboard- and Narrator-accessible | 2026-11-12 |
| R33 | **Auto-save (owner).** A tab whose drawing is a `.chalk` file writes itself to that file, debounced like RC1 (about 2 s after the last change, at most about 10 s into a burst), atomically (F9) (AS1–AS4). Named files therefore never ask to save. Unnamed drawings (`Untitled`, `Untitled 2` …) and drawings opened from a picture (A6: the picture is never overwritten) are kept by the app in its own storage until she gives them a name with Save as. Ctrl+S on an unnamed drawing is Save as; on a named file it writes now. Supersedes "Left out: Autosave to the real file" | Notepad and Office save by themselves today; the teacher should never lose a lesson to a forgotten Ctrl+S | 2026-11-12 |
| R34 | **Closing a tab (owner).** × on the tab, Ctrl+W, middle-click and the tab menu close it. An unnamed drawing with content asks first with a native Save / Don't save / Cancel box (A09's pattern, mock-up A20); a named file closes without asking after its pending auto-save is written; an empty unnamed tab closes silently (T8, T9). Closing the last tab: R39 | Only a drawing that exists nowhere else needs a question | 2026-11-12 |
| R35 | (**Amended by R51, 2026-11-12: except T9's box for a tab whose drawing could not be kept, SS10.**) **Closing the app never prompts; everything comes back (owner).** The next launch restores every tab, the tab order, the active tab, each drawing, its zoom and scroll, and its undo history capped at the last 100 steps per tab (SS1–SS12). The continuous session store replaces the recovery file and the RC3 "recover?" offer: RC1–RC7, O5, R20 and R23 are superseded; R5, R24 and R25 are amended (the shutdown flush, the power-cut exposure, atomic writes and write ordering stay) | A power cut or a shutdown must cost at most the last seconds, and a closed laptop must open where she left it | 2026-11-12 |
| R36 | **Keys: Chrome wins (owner).** Ctrl+T and Ctrl+N open a new tab; Ctrl+W closes the active tab; Ctrl+Tab / Ctrl+Shift+Tab and Ctrl+PageDown / Ctrl+PageUp go to the next / previous tab; Ctrl+1 … Ctrl+8 go to tab n, Ctrl+9 to the last tab; Ctrl+Shift+T reopens the last closed tab. Tidy reaction moves from Ctrl+Shift+T to Ctrl+Shift+R. Zoom to 100% was to move from Ctrl+1 to Ctrl+Shift+0; **amended by R46: it has no key**. The renderer owns all keys; menus never register accelerators (A3, R1, M2 stay). R18 and R27 amended; editor R59 | The teacher knows these keys from her browser | 2026-11-12 |
| R37 | **Opening files into tabs (approved by the owner 2026-11-12).** Open, Open recent, a drop, a double-click in Explorer and a second launch (F2, F3, F10, F11, F12) open the drawing in a new tab at the end of the strip. A file already open in a tab focuses that tab instead: main compares `fs.realpath.native` paths case-insensitively; the renderer only ever sees the tab id (R8). If the active tab is an `untitled` tab with an empty drawing and no undo or redo step, the file opens in that tab instead of adding one (Chrome and Notepad). A drop opens every file with an Open extension, each in its own tab, in the order dropped (at most 20). Waiting OS open requests form a first-in-first-out queue of at most 20 (selecting three files in Explorer and pressing Enter sends three requests); this replaces "one pending request, latest wins" for opens (F11, R22; a pending close still waits as before) | With tabs, opening never needs to replace or ask; a second tab for the same file would make two auto-saves fight over it | 2026-11-12 |
| R38 | **The file changed, moved or could not be written (approved by the owner 2026-11-12; revised in the fix round).** Main reads and hashes a named tab's file before every auto-save write, when the tab becomes active and when the window regains focus, and compares it with the hash of the text the app last wrote or read (AS5; no `stat` shortcut). The app never writes over a change made outside it and never loses her work: with no unwritten changes, an outside change that opens is loaded as one undo step (Ctrl+Z brings her version back) and one that does not open (a copy or sync in progress) leaves the tab "couldn't save" and retried; with unwritten changes her drawing stays in her tab as an unnamed copy "esterification (your changes)" and the changed file opens beside it (AS7). A missing file, a removed USB stick or a failed write leaves the tab bound to its file but "couldn't save": her drawing is kept by the app, auto-save retries at every check, and a plain box says so once (AS6). A write result always goes to the tab it was written for (AS3). Auto-save never creates a file, never writes a picture and never writes a path open in another tab (AS8, AS9) | A copy from a USB stick or a pulled stick must never silently overwrite or drop anything; a stick plugged back in should just work again; a result applied to the wrong tab could mark an unsaved drawing saved and lose it | 2026-11-12 |
| R39 | **Closing the last tab (owner, R49)** leaves one empty `Untitled` tab (Notepad); the window closes only with the title-bar ×, Alt+F4 or File > Exit. If the last tab already is an empty `untitled` tab with no undo step, closing it does nothing | Ctrl+W pressed once too often must not close the app; the title-bar × is where a Windows user closes a window | 2026-11-12 |
| R40 | **Reopen closed tab (owner, R48).** Ctrl+Shift+T and the menus reopen the last closed tab from a list of the last 10 closed in this run, newest first (T12). An unnamed tab closed with "Don't save" is in the list too, so one wrong click loses nothing while the app runs. The list lives in memory only: closing the app forgets it and a discarded drawing is then gone | A safety net that does not keep discarded drawings on disk for ever; a named file can always be opened again from Open recent | 2026-11-12 |
| R41 | **What "saved" looks like (approved by the owner 2026-11-12).** `*` in the title and a dot on the tab mean "not saved as a file" (an unnamed drawing with content, an edited picture drawing, a kept copy), never "an auto-save is due"; a named file's tab shows nothing while it saves (mock-up A18: no "Saving…"); a warning icon replaces the dot when a file could not be saved (AS6). No notice after an auto-save; N-A1 "Saved esterification.chalk." only after an explicit Save or Save as. Amends O9 and W3 | A `*` that flickers for 2 s after every click, or a notice after every auto-save, would be noise; the calm state is "nothing to worry about" | 2026-11-12 |
| R42 | **The session store (approved by the owner 2026-11-12; the step counts are the owner's, R50).** Main owns `userData/session/index.json` (tab order, active tab, kinds, names, bound paths, written-text hashes, views; lenient Zod like settings); each tab's drawing and undo history is a record `userData/session/tabs/<tab id>.json` made by the renderer from a read-only snapshot (strict Zod, versioned, at most 64 MiB; main checks only size and signature). One write chain for every session and auto-save write (SS5); every write atomic (F9); a record that cannot be written is shown (SS6). The last 100 undo steps are stored per tab; redo steps are not stored; during a run the editor keeps its 500 (doc-model `HISTORY_DEPTH`, unchanged). Anything in the store that does not parse is moved to `damaged/` and everything else opens (SS11) | The drawing data stays out of main (SEC9) and paths stay out of the renderer (R8); per-tab files keep a change in one tab from rewriting all of them; one damage rule is simpler to test than five | 2026-11-12 |
| R43 | **One editor for all tabs (approved by the owner 2026-11-12).** The window keeps one editor controller (CO1). An inactive tab is data only: its editor state (undo history, saved baseline, selection, view) taken out with the editor's `takeState` and put back with `putState`; the store and the shutdown flush read the active tab with `snapshotState`, which has no precondition and no side effect (editor R57). Until first shown after a restart a tab is nothing but its index entry (SS7). No editor view, perception, scene or DOM per inactive tab; no eviction in v1 | Start-up and memory on a modest laptop (E32, cold start) grow with the drawings she switches to, not with the number of tabs | 2026-11-12 |
| R44 | **Tab strip details (approved by the owner 2026-11-12)** (T2–T6, T13–T16, as mock-up A18): untitled numbering (smallest free number), labels and tooltips, overflow (shrink, then scroll), drag to reorder, the + button, double-click on the empty strip, a native tab menu with New tab, Close tab and Reopen closed tab (fix round: no "Close other tabs" or "Close tabs to the right", no limit on the number of tabs), keyboard and screen reader (`role="tablist"`, one tab stop, ←/→, Enter) | The browser's model, without the parts she will not need (pinning, groups, tear-off, bulk closing) | 2026-11-12 |
| R45 | **Ctrl+digit keys match the physical key (approved by the owner 2026-11-12).** Ctrl+1 … Ctrl+9 (tabs) match `KeyboardEvent.code` (`Digit1` … `Digit9`, `Numpad1` … `Numpad9`), not `key`; every other key keeps matching `key` (editor R6, R50). (Ctrl+Shift+0 is no longer a key: R46) | Ctrl+digit types no character, so the physical key is what she pressed on every layout (Chrome does the same); `key` may be a Devanagari digit with the Nepali layout active | 2026-11-12 |
| R46 | **Owner answer to OQ1: Zoom to 100% has no key.** The status-bar readout and ☰ > View > Zoom to 100% run it; Ctrl+1 goes to tab 1 (R36); Ctrl+Shift+0 is not bound (Windows commonly swallows it when two or more input languages are installed, Facts). Amends R18, R36; editor R49, R59 | Nothing to break on a laptop with a Nepali keyboard; true size is a rare need | 2026-11-12 |
| R47 | **Owner answer to OQ2: the File menu gets "New tab" (was "New"), "Reopen closed tab" and "Close tab"** (A19; M1) | Narrator and keyboard users get a menu path to every tab command; Exit is no longer the only way to close something | 2026-11-12 |
| R48 | **Owner answer to OQ3: the reopen list holds the last 10 closed tabs for the current run only**, including an unnamed drawing closed with "Don't save" (R40, T12) | One wrong click loses nothing while the app runs; nothing discarded stays on disk | 2026-11-12 |
| R49 | **Owner answer to OQ4: closing the last tab leaves one empty Untitled tab** (R39, T8) | As Notepad; the window closes only by its × | 2026-11-12 |
| R50 | **Owner answer to OQ5: undo keeps 500 steps per tab during a run; the last 100 are stored across a restart** (R42, SS1; doc-model `HISTORY_DEPTH` unchanged) | No doc-model change for a difference she will not notice | 2026-11-12 |
| R51 | **Owner answer to OQ6: closing the app asks only for a drawing that could not be kept.** When a tab is unkept (SS6: its drawing exists only in the store and its record could not be written, e.g. a full disk), the window close shows T9's box for that tab (each such tab in turn; Cancel keeps the window open). In every other case R35 stands: no prompt. A narrow exception to R35; SS10, F13 amended | Otherwise a full disk would lose an unnamed drawing silently when she closes the app | 2026-11-12 |
| R52 | **TB18: a damaged file-tab record opens from its file through I14 `wantBytes`.** I14 takes `{ tabId, wantBytes?: true }` and a `same` answer then carries the bytes it hashed (SS11); no new channel and no new preload key | The smallest change that lets SS11's rule work for a restored tab, which has no ref: the bytes come from the same chain task and the same read as the AS5 check, so they cannot differ from what was checked | 2026-11-12 |
| R13 | Draft open questions resolved: Q1 visible (O3); Q2 remembered (O4); Q3 no (O9); Q4 recover (O5); Q5 one-click per user (O6); Q6 en-US (O9); Q7 → R4; Q8 1.0.0 (O6); Q9 yes (O9); Q10 8 (O4) | Recorded so no question stays open | 2026-11-10 |

---

## UI design

Normative visuals: `docs/mockups/shell/` A01–A17 (native parts drawn approximately; everything
inside the window exactly); since 2026-11-12 also A18 (tab strip), A19 (☰ button and its menu), A20
(close-tab prompt), A21 (minimum window with tabs) and A01 updated (no menu bar, ☰, tab strip).
Pages the tabs supersede (A04–A06 as a menu bar, A09 as an unsaved-changes prompt, A11, A15–A15c)
keep their old chrome and wording as history; their trees and words stay normative where M4 and
T9 say so. Pixel values are CSS px at 100 % scaling; "content" is the page
inside the window.

### Window

| Rule | |
|---|---|
| W1 First launch | `useContentSize: true`. If a 1280×800 content window fits the primary display's work area: that size, centred. Otherwise maximized (normal bounds: that size clipped to the work area, centred) |
| W2 Remembered | On every close that goes ahead (F13 allowed, the renderer gone, or before the first N1) store `getNormalBounds()` (outer) and `isMaximized()`. On launch restore them if at least half of the stored rectangle lies inside the work area of `screen.getDisplayMatching(rect)`; else W1. Maximized is applied after the bounds. Pure: `src/main/model/window-bounds.ts` |
| W3 Title | (**Amended by R32, R41, 2026-11-12:** `name` is the active tab's label (T3) and `*` means the active drawing is *unsaved* (not saved as a file: T-terms), never that an auto-save is due: `esterification - Chalkbond` while it saves, `*Untitled 2 - Chalkbond`, `*esterification (your changes) - Chalkbond`; "Recovered drawing" no longer exists. Updated on every tab switch.) `windowTitle(name, dirty)`: `*` when dirty, the name, ` - Chalkbond`: `Untitled - Chalkbond`, `*esterification - Chalkbond` (a `.chalk` shows without extension), `ethanol.png - Chalkbond` (a picture keeps its extension), `*Recovered drawing - Chalkbond`. Main calls `setTitle` and prevents `page-title-updated` |
| W4 Menu bar | **Superseded by R32 (2026-11-12):** no application menu (`Menu.setApplicationMenu(null)`, `autoHideMenuBar` left at its default); Alt or F10 opens the ☰ menu (M4, K1, K3). The native title bar, caption buttons and Snap layouts are unchanged. Was: always visible (`autoHideMenuBar: false`); Alt or F10 focuses it (Windows) |
| W5 Zoom | `webContents.setZoomMode('disabled')` |
| W6 Minimum | Content ≥ 960×640 (`minWidth: 960`, `minHeight: 640` with `useContentSize`; probe fallback in Facts). With tabs (A21): the outer window is 960 × the title bar + 640 (no menu bar any more); the rail still fits (the strip is in the canvas column, R31); the canvas loses the strip's height; the top bar holds the ☰ button, the name field, the options bar, Undo, Redo and the Copy button as A21 shows (editor R51's icon-only switch below 1100 px; the options bar scrolls as before only if a mock-up says it may) |

### Menus (native; the ☰ menu A19 with the trees of A04–A06; until 2026-11-12 a menu bar)

(**Amended by R32, 2026-11-12:** there is no menu bar. The four trees below are the submenus
File, Edit, View, Help of one native popup opened by the ☰ button (M4). Wording, ids, accelerator
texts and enabled rules are unchanged except the rows marked 2026-11-12.)

**M1** Built from a pure model (`src/main/model/menu-model.ts`: `(MenuState, recent) →
MenuNode[]`); since R32 built when the ☰ menu opens, from the `MenuState` the request carries
(M4), and no longer installed as the application menu. Sentence case; `&` marks the
access key. While an in-window dialog is open (`state.modal`) every item is disabled. "Idle" =
`canRun({type: 'set-preset'})`.

**M2** Every item with a shortcut has `accelerator` set for display and `registerAccelerator:
false`; no item has a `role` (R1).

| Menu | Label | Id | Accelerator (display) | Enabled when | Runs |
|---|---|---|---|---|---|
| **&File** | &New tab (2026-11-12, A19; was &New) | `file.new` | `CmdOrCtrl+T` (A19; Ctrl+N works too, K1) | idle | T7 (was F1) |
| | &Open… | `file.open` | `CmdOrCtrl+O` | idle | F2 |
| | Open &recent ▸ | `file.recent` | | idle and the list is non-empty | submenu `&1 esterification.chalk — Grade 11` … `&8 …` (`file.recent.0` … `.7`, F10), separator, `&Clear recently opened` (`file.recent.clear`) |
| | — | | | | |
| | &Save | `file.save` | `CmdOrCtrl+S` | idle | F5 |
| | Save &as… | `file.save-as` | `CmdOrCtrl+Shift+S` | idle | F6 |
| | — | | | | |
| | &Export… | `file.export` | `CmdOrCtrl+E` | idle, drawing not empty | clipboard-export EX1 |
| | — | | | | |
| | Reopen closed &tab (R47, A19) | `file.reopen-tab` | `CmdOrCtrl+Shift+T` | idle and the R40 list is non-empty | T12 |
| | &Close tab (R47, A19) | `file.close-tab` | `CmdOrCtrl+W` | idle | T8 on the active tab |
| | — | | | | |
| | E&xit | `file.exit` | `Alt+F4` | always | closes the window (F13, never a prompt: R35), in main |
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
| | Zoom to &100% | `view.zoom-reset` | none (R46, 2026-11-12; was `CmdOrCtrl+1`) | always | `run('zoom-reset')` |
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

**M4 ☰ button** (R32; A19; host slot `menu` of the editor, R56): a top-bar button (size as A19, at
least 24×24 px), the first child of the top bar, before the name field; icon `menu`; `aria-label="Menu"`,
`aria-haspopup="menu"`, `aria-expanded` while the popup is open; tooltip exactly as A19 ("Menu (Alt or F10)";
A19 is normative for its text and keys); `data-testid="app-menu"`; disabled (V3) while an in-window dialog is
open. A press (mouse, Enter, Space, Alt, F10) sends I9 `app-menu:show { state: MenuState, x, y }`
with the button's bottom-left corner in content CSS px; main builds the four submenus from M1 and
pops them up there (`popup({ window, x, y })`, x and y clamped to the content size). The chosen
item runs exactly as before (`main:event {command}`; Open recent, Exit and About in main); Esc or
a click elsewhere closes it with nothing run. Focus returns to the element focused before. A mouse
press on the button does not take focus from the canvas (editor K5). The renderer re-checks
`commandEnabled` before running (R19).

**M5 One menu at a time:** a ☰, tab (T15) or canvas (CM1) popup is not opened while another is
open; a second request while one is open is ignored.

**M6 MenuState for the tabs** (2026-11-12): `MenuState` gains `canReopenTab: boolean`;
`commandEnabled` gains the two new File rows (R47: Reopen closed tab needs it, Close tab needs
idle only).

Left out on purpose: Print, Close (Exit is enough with one window; **2026-11-12:** File has "Close tab",
R47), Clean up / Kekulé / Tidy /
Flip / the formula switch (on the Select options bar; R28), Find compound (the name field is the largest control), developer
tools, full screen, window menu.

### Keyboard (host keys)

**K1** The host handles exactly these keys in a capture-phase `keydown` listener on `window`
(before the editor's handler); everything else reaches the editor unchanged. "Text target" = an
`input`, `textarea` or `contenteditable` element. While an in-window dialog is open, K1 does
nothing (the dialog handles its keys). Handled keys get `preventDefault()` and
`stopPropagation()`. Pure decision: `src/renderer/app/model/keys.ts`.

| Keys | Condition | Action |
|---|---|---|
| Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S | idle (also in the name field) | F1 / F2 / F5 / F6 (2026-11-12: Ctrl+N is T7, a new tab; Ctrl+S is AS4) |
| Ctrl+T (R36) | idle (also in the name field) | T7 new tab |
| Ctrl+W (R36) | idle (also in the name field) | T8 close the active tab |
| Ctrl+Tab, Ctrl+PageDown / Ctrl+Shift+Tab, Ctrl+PageUp (R36) | idle (also in the name field) | T11 next / previous tab (wraps) |
| Ctrl+1 … Ctrl+8 / Ctrl+9 (R36; matched on `code`, R45) | idle (also in the name field) | T11 tab n (nothing if there is none) / the last tab |
| Ctrl+Shift+T (R36) | idle (also in the name field), the R40 list non-empty | T12 reopen closed tab |
| F10 alone; Alt pressed and released alone (K3) (R32) | no in-window dialog (also in a text target) | M4 open the ☰ menu |
| Ctrl+E | idle, drawing not empty (also in the name field, as the File menu item) | Export dialog |
| F1 | idle | Keyboard shortcuts dialog |
| Ctrl+C | not a text target, selection empty, drawing not empty | CB-C1 whole drawing (empty drawing: N-C4) |
| Ctrl+V | not a text target, idle | CB-P1 |
| Ctrl+F | the target is outside the editor root (e.g. `body`) | `run('focus-name-field')` (editor change 4) |

While a label or text editor is open the file keys, the tab keys, Ctrl+E and F1 do nothing (the
menu shows them disabled); F10 and a lone Alt still open the ☰ menu (its Edit items then act on
the text, M3). Ctrl+Shift+R (Tidy reaction) is the editor's (editor K1, R59), not a host
key; Zoom to 100% has no key (R46). In a text target Ctrl+C / V / X / Z / Y / A stay native text keys (the editor's own R23
still applies to Ctrl+Z / Y in the empty name field).

**K2 Conflict check** (unit test against the editor's `globalCommand` and `canvasKey` from
`src/renderer/editor/model/keymap.ts`, imported by the test file only): the host's Ctrl+N, O, S,
Shift+S, E and F1 and (2026-11-12) Ctrl+T, W, Tab, Shift+Tab, PageUp, PageDown, 1 … 9, Shift+T and
F10 return `null` from `globalCommand` and `canvasKey`, and none is an editor K3 key
(Ctrl+B, I, =, Shift+=, Shift+D, Shift+H); the editor's Ctrl+Shift+R is not a host key, and Ctrl+Shift+0
is bound by neither (R46). Menu access keys need Alt; editor keys require Alt up.

**K3 Alt after Alt+click** (R4): a `pointerdown` with `altKey` arms a flag; the next `keyup` of
Alt is `preventDefault()`-ed (an unconsumed key event is what makes Electron's menu bar take
focus) and disarms it; any other keydown also disarms it.

**K3, 2026-11-12 (R32; re-examined for the ☰ menu):** without a menu bar a lone Alt no longer
does anything by itself, so the host decides it: an Alt `keyup` opens the ☰ menu (M4) only when
Alt went down and came up with **no other key, no pointer press and no window blur in between**
and no in-window dialog is open. So Alt+click (editor Decision 6, R4's case), Alt+F4, Alt+Tab and
Windows' input-language hot key Left Alt+Shift (likely used by a teacher with a Nepali keyboard)
never open it; Alt's own auto-repeat does not count as another key. The R4 guard stays as part of
this rule (a pointer press with Alt held arms it; the next Alt `keyup` is prevented and opens
nothing). Alt+letter chords (Alt+F …) do nothing: a popup cannot be opened at a submenu; Alt then F
(released, then pressed) opens the ☰ menu and then File by its access key. Pure: `altGuard` in
`model/keys.ts` gains the "alone" state.

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
- **CM4** (2026-11-12) Right-click on a tab opens the tab menu (T15) through the same popup path;
  CM1–CM3 are unchanged and act on the active tab.
- **CM3** Text fields (R3): main's `webContents.on('context-menu')` with `params.isEditable`
  pops up Cu&t · &Copy · &Paste · — · Select &all using the `cut`, `copy`, `paste`, `selectAll`
  roles. Non-editable targets are ignored there (the canvas prevents the DOM event; elsewhere
  nothing appears).

### Files

**Prompt** (**superseded by T9, 2026-11-12 (R34):** the box is shown only when an unsaved tab is closed, with T9's message and detail; the words below are the old build's and are not used; New, Open, a handed-over open and the window close never ask any more) (A09; I4 `save-changes`): native box, `type: 'warning'`, title `Chalkbond`, message
`Do you want to save changes to “esterification”?` (`Untitled`, `Recovered drawing`), detail
`If you don't save, your changes will be lost.`, buttons **Save** · **Don't save** · **Cancel**,
`defaultId` 0, `cancelId` 2, `noLink: true`.

| Rule | Behaviour |
|---|---|
| F1 New | (**Superseded by T7, 2026-11-12:** a new empty `Untitled` tab; no F4, no recovery clear.) F4; then `controller.load(setStyle(emptyDoc(clock()), { preset: settings.newDrawingStyle }))` (no undo step, not dirty); session Untitled; N4 recovery clear |
| F2 Open | (2026-11-12, R37: the chosen file opens by T17 in a tab; nothing is asked.) I1 (filter **Chalkbond drawings** `*.chalk;*.png;*.svg` and, under clipboard-export PDF-A, `*.pdf`; starts in the last open folder, else Documents); cancel → nothing. A name without an Open extension (typed `notes.docx`) → main shows the F14 `unsupported` box built from its base name, I1 answers `null`: the drawing is untouched, no prompt, no ref. Only the name is judged here; a missing file, a directory or a read error with an Open extension is reported by I2 with its own F14 row. Then F3 |
| F3 Open a ref | (**Amended by R37, 2026-11-12:** "Success → F4; then `controller.load(doc)`; session = the file" reads "success → T17: a new tab (or the empty untitled active tab) holding the file, kind `chalk` or `picture`, bound to the ref in main (I12); N2". A ref already open in a tab is answered by main with that tab (T17) before any read. A failure leaves every tab untouched.) I2 → bytes; `fileKindOf(name)`; `extractDrawing(kind, bytes, decodeUtf8)`; `parse`; any failure → I5 error box (F14), the current drawing untouched, no prompt. Success → F4; then `controller.load(doc)`; session = the file (kind `chalk` or `picture`); N2 (recent, last folder); N4. No notice (the title says it) |
| F4 `confirmDiscard()` | (**Amended by R34, 2026-11-12:** runs only for T8, and decides on F7's *unsaved* (and SS6's *unkept*), not on `dirty`: not unsaved → proceed; unsaved → A20's box (T9); "Save" is F6 for every unsaved kind. The "Not dirty → proceed" below is superseded.) First F4a. Not dirty → proceed. Dirty → prompt: Save → F5, then F4a again (cancelled or failed → stop; succeeded but the drawing changed during the write, or a label or text editor was open, so still dirty → stop, R14); Don't save → proceed; Cancel → stop. The prompt names the session as the title does (`esterification`, `toluene.png`, `Untitled`) |
| F4a Finish editing | (2026-11-12: also before T8 closes the active tab, before a tab switch, before AS4's Save and before SS10's close flush; a click on a tab finishes the editor by its blur.) (R17) Before F4 decides anything for New, Open (after F3 validated the file) or close (F13, a handed-over open: F11, F12), and again after F4's Save before R14 decides, an open label or text editor is finished through its own commit and formatting path, as a click elsewhere does: the host's DOM-only port `finishEditing(): Promise<void>` (`src/renderer/app/finish-editing.ts`, injected into `file-flows.ts`) sees an open editor through the controller's public `canRun('focus-name-field')` (false only while one is open), subscribes, blurs the editor's box and resolves once the editor has closed (no timeout). An IME composition in progress keeps it open until `compositionend` (editor IME rule). The name field's text is not a drawing edit and is never inserted. A gesture in progress is cancelled by the existing rules, never committed. File keys stay ignored while typing (K1) |
| F5 Save | (**Amended by R33, 2026-11-12: AS4.** Ctrl+S on a file tab writes now through the auto-save path (AS1, its AS5 check included) and shows N-A1; on any unsaved kind it is F6. No recovery clear.) Session is a `.chalk` file with a writable ref → `before = getDoc()`, write `serialize(before)` (C4); else F6. Success: if `getDoc() === before` then `controller.markSaved()` and `forcedDirty` cleared (R7); else the drawing stays dirty; session file kept; N4; notice "Saved esterification.chalk." (the file's base name). Failure → I5 with the write problem, still dirty |
| F6 Save as | (2026-11-12: "session" reads "the active tab"; suggested name: the tab's label without extension plus `.chalk` (`Untitled 2.chalk`, `ethanol.chalk`, `esterification (your changes).chalk`); folder: a picture tab's picture folder, a `kept` tab's former file's folder if it still exists, else the last save folder, else Documents. A chosen path open in another tab is refused (AS9). Success binds the tab to the new file (kind `chalk`): it auto-saves from then on.) C3 with `format: 'chalk'`, suggested `<session name without extension>.chalk` or `Untitled.chalk`; folder: the picture's folder for a picture-opened drawing, else the last save folder, else Documents. Main decides the folder from the session ref it last received on N2 (the renderer sends no folder or path). Cancel or a failed write changes nothing (session, title, dirty). Then write and F5's success path; the session becomes that file (kind `chalk`, writable ref); N2 |
| F7 Dirty | (**Amended by R33, R41, 2026-11-12:** two notions per tab. *Pending* (file tab): it has unwritten changes, i.e. SHA-256 of `serialize(drawing)` differs from its written hash (Terms of "Tabs, auto-save and session"; not `controller.isDirty()`, which ignores `meta.modified`); drives AS2 only. *Unsaved*: an `untitled` tab with a non-empty drawing, a `picture` tab that is dirty (edited since opened), a `kept` tab always, a file tab that is unavailable (AS6) with pending changes; drives W3's `*`, the tab dot (T6) and T8's prompt. `forcedDirty` and "Recovered drawing" are gone.) `dirty = controller.isDirty() \|\| session.forcedDirty`; `forcedDirty` is true only for a recovered drawing until saved. A picture-opened drawing is not dirty until edited |
| F8 Save dialog | `showSaveDialog(win, { defaultPath, filters: [one filter: "Chalkbond drawing" chalk, "PNG picture" png, "SVG drawing" svg, "PDF document" pdf] })`; Windows asks before overwriting what the teacher typed. R6: the extension is appended when missing; if that changes the path and the file exists, a native box (`type: 'warning'`, message `“x.chalk” already exists.`, detail `Do you want to replace it?`, buttons **Replace** · **Cancel**, `cancelId` 1) asks; Cancel → null |
| F9 Atomic write | Write `<target>.<random>.tmp` in the same folder, `FileHandle.sync()`, rename over the target (retry 3 × 100 ms on `EBUSY` / `EPERM`), remove the temp file on failure |
| F10 Recent | (2026-11-12: auto-save writes (AS1) do not touch the list; explicit opens, Save and Save as do. An entry open in a tab focuses that tab, T17.) ≤ 8 paths, newest first; duplicates (case-insensitive on Windows) move to the top; added on every successful open and save (N2 with an opened or saved ref, and a successful in-place write of the session's ref). Label `&n` + base name with `&` doubled; two entries with the same base name get ` — <parent folder name>` (A04). Paths stay in main (`model/recent.ts`): each entry's click handler captures its path when the menu is built (R21), never an index looked up at click time; the click hands the renderer a fresh opened ref (`main:event {open}`), which runs F3. A missing file → F14 "can't be found" (I2 answers `missing`) and the entry is removed. Clear empties the list |
| F11 Double-click / second launch | (**Amended by R37, 2026-11-12:** each request opens by T17 in a tab; waiting requests queue (first in, first out, at most 20) instead of "latest wins"; a second launch without a file only restores and focuses the window; the startup recovery offer and RC4 are gone; "one pending request, latest wins" below is superseded for opens; at the first launch I7's `open` is opened after the session is restored, SS7.) The installer associates `.chalk`. `fileArg(argv)` = the last argument that does not start with `-` and ends in an Open extension (case-insensitive). First launch: the path goes into I7's `open`. `requestSingleInstanceLock()` runs after the test user-data folder is set (TH1); false → `app.quit()` (exit code 0, no window). `second-instance`: restore if minimized, focus, then `main:event {open}`; before I7 has answered, the path replaces I7's `open`, and between I7 and the renderer's first N1 (it listens from then on) the latest path waits and is sent at that N1 (latest wins; never a second window). The renderer runs F3 when no flow is in progress, else queues it (one pending request, latest wins). While the Export or Keyboard shortcuts dialog is open, an incoming open waits (latest wins) and runs once the dialog has closed; the dialog is left as it is (R22). During the startup recovery offer the request is RC4's |
| F12 Drag and drop | (**Amended by R37, 2026-11-12:** a drop opens every file with an Open extension, each by T17 in its own tab, in order, at most 20; `unsupported` is shown only when none had an Open extension.) Files dragged over the window show the drop overlay (A13); dropping runs I3 on the first file with an Open extension (`.chalk`, `.png`, `.svg`, `.pdf` under PDF-A) through the preload's `openDroppedFile(file)` (SEC14), then F3 (queued like F11 while a flow runs). None → I3 with the first file, which answers `unsupported` with its name (I5 box). I3 checks what SEC7 checks (regular file, extension, 20 MiB `.chalk` / 64 MiB picture). While the Export or Keyboard shortcuts dialog is open a file drag shows no overlay and a drop opens nothing; the page's default (navigating to the file) is still prevented (R22). Text drags are left to the editor |
| F13 Close | (**Amended by R35, 2026-11-12:** never a prompt, except R51's box for an unkept tab (SS10). `close-requested` → the renderer runs SS10's close flush (F4a, the active tab's record and pending auto-save, the index) → N5 → main closes once the session chain is empty. A gone renderer or a close after `session-end` closes at once; what is in the store then is what SS10 promises.) Window `close` (title-bar ×, Alt+F4, File > Exit) → main prevents it and sends `close-requested`; the renderer runs F4; proceed → N4, N5 → main closes for real. Main intercepts only once the renderer has sent its first N1 (it listens for `main:event` by then). If the renderer is gone (`render-process-gone`) main closes without asking (the recovery file covers it), and so after `session-end` (RC5, R24). A close request while a flow runs waits as the pending request (latest wins, like a pending open) |

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
| `open-in-tab` (2026-11-12, AS9: Save as onto a file open in another tab) | “ethanol.chalk” is open in another tab. | Close that tab first, or choose another name. |

**Auto-save boxes** (2026-11-12, wording approved by the owner 2026-11-12, AS6, AS7; native, `type: 'warning'`, title
`Chalkbond`, button **OK**; built in main by `messages.ts` from `{ problem, name }`):

| Problem | Message | Detail |
|---|---|---|
| a failed auto-save (`write-denied`, `disk-full`, `busy`, `folder-gone`, `write-failed`), or `missing` with unwritten changes | Couldn't save “ethanol.chalk”. | The F14 detail of the problem (`missing`: It may have been moved, renamed or deleted, or its USB drive was removed.), then: Chalkbond keeps your drawing and will try again. You can also use Save as. |
| `changed-outside` with unwritten changes | “ethanol.chalk” was changed outside Chalkbond. | Your changes are in the tab “ethanol (your changes)”. The changed file is open in the tab next to it. |
| `changed-outside`, the changed file can't be opened (with unwritten changes, AS7(c)) | “ethanol.chalk” was changed outside Chalkbond. | Chalkbond can't open the changed file. Your changes are in the tab “ethanol (your changes)”. |
| a session record that cannot be written for a drawing that exists only in the store (SS6; `disk-full`, `write-denied`, `write-failed`) | Chalkbond couldn't keep “Untitled 2”. | The F14 detail of the problem (`disk-full`: The disk is full. Free some space.), then: Until it can, save this drawing with Save as. |

The full error goes to the log (LG1), never to the screen. A failed open never changes the
current drawing; a failed save keeps it dirty.

**Notices** (status-bar hint slot via `controller.notify`, wording A17): N-A1 info "Saved
esterification.chalk." (F5; **2026-11-12, R41: after an explicit Save or Save as only, never
after an auto-save**); N-A2 info "Recovered your unsaved drawing. Save it, then open
ethanol.chalk again." (RC4; **superseded by R35: no recovery offer**).
2026-11-12, wording approved by the owner 2026-11-12 (info, plain): N-A3 "Can't find esterification.chalk right now.
Chalkbond keeps your drawing." (AS6, `missing`, nothing unwritten); N-A7 "Couldn't read
esterification.chalk. Chalkbond keeps your drawing and will try again." (AS6, `unreadable` or
a changed file that does not open yet, nothing unwritten); N-A4 "esterification.chalk was changed
outside Chalkbond. Press Ctrl+Z to see your earlier version." (AS7); N-A5 (error) "A drawing kept
by Chalkbond could not be read." (SS11). (N-A6 withdrawn in the fix round: no tab limit.)

### Recovery

**Superseded 2026-11-12 by R35 and "Session store" (SS1–SS12) below.** Kept as history; none of
RC1–RC7 is built any more. What carries over: RC1's 2 s / 10 s timer (AS2, SS4), RC5's
best-effort shutdown flush (SS10), RC6's single write chain (SS5), F9's atomic writes (SS6).

| Rule | Behaviour |
|---|---|
| RC1 Write | While dirty, the renderer sends N3 `{ text: serialize(doc), name }` 2 s after the last document change, and never more than 10 s after the first unsaved change of a burst (pure timer `model/recovery-timer.ts`, injected clock). Main writes `userData/recovery/drawing.chalk` and `recovery.json { name, savedAt }` atomically (F9) |
| RC2 Clear | (R20) N4 after a successful save only when the drawing is clean afterwards (a newer edit during the write keeps the file, or refreshes it on the RC1 timer), after New / Open passed F4, on Delete in RC3, on a normal close (N4 then N5; main closes once the clear has run), and when undo returns to the saved state (not for a recovered drawing: `forcedDirty`). A cancelled or failed Save or Open, a crash, a gone renderer and a close after `session-end` (RC5, R24) never clear |
| RC3 Offer | At launch (I7), if `drawing.chalk` parses: native box (A11), `type: 'info'`, title `Chalkbond`, message `Chalkbond closed before your drawing was saved.`, detail `Do you want to recover it? If you delete it, it can't be brought back.`, buttons **Recover** · **Delete**, `defaultId` 0, `cancelId` 0 (closing the box recovers), `noLink`. Recover → load it, session `Recovered drawing`, `forcedDirty`; Save goes to Save as with the old name suggested. Delete → N4. A recovery file that does not parse is deleted silently and logged |
| RC4 With a file request | If a launch carries a file (F11: the command line, or a second-instance or drop request that arrives while the offer is still open) and a recovery exists, recovery is offered first. Requests arriving during the offer replace each other (latest wins); none opens before the answer. After Recover the recovered drawing stays, every such request is dropped and N-A2 names the latest one. After Delete (or a recovery file that does not parse) only the latest request opens (F3). A close request during the offer stays queued as usual and then prompts for the recovered drawing (R23) |
| RC5 Shutdown | (R24) On `query-session-end` main sends `main:event {flush-recovery}` and nothing else: it prevents nothing, waits for nothing and changes no close-guard state; the renderer writes N3 at once when dirty. A `close` that follows without a `session-end` (the shutdown was cancelled) is an ordinary close: F4, then N4 and N5. Only `session-end` (irrevocable) marks the session as ending; a `close` after it goes ahead without F4 and does not clear. The flush is best effort: Windows may end the process before N3 arrives or before the write finishes, and the atomic write (F9) then leaves the previous recovery file intact. The promise at shutdown is therefore RC1's, as for a power cut: every change older than 2 s (10 s inside one continuous burst of edits) is in the recovery file. (R25) On `flush-recovery`, unless RC7 suspends recovery (then nothing at all, neither finish nor write), the renderer first finishes an open label or text editor through its normal commit path (the blur of F4a, synchronous, one undo step) when **no IME composition is in progress**, then sends N3 at once when dirty. During a composition the editor is not touched (no blur, no waiting, nothing left to fire at `compositionend`) and N3 carries the committed drawing only; that draft is not recoverable (a documented limitation). The flush awaits nothing, so it cannot hang; if the editor stays open after the attempt, N3 still goes at once. Name-field text is never inserted; after a cancelled shutdown the finished label simply stays committed. The quit flush of settings and the recovery chain does not run at a Windows session end (Facts: `will-quit`) |
| RC6 Order | Main runs recovery writes and clears strictly in arrival order (one promise chain), so a clear is never overtaken by an older write |
| RC7 Offer pending | (R23) While the RC3 offer is unanswered the renderer sends no RC1 write and no change-driven clear (an edit, an undo back to clean, RC5's flush), so nothing can overwrite or delete last run's file before the teacher chose. After the answer: Recover adopts the recovered drawing (nothing written until it changes); Delete (or an unparsable file) clears and then resumes normal tracking, so a dirty drawing edited during the offer is written on the RC1 timer |

### Tabs, auto-save and session (2026-11-12; approved by the owner 2026-11-12)

The owner's decisions are R30–R36; the proposals R37–R45 were approved by the owner on
2026-11-12. Revised the same day after an independent review (fix round: write results are
matched to their tab, a read-only snapshot for the store, unloaded tabs read before closing,
written-text hashes instead of a stale `dirty`, store failures shown; simplified: undo only, no
"close other" items, no tab cap, one damage rule). Appearance: mock-ups A18 (tab strip: one tab,
several, states, unnamed and couldn't-save markers, overflow, drag, tooltips), A19 (☰ button and
its menu), A20 (close-tab prompt), A21 (960×640 with tabs), A01 updated. This section gives no
pixel value the mock-ups own; the hard constraints are hit targets ≥ 24 px and the 960×640
content minimum (W6).

**Terms.** A *tab* is one drawing. Its *kind* is `chalk` (a *file tab*: bound to a `.chalk` file,
auto-saved), `untitled` (new, never saved), `picture` (opened from a PNG, SVG or PDF; A6: the
picture is never written) or `kept` (was a file tab, now kept by the app only: AS7). A file tab
has two hashes in the index (SS3): the *file hash*, SHA-256 of the file's bytes as the app last
wrote or read them (AS5 compares the file with it), and the *written hash*, SHA-256 of
`serialize(drawing)` for the drawing that the file holds (equal to the file hash after an
auto-save; after an open of a file not in `serialize`'s exact form they differ, so opening never
causes a write). A file tab has *unwritten changes* when the SHA-256 of `serialize(drawing)`
differs from its written hash (computed in the renderer with `crypto.subtle`; main sends the
written hash, never a path). This is the only definition of pending (F7); `controller.isDirty()`
(which ignores `meta.modified`) is not used for it. A tab is *unsaved* when its drawing
exists only in the session store: `untitled` with a non-empty drawing, `picture` edited since
opened, `kept`, or a file tab that is unavailable (AS6) with unwritten changes. A tab is
*unkept* while its store record could not be written and its drawing exists only in the store
(an `untitled`, `picture` or `kept` tab, or an unavailable file tab with unwritten changes; SS6).

#### Tabs

| Rule | Behaviour |
|---|---|
| T1 Model | An ordered list of tabs, exactly one active, never empty (T8). Pure: `src/renderer/app/model/tabs.ts` (open, close, activate, move, untitled names, the reopen list). A tab id is `crypto.randomUUID()` made by the renderer and opaque; main binds a path to it (I12) and the renderer never holds a path (R8). No limit on the number of tabs (SS9 measures 10) |
| T2 Strip | Placement R31 (editor slot `tabs`, R56); always shown, also with one tab (A18). The tabs in order, then the + button (`aria-label="New tab (Ctrl+T)"`, `data-testid="tab-add"`), which stays visible when the strip scrolls. Each tab (`data-testid="tab"`, `data-tab-id`): marker (T6), label (T3), × (`aria-label="Close <label> (Ctrl+W)"`, `tabindex="-1"`, shown on the active, hovered and focused tab; its room is always kept so a label never moves; A18) |
| T3 Label | A `.chalk` file: its base name without the extension (`esterification`); a picture: its base name with the extension (`ethanol.png`); `untitled`: T4; `kept`: its former label, or `<label> (your changes)` (AS7). Ellipsis when too long; the full label in the tooltip |
| T4 Untitled names | (R44) `Untitled`, then `Untitled 2`, `Untitled 3` …: the smallest number not used by an open tab (`Untitled` counts as 1). Names are stored (SS) and survive a restart; a reopened tab (T12) keeps its name if it is free, else takes the smallest free one |
| T5 Tooltip | As A18 (editor tooltip style, after the editor's delay): the label, then help: a file tab "Switch tabs with Ctrl+Tab and Ctrl+Shift+Tab."; an unsaved tab "Not saved as a file yet. Chalkbond keeps it for you. Press Ctrl+S to save it."; an unavailable file tab "Couldn't save this file. Check that its folder is still there, or use Save as."; an unkept tab (SS6) "Chalkbond couldn't keep this drawing. Free some disk space, or save it with Save as." |
| T6 Markers | (R41), as A18: unsaved → a dot before the label (an `untitled` tab with content, an edited `picture` tab, a `kept` tab); unavailable (AS6) or unkept (SS6) → the warning icon in the dot's place; a file tab, also while it has unwritten changes or is being written → nothing (no "Saving…"). The marker is `aria-hidden`; the tab's accessible name carries it (T16). A tab not loaded in this run shows the marker stored in the index (`unsaved`, `warning`, SS3), so the strip is right straight after a restart |
| T7 New tab | Ctrl+T, Ctrl+N, ☰ File > New tab, the + button, a double-click on the empty part of the strip, the tab menu: an empty `untitled` tab (style ST1, skeletal R28) is added at the end and activated. It always adds, also when the active tab is an empty `untitled` one |
| T8 Close a tab | (R34) × on a tab, a middle-click on it, Ctrl+W (the active tab), ☰ File > Close tab (R47), the tab menu. Steps, in order: (1) F4a if it is the active tab. (2) A tab not loaded in this run (SS7) is loaded first: its record is read (I11) and parsed and, for a file tab, its file checked (AS5, I14, which also returns the written hash), so the decision below sees its real drawing; a record that does not parse is SS11's (moved aside with N10, never deleted) and the tab closes without asking and is not put on the reopen list; a record that is missing closes the same way; **a record that cannot be read (I11 `unreadable`, e.g. a lock by a virus scanner or a sync program) keeps the tab open: nothing is closed or discarded, and the notice N-A7 says it could not be read and Chalkbond will try again (2026-11-12, orchestrator: an unreadable record must never reach `discarded`, which is deleted at the window close)**. (3) A file tab with unwritten changes is written now (AS1). If that write, or the tab's state, is anything but `ok` and available (a failure: AS6; `changed`: AS7, which may turn it into a `kept` tab), the result is applied first and the tab is then unsaved, so step 4 asks. (4) An unsaved or unkept tab asks with T9. (5) Everything else closes without asking: a file tab whose text is written, an `untitled` tab with an empty drawing, a `picture` tab not edited since opened. A closed tab goes into the reopen list (T12). Closing the active tab activates its right neighbour, else its left. (R39, owner R49:) closing the last tab replaces it with a new empty `Untitled`; if it already is an empty `untitled` tab with no undo step, nothing happens. The window closes only by F13 |
| T9 Close prompt | (A20; I4 `save-changes`, the A09 pattern) The tab is activated first, so she sees what she is asked about. Native box, `type: 'warning'`, title `Chalkbond`, message `Do you want to save “Untitled 2”?`, detail `If you don't save, your drawing will be lost.` (A20 is being updated to these words), buttons **Save** · **Don't save** · **Cancel**, `defaultId` 0, `cancelId` 2, `noLink`. Save → F6; the tab closes only if the write succeeded and the drawing is unchanged since (R14); a cancelled or failed Save as keeps it. Don't save → it closes and goes to the reopen list (T12). Cancel → nothing |
| T10 | (Withdrawn in the fix round: no "Close other tabs" or "Close tabs to the right".) |
| T11 Switch | A click on a tab; Ctrl+Tab / Ctrl+PageDown next, Ctrl+Shift+Tab / Ctrl+PageUp previous (both wrap); Ctrl+1 … Ctrl+8 tab n (nothing if there is none), Ctrl+9 the last tab (K1; `code`, R45). Keys need the host idle (no gesture, no label or text editor, no in-window dialog, no file flow); a click on a tab finishes an open label or text editor by its blur first (F4a). One flow: the outgoing tab is taken out (`controller.takeState()`, editor R57); its record and, if it has unwritten changes, its file are written now (SS4, AS2), their results are applied to the stored state (AS3); the incoming state is put in (`controller.putState`) from memory, or first read from the store (SS7) and, for a file tab, checked (AS5). Until the incoming state is in place the outgoing drawing stays on screen and input is ignored (no empty flash). Then W3 title, MenuState, notices cleared. Focus: after a mouse click on a tab, the canvas (as the rail, editor K5); after a key, where it was. Per tab: drawing, undo history, selection, view (zoom and centre). For the window: tool and variants, name-field text, the in-app clipboard (clipboard-export R13). **Budget (approved by the owner 2026-11-12; perf test and e2e):** a switch to a tab loaded in this run, holding the 100-atom perf document, reaches its first painted frame within 100 ms; a first activation from the store (record read, D2 verify, AS5 check) within 300 ms. Reason: `docs/editor-perf.md` measures commit to paint for the 100-atom document at a p95 of 12.0 ms against a 50 ms budget; a switch re-renders every part and recomputes perception like a load, so twice that budget is immediate for a click, with the usual factor of four to spare; the store read adds file I/O and D2's verification (its own budget) |
| T12 Reopen closed tab | (R40, owner R48.) Ctrl+Shift+T, ☰ File > Reopen closed tab (R47), the tab menu. The last 10 closed tabs of this run, newest first, in memory: each closed tab's editor state, label, kind and (file and picture tabs) its binding in main. Reopen puts the newest back at its old position (clamped) under a **fresh tab id** (the old id stays in `discarded`, SS4), writes its record at once from the in-memory state, rebinds its file or picture to the new id (I12 `reason: 'reopen'`), and activates it: a file tab re-checks its file (AS5); every other kind comes back with its drawing, history, selection and view, still unsaved. If its file is open in another tab meanwhile, that tab is focused instead and the entry is dropped. The list is not stored (SS1): closing the app forgets it |
| T13 Reorder | (R44) drag a tab sideways past 4 px (the editor's drag threshold); the other tabs make room (instantly under `prefers-reduced-motion`); release drops it; Esc, a right press or capture loss cancel. Inside the strip only: no tear-off, no drop outside. The order is stored (SS4) |
| T14 Overflow | (R44), as A18: tabs share the strip up to A18's maximum width, then shrink to A18's minimum width (label cut with …, the × of the active tab still reachable), then the strip scrolls sideways: the mouse wheel over the strip and A18's scroll buttons (shown only while it overflows, `tabindex="-1"`); the active tab is always scrolled into view, also after a key switch. At 960×640 (A21) the strip shows A21's number of tabs before it scrolls |
| T15 Tab menu | Right-click on a tab (CM4) or the context-menu key or Shift+F10 on a focused tab: a native popup (`Menu.popup` at the cursor, or under the tab for a key) built by a pure model `src/main/model/tab-menu-model.ts`: &New tab `Ctrl+T` · — · &Close tab `Ctrl+W` · — · Reopen closed &tab `Ctrl+Shift+T` (list non-empty). Accelerators display-only, no `role` (M2, R1). Close tab acts on the right-clicked tab, not the active one |
| T16 Keyboard, screen reader, targets | (R44) the strip is `role="tablist"` `aria-label="Open drawings"`; tabs are `role="tab"` with `aria-selected`, one tab stop (roving `tabindex`: the active tab); ← / → move focus (wrapping), Home / End, Enter or Space activates (manual activation, as the rail); the + button is the next tab stop. The canvas region is the `role="tabpanel"` `aria-labelledby` the active tab. A tab's accessible name is its label plus `, not saved as a file yet` (unsaved) or `, couldn't save` (unavailable) or `, couldn't keep` (unkept), as A18. Place in the editor's K4 order: after the rail, before the canvas (editor R56). Hit targets: a tab, its ×, the + and the scroll buttons are at least 24×24 px (A18 sizes) |
| T17 Opening into tabs | (R37) Every open (F2 Open, F10 Open recent, F11 a double-click or second launch, F12 a drop, I7's start-up file) asks main first: if the chosen path is bound to a tab (`fs.realpath.native`, compared case-insensitively; a picture tab is bound to its picture), that tab is activated (`{ focus: tabId }`) and nothing is read. Else F3 validates the bytes; a failure leaves every tab as it was; success opens the drawing in a new tab at the end, or, when the active tab is `untitled` with an empty drawing and no undo or redo step, in that tab (it keeps its id; label and kind change); then I12 binds the ref to the tab; main records the SHA-256 of the bytes read as the file hash and the renderer sends the SHA-256 of `serialize(drawing)` as the written hash, so a file that is not in `serialize`'s exact form is not rewritten until she changes something. Opens wait in a first-in-first-out queue of at most 20 while a flow runs (R37) |
| T18 Settings and memory | `newDrawingStyle` (ST1) applies to every new tab. The editor state of an inactive tab is data only (R43, SS9) |

#### Auto-save

| Rule | Behaviour |
|---|---|
| AS1 What | (R33) A file tab whose ref is writable sends I13 `{ tabId, text: serialize(doc) }`, keeping the `doc` object it serialised; main runs AS5's check and then writes atomically (F9) to the bound path, all inside the session chain (SS5), and answers `{ tabId, ok: true, sha256 }` (the hash of the text written, now both the file hash and the written hash) or a problem. Only file tabs: a `picture` tab is never written to its picture (A6), `untitled` and `kept` tabs live in the store only |
| AS2 When | While the active file tab has unwritten changes, on RC1's timer (pure `model/autosave-timer.ts`, today's `recovery-timer.ts`, injected clock): 2 s after the last change of the drawing, never more than 10 s after the first unwritten change of a burst. At once on: switching away from the tab (T11), closing it (T8), Ctrl+S (AS4), the window close (SS10) and `flush-session` (SS10). The drawing written is the committed one (`snapshotState`, editor R57): an open label or text editor is not finished by a timer write |
| AS3 Result goes to its tab | (R38; fix round) A result is applied to the tab named by its `tabId`, never to "the active tab". `ok`: if that tab is still the active one and `controller.getDoc()` is the very `doc` object written, `controller.markSaved()`; if it is still active but the drawing changed meanwhile, nothing (it still has unwritten changes, R7); if it is inactive, its stored state becomes `tabStateMarkSaved(state, doc)` (editor R57: the saved baseline becomes `doc`, so it is clean exactly if its drawing is still `doc`). No notice (R41), no recent-list change (F10), no marker change. A problem: AS6 or AS7 for that tab. (2026-11-12, TB18:) A result older than one already applied to the same tab is ignored (main answers in order; this guards the renderer only); a switch (T11) does not send again the very `doc` whose write is still in flight, so that write's result may arrive after the switch and is applied to the stored state as above |
| AS4 Ctrl+S | (R33) An unsaved kind → F6 Save as. A file tab → AS1 now (the timer flushed) and N-A1 "Saved esterification.chalk." on success; a failure is the F14 box of today plus AS6. Save as on a file tab writes the new file and binds the tab to it; the old file keeps its last auto-saved state |
| AS5 Outside-change check | (R38; fix round: always hash) Main, in the session chain, (a) before every AS1 write, (b) when a file tab becomes active (also the restored active tab at start, T11, T12), (c) when the window regains focus (the active file tab). It reads the file (≤ 20 MiB, SEC7) and hashes it with SHA-256, with no `stat` shortcut (same-size changes under FAT32's 2 s times and Explorer copies that keep the modified time would slip through one). Equal to the file hash, or to the hash of a write in flight (SS5) → `same` (an in-flight hash becomes the file hash and the written hash, so a power cut between the file write and the index write leaves no stale written hash and no false "unwritten" marker). `ENOENT` (file or folder) → `missing`; a read error after 3 × 100 ms retries of `EBUSY` / `EPERM` → `unreadable`; else `changed` (the bytes go to the renderer). Results of (b) and (c) that need AS7 wait until the host is idle (no gesture, no label or text editor, no flow): the click that focuses the window may start a gesture, and `replace-doc` needs idle |
| AS6 Couldn't save | (R38) `missing`, `unreadable`, a failed write (`write-denied`, `disk-full`, `busy`, `folder-gone`, `write-failed`), or a `changed` file that does not open while she has no unwritten changes (AS7): the tab stays bound to its file but is *unavailable*: AS1 pauses, its drawing and every later change are kept by the store (SS4), T6 shows the warning icon, T5 its help. Every later AS5 check point (activation, window focus, the next change's timer) tries again; when the file is `same` again (a USB stick plugged back in) or opens (a copy or sync finished, then AS7(a)), the tab is available again. The first time a tab becomes unavailable while it has unwritten changes, the "Couldn't save" auto-save box (F14 section) is shown once, when the host is next idle. Becoming unavailable with nothing unwritten shows N-A3 (`missing`) or N-A7 (`unreadable`, or a changed file that does not open yet) only. The file is never recreated: a missing file stays missing until it comes back or she uses Save as. (2026-11-12, TB18:) `unreadable` with unwritten changes shows the "Couldn't save" box with the `write-failed` detail (the auto-save boxes have no `unreadable` row). When a check point finds the file `same` again and the tab has unwritten changes, AS1 writes at once (so does the restored active tab whose record is newer than its file, SS5). The box is shown at most once per tab in a run; N-A3 / N-A7 at most once each time the tab becomes unavailable, and only for the active tab. An explicit Save (AS4) that fails shows the F14 box at once and counts as that tab's box |
| AS7 Changed outside | (R38; fix round) `changed`, applied when the host is idle. (a) No unwritten changes and the bytes open (F3's validation): the drawing is replaced in place as one undo step labelled "Changed outside Chalkbond" (editor `replace-doc`, R58); N9 makes the file's bytes the file hash and the hash of `serialize(drawing)` the written hash, and the renderer calls `markSaved()`; N-A4 tells her Ctrl+Z gives her earlier version (undoing gives unwritten changes, and AS1 then writes her version: her explicit choice). (b) No unwritten changes and the bytes do not open (a copy or a sync still in progress, a damaged or newer file): AS6, nothing unbound, retried. (c) Unwritten changes: her tab keeps her drawing, history and view, becomes `kept` with the label `<label> (your changes)` and is unbound from the file; if the bytes open, the changed file opens in a new file tab right after it (not activated), which takes over the path and the file hash from her tab (I12 `reason: 'take-over'`, `from` her tab); the "changed outside" auto-save box says where each is. The file is never written over |
| AS8 Never | Auto-save never creates a file, never writes a picture, never writes a path whose AS5 result is not `same`, and never writes a path bound to another tab |
| AS9 Save as onto an open tab | (R38) Main refuses a Save-as path bound to another tab with the F14 `open-in-tab` box; nothing is written and the tab is unchanged |

#### Session store

| Rule | Behaviour |
|---|---|
| SS1 Promise | (R35) Closing the app never prompts. The next launch shows every tab in its order with the active tab active; each drawing comes back with its view (zoom and the drawing point at the canvas centre) and its last 100 undo steps (owner R50; R42: redo steps are not stored). Not stored: selection, tool, name-field text, notices, the in-app clipboard, the reopen list (T12). Replaces the recovery file, RC3's offer and RC1–RC7 |
| SS2 Files | (R42) `userData/session/index.json`, main-owned (`src/main/session-store.ts`, pure schema and rules `src/main/model/session-index.ts`), and one record per tab `userData/session/tabs/<tab id>.json`, renderer-made text that main checks only for its signature (`{`) and size (≤ 64 MiB) (SEC8, SEC9). The store writes only under `userData/session/` |
| SS3 Formats | (R42) Index (lenient Zod, as settings): `{ version: 1; tabs: { id: uuid; kind; name: string ≤ 255; path: string \| null /* chalk: the file; picture: the picture; kept: the former file, for F6's folder */; fileHash: sha256 \| null; written: sha256 \| null; writing: sha256 \| null /* chalk only: the two hashes and a write in flight */; unsaved: boolean; warning: boolean /* T6's marker for a tab not loaded yet: unsaved, or unavailable / unkept */; view: { zoom: number /* 0.25…8 */; centre: { x; y } /* BLU */ } \| null /* the only copy of the view; null (never shown, or damaged) opens at the default view (editor V2), as `newState` does (TB6, 2026-11-12) */ }[]; active: uuid; discarded: uuid[] /* closed tabs' records to delete; an id leaves the list once main has deleted its record (at the window close or the next start after a valid index read), and is never reused (T12) */ }`. Record (strict Zod in the renderer, `model/session-record.ts`; our own data, so no compatibility): `{ format: 'chalkbond-tab'; version: 1; name; kind; edited: boolean /* picture tabs only: edited since opened */; editor: EditorTabRecord }`, where `EditorTabRecord` comes from the editor's `tabStateToRecord(state, { maxSteps: 100 })` (editor R57: doc-model's `HistoryRecord`, D2, the drawing as `.chalk` text plus the undo steps; no view). Whether a file tab has unwritten changes is never stored: it is computed from the drawing and the written hash. The drawing itself is at most `MAX_FILE_BYTES` (20 MiB) like any `.chalk`; if the record exceeds 64 MiB the host halves `maxSteps` until it fits (oldest steps go first) |
| SS4 When written | The active tab's record, from `controller.snapshotState()` (editor R57: committed state, no precondition, no side effect, so it works mid-gesture and with a label or text editor open): on AS2's timer whenever its drawing or history changed since the last record (every kind), and at once on a switch away (from the taken state), Save, Save as, the window close and `flush-session`. A closed tab's record is listed in `discarded`. The index: on every change of the tab list, order, active tab, names, kinds, bindings or markers (500 ms debounce, like ST3), of a view (2 s debounce; the editor's `view` event and `tabStateView`, editor R57), after every AS1 write (the written hash), and at the flush points. Nothing is written for an inactive tab that was not changed. **Budget (approved by the owner 2026-11-12; perf test):** `tabStateToRecord` plus `JSON.stringify` of the 100-atom perf document with 100 undo steps takes at most 16 ms (one frame) median on the renderer main thread, and the 500-atom document with 100 steps at most 50 ms (the commit-to-paint budget); a miss moves the serialisation off the main thread (a worker), never a looser budget |
| SS5 Order | (R42) One promise chain in main runs every record write, index write, record delete, AS1 write and AS5 check in arrival order (RC6 generalised). For a change of a file tab: the record first, then the index with `writing` = the hash of the text about to be written, then the file (with its check), then the index with `fileHash` and `written` = that hash and `writing` = null; a failed or refused write sets `writing` = null at once. A power cut therefore leaves the file holding either the written or the in-flight text, both of which AS5 accepts as ours, and a record that is newer than or equal to the file (a newer one has unwritten changes and is written after the restart) |
| SS6 Atomic, and failures shown | Every store write is F9 (temp file in the same folder, `sync`, rename, 3 × 100 ms retries of `EBUSY` / `EPERM`, which also covers OneDrive or a scanner holding the file); a failed record write never touches the previous record. (Fix round:) a record write that still fails (disk full, permission) makes that tab *unkept* when its drawing exists only in the store (Terms; a file tab whose text is written is not affected: its file holds the drawing): T6 shows the warning icon, T5 its help, T8 asks before closing it, and the "Couldn't keep" box (F14 section) is shown once per tab when the host is next idle; every later change retries, and the first record write that succeeds clears it. An index write that fails is logged and retried at the next change (the records are complete on their own, SS11). Closing the app while a tab is unkept: SS10 (owner R51) (TB19: the "Couldn't keep" box is shown at most once per tab per run.) |
| SS7 Restore | I7 returns the index as the renderer may see it (`{ id, kind, name, view, unsaved, warning }` per tab, `active`; no paths, no hashes). The strip shows every tab at once; only the active tab is loaded before the canvas is usable: I11 reads its record, the renderer parses it (`tabStateFromRecord` with the index's view, history verified by D2), and a file tab gets its AS5 check. Unsaved and unwritten state: a file tab compares the hash of its drawing's text with the `written` hash returned by its AS5 check (I14), never with an older copy, so an in-flight write already promoted by AS5 counts; a `picture` tab reads `edited`; `untitled` (non-empty) and `kept` follow from their kind. Every other tab is read on its first activation (T11) or when it is closed (T8). Then I7's `open` (T17) and queued opens run. No index and no records (first run) → one empty `Untitled` tab. The old `userData/recovery/` folder of earlier builds is neither read nor deleted (R35) |
| SS8 Start-up time | SC1's 3 s cold start includes restoring the active tab (within T11's 300 ms first-activation budget) and nothing else; no other record is read on the normal start path. The rare damage path of SS11 (a damaged index, orphan records) reads every record it opens and is outside the budget. D2's restore budget is a doc-model perf test |
| SS9 Memory | (R43) One editor controller (CO1). An inactive tab holds its `EditorTabState` (undo history with structurally shared drawings, saved baseline, selection, view) once loaded in this run, else only its index entry. No React tree, perception, scene or DOM per inactive tab; the editor's derive caches hold the active tab only. A reopen-list entry (T12) holds its state until it drops off the list. No eviction in v1; E32 measures memory and switch time with 10 tabs (Windows checks) |
| SS10 Close and shutdown | (R35; R24, R25 amended) A window close (F13) never prompts, with one exception (owner R51): if a tab is unkept (SS6: its drawing exists only in the store and its record could not be written), T9's close box is shown for each such tab in strip order, each activated first; Save → F6, Don't save → it is dropped, Cancel stops the close and the window stays open. Then: F4a, then the active tab's record (`snapshotState`) and its AS1 write if it has unwritten changes, then the index (with `discarded`), then N5; main deletes the discarded records and closes once the chain is empty. `query-session-end` → `main:event {flush-session}`: R25's steps unchanged (finish an open label or text editor through its commit path unless an IME composition is in progress, then send `snapshotState()`'s record, the AS1 write and the index at once; best effort, nothing awaited; during a composition the record holds the committed drawing). `session-end` → a following close goes ahead without the renderer's flush. Exposure after a power cut or a forced shutdown, as RC1 promised: every change older than 2 s (10 s within one burst) is in the store, and for an available file tab in its file too **As built (TB19, 2026-11-12):** F4a and the active tab's record come first (a failed record write makes the tab unkept), then the T9 boxes, then F4a and the record again after any box; AS1 and the index are sent after a local SHA-256 and no answer from main is awaited before N5; the renderer stops scheduling writes once N5 is sent. |
| SS11 Damage never stops start-up | (R42; fix round: one rule) Anything in `userData/session/` that does not parse (the index, a record, a record's drawing) is moved to `userData/session/damaged/` (never deleted) and logged (LG1, no content); everything else opens. A damaged index is replaced by an empty one, so every record then opens as a `kept` tab named from its record; a record the index neither lists nor discards (an orphan) opens as a `kept` tab at the end; a file tab whose record is damaged opens from its file (history lost); a damaged record of any other kind loses that tab and shows N-A5. A history that does not verify keeps the drawing with the steps that verified (D2). The app deletes only records that a validly read index lists in `discarded`; it never deletes or rewrites a `.chalk` or picture file except by AS1 and Save as (2026-11-12, TB15:) Main checks a record only for size and signature (SS2, SEC9) and, at start, an orphan for its envelope; the strict parse of a record and of its drawing is the renderer's (`model/session-record.ts`). When that parse fails for a record I11 returned, the renderer sends N10 `session:damaged-tab { tabId }` and main moves `tabs/<tab id>.json` to `damaged/` on the session chain, after every earlier task (a record that is already gone is logged only); the log line names the file, never its content. The renderer then goes on by the rules above (a file tab from its file, any other kind N-A5). (2026-11-12, TB18:) "Opens from its file" is I14 with `wantBytes: true`, asked when a file tab's record is missing or does not parse: the drawing is built from the bytes of a `same` or `changed` answer (history lost, view from the index, no unwritten changes); after a `changed` answer the renderer sends N9 with the hash of `serialize(drawing)` as AS7(a) does, since no drawing of hers exists to keep. Missing, unreadable or unparsable bytes lose the tab with N-A5 |
| SS12 Tests | See "Testing" (tabs rows) |

#### Open questions for the owner

None. OQ1–OQ5 and OQ6 were answered by the owner on 2026-11-12 (R46–R51).

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
  a switch; not a load) stores `newDrawingStyle`. New uses it. The formula setting (editor R51)
  is not remembered: New is always skeletal (R28).
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
- Left out: fonts, bond length, line width, language, theme, autosave interval (fixed by AS2,
  2026-11-12), clipboard options, default folder, update checks, "open last file at start"
  (2026-11-12: not a setting; the session store always brings every tab back, SS1). The session
  store is not part of `settings.json` (SS2).

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
`SHORTCUTS`; **2026-11-12:** the rows below are decided here and A12's `SHORTCUTS` is synced to
them; sections in order Tools, Pointing at an atom, Pointing at a bond, Editing, Chemistry, View,
Tabs and files, While typing text. Deliberately unlisted aliases, as Ctrl++ and Ctrl+Shift+Z
already are: Ctrl+PageDown / Ctrl+PageUp (next / previous tab) and Alt (opens the menu, as F10);
the "every key is listed" test names them as aliases):

| Section | Rows (keys → meaning) |
|---|---|
| Tools | 1 V Select · 2 E Erase · 3 B Bond · 4 Z Chain · 5 R Ring · 6 L Atom · 7 A Arrow · 8 + Plus · 9 M Curved arrow · 0 T Text (R27, editor R50: digit then letter) |
| Pointing at an atom | C H N O S P F I "Change it to that element" · L "Change it to chlorine (Cl)" · B "Change it to bromine (Br)" · + − "Add a positive or negative charge" · 1 2 3 "Add a single, double or triple bond" · Enter "Type a label, such as OH or CH3" |
| Pointing at a bond | 1 2 3 "Make it single, double or triple" · W "Make it a wedge" · H "Make it a hash" |
| Editing | Ctrl+Z Undo · Ctrl+Y Redo · Ctrl+C "Copy (the whole drawing when nothing is selected)" · Ctrl+X Cut · Ctrl+V Paste · Ctrl+D Duplicate · Ctrl+A Select all · Delete Delete · ← ↑ → ↓ "Move the selection (hold Shift to move further)" · Esc "Cancel, or clear the selection" |
| Chemistry | Ctrl+F "Type a compound name" · Ctrl+Shift+L Clean up · Ctrl+Shift+K "Show Kekulé or circle" · Ctrl+Shift+R Tidy reaction (2026-11-12, R36; was Ctrl+Shift+T) |
| View | Ctrl+= Zoom in · Ctrl+− Zoom out · Ctrl+0 Fit drawing · Space+drag "Move around the drawing" (2026-11-12, R46: the "Zoom to 100%" row goes; it has no key) |
| Tabs and files (2026-11-12, R36; was Files) | Ctrl+T Ctrl+N "New tab" · Ctrl+W "Close tab" · Ctrl+Shift+T "Reopen closed tab" · Ctrl+Tab Ctrl+Shift+Tab "Next tab, previous tab" · Ctrl+1–8 "Go to tab 1–8" · Ctrl+9 "Go to the last tab" · Ctrl+O Open · Ctrl+S Save · Ctrl+Shift+S Save as · Ctrl+E Export · F10 "Open the menu" · F1 "This list" |
| While typing text | Enter Finish · Shift+Enter "New line" · Esc Cancel · Ctrl+B Bold · Ctrl+I Italic · Ctrl+= Subscript · Ctrl+Shift+= Superscript · Ctrl+Shift+D "Insert Δ (heat)" · Ctrl+Shift+H "Insert hν (light)" |

In a dialog whose body scrolls, Arrow Up/Down, Page Up/Down, Home and End scroll the body while the focused control does not use the key itself (radio cards and segments keep their arrow keys, text fields keep theirs; no Ctrl/Alt/Meta). Focus does not move and no tab stop is added. (R26)

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
  `--border-control` on `--canvas-bg` ≥ 3. (2026-11-12, tabs: plus every pair A18 and A19 add:
  a tab label on its rest, hover, pressed and active backgrounds ≥ 4.5; the unsaved dot, the
  warning icon, the × and the + on those backgrounds ≥ 3; the focus ring ≥ 3; token names as the
  updated `shell-tokens.css` defines them.)
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

- **IC1** Sources (normative, not copied): `docs/mockups/shell/app-icon.svg` (40 px and up) and
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
| Several windows | A1; since R30 tabs in one window. Also left out with tabs (R44): tear-off, pinned tabs, tab groups, tab previews, keyboard reordering |
| Toolbar buttons for New / Open / Save | The ☰ menu and Ctrl+S (the tab strip's + is New tab); the top bar keeps one primary action (Copy) |
| Print | PDF or Word does it better |
| Welcome screen, tips, "what's new" | The editor's empty state already teaches the first step |
| Online help, update check, feedback | Offline |
| ~~Autosave to the real file~~ | **Superseded by R33 (2026-11-12): file tabs auto-save (AS); AS5–AS8 keep it from overwriting an outside change.** Was: silent overwrites surprise people; the recovery file protects without touching the file |
| A file watcher | AS5 checks at activation, window focus and before every write; a watcher would add a native dependency or polling for no visible gain |
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

2026-11-12 (tabs, approved 2026-11-12): src/main/session-store.ts (SS, the chain; replaces recovery.ts),
  src/main/model/session-index.ts, tab-registry.ts (tab id → path, written hash; T17, AS5, AS9),
  tab-menu-model.ts (T15); src/renderer/app/model/tabs.ts (T1, T4, T12), session-record.ts
  (SS3), autosave-timer.ts (renamed recovery-timer.ts), tab-flows.ts (T8–T12, AS, SS7);
  src/renderer/app/TabStrip.tsx, MenuButton.tsx
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
menus, dialogs, the clipboard, the file system, settings, recovery and logs. (2026-11-12: main
also owns the session index, the tab → path bindings and the written hashes; the renderer
owns the tab list decisions and the record contents; "recovery" reads "session store".) Files are named by
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
| I3 | `file:dropped` / `openDroppedFile(file: File)` (path taken in the preload with `webUtils.getPathForFile`; `''` for a JS-made `File`) | `{ path: string ≤ 4096 }` (the only request that carries a path; `''` answers `unsupported` with an empty name) | `{ ok: true, ref } \| { ok: false, problem: 'unsupported' \| 'missing' \| 'too-large', name }` |
| I4 | `dialog:ask` / `ask` | `{ kind: 'save-changes', name: string ≤ 255 } \| { kind: 'recover' }` | `'save' \| 'discard' \| 'cancel'` / `'recover' \| 'delete'` |
| I5 | `dialog:file-error` / `showFileError` | `{ problem: FileProblem, name: string ≤ 255, no / or \ }` | `void` |
| I6 | `context-menu:show` / `showContextMenu` | `{ onItem: boolean, state: MenuState }` | `ContextCommand \| null` |
| I7 | `app:startup` / `startup` | `{}` | `{ settings: RendererSettings, recovery: { text, name } \| null, open: FileRef \| null }` |
| I8 | `settings:set` / `setSettings` | `Partial<RendererSettings>` | `void` |
| I9 (2026-11-12) | `app-menu:show` / `showAppMenu` | `{ state: MenuState, x: number, y: number }` (content CSS px, finite) | `AppCommand \| null` (M4; items main runs itself answer null) |
| I10 | `tab-menu:show` / `showTabMenu` | `{ tabId: uuid, state: { canReopenTab }, at: { x, y } \| null }` | `'new-tab' \| 'close' \| 'reopen' \| null` (T15) |
| I11 | `session:read-tab` / `readTabRecord` | `{ tabId: uuid }` | `{ ok: true, text } \| { ok: false, problem: 'missing' \| 'unreadable' \| 'too-large' }` (SS7) |
| I12 | `tab:bind` / `bindTab` | `{ tabId: uuid, ref: uuid \| null, reason: 'open' \| 'save-as' \| 'unbind' \| 'reopen' \| 'take-over', from?: uuid, written?: sha256 }` (`open`, `save-as`: bind the ref, `written` = the hash of `serialize(drawing)`; `reopen`: the binding of the closed tab `from` moves to the new id, T12; `take-over`: tab `tabId` takes `from`'s path and file hash, `from` is unbound, AS7(c)) | `{ ok: true } \| { ok: false, openIn: uuid }` (T17, AS9; replaces N2: last folders and the recent list follow `open` and `save-as` as N2 did) |
| I13 | `file:auto-save` / `autoSave` | `{ tabId: uuid, text: string ≤ 20 MB starting "{" }` | every answer carries `tabId`: `{ tabId, ok: true, sha256 } \| { tabId, ok: false, problem: WriteProblem \| 'missing' \| 'unreadable' } \| { tabId, ok: false, problem: 'changed', bytes: Uint8Array }` (AS1, AS3, AS5) |
| I14 | `file:check` / `checkTabFile(tabId, wantBytes?)` | `{ tabId: uuid, wantBytes?: true }` | `{ tabId, written: sha256, state: 'same' \| 'missing' \| 'unreadable' } \| { tabId, written, state: 'changed', bytes: Uint8Array }` (AS5; TB10, 2026-11-12: `written` is null for a tab never written; a file over 20 MiB answers `unreadable`. TB18, 2026-11-12: with `wantBytes: true` a `same` answer also carries the file's `bytes` (at most 20 MiB, the bytes the check hashed; SS11's "opens from its file"); no path reaches the renderer) |

**Renderer → main, `send`:**

| Ch. | Channel / preload function | Payload | Main does |
|---|---|---|---|
| N1 | `session:update` / `updateSession` | `{ title: string ≤ 300, dirty: boolean, menu: MenuState }` (2026-11-12: `{ title }` only: no application menu to rebuild (M1, M4) and no close prompt to guard (F13)) | `setTitle`; rebuilds the menu when `menu` changed; remembers `dirty` |
| N2 | `session:file` / `sessionFile` | `{ ref: uuid \| null }` (null: New, an Untitled session) | the session file for F6's folder; last open folder (an opened ref) or last save folder (a Save-as ref); recent list (F10, A15). An unknown id is ignored and logged |
| N3 | `recovery:write` / `writeRecovery` | `{ text: string ≤ 20 MB starting "{", name: string ≤ 255 }` | RC1, RC6 (**removed 2026-11-12, R35**) |
| N4 | `recovery:clear` / `clearRecovery` | `{}` | RC2, RC6 (**removed 2026-11-12, R35**) |
| N7 (2026-11-12) | `session:write-tab` / `writeTabRecord` | `{ tabId: uuid, text: string ≤ 64 MiB starting "{" }` | SS4, SS5. **An `invoke`, not a send (TB9, 2026-11-12):** it answers `{ ok: true }` or `{ ok: false, problem: WriteProblem }`, because SS6 marks a tab unkept from the result |
| N8 | `session:index` / `updateSessionIndex` | `{ tabs: { id, kind, name, view, unsaved, warning }[], active: uuid, discarded: uuid[] }` | merged with main's paths and written hashes; SS4, SS5 |
| N9 | `file:accept-outside` / `acceptOutsideChange` | `{ tabId: uuid, written: sha256 }` | the hash of the bytes the last `changed` check (I14) read becomes the file hash (TB10: not a fresh read, so a change after that check is found by the next one) and `written` the written hash (AS7(a)) |
| N10 (2026-11-12, TB15) | `session:damaged-tab` / `damagedTabRecord` | `{ tabId: uuid }` | SS11's renderer half: the record I11 returned for that tab, or its drawing, did not parse strictly; main moves `tabs/<tab id>.json` to `damaged/` on the session chain (SS5 order; never deleted, never overwritten: a free name `<id> (n).json`); a missing record is logged only; the log names the file, not its content |
| N5 | `app:close-ok` / `closeOk` | `{}` | closes the window (F13) |
| N6 | `log:error` / `logError` | `{ message: string ≤ 4000 }` | LG1 |

**Main → renderer**, one channel `main:event` (preload `onMainEvent(cb)` returns an
unsubscribe): `{ type: 'command', command: AppCommand }` (menu ids) · `{ type: 'open', ref }` ·
`{ type: 'close-requested' }` · `{ type: 'flush-recovery' }`. (2026-11-12: `flush-recovery` is
renamed `flush-session` (SS10); new `{ type: 'focus-tab', tabId }` (T17); I1, I3 and the `open`
event answer `{ focus: tabId }` instead of a ref when the path is open in a tab (TB12: an open main chooses itself, a second launch or Open recent, is sent as `main:event { type: 'focus-tab', tabId }`); I4 loses
`{ kind: 'recover' }`; I5 gains `open-in-tab` and the auto-save problems with `context:
'auto-save'`; I7 answers `{ settings, session: { tabs: { id, kind, name, view, unsaved, warning }[], active } | null,
open: FileRef | { focus: tabId } | null }` and no `recovery`.)

```ts
type MenuState = {
  idle: boolean; modal: boolean; textFocus: boolean; empty: boolean; hasSelection: boolean;
  canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null;
  canCut: boolean; canDuplicate: boolean; canDelete: boolean; canSelectAll: boolean;
  canZoomIn: boolean; canZoomOut: boolean; preset: 'slides' | 'journal';
  canReopenTab: boolean;                        // 2026-11-12, M6
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
| SEC5 | The preload exposes named functions only, each with a fixed channel; no generic `invoke`, no `ipcRenderer`, no Node objects; it imports at runtime only `electron` and `src/shared/channels` | C7 adds only `clipboardWrite` and `clipboardRead` to the existing `startup`, `updateSession`, `platform`, `logError`, `onMainEvent` bridge. A7 adds `chooseOpen`, `readFile`, `chooseSave`, `writeFile`, `ask`, `showFileError`. A8 adds `sessionFile` and `closeOk`. C12 adds `printPdf` (clipboard-export C5). A13 adds `showContextMenu` (I6). A14 adds `writeRecovery` and `clearRecovery` (N3, N4). A15 adds `openDroppedFile` (I3). 2026-11-12 (tabs): `writeRecovery`, `clearRecovery` and `sessionFile` go; `showAppMenu`, `showTabMenu`, `readTabRecord`, `bindTab`, `autoSave`, `checkTabFile`, `writeTabRecord`, `updateSessionIndex`, `acceptOutsideChange` come (I9–I14, N7–N9). e2e: `Object.keys(window.chalkbond)` equals the documented list; lint probe |
| SEC6 | Every handler (via `handle()` in `ipc.ts`) checks `event.senderFrame` is the main window's main frame and its URL is the app's `index.html` (or the dev server when unpackaged); otherwise it rejects and logs | unit tests of `handle()` with fake events: null frame, other frame, other URL, bad payload |
| SEC7 | Reads only through refs or a validated drop path: `fs.stat` regular file, extension in the Open list, a `.chalk` ≤ `MAX_FILE_BYTES` (20 MiB) and a picture (`.png`, `.svg`, `.pdf`) ≤ 64 MiB (clipboard-export C9: what C4 may write; the drawing inside still meets `parse`'s 20 MiB) | unit tests of `files.ts` in a temp folder (directory, symlink to a directory, 21 MB `.chalk`, 21 MB and 64 MiB + 1 pictures, `.exe`) |
| SEC8 | Writes only to writable refs of the matching kind; the data's signature must match (`{` chalk, PNG signature, `<svg`, `%PDF-`); ≤ 64 MB; atomic (F9); internal files only under `userData` and the OS temp folder. (2026-11-12: AS1 writes only to the `.chalk` path bound to that tab id (I12), after AS5 said `same`; session records only to `userData/session/tabs/<uuid>.json`, the index only to `userData/session/index.json`; a tab id is a uuid and never part of a path otherwise) | unit tests: picture ref refused, wrong signature refused, temp file removed after a failed rename |
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
  `controller.load` (New, Open, Recover, test hook). (2026-11-12, R43: still one controller for
  every tab; a tab switch is `takeState` / `putState` (editor R57), an outside change is
  `run({ type: 'replace-doc' })` (editor R58), and a new or opened tab is `newState(doc)` put in;
  Recover is gone.)
- **CO2** `session.ts` holds `{ name, kind: 'untitled' | 'chalk' | 'picture' | 'recovered', ref:
  FileRef | null, forcedDirty }`; `dirty` per F7; the title per W3. (2026-11-12: one such record
  per tab in `model/tabs.ts`: `{ id, name, kind: 'untitled' | 'chalk' | 'picture' | 'kept', ref,
  available, state: EditorTabState | null }`; `recovered` and `forcedDirty` are gone; pending and
  unsaved per F7's amendment.)
- **CO3** (2026-11-12: `doc` drives AS2's timer and SS4's record timer instead of RC1's; `dirty` no longer drives N1; a `view` event drives SS4's index write; the tab strip markers follow T6) `subscribe`: `dirty`, `doc` → title, N1, RC1 timer, preset tracking (ST1); `selection`,
  `history`, `busy` → menu state; `context-menu` → I6, then the chosen command.
- **CO4** `file-flows.ts` implements F1–F13 over injected ports (`main`, `controller`, `notify`,
  `clock`) (2026-11-12, R37: opens wait in a FIFO queue of at most 20; a close still waits as one
  pending request; tab flows (T8, T11, T12) run under the same in-progress flag) with one in-progress flag and one pending request (an open ref or a close; latest
  wins), so every flow is unit-tested in node with fakes. While a flow runs, New, Open (dialog),
  Save and Save as are ignored. Every session change publishes N1 itself (title and dirty are
  derived after the session changed, not only on editor events). Open validates the bytes before
  F4; any failure or cancel leaves the drawing and session unchanged. A `finishEditing` port (F4a)
  runs before F4's dirty check and after its Save.
- **CO5** (**Superseded by SS7, 2026-11-12.**) Startup: I7 → `recovery` ? RC3 (then RC4) : `open` ? F3 : the empty drawing. The view is mounted first (the one controller, the canvas, the box's parent window), then the offer runs once as a file flow; a launch with neither loads nothing. When I7 carries a recovery, RC1 tracking is suspended from the host's creation until the offer is answered (RC7), and file requests arriving meanwhile are RC4's. The canvas
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
  nothing is defined. (2026-11-12: `load` loads into the active tab; new `tabs(): { id: string;
  name: string; kind: string; active: boolean; unsaved: boolean; available: boolean }[]` reads the
  strip; `history(): { undo: number; redo: number }` the active tab's step counts.)
- **TH3** `e2e/launch.ts` passes both flags (a fresh `mkdtemp(os.tmpdir())` user-data folder per
  launch unless the test passes one, e.g. to relaunch with the same data), keeping any main-process
  preload it already loads (such as `e2e/no-os-mouse.mjs`); `e2e/harness.ts`
  reimplements `loadDocument`, `readDocument`, `listenEvents`, `heardEvents` on the hook with the
  same signatures (editor specs unchanged) and loses its fiber code; `resizeContent` keeps
  `setContentSize` and waits for `innerWidth/innerHeight` to match.
- **TH4** `__chalkbondTestMain = { blockedRequests: number }`. Main calls `dialog.showOpenDialog`,
  `showSaveDialog`, `showMessageBox`, `Menu.prototype.popup` and `shell.openPath` through their
  module objects at call time (never destructured), so a test stubs them with `app.evaluate`;
  application menu items are clicked with `Menu.getApplicationMenu().getMenuItemById(id).click()`
  (2026-11-12: there is no application menu; e2e stubs `Menu.prototype.popup` and clicks the ☰
  and tab popups' items from the template it received, as for CM1).
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
files: [out/main/**, out/preload/**, out/renderer/**, package.json]
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
| Location | `%LOCALAPPDATA%\Programs\Chalkbond`; data in `%APPDATA%\Chalkbond` (settings, session store (2026-11-12; was recovery), logs) |
| Shortcuts | Start menu and desktop, "Chalkbond" |
| Association | `.chalk` per user (HKCU), IC2 icon, type "Chalkbond drawing" |
| Uninstall | Settings > Apps: removes program, shortcuts, association; keeps `%APPDATA%\Chalkbond`; never touches drawings |
| Updates, network | none: `publish: null`, no updater code |
| Version | `package.json` 1.0.0 at the release checkpoint |
| Size | **2026-11-11 numbers, kept as history: they included development files (`out/shots`, sheets, mock-ups; R29).** Installer `dist/Chalkbond-1.0.0-setup.exe` 109,915,593 bytes (104.8 MiB); unpacked `dist/win-unpacked` 347,499,681 bytes (331.4 MiB, 21 files). Measured on Windows 11 on 2026-11-11 at `956a4a4` after `npm run dist:win`. Installed size (`%LOCALAPPDATA%\Programs\Chalkbond` after running `dist/Chalkbond-1.0.0-setup.exe` on the development machine, Windows 11 Pro 26300, 2026-11-11): 347,681,841 bytes (331.6 MiB), 24 files; measured twice, same number 
| Size, current | **2026-11-12, after R29** (`files` names only `out/main`, `out/preload`, `out/renderer`, `package.json`; `out/shots` and the other development files were left in `out/` while building, so the build proves they are excluded). Installer `dist/Chalkbond-1.0.0-setup.exe` 104,733,023 bytes (99.9 MiB); unpacked `dist/win-unpacked` 340,752,470 bytes (325.0 MiB, 21 files; `resources/app.asar` 17,203,841 bytes, 804 entries: `out/main`, `out/preload`, `out/renderer`, `package.json` and `node_modules` of `immer`, `openchemlib`, `zod`). Measured on Windows 11 at `3047d36` plus the R29 change by W20. Installed size: **to be measured** after installing this installer (the owner's re-check, `docs/windows-checklist.md`, "Re-checks after the 2026-11-12 feature set") |

**I2** `build/THIRD-PARTY-NOTICES.txt` is generated by `scripts/build-notices.mjs` from the
licence files of the packages bundled into the app (runtime `dependencies` plus `react`,
`react-dom`, `scheduler`); a tooling test checks each package's licence text is present. Electron
ships `LICENSES.chromium.html` itself.

**Packaged check (A17).** `npm run test:packaged` (Playwright project `packaged`, not part of
`test:e2e`, `shots` or `npm run check`) launches the unpacked app through `e2e/launch.ts`
(`executablePath`): `dist/win-unpacked/Chalkbond.exe` on Windows, which uses the real
`%APPDATA%\Chalkbond` (the test only reads and closes), and on Linux the `dist/linux-unpacked`
executable built for development with `npx electron-builder --linux dir` (a development check,
not a release gate), where the test sets `XDG_CONFIG_HOME` to a fresh temp folder so the
developer's real config folder is untouched. A packaged Electron ignores `-r`, so the OS-mouse
guard cannot be loaded into it: the packaged test sends no pointer input and asserts nothing that
depends on hover. The effective-config check reads `dist/builder-effective-config.yaml`, which
electron-builder writes only when its output is a terminal and `CI` is unset (`npm run dist:win`
from a console does).

## Behaviour rules index

W1–W6, M1–M6, K1–K3, CM1–CM4, F1–F14 (and F4a), RC1–RC7 (superseded), T1–T18, AS1–AS9,
SS1–SS12, ST1–ST5, AB1, V1–V3, IC1–IC3, SEC1–SEC15, CO1–CO5, TH1–TH6, LG1, I1–I2.

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
| 9 (2026-11-12, approved) | `editor` | Host slots `menu` and `tabs` (R56); the per-tab state seam `takeState` / `putState` / `newState` / `snapshotState`, `tabStateToRecord` / `tabStateFromRecord` / `tabStateMarkSaved` (R57); the `replace-doc` command (R58); Ctrl+1 and Ctrl+Shift+T leave its keymap, Tidy reaction is Ctrl+Shift+R, Zoom to 100% has no key (R59, app-shell R46) | `SPEC-editor.md` R56–R59, K1, K4, "Seam to the host" |
| 10 (2026-11-12, approved) | `doc-model` | `historyToRecord` / `historyFromRecord` and the `HistoryRecord` type (D2) | `SPEC-doc-model.md` D2 |
| 11 (2026-11-12) | `clipboard-export` | Text only: acts on the active tab; the in-app clipboard and paste provenance are window-wide; EX2's name is the tab's label; EX4's "recovery file" is the session store (R13) | `SPEC-clipboard-export.md` R13 |
| — | `doc-model`, `chem-core`, `svg-render` | None (2026-11-12: doc-model row 10 is approved) | — |

## Dependencies

**None new.** Electron 45.2.3, electron-builder 26.18.0, Zod 4.6.7, React; icons rendered with
`@playwright/test` 1.65.0's Chromium at dev time only.

## Testing

| Level | What | Where |
|---|---|---|
| Unit (node), 2026-11-12 tabs | `tabs` (T1, T4, T7, T8, T11, T12: order, activation after close, last tab R39, untitled numbering, reopen list of 10, replace-empty rule of T17); `tab-flows` with fake ports (T8, T9, T11, T12, T17, AS2–AS7, SS6, SS7, SS10: every prompt answer, the R37 queue of 20) including the fix-round cases: **(1)** a write result for tab A arriving after a switch to an edited picture tab B marks A's stored state saved (`tabStateMarkSaved`) and leaves B unsaved, so closing B asks; a result for the active tab whose drawing changed meanwhile marks nothing; **(2)** the timer record and the shutdown flush during a drag, with a label editor open and during an IME composition use `snapshotState` and change no editor state; **(3)** closing a tab not loaded this run reads its record first: an Untitled with content asks, a file tab whose record is newer than its file is written first; **(4)** a close-time write answering `changed` or a failure makes the tab unsaved and T9 asks; **(5)** a record written before the file, then a restart: no false conflict (hash of the drawing equals the written hash after the write; the file holding the in-flight text is `same`); an outside edit with no unwritten changes is AS7(a), never a "(your changes)" copy; **(6)** unparsable bytes with nothing unwritten → AS6, the tab stays bound and recovers when the file parses; **(7)** a failing record write marks a store-only tab unkept (a written file tab is not affected), shows the box once, T8 asks, a later success clears it; the window close with an unkept tab shows T9 for that tab only, Don't save closes, Cancel keeps the window open, and with no unkept tab no box appears (R51); **(A)** a reopened tab gets a fresh id, its record is written at once and survives a restart after its old id was discarded; **(B)** after a restart an unloaded Untitled with content and an edited picture tab show their dot from the index; **(K)** opening a file not in `serialize`'s form and waiting 15 s writes nothing; AS5 hashing with same size and same modified time; AS7 waiting for idle after a window-focus check; `autosave-timer`; `session-record` and `session-index` schemas; `tab-registry` (realpath and case-insensitive compare, AS9); `session-store` chain order (SS5) and SS11's rule (each kind of unparsable file moved to `damaged/`, orphans opened as `kept`) in a temp folder; `tab-menu-model` (T15: three items); `menu-model` as a popup with the M1 rows, R47's rows and no Zoom to 100% accelerator; `keys` (K1's new rows, `code` matching R45, K2's extended conflict list, K3's lone-Alt rule: Alt+click, Alt+Shift, Alt+Tab, blur, auto-repeat); `messages` (the auto-save and keep boxes, `open-in-tab`); `shortcuts` (the Tabs section and moved keys against the editor keymap and K1). Perf (`perf` project): T11's switch budgets (100 ms loaded, 300 ms from the store, 100-atom document) and SS4's record serialisation budgets (16 ms / 50 ms) | colocated `*.test.ts` |
| Unit (node) (2026-11-12: `recovery-timer` becomes `autosave-timer`; the recovered `forcedDirty` and every F4 case of New, Open and close go; the tabs row above replaces them) | `menu-model` (every row of M1/M2: label, accelerator text, `registerAccelerator: false`, no `role`, enabled rule, command; undo label casing; `&` doubling; recent labels with duplicates; modal disables all; M3 text focus); `context-menu-model` (CM1 both menus, CM3); `recent`; `settings` (defaults, each invalid field, unknown keys, broken JSON, ST5 fractional and beyond-int32 window); `settings-io` (ST4 injected reader: transient EBUSY / EPERM then success, exhausted retries, EACCES, ENOENT); `window-bounds` (W1 small and large work areas, W2 half-visible rule, two displays); `args` (`fileArg` with flags, Chromium extras, quotes, other extensions; `testFlags` packaged vs not); `titles`; `messages` (every F14 row); `write-problem` (errno → problem); `file-refs`; renderer `keys` (K1 table, text target, idle, dialog open, K2 conflicts, K3); `session`, `file-flows` (F1–F13 with fake ports: every prompt answer, cancel in Save as, failed write keeps dirty, failed open keeps the drawing, picture Save goes to Save as, R7 identity check, recovered `forcedDirty`, queued open request); `recovery-timer` (2 s / 10 s, injected clock); `shortcuts` (every row maps to the editor keymap or K1); IPC `handle()` (SEC6) and every schema (SEC5, SEC15); `files.ts` in a temp folder (SEC7, SEC8, F9) | colocated `*.test.ts` |
| View markup (node) | primitives in every state, shortcuts dialog, drop overlay: roles, names, `aria-*`, test ids | `*.test.tsx` |
| Tooling | V2; ICO structure and `icon.png` size; notices complete; SEC11; SEC13; lint probes of A1 | `tests/tooling/shell-*.test.ts`, `app-*.test.ts` |
| E2E (built app, dialogs stubbed per TH4) | listed per task in `tasks/todo-app-shell.md`; the round trips of "Success criteria" | `e2e/app-*.spec.ts`, `e2e/win/app-*.spec.ts` |
| Shots | per task, compared with A01–A17 (in-window parts only); 2026-11-12: A18 (strip states, overflow, drag), A19 (☰ in-window part), A21 (960×640) | `e2e/shots/A<n>.shot.ts` |
| E2E, 2026-11-12 tabs | `e2e/app-tabs.spec.ts` (keys, click, middle-click, ×, drag, overflow scroll-into-view, the three-item tab menu, close prompt answers, reopen; an edit in a file tab, Ctrl+Tab at once to an edited picture tab, close it: the box appears (fix item 1); closing a tab not shown since the relaunch (fix item 3)), `e2e/app-session.spec.ts` (3 tabs with history and views, kill the process, relaunch with the same user data: same tabs, order, active, drawings, 100 undo steps, views; a kill between the record and the file write gives no conflict (item 5); unparsable store files moved to `damaged/`; a session folder made read-only: warning, box, closing the tab asks, closing the window asks for that tab only and Cancel keeps the window open (item 7, R51)), `e2e/app-autosave.spec.ts` (write after 2 s and within 10 s of a burst, Ctrl+S, outside change with and without unwritten changes, a half-written file (item 6), missing file and back, read-only folder, a timer write during a drag and with a label editor open (item 2)), `e2e/app-menus.spec.ts` (☰ by click, Alt, F10; every item by id through the stubbed popup) | |
| Manual (Windows) | "Windows checks" | `docs/windows-checklist.md` |

Coverage: `src/main/model/**` and `src/renderer/app/model/**` ≥ 90 % lines (thresholds in
`vitest.config.mts`, no file excluded); Electron glue, the preload and views by e2e.

## Windows checks (for `docs/windows-checklist.md`, section "App shell and installer")

Human-only: native chrome, other programs, a clean machine.

**2026-11-12, tabs feature set (R30–R45):** the ticked boxes below that speak of the menu bar, the
unsaved-changes prompt, the recovery box or "opens it in the same window" describe the build the
owner tested and stay ticked as history; they are replaced for the final installer by these new
boxes (to be copied into `docs/windows-checklist.md`):

- [ ] Tabs look like A18 at 100, 125 and 150 % scaling (one tab, several, overflow, drag); the ☰
  button and its menu like A19; the close prompt like A20 and Narrator reads it; at 960×640
  content nothing is cut off (A21); Snap layouts and the caption buttons work as before.
- [ ] ☰ opens with a click, with Alt (pressed and released alone) and with F10; arrows, access keys
  (Alt then F opens File) and Esc work; Narrator reads the menu. Alt+click an atom, Alt+Tab and
  Left Alt+Shift (switching to the Nepali keyboard) never open it.
- [ ] With a real keyboard: Ctrl+T, Ctrl+N, Ctrl+W, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageUp,
  Ctrl+PageDown, Ctrl+1 … Ctrl+9, Ctrl+Shift+T and Ctrl+Shift+R do what A12 says, also with the
  Nepali layout active (write down what happens).
- [ ] Narrator on the tab strip: Tab reaches it after the rail, it is announced as a tab list,
  each tab with its name and "not saved as a file yet" / "couldn't save", arrows move, Enter
  switches; the + button and the ☰ button are announced with their names.
- [ ] Documents synced by OneDrive: open and edit a `.chalk` in the synced Documents folder for a
  few minutes while OneDrive runs (and once while it uploads): no "Couldn't save" box and no
  "(your changes)" tab appear (F9's retries cover OneDrive holding the file during a rename).
- [ ] Full disk: fill the drive that holds `%APPDATA%` (a small VHD or USB drive as the user data
  folder is enough), edit an Untitled drawing: the tab shows the warning, the "Couldn't keep" box
  appears once, closing that tab asks; free space and edit again: the warning goes.
- [ ] Double-click two `.chalk` files in Explorer, then select three and press Enter: each opens in
  its own tab; double-clicking one already open focuses its tab.
- [ ] Auto-save: edit a named drawing, wait 3 s, open the file's folder: its modified time changed;
  no prompt anywhere; the tab shows no marker.
- [ ] USB stick: open a `.chalk` from a stick, edit, pull the stick: the "Couldn't save" box once,
  the tab shows the warning; plug it back and click the tab: the warning goes and the file gets
  the changes.
- [ ] Copy a different `esterification.chalk` over the open one in Explorer, come back to
  Chalkbond: the drawing changes and Ctrl+Z brings hers back; edit first and copy within 2 s: the
  "(your changes)" tab and the changed file's tab both exist.
- [ ] Power cut: three tabs (a named file, an Untitled with content, a picture drawing), edit, wait
  15 s, end Chalkbond in Task Manager, start it: the same tabs, order, active tab, drawings,
  zoom, and undo works back through the edits. The same after a Windows shutdown, and after a
  shutdown right after an edit (write down whether the last change was there).
- [ ] Cold start with 10 tabs restored is under 3 s on the teacher's laptop and switching tabs is
  immediate; memory after visiting all 10 is written down (E32, SC1).

The boxes as ticked for the 1.0.0 build tested on 2026-11-12:
The checks the 2026-11-12 feature set touches (install of the final installer, the version in
About, opening a `.chalk` file saved by the tested 1.0.0 build) are repeated in
`docs/windows-checklist.md` "Re-checks after the 2026-11-12 feature set"; the boxes below are
not unticked.

- [x] `npm run dist:win` produces `dist/Chalkbond-1.0.0-setup.exe`; its size and the installed size are written in this spec (I1). Done 2026-11-11 (`dist:win` exit 0 at `956a4a4`): installer 109,915,593 bytes (104.8 MiB), unpacked `dist/win-unpacked` 347,499,681 bytes (331.4 MiB, 21 files), installed 347,681,841 bytes (331.6 MiB, 24 files, measured 2026-11-11 after installing on the development machine); all three are in `SPEC-app-shell.md` I1.
- [x] On a clean Windows 11 account **without admin rights**, network disconnected: run the installer. SmartScreen shows "Windows protected your PC"; **More info** → **Run anyway** works; no admin prompt; Chalkbond opens by itself; Start-menu and desktop shortcuts show the new icon (A16).
  - Observed 2026-11-11 on the development machine only (Windows 11 Pro 26300, not a clean account): installed from `dist/Chalkbond-1.0.0-setup.exe` (the folder `%LOCALAPPDATA%\Programs\Chalkbond` did not exist before), "Chalkbond Setup, Installing, please wait...", Chalkbond opened by itself, no admin or UAC prompt, no SmartScreen box (the installer was built locally and has no Mark of the Web, so this says nothing about a downloaded or copied installer), desktop shortcut (in the OneDrive-redirected Desktop folder) and Start-menu shortcut "Chalkbond" with the green icon, `HKCU\Software\Classes\.chalk` is "Chalkbond drawing", `Chalkbond.exe` ProductVersion 1.0.0.0. Performed by a computer-use agent at the owner's request, verified by the orchestrator against screenshots, the installed folder, the shortcut files and the registry. Still open: SmartScreen, the installs on clean Windows 10 and Windows 11 accounts without admin rights, network disconnected. Update 2026-11-12 (owner decision, the orchestrator's reading of "no we dont need that"): the Windows 10 install is waived; this box is run on a clean Windows 11 account only, and Windows 10 is untested by hand for 1.0.0.
  - Result 2026-11-12 (check 26 of the owner's list of 31: a new standard (non-admin) local account on the laptop, installer obtained by download, network disconnected: "Windows protected your PC", More info, Run anyway; no admin prompt; Chalkbond opens by itself; Start-menu and desktop shortcuts with the icon): Performed and reported by the owner on 2026-11-12 ("everything works well. the tests pass.", all 31 checks run); details were not reported per item. Not watched by the orchestrator. Run with the installed Chalkbond 1.0.0 (installer built at `956a4a4`) on the development machine (Windows 11 Pro, build 26300). The account was a new standard local account on the development laptop, not a separate machine. Windows 10 stays waived.
- [ ] Cold start of the installed app to a usable canvas is under 3 s on the teacher's laptop (`SPEC.md` SC1).
  - Note 2026-11-12 (owner decision): the development machine is not the teacher's laptop ("no this laptop is not the one the teacher will use"), so this box cannot be done here and stays open.
- [x] Save `test.chalk` on the desktop: Explorer shows the A16 file icon and type "Chalkbond drawing"; double-clicking opens it; double-clicking a second `.chalk` while Chalkbond has unsaved changes shows the save prompt, then opens it in the same window. Result 2026-11-12 (check 9 of the owner's list of 31: `test.chalk` on the Desktop: icon, type "Chalkbond drawing", double-click opens, a second `.chalk` with unsaved changes shows the save prompt then opens in the same window): Performed and reported by the owner on 2026-11-12 ("everything works well. the tests pass.", all 31 checks run); details were not reported per item. Not watched by the orchestrator. Run with the installed Chalkbond 1.0.0 (installer built at `956a4a4`) on the development machine (Windows 11 Pro, build 26300).
- [x] Menus look like A04–A06 and the context menus like A07 (sentence case, access keys underlined after Alt, shortcuts shown); Alt then F opens File, arrows and Enter work; every shown shortcut works from the canvas; Ctrl+C / Ctrl+V / Ctrl+Z inside the name field act on its text; right-click in the name field shows Cut / Copy / Paste / Select all. Result 2026-11-12 (checks 4, 5 and 6 of the owner's list of 31: menus and context menus, access keys after Alt, Alt then F, arrows and Enter; every shown shortcut from the canvas; the name field with Ctrl+C/V/Z and its right-click menu): Performed and reported by the owner on 2026-11-12 ("everything works well. the tests pass.", all 31 checks run); details were not reported per item. Not watched by the orchestrator. Run with the installed Chalkbond 1.0.0 (installer built at `956a4a4`) on the development machine (Windows 11 Pro, build 26300).
- [x] Alt+click an atom with Select, release Alt, press B: the Bond tool is chosen and the menu bar is not focused (K3). Result 2026-11-12 (check 7 of the owner's list of 31: Alt+click an atom, release Alt, press B (K3)): Performed and reported by the owner on 2026-11-12 ("everything works well. the tests pass.", all 31 checks run); details were not reported per item. Not watched by the orchestrator. Run with the installed Chalkbond 1.0.0 (installer built at `956a4a4`) on the development machine (Windows 11 Pro, build 26300).
- [x] The save prompt (A09), open errors (A10), recovery box (A11) and About box (A14) look like their mock-ups; Narrator reads their text and buttons. Result 2026-11-12 (checks 10, 11, 24, 12 and 23 of the owner's list of 31: the save prompt looks like A09 (10), the open error like A10 (11), the recovery box like A11 and read by Narrator (24), About like A14 (12), Narrator on the open error and the About box (23)): Performed and reported by the owner on 2026-11-12 ("everything works well. the tests pass.", all 31 checks run); details were not reported per item. Not watched by the orchestrator. Run with the installed Chalkbond 1.0.0 (installer built at `956a4a4`) on the development machine (Windows 11 Pro, build 26300).
- [x] Ctrl+mouse wheel and touchpad pinch zoom the drawing, never the window. Result 2026-11-12 (check 8 of the owner's list of 31: Ctrl+mouse wheel zooms the drawing, not the window; touchpad pinch zooms around the pointer): Performed and reported by the owner on 2026-11-12 ("everything works well. the tests pass.", all 31 checks run); details were not reported per item. Not watched by the orchestrator. Run with the installed Chalkbond 1.0.0 (installer built at `956a4a4`) on the development machine (Windows 11 Pro, build 26300).
- [x] Unsaved-changes prompt on title-bar ×, Alt+F4 and File > Exit: Save, Don't save and Cancel each do what they say. Result 2026-11-12 (check 10 of the owner's list of 31: close by ×, Alt+F4 and File > Exit with Save, Don't save and Cancel): Performed and reported by the owner on 2026-11-12 ("everything works well. the tests pass.", all 31 checks run); details were not reported per item. Not watched by the orchestrator. Run with the installed Chalkbond 1.0.0 (installer built at `956a4a4`) on the development machine (Windows 11 Pro, build 26300).
- [x] Power cut: draw for a minute without saving, wait 15 s, end Chalkbond in Task Manager (or switch the laptop off), start Chalkbond: the recovery box appears and the drawing comes back. Shut Windows down with unsaved changes: at the next start the recovery box appears (RC5). Result 2026-11-12 (checks 24 and 27 of the owner's list of 31: a minute of drawing unsaved, 15 s, Chalkbond ended in Task Manager, start: recovery box, drawing back (24); unsaved changes, 15 s, Windows shut down: recovery box and drawing at the next start (27)): Performed and reported by the owner on 2026-11-12 ("everything works well. the tests pass.", all 31 checks run); details were not reported per item. Not watched by the orchestrator. Run with the installed Chalkbond 1.0.0 (installer built at `956a4a4`) on the development machine (Windows 11 Pro, build 26300).
- [x] Cancelled shutdown: unsaved changes in Chalkbond and a program that asks before closing (for example Paint with an unsaved picture or Word with an unsaved document; Windows 11's Notepad does not ask: it restores its text and does not hold up a shutdown); choose Shut down; on the "apps are preventing shutdown" screen choose Cancel. Chalkbond is still open with the drawing, and closing it with × shows the save prompt (R24). Result 2026-11-12 (check 28 of the owner's list of 31: cancelled shutdown with Paint holding an unsaved picture: Chalkbond still open with the drawing, and × shows the save prompt): Performed and reported by the owner on 2026-11-12 ("everything works well. the tests pass.", all 31 checks run); details were not reported per item. Not watched by the orchestrator. Run with the installed Chalkbond 1.0.0 (installer built at `956a4a4`) on the development machine (Windows 11 Pro, build 26300).
- [x] Shutdown right after an edit: change the drawing and shut Windows down at once; at the next start the recovery box appears and the drawing comes back, at most without changes from the last 2 s (10 s while drawing continuously). Write down whether the last change was there (R24).
  - Result 2026-11-12 (check 29 of the owner's list of 31: change the drawing and shut Windows down at once): asked "In the 'shut down right after an edit' check, was the very last change you made still there after the restart?", the owner answered "Yes, it was there" (the option read: "The recovery box appeared and the recovered drawing included the last change made before shutting down."). Performed and reported by the owner on 2026-11-12, with the installed Chalkbond 1.0.0 (installer built at `956a4a4`) on the development machine (Windows 11 Pro, build 26300); not watched by the orchestrator. This is the written observation the box was waiting for. Note for R24: no loss was observed, so the R24 bound is not contradicted by Windows evidence.
- [x] Shutdown with a label typed but not confirmed: after the restart the recovered drawing contains the label. With an IME composition under way Chalkbond does not delay the shutdown and the drawing comes back without that label (R25). Result 2026-11-12 (checks 30 and 31 of the owner's list of 31: a label typed but not confirmed at shutdown: the recovered drawing contains the label (30); an IME composition under way at shutdown: no delay, drawing back without that label (31)): Performed and reported by the owner on 2026-11-12 ("everything works well. the tests pass.", all 31 checks run); details were not reported per item. Not watched by the orchestrator. Run with the installed Chalkbond 1.0.0 (installer built at `956a4a4`) on the development machine (Windows 11 Pro, build 26300).
- [x] Display scaling 100, 125, 150, 175 %: menu bar, dialogs, Copy button and icons are crisp, nothing is cut off at the 960×640 minimum; the window position is remembered across restarts, also after unplugging an external monitor (the window comes back on the laptop screen). Result 2026-11-12 (checks 21 and 22 of the owner's list of 31: display scaling 100, 125, 150 and 175 %, restarting each time (21); window position remembered across restarts and after unplugging an external monitor (22)): Performed and reported by the owner on 2026-11-12 ("everything works well. the tests pass.", all 31 checks run); details were not reported per item. Not watched by the orchestrator. Run with the installed Chalkbond 1.0.0 (installer built at `956a4a4`) on the development machine (Windows 11 Pro, build 26300). For check 22 the owner was asked to say if there was no second monitor and did not say so; the development machine has a second monitor (header of "Checkpoint Z"), so the unplug is read as done (the orchestrator's reading).
- [x] Uninstall from Settings > Apps: shortcuts and the `.chalk` association are gone, `%APPDATA%\Chalkbond` remains, drawings are untouched; reinstalling restores the recent list. Result 2026-11-12 (check 25 of the owner's list of 31: uninstall from Settings > Apps: shortcuts and the `.chalk` type gone, `%APPDATA%\Chalkbond` remains, drawings untouched, reinstall restores the recent list): Performed and reported by the owner on 2026-11-12 ("everything works well. the tests pass.", all 31 checks run); details were not reported per item. Not watched by the orchestrator. Run with the installed Chalkbond 1.0.0 (installer built at `956a4a4`) on the development machine (Windows 11 Pro, build 26300).
- [x] Narrator: menu bar, Copy button, dialogs and prompts are announced with their names. Result 2026-11-12 (check 23 of the owner's list of 31: Narrator reads the menu bar, Copy button, Export dialog, save prompt, open error and About box with names and buttons): Performed and reported by the owner on 2026-11-12 ("everything works well. the tests pass.", all 31 checks run); details were not reported per item. Not watched by the orchestrator. Run with the installed Chalkbond 1.0.0 (installer built at `956a4a4`) on the development machine (Windows 11 Pro, build 26300).
- [x] About shows version 1.0.0 and the icon; **Licences** opens the notices in Notepad. Result 2026-11-12 (check 12 of the owner's list of 31: About shows 1.0.0 and the icon like A14; Licences opens the notices in Notepad): Performed and reported by the owner on 2026-11-12 ("everything works well. the tests pass.", all 31 checks run); details were not reported per item. Not watched by the orchestrator. Run with the installed Chalkbond 1.0.0 (installer built at `956a4a4`) on the development machine (Windows 11 Pro, build 26300).

## Success criteria

1. `npm run check` green; `src/main/model` and `src/renderer/app/model` ≥ 90 % lines
   (`npm test -- --coverage` thresholds).

(2026-11-12, tabs: criteria 2, 4, 7 and 8 describe the menu bar, the unsaved-changes prompt and
the recovery offer and are replaced by 16–21 for the tabs feature set; the others stand.)
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
    checks above are ticked on Windows 11 (human; Windows 10 waived by the owner on 2026-11-12, untested by hand for 1.0.0).
15. (2026-11-12 feature set; automated) `shortcuts.test.ts` asserts R27's Tools rows (digit and
    letter, each selecting its tool through the editor keymap) and the unchanged rest of A12;
    the "every key is listed" test includes the ten digits; the menu model tests show no new
    item (R28); F1 New gives a skeletal document even after a structural one was open; a
    structural drawing saved and reopened keeps `formula: 'structural'` and is written as v2,
    a skeletal one as v1 (`e2e/app-files.spec.ts`); shot `N10/shortcuts-dialog.png` matches mock-up A12 by eye (human); the 960 shot
    of A15c is `N7/select-bar-960.png` (editor task N7).
16. (Tabs, automated) The ☰ popup's model shows every M1 row with its accelerator text,
    `registerAccelerator: false` and no `role`; Alt alone, F10 and the button open it; every item
    clicked by id through the stubbed popup runs its command; no application menu is set
    (`e2e/app-menus.spec.ts`); K2's extended conflict test passes.
17. Every R36 key does what T7, T8, T11 and T12 say; Ctrl+1 / Ctrl+Shift+T no longer reach the
    editor; Tidy reaction runs on Ctrl+Shift+R; Zoom to 100% has no key (R46); switches meet
    T11's budgets (`e2e/app-tabs.spec.ts`, perf tests).
18. A named drawing is written within 2 s of the last change and within 10 s of a continuous burst;
    the file equals `serialize(doc)`; an unnamed and a picture drawing are never written outside
    `userData/session`; Ctrl+S on Untitled opens Save as (`e2e/app-autosave.spec.ts`).
19. Closing an unsaved tab shows A20's box (stubbed) and each answer behaves per T9; a named or
    empty tab closes without a box; closing the window shows no box, except T9's box for each
    unkept tab when the session folder cannot be written (R51; Save, Don't save and Cancel each
    behave per SS10)
    (`e2e/app-tabs.spec.ts`, `app-files.spec.ts`).
20. After 3 tabs with edits, 12 s, a killed process and a relaunch with the same user data, the
    tabs, order, active tab, drawings, views and the last 100 undo steps per tab come back (no
    redo steps); a broken record or index never stops start-up and deletes no drawing
    (`e2e/app-session.spec.ts`).
21. A file changed outside is never overwritten (AS5–AS8 unit and e2e); a second launch with a
    `.chalk` path already open focuses its tab; with a new path it opens a tab and the second
    process exits (`e2e/app-instance.spec.ts`).

## Boundaries (module-specific)

- **Always:** route every key through K1 or the editor; keep paths in main; validate every IPC
  payload and its sender; write files atomically; one document per window (2026-11-12: one
  drawing per tab, one file per tab, R30, T17); tokens and primitives
  only (no raw colours or sizes in app CSS); every control has a name, test id and focus ring.
- **Ask first:** any new dependency (icon converter, updater, store library); a new menu item or
  visible control; a settings screen; more file associations; a signed or per-machine installer;
  any network use.
- **Never:** register a menu accelerator; expose `ipcRenderer`, `fs` or paths to the page;
  overwrite a picture with drawing data; write over a file changed outside Chalkbond or create a
  file by auto-save (AS8); delete a session record a valid index does not list as discarded; show a stack trace or error code; delete a user's file;
  enable the test hook in a packaged build.
