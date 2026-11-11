# Implementation Plan: `clipboard-export`

Build-order step 5 from `CAPABILITY-MAP.md`. Spec: `SPEC-clipboard-export.md` (approved
2026-11-10), with the shell mock-ups in `docs/mockups/shell/` as the visual source of truth.
Task list: `tasks/todo-clipboard-export.md`. Built interleaved with `app-shell`
(`tasks/plan-app-shell.md`, `tasks/todo-app-shell.md`). Previous module: `tasks/plan-editor.md`.

## Overview

The module puts drawings on the Windows clipboard (picture + editable drawing), pastes them back,
and exports PNG / SVG / PDF that reopen as editable. Slices, each leaving `npm run check` green:
the editor seam changes (spec first) → the two probes that decide the clipboard keys and the PDF
outcome → the pure core (payload, picture, PNG / SVG / PDF embedding, paste decision) → the main
clipboard and the renderer rasteriser → Copy and Paste in the app → the Export dialog → PNG / SVG
/ PDF files that reopen → coverage, performance and the Windows checklist.

## Overall order across both modules

The two modules interlock (clipboard needs app-shell's IPC, host and primitives; app-shell's Open
needs `extractDrawing`; menus need Copy, Paste and Export). Dispatch in this order; each row pair
is sized for one worker session. The same table is in `tasks/plan-app-shell.md`.

| # | Session | Tasks | Phase / checkpoint |
|---|---|---|---|
| 1 | 1 | A1 Tooling for the new folders · A2 Test hook, test user-data folder, harness migration | S foundations |
| 2 | 2 | A3 Security baseline, IPC skeleton, logging · C1 Editor `actions` slot | S |
| 3 | 3 | C2 Editor `notify` and `busy` event · A4 Editor right-click selection and name-field focus | S |
| 4 | 4 | C3 Windows clipboard probe · C4 PDF incremental-update probe | S |
| 5 | 5 | A5 Shell tokens, icons and UI primitives · A6 Host skeleton, window size and title | S → **Checkpoint S** |
| 6 | 6 | C5 Pure core: payload, picture, PNG and SVG embedding · C6 Pure core: paste decision, opening, names | T copy and paste |
| 7 | 7 | C7 Main clipboard and rasteriser · C8 Copy: flow, Copy button, keys, notices | T |
| 8 | 8 | C9 Paste: flow, keys, notices, round trips · A7 Main file I/O, refs, dialogs, messages | T → **Checkpoint T** (after C9); A7 opens U |
| 9 | 9 | A8 Session, New / Open / Save / Save as / close · A9 Opening pictures, file errors | U files and settings |
| 10 | 10 | A10 Settings and window memory · C10 Export dialog | U → **Checkpoint U** (after A10); C10 opens V |
| 11 | 11 | C11 Export PNG and SVG, reopen round trips · C12 Export PDF (per probe outcome) | V → **Checkpoint V** |
| 12 | 12 | A11 Native menus and host keys · A12 Keyboard shortcuts dialog and About | W menus and keys |
| 13 | 13 | A13 Context menus · A14 Recovery | W → **Checkpoint W** (after A13); A14 opens X |
| 14 | 14 | A15 Recent files, single instance, drag and drop · A16 App and file icons | X → **Checkpoint X** (after A15); A16 opens Y |
| 14b | corrective | A14a · A14b | X (recovery corrections after the audit of d2edcff) |
| 15 | 15 | A17 Installer build and packaged smoke · A18 Accessibility pass | Y release |
| 16 | 16 | C13 clipboard-export coverage, performance, checklist · A19 app-shell coverage | Y |
| 17 | 17 | A20 Docs, version 1.0.0 | Y → **Checkpoint Z (release)** |

## Architecture Decisions

| Decision | Rationale |
|---|---|
| Probes first (C3, C4), results recorded in the spec before code depends on them | The typings document raw clipboard formats only for `has`; Chromium's PDF structure is not documented. Same discipline as chem-core's OCL library facts |
| All decisions in pure code: `src/core/clipboard-export` (≥ 90 %) and `src/renderer/clipboard-export/model` (DOM-free lint block, ≥ 90 %) | Unit- and property-testable in node; e2e only proves the wiring |
| Main moves bytes only (clipboard, files, PDF print); it imports no core module | Keeps OpenChemLib out of the main bundle; SEC9 |
| The PDF is printed in main and embedded in the renderer (`withPdfDrawing`), then written through C4 | Embedding stays a unit-tested core function without breaking SEC9 |
| The drawing is one ASCII payload everywhere, read back only by `parse` | One validation path for clipboard, PNG, SVG, PDF |
| Clipboard e2e in `e2e/win/` (ignored on other platforms by `testIgnore`) | The Windows clipboard is the subject; nothing is skipped |
| Copy button and Export dialog built from app-shell primitives and shell tokens | One visual language, checked by app-shell's V2 tooling test |

## Dependency Graph

```
A1 ─► A2 ─► A3 ─────────────────────────────┐
C1 (editor slot) ─┐                          │
C2 (notify/busy) ─┤                          │
A4 (CM1, focus) ──┤                          ▼
C3 probe ─────────┼────────────────────► C7 main clipboard + rasterise ─► C8 copy ─► C9 paste
C4 probe ─────────┤                          ▲            ▲                   │
A5 primitives ────┼──► A6 host ──────────────┘            │                   │
                  │                                        │                   ▼
C5 pure picture ──┴──► C6 pure paste/open ─────────────────┘           A7 ─► A8 ─► A9 ─► A10
                                                                                       │
                       C10 export dialog (A5, A7, A10) ─► C11 PNG/SVG (A9) ─► C12 PDF (C4)
                                                                                       │
                       A11 menus (C8, C9, C10) … A20; C13 coverage after C12
```

## Task List

### Phase S: foundations (with app-shell A1–A6)
- [ ] C1: Editor `actions` slot after Undo/Redo (SPEC-editor.md first)
- [ ] C2: Editor `notify` and the `busy` event (SPEC-editor.md first)
- [ ] C3: Windows clipboard probe; `formats.ts` and the spec's Facts amended
- [ ] C4: PDF incremental-update probe; outcome A or B recorded in the spec

### Checkpoint S — foundations
- [ ] `npm run check` green; `npm run test:e2e` green (editor suite on the test hook, A2)
- [ ] `SPEC-clipboard-export.md` Facts rows P1–P9 and the PDF outcome filled in; one outcome paragraph left
- [ ] `npm run shots -- A6` matches A01's chrome around an empty drawing
- [ ] Commit + push

### Phase T: copy and paste
- [x] C5: Pure core: payload, picture, PNG and SVG embedding
- [x] C6: Pure core: paste decision, opening embedded files, file names
- [ ] C7: Main clipboard (C1, C2) and the renderer rasteriser
- [ ] C8: Copy: flow, Copy button, Ctrl+C, notices
- [ ] C9: Paste: flow, Ctrl+V, notices, round trips

### Checkpoint T — copy and paste work
- [ ] `npm run check` green; `npm run test:e2e` green on Windows including `e2e/win/clipboard-*.spec.ts`
- [ ] Shots of C8 and C9 compared side by side with A01, A02, A15b and A17
- [ ] One manual paste into PowerPoint (first two "Windows checks" items) tried and noted in the commit message
- [ ] Commit + push

Linux run of Checkpoint T, verified by the orchestrator at `cb3a14b` (2026-11-11): `npm run check`
exit 0 (3567 tests), isolated `npm run test:e2e` exit 0 (197), C8 (5) and C9 (3) shots inspected
against A01, A02, A15b and A17. The checkpoint stays open: Windows (`e2e/win/clipboard-*`, C3
probes, PDF/native frame/Arial, os-input) and the PowerPoint/Office checks are not run.

Linux run of Checkpoint U, verified by the orchestrator at `c9f4861` (2026-11-11): `npm run check`
exit 0 (3728 tests), isolated `npm run test:e2e` exit 0 (225), A10 and C10 shots (5) passed and
compared with A08a–c; pushed. The checkpoint stays open: full Windows acceptance (e2e/win, C3
probes, C4 PDF confirmation, native frame, Arial, Office, os-input, installer) is not run.

### Phase V: export (after app-shell A7–A10)
- [ ] C10: Export dialog (A08a–c), choices remembered, Ctrl+E
- [ ] C11: Export PNG and SVG; reopen round trips
- [ ] C12: Export PDF per the probe outcome

### Checkpoint V — export works
- [ ] `npm run check` green; `e2e/export-*.spec.ts` green; shots of C10 match A08a–c
- [ ] Commit + push

Linux run of Checkpoint V, verified by the orchestrator at `8f08408` (2026-11-11): `npm run check`
exit 0 (3797 tests), isolated `npm run test:e2e` exit 0 (241), the 2 export shots inspected and the
exported white PNG looked at; pushed. Logs: `/tmp/chalkbond-checkpoint-V.EhbZ0d/`. The checkpoint
stays open: the full Windows gates (e2e/win including the C11/C12 performance spec, C3 formats and
clipboard probes, PDF with Arial, Office, native frame, window memory, IME, os-input, installer)
are not run, and no Windows box is ticked.

Linux run of Checkpoint W, verified by the orchestrator at `d2edcff` (2026-11-11): `npm run check`
exit 0 (3953 tests), isolated `npm run test:e2e` exit 0 (275), shots A11, A12, A13 and A14 passed and
viewed against their references; pushed. Logs: `/tmp/chalkbond-checkpoint-W.A0LJti/`. The checkpoint
stays open: native menus looked at by hand against A04–A07, the Windows gates (e2e/win, native
frame, Arial, IME, Office, os-input, installer) are not run, and no Windows box is ticked.

### Phase Y: hardening (with app-shell A16–A20)
- [ ] C13: Coverage thresholds, copy performance, "Clipboard and export" checklist section

### Checkpoint Z — release (shared with app-shell)
- [ ] Every success criterion in `SPEC-clipboard-export.md` met by a test, shot or checklist item (table below)
- [ ] `npm run check`, `npm run test:e2e`, `npm run shots` green; coverage thresholds pass
- [ ] Commit + push

## Success Criteria Coverage

Swept at C13 (2026-11-11, Linux). "Linux" = run and passing on the development machine; "Windows-unrun" = written, not run here, box in `docs/windows-checklist.md` section "Clipboard and export" unticked; "human" = needs eyes or Office.

| SC | Criterion (short) | Tasks | Proof and status |
|---|---|---|---|
| 1 | Public surface tested; 90 % lines | C5, C6, C4, C13 | Unit and property tests in `src/core/clipboard-export/*.test.ts`, `tests/clipboard-export/*.test.ts` (incl. `pdf-embed.prop.test.ts`), `src/renderer/clipboard-export/model/*.test.ts`. Thresholds in `vitest.config.mts`; `npm test -- --coverage` passes (core/clipboard-export 100 % lines, renderer model 100 %). Linux |
| 2 | Probes recorded | C3, C4 | P8, P9: `e2e/pdf-facts.spec.ts` (Linux). P1-P7 incl. P2b: `e2e/win/clipboard-facts.spec.ts` Windows-unrun (checklist item 1) |
| 3 | Whole-drawing copy: formats, SVG, drawing, PNG size | C7, C8 | `e2e/win/clipboard-copy.spec.ts` (SC3) Windows-unrun. On Linux the parts: `src/main/clipboard-export/formats.test.ts`, `clipboard.test.ts`, `copy-flow.test.ts`, `rasterise.test.ts`, and `e2e/clipboard-ui.spec.ts` UI success (stubbed write; not clipboard proof) |
| 4 | Selection copy payload | C5, C8 | Unit: `src/core/clipboard-export/picture.test.ts`, `copy-flow.test.ts` (Linux). `e2e/win/clipboard-copy.spec.ts` (SC4) Windows-unrun |
| 5 | Paste round trips | C9 | `e2e/win/clipboard-paste.spec.ts` Windows-unrun. Linux: paste branches in `copy-flow.test.ts` (N-P1, N-P3 and the rest), `tests/clipboard-export/paste-file.test.ts`, `e2e/clipboard-provenance.spec.ts` |
| 6 | Paste during copy | C8 (queue), C9 | `copy-flow.test.ts` "queue (CB-Q)" (Linux) |
| 7 | Export PNG then open | C11 (needs A9) | `e2e/export-png.spec.ts` "SC7" (Linux) |
| 8 | Export SVG then open | C11 | `e2e/export-svg.spec.ts` "SC8" (Linux) |
| 9 | Export PDF (and open under PDF-A) | C4, C12 | `e2e/export-pdf.spec.ts` "SC9" (Linux); Acrobat and Edge by eye: checklist (human) |
| 10 | Copy button and dialog states, boxes, keyboard | C8, C10, A18 | `CopyButton.test.tsx`, `ExportDialog.test.tsx`, `e2e/clipboard-ui.spec.ts`, `e2e/export-dialog.spec.ts`, `e2e/app-a11y.spec.ts` (Linux). Shots `e2e/shots/C8.shot.ts`, `C10.shot.ts` compared with the mock-ups by eye at checkpoint V by the orchestrator; the same look on Windows is a checklist item (human) |
| 11 | Atom options fit at 960 with Copy | C1, C8 | `e2e/clipboard-ui.spec.ts` "Copy at 960 × 640 ... the Atom options fit" (Linux) |
| 12 | Copy ≤ 500 ms | C13 | `e2e/win/clipboard-perf.spec.ts` Windows-unrun, no number recorded in `docs/editor-perf.md`. Portable `e2e/clipboard-perf.spec.ts` (in-memory transport: encoding and flow only) passes on Linux; it is not Windows clipboard proof |
| 13 | Windows checks ticked | C13 (section), human | Section "Clipboard and export" added to `docs/windows-checklist.md`, all unticked (human, Windows) |

## Screenshot review

`npm run shots -- <ID>` builds the app and writes `out/shots/<ID>/<name>.png` at a 1280×800
content size (960×640 when the name ends in `-960`), device scale 1. Mock-up references: `node
docs/mockups/shell/build.mjs --png out/mockups-shell` (window PNGs include a 24 px desktop margin,
the native title bar and menu bar; compare the page area). Native menus and message boxes are not
in any shot: they are asserted as data and looked at by a human. The orchestrator compares shots
by eye at each checkpoint; measurable checks live in e2e specs.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `write` rejects raw osclipboard keys | High | C3 probes each key; named fallbacks per entry (CB-W1); `image/png` alone still gives Office a picture |
| Chromium re-encodes `image/png` and drops `pHYs`, so Office pastes 300 dpi pictures 3× too large | Med | Raw `PNG` entry when P4 allows; SVG preferred by Office anyway; accepted for v1 (O5); checklist records it |
| Chromium's PDF uses cross-reference streams or its viewer rejects the update | Med | C4 decides before any export code; outcome B is fully specified |
| The PDF viewer probe window is blocked by our own security rules | Med | The probe window uses its own session partition; the plain PDF is the control: if it does not render either, the worker stops and reports instead of deciding |
| Rasterised text differs from the canvas (fonts) | Low | Same Chromium and system Arial; svg-render metrics calibrated; R4 asserts geometry, not pixels |
| Clipboard e2e flaky when another program touches the clipboard | Low | Each test writes before it reads; runs serially (`workers: 1`); the developer avoids copying during the run |
| The 960 px top bar overflows with the Atom options and Copy (2 px to spare) | Med | SC11 e2e; R6 lets the bar scroll during "Copied" only |

Checkpoint S status (orchestrator report, 2026-11-11): Linux verified and pushed at 85a5201: check 3,424 tests; e2e 189 tests; A6 shots 2 passed and inspected. Full S remains pending Windows. Still needs Windows: C3 P1–P7/P2b, C4 confirmation, W6 native frame, real Arial, e2e/win, os-input, Office, installer and manual checks. Evidence: /tmp/chalkbond-checkpoint-S.nDiA14/{check-corrected,e2e-corrected,shots-corrected}.log. This worker has not independently verified those checks.
