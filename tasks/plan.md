# Implementation Plan: Scaffold + `doc-model`

Covers build-order steps 0 and 1 from `CAPABILITY-MAP.md`: the `app-shell` scaffold (just
enough for an Electron window plus working tooling) and the complete `doc-model` module per
`SPEC-doc-model.md`. Later modules get their own plan once their spec is approved.

Task list: `tasks/todo.md`.

## Overview

`doc-model` is pure TypeScript with no UI, so "vertical slices" here are **capabilities a later
module can use end to end**, each with its own types, operations, invariants and tests:
create atoms/bonds → undo them → add arrows/text/annotations → delete with cascades → move and
rotate → copy/paste → save/open. Every slice leaves `npm run check` green.

## Architecture Decisions

| Decision | Rationale |
|---|---|
| Ids from a `doc.nextId` counter (`a12`, `b7`, `o3`, `g1`) | Ops stay pure and deterministic (exact test expectations, reproducible property tests); undo restores the counter for free. Spec updated. |
| Immer `produceWithPatches` for every mutating op; `History` stores patch pairs | Undo cost ∝ change size, not doc size; one mechanism for every op. Ops are written as Immer recipes internally and exposed as `(doc, …) => Doc`. |
| `Doc` is plain JSON (Records, arrays) — no Map/Set inside | Serializable as-is; Immer patches stay simple. `Selection` (Sets) lives outside `Doc`. |
| Zod schema is the single source for file validation; TS types stay hand-written, with a compile-time check that `z.infer<schema>` matches `Doc` | Readable types in the spec/code, no drift between them and the validator. |
| Rects stay axis-aligned under rotation | Brackets/highlights in slides are axis-aligned in practice; avoids rotated-rect geometry everywhere downstream. Spec updated. |
| Periodic symbols table lives in `doc-model` (symbols only, no masses/valences) | Needed for invariant 8 / file validation; chemistry data stays in `chem-core`. |
| Scaffold uses electron-vite's React-TS template, then trimmed | Known-good wiring of main/preload/renderer builds; less hand-written config. |

## Dependency Graph

```
T0a scaffold window ──► T0b tooling (vitest, eslint boundaries, e2e smoke)
                                   │
                                   ▼
                     T1 types + emptyDoc + invariants
                                   │
                      ┌────────────┴────────────┐
                      ▼                         ▼
              T2 atom/bond ops            T3 history (transact/undo/redo)
                      │                         │
                      └────────────┬────────────┘
                                   ▼
                          T4 draw objects + zOrder
                                   ▼
                     T5 deleteItems cascades + mergeAtoms
                                   ▼
                       T6 transformItems + bounds
                                   ▼
                    T7 fragments + extract / insert
                                   ▼
                     T8 serialize / parse / migrations
                                   ▼
               T9 property suite + fixtures + perf budgets
```

T2 and T3 can run in parallel; everything else is sequential (each builds on shared types).

## Task List

### Phase 0: Scaffold (app-shell step 0)
- [x] T0a: Electron + React + TS window launches
- [x] T0b: Test, lint (with import boundaries), format and e2e tooling

### Checkpoint A — tooling
- [x] `npm run check` and `npm run test:e2e` pass on Linux (window title, canvas, security prefs asserted)
- [x] Commit + push
- [x] **User runs the same commands on Windows** (first real Windows check) — passed 2026-11-09, no fixes

### Phase 1: doc-model foundations
- [x] T1: Types, `emptyDoc`, `checkInvariants`
- [x] T2: Atom/bond operations
- [x] T3: History (transact, undo/redo, coalescing, depth limit)

### Checkpoint B — foundations
- [x] `npm run check` green; can build a benzene ring in a test and undo it step by step

### Phase 2: doc-model full surface
- [ ] T4: Draw objects (arrows, curved arrows, plus, text, caption, callout, bracket, shape) + zOrder
- [ ] T5: `deleteItems` cascades + `mergeAtoms`
- [ ] T6: `transformItems` + `bounds`

### Checkpoint C — editing surface
- [ ] `npm run check` green; every cascade row in the spec has a test

### Phase 3: reuse and persistence
- [ ] T7: `fragments`, `neighbors`, `extract`, `insert`
- [ ] T8: `serialize`, `parse`, migrations
- [ ] T9: Property-test suite, fixtures, perf budgets

### Checkpoint D — module complete
- [ ] All `SPEC-doc-model.md` success criteria met; coverage ≥ 95% on `src/core/doc-model`
- [ ] Commit + push; human review before `chem-core` spec

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| electron-vite 6 + Vite 8 + React plugin 6 are recent; template may lag | Med | T0a first; if the template fails, pin to the newest combination that builds and log it in `SPEC.md` Decisions Log |
| TypeScript 6 config changes (new defaults/deprecations) | Low | Start from template tsconfigs; `npm run typecheck` in T0b catches drift |
| Immer patch overhead on large docs | Med | Perf budgets in T9 (500 atoms, < 2 ms/transact); fallback: snapshot-based undo for coalesced drags |
| Zod schema drifts from TS types | Med | Compile-time equality assertion in T8 |
| Windows-only issues (paths, CRLF, PowerShell scripts) found late | Med | `.gitattributes` forces LF; scripts are Node-based, not shell; Checkpoint A runs on Windows |
| Property tests find flaky ordering (Record key order) | Low | `fragments` and `serialize` sort ids by numeric suffix explicitly |

## Open Questions

None blocking. Spec gaps found during planning (id generation, `Rect`, `Affine`,
`ElementSymbol`, rect rotation) were resolved as recorded above and written into
`SPEC-doc-model.md`.
