# Implementation Plan: `svg-render`

Build-order step 3 from `CAPABILITY-MAP.md`. Spec: `SPEC-svg-render.md` (approved 2026-11-10).
Task list: `tasks/todo-svg-render.md`. Previous module: `tasks/plan-chem-core.md`.

## Overview

`svg-render` turns a doc-model document into a deterministic SVG string and per-item ink extents.
Slices, each leaving `npm run check` green: style, number formatting and tooling guards → a safe
SVG writer → committed text metrics → geometry helpers and the ring finder → atom labels → bonds
and aromatic circles → a first end-to-end `render` / `renderSvg` of molecules (subsets, extents,
bounds) → satellites → every other item type → golden scenes with a visual review → property and
tooling tests → perf, the font calibration test and coverage.

Already in place (verified, nothing to add): the ESLint import-boundary entry for `svg-render`
(`CORE_DEPS`) and its probes in `tests/tooling/lint-boundaries.test.ts`; `tsconfig.core.json`
(no DOM, no Node types); a global `* text=auto eol=lf` in `.gitattributes`.

## Architecture Decisions

| Decision | Rationale |
|---|---|
| Each item is laid out once: geometry primitives produce both its markup and its extents | Bounds cannot drift from what is drawn; one place per item type |
| Layout runs on the whole document, then is filtered by `only` | Subsets look exactly as on screen and parts are byte-equal to the full render (SC8) |
| One hand-written SVG writer (`svg-write.ts`) with a fixed attribute order, escaping and allow-lists | Determinism and output safety (SC4, SC9) live in one tested place |
| Text metrics are a generated, committed table (`font-metrics.ts`) from Liberation Sans or Windows' Arial | No DOM, no network at test time, identical on every machine |
| Ring finding stays internal (`rings.ts`) | chem-core exports no ring data and its aromaticity follows OCL, not stored orders |
| Non-deterministic APIs are banned by an ESLint block, not a grep test | Fails at edit time, uses the existing lint gate |
| Goldens come from frozen `.chalk` inputs; the golden sheet is built from the committed SVGs | An OCL layout change never moves a golden; the sheet needs no TypeScript runtime |
| Test helpers `xml-check.ts` and `ink-scan.ts` are written here (no jsdom, no new dependency) | `tsconfig.core.json` has no DOM; an independent ink scan makes the bounds test mean something |
| `createRenderer`, `ids`, `style`/`ink`/`background` options, `contentBounds`, public `measureRuns` cut | Not needed by `editor` / `clipboard-export` in v1 (spec Decision 12) |

## Dependency Graph

```
S1 style, fmt, lint guards ──► S2 SVG writer + xml-check
        │                              │
        └────────► S3 text metrics ◄───┘ (S3 needs only S1)
                         │
        ┌────────────────┴───────────────┐
        ▼                                ▼
S4 geometry + rings              S5 atom labels (needs S3, S4 geometry)
        └────────────────┬───────────────┘
                         ▼
                S6 bonds + aromatic circles
                         │
                         ▼
        S7 render / toSvg / subsets / extents (molecules)
                         │
                         ▼
                S8 satellites
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
   S9 arrows, plus, shape,    S10 text, caption, callout,
      bracket                     curved arrows
              └──────────┬──────────┘
                         ▼
        S11 golden set + golden sheet + visual review
                         ▼
        S12 property suite + tooling tests
                         ▼
        S13 perf, e2e calibration, coverage
```

S9 and S10 can run in parallel (both need S8 and S4's geometry); everything else is sequential.

## Task List

### Phase 1: foundations
- [x] S1: `StyleSettings` meaning, presets, `resolveStyle`, `fmt`, id order; ESLint determinism block; `.gitattributes` golden line; `types.ts` JSDoc wording
- [x] S2: SVG writer (escaping, attribute order, allow-lists, sanitisers) + `xml-check` helper
- [x] S3: font metrics generator, committed table, `text-measure`

### Checkpoint H — foundations
- [x] `npm run check` green; presets, escaping and text widths (`W` 944, `i` 222) pass
- [x] Commit + push

### Phase 2: molecules
- [x] S4: geometry helpers and `rings.ts` (smallest-ring finder)
- [x] S5: atom labels: `label-display.ts`, text, side, bare atoms, anchor boxes, clip boxes
- [x] S6: bonds (single, double, triple, 1.5, stereo) and aromatic circles
- [x] S7: `render`, `toSvg`, `renderSvg`, subsets, extents and bounds for atoms and bonds; `ink-scan` helper

### Checkpoint I — molecules render
- [x] `npm run check` green; benzene, ethanol and acetic acid render to well-formed SVG whose bounds match `ink-scan`; a subset part equals the full-render part
- [x] Commit + push

### Phase 3: satellites and the other item types
- [x] S8: satellites (lone pairs, radicals, charge on a vertex, partial charge, atom number)
- [ ] S9: arrows (5 kinds), plus signs, shapes, brackets
- [ ] S10: text, caption, callout, curved arrows

### Checkpoint J — every item type renders
- [ ] `npm run check` green; doc-model's `kitchen-sink` and `mechanism` fixtures render with no `skipped-item` notice
- [ ] Commit + push

### Phase 4: goldens and hardening
- [ ] S11: ≥ 30 golden scenes, variant-coverage scan, `npm run golden:sheet`, visual review of the sheet
- [ ] S12: property suite and tooling tests
- [ ] S13: perf budgets, e2e font calibration, Windows checklist entry, coverage

### Checkpoint K — module complete
- [ ] Module complete: every success criterion in `SPEC-svg-render.md` met, coverage ≥ 90 % on `src/core/svg-render`
- [ ] `npm run check` green; `npm run test:e2e` green
- [ ] Commit + push

## Success Criteria Coverage

Each criterion of `SPEC-svg-render.md` is met by the tasks named; the last task listed closes it.

| SC | Criterion (short) | Tasks |
|---|---|---|
| 1 | Public API tested, coverage ≥ 90 % | S1 (style API), S7 (render API), S13 (coverage) |
| 2 | Every variant has a rule and a golden input | S6, S9, S10 (rules), S11 (scan test) |
| 3 | Goldens stable, LF, allowed maths only | S1 (ESLint block, `.gitattributes`), S11, S12 |
| 4 | Determinism at 1,000 runs | S12 |
| 5 | Bounds equal independent ink scan | S7 (`ink-scan`, extents), S11, S12 |
| 6 | Circles, 1.5 bonds, Kekulé rules | S4 (rings), S6 |
| 7 | Labels, implicit H, flips, attachment glyph | S5, S6 (bond ends), S8 |
| 8 | Subset equals slice of full render | S7, S12 |
| 9 | Well-formed, allow-listed, no external refs | S2, S12 |
| 10 | Presets: same structure, uniform scale | S1, S11, S12 |
| 11 | Perf budgets on Windows | S13 |
| 12 | No DOM / Node / Electron import | S1 (existing lint), S13 (final check) |
| 13 | Text measurement table + calibration | S3, S13 |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Derived constants (arrowheads, wedge width, circle ratio, label margins) look wrong in practice | Med | S11 visual review of the golden sheet; constants live in one table; changing one regenerates goldens in a reviewed diff |
| No human reviews the pictures (review waived) | Med | The reviewer renders the golden sheet to PNG (`golden:sheet -- --png`) and looks at it at S11; the Windows paste check stays in the checklist |
| Metrics generator needs a font file the developer may not have | Low | Windows' own `arial.ttf` / `arialbd.ttf` is accepted input (same advances as Liberation Sans); the table is committed, so only regeneration needs a font |
| Playwright's Chromium not installed for `--png` | Low | Script fails with a clear message; the HTML sheet still works in any browser |
| Label clipping and satellite placement have many corner cases (labels on all sides, 1 to 4 bonds) | Med | Both are table-tested from all 8 directions in S5/S8 before goldens exist |
| Cross-OS byte identity cannot be tested on Linux from the Windows machine | Low | Banned APIs enforced by ESLint; V8 `sin/cos/atan2/sqrt` argument documented; integer-rounded output |
| Fast-check determinism at 1,000 runs exceeds the 5 s default timeout | Low | Explicit test timeout in S12; small generated docs |
| `render` budget (8 ms for a slide scheme) missed | Low | Perf measured in S13 with `perception` supplied; if missed, profile ring finding first, then ask before adding `createRenderer` (spec "Ask first") |
| Non-Latin captions (Devanagari) mis-centred by the fallback width | Low | Documented limitation (spec Decision 6); `unmeasured-glyph` notice; per-script tables are a later, asked-first change |
