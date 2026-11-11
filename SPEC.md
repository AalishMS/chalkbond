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
   with a transparent background; export PNG / SVG / PDF.
7. Save and reopen documents; exported SVG/PNG can be reopened in Chalkbond as editable.

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
   < 3 s on a typical laptop.
2. Toluene drawable in ≤ 3 actions (benzene template, click ring atom, done).
3. "ethanol + acetic acid → ethyl acetate + water, H₂SO₄ above arrow, Δ below" buildable in
   ≤ 15 user actions using name insert + arrow + Tidy reaction, ending perfectly aligned.
4. Copy → paste into PowerPoint/Word 2021 on Windows yields an image that stays sharp at 400%
   zoom (vector SVG where Office accepts it from the clipboard, otherwise a high-resolution PNG
   — to be confirmed on Office 2021 during `clipboard-export`), transparent background, bounds
   that contain all ink (exact for non-text, bounded slack around text).
5. Export PNG (default 300 dpi, transparent), SVG, PDF; output matches on-screen rendering.
6. Formula and MW for a reference set of ≥ 30 compounds match PubChem values (MW to 0.01).
7. Every edit is undoable/redoable; save → open round-trip is lossless.
8. Works with no network connection.

## Decisions Log

| Date | Decision |
|---|---|
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
| 2026-11-11 | chem-core: an abbreviation takes exactly one **single** bond; a double or triple bond to it is an `abbreviation-bonds` warning (groups are monovalent; fixes fast-check seed −543139787, where hidden group atoms decided E/Z). |
| 2026-11-11 | chem-core: the aspirin library-fact timing (20 warm-ups, 50 samples, median < 5 ms, skipped only under `--coverage`) moves unchanged from `ocl-facts.test.ts` (parallel `unit` project) to `chem-core/perf.test.ts` (serial `perf` project). Under parallel load it read 5.15 / 5.26 ms; perf budgets are timed on a quiet CPU (Checkpoint G rule). |

## Open Questions

None at project level.
