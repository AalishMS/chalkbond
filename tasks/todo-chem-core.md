# Tasks: `chem-core`

Plan: `tasks/plan-chem-core.md`. Spec: `SPEC.md`, `SPEC-chem-core.md`.
Definition of done for every task: acceptance criteria met, `npm run check` green, committed.

---

## C1: OpenChemLib dependency, adapter, library facts

**Description:** Add `openchemlib@9.25.2` (exact). Create `ocl.ts`, the only file importing it,
exposing a narrow adapter (create molecule, set atoms/bonds, read perception, SMILES/Molfile,
coordinate invention). Pin each "Verified library facts" row with a test.

**Acceptance criteria:**
- [x] Facts tested: loads without DOM; SMILES coordinates have avg bond length 1.0; y-down; SMILES input kekulized + aromatic flags; delocalized-bond ring unresolved; `*` read as carbon; free valence < 0 for pentavalent C; `fromText('ethanol')` is null
- [x] Lint: importing `openchemlib` from any file outside `src/core/chem-core` fails (existing rule, extended test)
- [x] `src/core/chem-core/index.ts` is the single public entry

**Verification:** `npm test -- src/core/chem-core && npm run lint`

**Dependencies:** doc-model complete

**Files:** `package.json`, `src/core/chem-core/{ocl.ts,ocl-facts.test.ts,index.ts}`, `tests/tooling/lint-boundaries.test.ts`

**Scope:** S

## C2: Kekulé assignment

**Description:** Pure TS solver: for each connected system of order-1.5 bonds, choose single /
double so every atom that needs a π bond gets exactly one; optional donors (pyrrole-type N,
O, S) stay single. Forced-assignment propagation + backtracking.

**Acceptance criteria:**
- [x] Correct, valid assignments for benzene, naphthalene, anthracene, azulene, pyridine, pyrrole, furan, thiophene, indole, imidazole, carboxylate (1.5 outside a ring)
- [x] Unsolvable systems report `cannot-kekulize` with the offending bonds
- [x] Deterministic output (same doc → same assignment)

**Verification:** `npm test -- src/core/chem-core`

**Dependencies:** C1 (none on OCL itself; parallel with C3)

**Files:** `src/core/chem-core/{kekule.ts,kekule.test.ts}`

**Scope:** M

## C3: Label grammar and abbreviations

**Description:** `interpretLabel` (element + H/charge grammar, either side), the grade-level
`ABBREVIATIONS` table (SMILES attached through the first atom), unknown labels.

**Acceptance criteria:**
- [x] `OH`, `HO`, `NH2`, `H2N`, `NH4+`, `O-`, `Cl`, `CH3` → element interpretations with H count / charge
- [x] Every abbreviation's SMILES parses and gives the tested formula; keys are case-sensitive
- [x] Anything else → `unknown`

**Verification:** `npm test -- src/core/chem-core`

**Dependencies:** C1 (parallel with C2)

**Files:** `src/core/chem-core/{labels.ts,abbreviations.ts,labels.test.ts}`

**Scope:** S

## C4: Molecule builder, `perceive`, `formulaOf`

**Description:** Build an OCL molecule per fragment following the spec's mapping table
(pseudo-atoms, abbreviations expanded, Kekulé-resolved 1.5 bonds, charges, isotopes,
radicals, explicit H); read back implicit H, aromaticity, valence, formula, MW, exact mass;
collect warnings.

**Acceptance criteria:**
- [ ] Benzene drawn with 1.5 bonds → C6H6, all atoms aromatic, 1 H each; ethanol → C2H6O, MW 46.07
- [ ] Acetate (charge −1) → text `C2H3O2⁻`; pseudo-atom → `mw: null`, symbol counted
- [ ] Over-valence and unknown-label warnings name the right atoms; valid hypervalent cases stay ok
- [ ] `formulaOf` sums whole fragments touched by the atoms

**Verification:** `npm test -- src/core/chem-core`

**Dependencies:** C2, C3

**Files:** `src/core/chem-core/{molecule.ts,perceive.ts,formula.ts}` + tests

**Scope:** M

### ✅ Checkpoint E — perception
- [ ] `npm run check` green
- [ ] Commit + push

---

## C5: Perceiver cache, `aromatize`, `kekulize`

**Description:** `createPerceiver` with an LRU cache keyed by a coordinate-free fragment
signature; `aromatize` / `kekulize` as Doc → Doc edits through doc-model ops.

**Acceptance criteria:**
- [ ] Moving atoms or adding draw objects causes zero fragment rebuilds (counted via an adapter spy); changing one fragment rebuilds only it
- [ ] `kekulize(aromatize(doc))` keeps every formula; `aromatize` is idempotent; works inside `transact` (one undo step)
- [ ] `kekulize` on an unsolvable system throws `ChemError('cannot-kekulize')`

**Verification:** `npm test -- src/core/chem-core`

**Dependencies:** C4

**Files:** `src/core/chem-core/{perceiver.ts,aromatic.ts}` + tests

**Scope:** S

## C6: SMILES and Molfile in/out

**Description:** `parseSmiles`, `parseMolfile` → centred `SubDoc` (circle or Kekulé aromatics,
wedges/hashes with the narrow end at the stereo centre); `toSmiles` (isomeric),
`toMolfile` (V2000/V3000), abbreviations expanded, pseudo-atoms handled.

**Acceptance criteria:**
- [ ] Typed errors for invalid/empty input and > 1000 atoms (`too-large`)
- [ ] (R)-alanine drawn with a wedge → SMILES with the same canonical IDCode as `C[C@@H](N)C(O)=O`; the mirror drawing gives the enantiomer
- [ ] Molfile V2000 and V3000 round-trip a set of test molecules (canonical IDCode equal)

**Verification:** `npm test -- src/core/chem-core`

**Dependencies:** C4

**Files:** `src/core/chem-core/{convert.ts,convert.test.ts}`

**Scope:** M

## C7: `expandLabel`, `cleanStructure`

**Description:** Replace an abbreviation atom with real atoms laid out away from its neighbour;
re-lay out touched fragments with OCL coordinate invention and fit them back onto the old
positions (rigid, no reflection).

**Acceptance criteria:**
- [ ] Expanding `Ph`, `CO2H`, `OMe` keeps the formula, bonds the group to the old neighbour, and is one undo step
- [ ] Clean Structure on a distorted benzene → regular hexagon (bond length 1 ± 1e-6), centroid unchanged; other fragments untouched
- [ ] Stereo preserved through Clean Structure (canonical IDCode unchanged)

**Verification:** `npm test -- src/core/chem-core`

**Dependencies:** C5, C6

**Files:** `src/core/chem-core/{expand.ts,clean.ts}` + tests

**Scope:** M

### ✅ Checkpoint F — editing chemistry
- [ ] `npm run check` green
- [ ] Commit + push

---

## C8: Compound dictionary and name lookup

**Description:** Curated `scripts/compound-names.txt` (~350 NEB grade 11–12 compounds, IUPAC +
common names); `scripts/build-compounds.mjs` (PubChem PUG-REST, ≤ 5 req/s, dev-time only)
writing `resources/compounds/compounds.json`; `createNameIndex` (Zod) and
`structureFromText` (Molfile → name → SMILES → not-found with suggestions).

**Acceptance criteria:**
- [ ] JSON generated and committed; every entry's OCL formula equals its stored formula; names/synonyms unique after normalisation
- [ ] `propan-2-ol`, `Isopropyl alcohol`, `ethanoic acid`, `acetic-acid` resolve; `CO` parses as SMILES; `etanol` → not-found with `ethanol` suggested
- [ ] The app bundle contains no network code (script lives outside `src/`)

**Verification:** `npm test -- src/core/chem-core`; `node scripts/build-compounds.mjs --check` (offline: validates the list/JSON pair)

**Dependencies:** C6

**Files:** `scripts/{compound-names.txt,build-compounds.mjs}`, `resources/compounds/compounds.json`, `src/core/chem-core/{names.ts,names.test.ts}`

**Scope:** M

## C9: Reference set, properties, perf

**Description:** ≥ 30-compound PubChem reference set; SMILES round trip over the whole
dictionary; fast-check properties reusing doc-model's command generator; perf budgets.

**Acceptance criteria:**
- [ ] Reference set: formula and MW (to 0.01) match PubChem values for ≥ 30 compounds
- [ ] Every dictionary entry: `parseSmiles` → `toSmiles` keeps the canonical IDCode
- [ ] `perceive` never throws on reachable docs; cached perceiver equals `perceive` across edit sequences
- [ ] Perf: `perceive` 500-atom fragment < 16 ms; cached one-fragment change < 3 ms; 50-atom `parseSmiles` < 20 ms (medians)

**Verification:** `npm test -- --coverage` (chem-core ≥ 90% lines)

**Dependencies:** C7, C8

**Files:** `src/core/chem-core/{reference.test.ts,chem-core.prop.test.ts,perf.test.ts}`

**Scope:** M

### ✅ Checkpoint G — module complete
- [ ] Every success criterion in `SPEC-chem-core.md` met
- [ ] `npm run check` green; coverage ≥ 90%
- [ ] Commit + push; human review → then write `SPEC-svg-render.md`
