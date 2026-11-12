# Tasks: the 2026-11-12 feature set

Plan: `tasks/plan-features-2026-11.md`. Specs: `SPEC.md` (Decisions Log 2026-11-12),
`SPEC-doc-model.md` D1, `SPEC-svg-render.md` Decisions 15 and 16 (S1 answered 2026-11-12),
`SPEC-editor.md` R50–R53 and C7, `SPEC-clipboard-export.md` R10–R12, `SPEC-app-shell.md` R27–R28; mock-ups `docs/mockups/editor/`
and `docs/mockups/shell/` as of commit `628ea2b`. Format: `tasks/todo-editor.md`.

Definition of done for every task: acceptance criteria met, `npm run check` green (run on its
own, in the foreground; read its exit code and summary first), one commit per task:
`feat(<module>): N<n> …`, `test(<module>): …` or `docs: …`. Tests first: write the listed tests,
see them fail (RED) for the reason given, then write the code. "SC n" is a success criterion of
the module spec named; "R n", "D1", "Decision 15", "U n" are rows of the specs' Decisions tables.

**Must not change in any task** (repeated per task where it bites): existing goldens
(`src/core/svg-render/__golden__/*.svg`; never `npm test -- -u`), committed `.chalk` fixtures and
golden inputs, perf budgets and timeouts, coverage thresholds in `vitest.config.mts`, any
property's `numRuns`, the normative mock-up files (`tokens.css`, `icons.svg`, the HTML) and their
lifted copies. No `eslint-disable`, `@ts-ignore`, `any`, skipped or `.only` tests, retries,
deleted assertions, coverage exclusions or new dependencies.

**Platform:** every task's code is cross-platform and must stay green on Linux and Windows.
Windows-only parts are named in the task (`e2e/win/` specs run only on Windows; `testIgnore`
elsewhere).

Shots: `npm run shots -- N<n>` writes `out/shots/N<n>/<name>.png` (1280×800 content size unless the
name ends in `-960`). Reference PNGs: `node docs/mockups/editor/build.mjs --png out/mockups` and
`node docs/mockups/shell/build.mjs --png out/mockups-shell`.

---

## N1: doc-model schema v2 `style.formula`

**Description:** `SPEC-doc-model.md` D1 (spec already amended). In `types.ts`: `Doc.schemaVersion:
2`, `style.formula?: 'structural'`. In `schema.ts`: keep the v1 strict schema exactly as it is;
add a v2 strict schema that differs only by `style.formula: z.literal('structural').optional()`
and `schemaVersion: z.literal(2)`; the compile-time identity check ties the v2 schema to `Doc`.
In `migrations.ts`: `migrations[1]` sets `schemaVersion` to 2 (nothing else);
`CURRENT_SCHEMA_VERSION` is 2 (the newest version read and the version of every in-memory `Doc`,
no longer what `serialize` writes). `parse` accepts v1 (migrated) and v2, rejects 3+ as
`newer-version`. **Validation rule (`SPEC-doc-model.md` File Format, D1):** a file is validated
with the strict schema of its own version and only then migrated, and the migrated result is
validated once more with the current schema; `parseWith(text, migrations, currentVersion,
schemas)` takes a schema per version (default: the real v1 and v2 table; no entry is
`unsupported-version`). Without this a v1 file carrying `formula` would migrate to v2 and pass.
`serialize` writes `schemaVersion: 1` in the
envelope and the doc when `style.formula` is absent, else 2 (key order rules unchanged; `formula`
sorts alphabetically inside `style`). `emptyDoc` returns a v2 doc without `formula`. `setStyle`
(`style.ts`) takes `formula?: 'skeletal' | 'structural'`: `'structural'` sets the key, `'skeletal'`
deletes it (draft-aware `delete`), anything else throws `DocError('invalid-value')`; a patch that
changes nothing records no step. `__fixtures__/arbitraries.ts`: the `setStyle` command may carry a
`formula` patch.

**Tests first:** `serialize.test.ts` (changes to existing tests: see "Test and code changes that
follow from D1" in `SPEC-doc-model.md`; the version-3 expectation, the `file()` helper's doc
version and the harness `schemas` tables are the existing assertions that change): every committed `.chalk` under `src/core/doc-model/__fixtures__/`
and `src/core/svg-render/__golden__/inputs/` parses and re-serialises byte-identically (RED only
for the parts that need the new code: a v1 file parses to `schemaVersion: 2` in memory); a doc
with `formula: 'structural'` serialises with `"schemaVersion": 2` twice and round-trips; a v1 file
with a `formula` key → `schema` (RED: today it migrates and passes); a v1 envelope around a doc that says
`schemaVersion: 2` → `schema`; `parseWith` with a `schemas` table: a version without an entry →
`unsupported-version`, a synthetic v0 (`z.unknown()`) still migrates and is checked by the final pass; a v2 file with `formula: 'skeletal'` or `'x'` → `schema`; version
3 → `newer-version`. `style.test.ts`: `formula: 'structural'` inside `transact` is one undo step;
`'skeletal'` afterwards gives a doc deep-equal to the start (no `formula` key at all); an
invalid value throws and leaves the doc unchanged; `{ formula: 'skeletal' }` on a skeletal doc
records no step. `doc-model.prop.test.ts`: the generator test asserts the formula patch applies;
round-trip and undo properties pass unchanged in `numRuns`.

**Acceptance criteria:**
- [x] v1 files parse; `serialize` of every committed fixture and golden input is byte-identical to the file
- [x] structural docs are written as v2 and round-trip; v2 schema rejects any `formula` but `'structural'`
- [x] `setStyle` formula: one undo step; switching back deep-equals the start
- [x] doc-model ≥ 95 % lines; property `numRuns` unchanged

**Verification:** `npx vitest run --project unit src/core/doc-model` then `npm run check`

**Dependencies:** None

**Files:** `src/core/doc-model/{types.ts,schema.ts,migrations.ts,serialize.ts,doc.ts,subdoc.ts,style.ts,index.ts}`
(`doc.ts` holds `emptyDoc`; `subdoc.ts` `asDoc` builds a `Doc` literal), tests
`src/core/doc-model/{doc.test.ts,serialize.test.ts,style.test.ts,doc-model.prop.test.ts}`,
`src/core/doc-model/__fixtures__/{arbitraries.ts,kitchen-sink.ts}`, `SPEC-doc-model.md` (already amended)

**Scope:** M. Cross-platform (core). Must not change: any committed fixture byte, `numRuns`, the
95 % threshold.

## N2: svg-render structural switch and ring rule (existing label rules, no factor, no new goldens)

**Description:** `SPEC-svg-render.md` Decision 15 (a)–(c), Decision 16 (b) (ring carbons are not
written), "Atoms and labels", "Ring atoms", Public API. Export
`isLabelled(atom, bondCount, formula = 'skeletal', inRing = false)`: with `'structural'` every
carbon that is not `inRing` is labelled. Export `ringAtoms(doc): ReadonlySet<AtomId>` (new file
`ring-atoms.ts`): the atoms on a cycle of the bond graph, computed by one iterative bridge-finding
pass in ascending id order (self-bonds and bonds to missing atoms ignored; any ring size;
independent of `rings.ts`). `render` computes `ringAtoms(doc)` once on the whole document and
passes `doc.style.formula ?? 'skeletal'` and the ring flag wherever it calls `isLabelled`, so a
structural carbon outside a ring gets a label built by the existing `buildAtomLabel` with its
`implicitH`, and ring carbons stay skeleton vertices. **No factor** (`ptPerBlu` is N3a) and no
layout change. Add the test helper `src/core/svg-render/__fixtures__/structural-oracle.ts`:
`structuralOracle(doc)` returns the skeletal document the spec's Decision 16 oracle names, in its
Decision 15 form for now (every written carbon, i.e. a carbon outside a ring without `label`,
`isotope` or `explicitH`, given `explicitH` = its perceived `implicitH`; `style.formula` removed;
coordinates unchanged; N3a adds the doubling). Add structural variants of the two perf scenes in
`perf.test.ts` with the **same** budgets.

**Tests first:** `ring-atoms.test.ts` (RED: no module): every case of "Ring atoms" (benzene,
toluene with its methyl not a member, naphthalene, decalin, a spiro compound, an 18-ring,
diphenylmethane's `CH2` not a member, a self-bond and a bond to a missing atom ignored, an empty
doc, a lone atom); the result does not depend on the key order of `doc.atoms`/`doc.bonds`.
`atom-label.test.ts`: `isLabelled(c, n)` equals the old rule for every case of the existing table;
`isLabelled(c, n, 'structural')` is true for a carbon with 0–4 bonds, with and without
charge/radical (RED: third parameter ignored); `isLabelled(c, n, 'structural', true)` is false for
a plain ring carbon (also charged or radical) and true with a `label`, `isotope` or `explicitH`.
`render.test.ts`: for a structural ethanol, `atom:` parts exist for both carbons with texts `CH2`
and `CH3`, the `O` part is byte-identical to skeletal mode; structural benzene has no `atom:` part
and its ring and bond parts are byte-identical to skeletal mode; structural toluene has exactly one
`atom:` part (`CH3`); for every golden input, `render(doc)` equals
`render(setStyle(doc, { formula: 'skeletal' }))` (passes before any code; guards the unchanged
skeletal output); and the checks that fail: for each golden input and doc-model fixture,
`render(setStyle(doc, { formula: 'structural' }))` equals `render(structuralOracle(doc))` part for
part (keys and bytes), extents and bounds (RED: no carbon is written); a subset render that holds
part of a ring keeps those ring carbons unwritten. `svg-render.prop.test.ts`: properties 1–7 run on
docs whose generator may set `formula` (`numRuns` unchanged); a new property: structural render
equals the oracle's skeletal render (`numRuns` as property 2). `index.test.ts`: the export list
gains `ringAtoms`. `golden.test.ts` is **not** edited: it must pass byte for byte.

**Acceptance criteria:**
- [x] every golden committed before F2 passes with no `-u`
- [x] structural carbons outside rings are labelled by the existing rules; ring carbons, labelled and non-carbon atoms unchanged
- [x] `ringAtoms` passes every case of "Ring atoms"; the oracle test and property pass
- [x] properties 1–7 pass with `formula` in the generator; perf structural variants meet the existing budgets
- [x] svg-render ≥ 90 % lines (98.84 % at N3a); the ESLint determinism block untouched

**Verification:** `npx vitest run --project unit src/core/svg-render`, `npx vitest run --project perf src/core/svg-render/perf.test.ts`, then `npm run check`

**Dependencies:** N1

**Files:** `src/core/svg-render/{atom-label.ts,render.ts,ring-atoms.ts,index.ts}`,
`src/core/svg-render/__fixtures__/structural-oracle.ts` and tests
`src/core/svg-render/{ring-atoms.test.ts,atom-label.test.ts,render.test.ts,svg-render.prop.test.ts,index.test.ts,perf.test.ts}`

**Scope:** M. Cross-platform (core). Must not change: any golden, the perf budgets, `numRuns`,
derived constants, `rings.ts` behaviour.

## N3a: svg-render structural factor (`ptPerBlu`, coordinates ×2)

(N3, the placeholder blocked on S1, is unblocked by `SPEC-svg-render.md` Decision 16 and split
into N3a (the factor) and N3b (goldens and legibility); the ring rule went into N2.)

**Description:** `SPEC-svg-render.md` Decision 16 (a), (d), Style (the `ptPerBlu` row), Public
API, "The layout (Decision 16)" items 1–5 and the classification table. `style.ts`: export
`STRUCTURAL_SCALE = 2`; `resolveStyle` adds `ptPerBlu` = the `bondLength` value itself when
`style.formula` is absent and `STRUCTURAL_SCALE * bondLength` when it is `'structural'`; no other
field reads `formula` or `ptPerBlu`. `bluToPt`/`ptToBlu` multiply/divide by `ptPerBlu`. Check that
every placement of a coordinate in the renderer goes through `bluToPt` (`render.ts`, `circles.ts`,
`objects.ts` and what they call) and that `bondLength` is read only for derived values and the
shortening cap in `bonds.ts` (which stays `0.5 * style.bondLength`). `structural-oracle.ts`
(N2) gains the Decision 16 doubling: every coordinate ×2 (atom `x`, `y`; arrow `from`, `to`; plus,
text, callout `at`; bracket and shape `rect`; point anchor `p`; atom-anchor `offset`; not `bend`,
not a bond anchor's `t`; **S2 was answered B (2026-11-12), so neither an atom-anchor `offset`
nor a condition text's offset from its arrow doubles**: `SPEC-svg-render.md` Decision 16 (e) and
"The layout" item 6). In `objects.ts`: an atom anchor's offset is divided by
`r = ptPerBlu / bondLength` before `bluToPt` (curved arrows and callouts; `r = 1` is today's
arithmetic bit for bit), and a text whose `attachedTo` names an `arrow` object is drawn at
`bluToPt(m + (at − m) / r)`, `m` the arrow's BLU midpoint, only when `r ≠ 1` (a missing or
non-arrow target, or a non-finite midpoint, gives `bluToPt(at)`). The oracle's `d₂` leaves offsets
as stored and gives such a text `at₂ = 2 · (m + (at − m) / 2)`.

**Tests first:** `style.test.ts` (RED: no `ptPerBlu`): `ptPerBlu` is 40 and 14.4 skeletal (the
same number as `bondLength`), 80 and 28.8 structural, 120 with a structural 60 pt override;
every other field of `resolveStyle` is identical with and without `formula`; `bluToPt`/`ptToBlu`
use `ptPerBlu` and stay inverse. `index.test.ts`: exports gain `STRUCTURAL_SCALE`. The oracle
tests and property of N2 now compare against the doubled oracle (RED: the structural render is not
doubled); this is the spec's change of the oracle (Decision 16), not a weakened assertion, and the
commit says so. `svg-render.prop.test.ts`: property 5's translation uses `scene.style.ptPerBlu`
(the same as `bondLength` for every skeletal document, so the existing runs are unchanged) and its
doc-model-bounds image uses `ptPerBlu`; property 6 passes unchanged for structural docs.
S2 (answered B): `render.test.ts`: a structural lone-pair curved arrow (atom anchor with an
`offset`) starts `offset × bondLength` from its atom's pt position (not `× ptPerBlu`), skeletal
unchanged; the same for a callout anchor; a structural condition text attached to an arrow is
drawn at the arrow's pt midpoint plus `(at − midpoint) × bondLength`; a text with no `attachedTo`,
with a missing arrow and with a non-arrow target is at `at × ptPerBlu`; a subset render keeps the
rule; every skeletal document renders as before. The oracle tests compare against the oracle
whose `d₂` leaves offsets as stored (bit-equal, as `/2` and `×2` are exact). Property 5 leaves
those keys out of the doc-model-bounds image in structural mode (they are not at `at × ptPerBlu`).
`render.test.ts`: structural ethanol's `C`–`C` bond part spans twice the skeletal distance between
the atom centres; its `CH3` text has the skeletal font size; a structural benzene's circle radius
is twice the skeletal one and its stroke width equal; a hash bond in structural mode has the
skeletal hash spacing (count `max(3, round(2·len/hashSpacing))`); `clipboardBitmapPadding` is not
touched here (clipboard-export, N9).

**Acceptance criteria:**
- [x] every golden committed before F2 passes with no `-u`; skeletal output byte-identical
- [x] `ptPerBlu` and `STRUCTURAL_SCALE` exported; only `bluToPt` turns coordinates into pt
- [x] the doubled oracle holds for every golden input, the doc-model fixtures and as a property
- [x] S2 option B: atom-anchor offsets and attached texts' offsets stay at the style's scale, skeletal bytes unchanged
- [x] perf structural variants meet the existing budgets; svg-render ≥ 90 % lines; `numRuns` unchanged

**Verification:** `npx vitest run --project unit src/core/svg-render`, `npx vitest run --project perf src/core/svg-render/perf.test.ts`, then `npm run check`

**Dependencies:** N2

**Files:** `src/core/svg-render/{style.ts,index.ts,render.ts,circles.ts,objects.ts}` (only where a
coordinate does not yet go through `bluToPt`), `src/core/svg-render/__fixtures__/structural-oracle.ts`,
tests `src/core/svg-render/{style.test.ts,index.test.ts,render.test.ts,svg-render.prop.test.ts}`

**Scope:** S. Cross-platform (core). Must not change: any golden, derived constants, the
shortening cap, perf budgets, `numRuns`.

## N3b: structural golden scenes and the legibility test

**Description:** `SPEC-svg-render.md` "The layout (Decision 16)" (structural golden scenes,
legibility criteria L1–L3), SC14, SC5. Frozen v2 inputs
`src/core/svg-render/__golden__/inputs/<scene>-structural.chalk` with `"formula": "structural"`
for `ethanol`, `propane`, `isobutane`, `alkene-trans`, `toluene`, `methylcyclohexane`,
`cyclohexanol`, `acetic-acid`, `esterification`, `benzene`, `acetic-acid-co2h`, `carbocation`,
`methyl-radical`: where an input of that name exists, its coordinates unchanged plus `formula`;
written with doc-model's `serialize`, so they re-serialise byte-identically;
otherwise built once by a throwaway script from chem-core's parsers (zig-zags at 1.0 BLU, 30°;
the esterification row laid out by the editor's TR2–TR5 rules in structural mode, four
structures, two pluses, one forward arrow, no condition text) and then frozen (the script is not
committed). `__fixtures__/golden-scenes.ts` lists the new scenes. New test
`structural-legibility.test.ts`: for every structural scene and both presets, L1 (every bond with
at least one labelled end draws a straight segment ≥ `0.25 × ptPerBlu`), L2 (no two labels'
cap-height glyph boxes closer than `0.5 × fontSize`), L3 (no `skipped-item` notice), and no ring
carbon has an `atom:` part. Look at `npm run golden:sheet -- --png out/sheet.png` before
committing the new goldens.

**Tests first:** `structural-legibility.test.ts` (RED: the scenes do not exist yet). The new golden
cases in `golden.test.ts` (unchanged file) fail until their files are written by the first run of
`toMatchFileSnapshot` (that first write is the recording; it is reviewed on the sheet, and the
second run must pass with no `-u`). Expected worst cases (W12, 2026-11-12): Slides 29.33 pt /
31.05 pt, Handout 8.47 pt / 8.43 pt; a different number is investigated, not accepted.

**Acceptance criteria:**
- [x] 13 structural scenes × 2 presets exist as goldens from frozen inputs; every pre-F2 golden and input byte-identical (`git diff --stat` shows only added files under `__golden__/`)
- [x] L1–L3 and "no ring carbon written" pass in both presets; SC5's ink-scan check passes on the new goldens (existing test)
- [x] the golden sheet was looked at; the commit message names what was seen (textbook labels, rings as in skeletal mode, nothing touching)
- [x] the N1 test "every committed input re-serialises byte-identically" passes with the v2 inputs

**Verification:** `npx vitest run --project unit src/core/svg-render`, `npm run golden:sheet -- --png out/sheet.png` (look at the PNGs), then `npm run check`

**Dependencies:** N3a

**Files:** `src/core/svg-render/__golden__/inputs/*-structural.chalk` (new),
`src/core/svg-render/__golden__/*-structural.{slides,journal}.svg` (new),
`src/core/svg-render/__fixtures__/golden-scenes.ts`, `src/core/svg-render/structural-legibility.test.ts`

**Scope:** M. Cross-platform (core). Must not change: any existing golden or input, derived
constants, the thresholds (from the spec).

## N4: number keys in the keymap

**Description:** `SPEC-editor.md` R50, K2. In `model/keymap.ts` `TOOL_KEYS` gains `'1'` select,
`'2'` erase, `'3'` bond, `'4'` chain, `'5'` ring, `'6'` atom, `'7'` arrow, `'8'` plus, `'9'`
curved, `'0'` text. `hoverKeys` already tries hover keys first (atom/bond hovered and tool not
Erase or Text), so `1`–`3` keep R5 there and fall through to tools elsewhere. The digits come from
one place: add `digit` to each `ToolDef` in `state/catalog.ts` (rail order) and build the digit
entries of `TOOL_KEYS` from it, so the badge (N5) and the key cannot disagree. `Editor.tsx`'s
conditions (canvas focused, no editor, no repeat) are unchanged.

**Tests first:** `keymap.test.ts` (RED: digits return null): for each of the ten tools, the digit
with no hover → `select-tool`; over an object → `select-tool`; over an atom and over a bond with
Erase and with Text → `select-tool`; `1`/`2`/`3` over an atom with each of the other eight tools →
`sprout` 1/2/3, over a bond → `order`; `4`…`0` over an atom or a bond → their tool; Ctrl+1 →
`zoom-reset` and Ctrl+0 → `zoom-fit` from `globalCommand`, and `hoverKeys` with Ctrl, Alt or Meta
held → null; Shift is ignored (`key: '1', shiftKey: true` → select). `catalog` test: digits are
`1…9, 0` in `TOOLS` order and unique. `state/reducer-hover-keys.test.ts`: a digit dispatched
during a Bond drag cancels the gesture and switches the tool (G3), as a letter does.

**Acceptance criteria:**
- [x] every digit × hover × tool case above passes; letters unchanged
- [x] the digit table lives in `catalog.ts` only
- [x] editor ≥ 70 % lines

**Verification:** `npx vitest run --project unit src/renderer/editor/model/keymap.test.ts src/renderer/editor/state` then `npm run check`

**Dependencies:** None

**Files:** `src/renderer/editor/model/{keymap.ts,keymap.test.ts}`, `src/renderer/editor/state/catalog.ts`
(+ its test), `src/renderer/editor/state/reducer-hover-keys.test.ts`

**Scope:** S. Cross-platform. Must not change: R5 behaviour, K1 bindings.

## N5: rail badges, `aria-keyshortcuts`, two-key tooltips

**Description:** `SPEC-editor.md` R50 (U1, U2), "Tool rail", "Tooltips", "Accessibility"; mock-ups
03, 10 and `mockup.css` (`.rail-key`, `.tooltip-title kbd + kbd`). `ToolRail.tsx`: each button
renders `<span class="rail-key" aria-hidden="true">{digit}</span>` first; `aria-label` becomes the
tool's name only; `aria-keyshortcuts` = `` `${digit} ${letter}` `` with `+` written `Plus`.
`editor.css`: copy the `.rail-key` rules from `mockup.css` (tokens only, no px but 1 px).
`Tooltip`: a rail tooltip shows two `kbd` chips, digit then letter, 4 px apart.

**Tests first:** `ToolRail.test.tsx` (RED: no badge, label still "Bond (B)"): every button has
one `.rail-key` with its digit and `aria-hidden="true"`, `aria-label` equals `ToolDef.label`,
`aria-keyshortcuts` is `"3 B"` for Bond and `"8 Plus"` for Plus. `Tooltip.test.tsx`: the Bond
tooltip has chips `3` and `B` in that order. `tests/tooling/editor-tokens.test.ts` passes
unchanged (the badge uses caption colours: no new pair). E2E `e2e/editor-a11y.spec.ts`: each badge
box lies inside its 56×48 button, the button boxes are unchanged (±1 px), accessible names match
tooltips (update the "names against tooltips" expectation from "Bond (B)" to "Bond" plus
`aria-keyshortcuts`). E2E `e2e/editor-keyboard.spec.ts`: with the canvas focused, `1`…`0` select
Select…Text in turn (`aria-pressed`); with Ring active, hovering a ring atom then `1` sprouts a
bond (toluene, SC2). Shots `e2e/shots/N5.shot.ts`: `N5/rail-badges.png` (Select active, as mock-up
03), `N5/rail-tooltip.png` (Bond tooltip).

**Acceptance criteria:**
- [x] markup, tooltip and tokens tests pass; no new colour pair
- [x] e2e boxes unchanged, badges inside, digits select tools, toluene in 3 actions still works
- [x] shots exist and were compared with `out/mockups/03-select.png` and `10-states.png` by eye

**Verification:** `npx vitest run --project unit src/renderer/editor/view`, `npx vitest run --project tooling tests/tooling/editor-tokens.test.ts`, `npm run test:e2e -- e2e/editor-a11y.spec.ts e2e/editor-keyboard.spec.ts`, `npm run shots -- N5`, then `npm run check`

**Dependencies:** N4

**Files:** `src/renderer/editor/view/{ToolRail.tsx,ToolRail.test.tsx,Tooltip.tsx,Tooltip.test.tsx,editor.css}`,
`e2e/{editor-a11y.spec.ts,editor-keyboard.spec.ts}`, `e2e/shots/N5.shot.ts`

**Scope:** S. Cross-platform. Must not change: `view/tokens.css`, `view/icons.svg` (already lifted),
rail sizes, the 24 px hit targets.

## N5b: number-key edge cases (tests N4 and N5 did not write)

**Description:** `SPEC-editor.md` SC13 promises tests that N4 and N5 left out: a held digit, digits
in text targets, numpad digits and the shifted-digit-row layouts. The keymap matches
`KeyboardEvent.key` (R6; `KeyInfo` has no `code`), so the rule is: a digit acts when `key` is
`'0'`…`'9'`, whatever the physical key (the main row or the numpad with NumLock on); Shift is
ignored (R6). On a layout whose digit row gives symbols unshifted (French AZERTY: `&é"'(-è_çà`),
the digit is reached with Shift, and `Shift+&` arrives as `key: '1'`, so it picks a tool; the
unshifted symbol (`'&'`) does nothing there. There is no fallback on `event.code`: it would pick
the tool of a key whose character the user did not type (it would also make `Shift+Digit1` on a
QWERTY layout, `!`, count as `1`, which R6 does not want). This rule is stated in `SPEC-editor.md`
R50. **Code changes only if a test fails.**

**Tests first:** `model/keymap.test.ts`: `key: '&'`, `'é'`, `'"'` and `'!'` (unshifted AZERTY row,
Shift+1 on QWERTY) → null; `{ key: '1', shiftKey: true }` → select (the AZERTY Shift case);
numpad: `key: '1'`…`'0'` from the numpad are `key` digits, so the same table as the main row
(documented by one test that feeds the digits with `code: 'Numpad1'` in the event object and
asserts the tool). E2E `e2e/editor-keyboard.spec.ts`: with the canvas focused, a digit sent with
`repeat: true` (dispatch a `keydown` with `repeat`, or `keyboard.down` twice without `up`) picks the
tool once and a second digit held does nothing; digits typed in the name field, in the label
editor (open on an atom with Enter) and in the text editor (Text tool, click) appear as text and
leave the tool unchanged (`aria-pressed`); a numpad digit with Num Lock on picks a tool (Playwright's plain `Numpad3` is the Num Lock-off key `PageDown`; its Num Lock-on digit is `Shift+Numpad3`, and a `keydown` with `key: '3'`, `code: 'Numpad3'`, `location: 3` is the exact event; the plain Num Lock-off key does nothing). IME: digits typed with the Devanagari IME in the label editor stay text (hand check, in the
Windows checklist).

**Acceptance criteria:**
- [x] every test above exists and passes (RED shown if any fails, then the fix)
- [x] the shifted-digit-row rule is written in `SPEC-editor.md` R50 (with the task list correction of 2026-11-12)

**Verification:** `npx vitest run --project unit src/renderer/editor/model/keymap.test.ts`, `npm run test:e2e -- e2e/editor-keyboard.spec.ts`, then `npm run check`

**Dependencies:** N4, N5

**Files:** `src/renderer/editor/model/keymap.test.ts`, `e2e/editor-keyboard.spec.ts`
(`keymap.ts` or `Editor.tsx` only if a test fails)

**Scope:** XS. Cross-platform. Must not change: R5, R6, K1 bindings.

## N13: editor units in structural mode (`ptPerBlu`), viewport defaults

**Description:** `SPEC-editor.md` R53 (units, behaviour) and U14. Replace every BLU ↔ pt or screen
conversion that uses `scene.style.bondLength` or `resolveStyle(doc.style).bondLength` by
`ptPerBlu`: `model/{viewport.ts callers,hit-test.ts,frame.ts,placement.ts,scheme-text.ts,tidy.ts,conditions.ts,reaction-ops.ts,overlay.ts,handles.ts,warnings.ts,move.ts,text-box.ts,canvas-event.ts}`,
`tools/{select.ts,select-handles.ts}`, `state/{commands.ts,structure-commands.ts,name-field.ts,controller.ts}`,
`view/use-canvas-input.ts` (the list from `grep bondLength src/renderer/editor` on 2026-11-12).
Keep `bondLength` where the spec means the style: V2's `z₀` (`defaultZoom`, `initialViewport`,
`fitZoom`'s cap), V6/R38 (`preset.ts`, `reducer.ts` line 249 ff.), T3's `0.2 × bondLength` pt
gap. Rename the viewport helpers' parameter where it means pt per BLU so a reader cannot confuse
the two. Distances in BLU and px stay as they are.

**Tests first:** RED cases with a structural document loaded through the controller (`load`):
`canvas-event`/`viewport` tests: a pointer at the screen position of an atom (from its rendered
pt position) maps to that atom's BLU (RED: off by ×2); `hit-test.test.ts`: the atom, the bond (6 px
from the doubled segment) and an arrow are hit at their drawn positions at 25 %, 150 %, 800 %;
`tidy.test.ts`: TR5's gap between ink boxes is 0.6 BLU = 48 pt on the structural render;
`placement.test.ts`: P7 puts the new ink box 1.0 BLU (80 pt) right of the document's ink box;
`conditions.test.ts`: in structural mode the ink gap is `0.2 × bondLength` = 8 pt (Slides);
`commands` flip centre and `snapPlus` agree with the structural render; `editor-state` /
`viewport.test.ts`: V2's default zoom of a structural document is 1.5 (Slides) and 4.1667
(Handout), the skeletal values; the R38 preset switch on a structural document keeps one bond's
on-screen length. Every existing editor test passes unchanged (skeletal `ptPerBlu` equals
`bondLength`). Perf: the structural `hitTest` and bond-drag scenes meet the existing budgets.

**Acceptance criteria:**
- [x] no BLU ↔ pt conversion in `src/renderer/editor` uses `bondLength` (a grep in the commit message lists the remaining `bondLength` reads and why each is the style's)
- [x] the structural RED cases pass; every existing editor test passes unedited
- [x] perf budgets unchanged and met; editor ≥ 70 % lines

**Verification:** `npx vitest run --project unit src/renderer/editor`, `npx vitest run --project perf src/renderer/editor/perf.test.ts`, then `npm run check`

**Dependencies:** N3a

**Files:** the editor files listed above and their tests; `src/renderer/editor/perf.test.ts`

**Scope:** M. Cross-platform. Must not change: perf budgets, tolerances in px or BLU, V1–V7
numbers, R49.

## N6: `toggle-formula` command and the editor consequences of structural mode

**Description:** `SPEC-editor.md` R51, R52, R53 (U13), C7, L1. `EditorCommand` gains `'toggle-formula'`;
`canRun`: idle (no gesture, no editor) and (the doc is structural or has at least one atom or
object); `run`: one commit `setStyle(doc, { formula })` labelled "Show structural formula" /
"Show skeletal formula", selection and tool kept. Wherever the editor calls svg-render's
`isLabelled` (R37's default curved-arrow bend), pass `doc.style.formula ?? 'skeletal'` and
`ringAtoms(doc).has(atom.id)`. L1: in structural mode the label editor on a carbon outside a ring
without a label opens filled with the element and its perceived H count (`CH3`), so committing it
unchanged records nothing (L3 already clears an equal count); on a ring carbon it opens with `C`
as in skeletal mode (R53). **U13:** after the switch commit, and after undo or redo of it, the view
keeps its zoom and moves the pan so the centre of the drawing's ink box (scene `bounds`, pt) is at
the same screen point as before, then applies V5 (reveal) with the new scene; not R38. HV4, hit-testing, halos and warnings need no change (they key on `atom:` extents); prove
it with tests. Perf: the `hitTest` and bond-drag preview scenes in `src/renderer/editor/perf.test.ts`
get structural variants with the **same** budgets.

**Tests first:** `state/controller-commands.test.ts` (RED: unknown command): `canRun`/`run` agree
for empty skeletal (false), non-empty skeletal, structural (true), during a gesture and with an
editor open (false). `state/selection-actions.test.ts` or a new `reducer-formula.test.ts`: one undo
step; undo restores; a second toggle gives a doc deep-equal to the start and `isDirty()` false
after saving before; selection and tool unchanged; U13 (RED: the viewport is untouched): after
the switch the zoom is unchanged and the ink-box centre is at the same screen point within 0.5 px,
for a drawing that still fits nothing else moves, for one that no longer fits V5 zooms out to
`min(fit, z₀)`; undo and redo do the same; the skeletal → structural → skeletal round trip ends at
the starting zoom when no reveal zoomed out. `model/overlay.test.ts`: in structural mode a hovered
chain carbon gets the label box and the Bond tool shows no hover ghost (HV4), a hovered ring
carbon of toluene keeps its ghost. The R37 test: default bend for an arrow from a chain carbon is
the labelled-atom value in structural mode and the skeleton value in skeletal mode; from a ring
carbon it is the skeleton value in both. `state/reducer-label.test.ts`: U11 fill text `CH3`;
Enter unchanged → no history step; a ring carbon opens with `C`.

**Acceptance criteria:**
- [x] command, reducer, overlay, bend and label-editor tests pass (2026-11-12, W16)
- [x] perf budgets unchanged and met, structural variants included (timings skipped under `--coverage` as before) (`vitest --project perf`, 2026-11-12, W16)
- [x] editor ≥ 70 % lines (`npm test -- --coverage` exit 0, 2026-11-12, W16)

**Verification:** `npx vitest run --project unit src/renderer/editor`, `npx vitest run --project perf src/renderer/editor/perf.test.ts`, then `npm run check`

**Dependencies:** N1, N2 (N13 for correct pointer positions in a structural drawing; the unit
tests here do not need it)

**Files:** `src/renderer/editor/state/{controller.ts,reducer.ts,commands or selection-actions module}`,
`src/renderer/editor/model/{overlay.ts (if needed), the R37 bend module, text-edit or label fill}`,
their tests, `src/renderer/editor/perf.test.ts`

**Scope:** M. Cross-platform. Must not change: perf budgets, HV4/R27 rules, R37's numbers, R38
for the preset switch.

## N7: the formula switch in the options bar

**Description:** `SPEC-editor.md` R51 (U5, U6, U8), "Selection actions" row, icons; mock-ups 03,
03b, 10, shell A15c; `mockup.css` `#act-formula` rules. `OptionsBar.tsx`: after Show Kekulé an
action button `data-testid="act-formula"`, icon `show-structural` + "Show structural" (skeletal)
or `show-skeletal` + "Show skeletal" (structural), `aria-label` "Show structural formula" /
"Show skeletal formula", disabled per U6 with its tooltip help, runs `toggle-formula`.
`editor.css`: `#act-formula` fixed width `var(--formula-btn-w)` (copy from `mockup.css`) and,
below 1100 px content width (`@media (max-width: 1099px)`), icon-only 32×32 with the label
hidden. Tooltips: title "Show structural formula" / "Show skeletal formula", help per U6 with
R53 U15's text for "Show structural" ("Writes the carbons outside rings with their hydrogens
(CH3, CH2, CH); bonds become twice as long."), no key (U7 is only proposed).

**Tests first:** `OptionsBar.test.tsx` (RED: no button): labels, icons, `aria-label`,
`aria-disabled` on an empty skeletal doc, enabled when structural, placed right after
`act-kekule`. `tests/tooling/editor-tokens.test.ts`: passes unchanged (`editor.css` uses tokens
only). E2E new `e2e/editor-formula.spec.ts`: insert ethanol, click the switch: the `atom:` parts of
both carbons appear; click again: the parts equal the first render; Ctrl+Z after a switch restores;
at 960×640 with an abbreviation selected (Expand shown) the options bar has `scrollWidth <=
clientWidth` and the switch is 32 px wide; at 1280 it is `--formula-btn-w` wide; R53: after the
switch the screen distance between ethanol's two carbon atoms is twice the skeletal one within
1 px, a label's computed font size is unchanged, toluene's ring carbons have no `atom:` part and
its methyl reads `CH3`, and clicking a structural atom with the Atom tool changes that atom (the
pointer maps through `ptPerBlu`); every file ends with `expectBlockedRequests(app, 0)`. Shots
`e2e/shots/N7.shot.ts`: `N7/select-bar.png` (mock-up 03), `N7/select-bar-abbrev.png` (03b),
`N7/select-bar-960.png` (shell A15c), `N7/structural-canvas.png` (ethanol, toluene and acetic acid
after "Show structural", compared with the structural goldens on the golden sheet).

**Acceptance criteria:**
- [x] markup and e2e tests pass; no overflow at 960×640 with Expand (`e2e/editor-formula.spec.ts`, `e2e/editor-layout.spec.ts`, 2026-11-12, W16)
- [x] shots exist and match mock-ups 03, 03b, 10 (tooltip text) and shell A15c by eye; the structural canvas shot matches the golden sheet (looked at, 2026-11-12, W16)
- [x] no key bound for the switch unless U7 is approved (then a separate spec change and task)

**Verification:** `npx vitest run --project unit src/renderer/editor/view`, `npm run test:e2e -- e2e/editor-formula.spec.ts e2e/editor-layout.spec.ts`, `npm run shots -- N7`, then `npm run check`

**Dependencies:** N6, N13, N3a

**Files:** `src/renderer/editor/view/{OptionsBar.tsx,OptionsBar.test.tsx,editor.css}`,
`e2e/editor-formula.spec.ts`, `e2e/shots/N7.shot.ts`

**Scope:** S. Cross-platform. Must not change: the Kekulé button (109 px), other options-bar
boxes asserted by `editor-layout.spec.ts`, the lifted tokens and icons.

## N14: hint to tidy after switching to structural (U16)

**Description:** `SPEC-editor.md` R55 (orchestrator's UI decision U16), "Notices and errors". When a
switch to structural succeeds and Tidy reaction is enabled for the document (`selectionScope`
`hasArrow`) the editor shows the info notice `Press Tidy reaction to make room for the written carbons.` in the status bar, through
`showNotice` (existing duration, replacement and `aria-live` rules). `toggleFormula` in
`state/formula.ts` sets it after the commit; the text is an exported constant next to it. Not on
switching to skeletal, not on undo or redo (those go through `stepHistory`, which clears the notice), not
when there is no arrow, not when the switch does nothing. The switch still moves nothing.

**Tests first:** `state/reducer-formula.test.ts` (RED: no notice): skeletal to structural with an
arrow gives the notice (info, the exact text); skeletal to structural without an arrow, structural
to skeletal (with an arrow), undo and redo of a switch (with an arrow), and a switch that does
nothing (empty document) give none; the document after the switch is unchanged apart from the
formula. E2E `e2e/editor-formula.spec.ts` (RED: no text in the hint slot): insert the esterification
scheme with its chip, switch to structural, the status bar's hint shows the text; press Tidy
reaction; no ink box of a label overlaps a plus sign or an arrow (DOM boxes of the drawn parts) and
every gap between neighbouring items is positive. Shots `e2e/shots/N14.shot.ts`:
`N14/after-switch.png`, `N14/after-tidy.png`.

**Acceptance criteria:**
- [x] unit and e2e tests pass; the notice appears only in the case R55 names
- [x] after the switch and Tidy nothing in the esterification scheme touches (measured gaps in the report)
- [x] shots exist and were looked at

**Verification:** `npx vitest run --project unit src/renderer/editor/state`, `npm run test:e2e -- e2e/editor-formula.spec.ts`, `npm run shots -- N14`, then `npm run check`

**Dependencies:** N6, N7

**Files:** `src/renderer/editor/state/{formula.ts,reducer-formula.test.ts}`, `e2e/editor-formula.spec.ts`,
`e2e/shots/N14.shot.ts`

**Scope:** XS. Cross-platform. Must not change: the switch's commit, U13, the notice rules.

## N8: white-backed clipboard bitmap with margin

**Description:** `SPEC-clipboard-export.md` R10, PI3, CB-C2, Public surface, SC3, SC14, "Test
changes that follow from R10 and R11". Core: `CLIPBOARD_MARGIN = 0.25`,
`clipboardBitmapPadding(doc)` (`picture.ts`, exported from `index.ts`), `exportSvg` takes an
optional `padding` (default 0) and skips `drawingPayload` when `embed` is `false` (today it computes the payload and
discards it; the second render of a copy must not serialise the document again, SC12; the output is
unchanged, so only the measured copy time shows it). Renderer `model/copy-flow.ts`: the SVG entry stays `exportSvg(doc,
sel)`; the bitmap is `rasterise(exportSvg(doc, sel, { embed: false, padding:
clipboardBitmapPadding(doc) }), 300, true)`. Export untouched.

**Tests first:** `picture.test.ts` (RED: no padding option, no helper): `exportSvg(doc, null, {
padding: 10 })` equals `renderSvg(doc, { padding: 10, metadata })` and the default stays tight;
`clipboardBitmapPadding` is 10 for Slides, 3.6 for Handout, `0.25 × bondLength` with an override.
`model/copy-flow.test.ts`: the expectation `rasterise(svg, 300, false)` becomes the padded,
unembedded SVG at 300 with white `true`; the C1 SVG and drawing entries are unchanged.
Windows-only `e2e/win/clipboard-copy.spec.ts`: SC3's PNG size becomes `ceil(w·300/72) × ceil(h·300/72)` with `w`, `h` the
`width` and `height` of `exportSvg(doc, null, { embed: false, padding: m })` (`toSvg` rounds the
padded sum to 3 decimals, so this is not `W + 2m` computed from the tight width); new SC14 checks on the native PNG decoded in the page (four corners opaque
`#ffffff`, every alpha 255; for the toluene golden input the box of ink pixels (`min(R, G, B) < 128`;
alpha is 255 everywhere, so the test is colour, not alpha) starts `m·300/72` px
from each edge within 2 px); the native SVG stream assertion unchanged. `e2e/win/windows-clipboard.ts`:
a PNG-to-RGBA helper if none exists. `rasterise.test.ts`, `model/export-flow.test.ts`,
`e2e/export-*.spec.ts`: run **unchanged** (proof that Export did not change).

**Acceptance criteria:**
- [x] unit and flow tests pass; export tests pass unedited (`rasterise.test.ts`, `export-flow.test.ts`, `e2e/export-*.spec.ts` ran without edits, 2026-11-12)
- [x] on Windows `e2e/win/clipboard-copy.spec.ts` passes with the new size and pixels (run on the development machine, Windows 11, 2026-11-12: 5 passed, SC14 for Slides and Handout)
- [x] SC12's copy budget (≤ 500 ms) still met by `e2e/clipboard-perf.spec.ts` (median 34.4 ms) and `e2e/win/clipboard-perf.spec.ts` (median 69.1 ms, Windows clipboard); budget not raised
- [x] `src/core/clipboard-export` and `src/renderer/clipboard-export/model` ≥ 90 % lines (`npm test -- --coverage`: every threshold met)

**Verification:** `npx vitest run --project unit src/core/clipboard-export src/renderer/clipboard-export`, `npm run test:e2e -- e2e/clipboard-perf.spec.ts e2e/clipboard-ui.spec.ts e2e/export-png.spec.ts` (and on Windows `e2e/win/clipboard-copy.spec.ts`), then `npm run check`

**Dependencies:** None (independent of F1 and F2)

**Files:** `src/core/clipboard-export/{picture.ts,index.ts,picture.test.ts,picture-embed.test.ts}`,
`src/renderer/clipboard-export/model/{copy-flow.ts,copy-flow.test.ts}`,
`e2e/win/{clipboard-copy.spec.ts,windows-clipboard.ts}`

**Scope:** S. Cross-platform core and renderer; the `e2e/win/` part is Windows-only. Must not
change: `formats.ts` keys, the SVG entry, Export, the raster caps, SC12's budget.

## N9: `pictureDoc` copies the formula setting

**Description:** `SPEC-clipboard-export.md` R11, R12, SC15. `pictureDoc` passes `formula:
doc.style.formula ?? 'skeletal'` to `setStyle` along with `preset` and `overrides`. Exports use
`pictureDoc`, so a structural drawing's PNG, SVG and PDF carry the setting; N9 proves it. R12
needs no code: a structural picture is the doubled render at true size and the clipboard margin
stays `0.25 × bondLength`; N9 adds guard tests for both.

**Tests first:** in the existing `pictureDoc` tests (`embedding.test.ts` or `picture.test.ts`;
RED: formula dropped): a structural doc's `pictureDoc(doc, sel)` is structural and its payload
parses to a structural doc; a skeletal selection's payload is byte-identical to the expected pre-F2
string (v1); `pasteAction` with a structural payload gives a fragment whose `SubDoc` carries no
style (the target's setting applies). R12 guards (no RED expected; they pass once N3a is in and
fail the day the margin or the true size drifts; the report says so): `clipboardBitmapPadding` of
a structural doc is 10 (Slides) and 3.6 (Handout), the skeletal values; `exportSvg(doc, null)` of a
structural doc has the `width` and `height` of `renderSvg` of the same doc (true size of the
doubled drawing) and they exceed the skeletal ones. E2E new `e2e/export-structural.spec.ts` (RED: reopened
exports are skeletal): `loadDocument` a structural drawing (a v2 document; it needs only N1), export
PNG, SVG and PDF through the Export dialog (`e2e/export-steps.ts`), reopen each through File >
Open: `readDocument` has `style.formula === 'structural'` and `serialize` equals the original's;
the file ends with `expectBlockedRequests(app, 0)`. Property: `parse(drawingPayload(d))` deep-equals `d` with
`formula` in the generator (`numRuns` unchanged).

**Acceptance criteria:**
- [x] tests pass; skeletal payload bytes unchanged (`picture.test.ts`, 2026-11-12, W17)
- [x] structural PNG, SVG and PDF exports reopen structural (`e2e/export-structural.spec.ts`, 3 passed, 2026-11-12, W17)
- [x] `src/core/clipboard-export` ≥ 90 % lines (`npm test -- --coverage` exit 0, 2026-11-12, W17)

**Verification:** `npx vitest run --project unit src/core/clipboard-export`, `npm run test:e2e -- e2e/export-structural.spec.ts`, then `npm run check`

**Dependencies:** N1 (N3a for the R12 guards to mean anything; they may be written before it)

**Files:** `src/core/clipboard-export/{payload.ts,picture.test.ts}` (the property test in `embedding.test.ts` already had `formula` in its generator), `e2e/export-structural.spec.ts`

**Scope:** XS. Cross-platform. Must not change: `drawingPayload`'s format, `numRuns`.

## N10: shortcuts list with digits; New is skeletal; v1/v2 files

**Description:** `SPEC-app-shell.md` R27, R28, SC15; mock-up A12. `src/renderer/app/model/shortcuts.ts`:
the Tools rows become `['1', 'V']` … `['0', 'T']` exactly as `docs/mockups/shell/pages.mjs`
`SHORTCUTS`. No menu change. F1 New: `setStyle(emptyDoc(clock()), { preset })` already gives a
skeletal doc; the test must start from a structural document so it can fail (below).

**Tests first:** `shortcuts.test.ts` (RED: rows lack digits): the exact-rows expectation gets the
new Tools rows; "Tools: each key selects that tool" covers digits through `hoverKeys`; the "every
key is listed" test adds the ten digits to the tool keys. `src/main/model/menu-model.test.ts` (or
the menu model test file) unchanged and passing (R28: no new item). E2E `e2e/app-files.spec.ts`:
a structural drawing (loaded with `loadDocument`) saved then reopened keeps `formula: 'structural'` and its file has
`"schemaVersion": 2`; a skeletal one is written with `"schemaVersion": 1`; File > New with a
structural drawing open (saved first, so no prompt) gives an empty drawing whose `readDocument` has
no `style.formula` (and a model-level test in `file-flows.test.ts`: the New flow's result for a
flow whose current document is structural has no `formula`; a regression guard that passes before any
code, because `file-flows.ts` builds `setStyle(emptyDoc(clock()), { preset: newDrawingStyle() })`
and never reads the open document's style; it starts from a structural document, so it fails the
day New copies that style; no RED is expected for it and the report says so). Shot `e2e/shots/N10.shot.ts`: `N10/shortcuts-dialog.png`
(mock-up A12).

**Acceptance criteria:**
- [x] shortcuts and menu tests pass; the dialog shows digit then letter
- [x] files e2e passes (v1/v2, New skeletal); every e2e file ends with `blockedRequests === 0`
- [x] `src/renderer/app/model` and `src/main/model` ≥ 90 % lines (checked in the final coverage run); shot compared with `out/mockups-shell/A12-shortcuts.png`

**Verification:** `npx vitest run --project unit src/renderer/app src/main`, `npm run test:e2e -- e2e/app-files.spec.ts`, `npm run shots -- N10`, then `npm run check`

**Dependencies:** N4 (keymap digits), N6 (`toggle-formula` to make a structural drawing in e2e; or `loadDocument`)

**Files:** `src/renderer/app/model/{shortcuts.ts,shortcuts.test.ts}`, `e2e/app-files.spec.ts`,
`e2e/shots/N10.shot.ts`

**Scope:** S. Cross-platform. Must not change: menu items and accelerators, A12's other sections.

## N11: docs and the named shots

**Description:** `AGENTS.md` module notes: editor (R50–R53, the formula switch, number keys,
`ptPerBlu` for every BLU ↔ pt conversion, U13), doc-model (schema v2 and the lowest-version rule),
svg-render (Decisions 15 and 16: `ptPerBlu`, `STRUCTURAL_SCALE`, `ringAtoms`, the Decision 16
oracle, the structural goldens and L1–L3), clipboard-export (R10 white bitmap, R11, R12).
`docs/editor-perf.md`: the structural perf numbers from N2, N3a, N6 and N13. Collect the shots of
N5, N7, N10 (and N3b's golden sheet) and compare them with the mock-up PNGs and goldens; write
what was compared in the commit message. No product code.

**Tests first:** none (documentation task; disclosed exception to test-first).

**Acceptance criteria:**
- [x] AGENTS.md and `docs/editor-perf.md` updated; nothing contradicts the specs
- [x] every listed shot exists and was looked at against its mock-up

**Verification:** `npm run shots -- N5 N7 N10` (playwright args pass through), then `npm run check`

**Dependencies:** N1–N10, N14, N3a, N3b, N13

**Files:** `AGENTS.md`, `docs/editor-perf.md`

**Scope:** XS. Must not change: specs (except a correction found here, spec first).

## N12: final checkpoint for the feature set

**Description:** Every gate on the final commit, then the Windows re-check section. The automated
gates on Windows are run by the orchestrator (or a worker on the Windows machine); the hand checks
by the owner. Record results as the checklist asks; tick only what was run and seen.

**Tests first:** none (checkpoint).

**Acceptance criteria:**
- [ ] `npm run check` green (Linux and Windows); `npm run test:e2e` green on both, including `e2e/win/` on Windows
- [ ] `npm test -- --coverage`: every threshold met, none lowered
- [ ] every pre-F2 golden unchanged (`git diff --stat 628ea2b -- src/core/svg-render/__golden__` shows only added files)
- [ ] `npm run test:e2e:os-input`, `npm run dist:win`, `npm run test:packaged` on Windows
- [ ] `npm run shots` and the golden sheet looked at against the mock-ups
- [ ] `docs/windows-checklist.md` "Re-checks after the 2026-11-12 feature set": automated boxes ticked with results; hand checks handed to the owner
- [ ] `SPEC.md` Decisions Log row recording the checkpoint

**Verification:** the commands above, each on its own; exit codes and summaries written into the checklist

**Dependencies:** N1–N11, N14, N3a, N3b, N13 (S1 and S2 are answered)

**Files:** `docs/windows-checklist.md`, `SPEC.md`

**Scope:** M (machine time). Windows-only gates as named.
