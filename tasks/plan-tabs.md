# Implementation Plan: tabs, auto-save and session (2026-11-12)

Feature set approved by the owner on 2026-11-12 (`SPEC.md` Decisions Log, last "Tabs feature set"
row). Specs: `SPEC-app-shell.md` ("Tabs, auto-save and session": T1-T18, AS1-AS9, SS1-SS12;
Decisions R30-R51; amended M1, M4-M6, K1-K3, CM4, W3, W4, W6, F1-F14, I1-I14, N1-N9, "Testing",
"Windows checks", SC16-SC21), `SPEC-editor.md` R56-R59, `SPEC-doc-model.md` D2,
`SPEC-clipboard-export.md` R13, `CAPABILITY-MAP.md`. Mock-ups `docs/mockups/shell/` A01, A12,
A18-A21 and `DEVIATIONS.md` "Tabs and the menu button"; `docs/mockups/editor/pages.mjs` (the zoom
readout's aria-label). Task list: `tasks/todo-tabs.md` (ids `TB1` ...). Format: `tasks/plan-svg-render.md`.
Previous feature set: `tasks/plan-features-2026-11.md`.

## Overview

One window holds several drawings as tabs. A `.chalk` file saves itself (about 2 s after the last
change, atomically, never over a change made outside the app). Drawings without a file are kept
by the app in a session store until she names them. Closing the app never prompts (one narrow
exception, R51) and the next launch brings back every tab with its view and its last 100 undo
steps. The native menu bar becomes a ☰ button; the keys follow Chrome; Tidy reaction moves to
Ctrl+Shift+R and Zoom to 100% loses its key.

Slices, each leaving `npm run check` green and the app working:

1. Docs and the lifted tokens and icons (TB1): the specs, mock-ups and this plan are committed
   together with the one failing check, `tests/tooling/shell-tokens.test.ts`.
2. Bottom-up, additive: doc-model's history record (D2) -> the editor (moved keys, slots, the
   per-tab state seam, the record, `replace-doc`) -> main's pure models, the session store chain,
   the auto-save writer, the open queue and close handling, all added beside the old recovery
   code, which still runs.
3. The renderer's pure models (tab list, record, status, timers, keys) and flows with fake ports,
   then the views (tab strip, ☰ button).
4. **Switch-over (TB20, TB26):** the host wires tabs and the session store in place of the
   recovery file, then the ☰ button replaces the native menu bar. Each switch updates the e2e
   specs of the behaviour it removes; the old code is deleted in TB21.
5. e2e, perf, shots, the Windows checklist, `AGENTS.md`, the final checkpoint.

## Architecture Decisions

| Decision | Rationale |
|---|---|
| Main code is added beside the old recovery code and unused until TB20 | The app and its e2e suite stay working at every commit; one switch-over commit changes behaviour |
| The menu bar goes only in TB26, with the ☰ button | Removing the bar before the button exists would leave no menu |
| Pure parts live in `src/main/model` and `src/renderer/app/model` (90 % lines); I/O parts (`session-store.ts`, `TabStrip.tsx`) are covered by temp-folder tests and e2e | AGENTS.md coverage targets; the spec names these files |
| `tab-flows` is built in three tasks (open and switch, auto-save and outside change, close and shutdown) on one fake-port harness | Each is an ordering or data-loss state machine; each is testable alone in node |
| Hashing is a port (`sha256(text)`), `crypto.subtle` is supplied by the host | `model/` is DOM-free by lint; tests inject a fake |
| New shots are `e2e/shots/TB<n>.shot.ts` | `e2e/shots/A18.shot.ts` already exists (focus rings); a second A18 would clash |
| The shortcuts dialog and its test are synced with A12 in TB23, not TB1 | `shortcuts.test.ts` hardcodes the rows and checks each against the real keymap and host keys; those keys exist only after TB3 and TB22. The dialog must never list a key that does not work |
| `--option-btn-compact` is a shell token; its rule (28 px option buttons below 1100 px with a tab strip) is written in app CSS targeting the editor's classes | The editor's CSS may use editor tokens only (`editor-tokens.test.ts`) |
| Existing e2e specs that test removed behaviour (recovery offer, save prompt on New/Open/close, menu bar) are rewritten in the switch-over tasks to the new behaviour, never skipped | AGENTS.md "never weaken the bar"; the specs supersede them (T9, R35) |
| Spec budgets are tests: T11 100 ms / 300 ms, SS4 16 ms / 50 ms, D2 150 ms / 30 ms | A miss is fixed in the code (a worker for SS4), never by a looser budget |

## Dependency Graph

```
TB1 docs + tokens/icons sync
 |
 +-- TB2 doc-model D2 ----------------------+
 +-- TB3 editor moved keys (R59) -----------|--------------------------+
 +-- TB4 editor slots (R56) ----------+     |                          |
 +-- TB5 editor tab state (R57a) -----|-----+--> TB6 record (R57b)      |
 |        |                           |                                 |
 |        +--> TB7 replace-doc (R58)  |                                 |
 +-- TB8 main: session-index, registry                                 |
 +-- TB11 main: messages, tab-menu-model, I10                           |
 |        TB8 + TB11 --> TB9 session-store chain, I11, N7, N8          |
 |                        TB9 --> TB10 auto-save writer, AS5, I12-I14, N9
 |                                  TB10 --> TB12 open queue, I7 session, AS9
 |                                            TB12 --> TB13 close and shutdown (main)
 +-- TB16 timers and write schedule
 TB5 --> TB14 tabs model --> TB15 session-record, tab status
 TB3 + TB14 --> TB22 host keys (K1-K3)  --> TB23 shortcuts dialog (A12)
 TB4 + TB14 --> TB24 tab strip --> TB25 strip interactions, tab menu trigger
 TB12 + TB15 --> TB17 flows: open, switch, restore, reopen
 TB17 + TB10 --> TB18 flows: auto-save, outside change, Save / Save as
 TB18 + TB13 --> TB19 flows: close, unkept, shutdown
 TB19 + TB22 + TB25 --> TB20 host switch-over (tabs and session replace recovery)
 TB26 --> TB21 retire recovery code
 TB20 + TB11 + TB22 --> TB26 ☰ button, application menu removed
 TB20 + TB22 + TB25 + TB26 --> TB27 e2e tabs, TB29 e2e auto-save, TB30 e2e opens + clipboard R13
 TB21 + TB13 --> TB28 e2e session
 TB27 --> TB31 perf: T11 budgets, SS8
 TB23 + TB25 + TB26 --> TB32 shots
 TB26 --> TB33 Windows checklist
 all --> TB34 docs: AGENTS.md, specs, todo --> TB35 final checkpoint
```

## Parallel groups

Tasks in a group touch disjoint files and may run side by side (at most three at once is
sensible: the main-process tasks share `ipc-schemas.ts`, `channels.ts`, `ipc-types.ts`,
`src/preload/*` and `src/main/index.ts`, which is why TB9, TB10, TB12, TB13 and TB11 are
ordered). Groups run in order; a group starts when the dependencies in the todo are met.

| Group | Tasks | Why they are disjoint |
|---|---|---|
| P1 | TB2, TB3, TB4, TB5, TB8, TB11, TB16 | doc-model; editor keymap/tips/status bar; editor Editor.tsx/TopBar.tsx/editor.css; editor controller/store; new main model files; main messages and tab menu; renderer timers and `host.ts` import |
| P2 | TB6, TB7, TB9, TB14 | editor record file; editor commands/reducer; main store and shared channels; a new renderer model file |
| P3 | TB10, TB15, TB22, TB24 | main writer (shared main files, owner of them in this group); renderer record and status; keys; a new view and its CSS |
| P4 | TB12, TB23, TB25 | main open path; shortcuts files; strip interactions |
| P5 | TB13, TB17 | main close handling; renderer flows |
| serial | TB18, TB19 (one `tab-flows` family), then TB20, then TB26 | same files or the switch-over; TB27-TB30 need TB26 for the ☰ and key paths |
| P6 | TB21, TB27, TB29, TB30, TB33 | deletions of old code; three new e2e files; the docs file |
| P7 | TB28, TB31, TB32 | an e2e file with a main test seam (after TB21: `index.ts`); a perf probe; shots |
| serial | TB34, TB35 | final |

## Task List

### Phase 0: docs
- [x] TB1: approvals, specs, mock-ups, plan and todo committed; lifted tokens and icons synced (`docs:`)

### Phase 1: doc-model and editor
- [x] TB2: doc-model `historyToRecord` / `historyFromRecord` (D2)
- [x] TB3: editor keys moved for the tabs (R59): Tidy Ctrl+Shift+R, Ctrl+1 and Ctrl+Shift+T freed, Zoom to 100% without a key
- [x] TB4: editor host slots `menu` and `tabs`, tab panel, K4 order (R56)
- [x] TB5: editor per-tab state in memory: `takeState`, `putState`, `newState`, `snapshotState`, `tabState*`, `view` event (R57)
- [x] TB6: editor record conversion `tabStateToRecord` / `tabStateFromRecord` and the SS4 serialisation budgets (R57)
- [x] TB7: editor `replace-doc` command (R58)

### Checkpoint A: doc-model and editor
- [x] `npm run check` green; coverage thresholds hold (2026-11-14, TB35, `ea36057`: check exit 0, 261 files, 5422 tests; `npm test -- --coverage` exit 0)
- [x] On Windows: `npm run test:e2e` editor files (`editor-canvas`, `editor-keyboard`, `editor-layout`, `editor-a11y`, `editor-perf`) and `npm run shots -- E21 N5` looked at (2026-11-14: the full e2e run, 422 passed, covers the editor files; the full shots run passed, and of the E21 and N5 PNGs only `N5/rail-tooltip.png` and `E21/ring-options-bar.png` were looked at, against mock-ups 03 and 04)
- [x] Commit (the TB35 commit records it; not pushed, no push unless asked)

### Phase 2: app-shell main (additive)
- [x] TB8: `session-index.ts` and `tab-registry.ts` pure models (SS3 index, SS11 classification, bindings and hashes)
- [x] TB11: main messages (T9 box, auto-save boxes, `open-in-tab`), `tab-menu-model`, the I10 handler
- [x] TB9: `session-store.ts` write chain, atomic store writes, I11, N7, N8
- [x] TB10: auto-save writer, AS5 check, I12 to I14, N9 (SEC8)
- [x] TB12: open-request queue of 20, I1/I3 answers `{ focus }`, I7 `session`, Save-as refusal (AS9)
- [x] TB13: window close and shutdown in main: chain-empty close, `discarded` deletion, `flush-session`

### Checkpoint B: main
- [x] `npm run check` green; `src/main/model` >= 90 % lines (2026-11-14, TB35: check exit 0; the coverage run exit 0 enforces the 90 % threshold)
- [x] `npm run test:e2e` unchanged and green (2026-11-14, TB35, at the end state: 422 passed, exit 0; the checkpoint's "nothing user-visible changed yet" no longer applies at the end state)
- [x] Commit (the TB35 commit records it)

### Phase 3: renderer models, flows, views
- [x] TB14: `model/tabs.ts` (T1, T4, list rules, reopen list, T17's replace-empty rule)
- [x] TB15: `model/session-record.ts` and tab status (pending, unsaved, unkept; F7)
- [x] TB16: `model/autosave-timer.ts` and the SS4 write schedule
- [x] TB17: `tab-flows` part 1: new tab, open into tabs, switch, reopen, restore (T7, T11, T12, T17, SS7)
- [x] TB18: `tab-flows` part 2: auto-save, outside change, Save and Save as (AS1-AS9, F5, F6)
- [x] TB19: `tab-flows` part 3: close a tab, unkept, window close and shutdown flush (T8, T9, SS6, SS10)
- [x] TB22: host keys K1, K2, K3 (`keys.ts`, `host-keys.ts`)
- [x] TB23: shortcuts dialog and A12 rows
- [x] TB24: `TabStrip.tsx` rendering, roles, markers, tooltips (T2, T3, T5, T6, T16)
- [x] TB25: strip interactions: reorder, overflow, scroll into view, tab menu trigger (T13, T14, CM4)

### Checkpoint C: the pieces exist
- [x] `npm run check` green; `src/renderer/app/model` >= 90 % lines (2026-11-14, TB35: check exit 0; the coverage run exit 0 enforces the 90 % threshold)
- [x] Commit (the TB35 commit records it)

### Phase 4: switch-over
- [x] TB20: the host wires tabs and the session store; the recovery file and F4 prompts stop being used
- [x] TB21: recovery code, N3 and N4, `flush-recovery` and their tests deleted (after TB26: both change `index.ts`, the IPC files and the preload)
- [x] TB26: menu model rows (R47, R46, M6), I9 popup, ☰ button, application menu removed, Alt and F10

### Checkpoint D: the app works with tabs
- [x] `npm run check` green; `npm run test:e2e` green on Windows (342 existing, rewritten where the spec supersedes them) (2026-11-14, TB35, `ea36057`: check exit 0, 261 files, 5422 tests; e2e exit 0, 422 passed including `e2e/win/`)
- [x] Commit (the TB35 commit records it)

### Phase 5: tests of the whole, perf, shots, docs
- [x] TB27: `e2e/app-tabs.spec.ts`
- [x] TB28: `e2e/app-session.spec.ts`
- [x] TB29: `e2e/app-autosave.spec.ts`
- [x] TB30: new e2e for opens into tabs (second launch, queue of 20, multi-drop) and clipboard-export R13 across tabs
- [x] TB31: T11 budgets e2e probe, SS8 restore time, `docs/editor-perf.md`
- [x] TB32: shots A18, A19, A21, A01, A12 against the mock-ups
- [x] TB33: `docs/windows-checklist.md` rows
- [x] TB34: `AGENTS.md`, spec statuses, DEVIATIONS item 5, todo ticks

### Checkpoint Z-tabs: final (Windows 11 development machine)
- [ ] TB35: `npm run check`, `npm run test:e2e` (including `e2e/win/`), `npm run test:e2e:os-input`, `npm run dist:win`, `npm run test:packaged`, `npm run shots`, `npm test -- --coverage`; Linux re-run listed in `docs/windows-checklist.md`; the owner's hand checks stay open (2026-11-14, `ea36057`: every command above exited 0, numbers in the `SPEC.md` Decisions Log, 2026-11-14. **The box stays unticked on purpose**: Checkpoint Z-tabs is not reached while the owner's hand checks, the teacher's-laptop boxes and the Linux re-run are open, and the release is not declared)

## Success Criteria Coverage

Criteria 16-21 of `SPEC-app-shell.md` ("Success criteria"); the last task named closes it.

| SC | Criterion (short) | Tasks |
|---|---|---|
| 1 | `npm run check` green, model coverage >= 90 % | every task; TB35 |
| 16 | The ☰ popup model, Alt / F10 / button open it, no application menu | TB11 (model), TB22 (Alt, F10), TB26 (button, removal; `e2e/app-menus.spec.ts`) |
| 17 | Every R36 key; Ctrl+1 / Ctrl+Shift+T leave the editor; Tidy on Ctrl+Shift+R; budgets | TB3, TB22, TB27, TB31 |
| 18 | Named drawing written within 2 s / 10 s; Untitled and picture never written outside `userData/session`; Ctrl+S on Untitled is Save as | TB10, TB18, TB29 |
| 19 | The close box and each answer; no box on window close except R51 | TB19, TB27 |
| 20 | Three tabs, 12 s, kill, relaunch: tabs, order, active, views, 100 undo steps; damage never stops start-up | TB9, TB17, TB28 |
| 21 | A file changed outside is never overwritten; a second launch focuses the tab | TB10, TB18, TB30 |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Wrong tab marked saved after a switch (fix item 1) | High: data loss | AS3 is its own pure function with the item (1) test in TB18; the result carries `tabId` from the IPC type up (TB10) |
| Power cut between the file write and the index write | High | SS5's `writing` hash and AS5's in-flight rule, tested with a killed chain in TB9 and TB10, item (5) |
| A tab switch is slower than 100 ms on the 100-atom drawing | Med | TB5 measures `putState` alone before any UI exists; TB31 measures paint; fix in code, never the budget |
| `tabStateToRecord` of 100 steps misses 16 ms | Med | TB6 measures first; the spec's fallback is a worker, not a looser budget |
| D2 verification misses 150 ms | Med | TB2 measures first; the spec names the fix (verify the oldest drawing and each step's shape) |
| Alt alone opening the ☰ menu when Alt+Tab or Left Alt+Shift is pressed | Med | K3's "alone" state is a pure table test (TB22); the Nepali-layout check is a Windows box (TB33) |
| Existing e2e assume the old behaviour | Med | TB20 and TB26 list the files they rewrite; the full suite runs at checkpoint D |
| Native popup keyboard focus from a key press is unproven on Windows | Med | Spec Facts say "probe (Windows)": it is a human box in TB33; the popup path already works for CM1 |
| Memory with 10 tabs on a small laptop | Low | One controller, data-only inactive tabs (R43); E32 stays a Windows check on the teacher's laptop |
| Three fix-round flows share one file family | Med | TB17, TB18 and TB19 are serial, each with its own test file over one shared fake-port harness |
