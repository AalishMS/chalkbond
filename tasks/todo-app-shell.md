# Tasks: `app-shell`

Plan: `tasks/plan-app-shell.md` (the overall order across both modules is at its top). Spec:
`SPEC.md`, `SPEC-app-shell.md`, `SPEC-clipboard-export.md`; mock-ups `docs/mockups/shell/` (PNG
references: `node docs/mockups/shell/build.mjs --png out/mockups-shell`). Definition of done for
every task: acceptance criteria met, `npm run check` green, committed (one commit per task,
`feat(app-shell): A<n> …`, `feat(editor): …` for an editor change, `chore(app-shell): …` for
tooling-only tasks, `docs: …` for A20). "SC n" is success criterion n of `SPEC-app-shell.md`; rule
ids (F5, SEC6, TH2 …) are its rules; "clipboard-export X" points into `SPEC-clipboard-export.md`.

Shots: `npm run shots -- A<n>` → `out/shots/A<n>/<name>.png` (1280×800 content unless the name
ends in `-960`). Native parts (title bar, menus, message boxes, file dialogs) are never in a shot;
tasks that change them assert their content as data (menu model, the options a stubbed `dialog`
received) and add the visual check to the checklist (A20). Stubs: TH4 (`app.evaluate`; boxes at
startup through `launchApp` options and `e2e/stub-dialogs.mjs`).

From A3 on, every new e2e file ends by asserting `__chalkbondTestMain.blockedRequests === 0`
(SC10), except the one test in `e2e/app-security.spec.ts` that provokes a block.

---

## A1: Tooling for the new folders

**Description:** Required change 8 (lint and config part). `src/shared/channels.ts` (empty
`CHANNELS` object, no imports) and `src/shared/ipc-types.ts` (placeholder type). Include
`src/shared/**/*` in `tsconfig.node.json` and `tsconfig.web.json`. `eslint.config.mjs`: (a)
`src/main/**`, `src/preload/**`: no `@core/*`, no relative path into `src/core`; (b)
`src/preload/**`: runtime imports only `electron` and `../shared/channels` (type-only imports of
`../shared/ipc-types` allowed); (c) `src/main/model/**`: no `electron`, no `node:*` or Node
built-ins, named exports only; (d) add `src/renderer/app/model/**` and
`src/renderer/clipboard-export/model/**` to the editor's DOM-free block (same banned imports and
globals); (e) non-test files in `src/renderer/app/**` and `src/renderer/clipboard-export/**` may
import the editor only as `../editor` / `../../editor` (its `index.ts`). `vitest.config.mts`:
coverage `include` gains `src/main/model/**/*.ts` (thresholds come in A19 / C13).

**Tests first:** `tests/tooling/app-lint.test.ts` (pattern of `editor-lint.test.ts`, ESLint warmed
in `beforeAll`): rejects `@core/doc-model` in `src/main/x.ts` and `src/preload/x.ts`; rejects
`zod` in `src/preload/index.ts` and accepts `../shared/channels`; rejects `electron` and `node:fs`
in `src/main/model/x.ts`; rejects `document`, `setTimeout`, `Date`, `react` in
`src/renderer/app/model/x.ts` and `src/renderer/clipboard-export/model/x.ts`; rejects
`../editor/state/controller` in `src/renderer/app/App.tsx` and accepts `../editor`; accepts
`../editor/model/keymap` in `src/renderer/app/model/keys.test.ts`.

**Acceptance criteria:**
- [x] Every probe passes; existing lint probes (`lint-boundaries`, `editor-lint`, `svg-render-lint`) still pass
- [x] `npm run lint` and `npm run typecheck` clean on the current tree

**Verification:** `npm test -- tests/tooling/app-lint.test.ts`, `npm run check`. No visible change.

**Dependencies:** None

**Files:** `eslint.config.mjs`, `tsconfig.node.json`, `tsconfig.web.json`, `vitest.config.mts`, `src/shared/{channels.ts,ipc-types.ts}`, `tests/tooling/app-lint.test.ts`

**Scope:** S

## A2: Test hook, test user-data folder, harness migration

**Description:** TH1, TH2 (without `notices` and `commands` contents, which fill in as notices and
commands appear; the functions exist and return `[]`), TH3, TH6, the TH4 counter object, required
change 5 (`SPEC-editor.md` "Seam to the host" last bullet, edited first). `src/main/model/args.ts`
`testFlags(argv, isPackaged) → { hooks: boolean; userData: string | null }`; `src/main/index.ts`
applies `app.setPath('userData', dir)` before anything else and loads the page with `query: {
testHooks: '1' }` (dev URL: `?testHooks=1`) when `hooks`. `App.tsx` (scaffold) defines
`window.__chalkbondTest` when `location.search` has `testHooks=1`. `e2e/launch.ts`: an options
argument (keeping today's `extraArgs` callers working) adds `--chalkbond-test-hooks` and
`--chalkbond-user-data=<mkdtemp(os.tmpdir(), 'chalkbond-e2e-')>` unless given, keeps the existing
`-r e2e/no-os-mouse.mjs` preload, and can add `-r e2e/stub-dialogs.mjs` with
`CHALKBOND_TEST_DIALOGS` (write `stub-dialogs.mjs` now: it replaces `dialog.showMessageBox`,
`showOpenDialog`, `showSaveDialog` with scripted answers in order and records the options on
`globalThis.__chalkbondDialogLog`). `e2e/harness.ts`: `loadDocument`, `readDocument`,
`listenEvents`, `heardEvents` on the hook with unchanged signatures; the fiber code deleted.
`playwright.config.ts`: project `e2e` gets `testIgnore: /[\\/]win[\\/]/` when
`process.platform !== 'win32'`.

**Tests first:** `args.test.ts`: both flags honoured unpackaged; ignored packaged; `=` value with
spaces and quotes; missing value → null. `e2e/app-test-hook.spec.ts`: with the flags the hook
loads a document and reads it back (deep-equal), selection arrays, events after an edit; a launch
without `--chalkbond-test-hooks` (explicit option) has `typeof window.__chalkbondTest ===
'undefined'`; two launches get different `app.getPath('userData')`; a `stub-dialogs` launch
records a `showMessageBox` call made from `app.evaluate`.

**Acceptance criteria:**
- [x] `SPEC-editor.md` bullet edited first (same commit)
- [x] `grep -n "__reactFiber" e2e/` finds nothing; the full editor e2e suite passes on the hook (one pre-existing race in the editor-canvas resize test fixed: it now waits for the ResizeObserver update)
- [ ] Unit and e2e tests above pass; Linux run ignores `e2e/win/` (empty for now) without skipping anything

**Verification:** `npm test -- src/main/model`, `npm run check`, `npm run test:e2e`. No visible
change.

**Dependencies:** A1

**Files:** `SPEC-editor.md`, `src/main/{index.ts,model/args.ts,model/args.test.ts}`, `src/renderer/app/{App.tsx,model/test-hook.ts}`, `e2e/{launch.ts,harness.ts,stub-dialogs.mjs,app-test-hook.spec.ts}`, `playwright.config.ts`

**Scope:** M

## A3: Security baseline, IPC skeleton, logging

**Description:** SEC1–SEC6, SEC11, SEC13, LG1, N6. Split `src/main/index.ts` into `index.ts`
(lifecycle, window) and `security.ts` (`web-contents-created` rules, permission handlers,
`webRequest` filter with the blocked counter on `__chalkbondTestMain` when hooks are on; remove
`shell.openExternal`), `ipc.ts` (`handle(channel, schema, fn)` and `on(channel, schema, fn)`: sender
check against the main window's main frame and the app URL, Zod parse, errors logged and
rejected), `ipc-schemas.ts`, `log.ts` (`userData/logs/main.log`, 1 MB rotation). Preload:
`logError`, `onMainEvent` (no events yet); `api.d.ts` typed from `src/shared/ipc-types.ts`;
`webviewTag: false`, `devTools: !app.isPackaged`.

**Tests first:** `ipc.test.ts` with fake events: accepted from the main frame with the app URL;
rejected for `senderFrame` null, another frame, another URL, a payload failing its schema (and
each rejection logged through an injected logger). `log.test.ts` (pure line formatting and
rotation decision in `model/`). `tests/tooling/app-security.test.ts`: SEC13 CSP string equal;
SEC11 no `openExternal` in `src/main/**`. `e2e/app-security.spec.ts`: SEC1 preferences (move the
smoke assertions here or keep both); SEC2 `window.open` leaves one window and `location.href =
'https://example.com'` leaves the URL; SEC3 `Notification.requestPermission()` → `'denied'`; SEC4
`fetch('https://example.com')` rejects and the counter is 1; SEC5 `Object.keys(window.chalkbond)`
equals the documented list; `logError` appends a line to `main.log` in the test's user-data
folder.

**Acceptance criteria:**
- [x] Unit, tooling and e2e tests pass
- [x] `e2e/smoke.spec.ts` still passes (title, preferences)
- [x] From this task on every e2e file asserts the counter is 0 at its end (helper `expectNoNetwork(app)` in `e2e/harness.ts`), and the editor e2e files call it

**Verification:** `npm test -- src/main`, `npm run check`, `npm run test:e2e`. No visible change.

**Dependencies:** A2

**Files:** `src/main/{index.ts,security.ts,ipc.ts,ipc.test.ts,ipc-schemas.ts,log.ts,model/log-line.ts,model/log-line.test.ts}`, `src/shared/{channels.ts,ipc-types.ts}`, `src/preload/{index.ts,api.d.ts}`, `tests/tooling/app-security.test.ts`, `e2e/{app-security.spec.ts,harness.ts}`, editor e2e files (one line each)

**Scope:** M

## A4: Editor right-click selection (CM1) and host-callable name-field focus

**Description:** Required changes 3 and 4. First edit `SPEC-editor.md` (CM1 text, the
`contextMenuAt` seam comment, Decision 12 wording, the `focus-name-field` bullet, two R-rows with
the next free numbers). Then `controller.contextMenuAt`: an unselected hit atom / bond / object
becomes the selection a Select click makes (whole fragment for atoms and bonds) and the tool
becomes Select, before the event; selected item or empty canvas keeps the selection.
`canRun('focus-name-field')` = no label or text editor open; `run` dispatches a `focus-request`
action that bumps a counter in state; `Editor.tsx` focuses `[data-testid="namefield-input"]` in an
effect when the counter changes; the view's Ctrl+F goes through `controller.run`.

**Tests first:** `controller.test.ts`: right-click on an unselected atom of ethanol selects all 3
atoms and 2 bonds, tool Select, then the event (order checked); on a selected bond → selection
unchanged; on empty canvas → unchanged; during a gesture → cancelled, no event; replace the old
"selection is not changed" test. `controller-commands.test.ts`: `focus-name-field` `canRun` true
idle, false with the label editor open; `run` bumps the counter only when `canRun`.
`e2e/editor-name.spec.ts`: Ctrl+F on the canvas still focuses the field.

**Acceptance criteria:**
- [x] `SPEC-editor.md` edited first; R-rows added
- [x] Tests above pass; editor coverage ≥ 70 %; editor e2e green
- [x] Shot exists

**Verification:** `npm test -- src/renderer/editor`, `npm run check`, `npm run test:e2e`,
`npm run shots -- A4` → `A4/right-click-select.png` (scripted: ethanol inserted, Esc to clear the
selection, right-click an atom (no host menu yet): ethanol shows the selection halo and frame
exactly as A07's left panel; Select is the active tool).

**Dependencies:** A2

**Files:** `SPEC-editor.md`, `src/renderer/editor/{state/controller.ts,state/reducer.ts,state/editor-state.ts,view/Editor.tsx,state/controller.test.ts,state/controller-commands.test.ts}`, `e2e/editor-name.spec.ts`, `e2e/shots/A4.shot.ts`

**Scope:** S

## A5: Shell tokens, icons and UI primitives

**Description:** V1–V3. Copy `docs/mockups/shell/shell-tokens.css` to
`src/renderer/app/shell-tokens.css` (identical after the leading comment) and `shell-icons.svg`
to `src/renderer/app/shell-icons.svg` (byte-identical). `src/renderer/app/ui/`: `Icon` (uses
`#id`), `Button` (primary / secondary), `Dialog` (shell: scrim, top 96, width prop, title id,
focus trap, Esc, scrim click, focus return), `RadioCard` + `RadioGroup`, `Checkbox`, `Segmented`,
`Kbd`, with `app.css` rules taken from `docs/mockups/shell/shell.css` (tokens only). Not mounted
yet.

**Tests first:** `tests/tooling/shell-tokens.test.ts` (V2 a–f). Markup tests per primitive: role,
accessible name, `aria-checked` / `aria-disabled`, test ids, focusable when disabled; radio group
keyboard model as a pure function (`model/radio-keys.ts`: ↑/↓/←/→ wrap, Home, End) with unit
tests.

**Acceptance criteria:**
- [x] Tooling and markup tests pass; `src/renderer/app/model` ≥ 90 % lines so far
- [x] No hex or `rgb(` colour literal in `src/renderer/app/**/*.css` (V2 e)

**Verification:** `npm run check`. No visible change (primitives are first mounted by C8, C10, A12;
their shots are there).

**Dependencies:** A1

**Files:** `src/renderer/app/{shell-tokens.css,shell-icons.svg,app.css,ui/*.tsx,ui/*.test.tsx,model/radio-keys.ts,model/radio-keys.test.ts}`, `tests/tooling/shell-tokens.test.ts`

**Scope:** M

## A6: Host skeleton: controller ownership, title, window size and minimum

**Description:** CO1–CO3 (title part), W1, W3, W5, W6, I7 (returns default settings, no recovery,
no file yet), N1 (`title` and `dirty`; `menu` added in A11). `App.tsx` becomes the host: startup
via I7, controller with `shortcuts: 'all'` and `logError`, `session.ts` (Untitled), title
`windowTitle` sent on `dirty` / `doc` events, shell tokens imported and the shell sprite injected,
`notify` used for host notices (collected by the hook's `notices()`). Main: `useContentSize: true`,
`minWidth: 960`, `minHeight: 640`, first-launch size per W1 (pure `window-bounds.ts` W1 part),
`setTitle` from N1 and `page-title-updated` prevented, `setZoomMode('disabled')`. Menu stays
`null` until A11.

**Tests first:** `titles.test.ts` (every W3 example); `window-bounds.test.ts` (W1: 1920×1040 work
area → centred 1280×800 content; 1366×728 → maximized); `session.test.ts` (Untitled, dirty
derivation). `e2e/app-window.spec.ts`: title `Untitled - Chalkbond` at start and
`*Untitled - Chalkbond` after an edit (via `getTitle()`); after `setSize(200, 200)`
`getContentSize()` ≥ [960, 640] (W6 probe; if it fails apply the spec's fallback and note it in
the spec's Facts row); Ctrl+= with the page focused leaves `getZoomFactor() === 1`; Ctrl+wheel over
the canvas changes the editor zoom readout, not the page zoom. Update `e2e/smoke.spec.ts` to the
new minimum assertion.

**Acceptance criteria:**
- [x] Unit and e2e tests pass; the W6 Facts row records what the probe showed
- [x] The editor e2e suite still passes in the host
- [x] Shots exist

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- A6` →
`A6/untitled.png` (A11's window without the box: empty drawing, empty state, disabled-looking top
bar right end empty until C8, status bar), `A6/untitled-960.png` (all ten rail buttons visible,
Text's caption included, at 960×640 content).

**Dependencies:** A3, A5, C1, C2

**Files:** `src/main/{index.ts,model/window-bounds.ts,model/window-bounds.test.ts,model/titles.ts,model/titles.test.ts,ipc-schemas.ts}`, `src/renderer/app/{App.tsx,model/session.ts,model/session.test.ts}`, `src/shared/*`, `src/preload/*`, `e2e/{app-window.spec.ts,smoke.spec.ts}`, `e2e/shots/A6.shot.ts`

**Scope:** M

### Checkpoint S — foundations (see the plan)

## A7: Main file I/O, refs, dialogs, messages

**Description:** `model/file-refs.ts` (registry: create, lookup, writable rule), `files.ts` (SEC7
read with `stat`; SEC8 + F9 atomic write with the signature check, retries, temp cleanup),
`model/write-problem.ts` (errno → `FileProblem`), `model/messages.ts` (every F14 row; the
save-changes, recover and replace boxes), `dialogs.ts` (I1 with the Open filter and last open
folder; C3 with F8 filters, the R6 extension rule and replace box; I4 save-changes; I5 file error).
Channels I1, I2, I4, I5, C3, C4 with schemas and preload functions.

**Tests first:** `files.test.ts` in a temp folder: read of a directory, a 21 MB file, a `.exe`,
a missing file → the right problem; write to a read-only ref → refused; PNG bytes to a chalk ref →
refused; a failed rename leaves no `.tmp` file; an existing target is replaced. `messages.test.ts`:
every F14 row's message and detail for `ethanol.chalk`; a name with a path separator is rejected by
the I5 schema. `write-problem.test.ts`: each errno. `dialogs` R6 rule as a pure function
`withExtension(path, format)` (`notes` → `notes.chalk`, `notes.png` → `notes.png.chalk`,
`a.CHALK` kept). Handler tests: each schema rejects bad payloads.

**Acceptance criteria:**
- [x] Unit tests pass; `src/main/model` ≥ 90 % lines so far
- [x] No channel returns or accepts a path (schema review in the test: no `path` field except I3, which arrives in A15)
- [x] Correction (2026-11-11, F2/F14): a name without an Open extension chosen in Open shows the `unsupported` box from main and I1 answers `null`; the drawing is untouched, no prompt (`dialogs.test.ts`, `e2e/app-open-unsupported.spec.ts`)

**Verification:** `npm test -- src/main`, `npm run check`. No visible change (native dialogs; their
use and stubs are e2e-tested in A8, A9).

**Dependencies:** A3

**Files:** `src/main/{files.ts,files.test.ts,dialogs.ts,ipc-schemas.ts,index.ts,model/file-refs.ts,model/messages.ts,model/write-problem.ts,model/*.test.ts}`, `src/shared/*`, `src/preload/*`

**Scope:** M

## A8: Session and file flows: New, Open, Save, Save as, close

**Description:** `model/file-flows.ts` F1–F7, F13 over injected ports (in-progress flag, one
pending open), `session.ts` kinds, R7 identity check, N2 (main records the last open / save
folder; recent list in A15), N-A1 "Saved …" notice, host keys Ctrl+N / Ctrl+O / Ctrl+S /
Ctrl+Shift+S in `model/keys.ts`, main's `close` interception and `close-requested` / N5,
`render-process-gone` path. New uses `settings.newDrawingStyle` (default `slides` until A10).

**Tests first:** `file-flows.test.ts`: every prompt answer on New, Open (after the file is chosen),
close; Save of Untitled → Save as; Save as cancelled → nothing; failed write → error box, still
dirty; R7 (edit during the write → still dirty); a second open request while a prompt is open is
queued and the latest wins. `keys.test.ts`: the four keys idle, in the name field, and ignored
while busy. `e2e/app-files.spec.ts` (SC3, SC4 part, round trip): scheme → Ctrl+S → stubbed save
dialog to `<tmp>/esterification.chalk` → file bytes equal `serialize(getDoc())`, title
`esterification - Chalkbond`, hint "Saved esterification.chalk."; New (Don't save path) → empty;
Open that file (stubbed open dialog) → `serialize` equal; edit + New → stubbed box received the
A09 message, Cancel keeps the drawing, Save writes then clears; edit + close (`win.close()`) →
prompt; Don't save closes the app; a save into a deleted folder → the stubbed box receives "The
folder no longer exists. Choose another folder." and the title keeps `*`.

**Acceptance criteria:**
- [x] Unit and e2e tests pass (SC3; SC4 for New, Open, close)
- [x] `src/renderer/app/model` ≥ 90 % lines so far (100 %)
- [x] Shot exists (`A8/saved.png`, compared with A17's Save row)
- [x] R14 (spec first): the prompt's Save goes ahead only if the save succeeded and the drawing is
  clean afterwards; an edit during the write keeps the newer drawing and stops New / Open / close
  (`file-flows.test.ts`). Linux only; Windows native boxes unverified
- [x] Correction F4a / R17 (editor R48, spec first): New, Open (after validation), close and a
  handed-over open first finish an open label or text editor through its commit path
  (`finish-editing.ts` port; `finish-editing.test.ts`, `file-flows.test.ts` F4a incl. an editor
  opened during the prompt's Save write); an IME blur defers the commit to `compositionend`.
  `e2e/app-draft-close.spec.ts`: label and existing text at a native close (Cancel keeps, Save
  writes), `main:event open` while typing, synthetic IME, name field not an edit. Linux only;
  a real Windows IME and native close unverified

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- A8` → `A8/saved.png`
(scripted: scheme, Ctrl+S with the stubbed dialog: hint "Saved esterification.chalk." in
`--text`, no icon, as A17's row).

**Dependencies:** A6, A7, C8 (host-keys module exists)

**Files:** `src/renderer/app/{App.tsx,model/file-flows.ts,model/file-flows.test.ts,model/session.ts,model/keys.ts,model/keys.test.ts}`, `src/main/{index.ts,files.ts}`, `src/shared/*`, `src/preload/*`, `e2e/app-files.spec.ts`, `e2e/shots/A8.shot.ts`

**Scope:** L

## A9: Opening exported pictures; file errors

**Description:** F3 with `fileKindOf` / `extractDrawing` / `parse` (clipboard-export E4) and the
problem mapping to F14; A6 rule (picture session: title keeps the extension, Save → Save as with
`<name>.chalk` in the picture's folder); open failures leave the drawing untouched with no prompt.

**Tests first:** `file-flows.test.ts`: each `extractDrawing` problem and each `parse` code maps to
the F14 problem; a picture session's Save goes to Save as with the suggested name and folder.
`e2e/app-open-pictures.spec.ts` (SC5 part): a PNG made in the test (minimal PNG +
`withPictureChunks` with `drawingPayload(goldenDoc('toluene'))`) and an SVG (`exportSvg`) open to
documents whose `serialize` equals toluene's; title `toluene.png - Chalkbond`; Ctrl+S → the
stubbed save dialog gets `defaultPath` `<picture folder>/toluene.chalk`; the PNG file's bytes are
unchanged afterwards. `e2e/app-open-errors.spec.ts` (SC6): a newer-version `.chalk`
(`schemaVersion` 999), a damaged one (`{"format":"chalkbond"`), a PNG without the chunk, a missing
file (recent click is A15; here an open of a ref whose file was deleted after choosing) → the
stubbed box receives the A10 / F14 wording; the current drawing (`serialize`) and the file bytes
are unchanged.

**Acceptance criteria:**
- [x] Unit and e2e tests pass (SC5 for PNG and SVG, and PDF under PDF-A from the C4 fixture; SC6). The opened SVG with a remote `<image>` and a `<script>` keeps the SEC4 counter at 0 (CS4). Linux only
- [x] Shot exists (`A9/opened-picture.png`: toluene, nothing selected, Copy enabled)
- [x] Correction (2026-11-11, clipboard-export C9, SEC7/F14): main reads a `.chalk` up to 20 MiB and a picture up to 64 MiB; a 21 MiB PNG with a small drawing reopens (`files.test.ts`, `file-flows.test.ts`, `e2e/app-open-pictures.spec.ts`); a `.chalk` over 20 MiB and a picture over 64 MiB show the too-large box with the new detail "Drawings can be up to 20 MB. Pictures made in Chalkbond can be up to 64 MB." (`messages.test.ts`, `e2e/app-open-errors.spec.ts`; stubbed box data, the native box on Windows not looked at)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- A9` →
`A9/opened-picture.png` (toluene opened from the PNG at the default zoom; nothing selected; the
top bar's Copy enabled).

**Dependencies:** A8, C6

**Files:** `src/renderer/app/model/{file-flows.ts,file-flows.test.ts}`, `e2e/app-open-pictures.spec.ts`, `e2e/app-open-errors.spec.ts`, `e2e/shots/A9.shot.ts`

**Scope:** M

## A10: Settings and window memory

**Description:** ST1, ST2, W2, I7 (real settings), I8, `settings-io.ts` (atomic, 500 ms debounce),
`model/settings.ts` (lenient parse, defaults), preset tracking on `doc` events (not loads), folder
memory (open, save, export), window bounds stored on close and restored on launch.

**Tests first:** `settings.test.ts`: defaults; each invalid field replaced alone; unknown keys
dropped; broken JSON → defaults. `window-bounds.test.ts` W2: half-visible rule, a rectangle on a
removed display → W1, maximized flag. Host test: a preset switch through the controller stores
`newDrawingStyle`; a load does not. `e2e/app-settings.spec.ts`: switch to Handout, Ctrl+N → the
new drawing is Handout (status-bar switch); relaunch with the same user-data folder keeps it;
`setBounds({x: 100, y: 80, width: 1100, height: 760})`, close, relaunch → `getNormalBounds()`
equal; maximized restored; a `settings.json` with bounds at x = 10 000 → W1 size; a garbage
`settings.json` → the app starts with defaults and the file is rewritten valid.

**Acceptance criteria:**
- [x] Unit and e2e tests pass (`settings.test.ts`, `settings-io.test.ts`, `window-bounds.test.ts`, `session-folders.test.ts`, `ipc-schemas.test.ts` I8, `preset-memory.test.ts`, `host.test.ts`; `e2e/app-settings.spec.ts`). Linux only: the headless backend reports a 1 × 1 work area, so the Linux W2 checks are relative to the work area (stored = the work area, not maximized / maximized; x = 10 000 → W1; a real close stores the normal bounds); the todo's `setBounds({x: 100, y: 80, width: 1100, height: 760})` relaunch and maximize is `e2e/win/app-window-memory.spec.ts`, not yet run on Windows
- [x] The renderer never receives a path from settings (schema of I7's `settings`): `rendererSettings` unit test, I8 `setSettingsSchema` rejects folders / window / recent, e2e ST2
- [x] Shot exists (`A10/new-handout.png`, looked at)
- [x] Correction (R15, R16): ST4 read retries (EBUSY / EPERM 3 × 100 ms) and no write after a failed read (`settings-io.test.ts` injected reader; e2e: a folder at `settings.json` keeps its bytes); ST5 int32-integer window (`settings.test.ts` 100.5 and 3000000000; e2e malformed window starts usable at W1); e2e the open, save and export folders survive a real close and relaunch

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- A10` →
`A10/new-handout.png` (scripted: switch to Handout, Ctrl+N, Don't save: empty drawing with
"Handout" selected in the status bar).

**Dependencies:** A8

**Files:** `src/main/{settings-io.ts,index.ts,model/settings.ts,model/settings.test.ts,model/window-bounds.ts,model/window-bounds.test.ts}`, `src/renderer/app/{App.tsx,model/session.ts}`, `src/shared/*`, `src/preload/*`, `e2e/app-settings.spec.ts`, `e2e/shots/A10.shot.ts`

**Scope:** M

### Checkpoint U — files round-trip (see the plan)

## A11: Native menus (M1–M3) and host keys (K1–K3)

**Description:** `model/menu-model.ts` (every row of the M1 table, M2, M3), `menu.ts`
(`Menu.buildFromTemplate`, applied when N1's `menu` changes; clicks → `main:event {command}` or
main-only actions: Exit, About in A12, M3 text actions), `model/menu-state.ts` (from the
controller, `busy` events, `document.activeElement` text focus, dialog open; once per frame);
renderer command dispatch for every id (File: F-flows and Export; Edit: `run` / clipboard flows;
View: `run`; Help: shortcuts dialog placeholder until A12 records the command). Host keys complete:
Ctrl+E (from C10), F1, Ctrl+F outside the editor root, K3 Alt rule. K2 conflict test. The TH2
`commands()` list fills.

**Tests first:** `menu-model.test.ts`: per row label, accelerator string, `registerAccelerator ===
false`, no `role`, enabled per `MenuState`, id; "Undo add bond" casing; "Copy whole drawing" vs
"Copy"; modal disables all; M3 text-focus variant (labels, enabled, Duplicate disabled).
`menu-state.test.ts`. `keys.test.ts`: K1 full table, K2 against `globalCommand` / `canvasKey` /
K3 editor keys, K3 (Alt+click then Alt up → prevent; Alt alone → not prevented). `e2e/app-menus.spec.ts`
(SC2): every application menu id clicked → its effect (e.g. `edit.select-all` selects all,
`view.zoom-reset` shows 100 % (R18; editor R49), `file.new` with a stubbed prompt, `view.style-handout` switches,
`help.shortcuts` appears in `commands()`); with the name field focused and "ethanol" typed,
`edit.copy` puts "ethanol" on the clipboard (Windows file `e2e/win/app-menu-text.spec.ts`) and
`edit.select-all` selects the field text. `e2e/app-keys.spec.ts`: every K1 key reaches its action
with the menu installed; Ctrl+C in the name field copies text (Windows file); at 960×640 content
with the menu bar the Text rail button is fully visible (SC12).

**Acceptance criteria:**
- [x] Unit and e2e tests pass (SC2, SC12) (Linux; `e2e/win/app-menu-text.spec.ts` written, not run)
- [x] `Menu.getApplicationMenu()` items all have `registerAccelerator === false` (asserted in e2e through `app.evaluate`)
- [x] Shot exists (`out/shots/A11/menu-960.png`, looked at; the native menus' look, A04–A06, stays on the Windows checklist)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- A11` →
`A11/menu-960.png` (960×640 content with the menu bar present: the page shows all ten rail
buttons; the native menu bar itself is outside the shot). The menus' look (A04–A06) goes on the
checklist.

**Dependencies:** A8, A10, C9, C10

**Files:** `src/main/{menu.ts,index.ts,model/menu-model.ts,model/menu-model.test.ts}`, `src/renderer/app/{App.tsx,host-keys.ts,model/menu-state.ts,model/menu-state.test.ts,model/keys.ts,model/keys.test.ts}`, `src/shared/*`, `src/preload/*`, `e2e/app-menus.spec.ts`, `e2e/app-keys.spec.ts`, `e2e/win/app-menu-text.spec.ts`, `e2e/shots/A11.shot.ts`

**Scope:** L

## A12: Keyboard shortcuts dialog (A12) and About (A14)

**Description:** `model/shortcuts.ts` (the sections and rows exactly as the spec table),
`ShortcutsDialog.tsx` on the dialog shell (560 wide, top 96, bottom ≥ 32 above the content edge,
scrolling body with a visible thin scrollbar, closing rule, Close button, `Kbd` chips joined by
"+"); F1 and `help.shortcuts` open it. About (AB1) in main with `nativeImage` icon from
`build/icon.png` (or `process.resourcesPath` when packaged) and the Licences button calling
`shell.openPath`.

**Tests first:** `shortcuts.test.ts`: every row maps to the editor keymap (`globalCommand`,
`canvasKey`, `hoverKeys`, tool keys) or K1, and every editor K1 / K2 / K3 key and host K1 key
appears at least once. Markup test: headings in order, chip splitting ("Ctrl+Shift+L" → three
chips), Close button. `e2e/app-shortcuts.spec.ts`: F1 opens it with focus inside; at 1280×800 and
960×640 every Tools row is inside the scroll viewport at scrollTop 0; Esc closes and focus returns
to the canvas; F1 while the label editor is open does nothing. About: stubbed `showMessageBox`
receives `title: 'About Chalkbond'`, `message: 'Chalkbond <package.json version>'`, the detail
text and buttons `['OK', 'Licences']`; answering 1 calls the stubbed `shell.openPath` with a path
ending `THIRD-PARTY-NOTICES.txt`.

**Acceptance criteria:**
- [x] Unit, markup and e2e tests pass (Linux; About asserted as data with stubbed `showMessageBox` / `shell.openPath`, its look stays on the Windows checklist)
- [x] Shots exist and match A12 (`out/shots/A12/shortcuts.png`, `shortcuts-960.png`, `shortcuts-scrolled.png`, compared with the A12 mock-up PNG)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- A12` →
`A12/shortcuts.png` (A12, scripted: scheme, F1: dialog centred, title "Keyboard shortcuts", Tools
section with V … T chips and meanings in a 136 px key column, scrollbar visible, Close
bottom-right), `A12/shortcuts-960.png` (Tools fully visible, dialog bottom ≥ 32 px above the
content edge). The About box's look (A14) goes on the checklist.

**Dependencies:** A5, A11

**Files:** `src/renderer/app/{ShortcutsDialog.tsx,ShortcutsDialog.test.tsx,model/shortcuts.ts,model/shortcuts.test.ts,ui/Kbd.tsx,app.css,App.tsx}`, `src/main/{menu.ts,about.ts}`, `e2e/app-shortcuts.spec.ts`, `e2e/shots/A12.shot.ts`

**Scope:** M

## A13: Context menus (CM1–CM3)

**Description:** I6 (`context-menu:show`), `model/context-menu-model.ts`, popup at the cursor,
the chosen command dispatched like the Edit item (Paste = CB-P1, clipboard-export R3); CM3 text
field menu from `webContents.on('context-menu')` with `params.isEditable` and roles.

**Tests first:** `context-menu-model.test.ts`: item menu (5 entries + separator, labels, enabled
per state); empty-canvas menu with "Copy whole drawing" vs "Copy"; CM3 template uses the four
roles. `e2e/app-context-menus.spec.ts` (`Menu.prototype.popup` stubbed to record the template and
click a chosen id): right-click an unselected ethanol atom → ethanol selected (A4) and the
recorded template equals the item menu; choosing Delete removes it; right-click empty canvas with
nothing selected → "Copy whole drawing"; Esc (stub returns no choice) changes nothing;
right-click in the name field → the recorded template has roles `cut`, `copy`, `paste`,
`selectAll`.

**Acceptance criteria:**
- [x] Unit and e2e tests pass (Linux; `Menu.prototype.popup` stubbed: the items Electron received are asserted as data, the native menus' look, A07, stays on the Windows checklist)
- [x] Shot exists (`out/shots/A13/right-click-selected.png`, compared with A07's left panel)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- A13` →
`A13/right-click-selected.png` (scripted with the popup stubbed to do nothing: benzene and ethanol
as A07, right-click on ethanol: ethanol selected with halo and frame as A07's left panel). The
native menus' look (A07) goes on the checklist.

**Dependencies:** A4, A11

**Files:** `src/main/{menu.ts,model/context-menu-model.ts,model/context-menu-model.test.ts,ipc-schemas.ts}`, `src/renderer/app/{App.tsx,model/menu-state.ts}`, `src/shared/*`, `src/preload/*`, `e2e/app-context-menus.spec.ts`, `e2e/shots/A13.shot.ts`

**Scope:** M

### Checkpoint W — every command reachable (see the plan)

## A14: Recovery (RC1–RC6)

**Description:** `model/recovery-timer.ts` (2 s after the last change, ≤ 10 s after the first of a
burst; injected clock and scheduler), N3 / N4, main `recovery.ts` (atomic files, one promise chain
RC6), I7 `recovery`, I4 `recover` with the A11 wording, RC4 with a startup file (N-A2 notice), RC5
`query-session-end` → `flush-recovery`, clears per RC2 (save, New / Open after the prompt, Delete,
normal close, undo back to saved).

**Tests first:** `recovery-timer.test.ts` (steady edits every 1 s write at 10 s; one edit writes at
2 s; save cancels). `recovery.test.ts` (main, temp folder): write then clear in quick succession
leaves no file; a broken `drawing.chalk` is deleted at startup and logged. `file-flows.test.ts`:
recovered session is `forcedDirty`, Save goes to Save as with the old name; RC4 order.
`e2e/app-recovery.spec.ts` (SC7, round trip): launch with folder D, insert ethanol, wait until
`D/recovery/drawing.chalk` exists (poll ≤ 12 s), `app.process().kill()`, relaunch with D and
`dialogs: [{ response: 0 }]` → the recorded box has `type: 'info'`, the A11 message, detail and
buttons `['Recover', 'Delete']`, `cancelId: 0`; the document equals ethanol, title `*Recovered
drawing - Chalkbond`. Second case answers Delete → empty drawing and the file is gone. Third: a
`.chalk` path on the relaunch command line → recovery offered first, then hint "Recovered your
unsaved drawing. Save it, then open ethanol.chalk again." RC5: `win.emit('query-session-end', …)`
after an edit writes the file within 1 s.

**Acceptance criteria:**
- [x] Unit and e2e tests pass (SC7) (Linux; RC5 by a synthetic `query-session-end`, the real Windows shutdown grace is not run)
- [x] The recovery file never contains anything after a normal close (e2e: edit, Don't save, file absent)
- [x] Shot exists (`out/shots/A14/recovered.png`, `recovered-with-file.png`, looked at; the N-A2 wording as A17; the box's look, A11, stays on the Windows checklist)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- A14` →
`A14/recovered.png` (scripted relaunch after a kill with the stub answering Recover: ethanol on the
canvas; hint slot empty or the RC4 notice in the third case `A14/recovered-with-file.png`). The
box's look (A11) goes on the checklist.

**Dependencies:** A8, A10

**Files:** `src/main/{recovery.ts,recovery.test.ts,index.ts,ipc-schemas.ts}`, `src/renderer/app/{App.tsx,model/recovery-timer.ts,model/recovery-timer.test.ts,model/file-flows.ts,model/file-flows.test.ts}`, `src/shared/*`, `src/preload/*`, `e2e/app-recovery.spec.ts`, `e2e/shots/A14.shot.ts`

**Scope:** M

## A14a: Session end and the close guard (R24)

**Description:** `guardClose` (`src/main/lifecycle.ts`) listens to `session-end` as well.
`query-session-end` only sends `flush-recovery` and changes no guard state; only `session-end`
lets the following `close` skip F4 and the recovery clear (RC5, R24). The flush stays best effort:
nothing is prevented or awaited. The quit flush's Windows gap is documented only.

**Tests first:** `lifecycle.test.ts`: `query-session-end` then `close` is prevented and sends
`close-requested` (the defect; fails first); `query-session-end` never calls `preventDefault` and
sends `flush-recovery`; `session-end` then `close` goes ahead, `closing()` runs, nothing is sent;
`query-session-end` + `session-end` + `close` likewise. `e2e/app-recovery.spec.ts` replaces the
old RC5 test by two: (a) a synthetic `query-session-end` writes the file within 1 s and prevents
nothing, then a real close shows the save prompt (Don't save: the window closes, the file is gone);
(b) synthetic `query-session-end` then `session-end`, then a real close with `dialogs: []` closes
without a box and the file stays.

**Acceptance criteria:**
- [x] `lifecycle.test.ts` and both e2e tests pass (Linux; synthetic events prove only the guard's logic)
- [x] `npm run check` green
- [ ] A real cancelled shutdown and a real shutdown behave as R24 says (Windows; synthetic events on Linux prove only the guard's logic)

**Verification:** `npm run check`; `npx electron-vite build` then
`npx playwright test --project=e2e e2e/app-recovery.spec.ts`. The two Windows checks are in the
spec's "Windows checks".

**Dependencies:** A14

**Files:** `SPEC-app-shell.md`, `SPEC.md`, `src/main/{lifecycle.ts,lifecycle.test.ts}`, `e2e/app-recovery.spec.ts`, `tasks/*`

**Scope:** S

## A14b: An open label or text draft at shutdown (R25)

**Description:** `flush-recovery` (RC5) finishes an open label or text editor through its normal
commit path before N3 is sent, unless recovery is suspended (RC7) or an IME composition is in
progress (then the editor is not touched). Host code only: a non-waiting `finishEditingNow` and a
composition tracker in `finish-editing.ts`, wired as the recovery model's `beforeFlush`. The editor
module and `SPEC-editor.md` are unchanged.

**Tests first:** `finish-editing.test.ts`: an open editor is committed synchronously (blur, then the
dispatched `blur` fallback), no subscription is left; composing: the box is not blurred and nothing
subscribes; no editor: no-op; the composition tracker follows `compositionstart` / `compositionend`.
`recovery.test.ts`: `beforeFlush` runs before the write; suspended: neither. `host.test.ts`:
`flushRecovery` finishes before N3. `e2e/app-recovery.spec.ts`: a label typed, synthetic
`query-session-end` → within 1 s the recovery file contains the label and the editor is closed;
with a simulated composition → the file is written within 1 s without the draft, the box is still
open, and a later `compositionend` behaves as it does without a shutdown.

**Acceptance criteria:**
- [x] Unit and e2e tests pass (Linux; synthetic `query-session-end`)
- [x] `e2e/app-draft-close.spec.ts` and `e2e/app-files.spec.ts` still pass
- [x] `npm run check` and `npm run test:e2e` green
- [ ] A real shutdown with a typed label, and with an IME composition under way, behaves as R25 says (Windows)

**Verification:** `npm run check`; `npx electron-vite build`, then
`npx playwright test --project=e2e e2e/app-recovery.spec.ts e2e/app-draft-close.spec.ts e2e/app-files.spec.ts`;
`npm run test:e2e`.

**Dependencies:** A14a

**Files:** `SPEC-app-shell.md`, `SPEC.md`, `src/renderer/app/{finish-editing.ts,finish-editing.test.ts,host.ts,host.test.ts,model/recovery.ts,model/recovery.test.ts}`, `e2e/app-recovery.spec.ts`, `tasks/*`

**Scope:** S

## A15: Recent files, single instance, drag and drop

**Description:** `model/recent.ts` (F10) and the Open recent submenu with Clear; missing entries
removed with the error box; `requestSingleInstanceLock` (false → quit), `second-instance` +
`model/args.ts` `fileArg`, first-launch argv → I7 `open`, the renderer's queue (F11). Drop overlay
(`DropOverlay.tsx`, A13) on `dragenter` with Files; drop → preload `openDroppedFile(file)` calling
`webUtils.getPathForFile` and invoking I3; main validates (extension, regular file, size) and
returns a ref; unsupported → F14 box (SEC14). Under clipboard-export PDF-A (decided in C4) the
drop list, the overlay's second line and the `unsupported` detail include `.pdf`.

**Tests first:** `recent.test.ts` (add, case-insensitive dedupe, cap 8, remove, labels with
` — <folder>` for duplicate names and doubled `&`). `args.test.ts` `fileArg` (flags, Chromium
extras, `-r` preload paths, quotes, `.CHALK`, `.png`, other extensions ignored).
`e2e/app-recent.spec.ts`: two saves and an open → `file.recent.0`… labels in the menu model and in
`Menu.getApplicationMenu()`; clicking an entry opens it; deleting the file then clicking → stubbed
box "can't be found" and the entry disappears; Clear empties the submenu (item disabled).
`e2e/app-instance.spec.ts` (SC8, SC4 part): with an unsaved edit in the first app, spawn a second
Electron process (same user-data folder and flags, a `.chalk` path) → it exits with code 0; the
first window's stubbed prompt is shown; after Don't save the file is open. `e2e/app-drop.spec.ts`:
a hidden `<input type=file>` filled by `setInputFiles(<tmp>/ethanol.chalk)` supplies a disk-backed
`File`; a synthetic `dragenter` shows `drop-overlay`, the `drop` opens the file; a `.docx` drop →
the box "Chalkbond can't open “notes.docx”."; a JS-made `File` → `unsupported` with an empty name
and nothing opened (SEC14); `webUtils` works in the sandboxed preload (probe).

**Acceptance criteria:**
- [x] Unit and e2e tests pass (SC8, SC4 second-instance part) (Linux; the real Explorer double-click and association are A17/Windows)
- [x] I3 is the only channel that carries a path, and only the preload sends it (`ipc-schemas.test.ts` R8 block; preload `webUtils.getPathForFile`)
- [x] Shot exists (`out/shots/A15/drop.png`, looked at against A13; ".pdf" added per PDF-A)

Also landed (spec first, Decisions R21–R23): recent clicks open the path captured at menu build;
OS opens wait while Export / Keyboard shortcuts is open, drops then open nothing; RC4 covers requests
during the startup offer and RC7 suspends recovery tracking until it is answered
(`e2e/app-recovery.spec.ts` R23 cases with a held scripted answer).

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- A15` → `A15/drop.png`
(A13, scripted: scheme, synthetic `dragenter` with Files: pale blue overlay over the whole page,
8 px inset dashed accent box, "Drop to open" and the second line centred).

**Dependencies:** A8, A10, A11

**Files:** `src/main/{index.ts,menu.ts,files.ts,ipc-schemas.ts,model/recent.ts,model/recent.test.ts,model/args.ts,model/args.test.ts,model/menu-model.ts}`, `src/preload/{index.ts,api.d.ts}`, `src/renderer/app/{App.tsx,DropOverlay.tsx,DropOverlay.test.tsx,model/file-flows.ts}`, `src/shared/*`, `e2e/app-recent.spec.ts`, `e2e/app-instance.spec.ts`, `e2e/app-drop.spec.ts`, `e2e/shots/A15.shot.ts`

**Scope:** L

### Checkpoint X — nothing is lost (see the plan)

## A16: App and file icons

**Description:** IC1–IC3. `scripts/ico.mjs` (pure: `writeIco(pngs: { size, bytes }[]) →
Uint8Array`, `readIcoDirectory(bytes)`), `scripts/build-icons.mjs` (Playwright `chromium.launch()`,
renders `docs/mockups/shell/app-icon-small.svg` at 16–32 and `app-icon.svg` at 40–256, the same
for the file icon, writes `build/icon.ico`, `build/chalk-file.ico`, `build/icon.png` (256) and
`out/icons/*.png` for review), npm script `"icons": "node scripts/build-icons.mjs"`. Outputs
committed (replacing the Electron logo).

**Tests first:** `tests/tooling/app-icons.test.ts`: `writeIco` / `readIcoDirectory` round trip on
two tiny PNGs (header `0 0 1 0`, count, 16-byte entries, width byte 0 for 256, offsets, PNG
signatures); the committed `build/icon.ico` and `build/chalk-file.ico` list sizes 16, 20, 24, 32,
40, 48, 64, 256, every entry a PNG whose IHDR matches its size; `build/icon.png` is 256 × 256.

**Acceptance criteria:**
- [x] Tooling test passes; `npm run icons` reproduces the committed files byte for byte on the same machine (Linux, two runs, sha256 equal)
- [x] `out/icons/` PNGs look like A16 (tile `#2f6e60`, chalk-white glyph; small sizes without the ring) (app-256, app-16, file-48 looked at; 40 px uses the regular source per IC1/IC3, the A16 sheet draws no 40)

**Verification:** `npm run icons`, `npm run check`; open `out/icons/app-256.png`,
`app-16.png`, `file-48.png` next to `out/mockups-shell/A16-icons.png`. No in-app shot (icons are
native: window, taskbar, Explorer); the About box icon is checked in A17's packaged run and the
checklist.

**Dependencies:** None (any time before A17)

**Files:** `scripts/{ico.mjs,build-icons.mjs}`, `package.json`, `build/{icon.ico,chalk-file.ico,icon.png}`, `tests/tooling/app-icons.test.ts`

**Scope:** S

## A17: Installer build and packaged smoke test

**Description:** I1 (`electron-builder.yml` exactly), I2 (`scripts/build-notices.mjs` → committed
`build/THIRD-PARTY-NOTICES.txt`, npm script `notices`), Playwright project `packaged`
(`testMatch: /.*\.packaged\.ts/`), npm script `"test:packaged": "playwright test
--project=packaged"`, `e2e/packaged/app.packaged.ts` (launch
`dist/win-unpacked/Chalkbond.exe` with `_electron.launch({ executablePath })`). Record the
installer and unpacked sizes in the spec's I1 table. (The packaged run uses the real
`%APPDATA%\Chalkbond`: test flags are ignored by design; the test only reads and closes.)

**Tests first:** `tests/tooling/app-notices.test.ts`: every runtime dependency plus `react`,
`react-dom`, `scheduler` has its licence text in the notices file. `app.packaged.ts`: the window
title is `Untitled - Chalkbond`; `window.__chalkbondTest` is undefined even when launched with
`--chalkbond-test-hooks` (SEC12); the application menu has File, Edit, View, Help; the About
stub shows the `package.json` version; `process.resourcesPath` contains `THIRD-PARTY-NOTICES.txt`
and `icon.png`. A check of `dist/builder-effective-config.yaml`: `nsis.oneClick: true`,
`perMachine: false`, `fileAssociations[0].ext: chalk`, `icon: chalk-file.ico`, `publish: null`,
`electronLanguages: [en-US]`.

**Acceptance criteria:**
- [ ] `npm run dist:win` succeeds on Windows; `dist/Chalkbond-0.1.0-setup.exe` (version bumped in A20) exists and is between 50 and 200 MB
- [ ] `npm run test:packaged` green; the effective-config check passes; sizes written in the spec
- [ ] No install was needed for any of the above (installing is the checklist's job)

**Verification:** `npm run notices`, `npm run dist:win`, `npm run test:packaged`, `npm run check`.
No in-app shot (packaging).

**Dependencies:** A12 (About), A16

**Files:** `electron-builder.yml`, `scripts/build-notices.mjs`, `build/THIRD-PARTY-NOTICES.txt`, `package.json`, `playwright.config.ts`, `e2e/packaged/app.packaged.ts`, `tests/tooling/app-notices.test.ts`, `SPEC-app-shell.md` (sizes)

**Scope:** M

## A18: Accessibility pass for the new UI

**Description:** Both modules' new UI (Copy button, Export dialog, shortcuts dialog, primitives,
drop overlay, notices): names, roles, focus order (name field → options → Undo → Redo → Copy →
rail), visible focus rings, dialog focus trap and return, hit targets ≥ 24 px, contrast (V2),
`prefers-reduced-motion` disables the dialog fade, notices announced by the hint slot.

**Tests first:** `e2e/app-a11y.spec.ts`: Tab order from the name field reaches Copy right after
Redo; Copy, dialog buttons, radio cards, segments and the checkbox show an outline ≥ 2 px when
focused by keyboard (computed style); Tab inside the Export and shortcuts dialogs cycles within
them; every new control has an accessible name (`getByRole` with name) and a box ≥ 24 × 24;
with `reducedMotion: 'reduce'` the dialog has no transition; after a copy the hint slot
(`role="status"`) contains the notice.

**Acceptance criteria:**
- [ ] `e2e/app-a11y.spec.ts` green; fixes made in the components, not the tests
- [ ] Shots exist

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- A18` →
`A18/focus-copy.png` (scripted: Tab from Redo: Copy with a 2 px accent ring offset 2 px, A03's
focus cell), `A18/focus-export-card.png` (Ctrl+E: PNG card ring as A08a).

**Dependencies:** C12, A15

**Files:** `e2e/app-a11y.spec.ts`, `e2e/shots/A18.shot.ts`, component fixes in `src/renderer/{app,clipboard-export}/**`

**Scope:** S

## A19: app-shell coverage thresholds

**Description:** `vitest.config.mts` thresholds: `src/main/model/**` and
`src/renderer/app/model/**` at 90 % lines, no exclusions; add tests where short.

**Tests first:** the thresholds themselves.

**Acceptance criteria:**
- [ ] `npm test -- --coverage` passes with the new thresholds (and C13's)
- [ ] No file added to `coverage.exclude`

**Verification:** `npm test -- --coverage`, `npm run check`

**Dependencies:** A18, C13

**Files:** `vitest.config.mts`, tests under `src/main/model/`, `src/renderer/app/model/`

**Scope:** S

## A20: Docs, Windows checklist, version 1.0.0

**Description:** `docs/windows-checklist.md`: section "App shell and installer" with the spec's
"Windows checks" (C13 added "Clipboard and export"), unticked; a "Checkpoint Z — release" header
saying what to run. `AGENTS.md`: status table (clipboard-export done, app-shell done), module notes
for both (probes and `formats.ts`, payload rule, main imports no core, refs not paths, test hook
and user-data flags, `e2e/win/`, `stub-dialogs.mjs`, menus as data), commands (`npm run icons`,
`npm run notices`, `npm run dist:win`, `npm run test:packaged`), "Next" replaced by "Maintenance".
`README.md`: install (download the setup, SmartScreen **More info** → **Run anyway**), first use
(draw, Copy, paste into PowerPoint, Save, Export, recovery after a power cut), building from
source (including the one-time NSIS download). `CAPABILITY-MAP.md` build order: all done.
`SPEC.md` Decisions Log row for the release. `package.json` version `1.0.0`; rebuild the installer
once and update the size row. Sweep both specs' success criteria into the plans' coverage tables.

**Tests first:** none (docs); the release checkpoint commands are the gate.

**Acceptance criteria:**
- [ ] Checklist sections present and unticked; every human-only SC of both specs appears in them
- [ ] AGENTS.md, README.md, CAPABILITY-MAP.md, SPEC.md updated; version 1.0.0; `dist/Chalkbond-1.0.0-setup.exe` built
- [ ] Both plans' SC tables point every criterion at a passing test, a shot or a checklist item

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots`, `npm run dist:win`,
`npm run test:packaged`

**Dependencies:** A17, A19, C13

**Files:** `docs/windows-checklist.md`, `AGENTS.md`, `README.md`, `CAPABILITY-MAP.md`, `SPEC.md`, `SPEC-app-shell.md`, `package.json`, `package-lock.json`, `tasks/plan-*.md`, `tasks/todo-*.md`

**Scope:** S

### Checkpoint Z — release (see the plan)

## Corrective verification before C5/C6 (2026-11-10)

Owned corrections only; no checkpoint status changed.

- [x] Drag: profiled repeated status chemistry; deterministic regression red (91 calls versus
  one), green after caching all three stable inputs. Targeted performance e2e 5/5. Details in
  `docs/editor-perf.md`; no public API change.
- [x] A6 no-actions layout: restored the original clamp assertion, ran red at 960 (204 actual,
  249 expected), removed the unconditional `.app .namefield` media rule. Existing editor
  `.topbar.has-actions` compact rule remains. Layout and keyboard e2e 24/24; A6 shots 2/2,
  inspected at 1280 and 960: all ten tools and Text caption visible, existing positions retained.

Isolated full `npm run test:e2e`: exit 0, 189/189; whole-fragment n=91, median 8.3 ms,
p95 9.8 ms; bond preview p95 11.6 ms; partial selection p95 5.4 ms; commit p95 40.8 ms;
cold start 419 ms. No concurrent check, coverage or performance process.
Logs: `/tmp/chalkbond-checkpoint-fixes-1ApUoY/`; screenshots: `out/shots/A6/untitled.png`
and `out/shots/A6/untitled-960.png`. Windows remains unverified.
