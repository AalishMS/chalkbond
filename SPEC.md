# Spec: Chalkbond (project-level)

This file holds what every module shares: objective, stack, commands, structure, style,
testing and boundaries. Module behaviour lives in `SPEC-<module-id>.md`; the index of modules
is `CAPABILITY-MAP.md`.

## Objective

A Windows desktop app for drawing **chemical structures (aliphatic and aromatic) and reaction
schemes**, aimed at **teaching**: building figures for lecture slides and worksheets fast, and
pasting them into PowerPoint / Word looking sharp. ChemDraw is the feature reference for
interaction design (hotkeys, click-drag bonds, templates, arrows); Chalkbond uses none of its
names, assets or branding.

Primary user: a chemistry teacher in Nepal preparing slides for grade 11–12 students (NEB
curriculum) — mostly basic organic chemistry, IUPAC and common names, simple reactions and
mechanisms. Success = they stop reaching for ChemDraw
for day-to-day slide figures.

### User stories

1. Draw a structure quickly: click to place bonds, type to set atom labels (`O`, `N`, `OH`,
   `CO2H`, `Ph`…), drop ring templates (cyclohexane, chair, benzene, naphthalene, pyridine…).
2. Write a reaction easily: insert reactants/products by **typing a name or SMILES**
   ("ethanol", "acetic acid"), draw an arrow, type conditions above/below it (`H2SO4` is
   auto-subscripted, `Δ`, `hν` via shortcuts), press **Tidy reaction** to align everything on
   one baseline with even spacing.
3. Explain mechanisms: curved electron-pushing arrows (full and fishhook) that stay attached to
   atoms/bonds when structures move; lone pairs, radicals, charges, δ+/δ−.
4. Annotate: free text, callouts with leader lines, compound numbers under structures (**1**,
   **2a**), brackets (‡, `n`), coloured atoms/bonds, highlight shapes.
5. See chemistry info live: formula and MW of the selection, valence warnings on impossible
   atoms.
6. Copy a structure or whole scheme and paste into PowerPoint/Word as a crisp, scalable image
   with a transparent background; export PNG / SVG / PDF. (Since 2026-11-12 the clipboard's
   bitmap, which chat apps and Paint take, is white-backed; Office takes the transparent SVG:
   clipboard-export R10.)
7. Save and reopen documents; exported SVG/PNG can be reopened in Chalkbond as editable.
8. (2026-11-12, owner) Pick a tool with the number keys shown on the tool rail; switch the whole
   drawing between skeletal and structural formula (`CH3`, `CH2` written) with one button.

## Tech Stack

Versions are the current stable releases as of 2026-11-09; pin exact versions in
`package.json` at scaffold time.

| Concern | Choice | Version |
|---|---|---|
| Desktop runtime | Electron | 45.x |
| Build tooling | electron-vite (Vite 8) | 6.x |
| Language | TypeScript, `strict` | **6.0.x** (not 7.x — typescript-eslint supports `<6.1`) |
| UI chrome | React | 19.x |
| Immutable edits + undo patches | Immer | latest 10.x+ |
| File validation | Zod | latest |
| Chemistry | OpenChemLib (BSD-3-Clause) | 9.x |
| Unit tests | Vitest + fast-check (property tests) | 5.x |
| E2E tests | Playwright (`_electron`) | 1.65.x |
| Lint / format | ESLint 10 + typescript-eslint 8, eslint-plugin-react-hooks, eslint-config-prettier, Prettier 3 | — |
| Packaging | electron-builder, NSIS, Windows x64 | 26.x |

Target platform: **Windows 10/11 x64 only**, personal use. Specs were written on Linux;
development, testing and installer builds continue natively on the user's Windows machine.
Reference Office version: **Office 2021**. The installer is **unsigned** (SmartScreen warning on
first run is accepted).
Owner decisions 2026-11-12 (Decisions Log): Windows 10 stays a target but was not tested by hand before
1.0.0 (the human checks run on Windows 11 only); Office 2021 stays the reference, and the Office on the
development machine (Office Professional Plus 2016, Version 2610) is accepted for every Office check;
the development machine is not the teacher's laptop, so the teacher's-laptop checks stay open.

## Commands

```
npm install                 # install deps
npm run dev                 # electron-vite dev: app with hot reload
npm run typecheck           # tsc --noEmit for main, preload, renderer
npm run lint                # eslint . (add -- --fix to autofix)
npm run format              # prettier --write .
npm test                    # vitest run (unit + property tests)
npm test -- --coverage      # with coverage report
npm run test:e2e            # electron-vite build && playwright test
npm run build               # electron-vite build -> out/
npm run dist:win            # electron-builder --win nsis --x64 -> dist/
npm run check               # typecheck && lint && format:check && test (gate before "done")
```

`dist:win` runs natively on Windows. Commands must work in PowerShell — no POSIX-only shell
syntax in npm scripts (use cross-platform Node scripts if needed).

## Project Structure

```
src/
  core/                     # pure TypeScript — no DOM, no Electron, no Node APIs
    doc-model/              # module doc-model
    chem-core/              # module chem-core (only place that imports openchemlib)
    svg-render/             # module svg-render (returns SVG strings, no DOM)
    clipboard-export/       # module clipboard-export: payload/format building (pure parts)
  main/                     # Electron main process (app-shell; clipboard/file writes)
  preload/                  # contextBridge API exposed to the renderer process
  renderer/                 # Electron renderer process (React)
    app/                    # app-shell UI: layout, menus, dialogs, panels
    editor/                 # module editor: canvas, tools, interaction
resources/
  templates/                # ring/template definitions (JSON)
  compounds/                # offline name→SMILES dictionary (JSON)
  icons/
e2e/                        # Playwright Electron tests
tests/tooling/              # tests of the tooling itself (e.g. import-boundary lint rules)
docs/                       # ADRs and notes
CAPABILITY-MAP.md  SPEC.md  SPEC-<module>.md
```

Unit tests are colocated: `foo.ts` → `foo.test.ts`.

Import direction is enforced with ESLint `no-restricted-imports` (rules generated from the
dependency table in `eslint.config.mjs`, proven by `tests/tooling/lint-boundaries.test.ts`) and
by `tsconfig.core.json`, which compiles `src/core` with no DOM or Node types:
`core/*` may import only `core/*` modules it depends on per the capability map;
`core/*` never imports `react`, `electron`, `node:*` or DOM globals.

## Code Style

- Named exports only; no default exports.
- Discriminated unions for variants; exhaustive `switch` with a `never` check.
- Branded string ids; never raw numbers for ids.
- Core functions are pure: input document in, new document (or value) out.
- No `any`; `unknown` + Zod at trust boundaries (files, clipboard, IPC).
- Files `kebab-case.ts`; types `PascalCase`; functions/vars `camelCase`; constants
  `SCREAMING_SNAKE_CASE` only for true module constants.
- Prettier defaults, 100-column width, single quotes.

```ts
// src/core/doc-model/atoms.ts
export type AtomId = string & { readonly __brand: 'AtomId' };

export interface Atom {
  readonly id: AtomId;
  readonly element: ElementSymbol;
  readonly x: number; // bond-length units
  readonly y: number;
  readonly charge: number;
}

export function setCharge(doc: Doc, atomId: AtomId, charge: number): Doc {
  const atom = doc.atoms[atomId];
  if (!atom) throw new DocError('unknown-atom', atomId);
  return produce(doc, (d) => {
    d.atoms[atomId]!.charge = charge;
  });
}
```

## Testing Strategy

| Level | Tool | Covers | Location |
|---|---|---|---|
| Unit | Vitest | every `core/*` function | colocated `*.test.ts` |
| Property | fast-check | doc-model invariants under random edit sequences; undo/redo round-trips; serialize/parse round-trips | colocated `*.prop.test.ts` |
| Golden | Vitest snapshot | `svg-render` output for a fixed set of reference structures | `src/core/svg-render/__golden__/` |
| Component | Vitest (node) | editor tool state machines and reducer (event sequences → document); view markup via `react-dom/server`; DOM behaviour in Playwright e2e | colocated |
| E2E | Playwright `_electron` | launch, draw, undo, save/open, copy (clipboard read back), export | `e2e/` |
| Manual (Windows) | user checklist | paste into PowerPoint/Word, installer, fonts | `docs/windows-checklist.md` |

Coverage targets: `core/*` ≥ 90% lines; `renderer/editor` ≥ 70%. TDD for all `core/*` logic.

## Boundaries

**Always**
- Keep `core/*` free of DOM / Electron / Node imports (lint-enforced).
- Write or update tests with every behaviour change; run `npm run check` before calling a task
  done.
- Electron security: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
  strict CSP, narrow typed preload API.
- Validate every file / clipboard / IPC payload with Zod before use.
- Keep module specs in sync when a decision changes (update spec first, then code).

**Ask first**
- Adding a dependency not listed in Tech Stack.
- Changing the native file schema after v1 ships (requires a migration).
- Changing module boundaries or ids in `CAPABILITY-MAP.md`.
- Anything that needs a network connection.
- Native Node modules (e.g. for advanced Windows clipboard formats).

**Never**
- Use ChemDraw's name, icons, assets, or present Chalkbond files as ChemDraw files.
- Make network calls or add telemetry — the app is fully offline.
- Delete, skip or weaken failing tests to get to green.
- Enable `nodeIntegration` or expose raw `ipcRenderer` / `fs` to the renderer.
- Commit secrets or code-signing material.

## Success Criteria (whole app)

1. Windows installer installs and launches on Windows 10/11 x64; cold start to usable canvas
   < 3 s on a typical laptop. (Windows 10 was not tested by hand before 1.0.0, owner decision
   2026-11-12; the cold-start check on the teacher's laptop stays open, the development machine is not that laptop.)
2. Toluene drawable in ≤ 3 actions (benzene template, click ring atom, done).
3. "ethanol + acetic acid → ethyl acetate + water, H₂SO₄ above arrow, Δ below" buildable in
   ≤ 15 user actions using name insert + arrow + Tidy reaction, ending perfectly aligned.
4. Copy → paste into PowerPoint/Word 2021 on Windows yields an image that stays sharp at 400%
   zoom (vector SVG where Office accepts it from the clipboard, otherwise a high-resolution PNG
   — to be confirmed on Office 2021 during `clipboard-export`), a transparent background for the
   SVG (since 2026-11-12 the clipboard's bitmap entry is opaque white with a margin, R10), bounds
   that contain all ink (exact for non-text, bounded slack around text). (Owner decision 2026-11-12:
   the Office 2016 on the development machine is accepted for this check.)
5. Export PNG (default 300 dpi, transparent), SVG, PDF; output matches on-screen rendering.
6. Formula and MW for a reference set of ≥ 30 compounds match PubChem values (MW to 0.01).
7. Every edit is undoable/redoable; save → open round-trip is lossless.
8. Works with no network connection.
9. (2026-11-12 feature set) The ten digits pick the ten rail tools, except `1`–`3` over an atom or
   bond (editor SC13; automated, plus a hand check). The structural formula switch is one undo
   step that leaves atoms, bonds and coordinates untouched, travels with the file, the clipboard
   and every export, keeps skeletal output byte-identical, and lets files and clipboard drawings
   of the tested 1.0.0 build open (doc-model D1, editor SC14, svg-render SC14, clipboard-export
   SC15; automated); its drawn layout waits for svg-render question S1. The clipboard bitmap is
   opaque white with a 0.25-bond margin while the clipboard SVG and every export stay as they
   were (clipboard-export SC14; automated, plus hand checks in a dark chat app and on a dark
   PowerPoint slide).

## Decisions Log

| Date | Decision |
|---|---|
| 2026-11-11 | clipboard-export C3 (R9), decided by Windows probe (Electron 45.2.3, Windows 11): the clipboard write is the bitmap `image/png`, the raw SVG key and the raw drawing key. No exact-PNG entry (the raw `PNG` key is ignored; Windows' PNG is Chromium's re-encoding without `pHYs`, so a pasted bitmap has the 300 dpi pixel size but no dpi tag; accepted for v1) and no fallback keys (the MIME SVG key is dropped). |
| 2026-11-11 | A20: version 1.0.0 prepared (`package.json`, `package-lock.json`); release pending the Windows checkpoint (Checkpoint Z, `docs/windows-checklist.md`). No Windows run of the installer, `e2e/win`, the C3 probes or the human checks has happened; the I1 installer and installed sizes are unmeasured. |
| 2026-11-11 | app-shell A11 (R18, R19; editor R49 supersedes R12): "Zoom to 100%" from View, Ctrl+1 and the status-bar readout sets zoom 1 (100 %); new and loaded drawings still open at the V2 default (150 % Slides, 416.67 % Handout). Help > Keyboard shortcuts is enabled when idle, matching K1's F1. The M1 enabled rules live once in `src/shared/menu.ts`, re-checked by the renderer before a menu command runs. |
| 2026-11-11 | clipboard-export O7: positive fractional DPI only when no positive integer fits raster caps; deterministic integer search then 64-step feasible-endpoint bisection; pHYs rounding unchanged. |
| 2026-11-10 | C2/A4 editor host seam: shared notices, busy transitions, right-click selection before menu, and host-callable name-field focus (SPEC-editor R45–R47). TH2 gains run(cmd) to verify host-direct commands. |
| 2026-11-09 | Development/build environment: user's Windows machine (no Wine/cross-build). |
| 2026-11-09 | Unsigned installer accepted — personal use. |
| 2026-11-09 | Reference Office: Office 2021. |
| 2026-11-09 | No ChemDraw `.cdxml` import — not on the roadmap. |
| 2026-11-09 | Git repo, pushed to a private GitHub repo. |
| 2026-11-09 | Aromatic rings drawn as circle-in-ring by default (Kekulé available as a toggle). |
| 2026-11-09 | Template's `@electron-toolkit/*` helpers dropped: its preload exposes raw `ipcRenderer`, violating the preload boundary. Main/preload are hand-written. |
| 2026-11-09 | Linux-only e2e launches add `--no-sandbox` (+ headless backend without a display) because dev boxes may lack a root-owned `chrome-sandbox`. Windows runs fully sandboxed. |
| 2026-11-09 | `npm audit` reports a moderate `minimatch` advisory inside electron-builder (build-time only, not shipped). Accepted; revisit on electron-builder upgrades. |
| 2026-11-09 | Checkpoint A on Windows 11 (Node 26.3, npm 11.16): `npm install`, `npm run check`, `npm run test:e2e`, `npm run dev` all pass with no fixes needed; `git status` clean afterwards. The `minimatch` advisory now also appears via eslint / typescript-eslint (15 moderate, all dev-only); the only offered fix downgrades ESLint to 9 — not taken. npm 11's `allow-scripts` warns about `electron-winstaller` (Squirrel, unused by our NSIS target) — ignored. |
| 2026-11-09 | doc-model ops are draft-aware (mutate an Immer draft inside `transact`, produce otherwise) so history stores fine-grained patches; probe showed nested `produce` on a draft yields whole-doc replace patches. |
| 2026-11-09 | `History` takes an injectable clock for `meta.modified`; undo restores `nextId`, so an undone id can be reissued (callers drop ids across undo). |
| 2026-11-09 | `.chalk` Zod schema is strict (unknown keys rejected); any new field bumps `schemaVersion`. Compile-time identity check ties `z.infer` to `Doc`. |
| 2026-11-09 | Rects under `transformItems` map to the bbox of the transformed inscribed ellipse (exact for 90°/flip/scale) — replaces the undefined "scale by \|scale\|". |
| 2026-11-09 | Audience: grade 11–12 (NEB, Nepal). chem-core data (compounds, abbreviations) is scoped to that level. |
| 2026-11-09 | Compound dictionary built by a dev-time PubChem lookup script; JSON committed, app stays offline. Approved network use at development time only. |
| 2026-11-09 | Selection formula/MW = whole fragments touched by the selection. |
| 2026-11-09 | ESLint `no-unused-vars` uses `ignoreRestSiblings` (omit-a-key via rest destructuring). |
| 2026-11-09 | ESLint allows `!` non-null assertions in `*.test.ts` and `__fixtures__/` only (they assert fixture shape; a wrong one fails the test). Source code keeps the rule. |
| 2026-11-09 | `openchemlib@9.25.2` added (exact pin). Lint forbids importing it anywhere but `src/core/chem-core/ocl.ts` (+ chem-core tests that pin library facts), including renderer, main, preload, tests and e2e. A tooling test checks the bundle has no `eval`/`new Function` (CSP). |
| 2026-11-09 | chem-core keeps its own valence table for common organic elements (OCL accepts neutral 4-bonded N and divalent Cl, which the spec flags); OCL decides only outside it. See `SPEC-chem-core.md` "Valence model". |
| 2026-11-09 | doc-model fix found by its round-trip property during chem-core C2: mirroring a curved arrow with `bend: 0` emitted `-0` (now `-bend + 0`), and the generator could pass `bend: -0` (now mapped like coordinates). Regression test added. |
| 2026-11-09 | Atom labels: abbreviations win over element symbols (`Ac` acetyl, `Pr` propyl), case-sensitive. |
| 2026-11-09 | Valence model: implicit H fills only to an element's lowest valence; hypervalent states (SF₆, H₃PO₄, DMSO) must be reached by bonds exactly, so divalent Cl is flagged instead of becoming HClR₂. |
| 2026-11-10 | Compound dictionary generated (406 entries, PubChem PUG-REST, dev-time). Curated `smiles=` overrides for H2 and Grignard reagents; MW computed from chem-core's own IUPAC/PubChem atomic-weight table (OCL's is older; iodine 126.9). Name matching also ignores brackets/apostrophes; `NameIndex.closest` added for 'did you mean'. |
| 2026-11-10 | A drawing preserves only the stereo it defines: sources with open E/Z (`CC=CC`) are drawn — and exported — as the isomer of the 2D layout; Clean Structure keeps defined configuration. Perf-budget tests skip timings under `--coverage` (`CHALKBOND_COVERAGE` set by `vitest.config.mts`). |
| 2026-11-10 | Checkpoint G review fixes (chem-core): the OCL adapter reads OCL's hydrogen reordering back instead of predicting it (drawn H with two bonds no longer throws); perception takes every fixed H count from `explicitH`, so AtomInfo, formula, MW and exact mass agree; the Kekulé solver leaves atoms with a drawn double/triple bond out of the π matching, and `aromatize` converts a bond system only if the chemistry reads back unchanged. Perf-budget test files run as a separate Vitest project after all other files, one at a time (contention made them fail intermittently); budgets unchanged. Details in SPEC-chem-core.md. |
| 2026-11-10 | svg-render complete (Checkpoint K). The font-calibration e2e rasterises a corpus in Chromium and found three text-box errors, fixed in the renderer, not the tolerance: ink boxes now grow 0.05 em left and right (`j` and `f` are drawn outside their advance), bold runs are boxed 0.925 em above the baseline (Arial Bold accented capitals), and U+00AD measures 0 wide. Goldens regenerated (viewBox margins; captions centre up to 0.6 pt differently). Widths agree with real Arial within 0.67 % (kerning). Coverage excludes the generated `font-metrics.ts`. |
| 2026-11-10 | `SPEC-editor.md` reviewed and approved with the editor mock-ups (iteration 2) as the visual source of truth; `docs/mockups/editor/tokens.css` and `icons.svg` are normative and lifted unchanged into the editor. Options trimmed for the audience: bonds Single/Double/Triple/Wedge/Hash, rings Benzene/Cyclohexane/Cyclopentane/Cyclobutane/Cyclopropane, arrows Reaction/Equilibrium/Resonance/No reaction; preset switch labelled Slides/Handout (Handout = `journal`); Bond is the tool at launch. Annotation creation UI (captions, callouts, brackets, shapes, colours) cut; such objects in files stay movable and deletable. |
| 2026-11-10 | Editor zoom: a bond is 80 screen px at the default zoom (150 % Slides, 416.67 % Handout); range 25–800 %; automatic zoom only ever zooms out to fit, never above the default. |
| 2026-11-10 | Editor text and label editing is WYSIWYG: a `contenteditable` projection of a pure editing model; auto-formatting (formula subscripts, `->`, charges, `^`/`_`) applied on commit to characters the user did not format. No right-click menu in the editor; it emits a `context-menu` event for app-shell's native menu. |
| 2026-11-10 | Approved changes for the editor: doc-model `setStyle` op (additive, no schema bump); chem-core `NameIndex.closest` orders near spellings closest first ("ethanl" → ethanol); Zustand dropped from the stack (hand-written store on `useSyncExternalStore`); no jsdom — editor views are tested with `react-dom/server` markup in node plus Playwright e2e; scaffold window minimum 960×640 with no default application menu; ESLint renderer import-boundary and DOM-free rules. |
| 2026-11-10 | Charge on a hydrogens-first label (`H3N–`, `HCl–`): when a bond crosses the trailing superscript, the sign is tried next as a leading superscript (`⁺H3N`, as textbooks write it) before the satellite slots, so it no longer floats above the hydrogens. Labels with only the element symbol and skeleton atoms are unchanged. |
| 2026-11-10 | Editor (R21, R22): a name or scheme insert selects what it inserted, switches to Select, frames the whole drawing (zoom `min(current, fit)`) and leaves the name field focused and cleared. |
| 2026-11-10 | Editor (R23): Ctrl+Z / Ctrl+Y act on the document while the name field is focused and empty; with text in it they are the field's own text undo. |
| 2026-11-10 | Editor (R24): Shift is additive in Select: Shift+click on empty canvas keeps the selection, Shift+drag adds a marquee, Shift+click on an item toggles it. |
| 2026-11-10 | Editor (R25): paste and duplicate land at the source + (1, 1) BLU and cascade; a cut's first paste lands in place. |
| 2026-11-10 | Editor (R27, R32): a hovered labelled atom gets a light box around its label (no ghost); a hovered item that is already selected shows no hover highlight. |
| 2026-11-10 | Editor (R31): the chain badge counts carbon atoms including the start atom (pentane reads 5). |
| 2026-11-10 | Editor (R30): the empty-state block shows only while the document is empty and no gesture runs; no hover ghost is drawn while the document is empty. |
| 2026-11-10 | Editor (R33, R37): default curved-arrow bend is `max(0.2 x chord, 0.45 BLU)`, and at least `0.9 - 0.5 x chord` BLU when an anchor is a labelled atom, so short curly arrows leave the bond and arrive pointing at the label. |
| 2026-11-10 | Editor (R34): a trailing `+` / `-` after a digit run in typed text is a charge (`Fe2+`, `NH4+`, `SO42-`). |
| 2026-11-10 | Editor (R38): the viewport follows the preset's bond length on switch, undo and redo (zoom x old / new bond length, drawing centre kept). |
| 2026-11-10 | Editor (R39): a two-atom, one-bond structure from the name field is rotated so its bond is horizontal (H-H, O=O in `2 H2 + O2 -> 2 H2O`). |
| 2026-11-10 | E2E test windows ignore OS mouse input (`e2e/no-os-mouse.mjs`, preloaded with `-r` by `e2e/launch.ts`; `setIgnoreMouseEvents(true)` on `browser-window-created`). A test window under the physical cursor received real pointer events between Playwright's synthetic ones and cancelled pending hover tooltips (intermittent `getByRole('tooltip')` not found). Production never loads the preload. Guarded by `e2e/no-os-mouse.spec.ts` (default e2e project: asserts the guard registry on `globalThis` covers every window, including one created after launch; never touches the cursor) and by `e2e/os-input/os-mouse.spec.ts`, which moves the real cursor over a raised test window (Windows) and restores it; that one is the Playwright project `os-input`, run only by `npm run test:e2e:os-input`. |
| 2026-11-10 | Editor complete (Checkpoint R): coverage 70 % lines enforced for `src/renderer/editor` in `vitest.config.mts`; the `ocl-facts` aspirin timing skips under `--coverage` like the perf budgets; accessibility is proved by `e2e/editor-a11y.spec.ts` and every colour pair `editor.css` uses by `tests/tooling/editor-tokens.test.ts`. |
| 2026-11-10 | `SPEC-clipboard-export.md` and `SPEC-app-shell.md` reviewed and approved with the shell mock-ups (`docs/mockups/shell/`, commit d3abe4b) as the visual source of truth; `shell-tokens.css` and `shell-icons.svg` there are normative and lifted into `src/renderer/app/` as their own files (never merged into the editor's copies). |
| 2026-11-10 | Clipboard: Electron 45.2.3 has only the async `clipboard.write/read/has/readText/writeText/clear` (typings checked). One `write` carries a 300 dpi transparent tight PNG, an SVG and the drawing; raw Windows formats (`electron application/osclipboard;format="…"`, documented only for `has`) are used only after a Windows probe, with named fallbacks. Copy with nothing selected copies the whole drawing; Ctrl+V reads the system clipboard (in-app cascade for the editor's own last copy; plain text pastes as a name or SMILES). Copy button at the right end of the top bar, label-only below 1100 px. |
| 2026-11-10 | PDF export embeds the drawing by a standard incremental update (new stream object, classic xref section, trailer with `/Prev`) if an early probe shows Chromium writes a classic cross-reference table and its viewer accepts the update; otherwise PDF is exported without the drawing and the Export dialog says so. The PDF is printed in main and embedded in the renderer (main imports no core module). C4 corrective probe confirms PDF-A on Linux: hidden viewer minimum dimensions avoid headless 1×1 clamping; updated and original captures match exactly. Windows confirmation remains pending. |
| 2026-11-10 | App shell: one window; native File / Edit / View / Help menus that display but never register accelerators (the renderer owns every key; text fields keep native Ctrl+C / V / Z, also from the Edit menu); minimum content size 960×640 (`useContentSize`); no settings screen (window, recent 8, folders, Export choices and new-drawing style remembered); recovery file ≤ 10 s behind, closing the offer recovers; renderer never sees paths (opaque file refs, dropped paths read in the preload). |
| 2026-11-10 | Installer: NSIS one-click per user, no admin, `.chalk` association, unsigned, no auto-update, en-US only, version 1.0.0 at release. Icons are committed `.ico` files with PNG entries rendered by Playwright's Chromium and packed by a small script: electron-builder would otherwise download its icon toolset from GitHub to convert a PNG; a file-association icon must be `.ico` anyway. The NSIS toolset itself is downloaded once at build time. |
| 2026-11-10 | e2e test hook (`window.__chalkbondTest`) and a per-launch user-data folder are enabled only by `--chalkbond-test-hooks` / `--chalkbond-user-data` on an unpackaged build; the React-fiber helpers are removed. Windows-only e2e specs live in `e2e/win/`, ignored on other platforms by `testIgnore` (no skipped tests). |
| 2026-11-10 | Linux baseline: UI typography keeps Segoe UI first and falls back to installed Arial / Liberation Sans before system-ui, preserving the approved fixed control sizes (including the 109 px Kekulé toggle). Its fixed 109 px Kekulé toggle uses 4 px right padding so the longer fallback label fits without moving the icon or label. No bundled font or project dependency. |
| 2026-11-10 | Linux font calibration: preserve Arial advances and logical layout; include bold Liberation Sans bars (`\|`, `¦`) with 0.225 em ink descent and fractions (`¼`, `¾`) with 0.075 em right overhang. Apply only to runs containing those glyphs; keep calibration tolerances and other extents unchanged. |

| 2026-11-11 | C7 approved IPC correction: C1 drawing is nullable only above MAX_FILE_BYTES; omit editable entry while retaining picture formats. Non-null validation unchanged; no Doc schema change. |
| 2026-11-11 | clipboard-export C9 (correction), app-shell SEC7/F14: the editable drawing stays at 20 MiB (`MAX_FILE_BYTES`, `parse`); picture carriers (PNG/SVG/PDF files, clipboard PNG/SVG) may be up to 64 MiB, the existing write cap. Main reads `.chalk` ≤ 20 MiB and pictures ≤ 64 MiB; `extractDrawing` likewise; C1 SVG ≤ 64 MiB UTF-8. `exportSvg` (one render) drops only its metadata when the SVG would pass 64 MiB (escaping can expand a 20 MiB payload 3.5×); the PNG drops only its payload chunk when that alone passes 64 MiB. Exports must pick N-E3 from the written bytes (C11/C12). F14 too-large detail: "Drawings can be up to 20 MB. Pictures made in Chalkbond can be up to 64 MB." No schema or Doc change. |
| 2026-11-11 | clipboard-export C8 (correction): paste cascades in-app only while the editor's clipboard is the one whose copy last reached the system clipboard. Every `onCopy` bumps an editor-copy generation; a successful selection/cut write records it; CB-P1 compares it after the read. A failed copy B, or a copy B made while a paste waits or reads, now pastes the clipboard's drawing A as a fragment instead of B. `lastEditorCopy` semantics and the editor API unchanged. |
| 2026-11-11 | chem-core: an abbreviation takes exactly one **single** bond; a double or triple bond to it is an `abbreviation-bonds` warning (groups are monovalent; fixes fast-check seed −543139787, where hidden group atoms decided E/Z). |
| 2026-11-11 | chem-core: the aspirin library-fact timing (20 warm-ups, 50 samples, median < 5 ms, skipped only under `--coverage`) moves unchanged from `ocl-facts.test.ts` (parallel `unit` project) to `chem-core/perf.test.ts` (serial `perf` project). Under parallel load it read 5.15 / 5.26 ms; perf budgets are timed on a quiet CPU (Checkpoint G rule). |
| 2026-11-11 | app-shell R14 (A8): in the unsaved-changes prompt, **Save** lets New, Open or close go ahead only if the save succeeded and the drawing is clean afterwards; an edit made while the file was being written keeps the newer drawing dirty and stops the pending action (no replacement, no extra box). N2 takes `{ ref \| null }` so main knows the session file (Save as starts in a picture's folder) without the page holding a path. |
| 2026-11-11 | app-shell (A7 correction): a name without an Open extension chosen in the native Open dialog (typed `notes.docx`) shows the existing F14 `unsupported` box (main builds it from the base name; detail lists .pdf under PDF-A) and I1 answers `null`; the drawing is untouched, no save prompt. Only the name is judged; missing, directory and read failures keep their I2 mapping. `FileRef.kind` stays the Open formats; no path reaches the renderer. |
| 2026-11-11 | app-shell R15/R16 (A10 correction): a settings read that fails other than `ENOENT` (after 3 × 100 ms retries of `EBUSY` / `EPERM`, as F9) runs on in-memory defaults and never writes `settings.json` for the rest of the run, so unreadable preferences are not overwritten; the stored window accepts only int32 integers (size > 0), anything else is W1 via the ST3 repair. |
| 2026-11-11 | app-shell R17 (A8 correction) and editor R48: New, Open (after validation) and close, including a handed-over open, first finish an open label or text editor through its commit path (host DOM port `finishEditing`, injected into file-flows), then decide dirty; again after a prompt-triggered Save before R14. A blur during an IME composition defers the commit until `compositionend` has reconciled the DOM into the model. |
| 2026-11-11 | clipboard-export C10 (correction of C12): PDF-A embedding and reading are byte-based with bounded memory up to the 64 MiB picture cap: only the tail, trailer dictionary, table lines (one at a time) and the payload (bounded chunks) are decoded; the writer copies the original once and appends. Results equal C12's parser on every input; no public signature, cap or limit changes. On real near-64 MiB PDFs C12's whole-file string took a test worker to 3.7 GB resident and 8–190 s per case. |
| 2026-11-11 | clipboard-export C11 (correction of R1): the rasteriser encodes with `canvas.toDataURL('image/png')` and decodes the data URL itself (PNG prefix checked, decoded size against 64 MiB before any `atob`, bounded chunks); `toBlob` (an idle-task encoder that kept a copy waiting about 1 s, median 1044 ms against SC12's 500 ms in the portable e2e) is gone, with no fallback. Failures use the existing N-C6 notice / write-failed box. SVG decode, sizes, white fill, URL revoke, chunk rules, caps and limits unchanged. Windows SC12 is still unrun. |
| 2026-11-11 | app-shell R20 (RC2 safety): a successful Save clears the recovery file only when the drawing is clean afterwards; a newer edit during the write keeps or refreshes it, so an older snapshot's save never deletes newer work. Cancelled or failed Save / Open keep it; New / Open clear only after the unsaved-changes prompt passed; undo to saved clears unless the drawing was recovered; a normal close clears before the window closes; crash, gone renderer and Windows shutdown never clear. |
| 2026-11-11 | app-shell R24 (RC5 correction): `query-session-end` only asks for a best-effort recovery flush and changes no close-guard state; only `session-end` lets the following close skip the save prompt and the recovery clear, so a cancelled Windows shutdown leaves the normal close prompt intact. The flush never delays the shutdown; the promise is the power-cut one (changes older than 2 s, 10 s in a burst). |
| 2026-11-11 | app-shell R25 (RC5 correction): the shutdown flush first finishes an open label or text editor through its normal commit path (not during an IME composition, which is left alone and not recoverable), then writes; synchronous, nothing is awaited. |
| 2026-11-11 | app-shell R26 (dialog keys): in a dialog whose body scrolls, Arrow Up/Down, Page Up/Down, Home and End scroll the body unless the focused control uses the key itself (radio cards, segments, text fields) or Ctrl/Alt/Meta is held; focus does not move, no tab stop is added. Found by A18: at 960×640 the shortcuts list could not be read by keyboard | Accessibility at the minimum window |
| 2026-11-11 | Checkpoint Z, first Windows run of the automated gates (orchestrator, Windows 11 Pro 26300, Electron 45.2.3, display at 125 % with a second monitor): `npm run check`, `npm run test:e2e` (321 passed, including `e2e/win/`), `npm run test:e2e:os-input`, `npm run dist:win`, `npm run test:packaged` (7) and `npm run shots` (97) passed at `956a4a4`. Sizes: installer 104.8 MiB, unpacked 331.4 MiB; installed size and every human check are still open, so 1.0.0 is not declared released. Supersedes the A20 row above, which says nothing had run. |
| 2026-11-11 | Windows defect (test harness, `b04b84c`): the recovery e2e killed Playwright's Windows shell wrapper (`app.process()`), not the app, so the app was never killed. Root cause: on Windows Playwright starts Electron through a shell. Fix: the test takes `process.pid` from inside the app and kills that. No product change. |
| 2026-11-11 | Windows defect (test oracle, `85f968a`): the paste-centre e2e oracle measured the view after V5 re-framed it, not at paste time. Fix: the oracle measures with the view at paste time. No product change. |
| 2026-11-11 | app-shell W1 (product defect, `533a77d`): on a fractional display scale (125 %) the first-launch window had content 1281x801 instead of 1280x800, because the frame measured in DIPs is rounded up. Found by the second Windows e2e run, after the display setup changed. Fix: after `setBounds`, a first launch that is not maximized calls `setContentSize(1280, 800)`. Regression test `e2e/app-settings.spec.ts` "W1: a first launch has a content area of exactly 1280 x 800 at the display scale" runs at the real display scale; it asserts the content size when not maximized and that the work area cannot hold the window when maximized. |
| 2026-11-11 | Checkpoint Z human batch 1 (development laptop, Windows 11 Pro 26300, Office Professional Plus 2016 Click-to-Run Version 2610; performed by a computer-use agent at the owner's request, verified by the orchestrator against screenshots and an exported SVG): the first Windows paste into PowerPoint and Word arrives as the SVG drawing (ribbon Graphics Format) at true size: PowerPoint 8.69 x 1.21 in against the exported SVG's 625.597 x 86.808 pt (8.689 x 1.206 in), bonds 40.00 pt, labels 24 pt; Word (Handout) 3.16 x 0.46 in. So the missing `pHYs` on the clipboard bitmap (Decision R9 of clipboard-export) does not affect Office; a bitmap-only target (Paint) gets the 300 dpi pixels (2607 x 362 px). Installed size 347,681,841 bytes (24 files) written in `SPEC-app-shell.md` I1. |
| 2026-11-11 | Checkpoint Z human batch 2 (same machine, Office and way of working as batch 1; performed by a computer-use agent, verified by the orchestrator against screenshots and by parsing the exported files): the exported files work on Windows. PNG at Print is 948 x 137 px with `pHYs` 11811 (300 dpi), transparent, and Word's Insert > Pictures honours the 300 dpi (0.46 x 3.16 in, equal to the pasted SVG); SVG is identical to the paste in PowerPoint; PDF is one page of the drawing's size (625.92 x 87.12 pt) with embedded ArialMT and a valid incremental update (two classic xref sections), read by pdf.js and by xpdf without error; all three reopen in Chalkbond as editable drawings. A drawing copied and pasted back after a restart is editable, and a PowerPoint picture is refused with the standard notice. Microsoft Edge and Adobe Acrobat Reader were not tried (Edge would not launch, Acrobat Reader is not installed) and nothing was printed on A4, so the PDF box stays open. The labels box ticked in batch 1 is reopened: `CO₂H` was never drawn and the font name inside Office was not read. |
| 2026-11-12 | Owner decision (teacher's laptop): asked "Is this laptop the one the teacher will use?", the owner answered "no this laptop is not the one the teacher will use". The checks specified for the teacher's or owner's laptop (Checkpoint E32 in `docs/windows-checklist.md` and the app-shell box "Cold start of the installed app to a usable canvas is under 3 s on the teacher's laptop", SC1) cannot be done on the development machine; they stay open and unticked and their requirements are unchanged. |
| 2026-11-12 | Owner decision (Office): asked whether the Office on the development machine is acceptable in place of Office 2021, the owner answered "sure it will work in it". That Office is Microsoft Office Professional Plus 2016 as its Account page shows it, Version 2610 (Build 20527.20150 Click-to-Run), Current Channel. Every Office check (Checkpoint K, "Clipboard and export", SC4) may be run with it. The wording of the boxes is unchanged; each recorded result names the Office actually used. Office 2021 stays the reference version (2026-11-09). |
| 2026-11-12 | Owner decision (Windows 10), the orchestrator's reading: asked "Do you have a Windows 10 machine or VM? Without one, the Windows 10 install check can't be done and the release can't be declared as the checklist stands.", the owner answered "no we dont need that". Read as: the owner waives the Windows 10 human checks; the human sections and the clean-account install run on Windows 11 only. Windows 10/11 x64 stays the target, and Windows 10 is untested by hand for 1.0.0. |
| 2026-11-12 | Owner hand checks passed (Checkpoint Z step 9, batch 3): the owner ran a numbered list of 31 checks by hand with the installed Chalkbond 1.0.0 (installer built at `956a4a4`) on the development machine (Windows 11 Pro 26300, Office 2016) and reported "everything works well. the tests pass." (all 31 run; details not reported per item; not watched by the orchestrator). Ticked in `docs/windows-checklist.md`: Checkpoint K, Checkpoint R except "Pen or touch", every human box of "Clipboard and export", and 15 of 17 of "App shell and installer". Open: "Shutdown right after an edit" (reported as passed, the written observation of whether the last change was there is outstanding), Checkpoint R "Pen or touch" (conditional, not run), Checkpoint E32 and the cold-start box (teacher's laptop). Finding: pasted into a dark-mode chat app (Discord) the copied picture was "barely visible because it was dark on dark", because the clipboard bitmap is transparent with black ink (Decision X3 of `SPEC-clipboard-export.md`); to be decided in the 2026-11-12 feature set. The owner also asked for new features before the release, so the human checks those features touch will be repeated on the final installer; the release is not declared. |
| 2026-11-12 | Feature set before the release (owner's requests, orchestrator's decisions, specified by W9). **F1 number keys** (editor R50, app-shell R27): digits `1`–`9`, `0` pick the rail tools in rail order and each rail button shows its digit; over a hovered atom or bond `1`–`3` keep editor R5 wherever hover keys are active; letter keys and Ctrl+1 / Ctrl+0 unchanged. UI decisions U1–U4 (badge look, `aria-keyshortcuts` with a name-only label, the exact exception, digit-first shortcuts rows) are W9's and go to the owner. |
| 2026-11-12 | **F2 structural formula display**, document part (doc-model D1, editor R51 and R52, clipboard-export R11, app-shell R28): schema v2 adds `style.formula?: 'structural'` (absent = skeletal); `serialize` writes v1 whenever `formula` is absent, so every existing byte and the tested 1.0.0 build's ability to open skeletal files and pastes are kept, and a structural drawing (v2) is refused there as "newer version". One "Show structural" / "Show skeletal" button after Show Kekulé, whole document, one undo step, no menu entry, new drawings skeletal. UI decisions U5, U6, U8–U12 are W9's; the key Ctrl+Shift+F is only proposed (U7). |
| 2026-11-12 | **F2 layout is open (svg-render Decision 15, question S1).** Under the existing label rules, structural labels collide: in both presets a bond vanishes in ethanol, propane, isobutane, benzene and toluene, and the `CH2` and `CH3` glyphs of ethanol and propane overlap by about 2 pt (Handout stubs elsewhere 2.1–2.5 pt). Options recorded in `SPEC-svg-render.md` (longer bonds in structural mode, hydrogens stacked, a minimum stub); W9 recommends longer bonds ×2. No structural layout rule is specified and the F2 rendering tasks wait for the answer. **Answered the same day (next row).** |
| 2026-11-12 | **F2 layout decided (S1 answered; `SPEC-svg-render.md` Decision 16, editor R53, clipboard-export R12).** The owner, shown option A (hydrogens above or below the carbon, same size) and option B (ordinary labels, bonds twice as long): *"Definately B. Also no need for the benzene rings to show its structural formula. Rings can stay how they are."* Orchestrator's reading: in structural mode a carbon that is a member of any ring is not written and rings are drawn exactly as in skeletal mode; a carbon outside a ring is written even when attached to one (toluene's `CH3`). Orchestrator's model of B: a structural document is drawn as if every coordinate were ×2 with the style unchanged (factor 2 in both presets; svg-render's `ResolvedStyle.ptPerBlu`); stored coordinates never change, so switching back is byte-exact; written carbons use the existing label rules. Consequences: the clipboard margin stays 0.25 × the preset's bond length; pictures are correspondingly larger at true size; budgets, coverage thresholds and `numRuns` unchanged; no existing golden changes. Recomputed with the committed renderer: shortest visible bond 29.33 pt (Slides) and 8.47 pt (Handout), smallest label gap 31.05 pt and 8.43 pt; thresholds L1 `0.25 × ptPerBlu` and L2 `0.5 × fontSize`. The file format change (v2) was put to the owner explicitly and approved ("Yes, approve"; doc-model D1). UI decisions U13–U15 (the view keeps its zoom on a switch; viewport defaults follow the style's bond length; tooltip text) are W12's. Open: S2 (lone-pair arrow offsets and condition texts in structural mode). Task N3 is unblocked and split into N3a and N3b. |
| 2026-11-12 | **F2 S2 answered B (orchestrator; `SPEC-svg-render.md` Decision 16 (e), "The layout" item 6).** In structural mode the two stored offsets that point at style-sized ink are drawn at the style's scale, not doubled: a curved arrow's or callout's atom-anchor `offset` (the lone-pair tail stays where it is in skeletal mode relative to the dots) and a condition text's offset from the midpoint of the arrow it is attached to; rule "decoration distances stay as in skeletal mode". Stored coordinates never change and skeletal bytes are unchanged. The editor inverts the same mapping where it places or moves such items (editor tasks after N3a). |
| 2026-11-12 | **F3 white-backed clipboard bitmap** (clipboard-export R10, amends X3): the `image/png` clipboard entry is opaque white with a margin of 0.25 × the bond length (Slides 10 pt = 41.67 px, Handout 3.6 pt = 15 px at 300 dpi); the clipboard SVG stays transparent and tight; File > Export unchanged. Trade-off: an application that takes the bitmap and has a coloured page shows a white box; the Office pastes of 2026-11-11 took the SVG and are unaffected. |

## Open Questions

- **S1** answered 2026-11-12 (Decisions Log; `SPEC-svg-render.md` Decision 16).
- **S2** answered B 2026-11-12 (Decisions Log; `SPEC-svg-render.md` Decision 16 (e) and item 6).
- **U7 (2026-11-12, for the orchestrator):** a key for the formula switch (proposed Ctrl+Shift+F,
  `SPEC-editor.md` R51).
