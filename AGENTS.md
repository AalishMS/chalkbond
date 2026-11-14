# AGENTS.md

Instructions for any coding agent working in this repo. People can read it too.

## Project

Chalkbond is an offline Windows desktop app (Electron, React, TypeScript) for drawing chemical
structures and reaction schemes for teaching, aimed at a grade 11-12 chemistry teacher in Nepal.
It is built as modules with a strict dependency order; the pure modules live in `src/core`.
The product spec is `SPEC.md`; the module list is `CAPABILITY-MAP.md`. Module ids are stable.

| Order | Module | Depends on | Status |
|---|---|---|---|
| 1 | `doc-model` | none | done; D2 (the serialisable undo record, `historyToRecord` / `historyFromRecord`) added 2026-11-12 for the tabs feature set |
| 2 | `chem-core` | doc-model | done |
| 3 | `svg-render` | doc-model, chem-core | done; automated Windows checks passed 2026-11-11; Office checks (Checkpoint K) ticked 2026-11-12 from the owner's hand checks (Office 2016) |
| 4 | `editor` | doc-model, chem-core, svg-render | done; Checkpoint R ticked 2026-11-12 from the owner's hand checks ("Pen or touch" not applicable: the teacher uses mouse or touchpad only); feature set of 2026-11-12 implemented, automated gates passed at `e34414b`; tabs seam (R56-R59: host slots, per-tab state, `replace-doc`, moved keys) implemented 2026-11-12, TB35 automated gates passed at `5d6b268`; E32 open (teacher's laptop) |
| 5 | `clipboard-export` | doc-model, svg-render | implemented; automated Windows gates passed 2026-11-11; all human boxes ticked 2026-11-12 from the owner's hand checks (`docs/windows-checklist.md`) |
| 6 | `app-shell` | all | implemented; automated Windows gates passed 2026-11-11 and again at `e34414b` (feature set); 16 of 17 human boxes ticked 2026-11-12 from the owner's hand checks and answers; open: cold start on the teacher's laptop, and the owner's hand re-checks on the final installer (`docs/windows-checklist.md`); tabs, auto-save and the session store implemented (tasks TB1-TB35 done 2026-11-14, `tasks/todo-tabs.md`; TB35 gates passed at `5d6b268`) |

Version 1.0.0 is prepared in `package.json`; the release is pending Checkpoint Z on a Windows
machine (`docs/windows-checklist.md`). Everything was built on Linux; on 2026-11-11 the automated
Windows gates passed at `956a4a4` (check, e2e with `e2e/win`, os-input, `dist:win`, packaged smoke
test, shots). The installer was installed on the development machine on 2026-11-11 and the
installed size is written (`SPEC-app-shell.md` I1). In "Clipboard and export" the paste and export round trips passed on the development machine on
2026-11-11 (Office 2016 Click-to-Run Version 2610; run by a computer-use agent, verified by the
orchestrator). On 2026-11-12 the owner ran a numbered list of 31 checks by hand with the installed
1.0.0 on the development machine and reported "everything works well. the tests pass." (all 31 run,
details not reported per item, not watched by the orchestrator). That ticked every human box of
"Clipboard and export", Checkpoint K, Checkpoint R except "Pen or touch", and 15 of the 17 boxes of
"App shell and installer". The owner's written answers the same day ticked "Shutdown right after an
edit" ("Yes, it was there": the last change was recovered) and "Pen or touch" (not applicable: the
teacher uses mouse or touchpad only, not run). Open from those checks: on the teacher's laptop,
Checkpoint E32 and the cold-start box. Finding: the clipboard bitmap is
transparent with black ink and is barely visible pasted into a dark-mode chat app (Discord; Decision
X3), to be decided in the 2026-11-12 feature set. The owner decided on 2026-11-12 to add features
before the release; the human checks they touch will be repeated on the final installer. Owner
decisions 2026-11-12: the human checks run on Windows 11 only (Windows 10 waived, so untested by
hand for 1.0.0); the Office on the development machine (Office 2016) is accepted for the Office
checks; the teacher's-laptop checks (the cold start box and E32) are open because the development
machine is not that laptop. The release is not declared.

The feature set of 2026-11-12 (number keys for the tool rail, the structural formula display, the
white-backed clipboard bitmap; `tasks/todo-features-2026-11.md` N1-N14) is **implemented** and its
automated gates passed at `e34414b` on Windows 11 (2026-11-12): `npm run check` (239 files, 4606
tests), `npm run test:e2e` (342 passed), `npm run test:e2e:os-input`, `npm run dist:win`,
`npm run test:packaged` (8 passed) and `npm run shots` (105 passed, looked at against the
mock-ups). The release is **not declared** and Checkpoint Z is **not reached**. Open: the owner's
hand re-checks on the final installer (the unticked boxes of "Re-checks after the 2026-11-12
feature set" in `docs/windows-checklist.md`, including the installed size), and, on the teacher's
laptop, Checkpoint E32 and the cold-start box. **No Linux support** (owner decision 2026-11-14): the
Linux re-runs are waived and no Linux run is a gate. Copy timing on Windows (`docs/editor-perf.md` has the
earlier 66.9 ms): median 62.1 ms at `e34414b` (budget 500 ms). Known limitations and review notes:
the `SPEC.md` Decisions Log (2026-11-12).

The **tabs, auto-save and session feature set** (approved by the owner 2026-11-12; tasks TB1-TB35 in
`tasks/todo-tabs.md`, plan `tasks/plan-tabs.md`; specs `SPEC-app-shell.md` "Tabs, auto-save and
session" T1-T18, AS1-AS9, SS1-SS12 and Decisions R30-R51, `SPEC-editor.md` R56-R59,
`SPEC-doc-model.md` D2) is **implemented**: TB1-TB35 are done (finished 2026-11-14; most code landed
2026-11-12 and 2026-11-13). One window holds several drawings as tabs; a `.chalk` file saves itself;
drawings without a file live in the session store; closing the app never prompts and the next start
brings everything back; the native menu bar is a ☰ button; the keys follow Chrome. **TB35 passed on Windows 11 at `5d6b268` (2026-11-14): check 261 files / 5422 tests, coverage thresholds, full e2e 422, os-input 1, installer, packaged 10, shots 119.** Results and the corrected A10 shot race are in `SPEC.md`. Hand checks and the teacher-laptop boxes remain open (Linux rerun waived 2026-11-14); the release is not declared. Two owner
questions are open and undecided (`tasks/todo-tabs.md` checkpoint): the `tidy.prop.test.ts` 5 s default
under machine load, and the open-request limit ("20 waiting" or 20 files in total); so are the TB32
mock-up differences (`SPEC-app-shell.md` TH9).

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

Linux development check of packaging (Linux is not supported, owner decision 2026-11-14; kept for reference only): `npx electron-vite build`, then
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
- Schema v2 (D1) adds the optional `style.formula: 'structural'`. `serialize` writes the lowest
  version that holds the document: v1 (byte-identical to before) when `formula` is absent, v2 when
  it is set. A file is validated with its **own** version's strict schema, then migrated; a
  version above 2 is `newer-version`. A skeletal drawing has no `formula` key at all
  (`setStyle(doc, { formula: 'skeletal' })` leaves it undefined).
- D2 (tabs, 2026-11-12): `historyToRecord(h, { maxSteps })` and `historyFromRecord(value, { clock? })`
  (`history-record.ts`) turn the opaque `History` into a JSON record (the current drawing as a
  `serialize` string plus the newest `maxSteps` undo steps; redo steps, `openKey` and the clock are not
  kept) and back. Restoring verifies every step from the current drawing backwards (inverse applied,
  strict schema, `checkInvariants`, and the patches must redo the drawing exactly); the first bad step
  is dropped with every older one (`dropped`), so a damaged history never costs the drawing. Only
  `file` failing is an error. `History` stays opaque, `HISTORY_DEPTH` stays 500; no schema change.
  Budgets: 150 ms for 100 steps of a 500-atom drawing, 30 ms for the scheme fixture (`perf.test.ts`).

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
- Structural formula (Decisions 15 and 16): `style.formula: 'structural'` writes carbons outside
  rings with the existing label rules (`isLabelled` takes the formula and a ring flag; `ringAtoms`
  finds ring members iteratively) and draws rings as in skeletal mode. Layout: every coordinate is
  turned into pt by **`ptPerBlu`** (`bondLength`, or `STRUCTURAL_SCALE` = 2 times it when
  structural), never by `bondLength` directly; label size, line widths and other decorations stay
  at the style's size. S2 (answered B): atom-anchor offsets and a condition text's offset are drawn
  at `x bondLength`, not `x ptPerBlu`. The **Decision 16 oracle** (coordinates doubled, written
  carbons given their explicit H) is what the tests compare a structural render with, bit for bit.
  13 structural scenes x 2 presets are goldens (39 files added, no pre-existing golden changed:
  `git diff --stat 628ea2b -- src/core/svg-render/__golden__` shows only added files), and
  `structural-legibility.test.ts` asserts L1 (visible length of a bond with a written end), L2
  (no two labels closer than half the font size) and L3 (no bond skipped). Never re-record a
  skeletal golden to make a structural change pass.
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
- Number keys (R50): `1`-`9`, `0` pick the ten rail tools in rail order; the table is
  `state/catalog.ts` (rail badges, `aria-keyshortcuts` and the two-key tooltips read it). A digit
  works under the conditions of the tool's letter (canvas focused, no label or text editor, no
  Ctrl/Alt/Meta, Shift ignored, `KeyboardEvent.key`, number pad included). Exception: where hover
  keys are active (an atom or bond under the pointer), `1`-`3` keep their R5 meaning (bond
  orders); the other digits still pick tools.
- Formula switch (R51-R55): `toggle-formula` is one `setStyle` commit on the whole document (one
  undo step, selection ignored); the Select options bar shows "Show structural" / "Show skeletal"
  (icon-only below 1100 px). U13 (R53): the view is scaled about the centre on a switch and zooms
  out only if the drawing no longer fits. **Every BLU <-> pt or screen conversion uses
  `scene.style.ptPerBlu` (or `resolveStyle(doc.style).ptPerBlu`), never `bondLength`** (R53);
  `model/structural-offsets.ts` is the one place for R54's exception (offsets drawn at the
  skeletal scale), so items are hit, outlined and dragged where they are drawn. Written carbons
  count as labelled (R52): hover, hit extents, selection and valence boxes apply to them, and HV4
  gives no hover ghost over a carbon. After a switch to structural with a straight arrow present
  the status bar says "Press Tidy reaction to make room for the written carbons." (R55, U16).
- Host seam additions (R44-R49): the `actions` slot after Redo, `notify` and the `busy` event,
  right-click on an unselected item selects it first, `focus-name-field` is host-callable
  (`canRun` is true when no label or text editor is open; `run` records a focus request and the
  view moves DOM focus; R47), IME blur defers the commit to `compositionend` (R48), and "Zoom to
  100%" sets zoom 1 (R49, superseding R12).
- Tabs seam (R56-R59, tabs feature set): **one controller serves every tab** (app-shell R43); an
  inactive tab is data only (`EditorTabState`, opaque, from `state/tab-state.ts`). On the controller:
  `takeState()` (tab switch; cancels a gesture, needs no label or text editor open), `putState(s)`
  (restores history, saved baseline, selection and zoom, puts the stored centre at the canvas centre;
  a view put in before the canvas is measured is kept on the first measurement), `snapshotState()`
  (**read-only**: the committed state, no precondition, no side effect; what auto-save and shutdown
  use, also mid-gesture or in an IME composition) and `newState(doc)`; `load(doc)` is
  `putState(newState(doc))`. Pure exports `tabStateDoc`, `tabStateDirty`, `tabStateCanUndo`,
  `tabStateCanRedo`, `tabStateView`, `tabStateMarkSaved` (an auto-save result for an inactive tab) and,
  in `state/tab-state-record.ts`, `tabStateToRecord(s, { maxSteps })` and
  `tabStateFromRecord(value, { clock, view, saved })` over doc-model D2 (`saved: 'unknown'` makes the
  state dirty; `view: null` gives the default view). `EditorEvent` has `{ type: 'view' }` (zoom or
  pan, never a resize). The `replace-doc` command (R58: one `transact`, selection cleared, viewport
  kept, not marked saved) is how a file changed outside shows up as one undo step. `Editor` takes the
  host slots `menu` (first child of the top bar), `tabs` (between the rail and the canvas) and
  `tabPanelLabelledBy` (the canvas becomes `role="tabpanel"`); `--option-btn-compact` is a shell
  token, the host's CSS narrows `.editor.has-tabs .btn-opt` below 1100 px (the editor's CSS uses
  editor tokens only).
- Moved keys (R59): Tidy reaction is Ctrl+Shift+R; **Zoom to 100% has no key**; `globalCommand`
  returns `null` for Ctrl+1-9, Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+PageUp/PageDown, Ctrl+Shift+T and
  Ctrl+Shift+0, because those are the host's (app-shell K1, K2).

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
- Feature set 2026-11-12: the clipboard `image/png` entry is opaque white with a margin of 0.25 x
  the preset's `bondLength` on every side (R10; the SVG entry stays transparent and tight; File >
  Export is unchanged). `pictureDoc` copies `style.formula`, so every carrier shows and restores
  the formula (R11); a pasted fragment takes the target document's setting. A structural picture
  is `exportSvg` of the source document at true size, bonds `2 x bondLength` (R12). Whole-document
  exports skip `pictureDoc`, so only a unit test covers the selection path.
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
- Feature set 2026-11-12 (R27, R28): the shortcuts list's Tools rows are digit then letter
  (`model/shortcuts.ts` mirrors `docs/mockups/shell/pages.mjs` and is checked against the editor
  keymap); no menu item or accelerator changed. File > New is always skeletal (the formula is not
  remembered; `file-flows.test.ts` and `e2e/app-files.spec.ts` guard it). A skeletal drawing is
  saved as v1 and a structural one as v2; the 1.0.0 build shows `newer-version` for a v2 file.
  (Since the tabs set, File > New is a new tab; `tab-flows.test.ts` and `e2e/app-files.spec.ts`
  guard "always skeletal"; `file-flows.ts` is gone.)
- Tabs, auto-save and session (tabs feature set; read `SPEC-app-shell.md` T1-T18, AS1-AS9, SS1-SS12
  before touching any of it). **The session store is the only persistence of unsaved drawings**: the
  recovery file and its offer are gone, and `userData/recovery` of earlier builds is neither read nor
  deleted. Main: `src/main/session-store.ts` (one promise chain runs every record write, index
  write, record delete, auto-save write and outside-change check in arrival order, SS5; the order for
  a file tab is record, index with `writing`, file, index with the hashes) with the pure rules in
  `src/main/model/{session-index,session-folders,store-hold,tab-registry,open-requests,tab-menu-model,messages}.ts`.
  It owns `userData/session/index.json` and `tabs/<tab id>.json`; a file that does not parse is moved
  to `damaged/` and never deleted (SS11); every store write is the atomic F9 write. Renderer:
  `src/renderer/app/model/` holds `tabs` (the list), `tab-flows` (open, switch, restore, reopen;
  auto-save, outside change, Save and Save as; close, unkept, shutdown: one flow at a time over
  injected ports, so it is tested in node), `tab-close`, `tab-autosave`, `tab-status`, `tab-drag`,
  `write-schedule`, `autosave-timer`, `session-record`, `keys`; views `TabStrip.tsx`,
  `MenuButton.tsx`, `host.ts`, `host-keys.ts`.
- The tab id is a renderer UUID, opaque; main binds a path to it (IPC I12) and the renderer still
  never holds a path. Auto-save (I13) and the outside-change check (I14) hash file bytes with
  SHA-256 in main (AS5, no `stat` shortcut); the renderer's hashing is an injected port (the host
  supplies `crypto.subtle`), because `model/` is DOM-free. Auto-save writes a named `.chalk` file
  about 2 s after the last change (10 s at most in a burst) and **never** over a file that changed
  outside the app (it shows as one undo step or as a "(your changes)" tab, AS7), never a picture,
  never a path bound to another tab (AS8, AS9); Untitled, picture and `kept` tabs are written only
  under `userData/session`.
- Open requests (R37): second launches, Open recent and drops queue first in, first out; the
  request being delivered does not count, so 1 + 20 waiting is the limit (a burst of 22 opens 21,
  a drop of 22 files opens 21; `src/main/model/open-requests.ts`, `OPEN_QUEUE_LIMIT` in
  `tab-flows.ts`). Whether that stays is an open owner question.
- Keys and menu: **no native menu bar** (`Menu.setApplicationMenu(null)`; `autoHideMenuBar: false`
  is still set). The ☰ button (M4, I9) pops up the four File, Edit, View, Help submenus built from
  `src/shared/menu.ts` at the button; Alt alone and F10 open it (K3; a lone Alt means no Alt+click,
  Alt+Tab or other chord). The tab keys (Ctrl+T, W, Tab, Shift+Tab, PageUp/PageDown, Ctrl+1-9,
  Ctrl+Shift+T) are the host's, in `model/keys.ts` (`hostKey`); Ctrl+1-9 match `KeyboardEvent.code`
  (R45), so with Num Lock off Ctrl+Numpad3 and Ctrl+Numpad9 are next and previous tab (`key` is
  `PageDown` / `PageUp` and is tested first). A right press cancelling a tab drag (T13) is a unit
  test only (Chromium sends no `pointerdown` for a chorded right press). Menu items still register
  no accelerators and carry no `role`.
- Menus and native boxes are data: the pure menu model and message table are asserted in unit
  tests, and e2e stubs `dialog` and `Menu.prototype.popup` and reads what Electron received. Menu
  items never register accelerators and carry no `role` (M2, R1); the renderer owns all keys.
- Test hook and flags (TH1, R9): `window.__chalkbondTest` exists only for an unpackaged build
  started with `--chalkbond-test-hooks`; `--chalkbond-user-data=<dir>` isolates settings, the
  session store and the single-instance lock; both are ignored when packaged. `e2e/launch.ts` passes them (and a
  fresh temp folder) on every launch; `e2e/stub-dialogs.mjs` scripts native dialogs in order.
  Windows-only specs live in `e2e/win/` (`testIgnore` on other platforms, R10); nothing is skipped.
  Hook helpers added by the tabs set (TH2): `readTabs()`, `activateTab(id)`, `menuRequests()` (there
  is no `history()`). TH7: an unpackaged flagged build lets a test hold the session chain after a
  record write (`globalThis.__chalkbondTestMain.hold`, `src/main/model/store-hold.ts`, wired only
  under `flags.hooks`; `tests/tooling/store-hold-gating.test.ts` and the packaged test guard it).
  TH8: `launchApp({ probe: true })` loads `e2e/probe-main.mjs` (counts `ipcMain.handle` calls, times
  the restore) for `e2e/app-tabs-perf.spec.ts`; never loaded by production. Session helpers:
  `e2e/session-steps.ts`, `e2e/drop-steps.ts`.
- Every e2e file from A3 on ends by asserting `__chalkbondTestMain.blockedRequests === 0` (SC10).
- Settings, the session store (`session/`) and logs live in `%APPDATA%\Chalkbond`. A tab's record
  is written within about 2 s of a change (SS4); at a Windows session end main asks for a
  best-effort `flush-session` only (R5, R24, R25), and a window close never prompts (R35), except
  for an *unkept* tab whose record could not be written (R51).
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
- Windows is the only supported platform (no Linux support, owner decision 2026-11-14). Still use
  no POSIX-only syntax in npm scripts and LF line endings (`.gitattributes`). `e2e/launch.ts` keeps
  its Linux branch, unmaintained.

- Tabs gotchas: a write result (auto-save, Save as) is applied to **the tab named by its `tabId`**,
  never to the active tab (AS3); auto-save never writes over a changed file (AS5 hashes on every
  write, on activation and on window focus); the session store is the only persistence of unsaved
  work, so a change to what is stored needs the SS rows and a damaged-file test (a bad file moves to
  `damaged/`, it never stops start-up); a tab's record is renderer text that main checks only for
  size and a leading `{`, so the editor's `tabStateFromRecord` and doc-model D2 do the verifying.
  Shots of the tab strip, the ☰ button, the minimum window, main and shortcuts are
  `e2e/shots/TB32.shot.ts` (`npm run shots -- TB32`; not `A18`, that name holds the focus-ring
  shots); look at them beside `node docs/mockups/shell/build.mjs --png out/mockups-shell`. The native
  ☰ and tab popups are in no shot. Tab-switch budgets (100 ms loaded, 300 ms from the store) are
  asserted by `e2e/app-tabs-perf.spec.ts` and recorded in `docs/editor-perf.md` "Tabs"; a miss is
  fixed in the code, never in the budget.
- Structural-mode work: the goldens diff must show only added files for the pre-existing scenes;
  use `ptPerBlu` for every coordinate-to-pt step and keep R54's offsets in
  `structural-offsets.ts`; the structural perf variants share the skeletal budgets (never a
  separate, looser one). A selection-path change to `pictureDoc` needs its own unit test.
- Digit keys read `KeyboardEvent.key` only, so on AZERTY a digit needs Shift (ignored). What the
  Devanagari IME does with the canvas focused is a recorded observation in the checklist, not a
  spec rule.
- A coverage or test run that seems to hang with one busy worker is usually a failed property test
  shrinking (fast-check). Wait, or rerun that file with the verbose reporter
  (`npx vitest run --project unit <file> --reporter=verbose`); the failing seed is printed.
- `npm run test:packaged` launches a packaged app, which ignores `-r`: the OS-mouse guard cannot be
  loaded into it, so that test sends no pointer input and asserts nothing about hover. It needs a
  prior `electron-builder` build (`dist/win-unpacked` or, on Linux, `dist/linux-unpacked`), and it
  reads the version from `package.json`, so rebuild after a version change.
- Windows session-end behaviour (R24, R25: no prompt, best-effort `flush-session`, the close guard
  after a cancelled shutdown) is proven on Linux only as guard logic with synthetic
  `query-session-end` / `session-end` events. A real shutdown, a cancelled shutdown and IME are
  Windows checklist items. Windows 11's Notepad does not ask before closing, so it is no test
  subject for a cancelled shutdown.
- On Windows Playwright starts Electron through a shell, so `app.process()` is the wrapper. A test
  that must kill the app takes `process.pid` from inside the app (see `drawThenKill`).
- `e2e/app-settings.spec.ts` launches without `--force-device-scale-factor`, so window sizes there
  run at the real display scale (125 % on the dev laptop); pixel-exact claims must hold at it.
- On a small screen (work area under 1280 x 800 plus the frame, e.g. a laptop alone at 125 %) the
  first launch is maximized (W1) and `setContentSize` is ignored on a maximized window.
  `resizeContent` (`e2e/harness.ts`, used by `launchWith` and `openApp`) un-maximizes first; a test
  that sets a size and also asserts window state must measure both sides with that same step.

## Maintenance

All six modules are implemented. The automated Windows gates (Checkpoint Z steps 1-7) passed on
2026-11-11 at `956a4a4`: `npm run test:e2e` including `e2e/win/` (321), `npm run test:e2e:os-input`,
the C3 clipboard probes (keys decided, Decision R9), `npm run dist:win`, `npm run test:packaged`
and `npm run shots`. Step 8 is done: installer, unpacked and installed sizes are in
`SPEC-app-shell.md` I1. Step 9 (the human sections) is in progress: on 2026-11-12 the owner's hand checks (31 checks,
"everything works well. the tests pass.", details not reported per item) ticked every human
"Clipboard and export" box, Checkpoint K, Checkpoint R except "Pen or touch", and 15 of the 17
"App shell and installer" boxes. The owner's written answers the same day ticked "Shutdown right
after an edit" ("Yes, it was there") and "Pen or touch" (not applicable: mouse or touchpad only).
What is open from those checks: on the teacher's laptop, Checkpoint E32 and the cold-start box.
Owner decisions 2026-11-12 (`SPEC.md` Decisions Log): Windows 11 only for
the human checks, the installed Office 2016 accepted for the Office checks, the teacher's-laptop
checks open because the development machine is not that laptop, and new features before the release
(the human checks they touch will be repeated on the final installer). Version 1.0.0 is not
declared released until the rest pass.

- The feature set of 2026-11-12 is implemented (N1-N11, N13, N14, N3a, N3b) and its automated gates
  passed at `e34414b` (N12, 2026-11-12); the Windows hand checks of "Re-checks after the
  2026-11-12 feature set" are open, and the release is not declared. Its spec rows are in the Decisions tables (editor R50-R55, svg-render
  15 and 16, clipboard-export R10-R12, doc-model D1, app-shell R27 and R28). N11 collected the
  shots `out/shots/N5`, `N7`, `N10` and the golden sheet and compared them with the mock-up PNGs.

- The tabs, auto-save and session feature set (approved 2026-11-12) is implemented: tasks TB1-TB34 of
  `tasks/todo-tabs.md` are done (TB21, TB28, TB31 and TB32 on 2026-11-13; TB33 and TB34 on
  2026-11-14; the rest 2026-11-12 and 2026-11-13). `npm run check` was green at `0bc72d9` (261 files,
  5422 tests). **TB35 passed at `5d6b268` on 2026-11-14**: check, coverage, full e2e (422), os-input (1), installer, packaged (10), shots (119, one uninterrupted final run after the A10 title-race correction). The results and sizes are in `SPEC.md` and I1. Open and not decided by an agent: the
  owner's hand checks ("Re-checks for the tabs feature set" in `docs/windows-checklist.md`), the
  teacher's-laptop boxes (cold start with 10 tabs, E32), the `tidy.prop.test.ts` 5 s default under
  load (the bar forbids raising a timeout without approval), the open-request limit (R37 as built),
  and the TB32 mock-up differences (`SPEC-app-shell.md` TH9). The release is not declared. The
  specs' as-built notes (R22 and R37, W4, W6, M4, K1-K3 with R45, T13, F6, I7, TH2, TH7-TH9; doc-model
  D2; editor R56-R59) are the truth where they differ from older rows. The Linux re-run list for
  this set is waived (no Linux support, 2026-11-14) and kept as history in `docs/windows-checklist.md`.

- Windows gates still open: the owner's hand re-checks on the final installer, and, on the
  teacher's laptop, Checkpoint E32 and the cold start. "Shutdown right after an edit" is ticked
  ("Yes, it was there") and "Pen or touch" is not applicable (mouse or touchpad only), both from the
  owner's answers of 2026-11-12. Checkpoint Z is not reached. The human checks run on Windows 11
  only (Windows 10 waived, owner decision 2026-11-12). Linux is not supported (owner decision
  2026-11-14); its re-runs are waived.
- Change a behaviour: read the Decisions tables of the module's spec, update the spec first, then
  the code and tests. Decisions of later dates supersede older text anywhere (including this file).
- A bug found in a finished module: add a failing regression test first. A property-test failure
  prints a seed: reproduce with it, fix the cause, and add the counterexample as a fixed test.
