# Implementation Plan: `chem-core`

Build-order step 2 from `CAPABILITY-MAP.md`. Spec: `SPEC-chem-core.md` (approved 2026-11-09).
Task list: `tasks/todo-chem-core.md`. Previous module: `tasks/plan.md` (scaffold + doc-model).

## Overview

`chem-core` wraps OpenChemLib (OCL) behind a doc-model-only API. Slices, each usable end to end
and leaving `npm run check` green: library facts pinned by tests → Kekulé assignment and label
grammar (pure TS, no OCL) → perception of a doc → cached perception and the aromatic toggle →
SMILES/Molfile in and out → label expansion and Clean Structure → the compound dictionary and
name insert → reference set, properties and perf.

## Architecture Decisions

| Decision | Rationale |
|---|---|
| One file imports `openchemlib` (`ocl.ts`); every other file uses its small typed adapter | Upgrade surface is one file; OCL types can't leak into the public API by accident |
| Molecules built per fragment from doc-model, with index maps OCL atom/bond ↔ `AtomId`/`BondId` | Perception results map straight back; caching per fragment falls out naturally |
| Own Kekulé solver (`kekule.ts`), pure TS, exact search per 1.5-bond system | OCL leaves delocalized rings unresolved (verified); solver is testable without OCL |
| Abbreviations stored as plain SMILES attached through their first atom | OCL parses `*` as carbon (verified), so no attachment-point marker |
| Perception cache keyed by a coordinate-free chemistry signature per fragment | Drags and recolours never recompute; an edit recomputes only its fragment |
| Dictionary JSON is passed in (`createNameIndex(data)`), validated with Zod | chem-core stays I/O-free; the editor imports the bundled JSON |
| Dictionary generated at dev time from PubChem by `scripts/build-compounds.mjs` and committed | Accurate public-domain values incl. the MW reference set; app stays offline (approved) |

## Dependency Graph

```
C1 OCL dependency + library-fact tests + adapter
        │
   ┌────┴─────┐
   ▼          ▼
C2 Kekulé   C3 labels + abbreviations        (pure TS, parallelisable)
   └────┬─────┘
        ▼
C4 molecule builder + perceive + formulaOf
        │
   ┌────┴──────────────┐
   ▼                   ▼
C5 perceiver cache    C6 SMILES / Molfile in & out (+ stereo)
   + aromatize/kekulize          │
   └────────┬──────────┘         │
            ▼                    ▼
   C7 expandLabel + cleanStructure     C8 dictionary: names list, PubChem script,
            │                             createNameIndex, structureFromText
            └──────────┬──────────────────┘
                       ▼
          C9 reference set, properties, perf
```

## Task List

### Phase 1: foundations
- [x] C1: openchemlib 9.25.2, `ocl.ts` adapter, one test per "Verified library facts" row
- [x] C2: Kekulé assignment for order-1.5 systems
- [x] C3: `interpretLabel` grammar + `ABBREVIATIONS` table

### Checkpoint E — perception
- [x] C4: molecule builder (mapping table) + `perceive` + `formulaOf`
- [x] `npm run check` green; benzene (circle), ethanol, acetate, pyrrole, pentavalent C perceive correctly; commit + push

### Phase 2: chemistry edits and conversion
- [x] C5: `createPerceiver` cache + `aromatize` / `kekulize`
- [x] C6: `parseSmiles`, `parseMolfile`, `toSmiles`, `toMolfile` incl. wedges/hashes
- [x] C7: `expandLabel` + `cleanStructure`

### Checkpoint F — editing chemistry
- [x] `npm run check` green; (R)-alanine stereo round trip passes; commit + push

### Phase 3: names and hardening
- [x] C8: compound dictionary + name lookup
- [x] C9: reference set, dictionary round trips, property tests, perf budgets

### Checkpoint G — module complete
- [x] All `SPEC-chem-core.md` success criteria met; coverage ≥ 90% on `src/core/chem-core`
- [ ] Commit + push; human review before `svg-render` spec

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| OCL's `.d.ts` references DOM types, which `tsconfig.core.json` lacks | Low | `skipLibCheck` is on; `ocl.ts` exposes only plain types. If a needed signature drags DOM in, declare a local minimal interface for it |
| PubChem renamed SMILES properties in 2025 (`IsomericSMILES` → `SMILES`) | Low | Script requests both and uses whichever is present; output is diff-reviewed |
| A common name resolves to the wrong PubChem record | Med | Curated list can pin a CID per line; tests check each entry's formula; JSON diff reviewed by the user |
| Kekulé search slow on large fused systems | Low | Forced-assignment propagation first; perf test on a 500-atom doc; budget per system |
| OCL aromaticity differs from teaching convention for an edge case (e.g. tropylium, cyclopentadienyl anion) | Low | Only rings listed in the spec are promised; others keep whatever bonds the user drew |
| 1.1 MB OCL bundle slows renderer start | Low | Measured load ≈ 35 ms in Node; lazy-load later only if the cold-start budget (< 3 s) is at risk |
| `openchemlib` 9.x minor upgrades change behaviour | Med | Library-fact tests (C1) and dictionary round trips (C9) catch it; upgrades are "ask first" |
