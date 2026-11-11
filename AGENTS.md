# AGENTS.md

Instructions for any coding agent working in this repo. People can read it too.

## Project

Chalkbond is an offline Windows desktop app (Electron, React, TypeScript) for drawing chemical
structures and reaction schemes for teaching, aimed at a grade 11-12 chemistry teacher in Nepal.
It is built as modules with a strict dependency order; the pure modules live in `src/core`.
The product spec is `SPEC.md`; the module list is `CAPABILITY-MAP.md`. Module ids are stable.

| Order | Module | Depends on | Status |
|---|---|---|---|
| 1 | `doc-model` | none | done |
| 2 | `chem-core` | doc-model | done |
| 3 | `svg-render` | doc-model, chem-core | done; automated Windows checks passed 2026-11-11; Office checks in `docs/windows-checklist.md` still unticked |
| 4 | `editor` | doc-model, chem-core, svg-render | done; "Editor" checks in `docs/windows-checklist.md` still unticked |
| 5 | `clipboard-export` | doc-model, svg-render | implemented; automated Windows gates passed 2026-11-11; human checks open (`docs/windows-checklist.md`) |
| 6 | `app-shell` | all | implemented; automated Windows gates passed 2026-11-11; human checks open (`docs/windows-checklist.md`) |

Version 1.0.0 is prepared in `package.json`; the release is pending Checkpoint Z on a Windows
machine (`docs/windows-checklist.md`). Everything was built on Linux; on 2026-11-11 the automated
Windows gates passed at `956a4a4` (check, e2e with `e2e/win`, os-input, `dist:win`, packaged smoke
test, shots). The installer was installed on the development machine on 2026-11-11 and the
installed size is written (`SPEC-app-shell.md` I1). In "Clipboard and export" the paste and export
round trips passed on the development machine (Office 2016 Click-to-Run Version 2610; run by a
computer-use agent, verified by the orchestrator): nine of the twelve human boxes are ticked. Open
there: a `CO₂H` label, a chat-app paste, and the PDF in Edge, in Adobe Acrobat Reader and on paper.
Open elsewhere: all of "App shell and installer" except the first box, the clean Windows 10 and 11
installs with SmartScreen, and Checkpoints K, E32 and R. The release is not declared.

## Workflow

1. `CAPABILITY-MAP.md` lists the module. Specify first: write `SPEC-<module>.md` and get it
   approved before any code. Copy the structure of `SPEC-svg-render.md`.
2. Plan: `tasks/plan-<module>.md` (format: `tasks/plan-svg-render.md`) and
   `tasks/todo-<module>.md` (format: `tasks/todo-svg-render.md`).
   The doc-model plan and todo are the older `tasks/plan.md` and `tasks/todo.md`.
3. Implement one task at a time, test first. A task in the todo has Description, Tests first,
   Acceptance criteria (checkboxes), Verification, Dependencies, Files, Scope.
4. Done means acceptance criteria ticked and `npm run check` green. One commit per task.
5. Checkpoints (after each phase and at module end): `npm run check` green, tick the boxes,
   commit, push. Windows-only manual checks go in `docs/windows-checklist.md`.
6. If a decision changes, update the spec first, then the code. Add notable decisions to the
   Decisions Log table in `SPEC.md`.

## Commands

```
npm install
npm run dev               # electron-vite dev
npm run check             # typecheck && lint && format:check && test
npm test                  # vitest run (all three projects)
npm test -- --coverage    # coverage report; perf timings are skipped
npm run test:e2e          # electron-vite build, then playwright test
npm run test:e2e:os-input  # opt-in: the one test that moves the real mouse cursor (Windows only; not in test:e2e)
npm run golden:sheet      # out/golden-sheet.html; add -- --png out/sheet.png for PNGs
npm run shots             # electron-vite build, then e2e/shots/*.shot.ts -> out/shots/<task>/<name>.png
npm run shots -- E21      # (playwright args pass through; or: npx playwright test --project=shots e2e/shots/E21.shot.ts)
node docs/mockups/editor/build.mjs --png out/mockups   # the approved mock-up PNGs to compare shots with
npx vitest run --project perf                          # editor and core perf budgets alone
npx playwright test --project=e2e e2e/editor-perf.spec.ts   # frame-time probe (needs a build)
npm run build             # out/
npm run icons             # regenerate build/icon.ico, build/chalk-file.ico, build/icon.png (deterministic)
npm run notices           # regenerate build/THIRD-PARTY-NOTICES.txt from the runtime dependencies
npm run dist:win          # electron-vite build, then the NSIS installer -> dist/Chalkbond-<version>-setup.exe (Windows; downloads the NSIS toolset once)
npm run test:packaged     # smoke test of the unpacked packaged app (not in test:e2e, shots or check)
```

Linux development check of packaging (not a release gate): `npx electron-vite build`, then
`npx electron-builder --linux dir` run **from a terminal** (electron-builder writes
`dist/builder-effective-config.yaml` only when its output is a terminal and `CI` is unset; without
a terminal use `script -qec "npx electron-builder --linux dir" /dev/null`), then
`npm run test:packaged` (it launches `dist/linux-unpacked`). On Windows the test launches
`dist/win-unpacked/Chalkbond.exe` and uses the real `%APPDATA%\Chalkbond`.

`npm run check` runs `typecheck` (four tsc projects: node, web, core, tooling), `eslint .`,
`prettier --check .` and `vitest run`. It does not run e2e, coverage or `golden:sheet`.
Prettier ignores `*.md`. Style: single quotes, 100 columns, named exports only.

Vitest projects (`vitest.config.mts`):

- `unit`: `src/**/*.test.{ts,tsx}` and `tests/**/*.test.ts`, except the two groups below.
- `perf`: `src/**/perf.test.ts`. Runs after unit, one file at a time. Timing medians read about
  3x slower when run beside other files. Timing assertions are skipped under `--coverage`.
- `tooling`: `tests/tooling/**`. Runs last, one file at a time, 60 s timeout. ESLint probes and
  child processes have a slow cold start and failed under parallel load.

## Hard rules

- `src/core/*` is pure: no DOM, no Electron, no Node APIs, no `react`. Functions take values and
  return values or strings. `tsconfig.core.json` has no DOM lib and no Node types.
- Import boundaries are ESLint `no-restricted-imports`, generated from `CORE_DEPS` in
  `eslint.config.mjs` (keep it in sync with `CAPABILITY-MAP.md`) and proven by
  `tests/tooling/lint-boundaries.test.ts`. Only `src/core/chem-core/ocl.ts` imports `openchemlib`.
  Core modules import each other through the public `index.ts` only.
- Never weaken the bar: no `eslint-disable`, `@ts-ignore`, `any`, skipped or `.only` tests, lowered
  coverage targets or perf budgets, deleted assertions. Fix the cause. If a rule is wrong, ask.
- Do not change a finished module's public surface (exports, types, file schema) without
  updating its spec first. Adding a `DrawObject` variant, an `Atom` field or a `StyleSettings`
  field is a schema bump and needs approval ("Ask first" in the specs).
- No network at runtime, no telemetry. New dependencies need approval; versions are pinned exactly.
- Commits are conventional: `feat(module): S5 short subject`, `fix(module): ...`,
  `test(module): ...`, `docs: ...`. See `git log --oneline`. Do not push unless asked.
- Coverage targets (specs, enforced as thresholds in `vitest.config.mts`): `core/*` at least 90 % lines
  (doc-model 95 %; `core/clipboard-export` 90 %), `renderer/editor` 70 %,
  `renderer/clipboard-export/model`, `src/main/model` and `renderer/app/model` 90 %.

## Module notes

### doc-model

- Every edit goes through its operations; `Doc` is JSON-serializable (no Map, Set, class).
- Coordinates are bond-length units (BLU), y down. Ids are branded strings.
- Ops are draft-aware (Immer) so `transact` records fine-grained patches. `History` takes an
  injectable clock. Undo restores `nextId`, so an undone id can be reissued; callers drop ids.
- The `.chalk` Zod schema is strict: unknown keys are rejected and any new field bumps
  `schemaVersion`. No chemistry rules here.

### chem-core

- The only chemistry module. OpenChemLib objects never leave it. It never reads files or the network.
- Keeps its own valence table for common organic elements; OCL decides only outside it.
- Aromatic rings are stored as all-1.5 bonds (circle-in-ring); Kekulé form is a toggle.
- Dictionary `resources/compounds/compounds.json` is generated by `scripts/build-compounds.mjs`
  (dev-time, PubChem). The app imports the JSON and passes it to `createNameIndex`.
- Library-fact tests pin OCL 9.25.2 behaviour; re-run them before upgrading OCL
  (`ocl-facts.test.ts`, plus the aspirin timing fact in the serial `perf.test.ts`).
- Bad user input returns `ChemError` or a result value; it must not crash.

### svg-render

- Output must be byte-identical on every machine. ESLint bans in `src/core/svg-render`:
  `Math.pow`, `hypot`, `exp`, `log`, `tan`, `random`, `**`, `Date`, `Intl`, `localeCompare`,
  `toLocaleString`. Every number goes through `fmt` (max 3 decimals, no exponent, no `-0`).
- User text only ever lands in `<text>` nodes. Elements and attributes come from allow-lists.
- Goldens: `src/core/svg-render/__golden__/<scene>.<preset>.svg`, checked with
  `toMatchFileSnapshot`, committed with LF endings (`.gitattributes`; a tooling test checks).
  Inputs are frozen `.chalk` files in `__golden__/inputs/`.
- Never re-record goldens (`npm test -- -u`) to make a test pass. Read the diff, understand why
  it changed, and confirm the change is intended. A rendering change needs a visual look:
  run `npm run golden:sheet -- --png out/sheet.png` and open the PNGs.
- Text widths come from the committed table `src/core/svg-render/font-metrics.ts`, generated by
  `node scripts/build-font-metrics.mjs <regular.ttf> <bold.ttf>` (Liberation Sans or Windows
  Arial). Do not edit it by hand; it is excluded from Prettier and coverage.
- `e2e/font-calibration.spec.ts` checks the table and text ink boxes against real text rendering
  in Electron's Chromium (real Arial on Windows). Fix box errors in the renderer, not the tolerance.
- Valence warnings, selection and hit-testing are not drawn here; the editor overlays them.
- Property 5 (`svg-render.prop.test.ts`) compares `bounds` with doc-model's hull of the drawn items;
  keys whose geometry is not ink are left out of that oracle (callout anchor, hash bond, caption on
  atoms without ink). Fix such a failure in the oracle only when the scene's ink is right.

### editor

- Spec `SPEC-editor.md` (Decisions table: rows 1-16 the orchestrator's, R1-R40 the reviewer's and
  the fixes found while building). Read the Decisions before changing a behaviour; update the spec
  first. Plan and todo: `tasks/plan-editor.md`, `tasks/todo-editor.md` (E1-E34).
- `src/renderer/editor/{model,tools,state}` are pure: no DOM, no React, no `Date`, no timers (an
  ESLint block plus a tooling probe; the clock is injected). `view/` is thin React; DOM-only
  helpers (`text-dom.ts`, `use-canvas-input.ts`, `press.ts`) live there. Core is imported through
  `@core/<module>` only; never `openchemlib`.
- A tool is a state machine: `step(gesture, CanvasEvent, ToolContext) -> ToolStep` (idle, press,
  drag past 4 px, release). A `ToolStep.commit` is `{label, recipe, select?, coalesceKey?}`; the
  reducer runs the recipe in **one `transact`** = one undo step. Esc, right button, capture loss
  and blur send `cancel`: no commit, no history entry.
- Previews (ghosts, drag feedback) run the same recipe on the committed doc outside `transact`
  (plain ops on a frozen doc). Ids come from `nextId`, so a preview's ids equal the commit's;
  `added` keys mark ghost parts. Never put a preview in history.
- Inside `transact` the doc is an Immer draft: use the draft-aware ops, never spread or clone
  `doc.atoms`; a recipe that returns a fresh object breaks the fine-grained patches.
- Empty-state and ghost rules (R30): the empty state shows only when the doc is empty, no gesture
  runs and no preview exists, and while the doc is empty no tool draws a hover ghost. Hover rules
  HV4/HV5 (R27, R32) are in the spec; the pure `emptyStateVisible` and `overlay.ts` decide them.
- Text and label editing is model-first: `text-edit.ts` is a pure editing model (runs, caret,
  local undo); the `contenteditable` is a projection re-rendered from it, IME reconciled on
  `compositionend`. `finishText` formats on commit only characters the user did not format.
- `docs/mockups/editor/{tokens.css,icons.svg}` are normative; `view/tokens.css` (after its leading
  comment) and `view/icons.svg` must stay byte-identical copies (`tests/tooling/editor-tokens.test.ts`).
  `editor.css` uses tokens only (no raw colour, no px other than 1 px). Contrast pairs and every
  colour pair `editor.css` uses are checked there.
- Shots: `e2e/shots/E<n>.shot.ts` write `out/shots/E<n>/<name>.png` at 1280x800 (`harness.shot`);
  they are for looking at (compare with `out/mockups`); measurable checks are DOM boxes in
  `e2e/editor-*.spec.ts`. Look at the PNGs after any visual change.
- e2e seams (`e2e/harness.ts`): `openApp`, `insertName`, `canvasPoint`, `readDocument`,
  `loadDocument`; `data-testid`s on every control; `data-key` on parts; `data-layer="content"`
  carries the viewport transform. `loadDocument`, `readDocument`, `readSelection`, `listenEvents`,
  `heardEvents`, `heardNotices`, `heardCommands` use the test hook `window.__chalkbondTest`
  (`src/renderer/app/model/test-hook.ts`). Main enables it only for an unpackaged build started with
  `--chalkbond-test-hooks`; `launchApp` always passes it (`{ testHooks: false }` launches without),
  with a fresh `--chalkbond-user-data` temp folder per launch (`{ userData }` reuses one) and
  `{ dialogs: [...] }` scripts `dialog.showMessageBox/showOpenDialog/showSaveDialog` in order
  (`e2e/stub-dialogs.mjs`; calls are logged on `globalThis.__chalkbondDialogLog`). Windows-only
  specs go in `e2e/win/` (ignored on other platforms by `testIgnore`).
- The accessibility facts are tested, not assumed: `e2e/editor-a11y.spec.ts` (keyboard walkthrough,
  focus rings, names, hit targets, reduced motion) and `editor-keyboard.spec.ts` (tab order, K4).
- Coverage: `vitest.config.mts` enforces 70 % lines for `src/renderer/editor/**` under
  `--coverage`; timing assertions are skipped there (`CHALKBOND_COVERAGE`), including the
  chem-core aspirin timing (`perf.test.ts`). Never exclude a file to reach the number.
- Perf: budgets and measurements in `SPEC-editor.md` "Performance" and `docs/editor-perf.md`;
  `src/renderer/editor/perf.test.ts` and `e2e/editor-perf.spec.ts`. A miss means a request for
  svg-render's `createRenderer` (spec first), never a looser budget or timeout. Never raise a
  timeout to get green: find what is slow.
- Preset segments are 64x24 (editor R41), so every status-bar control meets the 24 px hit target;
  `--border-control` is `#79818c`, 3 : 1 or better on rest, hover and pressed (R42). Both are
  asserted in `editor-tokens.test.ts` and `editor-a11y.spec.ts`.
- Host seam additions (R44-R49): the `actions` slot after Redo, `notify` and the `busy` event,
  right-click on an unselected item selects it first, `focus-name-field` is host-callable
  (`canRun` is true when no label or text editor is open; `run` records a focus request and the
  view moves DOM focus; R47), IME blur defers the commit to `compositionend` (R48), and "Zoom to
  100%" sets zoom 1 (R49, superseding R12).

### clipboard-export

- Spec `SPEC-clipboard-export.md`. Pure code in `src/core/clipboard-export` (payload, picture, PNG
  `tEXt` and `pHYs` chunks, SVG metadata, PDF incremental update, paste decision, names); depends
  on doc-model and svg-render only. Main code in `src/main/clipboard-export` (`clipboard.ts`,
  `formats.ts`, `pdf.ts`); renderer in `src/renderer/clipboard-export` (Copy button, Export dialog,
  `rasterise.ts`, pure flows in `model/`).
- The drawing travels as one compact ASCII `.chalk` string (`drawingPayload`, X5) in every carrier:
  clipboard entry, PNG `tEXt`, SVG `<metadata>`, PDF stream. It is read back only by `parse`.
  The editable payload stays within `MAX_FILE_BYTES` (20 MiB); a picture carrier may be up to
  `MAX_PICTURE_BYTES` (64 MiB) (C9).
- `src/main/clipboard-export/formats.ts` names the clipboard keys (CB-W1): the bitmap
  `image/png`, the raw SVG key and the raw drawing key, verified by the C3 probes on Windows
  (2026-11-11, Decision R9; `e2e/win/clipboard-facts.spec.ts`). There is no exact-PNG entry and no
  fallback key. The raw SVG key is reported by Electron as plain `image/svg+xml`, so never check it
  with `has(rawKey)`. Never choose keys from Linux observations.
  The PDF probes P8 and P9 (`e2e/pdf-facts.spec.ts`) run on Linux (outcome PDF-A).
- Rasterising happens in the renderer (SVG, `<img>`, `<canvas>`, `toDataURL`, X10, C11); the PDF is
  printed in main and embedded in the renderer (R2), so main imports no core (app-shell SEC9).
  No new dependency (X11).
- Ctrl+C / Ctrl+V / Ctrl+X in a text target are never handled here (R4); pasting the editor's own
  last copy follows the generation rule (C8, CB-P1). `onCopy` bumps the generation synchronously.

### app-shell

- Spec `SPEC-app-shell.md` (Decisions O1-O9, A-rows, R1-R26); mock-ups `docs/mockups/shell/`
  (`shell-tokens.css`, `shell-icons.svg` are normative; the lifted copies in `src/renderer/app/`
  stay separate from the editor's, R12). Plan and todo: `tasks/plan-app-shell.md`,
  `tasks/todo-app-shell.md` (A1-A20).
- Folders: `src/main` (Electron main), `src/preload` (imports only `electron` and
  `src/shared/channels`), `src/shared` (channel names, IPC types, the menu rules in `menu.ts`),
  `src/renderer/app` (the host that owns the editor controller). `src/main/model` and
  `src/renderer/app/model` are pure (no `electron`, no Node built-ins, no DOM, no timers; ESLint
  and `tests/tooling/app-lint.test.ts`), unit-tested at 90 % lines. The renderer imports the editor
  only through its `index.ts`.
- Main imports no `src/core` module (SEC9). Every IPC channel goes through one `handle()` wrapper
  that checks the sender frame, validates with Zod and logs (SEC5, SEC6, `src/main/ipc.ts`).
- The renderer never holds a path: files are opaque refs (`FileRef`); a dropped file's path is read
  inside the preload (R8, SEC14); native dialog texts come from main's message table.
- Menus and native boxes are data: the pure menu model and message table are asserted in unit
  tests, and e2e stubs `dialog` and `Menu.prototype.popup` and reads what Electron received. Menu
  items never register accelerators and carry no `role` (M2, R1); the renderer owns all keys.
- Test hook and flags (TH1, R9): `window.__chalkbondTest` exists only for an unpackaged build
  started with `--chalkbond-test-hooks`; `--chalkbond-user-data=<dir>` isolates settings, recovery
  and the single-instance lock; both are ignored when packaged. `e2e/launch.ts` passes them (and a
  fresh temp folder) on every launch; `e2e/stub-dialogs.mjs` scripts native dialogs in order.
  Windows-only specs live in `e2e/win/` (`testIgnore` on other platforms, R10); nothing is skipped.
- Every e2e file from A3 on ends by asserting `__chalkbondTestMain.blockedRequests === 0` (SC10).
- Settings, the recovery file and logs live in `%APPDATA%\Chalkbond`. Recovery is at most 10 s
  behind (O5); at a Windows session end main asks for a best-effort flush only (R5, R24, R25).
- Packaging: `electron-builder.yml` (spec I1: NSIS one-click, per user, unsigned, `publish: null`).
  `build/icon.ico` and `build/chalk-file.ico` are generated by `npm run icons` without a new
  dependency; `build/THIRD-PARTY-NOTICES.txt` by `npm run notices` (checked by
  `tests/tooling/app-notices.test.ts`). Do not change them by hand.

## Gotchas

- Run `npm run check` on its own, in the foreground. Do not pipe it or chain it into the commit
  command; read its exit code and summary first.
- Property tests (fast-check) use random seeds, so one green run is not proof. A failure prints a
  seed; reproduce with `fc.assert(..., { seed })`. Add the counterexample as a fixed regression
  test. Do not remove the property or lower `numRuns`.
- ESLint-probe tooling tests are slow on a cold start. They run as the `tooling` project; leave
  them there.
- `npm run test:e2e` builds first and launches Electron (`--project=e2e` only; `shots` is its own project). `golden:sheet -- --png` needs
  Playwright's Chromium: run `npx playwright install chromium` if it is missing.
- E2E windows are real OS windows. Every launch must go through `e2e/launch.ts`, which preloads
  `e2e/no-os-mouse.mjs` so the physical cursor cannot send real pointer events into a test window
  and cancel a synthetic hover. `e2e/no-os-mouse.spec.ts` (default project) asserts, through the
  guard's registry on `globalThis`, that every window was made ignore OS mouse input. The test that
  moves the real cursor, `e2e/os-input/os-mouse.spec.ts`, is its own Playwright project `os-input`
  (`npm run test:e2e:os-input`, Windows only, not part of `test:e2e` or `shots`): run it by hand
  when you change the guard, and do not touch the mouse while it runs.
- Put temporary files and logs in the OS temp directory, never in the repo root or the drive
  root. `out/`, `coverage/`, `test-results/` and `dist/` are git-ignored.
- Keep the project green on Windows and Linux: no POSIX-only syntax in npm scripts and LF line
  endings (`.gitattributes`). `e2e/launch.ts` has a Linux branch.

- A coverage or test run that seems to hang with one busy worker is usually a failed property test
  shrinking (fast-check). Wait, or rerun that file with the verbose reporter
  (`npx vitest run --project unit <file> --reporter=verbose`); the failing seed is printed.
- `npm run test:packaged` launches a packaged app, which ignores `-r`: the OS-mouse guard cannot be
  loaded into it, so that test sends no pointer input and asserts nothing about hover. It needs a
  prior `electron-builder` build (`dist/win-unpacked` or, on Linux, `dist/linux-unpacked`), and it
  reads the version from `package.json`, so rebuild after a version change.
- Windows session-end behaviour (R24, R25: no prompt, best-effort recovery flush, the close guard
  after a cancelled shutdown) is proven on Linux only as guard logic with synthetic
  `query-session-end` / `session-end` events. A real shutdown, a cancelled shutdown and IME are
  Windows checklist items. Windows 11's Notepad does not ask before closing, so it is no test
  subject for a cancelled shutdown.
- On Windows Playwright starts Electron through a shell, so `app.process()` is the wrapper. A test
  that must kill the app takes `process.pid` from inside the app (see `drawThenKill`).
- `e2e/app-settings.spec.ts` launches without `--force-device-scale-factor`, so window sizes there
  run at the real display scale (125 % on the dev laptop); pixel-exact claims must hold at it.

## Maintenance

All six modules are implemented. The automated Windows gates (Checkpoint Z steps 1-7) passed on
2026-11-11 at `956a4a4`: `npm run test:e2e` including `e2e/win/` (321), `npm run test:e2e:os-input`,
the C3 clipboard probes (keys decided, Decision R9), `npm run dist:win`, `npm run test:packaged`
and `npm run shots`. Step 8 is done: installer, unpacked and installed sizes are in
`SPEC-app-shell.md` I1. Step 9 (the human sections) is in progress: nine of the twelve human
"Clipboard and export" boxes (paste, restart round trip, PNG, SVG and PDF export and reopening, on
the development machine) and the first "App shell and installer" box are ticked. What is open: a
`CO₂H` label, a chat-app paste, the PDF in Edge and Acrobat Reader and on paper; the other "App shell
and installer" boxes; the clean-account installs and SmartScreen; and Checkpoints K, E32 and R.
Version 1.0.0 is not declared released until they pass.

- Windows gates still open: clean-account installs and SmartScreen, IME, shutdown, display scaling,
  Office checks for svg-render (Checkpoint K), Edge and Acrobat Reader for the PDF export and the
  other human checks in the checklist, on Windows 10 and 11.
- Change a behaviour: read the Decisions tables of the module's spec, update the spec first, then
  the code and tests. Decisions of later dates supersede older text anywhere (including this file).
- A bug found in a finished module: add a failing regression test first. A property-test failure
  prints a seed: reproduce with it, fix the cause, and add the counterexample as a fixed test.
