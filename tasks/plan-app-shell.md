# Implementation Plan: `app-shell`

Build-order step 6 from `CAPABILITY-MAP.md`. Spec: `SPEC-app-shell.md` (approved 2026-11-10),
with the shell mock-ups in `docs/mockups/shell/` as the visual source of truth. Task list:
`tasks/todo-app-shell.md`. Built interleaved with `clipboard-export`
(`tasks/plan-clipboard-export.md`, `tasks/todo-clipboard-export.md`).

## Overview

App-shell turns the scaffold window into the finished Windows application. Slices, each leaving
`npm run check` green: tooling for the new folders → the proper e2e test hook (so every later test
has isolated data and no fiber code) → the security baseline and the validated IPC skeleton →
editor seam changes (spec first) → shell tokens, icons and primitives → the host that owns the
controller → file I/O, the session and the file flows, opening pictures and errors → settings and
window memory → native menus, host keys, the shortcuts dialog, About, context menus → recovery,
recent files, single instance, drag and drop → icons, the installer, accessibility, coverage, docs
and release.

## Overall order across both modules

Dispatch in this order; each session takes the two tasks on its row. The same table is in
`tasks/plan-clipboard-export.md`.

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
| Test hook and per-launch user-data folder first (A2) | Every later e2e (files, settings, recovery, single instance) needs isolated data; the fiber helpers go before more tests depend on them |
| One `handle()` wrapper in main does sender check, Zod and logging for every channel (A3) | SEC5–SEC6 proved once, by unit tests with fake events; each channel only adds a schema |
| Channel names in `src/shared/channels.ts` (no imports); schemas in `src/main/ipc-schemas.ts` | The sandboxed preload can import only `electron` and plain constants |
| All decisions in pure folders: `src/main/model`, `src/renderer/app/model` (lint-enforced, ≥ 90 %) | Menu model, flows, keys, settings, bounds and messages are unit-tested in node; e2e proves the wiring |
| Native menus and boxes asserted as data (model unit tests, stubbed `dialog` / `popup` receiving options) | Playwright cannot capture native UI; the human looks at it once (checklist) |
| Paths never reach the page: opaque refs; dropped paths read in the preload | Security review R8; a compromised page cannot name a file |
| Shell tokens and icons as their own lifted files beside the editor's | One normative source per file; the editor's tooling test is untouched |
| Our own `.ico` files committed | electron-builder would download its icon toolset to convert PNG; the association icon must be `.ico` anyway |

## Dependency Graph

```
A1 ─► A2 ─► A3 ─┬─► A6 ─► (C8 copy, C9 paste) ─► A7 ─► A8 ─► A9 ─► A10 ─► (C10–C12 export)
                │    ▲                                  │                    │
A4 (editor) ────┤    A5 primitives                      │                    ▼
                │                                       │       A11 menus+keys ─► A12 shortcuts/About ─► A13 context menus
                └───────────────────────────────────────┴─► A14 recovery ─► A15 recent/instance/drop
A16 icons ─► A17 installer ─► A18 a11y ─► A19 coverage ─► A20 docs + release
```

## Task List

### Phase S: foundations (with clipboard-export C1–C4)
- [ ] A1: Tooling for `src/shared`, main/model, app/model, clipboard-export/model, preload imports
- [ ] A2: Test hook, test user-data folder, harness migration, Windows-only e2e folder
- [ ] A3: Security baseline, IPC skeleton, logging
- [ ] A4: Editor right-click selection (CM1) and host-callable name-field focus (SPEC-editor.md first)
- [ ] A5: Shell tokens, icons and UI primitives
- [ ] A6: Host skeleton: controller ownership, title, window size and minimum

### Checkpoint S — foundations
- [x] `npm run check` green; `npm run test:e2e` green (editor suite on the hook, no fiber code left)
- [x] `e2e/app-security.spec.ts` green; SEC4 counter 0 at the end of every e2e file
- [ ] Commit + push

### Phase U: files and settings (after clipboard-export C5–C9)
Checkpoint T (clipboard-export plan): Linux run, verified by the orchestrator at `cb3a14b` (2026-11-11): `npm run check`
exit 0 (3567 tests), isolated `npm run test:e2e` exit 0 (197), C8 (5) and C9 (3) shots inspected
against A01, A02, A15b and A17. The checkpoint stays open: Windows (`e2e/win/clipboard-*`, C3
probes, PDF/native frame/Arial, os-input) and the PowerPoint/Office checks are not run.

- [ ] A7: Main file I/O, refs, dialogs, messages
- [ ] A8: Session and file flows: New, Open, Save, Save as, close
- [ ] A9: Opening exported pictures; file errors
- [ ] A10: Settings and window memory

### Checkpoint U — files round-trip
- [x] `npm run check` green; `e2e/app-files.spec.ts`, `app-open-pictures.spec.ts`, `app-open-errors.spec.ts`, `app-settings.spec.ts` green
- [ ] Commit + push

Linux run of Checkpoint U, verified by the orchestrator at `c9f4861` (2026-11-11): `npm run check`
exit 0 (3728 tests), isolated `npm run test:e2e` exit 0 (225), A10 and C10 shots (5) passed and
compared with A08a–c; pushed. The checkpoint stays open: full Windows acceptance (e2e/win, C3
probes, C4 PDF confirmation, native frame, Arial, Office, os-input, installer) is not run.

Checkpoint V (clipboard-export plan): Linux run, verified by the orchestrator at `8f08408` (2026-11-11): `npm run check`
exit 0 (3797 tests), isolated `npm run test:e2e` exit 0 (241), the 2 export shots inspected and the
exported white PNG looked at; pushed. Logs: `/tmp/chalkbond-checkpoint-V.EhbZ0d/`. The checkpoint
stays open: the full Windows gates (e2e/win including the C11/C12 performance spec, C3 formats and
clipboard probes, PDF with Arial, Office, native frame, window memory, IME, os-input, installer)
are not run, and no Windows box is ticked.

### Phase W: menus and keys (after clipboard-export C10–C12)
- [ ] A11: Native menus (M1–M3) and host keys (K1–K3)
- [ ] A12: Keyboard shortcuts dialog (A12) and About (A14)
- [ ] A13: Context menus (CM1–CM3)

### Checkpoint W — every command reachable
- [x] `npm run check` green; `e2e/app-menus.spec.ts`, `app-keys.spec.ts`, `app-context-menus.spec.ts` green
- [ ] Shots of A12 compared with the A12 mock-up; menus looked at by hand once against A04–A07
- [ ] Commit + push

Linux run of Checkpoint W, verified by the orchestrator at `d2edcff` (2026-11-11): `npm run check`
exit 0 (3953 tests), isolated `npm run test:e2e` exit 0 (275), shots A11, A12, A13 and A14 passed and
viewed against their references; pushed. Logs: `/tmp/chalkbond-checkpoint-W.A0LJti/`. The checkpoint
stays open: native menus looked at by hand against A04–A07, the Windows gates (e2e/win, native
frame, Arial, IME, Office, os-input, installer) are not run, and no Windows box is ticked.

Checkpoint X, Linux run verified by the orchestrator (2026-11-11): at `4d3f739` (previous orchestrator) `npm run check` exit 0 (4013 tests), `npm run test:e2e` exit 0 (285), A15 shots viewed; then at `9056c4b` with the recovery corrections A14a/A14b (R24, R25): `npm run check` exit 0 (4026 tests), isolated `npm run test:e2e` exit 0 (288); pushed. Logs `/tmp/chalkbond-checkpoint-X2.bWX6G5/`. The checkpoint stays open: every Windows gate, including real shutdown, cancelled shutdown and IME.

Checkpoint Y so far, Linux (2026-11-11): at `7d96ea0` `npm run check` exit 0 (4037 tests), `npm run test:e2e` exit 0 (296), A18 shots (2) viewed against A03 and A08a, Linux packaged smoke 6 passed against `dist/linux-unpacked`; at `30ac19c` `npm run check` exit 0 (4037), `npm test -- --coverage` exit 0 with the four new thresholds, `npm run test:e2e` exit 0 (297); pushed. Logs `/tmp/chalkbond-checkpoint-Y1.hpAOkL/`, `/tmp/chalkbond-checkpoint-Y2.Vg63HX/`. One of five repeated coverage runs failed svg-render property 5 (seed -1130545056), fixed in the commit `8a2f797` (the property's oracle counted the target point of a caption on atoms without ink). Checkpoint Z is not reached: `npm run dist:win`, the Windows `npm run test:packaged`, `e2e/win`, the C3 probes and all human checks are not run.

### Phase X: safety net and memory
- [ ] A14: Recovery (RC1–RC6)
- [ ] A14a: Session end and the close guard (R24)
- [ ] A14b: An open label or text draft at shutdown (R25)
- [ ] A15: Recent files, single instance, drag and drop

### Checkpoint X — nothing is lost
- [x] `npm run check` green; `e2e/app-recovery.spec.ts`, `app-instance.spec.ts`, `app-recent.spec.ts`, `app-drop.spec.ts` green
- [ ] Commit + push

Windows run of the automated gates of Checkpoint Z, verified by the orchestrator at `956a4a4` (2026-11-11, Windows 11 Pro 26300, Node 26.3.0, Electron 45.2.3, display at 125 %): `npm ci` exit 0; `npm run check` exit 0 (231 files, 4038 tests); `npm run test:e2e` exit 0 (321 passed, 6.9 min, including `e2e/win/`; earlier the same day 308 passed / 13 failed at `b99a6d6` and 319 passed / 1 failed at `85f968a`, defects in the `SPEC.md` Decisions Log); `npm run test:e2e:os-input` exit 0 (1); `npm run dist:win` exit 0 (installer 109,915,593 bytes, 104.8 MiB; `dist/win-unpacked` 347,499,681 bytes, 331.4 MiB); `npm run test:packaged` exit 0 (7); `npm run shots` 97 passed (220 PNGs), compared by eye against the mock-ups. The C3 probes P1-P7 and P2b and `e2e/pdf-facts.spec.ts` P8/P9 passed inside the e2e run; copy median 47.4 ms (`e2e/win/clipboard-perf.spec.ts`). Checkpoint Z is not reached: the installed size, Office, IME, shutdown, display scaling and every other human check are open.

### Phase Y: release (with clipboard-export C13)
- [ ] A16: App and file icons
- [ ] A17: Installer build and packaged smoke test
- [ ] A18: Accessibility pass for the new UI
- [x] A19: app-shell coverage thresholds
- [ ] A20: Docs, Windows checklist, version 1.0.0

### Checkpoint Z — release
- [ ] Every success criterion in both specs met by a test, a shot or a checklist item (tables below and in the clipboard plan)
- [ ] `npm run check`, `npm run test:e2e`, `npm run shots`, `npm run dist:win`, `npm run test:packaged` green
- [ ] `docs/windows-checklist.md` sections "Clipboard and export" and "App shell and installer" present, unticked
- [ ] Commit + push

Human batch 1 (2026-11-11, Windows 11 Pro 26300, development laptop, Office Professional Plus 2016 Click-to-Run Version 2610; performed by a computer-use agent at the owner's request, verified by the orchestrator against screenshots and files): installed from the setup on the development machine (installed size 347,681,841 bytes, 331.6 MiB, 24 files, written in `SPEC-app-shell.md` I1), and the first five human "Clipboard and export" checks passed (SVG drawing, Graphics Format, in PowerPoint and Word at true size, 8.69 x 1.21 in). Checkpoint Z is not reached: SmartScreen, the clean-account installs, the chat-app paste and every other human check, and Checkpoints K, E32 and R, are open.
Human batch 3 (2026-11-12, performed and reported by the owner, not watched by the orchestrator): the owner ran a numbered list of 31 checks by hand with the installed Chalkbond 1.0.0 on the development machine and reported "everything works well. the tests pass." (all 31 run, details not reported per item). Ticked in `docs/windows-checklist.md`: Checkpoint K (5 of 5), Checkpoint R (9 of 10), "Clipboard and export" (all twelve human boxes) and "App shell and installer" (15 of 17). Open: "Shutdown right after an edit" (the written observation), Checkpoint R "Pen or touch", Checkpoint E32 and the cold-start box on the teacher's laptop. Finding: a picture pasted into Discord was "barely visible because it was dark on dark" (transparent bitmap, black ink, Decision X3), to be decided in the 2026-11-12 feature set. Checkpoint Z is not reached; the owner decided to add features before the release. Update 2026-11-12 (later): the owner's written answers ticked "Shutdown right after an edit" ("Yes, it was there") and Checkpoint R "Pen or touch" (not applicable: mouse or touchpad only), so Checkpoint R is 10 of 10 and "App shell and installer" 16 of 17; open: Checkpoint E32 and the cold-start box on the teacher's laptop.

## Success Criteria Coverage

Swept at A20 (2026-11-11, Linux); the Windows cells updated after the Windows run of 2026-11-11 (note above). "Linux" = run and passing on the development machine; "Windows" = run and passing on the Windows machine; "Windows-unrun" = written, not run; "human" = needs eyes, Office or a Windows machine, box in `docs/windows-checklist.md` section "App shell and installer" unticked.

| SC | Criterion (short) | Tasks | Proof and status |
|---|---|---|---|
| 1 | `npm run check`; model folders ≥ 90 % | every task, A19 | `npm run check` and `npm test -- --coverage` with the thresholds in `vitest.config.mts` (`src/main/model` and `src/renderer/app/model` at 100 % lines at A19). Linux |
| 2 | Menu model covers every row; clicked by id; no registered accelerator; K2 | A11 | `src/main/model/menu-model.test.ts`, `src/shared/menu.test.ts`, `src/renderer/app/model/keys.test.ts`, `e2e/app-menus.spec.ts`, `e2e/app-keys.spec.ts` (Linux). Native look of the menus: checklist (human) |
| 3 | Save then open round trip | A8 | `e2e/app-files.spec.ts` (Linux) |
| 4 | Prompt on New, Open, second instance, close | A8, A15 | `e2e/app-files.spec.ts`, `e2e/app-instance.spec.ts`, `src/renderer/app/model/file-flows.test.ts` with stubbed boxes (Linux). Real title-bar ×, Alt+F4, File > Exit: checklist (human) |
| 5 | Exported PNG / SVG (PDF under A) reopen; Save goes to Save as | A9, C11, C12 | `e2e/app-open-pictures.spec.ts`, `e2e/export-png.spec.ts`, `e2e/export-svg.spec.ts`, `e2e/export-pdf.spec.ts` (Linux) |
| 6 | Newer and damaged files: wording, nothing changed | A9 | `e2e/app-open-errors.spec.ts`, `src/main/model/messages.test.ts` (Linux) |
| 7 | Recovery after a kill | A14 | `e2e/app-recovery.spec.ts` (Linux, process kill). On Windows the e2e kills the Electron main process by the pid read inside the app (`b04b84c`; Windows). Real power cut and Windows shutdown (R24, R25): checklist (human, open) |
| 8 | Second launch opens in the first window | A15 | `e2e/app-instance.spec.ts` (Linux). Explorer double-click and the `.chalk` association: checklist (human) |
| 9 | Test hook only with the flag, unpackaged; no fiber code | A2, A17 | `src/main/model/args.test.ts`, `src/renderer/app/model/test-hook.test.ts`, `e2e/app-test-hook.spec.ts`, packaged smoke `e2e/packaged/app.packaged.ts` (Linux against `dist/linux-unpacked`; Windows against `dist/win-unpacked`, 7 passed, 2026-11-11) |
| 10 | No request leaves the app; permissions denied | A3 (counter checked by every e2e file from then on) | `e2e/app-security.spec.ts`, `tests/tooling/app-security.test.ts` (Linux) |
| 11 | Handlers reject bad payloads and other frames | A3, every channel task | `src/main/ipc.test.ts`, `src/main/ipc-schemas.test.ts` (Linux) |
| 12 | Content minimum 960×640; rail fits with the menu bar | A6, A11 | `e2e/app-window.spec.ts` (Linux). The Windows native frame: `e2e/app-window.spec.ts` and `e2e/win/app-window-memory.spec.ts` pass on Windows (2026-11-11), and `e2e/app-settings.spec.ts` W1 checks the first-launch content at the real 125 % scale (`533a77d`, `52de9e5`). The display-scaling checklist item stays (human, open) |
| 13 | Icons; installer builds; packaged app launches | A16, A17 | `tests/tooling/app-icons.test.ts`, `tests/tooling/app-notices.test.ts` (Linux); `npm run test:packaged` against `dist/linux-unpacked` (Linux development check). `npm run dist:win` (exit 0, installer 104.8 MiB) and the Windows packaged run (7 passed): Windows, 2026-11-11. Installed size written in I1 (347,681,841 bytes, 2026-11-11); the clean-account installs and SmartScreen are open |
| 14 | Shots match mock-ups; Windows checks ticked | every UI task; A20 (checklist), human | Shots `e2e/shots/A4`, `A6`, `A8`–`A15`, `A18`, `C8`–`C12` compared by eye by the orchestrator at each checkpoint (Linux). On Windows the shots were compared by eye by the orchestrator on 2026-11-11 (C8, C10, A15 and others, they match). The Windows checks are in the checklist section "App shell and installer": sixteen of seventeen ticked after the owner's hand checks and answers of 2026-11-12; open: the cold start on the teacher's laptop (human) |

## Screenshot review

As in `tasks/plan-clipboard-export.md`: `npm run shots -- A<n>` writes `out/shots/A<n>/<name>.png`
(1280×800 content, `-960` names at 960×640); mock-up PNGs from `node docs/mockups/shell/build.mjs
--png out/mockups-shell`; compare the page area. Native title bar, menus and message boxes are
never in a shot: their content is asserted as data (menu model, stubbed `dialog` options) and the
human compares them with A04–A07, A09–A11, A14 at Checkpoint W and in the checklist.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `minWidth`/`minHeight` with `useContentSize` constrain the outer size on Windows | Med | A6 e2e probes it; the fallback (`setMinimumSize` from the measured frame) is in the spec |
| A native box at startup cannot be stubbed in time | Med | `e2e/stub-dialogs.mjs` main-process preload scripts answers before the app runs (TH4) |
| Parallel e2e launches collide on the single-instance lock or share settings | High | Per-launch user-data folder (TH1, A2); `workers: 1` |
| `registerAccelerator: false` still lets a menu item eat a key | Med | A11 e2e: Ctrl+C in the name field copies text with the menu installed; every K1 key reaches the renderer |
| Alt+click leaves the keyboard in the menu bar | Low | K3 host rule (unit-tested); checklist item |
| Drag and drop cannot be scripted with a disk-backed file | Med | A15 uses a hidden `<input type=file>` filled by `setInputFiles` to get a real `File`, then dispatches the drop with it |
| electron-builder packs production `dependencies` (OpenChemLib already bundled in the renderer) and grows the installer | Low | A17 records the size; the packaged smoke proves the app runs; trimming is a later, measured change |
| The NSIS toolset download needs network on the build machine | Low | Build-time only, once; written in the spec Facts and README |
| Windows shutdown cannot show a prompt | Low | R5: the recovery file is flushed instead (RC5), checklist item |

Checkpoint S status (orchestrator report, 2026-11-11): Linux verified and pushed at 85a5201: check 3,424 tests; e2e 189 tests; A6 shots 2 passed and inspected. Full S remains pending Windows. Still needs Windows: C3 P1–P7/P2b, C4 confirmation, W6 native frame, real Arial, e2e/win, os-input, Office, installer and manual checks. Evidence: /tmp/chalkbond-checkpoint-S.nDiA14/{check-corrected,e2e-corrected,shots-corrected}.log. This worker has not independently verified those checks.
