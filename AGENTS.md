# AGENTS.md

Instructions for any coding agent working in this repo. People can read it too.

## Project

Chalkbond is an offline Windows desktop app (Electron, React, TypeScript) for drawing chemical
structures and reaction schemes for teaching, aimed at a grade 11-12 chemistry teacher in Nepal.
It is built as modules with a strict dependency order; the pure modules live in `src/core`.
The product spec is `SPEC.md`; the module list is `CAPABILITY-MAP.md`. Module ids are stable.

| Order | Module | Depends on | Status |
|---|---|---|---|
| 1 | `doc-model` | none | done |
| 2 | `chem-core` | doc-model | done |
| 3 | `svg-render` | doc-model, chem-core | done; Windows Office checks in `docs/windows-checklist.md` still unticked |
| 4 | `editor` | doc-model, chem-core, svg-render | done; "Editor" checks in `docs/windows-checklist.md` still unticked; the two preset segments are 64×20 (mock-up), under the 24 px target of the spec's Accessibility section |
| 5 | `clipboard-export` | doc-model, svg-render | next; no spec yet |
| 6 | `app-shell` | all | scaffold only (empty window) |

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
npm run golden:sheet      # out/golden-sheet.html; add -- --png out/sheet.png for PNGs
npm run shots             # electron-vite build, then e2e/shots/*.shot.ts -> out/shots/<task>/<name>.png
npm run shots -- E21      # (playwright args pass through; or: npx playwright test --project=shots e2e/shots/E21.shot.ts)
node docs/mockups/editor/build.mjs --png out/mockups   # the approved mock-up PNGs to compare shots with
npx vitest run --project perf                          # editor and core perf budgets alone
npx playwright test --project=e2e e2e/editor-perf.spec.ts   # frame-time probe (needs a build)
npm run build             # out/
```

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
- Coverage targets (specs): `core/*` at least 90 % lines (doc-model 95 %), `renderer/editor` 70 %.

## Module notes

### doc-model

- Every edit goes through its operations; `Doc` is JSON-serializable (no Map, Set, class).
- Coordinates are bond-length units (BLU), y down. Ids are branded strings.
- Ops are draft-aware (Immer) so `transact` records fine-grained patches. `History` takes an
  injectable clock. Undo restores `nextId`, so an undone id can be reissued; callers drop ids.
- The `.chalk` Zod schema is strict: unknown keys are rejected and any new field bumps
  `schemaVersion`. No chemistry rules here.

### chem-core

- The only chemistry module. OpenChemLib objects never leave it. It never reads files or the network.
- Keeps its own valence table for common organic elements; OCL decides only outside it.
- Aromatic rings are stored as all-1.5 bonds (circle-in-ring); Kekulé form is a toggle.
- Dictionary `resources/compounds/compounds.json` is generated by `scripts/build-compounds.mjs`
  (dev-time, PubChem). The app imports the JSON and passes it to `createNameIndex`.
- Library-fact tests pin OCL 9.25.2 behaviour; re-run them before upgrading OCL.
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
  carries the viewport transform. There is no test-only global: `readDocument` / `loadDocument`
  reach the controller through React's fibers.
- The accessibility facts are tested, not assumed: `e2e/editor-a11y.spec.ts` (keyboard walkthrough,
  focus rings, names, hit targets, reduced motion) and `editor-keyboard.spec.ts` (tab order, K4).
- Coverage: `vitest.config.mts` enforces 70 % lines for `src/renderer/editor/**` under
  `--coverage`; timing assertions are skipped there (`CHALKBOND_COVERAGE`), including the
  `ocl-facts` aspirin timing. Never exclude a file to reach the number.
- Perf: budgets and measurements in `SPEC-editor.md` "Performance" and `docs/editor-perf.md`;
  `src/renderer/editor/perf.test.ts` and `e2e/editor-perf.spec.ts`. A miss means a request for
  svg-render's `createRenderer` (spec first), never a looser budget or timeout. Never raise a
  timeout to get green: find what is slow.
- Known caveats: the preset segments are 64x20 (mock-up and Control states) against 24 px in
  Accessibility (`editor-a11y.spec.ts` pins 64x20; the owner decides); `--text-muted` on
  `--active-hover-bg` is 4.60 : 1, `--border-control` on `--pressed-bg` 2.96 : 1 (transient; the spec
  asks for bars and canvas only).

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
  and cancel a synthetic hover. `e2e/os-mouse.spec.ts` moves the real cursor briefly (restored).
- Put temporary files and logs in the OS temp directory, never in the repo root or the drive
  root. `out/`, `coverage/`, `test-results/` and `dist/` are git-ignored.
- Keep the project green on Windows and Linux: no POSIX-only syntax in npm scripts and LF line
  endings (`.gitattributes`). `e2e/launch.ts` has a Linux branch.

## Next: clipboard-export

Write `SPEC-clipboard-export.md` first and get it approved. The editor hands it (details in
`SPEC-editor.md` "Seam to the host"):

- `createEditorController(options)` (`src/renderer/editor/index.ts`) with `getDoc()`,
  `getSelection()`, `run(cmd)` / `canRun(cmd)`, `subscribe`, `undoLabel` / `redoLabel`. Commands:
  undo, redo, cut, copy, paste, duplicate, delete, select-all, zoom-*, clean-up, toggle-kekulé,
  tidy-reaction, `{set-preset}`, `{paste-sub, sub}` (host read a Chalkbond fragment from the
  clipboard), `{insert-text, text}` (host read a name, SMILES or Molfile).
- `onCopy(sub, doc, selection)` fires on Ctrl+C / Ctrl+X with the selected `SubDoc`; the editor's
  own clipboard is in-app only (CB1). The editor never builds export SVG: render with svg-render
  from `getDoc()` / `getSelection()` or the payload.
- A `context-menu` event `{target: HostHit | null, screen}` in canvas px; the editor draws no menu.
- `focus-name-field` is view-only: on the controller `canRun` is false and `run` does nothing.
  `shortcuts: 'canvas-only'` leaves the Ctrl rows (K1) to the host's menu.
- `isDirty()`, `markSaved()`, `load(doc)` and the `dirty` event (app-shell owns save and open).
- The e2e `loadDocument` / `readDocument` helpers reach the controller through React internals;
  replace them with a proper test hook when app-shell owns the controller.
- Open for later: the Windows "Editor" checklist (IME, Word paste, scaling) is still unticked.
