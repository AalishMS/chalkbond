# Spec: `chem-core`

Shared stack, commands, style and boundaries: see `SPEC.md`. Module map: `CAPABILITY-MAP.md`.
Depends on: `doc-model` (public entry only). Status: **approved 2026-11-09**.

Audience: a teacher of grade 11–12 chemistry in Nepal (NEB curriculum) — basic organic and
inorganic chemistry. Data sets (compounds, abbreviations) are scoped to that level.

## Objective

The only module that knows chemistry. It reads `doc-model` documents and answers chemical
questions about them — implicit hydrogens, valence problems, aromaticity, formula and mass —
and performs the edits that need chemistry: Kekulé ↔ aromatic-circle, Clean Structure,
expanding an abbreviation, and turning a name, SMILES or Molfile into a structure (and back).

It is the **only** place that imports `openchemlib` (lint-enforced); OpenChemLib objects never
leave the module. Everything in and out is `doc-model` types or plain values.

User stories served (from `SPEC.md`): 1 (atom labels like `OH`, `CO2H`, `Ph`), 2 (insert by
name or SMILES), 5 (formula/MW of the selection, valence warnings), plus the Kekulé ↔ circle
toggle and Clean Structure used by `editor`.

## Scope

**In:** perception (implicit H, valence warnings, aromaticity, formula, MW, exact mass);
atom-label interpretation and abbreviation expansion; Kekulé assignment for order-1.5 bonds;
aromatize / kekulize; 2D Clean Structure; SMILES and Molfile (V2000/V3000) in/out; offline
name → structure lookup with prefix suggestions.

**Out:** drawing H labels and circles (`svg-render`, using this module's perception); reaction
semantics and Tidy reaction (`editor`); IUPAC name *parsing* (no OPSIN-style generator — names
come only from the dictionary); CIP R/S labels; 3D; file and clipboard I/O (`app-shell`,
`clipboard-export`); network access of any kind.

## Verified library facts

Probed on 2026-11-09 against **openchemlib 9.25.2** (BSD-3-Clause, published 2026-10-27, current
9.x). These shape the design; each gets a regression test so an upgrade can't silently change
them.

| Fact | Consequence |
|---|---|
| Pure ESM bundle, 1.1 MB min (343 KB gzip); no `eval`/`new Function`; loads in plain Node in ~35 ms with no DOM | Runs in the sandboxed renderer under the existing strict CSP and in Vitest's `node` env |
| `Molecule.fromSmiles` invents 2D coordinates with average bond length **1.0** | Same unit as doc-model's BLU — no scaling on import |
| y axis points **down** (atom with larger y depicts lower) | Same as doc-model — coordinates map 1:1, no flip |
| SMILES input kekulizes aromatic rings (bond types single/double) and flags them via `isAromaticBond` | Import can choose circle (1.5) or Kekulé form |
| A ring built from `cBondTypeDelocalized` bonds is **not** resolved: delocalized benzene gives formula C6H12 | chem-core assigns Kekulé bonds itself before building an OCL molecule (see below) |
| `*` in SMILES comes back as carbon (`*c1ccccc1` → C7) | Pseudo-atoms (`R`, `X`, `*`) are mapped explicitly, never via SMILES `*` |
| `getFreeValence(atom) < 0` for pentavalent carbon; `getImplicitHydrogens`, `getMolecularFormula()` → `{ formula, relativeWeight, absoluteWeight }` | Basis for valence warnings, H counts, formula/MW |
| `Molecule.fromText('ethanol')` → `null` | No names in OCL; the dictionary is ours |
| Parse + formula of aspirin from SMILES ≈ 0.4 ms | Perception is cheap enough to run on every edit (with caching) |

Pin `openchemlib` to `9.25.2` exactly (it is already in the Tech Stack).

## Data Model

```ts
// ── Perception ──────────────────────────────────────────────────────────────────────────
interface AtomInfo {
  implicitH: number;          // H to draw next to the atom (explicitH if set, else computed)
  aromatic: boolean;
  valence: 'ok' | 'over';     // 'over' → editor shows a valence warning on this atom
}
interface BondInfo { aromatic: boolean }

interface Formula {
  counts: Readonly<Record<string, number>>; // element symbol → count, incl. 'H'; pseudo-atoms
                                            // counted under their symbol ('R', 'X', '*')
  charge: number;                           // net formal charge
  hill: string;                             // Hill order, e.g. 'C2H3O2' (charge not included)
  text: string;                             // display form incl. charge, e.g. 'C2H3O2⁻'
  mw: number | null;                        // average mass (g/mol); null if pseudo-atoms
  exactMass: number | null;                 // monoisotopic; null if pseudo-atoms
}

type ChemWarningCode =
  | 'over-valence'            // atom exceeds its allowed valence (incl. charge/radical)
  | 'unknown-label'           // label is neither element+H nor a known abbreviation
  | 'abbreviation-bonds'      // abbreviation atom has a bond count its group can't take
  | 'cannot-kekulize';        // order-1.5 bonds that admit no Kekulé structure
interface ChemWarning { code: ChemWarningCode; atoms: AtomId[]; bonds: BondId[]; message: string }

interface Perception {
  atoms: Readonly<Record<AtomId, AtomInfo>>;
  bonds: Readonly<Record<BondId, BondInfo>>;
  fragments: { atoms: AtomId[]; formula: Formula }[];   // same order as doc-model fragments()
  warnings: ChemWarning[];
}

// ── Labels ──────────────────────────────────────────────────────────────────────────────
type LabelInterpretation =
  | { kind: 'element'; element: ElementSymbol; hCount?: number; charge?: number }
      // 'O', 'OH', 'HO', 'NH2', 'H2N', 'NH3+', 'O-', 'Cl' — stored as element (+ explicitH /
      // charge), NOT as a label
  | { kind: 'abbreviation'; key: string; element: ElementSymbol }
      // 'Ph', 'OMe', 'CO2H', 'Ac' — stored as label; `element` = the group's attachment atom
  | { kind: 'unknown' };

// ── Errors ──────────────────────────────────────────────────────────────────────────────
type ChemErrorCode =
  | 'invalid-smiles' | 'invalid-molfile' | 'not-found' | 'empty' | 'too-large'
  | 'cannot-kekulize' | 'unknown-label';
class ChemError extends Error { code: ChemErrorCode; suggestions?: string[] }

// ── Compound dictionary (data file, see "Name lookup") ───────────────────────────────────
interface CompoundEntry {
  name: string;               // display name, e.g. 'acetic acid'
  synonyms: string[];         // e.g. ['ethanoic acid', 'AcOH']
  smiles: string;
  formula: string;            // Hill, from the source
  mw: number;                 // from the source
  cid?: number;               // PubChem CID when the source is PubChem
}
```

## Public API

All functions are pure. Doc-in/Doc-out functions use doc-model ops, so they work inside
`History.transact` like any other op.

```ts
// perception
perceive(doc: Doc): Perception
createPerceiver(): (doc: Doc) => Perception      // same result; memoises per fragment
formulaOf(doc: Doc, atoms: Iterable<AtomId>): Formula
                                                 // whole fragments touched by `atoms`, summed

// labels & abbreviations
interpretLabel(text: string): LabelInterpretation
ABBREVIATIONS: Readonly<Record<string, { smiles: string }>>
                                                 // the group's SMILES; it attaches through
                                                 // its FIRST atom (OCL reads '*' as carbon):
                                                 // Ph: 'c1ccccc1', OMe: 'OC', CO2H: 'C(=O)O'
expandLabel(doc: Doc, atom: AtomId): Doc         // replaces the abbreviation atom by real atoms
                                                 // laid out away from its neighbour; throws
                                                 // ChemError('unknown-label')

// aromatic representation (the editor's Kekulé ↔ circle toggle)
aromatize(doc: Doc, atoms?: Iterable<AtomId>): Doc   // bonds OCL perceives as aromatic → 1.5
kekulize(doc: Doc, atoms?: Iterable<AtomId>): Doc    // every 1.5 bond → 1 or 2;
                                                     // throws ChemError('cannot-kekulize')

// layout
cleanStructure(doc: Doc, atoms: Iterable<AtomId>): Doc
    // re-lays out every fragment touched by `atoms` with OCL coordinate invention, then fits
    // the result onto the old positions (best rigid rotation + translation, no reflection),
    // so the structure tidies in place. Bond length 1.0. Stereo configuration is preserved;
    // which bonds carry the wedges may change.

// conversion
parseSmiles(text: string, opts?: ImportOptions): Result<SubDoc, ChemError>
parseMolfile(text: string, opts?: ImportOptions): Result<SubDoc, ChemError>
type ImportOptions = { aromatic?: 'circle' | 'kekule' }      // default 'circle' (SPEC.md decision)
toSmiles(doc: Doc, atoms?: Iterable<AtomId>): string         // isomeric; abbreviations expanded
toMolfile(doc: Doc, atoms?: Iterable<AtomId>, opts?: { version?: 'V2000' | 'V3000' }): string

// name lookup
createNameIndex(data: unknown): NameIndex        // validates the dictionary JSON with Zod
interface NameIndex {
  lookup(query: string): CompoundEntry | null    // exact name/synonym match (normalised)
  suggest(prefix: string, limit?: number): CompoundEntry[]
}
structureFromText(text: string, names: NameIndex, opts?: ImportOptions):
  Result<{ sub: SubDoc; source: 'name' | 'smiles' | 'molfile'; entry?: CompoundEntry }, ChemError>
    // order: Molfile (contains 'V2000'/'V3000') → dictionary → SMILES → 'not-found' with
    // suggestions. Dictionary before SMILES, so 'CO' finds nothing by name and parses as
    // methanol SMILES, while 'acetone' never reaches the SMILES parser.
```

`SubDoc` results follow the doc-model convention (centred on the origin, local ids), so the
editor inserts them with `insert(doc, sub, at)`.

## Mapping doc-model ↔ OpenChemLib

| doc-model | OpenChemLib | Notes |
|---|---|---|
| `x`, `y` (BLU, y-down) | atom x, y | 1:1 |
| `element` | atomic number | via `PERIODIC_SYMBOLS` index |
| `R`, `X`, `*` | atomic number 0 + custom label | no mass, no implicit H; formula counts the symbol; `mw: null` |
| abbreviation `label` | the group's atoms, attached through its first atom | expanded for every computation (formula, valence, SMILES); the doc keeps the label |
| `charge`, `isotope`, `radical` 1/2 | charge, mass, radical doublet/triplet | |
| `explicitH` | fixed H count | over-valence if bonds + H exceed the allowed valence |
| order 1, 2, 3 | single, double, triple | |
| order 1.5 | single/double from **chem-core's Kekulé assignment** | OCL then perceives aromaticity itself |
| `wedge` / `hash` (narrow end at `a1`) | up / down stereo bond from `a1` | |
| `wavy`, `bold` | single | wavy = unspecified stereo |

**Kekulé assignment** (needed because OCL won't resolve delocalized rings): for each connected
system of order-1.5 bonds, find a perfect matching on the atoms that need a π bond, using only
1.5 bonds. Neutral carbon and pyridine-like N need one; atoms that can supply a lone pair
instead (pyrrole-type N, O, S with two ring neighbours) are optional and get the H/lone pair
when left unmatched. Exact search (forced-assignment propagation + backtracking) per system,
so odd rings (azulene) and fused systems work. No solution → `cannot-kekulize` warning in
perception, `ChemError` from `kekulize`.

## Labels and abbreviations

- **Element + H grammar:** `^(H\d*)?(El)(H\d*)?([+-]\d?)?$` with a known element symbol, either
  side (`OH`, `HO`, `NH2`, `H2N`, `NH4+`, `O-`). Stored as `element` + `explicitH` + `charge`,
  never as a label, so chemistry needs no expansion.
- **Abbreviations (v1 table, monovalent, grade 11–12 level):** Me, Et, Pr, iPr, Bu, tBu, Ph,
  Bn, Ac, OMe, OEt, OPh, OAc, CO2H, COOH, CO2Me, CO2Et, CHO, COCl, CONH2, CN, NO2, SO3H.
  Case-sensitive (`Me` ≠ `ME`). Each has a test that its SMILES gives the expected formula.
  Research-level groups (Boc, Ts, TBS…) are left out; adding more is a data change.
- An abbreviation atom with ≠ 1 bond gets an `abbreviation-bonds` warning (0 bonds: capped
  with H for formula purposes).
- Anything else is `unknown`: drawn as typed, treated as a pseudo-atom, `unknown-label` warning.

## Name lookup

- Data file: `resources/compounds/compounds.json`:
  `{ format: 'chalkbond-compounds', version: 1, source: string, entries: CompoundEntry[] }`.
  chem-core never reads files: the editor imports the JSON and passes it to `createNameIndex`.
- Normalisation: case-insensitive; spaces, hyphens and commas ignored for matching
  (`Acetic-acid` = `acetic acid`); Unicode NFC.
- Scope: about 350 compounds following the NEB grade 11–12 organic topics — alkanes,
  alkenes, alkynes (C1–C6 incl. the isomers taught), benzene and simple arenes, haloalkanes and
  haloarenes, alcohols, phenols, ethers, aldehydes, ketones, carboxylic acids and derivatives
  (esters, acyl chlorides, amides, anhydrides), nitro compounds, amines and aniline, plus common
  molecular reagents and solvents (HCN, NH3, CHCl3, CCl4, SOCl2, PCl5, H2O…), urea, simple
  sugars and amino acids, aspirin and paracetamol. Every entry is findable by its IUPAC name
  (`propan-2-ol`, `ethanoic acid`) and its common names (`isopropyl alcohol`, `acetic acid`).
  Ionic reagents (KMnO4, K2Cr2O7…) are left out: they appear as conditions text, not structures.
- **Source:** a dev-time script `scripts/build-compounds.mjs` reads a curated name list
  (`scripts/compound-names.txt`: one compound per line, `name | synonym | …`), looks each name
  up in PubChem (PUG-REST, ≤ 5 requests/s) and writes SMILES, formula, MW and CID into the
  committed JSON. Synonyms come from the curated list, not PubChem's long synonym lists. The
  app never goes online; the generated JSON is reviewed in git like code.

## Perception and caching

- `perceive` builds one OCL molecule per fragment (doc-model `fragments`) and reads back H
  counts, aromaticity, valence and formula.
- `createPerceiver` caches per fragment under a **chemistry signature**: atoms (element,
  charge, isotope, explicitH, radical, label) and bonds (endpoints, order) in id order, with
  no coordinates. So dragging, recolouring or adding arrows never recomputes, and an edit only
  recomputes the fragment it touched. Cache is LRU-bounded (e.g. 256 fragments).
- Stereo is not part of perception (no R/S in v1); it matters only for SMILES/Molfile export
  and Clean Structure, which read coordinates directly.

## Testing

- **Reference set (SPEC.md success criterion 6):** ≥ 30 compounds whose formula and MW match
  the dictionary's PubChem values (MW to 0.01), covering C/H/N/O/S/P/halogens, charged species
  (acetate, ammonium), and an isotope-labelled case.
- **Dictionary integrity:** every entry parses; its OCL formula equals the stored formula;
  every name/synonym is unique after normalisation.
- **Round trips:** for every dictionary entry, `parseSmiles` → `toSmiles` → canonical OCL
  IDCode equals that of the original SMILES (stereo included). Molfile V2000 and V3000 the same.
- **Kekulé / aromatic:** benzene, naphthalene, anthracene, azulene, pyridine, pyrrole, furan,
  thiophene, indole, imidazole, carboxylate (1.5 outside a ring): `kekulize(aromatize(x))` gives
  a valid Kekulé structure with the right formula; `aromatize` is idempotent; an impossible
  1.5 system (e.g. a 1.5 bond on a methyl carbon chain) gives `cannot-kekulize`.
- **Valence:** pentavalent C, neutral 4-bonded N, divalent Cl → `over-valence`; NH4⁺, SF6,
  H3PO4, DMSO, nitro written with charges → ok.
- **Labels:** grammar table (`OH`, `HO`, `NH2`, `H2N`, `NH3+`, `O-`, `Cl`, `CH3`) and every
  abbreviation's formula; unknown labels.
- **Stereo / axis:** a drawn (R)-alanine with a wedge exports SMILES whose IDCode equals that of
  `C[C@@H](N)C(O)=O`; the mirror drawing gives the other enantiomer.
- **Clean Structure:** a distorted benzene comes back as a regular hexagon (bond lengths 1 ± 1e-6)
  whose centroid is unchanged; untouched fragments are untouched; wedges still give the same
  IDCode.
- **Properties (fast-check, reusing doc-model's command generator):** `perceive` never throws
  on any doc reachable by doc-model ops; `createPerceiver()(doc)` deep-equals `perceive(doc)`
  across an edit sequence (cache never stale).
- **Library facts:** each row of "Verified library facts" has a test.
- **Perf:** `perceive` on a 500-atom single-fragment doc < 16 ms median (one frame);
  `createPerceiver` after a one-atom label change in a 10-fragment doc < 3 ms median;
  `parseSmiles` of a 50-heavy-atom molecule < 20 ms median.

## Success Criteria

1. Every function above exists with tests; `src/core/chem-core` line coverage ≥ 90%
   (`SPEC.md` target for `core/*`).
2. Formula and MW match PubChem for the ≥ 30-compound reference set (MW to 0.01).
3. Typing `ethanol`, `acetic acid`, `CCO` or a pasted Molfile each yields a correct structure
   with circle-in-ring aromatics by default.
4. Kekulé ↔ circle toggling works on every ring in the test list above and never changes the
   formula.
5. Over-valence warnings appear for the invalid set and never for the valid set.
6. No OCL object or type appears in the public API; only `src/core/chem-core` imports
   `openchemlib` (lint rule passes).
7. Perf budgets met on Windows.

## Boundaries (module-specific)

- **Always:** keep OCL behind this module's API; validate dictionary data with Zod; return
  `Result`/`ChemError` for bad user input (never crash on a typo).
- **Ask first:** adding name sources beyond the dictionary; adding Atom/Bond fields to
  doc-model; upgrading OpenChemLib across a minor version (re-run the library-fact tests).
- **Never:** network access at runtime; importing `openchemlib` outside chem-core; storing OCL
  data (IDCodes etc.) in the `.chalk` file.

## Open Questions

None. Resolved 2026-11-09: (1) dictionary data comes from a dev-time PubChem lookup (network
at development time only; approved); (2) formula/MW of a selection = the whole fragments it
touches.
