# Tasks: the 2026-11-12 feature set

Plan: `tasks/plan-features-2026-11.md`. Specs: `SPEC.md` (Decisions Log 2026-11-12),
`SPEC-doc-model.md` D1, `SPEC-svg-render.md` Decision 15, `SPEC-editor.md` R50–R52 and C7,
`SPEC-clipboard-export.md` R10–R11, `SPEC-app-shell.md` R27–R28; mock-ups `docs/mockups/editor/`
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
In `migrations.ts`: `migrations[1]` sets `schemaVersion` to 2 (nothing else). `parse` accepts v1
(migrated) and v2, rejects 3+ as `newer-version`. `serialize` writes `schemaVersion: 1` in the
envelope and the doc when `style.formula` is absent, else 2 (key order rules unchanged; `formula`
sorts alphabetically inside `style`). `emptyDoc` returns a v2 doc without `formula`. `setStyle`
(`style.ts`) takes `formula?: 'skeletal' | 'structural'`: `'structural'` sets the key, `'skeletal'`
deletes it (draft-aware `delete`), anything else throws `DocError('invalid-value')`; a patch that
changes nothing records no step. `__fixtures__/arbitraries.ts`: the `setStyle` command may carry a
`formula` patch.

**Tests first:** `serialize.test.ts`: every committed `.chalk` under `src/core/doc-model/__fixtures__/`
and `src/core/svg-render/__golden__/inputs/` parses and re-serialises byte-identically (RED only
for the parts that need the new code: a v1 file parses to `schemaVersion: 2` in memory); a doc
with `formula: 'structural'` serialises with `"schemaVersion": 2` twice and round-trips; a v1 file
with a `formula` key → `schema`; a v2 file with `formula: 'skeletal'` or `'x'` → `schema`; version
3 → `newer-version`. `style.test.ts`: `formula: 'structural'` inside `transact` is one undo step;
`'skeletal'` afterwards gives a doc deep-equal to the start (no `formula` key at all); an
invalid value throws and leaves the doc unchanged; `{ formula: 'skeletal' }` on a skeletal doc
records no step. `doc-model.prop.test.ts`: the generator test asserts the formula patch applies;
round-trip and undo properties pass unchanged in `numRuns`.

**Acceptance criteria:**
- [ ] v1 files parse; `serialize` of every committed fixture and golden input is byte-identical to the file
- [ ] structural docs are written as v2 and round-trip; v2 schema rejects any `formula` but `'structural'`
- [ ] `setStyle` formula: one undo step; switching back deep-equals the start
- [ ] doc-model ≥ 95 % lines; property `numRuns` unchanged

**Verification:** `npx vitest run --project unit src/core/doc-model` then `npm run check`

**Dependencies:** None

**Files:** `src/core/doc-model/{types.ts,schema.ts,migrations.ts,serialize.ts,doc.ts,style.ts,index.ts}`,
tests `src/core/doc-model/{serialize.test.ts,style.test.ts,doc-model.prop.test.ts}`,
`src/core/doc-model/__fixtures__/arbitraries.ts` (and whichever module holds `emptyDoc`)

**Scope:** M. Cross-platform (core). Must not change: any committed fixture byte, `numRuns`, the
95 % threshold.

## N2: svg-render structural switch (existing label rules, no new goldens)

**Description:** `SPEC-svg-render.md` Decision 15 (a)–(c), "Atoms and labels", Public API. Export
`isLabelled(atom, bondCount, formula = 'skeletal')`: with `'structural'` every carbon is
labelled. `render` passes `doc.style.formula ?? 'skeletal'` wherever it calls `isLabelled`, so a
structural carbon gets a label built by the existing `buildAtomLabel` with its `implicitH`. **No
layout change** (that is N3, blocked on S1). Add structural variants of the two perf scenes in
`perf.test.ts` with the **same** budgets.

**Tests first:** `atom-label.test.ts` (or a new `structural.test.ts`): `isLabelled(c, n)` equals
the old rule for every case of the existing table; `isLabelled(c, n, 'structural')` is true for a
carbon with 0–4 bonds, with and without charge/radical (RED: third parameter ignored).
`render.test.ts`: for a structural ethanol, `atom:` parts exist for both carbons with texts `CH2`
and `CH3`, the `O` part is byte-identical to skeletal mode; for every golden input,
`render(doc)` equals `render` of the same doc after `setStyle(doc, { formula: 'skeletal' })`.
`svg-render.prop.test.ts`: properties 1–7 run on docs whose generator may set `formula`
(`numRuns` unchanged). `golden.test.ts` is **not** edited: it must pass byte for byte.

**Acceptance criteria:**
- [ ] every golden committed before F2 passes with no `-u`
- [ ] structural carbons are labelled by the existing rules; labelled and non-carbon atoms' parts unchanged
- [ ] properties 1–7 pass with `formula` in the generator; perf structural variants meet the existing budgets
- [ ] svg-render ≥ 90 % lines; the ESLint determinism block untouched

**Verification:** `npx vitest run --project unit src/core/svg-render`, `npx vitest run --project perf src/core/svg-render/perf.test.ts`, then `npm run check`

**Dependencies:** N1

**Files:** `src/core/svg-render/{atom-label.ts,render.ts,index.ts}` and tests
`src/core/svg-render/{atom-label.test.ts,render.test.ts,svg-render.prop.test.ts,perf.test.ts}`

**Scope:** S. Cross-platform (core). Must not change: any golden, the perf budgets, `numRuns`,
derived constants.

## N3: BLOCKED on S1 — svg-render structural layout and goldens

**Description:** Cannot be specified yet. `SPEC-svg-render.md` "Structural formula display" shows
that the existing rules make bonds vanish and labels overlap; the orchestrator must answer S1
(options there: longer bonds in structural mode, hydrogens stacked, a minimum stub). After the
answer: the spec is amended first (a Decision row and the layout rule), then this task is written
out in full here, in this format, with: the rule's unit tests; the legibility unit test of
svg-render SC14 (for the seven reference molecules in both presets, no bond between two labelled
atoms vanishes and no two bonded labels' glyph boxes overlap, measured as the analysis did); the
structural golden scenes `<scene>-structural.<preset>.svg` (ethanol, propane, isobutane,
but-2-ene, benzene, toluene, acetic acid with atoms, acetic acid with `CO2H`, a carbocation, a
methyl radical) from frozen inputs in `__golden__/inputs/`; the ink-scan bounds check (SC5) on
them; a look at `npm run golden:sheet -- --png out/sheet.png`. If S1 changes the effective bond
length, the editor follow-up (R38-style viewport, C7) is added to N6's acceptance or a new task.

**Tests first:** to be written with the task.

**Acceptance criteria:**
- [ ] S1 answered and `SPEC-svg-render.md` amended before any code
- [ ] this task rewritten in full before it starts

**Verification:** to be written with the task.

**Dependencies:** N2; the orchestrator's answer to S1

**Files:** `SPEC-svg-render.md`, `src/core/svg-render/**`, `src/core/svg-render/__golden__/**` (new files only)

**Scope:** unknown until S1. Cross-platform (core). Must not change: any existing golden.

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

## N6: `toggle-formula` command and the editor consequences of structural mode

**Description:** `SPEC-editor.md` R51, R52, C7, L1. `EditorCommand` gains `'toggle-formula'`;
`canRun`: idle (no gesture, no editor) and (the doc is structural or has at least one atom or
object); `run`: one commit `setStyle(doc, { formula })` labelled "Show structural formula" /
"Show skeletal formula", selection and tool kept. Wherever the editor calls svg-render's
`isLabelled` (R37's default curved-arrow bend), pass `doc.style.formula ?? 'skeletal'`. L1: in
structural mode the label editor on a carbon without a label opens filled with the element and its
perceived H count (`CH3`), so committing it unchanged records nothing (L3 already clears an equal
count). HV4, hit-testing, halos and warnings need no change (they key on `atom:` extents); prove
it with tests. Perf: the `hitTest` and bond-drag preview scenes in `src/renderer/editor/perf.test.ts`
get structural variants with the **same** budgets.

**Tests first:** `state/controller-commands.test.ts` (RED: unknown command): `canRun`/`run` agree
for empty skeletal (false), non-empty skeletal, structural (true), during a gesture and with an
editor open (false). `state/selection-actions.test.ts` or a new `reducer-formula.test.ts`: one undo
step; undo restores; a second toggle gives a doc deep-equal to the start and `isDirty()` false
after saving before; selection and tool unchanged. `model/overlay.test.ts`: in structural mode a
hovered carbon gets the label box and the Bond tool shows no hover ghost (HV4). The R37 test:
default bend for an arrow from a carbon is the labelled-atom value in structural mode and the
skeleton value in skeletal mode. `state/reducer-label.test.ts`: U11 fill text `CH3`; Enter
unchanged → no history step.

**Acceptance criteria:**
- [ ] command, reducer, overlay, bend and label-editor tests pass
- [ ] perf budgets unchanged and met, structural variants included (timings skipped under `--coverage` as before)
- [ ] editor ≥ 70 % lines

**Verification:** `npx vitest run --project unit src/renderer/editor`, `npx vitest run --project perf src/renderer/editor/perf.test.ts`, then `npm run check`

**Dependencies:** N1, N2

**Files:** `src/renderer/editor/state/{controller.ts,reducer.ts,commands or selection-actions module}`,
`src/renderer/editor/model/{overlay.ts (if needed), the R37 bend module, text-edit or label fill}`,
their tests, `src/renderer/editor/perf.test.ts`

**Scope:** M. Cross-platform. Must not change: perf budgets, HV4/R27 rules, R37's numbers.

## N7: the formula switch in the options bar

**Description:** `SPEC-editor.md` R51 (U5, U6, U8), "Selection actions" row, icons; mock-ups 03,
03b, 10, shell A15c; `mockup.css` `#act-formula` rules. `OptionsBar.tsx`: after Show Kekulé an
action button `data-testid="act-formula"`, icon `show-structural` + "Show structural" (skeletal)
or `show-skeletal` + "Show skeletal" (structural), `aria-label` "Show structural formula" /
"Show skeletal formula", disabled per U6 with its tooltip help, runs `toggle-formula`.
`editor.css`: `#act-formula` fixed width `var(--formula-btn-w)` (copy from `mockup.css`) and,
below 1100 px content width (`@media (max-width: 1099px)`), icon-only 32×32 with the label
hidden. Tooltips: title "Show structural formula" / "Show skeletal formula", help per U6, no key
(U7 is only proposed).

**Tests first:** `OptionsBar.test.tsx` (RED: no button): labels, icons, `aria-label`,
`aria-disabled` on an empty skeletal doc, enabled when structural, placed right after
`act-kekule`. `tests/tooling/editor-tokens.test.ts`: passes unchanged (`editor.css` uses tokens
only). E2E new `e2e/editor-formula.spec.ts`: insert ethanol, click the switch: the `atom:` parts of
both carbons appear; click again: the parts equal the first render; Ctrl+Z after a switch restores;
at 960×640 with an abbreviation selected (Expand shown) the options bar has `scrollWidth <=
clientWidth` and the switch is 32 px wide; at 1280 it is `--formula-btn-w` wide; every file ends with
`expectBlockedRequests(app, 0)`. Shots `e2e/shots/N7.shot.ts`: `N7/select-bar.png` (mock-up 03),
`N7/select-bar-abbrev.png` (03b), `N7/select-bar-960.png` (shell A15c).

**Acceptance criteria:**
- [ ] markup and e2e tests pass; no overflow at 960×640 with Expand
- [ ] shots exist and match mock-ups 03, 03b and shell A15c by eye
- [ ] no key bound for the switch unless U7 is approved (then a separate spec change and task)

**Verification:** `npx vitest run --project unit src/renderer/editor/view`, `npm run test:e2e -- e2e/editor-formula.spec.ts e2e/editor-layout.spec.ts`, `npm run shots -- N7`, then `npm run check`

**Dependencies:** N6

**Files:** `src/renderer/editor/view/{OptionsBar.tsx,OptionsBar.test.tsx,editor.css}`,
`e2e/editor-formula.spec.ts`, `e2e/shots/N7.shot.ts`

**Scope:** S. Cross-platform. Must not change: the Kekulé button (109 px), other options-bar
boxes asserted by `editor-layout.spec.ts`, the lifted tokens and icons.

## N8: white-backed clipboard bitmap with margin

**Description:** `SPEC-clipboard-export.md` R10, PI3, CB-C2, Public surface, SC3, SC14, "Test
changes that follow from R10 and R11". Core: `CLIPBOARD_MARGIN = 0.25`,
`clipboardBitmapPadding(doc)` (`picture.ts`, exported from `index.ts`), `exportSvg` takes an
optional `padding` (default 0). Renderer `model/copy-flow.ts`: the SVG entry stays `exportSvg(doc,
sel)`; the bitmap is `rasterise(exportSvg(doc, sel, { embed: false, padding:
clipboardBitmapPadding(doc) }), 300, true)`. Export untouched.

**Tests first:** `picture.test.ts` (RED: no padding option, no helper): `exportSvg(doc, null, {
padding: 10 })` equals `renderSvg(doc, { padding: 10, metadata })` and the default stays tight;
`clipboardBitmapPadding` is 10 for Slides, 3.6 for Handout, `0.25 × bondLength` with an override.
`model/copy-flow.test.ts`: the expectation `rasterise(svg, 300, false)` becomes the padded,
unembedded SVG at 300 with white `true`; the C1 SVG and drawing entries are unchanged.
Windows-only `e2e/win/clipboard-copy.spec.ts`: SC3's PNG size becomes `ceil((W + 2m)·300/72) ×
ceil((H + 2m)·300/72)`; new SC14 checks on the native PNG decoded in the page (four corners opaque
`#ffffff`, every alpha 255; for the toluene golden input the non-white box starts `m·300/72` px
from each edge within 2 px); the native SVG stream assertion unchanged. `e2e/win/windows-clipboard.ts`:
a PNG-to-RGBA helper if none exists. `rasterise.test.ts`, `model/export-flow.test.ts`,
`e2e/export-*.spec.ts`: run **unchanged** (proof that Export did not change).

**Acceptance criteria:**
- [ ] unit and flow tests pass; export tests pass unedited
- [ ] on Windows `e2e/win/clipboard-copy.spec.ts` passes with the new size and pixels (run by the orchestrator if the worker is on Linux; say so)
- [ ] SC12's copy budget (≤ 500 ms) still met by `e2e/clipboard-perf.spec.ts`; budget not raised
- [ ] `src/core/clipboard-export` and `src/renderer/clipboard-export/model` ≥ 90 % lines

**Verification:** `npx vitest run --project unit src/core/clipboard-export src/renderer/clipboard-export`, `npm run test:e2e -- e2e/clipboard-perf.spec.ts e2e/clipboard-ui.spec.ts e2e/export-png.spec.ts` (and on Windows `e2e/win/clipboard-copy.spec.ts`), then `npm run check`

**Dependencies:** None (independent of F1 and F2)

**Files:** `src/core/clipboard-export/{picture.ts,index.ts,picture.test.ts}`,
`src/renderer/clipboard-export/model/{copy-flow.ts,copy-flow.test.ts}`,
`e2e/win/{clipboard-copy.spec.ts,windows-clipboard.ts}`

**Scope:** S. Cross-platform core and renderer; the `e2e/win/` part is Windows-only. Must not
change: `formats.ts` keys, the SVG entry, Export, the raster caps, SC12's budget.

## N9: `pictureDoc` copies the formula setting

**Description:** `SPEC-clipboard-export.md` R11, SC15. `pictureDoc` passes `formula:
doc.style.formula ?? 'skeletal'` to `setStyle` along with `preset` and `overrides`.

**Tests first:** in the existing `pictureDoc` tests (`embedding.test.ts` or `picture.test.ts`;
RED: formula dropped): a structural doc's `pictureDoc(doc, sel)` is structural and its payload
parses to a structural doc; a skeletal selection's payload is byte-identical to the expected pre-F2
string (v1); `pasteAction` with a structural payload gives a fragment whose `SubDoc` carries no
style (the target's setting applies). Property: `parse(drawingPayload(d))` deep-equals `d` with
`formula` in the generator (`numRuns` unchanged).

**Acceptance criteria:**
- [ ] tests pass; skeletal payload bytes unchanged
- [ ] `src/core/clipboard-export` ≥ 90 % lines

**Verification:** `npx vitest run --project unit src/core/clipboard-export` then `npm run check`

**Dependencies:** N1

**Files:** `src/core/clipboard-export/{payload.ts,embedding.test.ts or picture.test.ts}` (+ the property test file)

**Scope:** XS. Cross-platform. Must not change: `drawingPayload`'s format, `numRuns`.

## N10: shortcuts list with digits; New is skeletal; v1/v2 files

**Description:** `SPEC-app-shell.md` R27, R28, SC15; mock-up A12. `src/renderer/app/model/shortcuts.ts`:
the Tools rows become `['1', 'V']` … `['0', 'T']` exactly as `docs/mockups/shell/pages.mjs`
`SHORTCUTS`. No menu change. F1 New: `setStyle(emptyDoc(clock()), { preset })` already gives a
skeletal doc; prove it after a structural drawing was open.

**Tests first:** `shortcuts.test.ts` (RED: rows lack digits): the exact-rows expectation gets the
new Tools rows; "Tools: each key selects that tool" covers digits through `hoverKeys`; the "every
key is listed" test adds the ten digits to the tool keys. `src/main/model/menu-model.test.ts` (or
the menu model test file) unchanged and passing (R28: no new item). E2E `e2e/app-files.spec.ts`:
a structural drawing saved then reopened keeps `formula: 'structural'` and its file has
`"schemaVersion": 2`; a skeletal one is written with `"schemaVersion": 1`; File > New after a
structural drawing gives a skeletal one. Shot `e2e/shots/N10.shot.ts`: `N10/shortcuts-dialog.png`
(mock-up A12).

**Acceptance criteria:**
- [ ] shortcuts and menu tests pass; the dialog shows digit then letter
- [ ] files e2e passes (v1/v2, New skeletal); every e2e file ends with `blockedRequests === 0`
- [ ] `src/renderer/app/model` and `src/main/model` ≥ 90 % lines; shot compared with `out/mockups-shell/A12-shortcuts.png`

**Verification:** `npx vitest run --project unit src/renderer/app src/main`, `npm run test:e2e -- e2e/app-files.spec.ts`, `npm run shots -- N10`, then `npm run check`

**Dependencies:** N4 (keymap digits), N6 (`toggle-formula` to make a structural drawing in e2e; or `loadDocument`)

**Files:** `src/renderer/app/model/{shortcuts.ts,shortcuts.test.ts}`, `e2e/app-files.spec.ts`,
`e2e/shots/N10.shot.ts`

**Scope:** S. Cross-platform. Must not change: menu items and accelerators, A12's other sections.

## N11: docs and the named shots

**Description:** `AGENTS.md` module notes: editor (R50–R52, the formula switch, number keys),
doc-model (schema v2 and the lowest-version rule), svg-render (Decision 15, structural goldens
after N3), clipboard-export (R10 white bitmap, R11). `docs/editor-perf.md`: the structural perf
numbers from N2/N6. Collect the shots of N5, N7, N10 (and N3's golden sheet) and compare them with
the mock-up PNGs; write what was compared in the commit message. No product code.

**Tests first:** none (documentation task; disclosed exception to test-first).

**Acceptance criteria:**
- [ ] AGENTS.md and `docs/editor-perf.md` updated; nothing contradicts the specs
- [ ] every listed shot exists and was looked at against its mock-up

**Verification:** `npm run shots -- N5 N7 N10` (playwright args pass through), then `npm run check`

**Dependencies:** N1–N10 (N3 for the golden sheet part)

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

**Dependencies:** N1–N11 (including N3, so S1 must be answered)

**Files:** `docs/windows-checklist.md`, `SPEC.md`

**Scope:** M (machine time). Windows-only gates as named.
