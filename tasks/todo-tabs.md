# Tasks: tabs, auto-save and session (2026-11-12)

Plan: `tasks/plan-tabs.md`. Specs: `SPEC-app-shell.md` ("Tabs, auto-save and session"; R30-R51; M1,
M4-M6, K1-K3, CM4, W3, W4, W6, F1-F14, I1-I14, N1-N9, "Testing", "Windows checks", SC16-SC21),
`SPEC-editor.md` R56-R59, `SPEC-doc-model.md` D2, `SPEC-clipboard-export.md` R13, `SPEC.md`
(Decisions Log 2026-11-12); mock-ups `docs/mockups/shell/` A01, A12, A18-A21 and `DEVIATIONS.md`
"Tabs and the menu button". Format: `tasks/todo-svg-render.md`; layout across modules:
`tasks/todo-features-2026-11.md`.

Definition of done for every task: acceptance criteria met, `npm run check` green (run on its own,
in the foreground; read its exit code and summary first), one commit per task:
`feat(<module>): TB<n> ...`, `test(<module>): ...` or `docs: ...`. Tests first: write the listed
tests, see them fail (RED) for the reason given, then write the code. Do not push unless asked.
"R n", "T n", "AS n", "SS n" are rows of the specs named above; "item (n)" is the fix-round test
list in `SPEC-app-shell.md` "Testing".

## Checkpoint 2026-11-12 (paused here; continue from this note)

**State:** `main` at the commit that adds this note; `npm run check` green on a quiet machine (260
files, 5500 tests). Not pushed. **Done (29 of 35; TB21 done 2026-11-13, see its entry):** TB1-TB27, TB29, TB30, plus fixes:
svg-render Decision 16 oracle (seed 3343550), T8 "an unreadable record keeps the tab", a flaky
SEC8 cleanup in `session-store.test.ts`. Tabs, auto-save, restore and the ☰ menu are live in the app.
**Full `npm run test:e2e` has not been re-run since TB26, TB27, TB29 and TB30 were merged together**
(each ran its own specs; TB26's full run was 340 passed / 9 failed before its fixes) — run it first.

**Next, in order:** TB21 (retire the recovery code; dead now: `fileFlows`, `session`, the renderer's
recovery code, `session.ts` `sessionUpdate`, N2, N3, N4, main's `recovery` wiring) -> TB28 (e2e
session restore; builds on `app-session.spec.ts`, `session-steps.ts`) -> TB31 (perf) and TB32 (shots:
look at A14 and `out/shots/A11/menu-960.png`; the ☰ popup's look is in no shot) and TB33 (Windows
checklist) -> TB34 (AGENTS.md and specs) -> TB35 (gates on a quiet machine: check, full e2e,
e2e/win, os-input, `dist:win`, `test:packaged`, shots).

**Spec text owed to TB34** (built differently; record "as built"): TH2 helpers are `readTabs()`,
`activateTab(id)`, `menuRequests()` (no `history()`); F6's Save-as folder comes from the active tab's
binding in main (`activeBinding`), no N2; I7 always answers `recovery: null`; M4 tooltip = title
"Menu (Alt or F10)" + help "File, Edit, View and Help.", `aria-expanded` always rendered; W4
`autoHideMenuBar: false` still set; W6 at 125 % a 960×640 content is a 978×687 window; R37/R22 queue:
one request in delivery + 20 waiting, so a burst of 22 opens 21 and drops the 22nd (a drop of 22
files opens 21); T13 "a right press cancels a drag" is untested (Chromium sends no `pointerdown` for
a chorded right press); a NumLock-off Ctrl+Numpad digit is PageUp/Down by `key`.

**Open decisions for the owner:** (1) `src/renderer/editor/model/tidy.prop.test.ts` (~1 s alone, same
as before the tabs work) times out at the 5 s default only while other agents load the machine;
similar property suites set an explicit timeout, the bar forbids raising one without approval.
(2) The open-request limit: keep "20 waiting" (a drop of 22 opens 21) or cap a drop at 20 files.

**How the work was run:** one agent per task in its own git worktree (`.claude/worktrees/`, ignored;
`node_modules` as a junction to the main checkout's), one commit per task on its branch, then
cherry-picked onto `main` by the orchestrator, conflicts resolved there, `npm run check` re-run.
Stale worktrees under `.claude/worktrees/` can be removed with `git worktree remove`.

**Must not change in any task:** existing goldens (never `npm test -- -u`), committed `.chalk`
fixtures, perf budgets and timeouts, coverage thresholds in `vitest.config.mts`, any property's
`numRuns`, the normative mock-up files and their lifted copies (except TB1, which syncs them). No
`eslint-disable`, `@ts-ignore`, `any`, skipped or `.only` tests, retries, deleted assertions,
coverage exclusions or new dependencies. An e2e spec that tests behaviour the specs supersede (the
recovery offer, the save prompt on New / Open / close, the native menu bar, Ctrl+1 = Zoom to 100%)
is rewritten to the new behaviour by the task that removes the behaviour, in the same commit; a
spec is never deleted without its replacement.

**Platform:** the code is cross-platform; Windows is the development machine (`e2e/win`,
`test:e2e:os-input`, `dist:win`, `test:packaged`). The Linux re-run list stays in
`docs/windows-checklist.md`; TB33 adds this feature set's changes to it.

**Model line:** each task says `sonnet` or `opus` for the agent that implements it, with the
reason. Opus: concurrency, ordering, hashing, data-loss, close and shutdown logic, the editor's
per-tab seam. Sonnet: UI, menus and keys, mock-up syncs, simpler tests, docs.

**Shots:** `npm run shots -- TB<n>` writes `out/shots/TB<n>/<name>.png` (1280x800 content unless the
name ends in `-960`). References: `node docs/mockups/shell/build.mjs --png out/mockups-shell` and
`node docs/mockups/editor/build.mjs --png out/mockups`. From TB9 on, every new e2e file ends by
asserting `__chalkbondTestMain.blockedRequests === 0` (SC10).

---

## TB1: Approvals, docs commit, lifted tokens and icons

**Description:** Commit the approved feature set. (1) The approval markers in the specs were
changed in the working tree (app-shell, editor, doc-model; SPEC.md has the approval row and the
statuses). (2) The new mock-ups and the changed ones are committed. (3) `tasks/plan-tabs.md` and
`tasks/todo-tabs.md` are committed. (4) Sync the lifted copies with the changed normative files:
`src/renderer/app/shell-tokens.css` becomes the same bytes as `docs/mockups/shell/shell-tokens.css`
(new tokens `--tabstrip-h`, `--tab-h`, `--tab-min-w`, `--tab-max-w`, `--tab-close`, `--tab-add`,
`--tab-scroll-w`, `--dot-size`, `--option-btn-compact`; the leading comment is identical, so a
plain copy is right) and `src/renderer/app/shell-icons.svg` the same bytes as
`docs/mockups/shell/shell-icons.svg` (new symbols `menu`, `close`, `add`, `chevron-left`,
`chevron-right`; none collides with the editor sprite or tokens). (5) `DEVIATIONS.md` item 6 ("Reopen
closed tab restores only a named file") is stale against R48 and T12: rewrite it to "an unnamed
drawing closed with Don't save is in the list too (R48)"; leave item 5 as "to sync at
implementation" (TB23 closes it). No code and no test file changes.

**Why `shortcuts.ts` is not here:** `src/renderer/app/model/shortcuts.test.ts` hardcodes the old
rows (it does not read `pages.mjs`), so it passes today. Moving it to A12's rows would require
`globalCommand` to return `tidy-reaction` for Ctrl+Shift+R and `null` for Ctrl+1 (TB3), and the host
to bind Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+1-9, Ctrl+Shift+T, F10 (TB22). Until then the dialog must
keep listing the keys that work. TB23 does it.

**Tests first:** the only failing check today is `tests/tooling/shell-tokens.test.ts` "lifts
normative tokens and sprite without collisions" (verified: it reads the mock-up files and the lifted
copies; 1 failed, 2 passed). Confirm RED, copy, confirm GREEN. `editor-tokens.test.ts` is unaffected
(`docs/mockups/editor/tokens.css` and `icons.svg` did not change; only `pages.mjs` did).

**Acceptance criteria:**
- [x] `tests/tooling/shell-tokens.test.ts` passes: lifted tokens equal the mock-up after the leading comment, the sprite is byte-identical, no token or symbol name collides with the editor's
- [x] `npx prettier --check docs/mockups SPEC*.md` clean (checked: it is) and `npm run check` exits 0
- [x] No `SPEC` row says "proposed" or "awaiting approval" for this feature set (checked with grep; `SPEC-editor.md` R51 and `SPEC.md` U7's "Proposed, not decided" are the formula key, not part of this set)
- [x] The commit stages exactly the files listed below and not `CLAUDE.md`

**Verification:** `npx vitest run --project tooling tests/tooling/shell-tokens.test.ts tests/tooling/editor-tokens.test.ts`, then `npm run check` (on its own).

**Dependencies:** none

**Files (stage exactly these):**
`tasks/plan-tabs.md`, `tasks/todo-tabs.md`, `CAPABILITY-MAP.md`, `SPEC.md`, `SPEC-app-shell.md`,
`SPEC-clipboard-export.md`, `SPEC-doc-model.md`, `SPEC-editor.md`,
`src/renderer/app/shell-tokens.css`, `src/renderer/app/shell-icons.svg`,
`docs/mockups/editor/pages.mjs`,
`docs/mockups/editor/{01-empty,02-drawing,03-select,03b-select-abbrev,04-ring-options,05-atom-options,06-name-dropdown,07-name-nomatch,08-reaction,09-text-editing,11-min-window}.html`,
`docs/mockups/shell/{pages.mjs,build.mjs,shell.css,shell.js,shell-tokens.css,shell-icons.svg,DEVIATIONS.md}`,
`docs/mockups/shell/{A01-main,A02-copied,A04-file-menu,A05-edit-menu,A06-view-menu,A08a-export-png,A08b-export-svg,A08c-export-pdf,A09-save-prompt,A10-open-errors,A11-recovery,A12-shortcuts,A13-drop,A14-about,A15-min-window,A15b-min-window-proposal,A15c-min-window-select,A17-notices}.html`,
new: `docs/mockups/shell/{A18-tab-strip,A19-menu-button,A20-close-tab-prompt,A21-min-window-tabs}.html`,
`docs/mockups/shell/tabs-sheet.css`, `docs/mockups/shell/canvas/{min-tabs,scheme-tabs,untitled}.svg`.
Never `CLAUDE.md` (an unrelated user change). Commit message: `docs: tabs, auto-save and session approved; plan, todo, mock-ups; sync lifted shell tokens and icons`.

**Scope:** S

**Model:** sonnet: copying two files and committing; no logic.

---

## TB2: doc-model history record (D2)

**Description:** `SPEC-doc-model.md` D2 (public surface, approved). New exports from `index.ts`:
`HistoryRecord`, `StepRecord`, `PatchRecord`, `historyToRecord(h, { maxSteps })` (newest
`maxSteps` undo steps; no redo steps, `openKey` or `clock`), `historyFromRecord(value, { clock? })`
returning `Result<{ history; dropped }, ParseError>` with an empty redo stack. Strict Zod record
schema (a path segment `__proto__`, `constructor` or `prototype` is invalid; label <= 200); `file`
goes through `parse`; each undo step is verified from the current drawing backwards (inverse
applied, result validated by the current strict schema and `checkInvariants`); the first failing
step is dropped with every older one (`dropped`). `History` stays opaque, `HISTORY_DEPTH` stays 500,
no schema or file-format change.

**Tests first:** round trip of every fixture with 100 steps (undo after restore gives the same
drawings as before); property test (random transacts, record, restore, undo all the way: equal
drawings; reproduce failures with the printed seed, never lower `numRuns`); every shape error
(wrong `format`, `version`, missing `file`, bad op, bad path); `__proto__` / `constructor` /
`prototype` path rejection; a corrupted step drops itself and all older ones and keeps the
drawing; a corrupt `file` is the only error; redo steps are not recorded; `maxSteps` larger than
the history keeps all; `maxSteps` 0 gives an empty history. **Perf (`perf.test.ts`, serial):**
restoring 100 steps of a 500-atom drawing <= 150 ms median, of the 2-step scheme fixture <= 30 ms.

**Acceptance criteria:**
- [x] The new surface exists exactly as D2 lists and nothing else is exported
- [x] A restored history undoes to the same drawings as the original (D2 round-trip and property)
- [x] A damaged history keeps the drawing with the steps that verified (`dropped` counts the rest)
- [x] The perf budgets are met on this machine; the measured medians are written in the task's commit message and `docs/editor-perf.md` is not touched
- [x] doc-model coverage stays >= 95 % lines; `tests/tooling/lint-boundaries.test.ts` passes

**Verification:** `npm test -- src/core/doc-model && npx vitest run --project perf src/core/doc-model/perf.test.ts`, then `npm run check`.

**Dependencies:** TB1

**Files:** `src/core/doc-model/history.ts` (or `history-record.ts`), `history-record.test.ts`, `history-record.prop.test.ts`, `perf.test.ts`, `index.ts`, `__fixtures__/` (a 500-atom document builder only if none exists)

**Scope:** M

**Model:** opus: verification of untrusted undo patches, a data-integrity guarantee that auto-save depends on.

---

## TB3: Editor keys moved for the tabs (R59)

**Description:** `SPEC-editor.md` R59, app-shell R36 and R46. In `model/keymap.ts`: Tidy reaction is
Ctrl+Shift+R (was Ctrl+Shift+T); `globalCommand` returns `null` for Ctrl+1 ... Ctrl+9, Ctrl+Shift+T,
Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+PageUp and Ctrl+PageDown and binds nothing to Ctrl+Shift+0;
Zoom to 100% (`zoom-reset`) has no key. Labels and tips follow: the Tidy action's key chip reads
`Ctrl+Shift+R`; `STATUS_TIPS.zoomReset` has no key; the status-bar zoom readout's `aria-label`
is `Zoom to 100%` and its tooltip has no chip (mock-up `docs/mockups/editor/pages.mjs` already does).
`Ctrl+0` still fits. Update `SPEC-editor.md` tables only if a row still says Ctrl+1 or
Ctrl+Shift+T (R59 changed them already).

**Tests first:** `keymap.test.ts` (the "Ctrl+0 fits and Ctrl+1 resets" and "Ctrl+1 and Ctrl+0 stay
zoom" tests become: Ctrl+1 and Ctrl+Shift+T return `null`, Ctrl+Shift+R is `tidy-reaction`,
Ctrl+2-9, Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+PageUp / PageDown are `null`, Ctrl+Shift+0 is `null`);
`tips.test.ts` (`zoomReset` has title only); `StatusBar.test.tsx` (aria-label `Zoom to 100%`);
`OptionsBar.test.tsx` / `Tooltip` for the Tidy chip; `controller-*` tests that sent Ctrl+Shift+T;
`e2e/editor-canvas.spec.ts` ("the readout and Ctrl+1 go to 100 %" becomes: the readout goes to
100 %, Ctrl+1 does nothing in the editor) and any `e2e/editor-*.spec.ts` that presses Ctrl+Shift+T.
The e2e keymap files for `app-keys.spec.ts` are TB26's (they test the host).

**Acceptance criteria:**
- [x] The keymap table above holds, and the hover keys 1-3 (R5) are unchanged
- [x] Tidy reaction runs on Ctrl+Shift+R from the canvas; its tooltip and chip say so
- [x] The zoom readout's name and tooltip carry no key; it still runs `zoom-reset`
- [x] No editor mock-up, token or icon file is edited; `editor-tokens.test.ts` passes
- [x] Editor coverage stays >= 70 %

**Verification:** `npm test -- src/renderer/editor`, `npx playwright test --project=e2e e2e/editor-canvas.spec.ts e2e/editor-reaction.spec.ts` (builds first; Windows), then `npm run check`.

**Dependencies:** TB1

**Files:** `src/renderer/editor/model/keymap.ts`, `keymap.test.ts`, `src/renderer/editor/state/tips.ts`, `tips.test.ts`, `src/renderer/editor/view/StatusBar.tsx`, `StatusBar.test.tsx`, `OptionsBar.tsx` (chip), `e2e/editor-canvas.spec.ts`, other `e2e/editor-*.spec.ts` that use the old keys

**Scope:** S

**Model:** sonnet: table edits in the keymap and tooltips with exact test expectations.

---

## TB4: Editor host slots `menu` and `tabs` (R56)

**Description:** `SPEC-editor.md` R56, K4. `Editor` gains `menu?: React.ReactNode` (first child
of the top bar, before the name field), `tabs?: React.ReactNode` (top of the canvas column, right
of the rail, between the top bar's border line and the canvas, full canvas-column width, height set
by the host's content) and `tabPanelLabelledBy?: string` (the canvas wrapper takes `role="tabpanel"`
and this `aria-labelledby` when `tabs` is supplied). Without them the layout is unchanged. The rail
keeps its place and height; the canvas loses the strip's height and its viewport follows. K4 order:
`menu` -> name field -> options bar -> rail -> `tabs` slot -> canvas. The editor CSS uses editor
tokens only; the slot's content brings its own styles. The 28 px option buttons below 1100 px
(`--option-btn-compact`, A21) are app CSS (TB24 / TB26), not editor CSS.

**Tests first:** `Editor.test.tsx` / `TopBar.test.tsx` (markup: with `menu` the slot is the first
child; with `tabs` it is between the top bar and the canvas; `role="tabpanel"` and
`aria-labelledby` present only with `tabs`; no change without them); `e2e/editor-layout.spec.ts`
(DOM boxes with a stub slot: the strip is above the canvas and right of the rail at 1280x800 and
960x640; the rail's last button (Text) still fully visible at 960x640 with a 33 px strip; the
canvas viewport size equals the column minus the strip); `e2e/editor-keyboard.spec.ts` (K4 order
with stub slots). The e2e harness mounts the stub slot through a test-only prop path that exists in
`e2e/harness.ts` only if the editor is mounted without the app; otherwise this e2e is TB24's and TB4
covers markup and CSS with unit tests and a Playwright component-level probe. Decide at the start
and write it in the commit.

**Acceptance criteria:**
- [x] The three optional props exist and the layout without them is pixel-identical (existing `editor-layout.spec.ts` and shots `E5`-`E9` unchanged)
- [x] With a 33 px strip the 960x640 rail rule holds (SC12 of app-shell stays satisfiable)
- [x] K4's order is tested with both slots
- [x] No raw colour or px other than 1 px in `editor.css` (`editor-tokens.test.ts` passes)

**Verification:** `npm test -- src/renderer/editor tests/tooling/editor-tokens.test.ts`, `npx playwright test --project=e2e e2e/editor-layout.spec.ts e2e/editor-keyboard.spec.ts e2e/editor-a11y.spec.ts`, then `npm run check`.

**Dependencies:** TB1

**Files:** `src/renderer/editor/view/Editor.tsx`, `TopBar.tsx`, `editor.css`, `Editor.test.tsx`, `TopBar.test.tsx`, `e2e/editor-layout.spec.ts`, `e2e/editor-keyboard.spec.ts`

**Scope:** M

**Model:** sonnet: layout and slot props with measurable DOM tests, no state logic.

---

## TB5: Editor per-tab state in memory (R57, part 1)

**Description:** `SPEC-editor.md` R57. New in `index.ts`: the opaque type `EditorTabState` (undo
history, saved baseline, selection, viewport zoom and the BLU point at the canvas centre).
Controller: `takeState()` (precondition `canRun('focus-name-field')`; a gesture in progress is
cancelled first, never committed), `putState(s)` (replaces history, saved, selection and viewport;
keeps the canvas size, restores the state's zoom and puts the stored centre at the centre of the
current canvas; clears hover, gesture, preview, editing and notice; keeps tool, variants,
name-field text and the in-app clipboard; emits `doc`, `selection`, `history`, `dirty` as they
change; resets derive caches as `load` does), `snapshotState()` (read-only: no precondition, no
side effect; a gesture, preview, open label or text editor and an IME composition are left alone
and not in it), `newState(doc)` (what `load(doc)` would make; touches nothing). `load` becomes
`putState(newState(doc))`. Pure exports: `tabStateDoc`, `tabStateDirty`, `tabStateCanUndo`,
`tabStateCanRedo`, `tabStateView`, `tabStateMarkSaved(s, doc)` (the saved baseline becomes `doc`;
clean exactly if the drawing is still `doc`). `EditorEvent` gains `{ type: 'view' }`, emitted when
zoom or pan changes (not on a canvas resize).

**Tests first:** controller tests with two states A and B: take A, put B, undo history is B's;
put A back and A's undo, redo, selection and view are restored (zoom and centre); `takeState` while
a drag is in progress cancels it and the state holds no preview (RED: no such method);
`snapshotState` during a drag, with a label editor open and with an IME composition leaves
gesture, preview, editing and notice untouched and returns the committed state (item (2) of the
spec: it is the same call the timer uses); `putState` keeps tool, variants, name-field text and the
in-app clipboard; `putState` on a different canvas size keeps the zoom and re-centres; events:
`doc`, `selection`, `history`, `dirty` fire only for what changed; `view` fires on wheel zoom,
pan, `zoom-fit`, `zoom-reset` and a key zoom, never on resize; `newState(doc)` touches nothing
(controller state equal before and after); `tabStateMarkSaved` clean/dirty cases; `load` still
passes its existing tests. Perf (`src/renderer/editor/perf.test.ts`): `putState` of a 100-atom
state to first derived scene within the tab-switch share of T11 (record the median; the T11 budget
itself is TB31's e2e).

**Acceptance criteria:**
- [x] Every method and pure export above exists with the stated preconditions and effects (R57)
- [x] `snapshotState` changes nothing observable (`editor.prop.test.ts` or a unit property: store before and after equal)
- [x] `load` is `putState(newState(doc))` and its existing tests pass unchanged
- [x] `view` events are emitted on zoom and pan only
- [x] Editor coverage stays >= 70 %; no `Date` or timers in `model/tools/state` (lint probe)

**Verification:** `npm test -- src/renderer/editor && npx vitest run --project perf src/renderer/editor/perf.test.ts`, then `npm run check`.

**Dependencies:** TB1

**Files:** `src/renderer/editor/state/controller.ts`, `store.ts`, `editor-state.ts`, `tab-state.ts` (new), `tab-state.test.ts`, `controller-tab-state.test.ts`, `src/renderer/editor/index.ts`, `perf.test.ts`

**Scope:** L

**Model:** opus: the seam every tab switch, auto-save result and shutdown flush depends on; a wrong `takeState` or `snapshotState` loses a drawing.

---

## TB6: Editor record conversion and the SS4 serialisation budget (R57, part 2)

**Description:** `tabStateToRecord(s, { maxSteps }): EditorTabRecord` (JSON-serialisable: doc-model
`HistoryRecord` and nothing else; the view and the saved state are the host's) and
`tabStateFromRecord(value, { clock, view, saved: 'current' | 'unknown' }): Result<{ state;
droppedSteps }, ParseError>` (strict shape; history through D2; `saved: 'unknown'` makes the
state dirty until `markSaved` or `tabStateMarkSaved`, even if undo returns to the saved drawing).
Export the type `EditorTabRecord`. `app-shell` SS3 stores the record's `editor` field.

**Tests first:** round trip: state -> record -> `JSON.stringify` -> `JSON.parse` -> state has the
same drawing, the last `maxSteps` undo steps (undo all the way equals the original drawings) and no
redo steps; `view` argument becomes the state's view; `saved: 'current'` is clean and
`saved: 'unknown'` is dirty even after undo to the same drawing; every shape error is a
`ParseError`; a damaged step reports `droppedSteps` and keeps the drawing; a record with extra keys
is rejected (strict). **Perf (`perf.test.ts`):** `tabStateToRecord` plus `JSON.stringify` of the
100-atom perf document with 100 undo steps <= 16 ms median, the 500-atom document with 100 steps
<= 50 ms median (SS4).

**Acceptance criteria:**
- [x] The two functions and the type are exported from `index.ts` and match R57
- [x] The SS4 budgets are met; if not, the code is fixed (a worker is the spec's named fallback and needs a spec note first), never the budget
- [x] The record contains nothing outside doc-model's `HistoryRecord` (a unit test lists its keys)
- [x] Editor coverage stays >= 70 %

**Verification:** `npm test -- src/renderer/editor && npx vitest run --project perf src/renderer/editor/perf.test.ts`, then `npm run check`.

**Dependencies:** TB2, TB5

**Files:** `src/renderer/editor/state/tab-state-record.ts` (new) and `.test.ts`, `src/renderer/editor/index.ts`, `src/renderer/editor/perf.test.ts`

**Scope:** M

**Model:** opus: restores untrusted data into live state and owns a hard perf budget.

---

## TB7: Editor `replace-doc` command (R58)

**Description:** `EditorCommand` gains `{ type: 'replace-doc'; doc: Doc; label: string }`:
`canRun` when idle; one `transact` whose recipe returns `doc` (a whole replacement: coarse
patches, correct undo; `nextId` comes from `doc`), labelled `label`; selection cleared; viewport
kept; not marked saved (the host calls `markSaved`).

**Tests first:** `controller-commands.test.ts`: replace a drawing, one undo step with the given
label, Ctrl+Z restores the previous drawing exactly (including ids), redo replays; selection
cleared; zoom and centre unchanged; `isDirty()` true until `markSaved()`; `canRun` false during
a gesture, with a label or text editor open and while busy; a replacement doc whose `nextId` is
larger than the old one reissues no existing id; coalescing: a replace after a coalesced drag does
not merge into it.

**Acceptance criteria:**
- [x] One undo step, correct undo and redo, selection cleared, view kept (R58)
- [x] `canRun` follows the idle rule used by `set-preset`
- [x] The command type is in `EditorCommand` and nothing else in `index.ts` changes
- [x] Editor coverage stays >= 70 %

**Verification:** `npm test -- src/renderer/editor`, then `npm run check`.

**Dependencies:** TB5

**Files:** `src/renderer/editor/state/commands.ts`, `reducer.ts`, `controller.ts` (canRun), `controller-commands.test.ts`, `reducer-commit.test.ts`

**Scope:** S

**Model:** sonnet: one new command through the existing reducer and transact path.

---

### Checkpoint A: doc-model and editor
- [ ] `npm run check` green; coverage thresholds hold (`npm test -- --coverage`)
- [ ] Windows: `npm run test:e2e` editor files and `npm run shots -- E21 N5` looked at
- [ ] Commit

---

## TB8: Main pure models: session index and tab registry

**Description:** `src/main/model/session-index.ts` and `src/main/model/tab-registry.ts` (pure: no
`electron`, no `node:*`, named exports; injected `normalizePath(path) -> key`). **Session index**
(SS3, lenient Zod like `settings.ts`): `{ version: 1; tabs: { id: uuid; kind; name <= 255; path:
string | null; fileHash; written; writing; unsaved; warning; view: { zoom 0.25..8; centre {x, y} }
| null }[]; active: uuid; discarded: uuid[] }`; parse, merge of N8's renderer fields
(`id, kind, name, view, unsaved, warning, active, discarded`) with main's own fields (paths and
hashes never come from the renderer), the `discarded` rules (an id leaves the list once its record
is deleted; ids are never reused), the renderer-visible projection for I7 (`{ id, kind, name, view,
unsaved, warning }` plus `active`; no paths, no hashes), and the classification used by SS11: given
the folder's file names and the index, which records are listed, discarded or orphans, and what an
unparsable index becomes (an empty index; every record then opens as `kept` named from its record).
**Tab registry**: `tabId -> { kind, pathKey, fileHash, written, writing }`; transitions for I12
(`open`, `save-as`, `unbind`, `reopen` moving the binding of `from` to the new id, `take-over`
moving path and file hash from `from`), `openIn(pathKey)` for T17 and AS9 (a path bound to another
tab; a picture tab is bound to its picture), the SS5 hash steps (`writing` set before a write,
promoted to `fileHash` and `written` on success, cleared on failure) and the AS5 decision as a pure
function `checkOutcome(entry, read: { ok, bytesHash } | { problem })` returning `same` (equal to
`fileHash` or to `writing`, promoting an in-flight hash), `missing`, `unreadable` or `changed`.

**Tests first:** every field of the index schema (each invalid field replaced by its default, an
unknown key dropped, a broken value is a damaged index, `view.zoom` clamped or dropped); N8 merge
never lets the renderer set a path or hash; `discarded` lifecycle; projection hides paths and
hashes; orphan and damaged classification (a listed record, a discarded one, an unlisted one);
registry transitions (every `reason`, `take-over` leaves `from` unbound, `reopen` keeps the hashes);
`openIn` compares case-insensitively through the injected key and answers the owner tab; `checkOutcome`
table: equal to `fileHash` -> same, equal to `writing` -> same and promoted (so a power cut between
the file write and the index write leaves no stale written hash), different -> changed, ENOENT ->
missing, read error -> unreadable.

**Acceptance criteria:**
- [x] SS3's index and SS11's classification exist as pure functions with the tests above
- [x] The registry covers every I12 reason and AS5's outcomes (AS8's "never writes a path not `same`" is expressible from its results)
- [x] `src/main/model` coverage >= 90 % lines; the model lint block and `tests/tooling/app-lint.test.ts` pass

**Verification:** `npm test -- src/main/model`, then `npm run check`.

**Dependencies:** TB1

**Files:** `src/main/model/session-index.ts`, `session-index.test.ts`, `tab-registry.ts`, `tab-registry.test.ts`

**Scope:** M

**Model:** opus: hash-state transitions and the damage rule decide whether a drawing can be lost or overwritten.

---

## TB11: Main messages, tab menu model, I10

**Description:** `src/main/model/messages.ts`: the `save-changes` box becomes T9's (`type:
'warning'`, message `Do you want to save “Untitled 2”?`, detail `If you don't save, your drawing
will be lost.`, buttons Save, Don't save, Cancel, `defaultId` 0, `cancelId` 2, `noLink`; I4 loses
`{ kind: 'recover' }` later, in TB21); the F14 row `open-in-tab` ("“ethanol.chalk” is open in
another tab." / "Close that tab first, or choose another name."); the auto-save boxes of the
spec's "Auto-save boxes" table (a failed auto-save and `missing` with unwritten changes,
`changed-outside` with unwritten changes in two wordings, a store record that cannot be kept),
built from `{ problem, name }` with the F14 detail of the problem. `src/main/model/tab-menu-model.ts`
(T15): `&New tab Ctrl+T`, separator, `&Close tab Ctrl+W`, separator, `Reopen closed &tab
Ctrl+Shift+T` only when `canReopenTab`; accelerators display-only, `registerAccelerator: false`, no
`role`. Channel I10 `tab-menu:show` / `showTabMenu` (`{ tabId, state: { canReopenTab }, at: { x, y }
| null }` -> `'new-tab' | 'close' | 'reopen' | null`): schema, `handle()` registration, popup at the
cursor or under the tab (M5: not while another popup is open), preload function and `api.d.ts`.
Nothing calls it yet; TB25 does.

**Tests first:** `messages.test.ts` (every new row: text, buttons, `type`; the `{ problem, name }`
schema rejects a name with `/` or `\`, SEC15); `tab-menu-model.test.ts` (three items, the reopen
item present only when allowed, no role, display-only accelerators); `ipc-schemas.test.ts` (I10
request and answer, bad `tabId`, bad `at`); a main-side test with a stubbed `Menu.prototype.popup`
that a second request while one popup is open is ignored.

**Acceptance criteria:**
- [x] Every new box wording equals the spec table (a test per row)
- [x] I10 follows SEC5 and SEC6 (named preload function, sender check, Zod) and the preload key list test is updated
- [x] `src/main/model` coverage >= 90 % lines

**Verification:** `npm test -- src/main src/preload`, `npx playwright test --project=e2e e2e/app-security.spec.ts` (Windows), then `npm run check`.

**Dependencies:** TB1

**Files:** `src/main/model/messages.ts`, `messages.test.ts`, `tab-menu-model.ts`, `tab-menu-model.test.ts`, `src/main/menu.ts`, `src/main/ipc-schemas.ts`, `src/shared/channels.ts`, `src/shared/ipc-types.ts`, `src/preload/index.ts`, `src/preload/api.d.ts`, `e2e/app-security.spec.ts` (the documented preload key list)

**Scope:** M

**Model:** sonnet: wording tables and one IPC channel by an existing pattern.

---

## TB9: Session store: write chain, atomic store writes, I11, N7, N8

**Description:** `src/main/session-store.ts` (SS2, SS5, SS6 atomic part, SS11). Owns
`userData/session/index.json` and `userData/session/tabs/<uuid>.json`; a tab id is a uuid and never
part of a path otherwise (SEC8). **One promise chain** runs every record write, index write, record
delete, auto-save write and AS5 check in arrival order (RC6 generalised; TB10 adds the last two as
tasks on the same chain). Every store write is F9 (temp file in the same folder, `sync`, rename,
3 x 100 ms retries of `EBUSY` / `EPERM`; reuse `files.ts`' atomic writer); a failed record write
never touches the previous record. N7 `session:write-tab` (`{ tabId, text <= 64 MiB starting "{" }`;
main checks only size and signature, SEC9) and N8 `session:index` (the 500 ms debounce is the
renderer's; main writes on arrival, merged by TB8's functions); I11 `session:read-tab` answers
`{ ok: true, text } | { ok: false, problem }`. Start-up read of the index through SS11: a file that
does not parse is moved to `userData/session/damaged/` (never deleted) and logged (LG1, no content).
Records listed in `discarded` are deleted after a valid index read at start (TB13 adds the window
close). The old `userData/recovery/` folder is neither read nor deleted. Additive: nothing in the
renderer calls these channels yet and `recovery.ts` still runs. Preload functions `readTabRecord`,
`writeTabRecord`, `updateSessionIndex`.

**Tests first (temp folder):** chain order: a record write, an index write and a delete submitted
together finish in order; a failing task does not stop the next; a record write that fails (read-only
folder or injected `ENOSPC`) leaves the previous record bytes intact and reports `disk-full` /
`write-denied`; size and signature checks (`{`, 64 MiB + 1 rejected); path safety (a non-uuid
`tabId` never reaches `join`); SS11 table: an unparsable index, an unparsable record, a record whose
JSON is not a record envelope: each is moved to `damaged/` with its name kept and nothing else is
touched; orphans reported; `discarded` ids' records deleted only after a validly read index; a valid
`.chalk` or picture file is never touched; `ipc-schemas` for I11, N7, N8.

**Acceptance criteria:**
- [x] All SS2, SS5 (order) and SS11 behaviours above, with SEC8's path rule tested
- [x] A write killed halfway (temp file left behind) does not damage the previous record; stale temp files are ignored at start
- [x] Preload key list and SEC5 test updated; `userData/session/` is the only folder written
- [x] `src/main/model` coverage >= 90 % lines (pure parts live in TB8's model)

**Verification:** `npm test -- src/main src/preload`, then `npm run check`.

**Dependencies:** TB8, TB11

**Files:** `src/main/session-store.ts`, `session-store.test.ts`, `src/main/files.ts` (reuse only), `src/main/ipc-schemas.ts`, `src/shared/channels.ts`, `src/shared/ipc-types.ts`, `src/preload/index.ts`, `src/preload/api.d.ts`, `src/main/index.ts` (create the store, wire handlers), `e2e/app-security.spec.ts` (key list)

**Scope:** L

**Model:** opus: the single ordered write chain and the damage rule are what make a power cut harmless.

---

## TB10: Auto-save writer, AS5 check, I12-I14, N9

**Description:** Main side of AS1, AS5, AS8, AS9 and SEC8. Channels: I12 `tab:bind` / `bindTab`
(reasons `open`, `save-as`, `unbind`, `reopen`, `take-over`; answers `{ ok: true } | { ok: false,
openIn }`; a Save-as onto a path bound to another tab is refused here and nothing is written; last
folders and the recent list follow `open` and `save-as` as N2 did), I13 `file:auto-save` /
`autoSave` (`{ tabId, text <= 20 MB starting "{" }`), I14 `file:check` / `checkTabFile`, N9
`file:accept-outside` / `acceptOutsideChange`. Everything runs on TB9's chain. I13: the AS5 check
first (read <= 20 MiB, SHA-256, no `stat` shortcut; 3 x 100 ms retries of `EBUSY` / `EPERM` then
`unreadable`; `ENOENT` for the file or its folder is `missing`); only on `same` the SS5 sequence:
index with `writing` = hash of the text, then the file by F9 to the bound path, then the index with
`fileHash` and `written` = that hash and `writing` null (a failed or refused write clears `writing`
at once). Answers always carry `tabId`: `{ tabId, ok: true, sha256 } | { tabId, ok: false, problem
} | { tabId, ok: false, problem: 'changed', bytes }`. AS8: never creates a file, never writes a
picture, never writes a path whose check is not `same`, never writes a path bound to another tab. I14
returns `{ tabId, written, state }` with the written hash (a promoted in-flight hash included).

**Tests first (temp folder, injected fs where needed):** item (5), main half: kill the chain between
the file write and the index write, restart: the file holds the in-flight text, AS5 says `same`, the
written hash is promoted, no false "unwritten"; AS5 with a changed file of the same size and the same
modified time is `changed` (FAT32-like); an equal file is `same`; `missing` (file, then folder);
`unreadable` after retries; a file over 20 MiB; a write over a changed file is refused and the bytes
stay; a picture tab and an `untitled` tab are refused (AS8); a path bound to another tab is refused
(I12 `openIn`, AS9); `take-over` and `reopen` move hashes correctly; every failed write
(`write-denied`, `disk-full`, `busy`, `folder-gone`, `write-failed`) maps through `write-problem.ts`;
SEC8: a text without a leading `{` is refused; schemas for I12-I14 and N9.

**Acceptance criteria:**
- [x] A file changed outside is never overwritten by I13 (AS5, AS8) and every answer carries `tabId`
- [x] The SS5 sequence is observable in the tests (index, file, index) and a crash leaves either the written or the in-flight text
- [x] I12 refuses a Save-as path bound to another tab (AS9) and writes nothing
- [x] Preload key list and SEC5 test updated; `src/main/model` coverage >= 90 % lines

**Verification:** `npm test -- src/main src/preload`, then `npm run check`.

**Dependencies:** TB9

**Files:** `src/main/session-store.ts`, `src/main/files.ts`, `src/main/model/write-problem.ts`, `src/main/model/file-refs.ts`, `src/main/model/tab-registry.ts`, their tests, `src/main/ipc-schemas.ts`, `src/shared/channels.ts`, `src/shared/ipc-types.ts`, `src/preload/index.ts`, `src/preload/api.d.ts`, `src/main/index.ts`

**Scope:** L

**Model:** opus: the writer is the only code that overwrites her files; ordering and hashing decide whether work is lost.

---

## TB12: Open-request queue, `{ focus }` answers, I7 `session`

**Description:** F11, F12 and T17's main side (R37). `model/open-requests.ts`: opens wait in a
first-in-first-out queue of at most 20 (more are dropped and logged) instead of "latest wins"; a
pending close still waits as before. `second-instance` and the first-launch argument feed the queue;
I7's `open` is opened after the session is restored. I1 `chooseOpen`, I3 `openDroppedFile` and the
`main:event { open }` answer `{ focus: tabId }` instead of a ref when the path (`fs.realpath.native`,
compared case-insensitively through TB8's registry) is bound to a tab; a picture tab is bound to its
picture; nothing is read in that case. New `main:event { focus-tab, tabId }`. I7 `startup` gains
`session: { tabs: { id, kind, name, view, unsaved, warning }[], active } | null` read through TB9
(the `recovery` field stays until TB21) and `open: FileRef | { focus } | null`. Additive: the
renderer still ignores `session` until TB20.

**Tests first:** `open-requests.test.ts` (FIFO order, the 21st request dropped and logged, a close
waits and is not reordered, three Explorer requests arrive as three opens, before the first N1 the
queue holds them); a registry-backed test that a second launch with a path bound to tab A answers
`{ focus: A }` and reads nothing; a differently-cased path is the same tab; `ipc-schemas` (I1, I3, I7
answers); `e2e/app-instance.spec.ts` and `app-drop.spec.ts` stay green (they still test the old
single-tab behaviour; their rewrite is TB30).

**Acceptance criteria:**
- [x] Opens queue first in, first out, at most 20; a close request is unchanged
- [x] An open of a bound path answers the tab id and never reads the file
- [x] I7 carries `session` and `open`; the old `recovery` still works
- [x] `src/main/model` coverage >= 90 % lines; existing e2e unchanged and green

**Verification:** `npm test -- src/main src/preload`, `npx playwright test --project=e2e e2e/app-instance.spec.ts e2e/app-drop.spec.ts`, then `npm run check`.

**Dependencies:** TB10

**Files:** `src/main/model/open-requests.ts`, `open-requests.test.ts`, `src/main/files.ts`, `src/main/index.ts`, `src/main/lifecycle.ts`, `src/main/ipc-schemas.ts`, `src/shared/ipc-types.ts`, `src/preload/api.d.ts`

**Scope:** M

**Model:** opus: queue ordering against the start-up handshake and the single-instance event; a wrong order opens files into the wrong tab or loses an open.

---

## TB13: Main: window close, shutdown, deletion of discarded records

**Description:** SS10 and F13, main side. The window `close` still goes through `close-requested`;
`closeOk` (N5) now waits for TB9's chain to be empty (every queued record, index and auto-save write
finished) before closing; `render-process-gone` and a close after `session-end` close at once. The
`main:event` schema gains `{ type: 'flush-session' }` (sent from TB20 in place of `flush-recovery`;
R25 amended: best effort, nothing awaited, `query-session-end` still prevents nothing and waits for
nothing). After the chain is empty at close, main deletes the records TB8 lists as discarded; at the
next start it deletes them after a valid index read (SS11, TB9). Nothing prompts in main. The Windows
session-end logic stays pure and tested with synthetic events.

**Tests first:** lifecycle tests with fake windows and a fake chain: `closeOk` with writes in flight
waits for them and then closes once; a failing write does not block the close forever;
`query-session-end` sends only the event, prevents nothing and changes no close-guard state; after
`session-end` a close goes ahead without waiting for the renderer; `render-process-gone` closes;
discarded records are deleted after the chain is empty and never when the index was not read validly
(a damaged index deletes nothing).

**Acceptance criteria:**
- [x] The window never closes while the session chain has work (tests with a slow fake write)
- [x] Discarded records are deleted only per SS11's rule; no `.chalk` or picture file is ever deleted
- [x] The R24 and R25 guard logic is unchanged apart from the event name in the schema
- [x] `e2e/app-draft-close.spec.ts` and `e2e/app-recovery.spec.ts` stay green (the old events are still used until TB20)

**Verification:** `npm test -- src/main`, `npx playwright test --project=e2e e2e/app-draft-close.spec.ts e2e/app-recovery.spec.ts`, then `npm run check`.

**Dependencies:** TB9, TB10, TB12

**Files:** `src/main/lifecycle.ts`, `lifecycle.test.ts`, `src/main/index.ts`, `src/main/session-store.ts`, `src/shared/ipc-types.ts`

**Scope:** M

**Model:** opus: close and shutdown ordering is where a late write is lost or a close hangs.

---

### Checkpoint B: main
- [ ] `npm run check` green; `src/main/model` >= 90 % lines
- [ ] Windows: `npm run test:e2e` unchanged and green (nothing user-visible changed)
- [ ] Commit

---

## TB14: Renderer tab list model (`model/tabs.ts`)

**Description:** T1, T3, T4, T7 (list part), T8 (list part), T12 (list part), T13 (move), T17's
replace-empty rule, T18. Pure and DOM-free. A tab is `{ id, kind: 'untitled' | 'chalk' | 'picture' |
'kept', name, ref, available, state: EditorTabState | null }` (CO2; `ref` is opaque, the renderer
never holds a path). Operations: `newUntitled` (id from an injected `newId`, name by T4: `Untitled`,
then the smallest free number, `Untitled` counts as 1), `open` (append at the end and activate),
`openInto` (T17: when the active tab is `untitled`, its drawing empty, no undo and no redo step
(`tabStateCanUndo` / `tabStateCanRedo`), the file opens in that tab, which keeps its id; label and
kind change), `activate`, `next` / `previous` (wrap), `byNumber(n)` (1-8 nothing when absent) and
`last` (9), `move(from, to)`, `close` (activates the right neighbour, else the left; R39: closing the
last tab leaves one new empty `Untitled`, and nothing happens when it already is an empty `untitled`
tab with no undo step), the reopen list (at most 10 entries, newest first, in memory: state, label,
kind, binding marker, old position; `reopen` gives a fresh id, puts the old id in `discarded`, clamps
the position, keeps the name if free else the smallest free one; an entry whose file is open in
another tab is dropped and that tab focused), `label(tab)` (T3: a `.chalk` without extension, a picture
with it, `kept` its former label or `<label> (your changes)`).

**Tests first:** untitled numbering with gaps (close 2 of 1,2,3 then new gives 2), names survive
state round trips, replace-empty rule for every combination (empty drawing but one undo step: no
replace; one redo step: no replace; `chalk` tab: no replace), activation after closing the first,
middle, last and only tab, R39 both cases, `next` / `previous` wrap, `byNumber` and `last` on 1, 3 and
12 tabs, `move` to both ends and to itself, reopen list capped at 10 with the oldest dropped,
reopen position clamped after tabs were closed, fresh id and `discarded`, the free-name rule, T18
(`newDrawingStyle` is a parameter of `newUntitled`'s doc, ST1), labels.

**Acceptance criteria:**
- [x] Every operation above is a pure function over immutable data and the tests pass
- [x] `src/renderer/app/model` coverage >= 90 % lines; the DOM-free lint block holds

**Verification:** `npm test -- src/renderer/app/model`, then `npm run check`.

**Dependencies:** TB5 (the opaque `EditorTabState` and `tabState*` predicates)

**Files:** `src/renderer/app/model/tabs.ts`, `tabs.test.ts`

**Scope:** M

**Model:** sonnet: list manipulation with exact rules and table tests.

---

## TB15: Session record and tab status (`model/session-record.ts`, `model/tab-status.ts`)

**Description:** SS3 record, F7's amended definitions, T6's marker, W3's `*`. `session-record.ts`:
strict Zod `{ format: 'chalkbond-tab'; version: 1; name; kind; edited: boolean; editor:
EditorTabRecord }`, `buildRecord(tab, state, { maxSteps: 100 })` and, when the JSON exceeds 64 MiB,
halving `maxSteps` until it fits (oldest steps go first), `parseRecord(text)` returning the record
or a damage result (the renderer's half of SS11). `tab-status.ts`: *unwritten changes* of a file
tab = SHA-256 of `serialize(drawing)` differs from its written hash (an injected `sha256` port;
`controller.isDirty()` is not used), *unsaved* (`untitled` with a non-empty drawing, `picture` edited
since opened, `kept`, a file tab that is unavailable with unwritten changes), *unkept* (record write
failed and the drawing exists only in the store), the T6 marker (`dot`, `warning`, none), the
accessible-name suffixes of T16, W3's title and `*`, the flags sent in N8 (`unsaved`, `warning`), and
the marker of a tab not loaded in this run read from the index flags.

**Tests first:** record schema (extra key rejected, wrong `format`, wrong `version`, bad `kind`),
size halving with a fake oversized record (oldest steps dropped first, result under the cap), a
corrupt record is a damage result and never throws; status table for every kind x {empty, content,
edited, unavailable, unkept} including a file tab whose text is not in `serialize`'s exact form but
whose hash equals the written hash (no unwritten changes: item (K)'s premise); marker and name for
each state; title `*Untitled 2 - Chalkbond`, `esterification - Chalkbond` while it saves,
`*esterification (your changes) - Chalkbond`; an unloaded tab shows its stored flags.

**Acceptance criteria:**
- [x] F7's two notions and SS6's *unkept* exist as pure functions and match the spec's Terms paragraph
- [x] A record over 64 MiB is made smaller by halving `maxSteps`, never refused outright
- [x] `src/renderer/app/model` coverage >= 90 % lines

**Verification:** `npm test -- src/renderer/app/model`, then `npm run check`.

**Dependencies:** TB6, TB14

**Files:** `src/renderer/app/model/session-record.ts`, `session-record.test.ts`, `tab-status.ts`, `tab-status.test.ts`

**Scope:** M

**Model:** opus: these definitions decide when a tab counts as saved or pending; a mistake hides unsaved work or writes over a file.

---

## TB16: Auto-save timer and the SS4 write schedule

**Description:** `model/recovery-timer.ts` is renamed `model/autosave-timer.ts` (AS2: 2 s after the
last change of the drawing, never more than 10 s after the first unwritten change of a burst,
injected clock; behaviour unchanged, so the old RC1 caller in `host.ts` keeps working until TB20).
New `model/write-schedule.ts` (SS4), pure: given events (drawing or history changed, tab list /
order / active / names / kinds / bindings / markers changed, a `view` event, a switch, Save, Save as,
the window close, `flush-session`) it says which writes are due now or at which time: the active
tab's record on AS2's timer whenever its drawing or history changed since the last record (every
kind), at once on the flush points; the index 500 ms after a tab-list change (debounce, like ST3),
2 s after a view change, after every AS1 write and at the flush points; nothing for an inactive tab
that did not change.

**Tests first:** the existing `recovery-timer.test.ts` assertions move to `autosave-timer.test.ts`
unchanged (2 s after the last change, 10 s cap, reset after a write, injected clock); schedule
tables: burst of changes -> one record write at 2 s and at the 10 s cap; an index write 500 ms after
the last tab-list change and 2 s after a view change; a switch flushes the outgoing tab's record at
once; a view event alone writes no record; two inactive tabs untouched write nothing.

**Acceptance criteria:**
- [x] `autosave-timer` behaviour identical to the old timer; `recovery-timer.ts` no longer exists and `host.ts` compiles
- [x] The schedule matches SS4's sentence by sentence (a test per clause)
- [x] `src/renderer/app/model` coverage >= 90 % lines

**Verification:** `npm test -- src/renderer/app`, then `npm run check`.

**Dependencies:** TB1

**Files:** `src/renderer/app/model/autosave-timer.ts`, `autosave-timer.test.ts`, `write-schedule.ts`, `write-schedule.test.ts`, `src/renderer/app/host.ts` (import), `src/renderer/app/host.test.ts`

**Scope:** S

**Model:** sonnet: a rename plus a timing table over an injected clock.

---

## TB17: Tab flows 1: new tab, open into tabs, switch, reopen, restore

**Description:** `src/renderer/app/model/tab-flows.ts` over injected ports (`main`, `controller`,
`sha256`, `clock`, `newId`, `notify`, `finishEditing`, `ask`), one in-progress flag, shared with
TB18 and TB19. T7 new tab (always adds). T17 opening: ask main first (`{ focus }` answers activate
that tab and read nothing), else F3 validation of the bytes (a failure leaves every tab as it was),
success opens in a new tab at the end or in the empty untitled active tab (TB14's rule), I12 binds
the ref, main records the file hash and the renderer sends the SHA-256 of `serialize(drawing)` as the
written hash; opens wait in a first-in-first-out queue of at most 20 while a flow runs; a drop opens
every file with an Open extension, each in its own tab in order. T11 switch: F4a, the outgoing tab
taken out (`takeState`), its record and, if it has unwritten changes, its file written now (TB18's
`flushTab`, a port here), the incoming state put in from memory or first read from the store (I11,
`tabStateFromRecord` with the index's view and `saved` from the written hash; a file tab checked by
I14); the outgoing drawing stays on screen and input is ignored until the incoming state is in place;
then title, MenuState, notices cleared; focus rule. T12 reopen: newest entry, fresh id, record written
at once, I12 `reopen`, activated, a file tab re-checked; a file open elsewhere focuses that tab and
drops the entry. SS7 restore: the strip from the index at once, only the active tab loaded before the
canvas is usable, then I7's `open` and queued opens; no index and no records -> one empty `Untitled`;
SS11's renderer half (a damaged file-tab record opens from its file with history lost, any other kind
loses that tab and shows N-A5, an orphan opens as `kept`).

**Tests first (fake ports, node):** `new tab` while the active tab is an empty Untitled still adds;
opening a bound path activates and reads nothing; a failed validation changes nothing; the
empty-untitled replacement keeps the id; 25 queued opens run 20 in order; **item (A)** a reopened tab
gets a fresh id, its record is written at once and survives a restart after its old id was
discarded; **item (B)** after a restart an unloaded Untitled with content and an edited picture tab
show their dot from the index; a switch writes the outgoing record before the incoming state is
put in; the switch ignores input while in flight; an unloaded tab is read on first activation and a
record that does not parse is SS11's; restore with no index gives one `Untitled`; a damaged
record: file tab recovers from its file, other kinds N-A5; the active tab loads before the canvas is
usable and no other record is read on the normal start path (SS8).

**Acceptance criteria:**
- [x] T7, T11, T12, T17, SS7 and SS11's renderer half behave as the Description says, each with a test over fake ports
- [x] No record other than the active tab's is read at start (SS8, asserted on the fake `readTabRecord` call log)
- [x] `src/renderer/app/model` coverage >= 90 % lines

**Verification:** `npm test -- src/renderer/app/model`, then `npm run check`.

**Dependencies:** TB12, TB14, TB15, TB16

**Files:** `src/renderer/app/model/tab-flows.ts`, `tab-flows.test.ts`, `__fixtures__/tab-flows-ports.ts` (the shared fake-port harness for TB17-TB19; `__fixtures__` is excluded from coverage by `vitest.config.mts`)

**Scope:** L

**Model:** opus: a state machine over async ports where the order of take, write and put decides whether a drawing is kept.

---

## TB18: Tab flows 2: auto-save, outside change, Save and Save as

**Description:** AS1-AS9 and F5, F6 in the renderer, in the same flow family. AS1 (a file tab sends
`{ tabId, text: serialize(doc) }` and keeps the `doc` object), AS2 (timer for the active file tab;
at once on switch, close, Ctrl+S, window close, `flush-session`), **AS3** result goes to its tab by
`tabId`: `ok` marks saved only if that tab is still active and `getDoc()` is the very `doc` written,
nothing if the drawing changed meanwhile, `tabStateMarkSaved(state, doc)` for an inactive tab; a
problem is AS6 or AS7. AS4 Ctrl+S (unsaved kinds -> F6, a file tab -> write now plus N-A1; Save as on
a file tab binds the tab to the new file, the old file keeps its last auto-saved state). AS5 check
points (tab becomes active, restored active tab, window focus), AS7 waits until the host is idle (no
gesture, no label or text editor, no flow). AS6 unavailable state: auto-save pauses, the store keeps
the changes, the box once when the host is next idle, notices N-A3 and N-A7, retried at every check
point, recovers when `same` or the bytes open. AS7 (a) no unwritten changes and the bytes open:
`replace-doc` labelled "Changed outside Chalkbond", N9 with the written hash, `markSaved()`, N-A4;
(b) the bytes do not open: AS6; (c) unwritten changes: her tab becomes `kept`, label `<label> (your
changes)`, unbound (I12 `unbind`), the changed file opens beside it (I12 `take-over`) when it opens,
the box says where each is. AS8, AS9 (`open-in-tab` box from I12 `openIn`). F6: suggested name and
folder rules per the spec, success binds the tab and it auto-saves from then on.

**Tests first (fake ports):** **item (1)** a write result for tab A arriving after a switch to an
edited picture tab B marks A's stored state saved and leaves B unsaved, so closing B asks (the close
half is in TB19; here B's status stays unsaved); a result for the active tab whose drawing changed
meanwhile marks nothing; **item (2), timer half:** the timer record uses `snapshotState` during a
drag, with a label editor open and during an IME composition and changes no editor state;
**item (5), renderer half:** a record written before the file then a restart gives no false conflict
(the drawing's hash equals the written hash; the file with the in-flight text is `same`), an outside
edit with no unwritten changes is AS7(a), never a "(your changes)" copy; **item (6):** unparsable
bytes with nothing unwritten -> AS6, the tab stays bound and recovers when the file parses;
**item (K):** open a file not in `serialize`'s form and wait 15 s of fake time: nothing is written;
AS7 waits for idle after a window-focus check; AS6 box shown once per tab; a `kept` tab's label;
AS9; F6 suggested names and folders; N-A1 only after an explicit Save.

**Acceptance criteria:**
- [x] Items (1), (2) timer half, (5) renderer half, (6) and (K) pass as fake-port tests
- [x] A write result never touches any tab but the one in its `tabId` (asserted over all three tab states)
- [x] Nothing is ever marked saved on an `ok` whose `doc` is not the drawing now in the tab
- [x] `src/renderer/app/model` coverage >= 90 % lines

**Verification:** `npm test -- src/renderer/app/model`, then `npm run check`.

**Dependencies:** TB10, TB17

**Files:** `src/renderer/app/model/tab-flows.ts`, `tab-autosave.ts` (if the file grows past about 500 lines), their tests

**Scope:** L

**Model:** opus: result routing, hashing and outside-change handling are the data-loss core of this feature.

---

## TB19: Tab flows 3: close a tab, unkept, window close, shutdown flush

**Description:** T8, T9, R39, SS6 (renderer half), SS10, F4, F4a and F13, R51. T8's five steps
in order: F4a for the active tab; load an unloaded tab first (record read and parsed, a file tab's
file checked, an unreadable record is SS11's and closes without asking); write a file tab with
unwritten changes now (AS1), and if that write or the tab's state is anything but `ok` and
available the result is applied first and the tab is then unsaved; an unsaved or unkept tab asks with
T9 (the tab is activated first; Save -> F6 and the tab closes only if the write succeeded and the
drawing is unchanged since (R14); Don't save closes and goes to the reopen list; Cancel does
nothing); everything else closes silently and goes to the reopen list. SS6: a record write that fails
makes a store-only tab *unkept* (T6 warning, T8 asks), the "Couldn't keep" box once per tab when the
host is next idle, every later change retries and the first success clears it; a file tab whose text is
written is not affected. SS10: a window close (`close-requested`) never prompts except T9's box for
each unkept tab in strip order, each activated first (Save -> F6, Don't save drops it, Cancel stops
the close); then F4a, the active tab's record (`snapshotState`) and its AS1 write if it has unwritten
changes, the index with `discarded`, N5. `flush-session` (query-session-end): finish an open label or
text editor through its commit path unless an IME composition is in progress, then send the record,
the AS1 write and the index at once, best effort, nothing awaited.

**Tests first (fake ports):** every T9 answer (Save succeeded and unchanged, Save but the drawing
changed during the write -> stays open, cancelled or failed Save as -> stays open, Don't save ->
closes and is reopenable, Cancel); a named file closes silently after its pending write; an empty
Untitled and an unedited picture close silently; R39 both cases; **item (3)** closing a tab not
loaded this run reads its record first: an Untitled with content asks, a file tab whose record is
newer than its file is written first; **item (4)** a close-time write answering `changed` or a failure
makes the tab unsaved and T9 asks; **item (7)** a failing record write marks a store-only tab unkept
(a written file tab is not), the box shows once, T8 asks, a later success clears it; the window close
with an unkept tab shows T9 for that tab only, Don't save closes, Cancel keeps the window open, and
with no unkept tab no box appears (R51); **item (2), shutdown half:** the flush during a drag, with a
label editor open and during an IME composition uses `snapshotState` and changes no editor state
(except finishing the editor when no composition runs).

**Acceptance criteria:**
- [x] Items (3), (4), (7) and (2)'s shutdown half pass; every T9 answer has a test
- [x] A close never discards a tab whose drawing exists nowhere else without T9 (R34), except Don't save
- [x] The window close shows no box when no tab is unkept (R35)
- [x] `src/renderer/app/model` coverage >= 90 % lines

**Verification:** `npm test -- src/renderer/app/model`, then `npm run check`.

**Dependencies:** TB13, TB18

**Files:** `src/renderer/app/model/tab-flows.ts`, `tab-close.ts` (if the file grows past about 500 lines), their tests

**Scope:** L

**Model:** opus: closing and shutdown are where an unsaved drawing is silently lost.

---

## TB22: Host keys K1, K2, K3

**Description:** `src/renderer/app/model/keys.ts` and `host-keys.ts` (K1, K2, K3, R36, R45). `KeyInfo`
gains `code`. New K1 rows, all "idle (also in the name field)": Ctrl+T and Ctrl+N (new tab), Ctrl+W
(close), Ctrl+Tab / Ctrl+PageDown and Ctrl+Shift+Tab / Ctrl+PageUp (next, previous, wrap), Ctrl+1 ...
Ctrl+8 (tab n) and Ctrl+9 (last) matched on `KeyboardEvent.code` (`Digit1` ... `Digit9`, `Numpad1` ...
`Numpad9`), Ctrl+Shift+T (reopen, only when the list is non-empty), F10 alone and a lone Alt (open
the ☰ menu, no in-window dialog). Every other key keeps matching `key`. While a label or text editor
is open the file keys, tab keys, Ctrl+E and F1 do nothing (F10 and a lone Alt still open the menu).
K3: `altGuard` gains the "alone" state: an Alt `keyup` opens the menu only when Alt went down and came
up with no other key, no pointer press and no window blur in between (Alt's auto-repeat does not
count); the R4 guard (a pointer press with Alt held arms it; the next Alt `keyup` is prevented and
opens nothing) stays. The decisions are returned as actions; TB20 wires them to the flows and TB26 to
the ☰ menu.

**Tests first:** `keys.test.ts` table for every new row (idle and not idle, in the name field, with an
open editor, dialog open: nothing), `code` matching with a Devanagari `key` and Numpad digits, Ctrl+9
with 1, 3 and 12 tabs, Ctrl+Shift+T disabled when the list is empty; K3 table: Alt+click, Alt+Shift
(language switch), Alt+Tab, Alt+F4, blur between down and up, auto-repeat, Alt alone opens, Alt then
click then up does not; **K2's extended conflict test** (host keys against the editor's `globalCommand`
and `canvasKey`: Ctrl+T, W, Tab, Shift+Tab, PageUp, PageDown, 1-9, Shift+T and F10 return `null`;
Ctrl+Shift+R is not a host key; Ctrl+Shift+0 is bound by neither).

**Acceptance criteria:**
- [x] Every R36 key and F10 / lone Alt decide as K1 and K3 say; K2's extended conflict test passes
- [x] `host-keys.ts` passes `code` and the listener stays capture-phase, preventing and stopping handled keys
- [x] `src/renderer/app/model` coverage >= 90 % lines

**Verification:** `npm test -- src/renderer/app src/renderer/editor/model`, then `npm run check`.

**Dependencies:** TB3, TB14

**Files:** `src/renderer/app/model/keys.ts`, `keys.test.ts`, `src/renderer/app/host-keys.ts`, `src/renderer/app/host.test.ts`

**Scope:** M

**Model:** sonnet: a pure decision table with a small key-state machine, fully specified.

---

## TB23: Shortcuts dialog and A12 rows

**Description:** `src/renderer/app/model/shortcuts.ts` equals `docs/mockups/shell/pages.mjs`
SHORTCUTS: Chemistry's Tidy row is `Ctrl+Shift+R`; View has no `Ctrl+1` row; the Files section
becomes "Tabs and files" (Ctrl+T and Ctrl+N New tab, Ctrl+W, Ctrl+Shift+T, Ctrl+Tab and Ctrl+Shift+Tab,
`Ctrl+1–8`, `Ctrl+9`, Ctrl+O, Ctrl+S, Ctrl+Shift+S, Ctrl+E, F10 "Open the menu", F1). `keyParts`
handles `Ctrl+1–8`. `ShortcutsDialog.tsx` and its test follow (A12). Mark `DEVIATIONS.md` item 5
done.

**Tests first:** `shortcuts.test.ts`: the section list (eight, "Tabs and files" in place of
"Files"), the exact rows of the mock-up (copy them from `pages.mjs`), every row maps to a key the
app has: Tidy through `globalCommand`, the tab keys through `hostKey` (using TB22's `code`
matching), `Ctrl+1–8` expands to eight real keys, `F10` through the host; the "every key is listed"
test loses Ctrl+1 and Ctrl+Shift+T-as-Tidy and gains the host's tab keys; `ShortcutsDialog.test.tsx`.

**Acceptance criteria:**
- [x] The dialog lists exactly A12's rows and each is a working key
- [x] No row names a key that does nothing (the test asserts through the real keymap and `hostKey`)
- [x] `DEVIATIONS.md` item 5 reads as done

**Verification:** `npm test -- src/renderer/app`, then `npm run check`.

**Dependencies:** TB3, TB22

**Files:** `src/renderer/app/model/shortcuts.ts`, `shortcuts.test.ts`, `src/renderer/app/ShortcutsDialog.tsx`, `ShortcutsDialog.test.tsx`, `docs/mockups/shell/DEVIATIONS.md`

**Scope:** S

**Model:** sonnet: copying a normative table and updating its tests.

---

## TB24: Tab strip view: roles, markers, labels, tooltips

**Description:** `src/renderer/app/TabStrip.tsx` and `tab-strip.css` (T2, T3, T5, T6, T16; mock-up
A18; tokens `--tabstrip-h`, `--tab-h`, `--tab-min-w`, `--tab-max-w`, `--tab-close`, `--tab-add`,
`--dot-size`; no raw colours). Props: the tab view-models, the active id and callbacks (activate,
close, new); no flows inside. `role="tablist"` `aria-label="Open drawings"`; tabs `role="tab"`,
`aria-selected`, roving `tabindex` (one tab stop), `data-testid="tab"`, `data-tab-id`; × with
`aria-label="Close <label> (Ctrl+W)"`, `tabindex="-1"`, shown on the active, hovered and focused tab
with its room always kept; the + button (`aria-label="New tab (Ctrl+T)"`, `data-testid="tab-add"`)
after the last tab; the marker is `aria-hidden` and the accessible name carries `, not saved as a file
yet` or `, couldn't save`; arrows, Home, End move focus (wrapping), Enter and Space activate;
click and middle-click; the canvas region is the `role="tabpanel"` (passed through TB4's
`tabPanelLabelledBy`). Tooltips follow T5's texts after the editor's delay: the app has no Tooltip
component and the editor's is internal (`index.ts` exports none), so add `ui/Tooltip.tsx` in the app
using the editor's tooltip classes and tokens, without a new editor export. App CSS also holds the 28
px option buttons below 1100 px when a strip is present (`--option-btn-compact`, A21).

**Tests first (`TabStrip.test.tsx`, markup):** one tab, several, the active tab, every marker state
(none, dot, warning), the three help texts, label ellipsis class and full-label tooltip, roles and
names for each state, the × tab order and visibility class, the + button name, roving `tabindex`
(exactly one 0), the keyboard handler table (arrows wrap, Home, End, Enter, Space, no activation on
arrows), CSS check that every colour and size is a token (the existing `shell-tokens` test walks all
`.css` in the folder).

**Acceptance criteria:**
- [x] Roles, names and the markup contract of T16 hold in the tests
- [x] No hit target below 24 x 24 px in the CSS (asserted by the DOM-box e2e in TB27, and by token values here)
- [x] `tests/tooling/shell-tokens.test.ts` passes (defined tokens, no raw colours)
- [x] Not mounted in the app yet (TB20)

**Verification:** `npm test -- src/renderer/app tests/tooling/shell-tokens.test.ts`, then `npm run check`.

**Dependencies:** TB4, TB14

**Files:** `src/renderer/app/TabStrip.tsx`, `TabStrip.test.tsx`, `tab-strip.css`, `src/renderer/app/ui/Tooltip.tsx`, `src/renderer/app/ui/primitives.test.tsx`

**Scope:** M

**Model:** sonnet: a presentational component to a normative mock-up with markup tests.

---

## TB25: Tab strip interactions: reorder, overflow, tab menu trigger

**Description:** T13, T14, T15's trigger, CM4. Drag a tab sideways past 4 px: the others make room
(instantly under `prefers-reduced-motion`), release drops, Esc, a right press or capture loss cancel,
inside the strip only (no tear-off); a pure `model/tab-drag.ts` decides the drop index. Overflow: tabs
share the strip up to `--tab-max-w`, shrink to `--tab-min-w` (the active tab's × stays reachable), then
the strip scrolls: the wheel over the strip and two chevron buttons (`tabindex="-1"`, shown only while
it overflows, only on a side with more tabs); the active tab is scrolled into view also after a key
switch; the + button stays visible. Right-click on a tab and the context-menu key or Shift+F10 on a
focused tab call `showTabMenu` (I10, TB11) at the cursor or under the tab; Close tab acts on the
right-clicked tab. Double-click on the empty strip is new tab.

**Tests first:** `tab-drag.test.ts` (threshold, drop index at both ends, cancel cases, drag in a
scrolled strip); markup tests for the chevrons (shown only on overflow, one side at a time); the
context-menu key handler table; reduced-motion CSS class; the e2e for these is TB27.

**Acceptance criteria:**
- [x] Drag rules and cancel cases are tested as a pure model; the strip calls it
- [x] Overflow behaviour (shrink, scroll, chevrons, scroll into view) matches T14
- [x] The tab menu opens by right-click, the context-menu key and Shift+F10 and acts on that tab (a callback test)

**Verification:** `npm test -- src/renderer/app`, then `npm run check`.

**Dependencies:** TB11, TB24

**Files:** `src/renderer/app/model/tab-drag.ts`, `tab-drag.test.ts`, `src/renderer/app/TabStrip.tsx`, `TabStrip.test.tsx`, `tab-strip.css`

**Scope:** M

**Model:** sonnet: pointer geometry and CSS with a pure model and markup tests.

---

### Checkpoint C: the pieces exist
- [ ] `npm run check` green; `src/renderer/app/model` >= 90 % lines
- [ ] Commit

---

## TB20: Host switch-over: tabs and the session store replace the recovery file

**Description:** The behaviour change. `App.tsx` and `host.ts` own the tab list (TB14), mount
`TabStrip` in the editor's `tabs` slot with `tabPanelLabelledBy`, and run TB17-TB19's flows over the
real preload functions; the controller subscription (CO3) feeds the write schedule (TB16): `doc` ->
record and AS2 timer, `view` -> the index, tab-list changes -> the index (N8), a `focus-tab` or
`open { focus }` event -> activate. Start-up (SS7) reads I7's `session` and `open`; no recovery offer.
Main now sends `flush-session` instead of `flush-recovery` on `query-session-end` (R25) and the
close path is TB13's. W3: N1 carries the active tab's title (`*` per F7's *unsaved*, T3's label).
`Ctrl+N` / New, Open, Open recent, a drop and a double-click open tabs (F1-F3, F10-F12) with no
unsaved-changes prompt. The host actions from TB22 are wired. The test hook (`test-hook.ts`) gains
`readTabs()` (id, label, kind, active, markers) and `activateTab`, and `e2e/harness.ts` the matching
helpers (`openTab`, `readTabs`, `tabKeys`) so TB27-TB30 need no new seams. The ☰ button and the native
menu bar are TB26's: the application menu is still installed here and its New item runs T7.
**e2e rewritten here (same commit; none skipped or deleted without a replacement):**
`app-recovery.spec.ts` becomes `app-session.spec.ts` (edit, 12 s, kill, relaunch with the same user
data: the drawing is back with no box; TB28 extends it), `app-draft-close.spec.ts` (the window close
with an open label editor: the committed label is in the store, no box), `app-files.spec.ts` (New is a
new tab and is skeletal, Save then Open round trip in tabs, Save as binds the tab, Ctrl+S on Untitled is
Save as, no prompt anywhere), `app-instance.spec.ts`, `app-drop.spec.ts`, `app-recent.spec.ts`,
`app-open-errors.spec.ts`, `app-open-pictures.spec.ts`, `app-open-unsupported.spec.ts`,
`app-test-hook.spec.ts`, `app-settings.spec.ts` and any other spec the suite shows failing against the
new behaviour, plus `e2e/recovery-steps.ts` (renamed for the session store).

**Tests first:** the host wiring is covered by node tests of `host.ts` with fake ports (a `doc` event
schedules a record write; a `view` event an index write; a `focus-tab` event activates; N1's title
follows the active tab and F7's *unsaved*); the e2e rewrites above are the RED step: run them first
and see which fail for the old behaviour. `host.test.ts` and `test-hook.test.ts` for the hook additions.

**Acceptance criteria:**
- [x] No box ever appears for New, Open, a drop or a close of a named or empty tab; the window close shows none (R51's box is TB28's e2e)
- [x] Killing the app after 12 s and relaunching with the same user data restores the drawing (the rewritten `app-session.spec.ts`)
- [x] The whole `npm run test:e2e` is green on Windows at this commit (342 existing specs, rewritten where the specs supersede them) (2026-11-12: 344 passed at this commit; check 5475 tests; `src/renderer/app/model` 99.34 % lines)
- [x] Every e2e file still ends by asserting `blockedRequests === 0`; `src/renderer/app/model` coverage >= 90 % lines

**Verification:** `npm test -- src/renderer/app`, `npm run test:e2e` (Windows, about 7 minutes), then `npm run check`.

**Dependencies:** TB19, TB22, TB24, TB25

**Files:** `src/renderer/app/App.tsx`, `host.ts`, `host.test.ts`, `host-keys.ts`, `model/test-hook.ts`, `model/menu-state.ts`, `src/main/index.ts`, `src/main/lifecycle.ts`, `e2e/harness.ts`, `e2e/launch.ts`, the e2e files listed above, `e2e/recovery-steps.ts`

**Scope:** L

**Model:** opus: the commit that makes persistence live; a wiring error here loses or double-writes drawings, and it rewrites the suite that guards the old behaviour.

---

## TB21: Retire the recovery code

**Description:** Delete what TB20 left unused: `src/main/recovery.ts` and its test, channels N3
(`writeRecovery`) and N4 (`clearRecovery`) and `sessionFile` (N2 stays as part of I12), the
`flush-recovery` event, I4's `{ kind: 'recover' }`, I7's `recovery` field, the renderer's
`model/recovery.ts`, `model/session.ts` (`recovered`, `forcedDirty`) and the F1/F4 prompt paths of
`model/file-flows.ts` that tabs replaced (what remains: Open's validation, F14 errors, Save as's dialog
use, as the tab flows call them), their tests and the `app-lint` / SEC5 key lists. The old
`userData/recovery/` folder of earlier builds is neither read nor deleted (SS7, R35).

**Tests first:** the preload key list test (`e2e/app-security.spec.ts`) and `ipc-schemas.test.ts`
expect the final channel set (I9-I14, N7-N9 present; N3, N4 absent); a tooling test that no
`recovery` identifier remains under `src/main` and `src/renderer/app` except the SS7 comment that
says the old folder is ignored; `lifecycle.test.ts` for the single close path.

**Acceptance criteria:**
- [x] The code and tests named above are gone and `npm run check` is green (no `eslint-disable`, no skipped test to get there)
- [x] Coverage thresholds hold without excluding anything; `npm run test:e2e` stays green
- [x] SEC5's documented key list equals `Object.keys(window.chalkbond)`

**Done 2026-11-13 (as built):** `recovery.ts`, `model/recovery.ts`, `model/session.ts`, `model/file-flows.ts` and their tests are deleted; `parseProblem` (the only part the tab flows used; they validate with their own `drawingOf`) moved to `model/file-problem.ts` with its test. N2 `sessionFile`, N3, N4, the `flush-recovery` event, I4 `recover` (and `recoverBox`), I7 `recovery` and `askSchema`'s recover kind are gone; `AskAnswer` is no longer generic; main's `sessionRef` and its dead "Save in place counts" recent rule are removed (F10 amended in the spec); `lifecycle.ts` loses `recoveryIdle` (one close path). New tests: `src/shared/channels.test.ts` (final channel set), `tests/tooling/app-recovery-retired.test.ts` (no recovery mention except the SS7 comment), a no-retired-schema check in `ipc-schemas.test.ts`; `e2e/app-security.spec.ts` and `app-window.spec.ts` expect the final key list and startup. Spec: I4, I7, N2-N4, main events, SEC5 (the documented list), F10, file layout. Left alone: `session-folders.ts`'s `sessionFile` method and its picture-folder (A6) rule, now only reachable through I12 binds. Verification: `npm run check` exit 0 (259 files, 5408 tests); `npm test -- --coverage` exit 0 (thresholds hold); full `npm run test:e2e` on Windows 402 passed (10.9 m).

**Verification:** `npm run check`, then `npm run test:e2e` (Windows).

**Dependencies:** TB20, TB26 (both edit `index.ts`, the IPC files and the preload)

**Files:** `src/main/recovery.ts`, `recovery.test.ts`, `src/main/index.ts`, `src/main/ipc-schemas.ts`, `src/shared/channels.ts`, `src/shared/ipc-types.ts`, `src/preload/index.ts`, `src/preload/api.d.ts`, `src/renderer/app/model/recovery.ts`, `recovery.test.ts`, `session.ts`, `session.test.ts`, `file-flows.ts`, `file-flows.test.ts`, `tests/tooling/app-lint.test.ts`, `e2e/app-security.spec.ts`

**Scope:** M

**Model:** sonnet: deleting dead code behind a passing suite; the risky decisions were made in TB20.

---

## TB26: ☰ button, menu model rows, application menu removed

**Description:** R32, R46, R47, M1, M4, M5, M6, W4, W6, N1. Main: `src/shared/menu.ts` gains
`MenuState.canReopenTab` and the two File rows' enabled rules (`file.reopen-tab` needs it,
`file.close-tab` needs idle only); `menu-model.ts` rows per the spec table: `&New tab` (`file.new`,
`CmdOrCtrl+T`), `Reopen closed &tab`, `&Close tab`, and `Zoom to &100%` with **no** accelerator; I9
`app-menu:show` / `showAppMenu` (`{ state, x, y }` in content CSS px, clamped to the content size;
builds the four submenus from the request's state with `popup({ window, x, y })`; one popup at a time,
M5; items main runs itself answer null) with the preload function; `Menu.setApplicationMenu(null)`
and the old installed-menu code removed (`autoHideMenuBar` untouched); N1 becomes `{ title }` only.
Renderer: `src/renderer/app/MenuButton.tsx` in the editor's `menu` slot: `menu` icon 20 px,
`aria-label="Menu"`, `aria-haspopup="menu"`, `aria-expanded` while open, `data-testid="app-menu"`,
disabled (V3) while an in-window dialog is open, a mouse press does not take focus from the canvas
(editor K5), focus returns afterwards, the renderer re-checks `commandEnabled` (R19); a click, Enter,
Space, TB22's lone-Alt and F10 actions send I9 with the button's bottom-left corner. Tooltip per A19:
title "Menu (Alt or F10)" with the help line "File, Edit, View and Help." (the mock-up is normative; M4's
text says "Menu", see the plan's gap list). `MenuState.canReopenTab` is derived from the reopen list.
**e2e rewritten here:** `app-menus.spec.ts` (the ☰ popup by click, Alt and F10; every item by id through
the stubbed `Menu.prototype.popup`; no application menu is set), `app-keys.spec.ts` (Ctrl+1 is tab 1,
not Zoom to 100%; the editor's Ctrl rows still work), `app-window.spec.ts` (no menu bar: content
960 x 640 is a 960 x 671 window, W6; the rail's last button still visible), `smoke.spec.ts`,
`app-a11y.spec.ts`, `app-shortcuts.spec.ts` as the suite shows.

**Tests first:** `menu-model.test.ts` (the File rows in the spec's order, labels, accelerators as
display text, `registerAccelerator: false`, no `role`, enabled rules incl. R47, the View > Zoom to 100%
row has no accelerator, modal disables all, M3 text focus); `shared/menu.test.ts` (`canReopenTab`);
`ipc-schemas.test.ts` (I9 bad coordinates rejected); `MenuButton.test.tsx` markup (names, `aria-*`,
disabled while modal); a main test that a second popup request while one is open is ignored; the e2e
above are the RED step.

**Acceptance criteria:**
- [x] The ☰ popup model shows every M1 row with its accelerator text, `registerAccelerator: false` and no `role`; no application menu is set (SC16)
- [x] Alt alone, F10 and the button open it; Alt+click, Alt+Tab and Alt+Shift do not (TB22's table drives it)
- [x] The rewritten e2e specs are green on Windows; `npm run test:e2e` is green
- [x] `src/main/model` coverage >= 90 % lines

**Verification:** `npm test -- src/main src/shared src/renderer/app`, `npm run test:e2e` (Windows), then `npm run check`.

**Dependencies:** TB11, TB20, TB22

**Files:** `src/shared/menu.ts`, `menu.test.ts`, `src/main/model/menu-model.ts`, `menu-model.test.ts`, `src/main/menu.ts`, `menu.test.ts`, `src/main/index.ts`, `src/main/ipc-schemas.ts`, `src/shared/channels.ts`, `src/shared/ipc-types.ts`, `src/preload/index.ts`, `src/preload/api.d.ts`, `src/renderer/app/MenuButton.tsx`, `MenuButton.test.tsx`, `menu-button.css`, `App.tsx`, `host.ts`, `model/menu-state.ts`, `e2e/app-menus.spec.ts`, `app-menu.ts`, `app-keys.spec.ts`, `app-window.spec.ts`, `smoke.spec.ts`, `app-a11y.spec.ts`, `app-shortcuts.spec.ts`

**Scope:** L

**Model:** sonnet: a menu model by table, a button component and the removal of a well-covered path.

---

### Checkpoint D: the app works with tabs
- [ ] `npm run check` green; `npm test -- --coverage` thresholds hold
- [ ] Windows: `npm run test:e2e` green including `e2e/win/`; `npm run test:e2e:os-input` green
- [ ] Commit

---

## TB27: `e2e/app-tabs.spec.ts`

**Description:** The tab behaviour end to end on the built app: keys (every R36 key; Ctrl+digit matched
on the physical key; Tidy on Ctrl+Shift+R; Ctrl+1 and Ctrl+Shift+T never reach the editor; Zoom to 100%
has no key), click, middle-click, ×, new tab, double-click on the empty strip, drag reorder (past 4 px,
Esc cancels), overflow with 12 tabs (chevrons, the active tab scrolled into view after a key switch),
the three-item tab menu through the stubbed popup (acts on the right-clicked tab), the close prompt's
three answers through the stubbed `dialog`, reopen (a "Don't save" Untitled is back with its history), a
tab switch restores per-tab drawing, undo history, selection and view while tool and name-field text stay
window-wide, roles and names, hit targets >= 24 x 24 px by DOM boxes, K4 order (rail, strip, canvas),
reduced motion. **Fix item (1) in e2e:** edit a file tab, Ctrl+Tab at once to an edited picture tab, close
it: the box appears. **Fix item (3) in e2e:** after a relaunch, closing a tab not shown since asks for an
Untitled with content. The window close shows no box with no unkept tab (SC19; the R51 case is TB28).

**Tests first:** the spec is the test; each assertion is a DOM box, a stubbed-dialog log entry or a
`readDocument` / `readTabs` read through the TB20 seams.

**Acceptance criteria:**
- [x] Every item above is asserted; the file ends with `blockedRequests === 0` (every test asserts it before it closes the app; 2026-11-12, `e2e/app-tabs.spec.ts`, 23 tests)
- [x] No fixed sleeps longer than the debounce under test (use the hook to read state)

**Verification:** `npx playwright test --project=e2e e2e/app-tabs.spec.ts` (builds first), then `npm run check`.

**Dependencies:** TB20, TB26

**Files:** `e2e/app-tabs.spec.ts`, `e2e/harness.ts` (helpers only)

**Scope:** M

**Model:** sonnet: Playwright tests over seams that already exist.

---

## TB28: `e2e/app-session.spec.ts` (extends TB20's base)

**Description:** The session store end to end: three tabs with history and views (a named file, an
Untitled with content, a picture drawing), 12 s, kill the process (`process.pid` from inside the app),
relaunch with the same `{ userData }`: the same tabs, order, active tab, drawings, zoom and centre, and 100
undo steps per tab (and no redo steps); the dots come from the index before any tab is opened; **item
(5), e2e:** a kill between the record write and the file write gives no conflict (a main test hook in the
unpackaged build holds the chain after the record, SEC12-style: ignored when packaged) and the file holding
the in-flight text is `same`; unparsable index, record and record drawing are moved to `damaged/` and
everything else opens (SS11: orphan opens as `kept`; a damaged file-tab record opens from its file; N-A5 for
another kind); **item (7), e2e (R51):** a session folder made unwritable (a deny ACL with `icacls` on
Windows, or the main hook failing store writes): the warning on the tab, the "Couldn't keep" box once,
closing that tab asks, closing the window asks for that tab only and Cancel keeps the window open; the old
`userData/recovery/` folder is neither read nor deleted.

**Tests first:** the spec is the test.

**Acceptance criteria:**
- [ ] SC20 and R51 are asserted as described; the file ends with `blockedRequests === 0`
- [ ] The hook that holds the chain exists only for an unpackaged build with `--chalkbond-test-hooks` and is asserted absent when packaged (`e2e/packaged`)

**Verification:** `npx playwright test --project=e2e e2e/app-session.spec.ts`, then `npm run check`.

**Dependencies:** TB20, TB13, TB21 (the main test seam edits `src/main/index.ts`)

**Files:** `e2e/app-session.spec.ts`, `src/main/index.ts` (the test seam), `src/main/model/args.ts` / `args.test.ts` if a flag is added, `e2e/packaged/*` (absence check)

**Scope:** M

**Model:** sonnet: kill and relaunch tests on the existing launch and relaunch helpers.

---

## TB29: `e2e/app-autosave.spec.ts`

**Description:** Auto-save end to end: a named drawing is written within 2 s of the last change and within
10 s of a continuous burst and equals `serialize(doc)`; no marker and no notice after an auto-save;
Ctrl+S writes now and shows "Saved ..."; an Untitled and a picture drawing are never written outside
`userData/session`; Ctrl+S on Untitled opens Save as; an outside change with no unwritten changes loads as
one undo step (Ctrl+Z brings hers back, N-A4); with unwritten changes it becomes the "(your changes)" tab and
the changed file opens beside it (the box text is stubbed); **item (6):** a half-written file (a copy in
progress) leaves the tab bound and "couldn't save", and it recovers when the file parses; a missing file and
back (a deleted file, then restored); a read-only folder (a failed write, one box, retried); **item (2), e2e:**
a timer write during a drag and with a label editor open changes neither; Save as onto a file open in
another tab shows the `open-in-tab` box and writes nothing (AS9).

**Tests first:** the spec is the test.

**Acceptance criteria:**
- [x] SC18 and SC21's "never overwritten" are asserted by bytes on disk; the file ends with `blockedRequests === 0`
- [x] Waits use the hook or `expect.poll`, never a fixed sleep longer than 2.5 s

**Verification:** `npx playwright test --project=e2e e2e/app-autosave.spec.ts`, then `npm run check`.

**Dependencies:** TB20

**Files:** `e2e/app-autosave.spec.ts`, `e2e/harness.ts` (helpers only)

**Scope:** M

**Model:** sonnet: e2e over finished flows with temp-folder files.

---

## TB30: `e2e/app-open-tabs.spec.ts` and `e2e/clipboard-tabs.spec.ts` (R37, R13)

**Description:** Opens into tabs (R37, T17): a second launch with a new path opens a tab and the second
process exits; with a path already open it focuses that tab; three requests from Explorer open three tabs in
order (the queue of 20 with 21 requests drops the 21st); a drop of several files opens each in its own tab in
order (at most 20) and shows `unsupported` only when none had an Open extension; the file opens in the empty
untitled active tab when there is one; Open recent focuses an open tab; a picture opens as a `picture` tab.
`SPEC-clipboard-export.md` R13: a copy in tab A pastes in tab B by CB-P1 (in-app branch, +1 BLU); a tab switch
while a picture is rasterising changes nothing already taken; a paste lands in the tab that is active when
the clipboard read returns; Export's name is the active tab's label (`Untitled.png` for an untitled tab) and
Export changes no tab, record or file; tab keys do nothing while the Export dialog is open.

**Tests first:** the spec files are the tests.

**Acceptance criteria:**
- [x] Each R13 sentence and each R37 sentence above has an assertion; both files end with `blockedRequests === 0`
- [x] No existing clipboard-export or app e2e spec is changed except by TB20

**Verification:** `npx playwright test --project=e2e e2e/app-open-tabs.spec.ts e2e/clipboard-tabs.spec.ts`, then `npm run check`.

**Dependencies:** TB20, TB22

**Files:** `e2e/app-open-tabs.spec.ts`, `e2e/clipboard-tabs.spec.ts`, `e2e/drop-steps.ts` (helpers only)

**Scope:** M

**Model:** sonnet: e2e over finished flows with the existing drop and clipboard helpers.

---

## TB31: Tab-switch budgets, restore time, perf notes

**Description:** T11's budgets and SS8. `e2e/app-tabs-perf.spec.ts` (the editor-perf frame-time probe
style): with the 100-atom perf document in two tabs, a click on the other tab to its first painted frame
within 100 ms (p95 of at least 20 switches, one run after warm-up), and with 10 tabs; a first activation
from the store (record read, D2 verify, AS5 check) within 300 ms after a relaunch; the restore of the
active tab at start (no other record read on the normal path, the fake-port assertion of TB17 has its e2e
twin: the main log shows one `readTabRecord`). The measured numbers go into `docs/editor-perf.md` (a new
"Tabs" section: medians, p95, machine, scale, date). SC1's 3 s cold start with 10 restored tabs is the
teacher's-laptop box in TB33, not measured here.

**Tests first:** the probe is the test; if a budget is missed, fix the code (profile `putState`, the derive
caches, the I11 read), never the budget or the timeout.

**Acceptance criteria:**
- [ ] 100 ms loaded, 300 ms from the store, both met on the development machine; numbers written down
- [ ] `docs/editor-perf.md` records the measurement; no budget or timeout was changed

**Verification:** `npx playwright test --project=e2e e2e/app-tabs-perf.spec.ts`, then `npm run check`.

**Dependencies:** TB27

**Files:** `e2e/app-tabs-perf.spec.ts`, `docs/editor-perf.md`, and only if a budget is missed, the code that is slow

**Scope:** S

**Model:** sonnet: a measurement probe in an established pattern; an optimisation, if needed, is a new task.

---

## TB32: Shots against the mock-ups

**Description:** `e2e/shots/TB32.shot.ts` (named `TB32`, not `A18`: `e2e/shots/A18.shot.ts` already holds the
focus-ring shots): A18 strip states (one tab, several, the active, unsaved dot, warning icon, long name,
overflow with chevrons, a tab being dragged, the tooltip), A19 the ☰ button closed and pressed (the popup is
native and not in a shot), A21 at 960 x 640 content (`-960` suffix: strip with tabs, every options bar fits),
A01 main, A12 the shortcuts dialog. Reference PNGs from `node docs/mockups/shell/build.mjs --png
out/mockups-shell`. The shots are for looking at (AGENTS.md "Shots"); measurable checks are DOM boxes in TB27.

**Tests first:** the shots run green; then look at every PNG next to its mock-up and write the differences
found in the commit message (fix a difference that is a bug in the code or CSS; a mock-up difference needs
the owner).

**Acceptance criteria:**
- [ ] `npm run shots -- TB32` passes and every PNG was looked at against its mock-up
- [ ] The existing shots (`npm run shots`) still pass

**Verification:** `npm run shots -- TB32`, then `npm run shots`.

**Dependencies:** TB23, TB25, TB26

**Files:** `e2e/shots/TB32.shot.ts`

**Scope:** S

**Model:** sonnet: screenshots and a visual comparison.

---

## TB33: `docs/windows-checklist.md`

**Description:** Copy the new boxes of `SPEC-app-shell.md` "Windows checks (tabs feature set)" into
`docs/windows-checklist.md` ("App shell and installer" and a new "Re-checks for the tabs feature set"
section with the same layout as "Re-checks after the 2026-11-12 feature set"): tabs look at 100, 125 and 150
% (A18, A19, A20, A21); the ☰ button, Alt, F10, access keys and Narrator; Alt+click, Alt+Tab and Left
Alt+Shift never open it; every R36 key with the Nepali layout active (write down what happens); Narrator on
the strip; OneDrive-synced folder; full disk; two and three files from Explorer; auto-save modified time; USB
stick pulled and put back; a file copied over the open one; power cut and Windows shutdown; cold start with
10 tabs under 3 s and memory with 10 tabs on the teacher's laptop (E32, SC1). Add the native-popup keyboard
focus probe from the spec's Facts ("a popup opened from a key press gets keyboard focus; Narrator reads it").
Add this feature set's cross-platform changes (keymap, shared menu, IPC, session store, `Menu.setApplicationMenu(null)`)
to the Linux re-run list. All new boxes stay unticked; the owner runs the hand checks.

**Tests first:** none (docs); `npm run check` must stay green.

**Acceptance criteria:**
- [ ] Every box of the spec's tabs list is in the checklist with its wording unchanged
- [ ] The Linux re-run list names the files and commands to re-run
- [ ] No box is ticked

**Verification:** read the diff against the spec list; `npm run check`.

**Dependencies:** TB26

**Files:** `docs/windows-checklist.md`

**Scope:** S

**Model:** sonnet: copying a normative list and listing files.

---

## TB34: `AGENTS.md`, spec statuses, todo ticks

**Description:** `AGENTS.md`: the project paragraph and the module table rows (editor: tabs seam; app-shell:
tabs, auto-save, session store; doc-model: D2), the module notes (doc-model D2; editor R56-R59 and the seam;
app-shell: `session-store.ts` chain, `tab-flows`, hashes, test hooks and flags added, the keys, no menu bar),
the commands (no new script), gotchas (a write result is applied to its `tabId`; auto-save never writes over
a changed file; the session store is the only persistence; `e2e/shots/TB32`), the maintenance paragraph. The
specs' status paragraphs: "Not implemented" becomes "Implemented 2026-11-12 (TB1-TB35)" in
`SPEC-app-shell.md`, `SPEC-editor.md` and the doc-model D2 comment; tick `tasks/plan-tabs.md` and this file;
`CAPABILITY-MAP.md` unchanged. Do not claim the release: the owner's hand checks and the teacher's-laptop boxes
stay open.

**Tests first:** none (docs).

**Acceptance criteria:**
- [ ] `AGENTS.md` names every new file family and rule a new agent needs, and nothing it does not have
- [ ] Spec statuses match the real state; no "approved" wording is changed
- [ ] `npm run check` green

**Verification:** `npm run check`.

**Dependencies:** TB31, TB32, TB33 (and every earlier task)

**Files:** `AGENTS.md`, `SPEC-app-shell.md`, `SPEC-editor.md`, `SPEC-doc-model.md`, `tasks/plan-tabs.md`, `tasks/todo-tabs.md`

**Scope:** S

**Model:** sonnet: documentation edits against a finished diff.

---

## TB35: Final checkpoint (Windows 11 development machine)

**Description:** Run the automated gates on the development machine in the foreground and record the results:
`npm run check`; `npm test -- --coverage` (thresholds); `npm run test:e2e` including `e2e/win/`;
`npm run test:e2e:os-input`; `npm run dist:win` and `npm run test:packaged` (the packaged smoke test must find
no `__chalkbondTest` and the new session store folder created); `npm run shots` looked at; the installed size
re-measured (`SPEC-app-shell.md` I1) if the installer changed. Record the results in a `SPEC.md` Decisions Log
row and tick the automated boxes in `docs/windows-checklist.md`. The cross-platform Linux re-run stays listed.
The hand boxes, the teacher's-laptop boxes (cold start, E32 with 10 tabs) and the release stay open.

**Tests first:** none.

**Acceptance criteria:**
- [ ] Every command above exits 0 at one commit hash, written in the log row
- [ ] The log row says which hand checks are open and that the release is not declared

**Verification:** the commands above.

**Dependencies:** TB34

**Files:** `SPEC.md`, `docs/windows-checklist.md`

**Scope:** S

**Model:** sonnet: running gates and recording numbers (the orchestrator may run it itself).

---

### Checkpoint Z-tabs
- [ ] TB35 done; the owner's hand checks of "Re-checks for the tabs feature set" and the teacher's-laptop boxes are open; the release is not declared

---

## Coverage table: every rule and decision has one owner

Owner = the task whose acceptance criteria close the rule; "Also" = tasks that touch it.

| Rule or decision | Owner | Also |
|---|---|---|
| R30 tabs in one window | TB20 | TB14, TB24 |
| R31 strip placement (editor slot) | TB4 | TB20 |
| R32 no menu bar, ☰, title | TB26 | TB22, TB15 |
| R33 auto-save | TB18 | TB10, TB16 |
| R34 closing a tab | TB19 | TB11 |
| R35 closing the app never prompts; restore | TB19 | TB13, TB17, TB20 |
| R36 Chrome keys | TB22 | TB3 |
| R37 opens into tabs, queue | TB17 | TB12, TB30 |
| R38 outside change, couldn't save | TB18 | TB10 |
| R39 last tab | TB14 | TB19 |
| R40, R48 reopen list | TB14 | TB17 |
| R41 what "saved" looks like | TB15 | TB24, TB18 |
| R42 session store | TB9 | TB8, TB15, TB28 |
| R43 one editor, data-only tabs | TB17 | TB5 |
| R44 strip details | TB24 | TB25 |
| R45 Ctrl+digit by `code` | TB22 | |
| R46 Zoom to 100% has no key | TB3 | TB26 |
| R47 File menu rows | TB26 | TB11 |
| R49 last tab leaves Untitled | TB14 | TB19 |
| R50 500 in a run, 100 stored | TB6 | TB2 |
| R51 close box for an unkept tab | TB19 | TB28 |
| T1, T4, T18 | TB14 | |
| T2, T5, T16 | TB24 | |
| T3 labels | TB14 | TB24 |
| T6 markers | TB15 | TB24 |
| T7, T11, T12, T17 | TB17 | TB12, TB16 |
| T8, T9 | TB19 | TB11 (box text) |
| T13, T14 | TB25 | |
| T15 tab menu | TB11 | TB25 (trigger) |
| AS1, AS3, AS4, AS6, AS7 | TB18 | TB10 |
| AS2 | TB16 | TB18 |
| AS5, AS8, AS9 | TB10 | TB18 |
| SS1 promise | TB17 | TB28 |
| SS2, SS5, SS11 | TB9 | TB8, TB10, TB17 |
| SS3 index / record | TB8 / TB15 | |
| SS4 when written | TB16 | TB6 (budget) |
| SS6 atomic / unkept | TB9 / TB19 | |
| SS7, SS9 | TB17 | |
| SS8 start-up time | TB31 | TB17 |
| SS10 close and shutdown | TB19 | TB13 |
| SS12 tests | see the test table | |
| M1, M4, M5, M6, W4 | TB26 | TB11 |
| K1, K2, K3 | TB22 | |
| CM4 | TB25 | TB11 |
| W3 title | TB15 | TB20 |
| W6 / A21 | TB26 | TB4 |
| F1-F3, F10, F12 | TB17 | TB12 |
| F4, F4a, F13 | TB19 | TB13 |
| F5, F6 | TB18 | |
| F7 | TB15 | |
| F11 | TB12 | TB17 |
| F14 new rows and auto-save boxes | TB11 | |
| I1, I3, I7, `focus-tab` | TB12 | |
| I4, I5 | TB11 | TB21 |
| I9 | TB26 | |
| I10 | TB11 | |
| I11, N7, N8 | TB9 | |
| I12, I13, I14, N9, N2 | TB10 | |
| N1 | TB26 | TB20 |
| N5 | TB13 | |
| SEC5 key list | TB21 | every channel task |
| SEC8 | TB10 | TB9 |
| CO1-CO5, test hook (TH) | TB20 | |
| RC1-RC7 superseded (code removed) | TB21 | |
| Editor R56 | TB4 | |
| Editor R57 | TB5 (state) / TB6 (record) | |
| Editor R58 | TB7 | |
| Editor R59 | TB3 | |
| doc-model D2 | TB2 | |
| clipboard-export R13 | TB30 | |
| app-shell "Required changes" 9, 10, 11 | TB3-TB7, TB2, TB30 | |
| Mock-up and token sync | TB1 | |
| Windows checks | TB33 | TB35 |
| SC16 / SC17 / SC18 / SC19 / SC20 / SC21 | TB26 / TB27 / TB29 / TB27 / TB28 / TB29 and TB30 | |

## Coverage table: every test line of the specs has one owner

Rows are the lines of `SPEC-app-shell.md` "Testing" (2026-11-12 rows), the editor, doc-model and
clipboard-export specs, and the budgets. Each line is owned by exactly one task.

| Test line | Task |
|---|---|
| unit `tabs` (T1, T4, T7, T8, T11, T12, replace-empty rule of T17) | TB14 |
| `tab-flows` T11, T12, T17, SS7, the R37 queue of 20 | TB17 |
| `tab-flows` AS2-AS7 | TB18 |
| `tab-flows` T8, T9, SS6, SS10 | TB19 |
| item (1) wrong-tab write result | TB18 |
| item (2) timer half (snapshotState during a drag, a label editor, IME) | TB18 |
| item (2) shutdown half | TB19 |
| item (3) closing an unloaded tab reads its record first | TB19 |
| item (4) close-time write `changed` or failure | TB19 |
| item (5) main half (record before file, kill, `same`) | TB10 |
| item (5) renderer half (AS7(a), never a "(your changes)" copy) | TB18 |
| item (5) e2e: a kill between the record and the file write gives no conflict | TB28 |
| item (6) unparsable bytes with nothing unwritten | TB18 |
| item (7) unkept tab, box once, window close R51 (fake ports) | TB19 |
| item (7) e2e: a read-only session folder, warning, box, closing asks, Cancel keeps the window | TB28 |
| e2e items (1) and (3): Ctrl+Tab to an edited picture tab and close; closing a tab not shown since the relaunch | TB27 |
| e2e items (2) and (6): timer write during a drag and with a label editor open; a half-written file | TB29 |
| item (A) reopened tab, fresh id | TB17 |
| item (B) dots from the index after a restart | TB17 |
| item (K) open a file not in `serialize`'s form, wait 15 s | TB18 |
| AS5 hashing, same size and same modified time | TB10 |
| AS7 waits for idle after a window-focus check | TB18 |
| `autosave-timer` | TB16 |
| `session-record` schema | TB15 |
| `session-index` schema | TB8 |
| `tab-registry` (key compare, transitions, `openIn`) | TB8 |
| AS9 refusal of a Save-as path bound to another tab (main) | TB10 |
| `session-store` chain order (SS5) and SS11's rule in a temp folder | TB9 |
| `tab-menu-model` (T15: three items) | TB11 |
| `menu-model` as a popup, M1 rows, R47 rows, no Zoom to 100% accelerator | TB26 |
| `keys` (K1 rows, `code` matching R45, K2 extended, K3 lone-Alt rule) | TB22 |
| `messages` (auto-save and keep boxes, `open-in-tab`) | TB11 |
| `shortcuts` (Tabs section, moved keys against the editor keymap and K1) | TB23 |
| existing unit rows: `menu-model`, `context-menu-model`, `recent`, `settings`, `window-bounds`, `args`, `titles`, `write-problem`, `file-refs`, `files.ts`, `handle()` | each task that changes the file updates its test; TB21 owns the removed `recovery` rows |
| View markup tests (strip, ☰, primitives) | TB24, TB25, TB26 |
| Perf: T11 switch 100 ms / 300 ms | TB31 |
| Perf: SS4 record 16 ms / 50 ms | TB6 |
| Perf: D2 restore 150 ms / 30 ms | TB2 |
| doc-model D2 tests (round trip, property, shape errors, corrupted step, prototype paths) | TB2 |
| editor R56 markup and K4 order | TB4 |
| editor R57 seam tests | TB5 (in memory) and TB6 (record) |
| editor R58 `replace-doc` | TB7 |
| editor R59 keymap and tooltips | TB3 |
| clipboard-export R13 | TB30 |
| e2e `app-tabs.spec.ts` | TB27 |
| e2e `app-session.spec.ts`, base restore after a kill | TB20 |
| e2e `app-session.spec.ts`, 3 tabs with history and views, damaged files, R51 | TB28 |
| e2e `app-autosave.spec.ts` | TB29 |
| e2e `app-menus.spec.ts` | TB26 |
| e2e other specs rewritten for the new behaviour (list in TB20) | TB20 |
| Shots A18, A19, A21 (and A01, A12) | TB32 |
| Tooling: `shell-tokens` lifted copies | TB1 |
| Tooling: lint probes for the new main and renderer model files | TB8 (main) and TB14 (renderer): each task adds its own files to the probes' lists, and a file is covered by the task that creates it |
| Manual (Windows) | TB33 |
