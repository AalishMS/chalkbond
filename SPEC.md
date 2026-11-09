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

Primary user: a chemistry teacher preparing slides. Success = they stop reaching for ChemDraw
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
| UI state | Zustand | 5.x |
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
| Component | Vitest + jsdom | editor tool state machines (pointer event sequences → document) | colocated |
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
   — to be confirmed on Office 2021 during `clipboard-export`), transparent background, tight
   bounds.
5. Export PNG (default 300 dpi, transparent), SVG, PDF; output matches on-screen rendering.
6. Formula and MW for a reference set of ≥ 30 compounds match PubChem values (MW to 0.01).
7. Every edit is undoable/redoable; save → open round-trip is lossless.
8. Works with no network connection.

## Decisions Log

| Date | Decision |
|---|---|
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
| 2026-11-09 | ESLint `no-unused-vars` uses `ignoreRestSiblings` (omit-a-key via rest destructuring). |
| 2026-11-09 | ESLint allows `!` non-null assertions in `*.test.ts` and `__fixtures__/` only (they assert fixture shape; a wrong one fails the test). Source code keeps the rule. |

## Open Questions

None at project level.
