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
| 4 | `editor` | doc-model, chem-core, svg-render | next; no spec yet |
| 5 | `clipboard-export` | doc-model, svg-render | not started |
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

## Gotchas

- Run `npm run check` on its own, in the foreground. Do not pipe it or chain it into the commit
  command; read its exit code and summary first.
- Property tests (fast-check) use random seeds, so one green run is not proof. A failure prints a
  seed; reproduce with `fc.assert(..., { seed })`. Add the counterexample as a fixed regression
  test. Do not remove the property or lower `numRuns`.
- ESLint-probe tooling tests are slow on a cold start. They run as the `tooling` project; leave
  them there.
- `npm run test:e2e` builds first and launches Electron. `golden:sheet -- --png` needs
  Playwright's Chromium: run `npx playwright install chromium` if it is missing.
- Put temporary files and logs in the OS temp directory, never in the repo root or the drive
  root. `out/`, `coverage/`, `test-results/` and `dist/` are git-ignored.
- Keep the project green on Windows and Linux: no POSIX-only syntax in npm scripts and LF line
  endings (`.gitattributes`). `e2e/launch.ts` has a Linux branch.

## Next: editor

Write `SPEC-editor.md` first and get it approved. It is the largest module; split its work into
tool groups. The existing specs hand it these items, which it must settle:

- Selection, hit-testing and marquee: svg-render supplies only per-item `extents`; finer
  hit-testing (distance to a bond segment or arrow path) is the editor's.
- Overlays: selection halos, handles, valence warnings (from `Perception.warnings`, placed with
  `extents`), snapping guides, ghost previews, grid.
- Whether to add a `setStyle` op to doc-model for Slides / Journal switching (additive, not a
  schema change).
- Whether to request svg-render's `createRenderer` (memoising renderer, cut for v1) after profiling.
- Tidy reaction: positions of condition text (`attachedTo` is ignored by svg-render) and reaction
  semantics. The Kekulé/circle toggle and Clean Structure call chem-core.
- Text size: svg-render uses one `fontSize` for all text; a per-object size would be a schema bump.
- Loading `resources/compounds/compounds.json` and passing it to `createNameIndex`.
