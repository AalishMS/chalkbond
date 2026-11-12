# Implementation Plan: the 2026-11-12 feature set

Three changes the owner asked for on 2026-11-12, before the 1.0.0 release. Specs (amended in commit
`628ea2b`): `SPEC.md` Decisions Log 2026-11-12; `SPEC-editor.md` R50, R51, R52, C7, SC13, SC14;
`SPEC-doc-model.md` D1; `SPEC-svg-render.md` Decision 15, "Structural formula display", SC14;
`SPEC-clipboard-export.md` R10, R11, SC14, SC15; `SPEC-app-shell.md` R27, R28, SC15. Amended
2026-11-12 (W12) for the answer to S1: `SPEC-svg-render.md` Decision 16 and "The layout (Decision
16)", `SPEC-editor.md` R53, `SPEC-clipboard-export.md` R12. Mock-ups:
`docs/mockups/editor/` (rail badges, the formula switch, icons `show-structural` and
`show-skeletal`, token `--formula-btn-w`) and `docs/mockups/shell/` (A12, new A15c). Task list:
`tasks/todo-features-2026-11.md`. Format: `tasks/plan-editor.md`.

## Overview

- **F1 number keys** (editor R50, app-shell R27): the digits `1`–`9`, `0` pick the ten rail tools;
  each rail button shows its digit; `1`–`3` keep R5 over a hovered atom or bond.
- **F2 structural formula display** (doc-model D1, svg-render Decision 15, editor R51/R52,
  clipboard-export R11, app-shell R28): one document setting, one button, one undo step.
  **Its layout is decided (S1 answered 2026-11-12, svg-render Decision 16):** the owner chose
  "B", ordinary labels with bonds twice as long, and "Rings can stay how they are": a structural
  drawing is drawn with every coordinate ×2 and the style unchanged (`ptPerBlu`), carbons outside
  rings are written by the existing label rules, ring carbons are not. N3 is split into N3a (the
  factor) and N3b (goldens and legibility); the ring rule is in N2; the editor's unit change is
  N13. Open question S2 (lone-pair offsets and condition texts) was answered B on 2026-11-12 (the
  rule is applied in N3a; the editor's placing and moving of such items follows in editor tasks).
- **F3 white-backed clipboard bitmap** (clipboard-export R10): the `image/png` clipboard entry is
  opaque white with a 0.25-bond margin; the SVG entry and Export are unchanged.

Slices, each leaving `npm run check` green: doc-model schema v2 → svg-render's structural switch
and ring rule (no new goldens) → the ×2 factor → structural goldens and legibility → editor keys
and rail → editor units (`ptPerBlu`) → editor formula command and button → clipboard bitmap and
payload → app-shell list and files → docs and shots → the final checkpoint.

## Architecture Decisions

| Decision | Rationale |
|---|---|
| The formula setting is `doc.style.formula?: 'structural'`, written as v1 when absent (D1) | Every existing byte (fixtures, goldens, payloads) stays; the tested 1.0.0 build still opens skeletal files |
| svg-render keys structural mode on `isLabelled(atom, n, formula)`; the editor already keys hover, hit-testing, halos, warnings and HV4 on "labelled atom" | The editor needs almost no new logic for F2 (R52) |
| Skeletal output is byte-identical; no golden is re-recorded | Decision 15 (a); the goldens are the regression net |
| Structural golden scenes and the layout wait for S1 (task N3) | No layout rule was specified because the existing ones are not legible (svg-render analysis). Superseded 2026-11-12 by the next three rows |
| The factor reaches the renderer only as `ResolvedStyle.ptPerBlu` (`2 × bondLength` when structural); every derived size stays from `bondLength` (svg-render Decision 16) | Skeletal arithmetic is literally unchanged (byte-identical goldens), and ×2 is exact in floating point, so a structural render equals the skeletal render of the doubled document: one oracle tests the whole rule |
| Ring membership is computed in svg-render (`ringAtoms`, bridges of the bond graph), not in chem-core | svg-render may use only doc-model and chem-core, and chem-core exports no ring information; the rule is graph-only, so no chemistry is involved |
| The editor converts BLU ↔ pt with `ptPerBlu` everywhere (N13); viewport defaults stay on `bondLength` (U14); a formula switch keeps the zoom (U13) | The canvas, hit-testing and the copy cannot disagree; the labels keep their screen size, as in the owner's picture B |
| Number keys go into the existing K2 tool-key table after the hover keys | R50's exception is K2's existing precedence; one rule |
| The clipboard bitmap is a second `exportSvg(doc, sel, { embed: false, padding })` rasterised with the existing white fill | No new rasteriser path; Export untouched |
| UI controls follow the updated mock-ups; `tokens.css` and `icons.svg` were already lifted in `628ea2b` | Normative files first (AGENTS.md); the tooling test stays green |

## Dependency Graph

```
N1 doc-model v2 ──► N2 switch + ring rule ──► N3a ×2 factor ──► N3b goldens + legibility ──┐
   │                    │                        │                                          │
   │                    │                        └──► N13 editor units ──┐                  │
   │                    └──► N6 editor formula command ──────────────────┴─► N7 button ─────┤
   ├──► N9 pictureDoc formula (clipboard-export; R12 guards after N3a)                      │
   │                                                                                        │
N4 keymap digits ──► N5 rail badges ──► N5b edge-case tests ───────────────────────────────┤
N8 white clipboard bitmap (independent) ────────────────────────────────────────────────────┤
N10 app-shell list and files (needs N4, N6) ────────────────────────────────────────────────┤
                                                                                            ▼
                                          N11 docs and shots ──► N12 checkpoint
```

N1, N4 and N8 are independent of each other and can start at once. S1 is answered, so nothing
is blocked; N12 needs N3a, N3b and N13.

## Task List

### Phase 1: document and rendering (F2 core)
- [ ] N1: doc-model schema v2 `style.formula`, migration, lowest-version `serialize`, `setStyle` formula
- [ ] N2: svg-render structural switch with the existing label rules and the ring rule (`ringAtoms`; no factor, no new goldens)
- [ ] N3a: svg-render structural factor: `ptPerBlu`, `STRUCTURAL_SCALE`, coordinates ×2, the doubled oracle
- [ ] N3b: structural golden scenes (13 × 2 presets) and the legibility test L1–L3

### Checkpoint F-a — core
- [ ] `npm run check` green; every pre-F2 golden byte-identical (no `-u`); doc-model ≥ 95 %, svg-render ≥ 90 % lines
- [ ] Commit (no push unless asked)

### Phase 2: editor (F1 and F2)
- [ ] N4: number keys in the keymap (R50)
- [ ] N5: rail badges, `aria-keyshortcuts`, two-key tooltips (R50, U1, U2)
- [ ] N5b: number-key edge cases: held digit, text targets, numpad, shifted-digit-row layouts (SC13)
- [ ] N13: editor BLU ↔ pt through `ptPerBlu` (R53), viewport defaults on `bondLength` (U14)
- [ ] N6: `toggle-formula` command, C7 reducer, R52/R53 consequences (R37 bend with the ring flag, U11 label editor, U13 view on a switch), perf variant
- [ ] N7: the formula switch in the options bar, icon-only below 1100 px (R51, U5, U6, U8)

### Checkpoint F-b — editor
- [ ] `npm run check` green; `npm run test:e2e` green; editor ≥ 70 % lines; perf budgets unchanged and met
- [ ] Shots of N5 and N7 compared with `out/mockups` 03, 03b, 10

### Phase 3: clipboard and shell (F3, F2 carriers, F1 list)
- [ ] N8: white-backed clipboard bitmap with margin (R10)
- [ ] N9: `pictureDoc` copies `style.formula` (R11); a structural export reopens structural
- [ ] N10: shortcuts list with digits (R27); New is skeletal, v1/v2 files (R28)

### Checkpoint F-c — integration
- [ ] `npm run check`, `npm run test:e2e` green (Linux and Windows; `e2e/win/` on Windows)

### Phase 4: hand-over
- [ ] N11: docs (AGENTS.md module notes, golden sheet look for N3) and the named shots
- [ ] N12: final checkpoint: every gate, shots looked at, the checklist section

## Success Criteria Coverage

| Criterion | Task(s) |
|---|---|
| editor SC13 (number keys) | N4, N5, N5b (held digit, text targets, numpad, layouts) |
| editor SC14 (formula switch, structural canvas) | N13, N6, N7 |
| doc-model D1 tests (Testing "Schema v2") | N1 |
| svg-render SC14 (skeletal unchanged; structural legible) | N2 (unchanged part, ring rule), N3a (factor, oracle), N3b (goldens, L1–L3) |
| clipboard-export SC14 (white bitmap), SC15 (formula travels, incl. a structural export reopens structural), R12 (structural picture sizes, margin unchanged) | N8, N9 |
| app-shell SC15 (list, New, v1/v2 files) | N10 |
| `SPEC.md` SC9 | all; N12 |
| Windows re-check section | N12 (automated gates by the orchestrator on Windows; hand checks by the owner) |

## Platform

All product code here is cross-platform (Linux development box and Windows); `npm run check`
and `npm run test:e2e` must stay green on both. Windows-only: `e2e/win/clipboard-copy.spec.ts`
(N8, ignored elsewhere by `testIgnore`), `npm run dist:win`, `npm run test:packaged` on
`dist/win-unpacked`, `npm run test:e2e:os-input`, and every hand check.

## What must not change (every task)

Existing goldens (`src/core/svg-render/__golden__/*.svg`, never `-u`), committed `.chalk`
fixtures and golden inputs, every perf budget and timeout, every coverage threshold in
`vitest.config.mts`, every property's `numRuns`, the normative mock-up files except through a
spec change. No `eslint-disable`, `@ts-ignore`, `any`, skipped or `.only` tests, retries, deleted
assertions, coverage exclusions or new dependencies.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| S1 is answered late, so N3 and N12 wait | High | Closed 2026-11-12: S1 answered (svg-render Decision 16) |
| A BLU ↔ pt conversion in the editor keeps using `bondLength`, so clicks land half-way in a structural drawing | Med | N13 replaces every conversion found by grep and tests a structural document at three zooms; N7's e2e clicks a structural atom |
| S2 answered B (2026-11-12): lone-pair arrows and condition texts keep their offsets at the style's scale | Low | Done in N3a on the render side; no structural golden contains either; B is skeletal-neutral; the editor side (placing and moving such items in structural mode) is an editor task |
| The v1/v2 writing rule breaks a round trip | Med | Property: `parse(serialize(d))` deep-equals `d` with `formula` in the generator; every committed fixture re-serialises byte-identically |
| A digit swallowed by a text target or stolen from R5 | Med | Keymap table tests for every digit × hover × tool; e2e for the toluene path (SC2) |
| The second `renderSvg` for the bitmap pushes copy past SC12's 500 ms | Low | Measured by the existing clipboard perf e2e; a miss is profiled, the budget is not raised |
| Structural mode slows render past the budgets | Low | Structural variants of the perf scenes with the same budgets (N2, N6) |
| The badge or the formula switch shifts the approved layout | Low | DOM box assertions in `editor-a11y.spec.ts` / `editor-formula.spec.ts`; shots against the mock-ups |
