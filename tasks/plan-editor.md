# Implementation Plan: `editor`

Build-order step 4 from `CAPABILITY-MAP.md`. Spec: `SPEC-editor.md` (approved 2026-11-10), with
the mock-ups in `docs/mockups/editor/` (iteration 2) as the visual source of truth.
Task list: `tasks/todo-editor.md`. Previous module: `tasks/plan-svg-render.md`.

## Overview

The editor is the interactive canvas and all drawing tools, in `src/renderer/editor/`. Slices,
each leaving `npm run check` green: the approved changes to finished modules (spec first, then
code) and the tooling (lint boundaries, a screenshot harness) → the static window exactly as the
mock-ups show it → the pure viewport/store/controller layers and the canvas that mounts
svg-render parts → the name field (so every later e2e can insert a molecule by typing) → hit-
testing, Select, Erase and the in-app clipboard → the structure tools, hover keys and the label
editor → the reaction tools, the text editor, conditions, Tidy reaction and reaction text → the
preset switch, the property suite, performance, coverage, accessibility and the hand-over docs.

Already in place (verified, nothing to add): the `@core` alias in `electron.vite.config.ts` and
`vitest.config.mts`; `resolveJsonModule`; `vite/client` types (so `?raw` imports type-check);
Playwright `_electron` launch helper `e2e/launch.ts`; coverage includes
`src/renderer/**/*.{ts,tsx}`; the `openchemlib` ban for `src/renderer/**`.

## Architecture Decisions

| Decision | Rationale |
|---|---|
| All logic in DOM-free `model/`, `tools/`, `state/` (lint-enforced); React views only wire events and map state | Testable in node with no jsdom (spec Decision 15); the coverage target is reachable |
| Tools are pure state machines `step(gesture, event, ctx) → ToolStep`; one commit = one `transact` | Every gesture is unit-tested as an event sequence and is exactly one undo step |
| Previews run the commit recipe on the frozen doc | Ghost parts carry the same ids the commit issues; no history pollution |
| Canvas mounts svg-render parts by key and patches by markup string (pure `patch.ts` plan) | svg-render's editor contract; no `createRenderer` unless profiling demands it (R19) |
| Text editing is a `contenteditable` projection of a pure model (`text-edit.ts`) | WYSIWYG without markup (Decision 10); rules are unit-tested, only DOM mapping is e2e |
| `tokens.css` / `icons.svg` copied unchanged from the mock-ups; a tooling test keeps them identical; the sprite is injected inline | One source of truth for appearance; `<use href="#id">` works on `file://` |
| View markup tested with `react-dom/server` in node | Covers states/ARIA of `view/*.tsx` without a new dependency (R15) |
| Screenshot harness (`npm run shots`) separate from the e2e assertions | Every UI task leaves named PNGs comparable to the mock-up PNGs at the same viewport (R16) |
| Name field (single names) lands before the drawing tools | Later e2e and shots set up documents by typing a name; no test-only globals |
| Changes to doc-model, chem-core, SPEC.md and the scaffold are Phase 0 tasks, spec first | AGENTS.md rule: a finished module's surface changes only after its spec |

## Dependency Graph

```
E1 setStyle ─────────────────────────────────────────────────────────────┐
E2 closest ranking ───────────────────────────────┐                      │
E3 SPEC.md + scaffold ──┐                         │                      │
E4 lint boundaries ─────┼──► E6 shell ─► E7 rail/options ─► E8 bars/empty ─► E9 tooltips/focus
E5 shots harness ───────┘                                                 │
                                                                          ▼
                    E10 viewport/derive/patch ─► E11 store/controller ─► E12 canvas ─► E13 name field
                                                                                        │
                    E14 hit-test/hover ─► E15 select ─► E16 move ─► E17 rotate/flip/handles ─► E18 erase/clipboard
                                                                                        │
                    E19 bond ─► E20 hover keys ─► E21 chain/ring ─► E22 atom ─► E23 label editor ─► E24 warnings/actions
                                                                                        │
                    E25 arrow/plus/curly ─► E26 finishText ─► E27 text editor ─► E28 conditions/tidy ─► E29 reaction text
                                                                                        │
                    E30 preset (needs E1) ─► E31 properties ─► E32 perf ─► E33 coverage/a11y ─► E34 docs
```

E1–E5 are independent of each other. E26 (pure formatter) can be done any time after E10.
Everything else is sequential: each phase builds on the previous one.

## Task List

### Phase 0: foundations
- [ ] E1: doc-model `setStyle` (SPEC-doc-model.md first, then code)
- [ ] E2: chem-core `closest` ranking, closest first (SPEC-chem-core.md first, then code)
- [ ] E3: SPEC.md stack/testing rows; scaffold min size 960×640 and no default menu
- [ ] E4: ESLint renderer import boundary and DOM-free block, with probes
- [ ] E5: Screenshot harness and `npm run shots`

### Checkpoint L — foundations
- [ ] `npm run check` green; `npm run test:e2e` green; `npm run shots -- E5` writes its PNGs
- [ ] Commit + push

### Phase 1: static chrome
- [ ] E6: Editor shell: lifted tokens and icons, window grid, `<Editor>` in the scaffold
- [x] E7: Tool rail, options bars, selection actions bar, tool/option selection
- [x] E8: Top bar, status bar, empty state
- [x] E9: Tooltips, focus order, control states

### Checkpoint M — the window matches the mock-ups
- [ ] `npm run check` green; `e2e/editor-layout.spec.ts` green at 1280×800 and 960×640
- [ ] Shots of E6–E9 compared side by side with `out/mockups/01-empty.png`, `10-states.png`, `11-min-window.png`
- [ ] Commit + push

### Phase 2: canvas and documents
- [x] E10: Viewport, geometry, derive and patch models (pure)
- [x] E11: Store, reducer core, controller and host seam
- [x] E12: Canvas mounting, pan and zoom
- [x] E13: Name field: suggestions, insert, not found, reveal, formula

### Checkpoint N — documents appear on the canvas
- [x] `npm run check` green; typing "ethanol" + Enter draws ethanol at 150 % with "C2H6O · 46.07 g/mol"
- [ ] Commit + push

### Phase 3: select, erase, clipboard
- [x] E14: Hit-testing, hover overlay, cursors
- [x] E15: Select clicks, marquee, selection overlay, delete and orphan rule
- [x] E16: Move, snapping, fast path, join atoms, nudges
- [ ] E17: Rotate, flip, arrow and curved-arrow handles
- [ ] E18: Erase tool, in-app clipboard, context-menu event

### Checkpoint O — selection and transforms
- [ ] `npm run check` green; every Select/Erase gesture is one undo step (tool-machine tests)
- [ ] Commit + push

### Phase 4: structure tools
- [ ] E19: Bond tool and ghost previews
- [ ] E20: Keymap, hover keys and tool keys
- [x] E21: Chain and Ring tools
- [x] E22: Atom tool and marks
- [ ] E23: Text-editing model and label editor
- [ ] E24: Warnings overlay, Clean up, Kekulé ⇄ circle, Expand

### Checkpoint P — structures
- [ ] `npm run check` green; `e2e/editor-structures.spec.ts`: ethanol by gestures, benzene, toluene in 3 actions
- [ ] Commit + push

### Phase 5: reaction tools
- [x] E25: Arrow, Plus and Curved-arrow tools
- [x] E26: `finishText` formatter (pure)
- [ ] E27: Text tool and WYSIWYG text editor
- [ ] E28: Conditions and Tidy reaction
- [x] E29: Reaction text in the name field

### Checkpoint Q — reactions
- [x] `npm run check` green; SC3 reaction in ≤ 15 actions (`state/scenarios.test.ts`, `e2e/editor-reaction.spec.ts`)
- [x] Commit + push

### Phase 6: preset, hardening, acceptance
- [x] E30: Preset switch
- [x] E31: Property suite and controller completeness
- [x] E32: Performance measurement
- [x] E33: Coverage and accessibility pass
- [x] E34: Windows checklist, AGENTS.md, success-criteria sweep

### Checkpoint R — module complete
- [ ] Every success criterion in `SPEC-editor.md` met; `src/renderer/editor` ≥ 70 % lines
- [ ] `npm run check` green; `npm run test:e2e` green; `npm run shots` green
- [ ] Commit + push

## Success Criteria Coverage

Each criterion of `SPEC-editor.md` is met by the tasks named; the last task listed closes it.

| SC | Criterion (short) | Tasks |
|---|---|---|
| 1 | Ethanol and benzene without instructions | E13, E19, E20, E21, E24 (`editor-structures.spec.ts`) |
| 2 | Toluene ≤ 3 actions; SC3 reaction ≤ 15 actions, aligned | E20, E21 (toluene), E28, E29 (scenarios + e2e) |
| 3 | Every gesture tested, one undo step, undo exact | every tool task, E31 (property 2) |
| 4 | No invalid doc, no uncaught exception | E11 (X1), E31 (property 1) |
| 5 | Keyboard reachability, focus rings, names | E9, E33 (`editor-keyboard.spec.ts`, `editor-a11y.spec.ts`) |
| 6 | Contrast, lifted files, hit targets | E6 (tooling test), E8 (boxes), E33 (all colour pairs in `editor.css`, `editor-a11y.spec.ts`) |
| 7 | Window matches the mock-ups | E6–E9 (layout e2e + shots), every UI task's shots |
| 8 | Warnings overlay, never exported | E24 |
| 9 | Name insert, suggestions, did-you-mean, reaction text | E2, E13, E29 |
| 10 | Performance budgets | E14 (hit-test perf), E32 |
| 11 | `npm run check`, coverage ≥ 70 %, lint probes | E4, E33 |
| 12 | Runs in the scaffold; smoke passes | E3, E6, E34 |

## Screenshot review

`npm run shots` builds the app and runs `e2e/shots/*.shot.ts` (Playwright project `shots`),
writing `out/shots/<task-id>/<name>.png` at a 1280×800 content size (960×640 where named), device
scale 1. Mock-up references: `node docs/mockups/editor/build.mjs --png out/mockups`. Each UI task
lists its shot names; at least one per task is a scripted interaction. `out/` is git-ignored;
the orchestrator compares shots by eye at each checkpoint, while the measurable checks live in
e2e specs.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `contenteditable` + `beforeinput` edge cases (IME, caret at run boundaries, paste) | High | Model-first design: every edit op is pure and property-tested; the DOM projection is re-rendered from the model; IME reconciled on `compositionend`; e2e covers typing, selection + x₂, paste, re-open; a Windows checklist item covers a Devanagari IME |
| `view/` drags coverage below 70 % | Med | Views stay thin; `react-dom/server` markup tests (R15); logic-heavy model/tools/state are large; measured at E33, never by excluding files |
| Re-rendering preview docs per pointer move misses 16 ms | Med | Drag fast path (translate only); perceiver cache; keyed patching; measured at E32 on Windows; `createRenderer` asked for only on a measured miss (R19) |
| Hover keys swallowing tool keys or text typing | Med | R3 (only listed hover keys), R6 (`key` matching, Shift ignored), keymap unit tests for every pair |
| Ghost ids diverge from commit ids | Low | Preview runs the same recipe on the same doc; a tool-machine test per tool asserts equality |
| Shots differ from mock-ups by font hinting (Electron vs Playwright Chromium) | Low | Measurable checks are DOM boxes (±1 px), not pixels; shots are for eye comparison |
| Electron default menu or window frame changes the content size | Low | E3 removes the menu; the harness sets the content size explicitly |
| Name index build time at start-up | Low | Measured in the perf test (< 30 ms) and in the cold-start e2e |
| Tidy/conditions need two render passes (extents) | Low | `conditionPosition` is pure over `Scene`; idempotence property test |
