# Tasks: `svg-render`

Plan: `tasks/plan-svg-render.md`. Spec: `SPEC.md`, `SPEC-svg-render.md`.
Definition of done for every task: acceptance criteria met, `npm run check` green, committed.
"SC n" below is success criterion n of `SPEC-svg-render.md`.

---

## S1: Style, number formatting, lint guards

**Description:** `StyleSettings` meaning, `STYLE_PRESETS`, `resolveStyle` (merge, range-checked
overrides, derived `ResolvedStyle` per the spec table), `bluToPt` / `ptToBlu`, `fmt`, the id-number
comparator. Tooling: an ESLint block for `src/core/svg-render/**` banning `Math.pow`, `**`,
`hypot`, `exp`, `log`, `tan`, `random`, `Date`, `Intl`, `localeCompare`, `toLocaleString`
(repeat the global `ExportDefaultDeclaration` restriction in the block, since overriding
`no-restricted-syntax` replaces it); the golden line in `.gitattributes`; the `types.ts` JSDoc
wording for `StyleSettings` ("final; meaning defined in `SPEC-svg-render.md`", comment only).

**Tests first:** preset values and every derived value; each bad override (NaN, Infinity, out of
range, wrong type, empty family) falls back to the preset; `bluToPt`/`ptToBlu` inverse; `fmt` on
`-0`, `0.0004`, `0.0005`, `1e-7`, `123456.78901`, `0.5`; lint probes (like
`tests/tooling/lint-boundaries.test.ts`) that the banned APIs error in `src/core/svg-render` and
not elsewhere; `.gitattributes` contains the golden line.

**Acceptance criteria:**
- [x] `STYLE_PRESETS`, `resolveStyle`, `bluToPt`, `ptToBlu` match the spec tables (SC1, SC10)
- [x] `fmt` prints at most 3 decimals, no exponent, no `-0`, leading `0` kept (SC3)
- [x] ESLint rejects each banned API inside `src/core/svg-render/**` (SC3); existing boundary probes for `svg-render` still pass (SC12)
- [x] `.gitattributes` has `src/core/svg-render/__golden__/** text eol=lf` (SC3)
- [x] `types.ts` comment says final; `src/core/svg-render/index.ts` exists as the single public entry

**Verification:** `npm test -- src/core/svg-render tests/tooling && npm run lint`

**Dependencies:** chem-core complete

**Files:** `src/core/svg-render/{style.ts,style.test.ts,fmt.ts,fmt.test.ts,order.ts,index.ts}`, `eslint.config.mjs`, `tests/tooling/svg-render-lint.test.ts`, `.gitattributes`, `src/core/doc-model/types.ts` (comment)

**Scope:** S

## S2: SVG writer and XML check helper

**Description:** The only place markup is built: `escapeText`, `escapeAttr`, XML-1.0 character
cleaning (illegal → U+FFFD), element builders with a fixed per-element attribute order, colour
validation (`^#[0-9a-fA-F]{6}$`, lower-cased, else `INK`), `fontFamily` sanitiser, the element and
attribute allow-lists (builders cannot emit anything else), `<text>` with `xml:space`. Test helper
`__fixtures__/xml-check.ts`: a ~60-line well-formedness checker that returns elements and
attributes.

**Tests first:** escaping of `& < > " '`, `]]>`, control characters, lone surrogates, emoji;
attribute order stable and `undefined` never written; bad colours fall back; family sanitiser
(quotes removed, `;{}` removed, > 200 chars cut, empty → preset family); builders reject a
non-allow-listed element or attribute; `xml-check` accepts valid output and rejects unbalanced
tags, bad entities, illegal characters.

**Acceptance criteria:**
- [x] No builder can emit `script`, `style`, `foreignObject`, `use`, `image`, `a`, event or `href` attributes, or `url(…)` (SC9)
- [x] User text only ever lands in `<text>` content or `<metadata>`, escaped (SC9)
- [x] Attribute order and colour case are fixed, so equal inputs give equal bytes (SC4, SC3)
- [x] `xml-check` validates builder output in tests (used by S7, S12)

**Verification:** `npm test -- src/core/svg-render`

**Dependencies:** S1

**Files:** `src/core/svg-render/{svg-write.ts,svg-write.test.ts,__fixtures__/xml-check.ts,__fixtures__/xml-check.test.ts}`

**Scope:** S

## S3: Font metrics generator, committed table, text measurement

**Description:** `scripts/build-font-metrics.mjs <regular.ttf> <bold.ttf>` (Node, no dependencies:
`head`, `hhea`, `hmtx`, `cmap` format 4; no network) writing the generated
`src/core/svg-render/font-metrics.ts` (coverage ranges, header with file names and SHA-256, sorted,
LF). Run it once with Windows' `arial.ttf` / `arialbd.ttf` or Liberation Sans. `text-measure.ts`:
internal `measureRuns` (width, ascent, descent, lines, notices) with regular/bold tables, sub/sup
scaling and shifts, fallback width 0.556 em, descent rule, code-point iteration. `.prettierignore`
entry for `font-metrics.ts`.

**Tests first:** `tests/tooling/font-metrics.test.ts` (known widths `W` 944, `i` 222, `0` 556, `m`
833, `−` 584, bold `W` 944; every coverage range present; sorted; integer values); measurement of
plain, bold, italic, sub/sup and multi-line runs; fallback notice for an uncovered character
(deduplicated, sorted by code point); descent only with a descending glyph.

**Acceptance criteria:**
- [x] Table covers U+0020–007E, U+00A0–00FF, Greek U+0391–03C9, the listed punctuation, arrows and U+2212 (SC13)
- [x] Uncovered characters measure 0.556 em and report `unmeasured-glyph` (SC13)
- [x] Re-running the script on the same fonts gives identical bytes; tests and `npm run check` never run it (SC13)
- [x] `npm run format:check` passes with the generated file ignored

**Verification:** `npm test -- src/core/svg-render tests/tooling && node scripts/build-font-metrics.mjs C:\Windows\Fonts\arial.ttf C:\Windows\Fonts\arialbd.ttf` (twice, then `git diff --stat` is empty the second time)

**Dependencies:** S1

**Files:** `scripts/build-font-metrics.mjs`, `src/core/svg-render/{font-metrics.ts,text-measure.ts,text-measure.test.ts}`, `tests/tooling/font-metrics.test.ts`, `.prettierignore`

**Scope:** M

### ✅ Checkpoint H — foundations
- [x] `npm run check` green
- [x] Commit + push

---

## S4: Geometry helpers and ring finder

**Description:** `geom.ts`: vector helpers, unit normals ("left" with y down), ray/segment exit
from a box, segment clipping against a box, quadratic and cubic Bézier evaluation and exact
extrema, rect union and growth. `rings.ts`: per-bond smallest ring (size 3–8, breadth-first, ties
by lexicographically smallest sorted atom-id list), the doc's distinct rings (every tied minimum ring counts: cubane has 6 faces), circled-ring
detection (all bonds order 1.5), ring centroid. Pure functions over doc-model data.

**Tests first:** clip from all 8 directions; Bézier extrema against dense sampling; rings for
benzene, naphthalene (2 rings, not the 10-ring), cubane (6 faces), spiro, bicyclic (norbornane), a
10-ring (none), a chain (none); deterministic ring choice under reversed record order; circled
only when every bond is 1.5.

**Acceptance criteria:**
- [x] Ring finder gives the spec's answers on the listed molecules (SC6)
- [x] Clipping and extrema helpers are exact to 1e-9 on the test set
- [x] No banned maths (lint passes) (SC3)

**Verification:** `npm test -- src/core/svg-render`

**Dependencies:** S1

**Files:** `src/core/svg-render/{geom.ts,geom.test.ts,rings.ts,rings.test.ts}`

**Scope:** M

## S5: Atom labels

**Description:** `label-display.ts` (reversed text and attachment glyph for every
`ABBREVIATIONS` key), `atom-label.ts`: labelled-atom rule, text assembly
(`[H-part][isotope][symbol][H-part][charge]`, `D`/`T`, digit subscripts, `−` U+2212), side rule
(`sx` ±0.1), bare-atom formula rule (`H2O`, `HCl`, `OH−`, `NH3`), anchor box and full text box,
position (anchor centre on the atom, baseline `y + capHeight/2`), clip box extended over the
label text on the bond's side, label colour. Output: markup for the label plus its boxes. Uses
`perceive` data only through `AtomInfo.implicitH`.

**Tests first:** display table has an entry for every `ABBREVIATIONS` key (fails if one is added);
labelled/unlabelled decision rows; `OH`/`HO`, `NH2`/`H2N`, `CO2H`/`HO2C`, `OMe`/`MeO`, `NO2`/`O2N`
by neighbour side; `H2O`, `H3O+`, `H2S`, `HCl`, `OH−`, `NH3`, `NH4+`; isotopes (`¹³C`, `D`); charge
`2−`; `R1` subscript; unknown label as typed; anchor box position per row; clip-box extension for
an up-right bond on `NH2`.

**Acceptance criteria:**
- [x] Heteroatom labels show `implicitH` and read away from the bonds (SC7)
- [x] `CO2H`, `OMe`, `NO2` attach through the correct glyph (SC7)
- [x] Bare atoms read as formulas (SC7)
- [x] Unknown glyphs produce `unmeasured-glyph` notices, never throw

**Verification:** `npm test -- src/core/svg-render`

**Dependencies:** S3, S4

**Files:** `src/core/svg-render/{label-display.ts,atom-label.ts,atom-label.test.ts,label-display.test.ts}`

**Scope:** M

## S6: Bonds and aromatic circles

**Description:** `bonds.ts`: single, double (`auto` by smallest ring or neighbour counts,
`center`, `left`, `right`, end shortening `doubleGap·cot(φ/2)`), triple, 1.5 (plain in a circled
ring, otherwise solid plus dashed), wedge, hash, bold, wavy, stereo-on-higher-order rule, bond
colour, clipping at label boxes (stereo clipped along the axis with the width profile kept).
`circles.ts`: circle per circled ring (centre, `circleRatio`, colour rule).

**Tests first:** every row of the bond table; double-bond side decision table (ring, chain with
neighbours on one side, equal counts, terminal C=O); shortening in benzene (0.104·L) and with no
neighbour; Kekulé benzene inside-ring doubles; naphthalene two circles; a 1.5 bond in carboxylate
is solid plus dashed; partly Kekulé ring has no circle; circle colour (shared vs mixed bond
colours); wedge/hash clipped at `OH`; bond end positions at `CO2H`/`OMe`/`NO2` labels.

**Acceptance criteria:**
- [x] Circled rings: all-1.5 ring gets one circle, naphthalene 2; 1.5 elsewhere is solid plus dashed; Kekulé rings get inside-ring double bonds (SC6)
- [x] No bond line crosses its label's text; bond ends match the label rules (SC7)
- [x] Every `BondOrder`, `BondStereo`, `DoublePlacement` value has a rule and a test (SC2)

**Verification:** `npm test -- src/core/svg-render`

**Dependencies:** S2, S4, S5

**Files:** `src/core/svg-render/{bonds.ts,bonds.test.ts,circles.ts,circles.test.ts}`

**Scope:** M

## S7: `render`, `toSvg`, `renderSvg`, subsets, extents

**Description:** `render.ts`: resolve style, perceive (or take `perception`), ring detection once,
lay out atoms and bonds for the whole document, paint order (beneath, rings, bonds, atoms, above),
item keys, `extents` and `bounds`, `only` filtering with closure and ring rule, notices. Object
types go through an exhaustive dispatcher whose not-yet-implemented cases emit a `skipped-item`
notice (removed in S9/S10). `to-svg.ts`: empty document form, wrapper with `width`/`height` in
`pt`, `viewBox`, translated `<g>`, `padding`, `metadata`, `origin`. `index.ts` exports the public
API. Helper `__fixtures__/ink-scan.ts`: independent ink box from the markup (path vertices, curves
sampled at 64 steps, polygon/circle/rect/ellipse, stroke half-widths, `<text>` boxes from the font
table).

**Tests first:** empty doc and empty subset; benzene, ethanol, acetic acid scenes (structure, key
list, paint order, `xml-check`); `bounds` equals `ink-scan` within 0.01 pt on those scenes;
`bounds` = union of `extents`; subset parts byte-equal full parts; subset ring rule; `padding`,
`origin`, `metadata` escaping; `perception` option equals default; `render` does not mutate the
doc.

**Acceptance criteria:**
- [x] `render`, `toSvg`, `renderSvg`, `STYLE_PRESETS`, `resolveStyle`, `bluToPt`, `ptToBlu` exported and tested (SC1)
- [x] Bounds equal the independent ink scan on the molecule scenes (SC5)
- [x] A subset part equals the matching full-render part; a ring circle appears iff all its atoms are in the closure (SC8)
- [x] Output is well-formed and allow-listed (SC9)

**Verification:** `npm test -- src/core/svg-render`

**Dependencies:** S6

**Files:** `src/core/svg-render/{render.ts,render.test.ts,to-svg.ts,to-svg.test.ts,types.ts,index.ts,__fixtures__/ink-scan.ts,__fixtures__/ink-scan.test.ts}`

**Scope:** M

### ✅ Checkpoint I — molecules render
- [x] `npm run check` green
- [x] Commit + push

---

## S8: Satellites

**Description:** `satellites.ts`: gaps between all bond directions (whole document), assignment
order (charge, lone pairs, radical dots 1–2, `partialCharge` with U+2212, `number`), gap sorting,
round-robin dealing, `(j+1)/(k+1)` placement, bare-atom slots, distance (label full-box edge or
`vertexGap`, plus `satelliteGap`), lone pair as two dots, text satellites tangent to the point.
Wired into atom parts and extents; charge on a skeleton vertex drawn here.

**Tests first:** gap order and tie-breaking; one bond (opposite), two, three, four bonds; bare atom
(up, down, left, right); `k` satellites in one gap; lone pair dot geometry; radical 1 and 2; `δ+`
and `δδ-` rendering; charge `2+` on a vertex; satellite past the `H2` of `NH2`; extents include
satellites; determinism of order.

**Acceptance criteria:**
- [x] Lone pairs, radicals, vertex charge, partial charge and atom numbers appear in the largest gaps in the specified order (SC7)
- [x] Bounds still equal `ink-scan` on a carbanion, radical and `HCl δ+/δ−` scene (SC5)

**Verification:** `npm test -- src/core/svg-render`

**Dependencies:** S7

**Files:** `src/core/svg-render/{satellites.ts,satellites.test.ts}` (+ edits to `atom-label.ts`, `render.ts`)

**Scope:** M

## S9: Arrows, plus signs, shapes, brackets

**Description:** `arrows.ts` (forward, equilibrium harpoons, retro, resonance, no-go; head clamp;
`from = to` draws nothing), `plus` in the same file or `marks.ts`, `shapes.ts` (rect/ellipse, fill
opacity clamp, neither → nothing), `brackets.ts` (square with serifs clamped to `w/2`, round,
curly, `corner` runs placement; corner text uses the text layout from S10 via a small shared
`text-run.ts` created here for single-line runs). Extents for each. Removes the matching
placeholders from S7's dispatcher.

**Tests first:** each `ArrowKind` row (head geometry, harpoon sides, chevron), clamp and zero
length; plus arms; shape fill/stroke/opacity combinations and nothing-drawn case; each bracket
shape; corner runs bottom-right vs `sup` top-right; paint layers (shapes beneath).

**Acceptance criteria:**
- [x] Every `ArrowKind`, bracket shape and shape variant has a rule and a test (SC2)
- [x] Shapes paint beneath structures, other objects above, by `zOrder` (SC2)
- [x] Extents include arrowheads and stroke half-widths (SC5)

**Verification:** `npm test -- src/core/svg-render`

**Dependencies:** S8

**Files:** `src/core/svg-render/{arrows.ts,arrows.test.ts,shapes.ts,shapes.test.ts,brackets.ts,brackets.test.ts,text-run.ts}`

**Scope:** M

## S10: Text, caption, callout, curved arrows

**Description:** `text-layout.ts` (runs as absolute `<text>` elements, `align`, `\n` lines,
`sub`/`sup`/`bold`/`italic`/`color`, vertical centring on `at.y`), `text-objects.ts` (`text`,
`caption` over target ink extents with missing targets skipped, `callout` with grown box and leader
line), `curved-arrow.ts` (quadratic Bézier from `resolveAnchor`, `bend` sign, label-box clipping by
bisection, offset/bond/point anchors as given, `full` and `fishhook` heads, shaft stops at head
base). Removes the last placeholders from S7's dispatcher.

**Tests first:** each `align` and multi-line case; `H2SO4`, `Δ`, `hν`, `δ+` runs; bold/italic
attributes; caption under a labelled molecule and with a missing target; callout leader from the
nearest box point and clipped at an atom label; curved arrow bend 0, ±, atom anchor with and without
offset, bond anchor, fishhook barb side; an unresolvable anchor gives `skipped-item`, not a throw.

**Acceptance criteria:**
- [x] Every `DrawObject` type, curved-arrow `head` and text `align` / `script` value has a rule and a test; the dispatcher's `switch` ends in `never` (SC2)
- [x] doc-model's `kitchen-sink` and `mechanism` fixtures render with no `skipped-item` notice
- [x] Bounds equal `ink-scan` on the reaction-scheme and mechanism scenes (SC5)

**Verification:** `npm test -- src/core/svg-render`

**Dependencies:** S8 (parallel with S9)

**Files:** `src/core/svg-render/{text-layout.ts,text-layout.test.ts,text-objects.ts,text-objects.test.ts,curved-arrow.ts,curved-arrow.test.ts}`

**Scope:** M

### ✅ Checkpoint J — every item type renders
- [x] `npm run check` green
- [ ] Commit + push

---

## S11: Golden set, golden sheet, visual review

**Description:** Frozen `.chalk` inputs in `__golden__/inputs/` (produced once from chem-core's
parsers, then committed) plus doc-model's `benzene`, `two-step-reaction`, `mechanism` and
`kitchen-sink`; ≥ 30 scenes per the spec list, 3 in each preset, a style-override scene, a subset
scene; `toMatchFileSnapshot` goldens. Variant-coverage scan test. `scripts/golden-sheet.mjs` (reads
the committed `__golden__/*.svg`, writes `out/golden-sheet.html`, escapes names; `--png <file>` via
Playwright's Chromium) and the `golden:sheet` npm script. **Visual review:** render the sheet to
PNG, look at every scene against the spec (labels, flips, circles, arrowheads, brackets, satellite
placement); fix defects in the code, retune constants only through the spec's derived table, and
regenerate goldens in a reviewed diff. Record any retuned constant in `SPEC-svg-render.md`.

**Tests first:** the golden test (fails until files exist), the scan test asserting every `BondOrder`,
`BondStereo`, `DoublePlacement`, `ArrowKind`, curved-arrow `head`, bracket `shape`, shape `shape`,
text `align`, run `script` value and every object type occurs in the inputs; per-golden `ink-scan`
equality with `bounds` (0.01 pt); slides and journal scenes share element and attribute-name
sequences.

**Acceptance criteria:**
- [x] ≥ 30 goldens committed, LF, stable on re-run with no `-u` (SC3)
- [x] Variant scan passes (SC2)
- [x] Every golden's `bounds` equals the independent ink scan within 0.01 pt (SC5)
- [x] Same doc in `slides` and `journal`: identical structure, different scale (SC10)
- [x] Sheet reviewed as a PNG; defects fixed and goldens regenerated; retuned constants recorded in the spec

**Verification:** `npm test -- src/core/svg-render && npm run golden:sheet -- --png out/golden-sheet.png`

**Dependencies:** S9, S10

**Files:** `src/core/svg-render/{golden.test.ts,variants.test.ts,__golden__/inputs/*.chalk,__golden__/*.svg}`, `scripts/golden-sheet.mjs`, `package.json`

**Scope:** M

## S12: Property suite and tooling tests

**Description:** `svg-render.prop.test.ts` with the spec's seven properties (reusing doc-model's
`arbitraries.ts` generator and `run`): never throws and passes `xml-check` with allow-listed names;
determinism (same input twice, `parse(serialize(doc))`, reversed record key order) at 1,000 runs
with an explicit timeout; numeric attribute tokens match `^-?\d+(\.\d{1,3})?$`; subset parts equal
full parts; bounds (union of extents, contains doc-model's bounds of drawn items, translation
invariance ±0.002 pt); uniform scale by powers of two (±0.005·k pt); safety with arbitrary Unicode
in runs, labels, `number` and `metadata` (round-trip through the parsed output). Tooling test: no
committed golden contains `\r`.

**Tests first:** all of the above are the tests; write each property, watch it fail on a seeded bug
if one is easy to inject, then fix the code.

**Acceptance criteria:**
- [x] Determinism property passes at 1,000 runs (SC4)
- [x] Subset property holds (SC8)
- [x] Safety property holds for `<script>`, `"onload=`, `]]>`, lone surrogates, emoji (SC9)
- [x] Bounds and scale properties hold (SC5, SC10)
- [x] Goldens contain no `\r` (SC3)

**Verification:** `npm test -- src/core/svg-render tests/tooling`

**Dependencies:** S11

**Files:** `src/core/svg-render/svg-render.prop.test.ts`, `tests/tooling/svg-render-goldens.test.ts`

**Scope:** M

## S13: Perf budgets, font calibration, Windows checklist, coverage

**Description:** `perf.test.ts` (medians, `perception` supplied, skipped under `--coverage`):
slide-sized scheme (4 molecules ≈ 40 atoms, 3 arrows, 6 texts) `render` < 8 ms; 500-atom fragment +
20 objects < 40 ms. `e2e/font-calibration.spec.ts`: launches the app, creates SVG `<text>`
elements for a fixed corpus (Latin, digits, `−`, Greek, bold) at font-size 100 with
`Arial, Helvetica, sans-serif`, compares `getComputedTextLength()` with the table (≤ 1 %, 20 px).
`docs/windows-checklist.md` gains a "Checkpoint K — svg-render" section (paste three goldens into
PowerPoint and Word 2021, check labels, bond ends, circles; run `npm run test:e2e`). Coverage run.

**Tests first:** the perf and e2e tests themselves; the coverage report decides what else needs a
test.

**Acceptance criteria:**
- [ ] Perf budgets met on Windows (SC11)
- [ ] Calibration e2e passes against real Arial (SC13)
- [ ] `npm test -- --coverage`: `src/core/svg-render` ≥ 90 % lines, generated table and goldens excluded (SC1)
- [ ] No DOM, Node or Electron import in the module: lint and `tsconfig.core.json` pass (SC12)
- [ ] Checklist entry added (unticked until the owner pastes into Office)

**Verification:** `npm test -- --coverage && npm run test:e2e`

**Dependencies:** S12

**Files:** `src/core/svg-render/perf.test.ts`, `e2e/font-calibration.spec.ts`, `docs/windows-checklist.md`, `vitest.config.mts` (coverage exclude for `font-metrics.ts` and `__golden__/`, only if needed)

**Scope:** S

### ✅ Checkpoint K — module complete
- [ ] Module complete: every success criterion in `SPEC-svg-render.md` met, coverage ≥ 90 % on `src/core/svg-render`
- [ ] `npm run check` green; `npm run test:e2e` green
- [ ] Commit + push
