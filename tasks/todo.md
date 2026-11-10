# Tasks: Scaffold + `doc-model`

Plan: `tasks/plan.md`. Spec: `SPEC.md`, `SPEC-doc-model.md`.
Definition of done for every task: acceptance criteria met, `npm run check` green, committed.

---

## T0a: Electron + React + TS window launches

**Description:** Create the project from electron-vite's React-TS template, trim the demo
content, set product name "Chalkbond", security defaults (`contextIsolation`, `sandbox`,
no `nodeIntegration`, CSP), and pin the versions listed in `SPEC.md`.

**Acceptance criteria:**
- [x] Built app opens one window titled "Chalkbond" with an empty canvas area (e2e-verified on Linux; `npm run dev` itself is confirmed on Windows at Checkpoint A)
- [x] `npm run build` produces `out/` with no errors; `npm run typecheck` passes
- [x] BrowserWindow uses `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`; renderer has a CSP meta tag

**Verification:** `npm run typecheck && npm run build`; manual: `npm run dev`.

**Dependencies:** None

**Files:** `package.json`, `electron.vite.config.ts`, `tsconfig*.json`, `src/main/index.ts`,
`src/preload/index.ts`, `src/renderer/{index.html,main.tsx,app/App.tsx}`

**Scope:** M

## T0b: Test, lint, format and e2e tooling

**Description:** Add Vitest (+ coverage, fast-check), ESLint 10 + typescript-eslint +
Prettier, the `core/*` import-boundary rule, Playwright Electron smoke test, and the `check`
script. All npm scripts must run under PowerShell.

**Acceptance criteria:**
- [x] `npm test` runs real unit tests (import-boundary lint tests); `npm run test:e2e` launches the built app and asserts the window title
- [x] A file in `src/core/` importing `react`, `electron` or `node:fs` fails `npm run lint` (proven by a lint test fixture or rule config test)
- [x] `npm run check` = typecheck + lint + test, exits 0

**Verification:** `npm run check && npm run test:e2e`

**Dependencies:** T0a

**Files:** `vitest.config.ts`, `eslint.config.js`, `.prettierrc`, `playwright.config.ts`,
`e2e/smoke.spec.ts`, `package.json`

**Scope:** M

### ✅ Checkpoint A — tooling
- [x] All commands above pass on Linux
- [x] Commit + push
- [x] User runs `npm install && npm run check && npm run test:e2e && npm run dev` on Windows

---

## T1: Types, `emptyDoc`, `checkInvariants`

**Description:** Define every type from `SPEC-doc-model.md` (brands, Atom, Bond, Anchor,
DrawObject union, TextRun, Group, Doc, Selection, Rect, Affine), `PERIODIC_SYMBOLS`,
`DocError`, `emptyDoc(now)`, and `checkInvariants` covering invariants 1–8.

**Acceptance criteria:**
- [x] `emptyDoc` returns a doc with `checkInvariants(doc) = []`
- [x] One failing-fixture test per invariant (1–8) asserting the specific violation code
- [x] Module has a single public entry `src/core/doc-model/index.ts`

**Verification:** `npm test -- src/core/doc-model`

**Dependencies:** T0b

**Files:** `src/core/doc-model/{types.ts,elements.ts,errors.ts,doc.ts,invariants.ts,index.ts}` + tests

**Scope:** M

## T2: Atom/bond operations

**Description:** `addAtom`, `addBond`, `updateAtom`, `updateBond`, `neighbors`, ids from
`nextId`.

**Acceptance criteria:**
- [x] `addBond` rejects self-bonds and duplicate pairs (either direction) with `DocError` codes
- [x] Unknown ids throw `DocError('unknown-atom' | 'unknown-bond')`
- [x] Building a 6-ring with alternating bonds yields 6 atoms, 6 bonds, ids `a1…a6`/`b7…b12`, no invariant violations

**Verification:** `npm test -- src/core/doc-model`

**Dependencies:** T1

**Files:** `src/core/doc-model/{atoms.ts,bonds.ts,ids.ts}` + tests

**Scope:** S

## T3: History

**Description:** `createHistory`, `transact` (with `coalesceKey`), `undo`, `redo`, `current`,
`canUndo/canRedo`, `undoLabel/redoLabel`, depth limit 500, `meta.modified` update.

**Acceptance criteria:**
- [x] Undo after N transactions restores each prior doc exactly (deep-equal), redo re-applies
- [x] 200 transactions with the same `coalesceKey` → one undo step; different key or a non-keyed transact breaks the run
- [x] 501st step drops the oldest; new transact after undo clears redo

**Verification:** `npm test -- src/core/doc-model`

**Dependencies:** T1 (parallel with T2; tests use T2 ops once merged)

**Files:** `src/core/doc-model/{history.ts,history.test.ts}`

**Scope:** S

### ✅ Checkpoint B — foundations
- [x] `npm run check` green
- [x] Test: build benzene via `transact` steps, undo to empty, redo to benzene

---

## T4: Draw objects + zOrder

**Description:** `addObject`, `updateObject` for all 8 `DrawObject` variants; zOrder
maintenance (new objects on top; `shape` highlights paint beneath structures per spec);
text `attachedTo` validation (must reference an `arrow`).

**Acceptance criteria:**
- [x] Each variant can be added and updated; invariants hold
- [x] `attachedTo` pointing at a non-arrow is rejected
- [x] zOrder contains each object exactly once after any add/update sequence

**Verification:** `npm test -- src/core/doc-model`

**Dependencies:** T2, T3

**Files:** `src/core/doc-model/{objects.ts,z-order.ts}` + tests

**Scope:** S

## T5: `deleteItems` cascades + `mergeAtoms`

**Description:** Implement every row of the spec's cascade table, group cleanup, and
`mergeAtoms` (re-point bonds, collapse duplicates/self-bonds).

**Acceptance criteria:**
- [x] One test per cascade-table row (atom, bond, arrow, any) asserting the exact resulting doc
- [x] Anchors to deleted atoms/bonds become `point` anchors at their last resolved position
- [x] `mergeAtoms` of two ring atoms that share a neighbour leaves no duplicate bond and no self-bond

**Verification:** `npm test -- src/core/doc-model`

**Dependencies:** T4

**Files:** `src/core/doc-model/{delete.ts,merge.ts,anchors.ts}` + tests

**Scope:** M

## T6: `transformItems` + `bounds`

**Description:** Affine transform of a selection (atoms, arrow ends, point anchors, text
positions, rect centres with size scaling) and `bounds(doc, sel?)`.

**Acceptance criteria:**
- [x] Translate, rotate 90°, flip-horizontal and scale ×2 each produce exact expected coordinates (to 1e-9)
- [x] Atom/bond anchors are untouched (they follow their atom); unselected items unchanged
- [x] `bounds` of empty selection → `null`; of benzene → expected rect

**Verification:** `npm test -- src/core/doc-model`

**Dependencies:** T4

**Files:** `src/core/doc-model/{geometry.ts,transform.ts}` + tests

**Scope:** S

### ✅ Checkpoint C — editing surface
- [x] `npm run check` green; all cascade rows tested
- [x] Commit + push

---

## T7: `fragments`, `extract`, `insert`

**Description:** Connected components (deterministic order), sub-document extraction closed
over a selection, insertion at a point with fresh ids and returned `Selection`.

**Acceptance criteria:**
- [x] `fragments` of a doc with ethanol + benzene returns 2 components sorted by lowest id
- [x] `extract` drops bonds with one unselected end; anchors to unselected atoms become point anchors; attached texts follow their arrow
- [x] `insert(extract(sel))` reproduces the selection's relative geometry with all-new ids

**Verification:** `npm test -- src/core/doc-model`

**Dependencies:** T5, T6

**Files:** `src/core/doc-model/{graph.ts,subdoc.ts}` + tests

**Scope:** M

## T8: `serialize`, `parse`, migrations

**Description:** `.chalk` envelope, deterministic JSON, Zod schema with compile-time
type-equality check, size limit, newer-version error, migration pipeline.

**Acceptance criteria:**
- [x] `serialize` is byte-identical for equal docs regardless of insertion order
- [x] `parse` returns typed errors for: bad JSON, wrong `format`, schema violation, invariant violation, > 20 MB, newer `schemaVersion`
- [x] A synthetic v0 fixture migrates to v1 and parses

**Verification:** `npm test -- src/core/doc-model && npm run typecheck`

**Dependencies:** T7

**Files:** `src/core/doc-model/{schema.ts,serialize.ts,migrations.ts}` + tests + `__fixtures__/`

**Scope:** M

## T9: Property suite, fixtures, perf budgets

**Description:** fast-check op generator covering every public op; properties from the spec;
hand-written fixtures (benzene, 2-step reaction with conditions, mechanism with curved
arrows); timing budgets.

**Acceptance criteria:**
- [x] All four spec properties pass at 1,000 runs each
- [x] Three fixtures round-trip through `serialize`/`parse` unchanged
- [x] 500-atom doc: `transact` median < 2 ms, `fragments` < 1 ms (measured ≈ 0.2 ms each on Windows)

**Verification:** `npm test -- --coverage` (doc-model ≥ 95% lines)

**Dependencies:** T8

**Files:** `src/core/doc-model/{doc-model.prop.test.ts,arbitraries.ts,perf.test.ts}`, `__fixtures__/*.chalk`

**Scope:** M

### ✅ Checkpoint D — module complete
- [x] Every success criterion in `SPEC-doc-model.md` met
- [x] `npm run check` green; coverage ≥ 95% (98.6% lines)
- [x] Commit + push
- [x] Human review → then write `SPEC-chem-core.md`
