# Spec: `editor`

Shared stack, commands, style and boundaries: see `SPEC.md`. Module map: `CAPABILITY-MAP.md`.
Depends on: `doc-model`, `chem-core`, `svg-render` (public `index.ts` entries only).
Status: **reviewed and approved 2026-11-10** (delegated reviewer, with the orchestrator's
decisions; see "Decisions"). The approved mock-ups in `docs/mockups/editor/` (iteration 2,
commit ae3eecd) are part of this spec (see "Normative sources"). **Amended 2026-11-12, approved by
the owner 2026-11-12 (tabs feature set, app-shell R30–R45):** host slots for the ☰ button and the tab
strip (R56), a per-tab state seam (R57, public surface approved by the owner 2026-11-12, revised after an independent
review: a read-only `snapshotState` and `tabStateMarkSaved`), a `replace-doc` command (R58,
approved by the owner 2026-11-12) and moved keys (R59: Tidy Ctrl+Shift+R; Zoom to 100% has no key, owner); not
implemented at that time. **Tabs seam (R56–R59): implemented in tasks TB3–TB7 (2026-11-12) and used by
app-shell's tab flows (TB17–TB20, 2026-11-12 to 2026-11-13); status as of 2026-11-14.** The built surface is
the one the rows list (`index.ts` exports `EditorTabState`, `EditorTabRecord`, `tabStateCanRedo`, `tabStateCanUndo`,
`tabStateDirty`, `tabStateDoc`, `tabStateMarkSaved`, `tabStateView`, `tabStateFromRecord`, `tabStateToRecord`; the
controller has `takeState`, `putState`, `snapshotState`, `newState`; the `view` event; the `replace-doc` command; the
`menu`, `tabs` and `tabPanelLabelledBy` props of `Editor`). As-built details the rows do not state: R56's slots are
the `has-menu` class on the top bar and a `tabs-slot` between the rail and the canvas with `has-tabs` on the root (the rail
spans both rows), the canvas sits in a `canvas-panel` with `role="tabpanel"`, and `--option-btn-compact` stays the
shell's (the host's CSS narrows `.editor.has-tabs .btn-opt` below 1100 px); R57's `putState` of a tab's own view before the
canvas is measured keeps its zoom and centre on the first measurement (`EditorState.viewPending`; a new or loaded
document still gets V2 then), and `putState` of a 100-atom tab to its first derived scene took 2.0–2.7 ms (TB5, node,
median; T11's switch budget is 100 ms). TB35 (the final automated gates) passed on 2026-11-14 at `5d6b268` and every
gate exited 0 (the numbers are in the `SPEC.md` Decisions Log, 2026-11-14); the owner's hand checks are open. Amended 2026-11-12 for the
owner's feature set: number keys for the tool rail (R50) and the structural formula switch (R51,
R52; its drawing was svg-render question S1, answered 2026-11-12 by svg-render Decision 16 and
R53 here: bonds twice as long, rings drawn as before). The mock-ups were updated in the same commit
(rail badges, the formula switch, its two icons, the `--formula-btn-w` token). Implemented 2026-11-12 (feature tasks N1-N14, `tasks/todo-features-2026-11.md`); The automated gates of the final checkpoint (N12) passed at `e34414b` on 2026-11-12; the owner's hand re-checks on the final installer (`docs/windows-checklist.md`) are open. The release is not declared.

Audience: a grade 11–12 chemistry teacher in Nepal (NEB curriculum) making slides and handouts on
a Windows laptop, often 1366×768, no network. Not a power user of drawing software. The test for
every choice below: *what would this teacher expect?* Fewer controls done well beat full coverage.

## Objective

The interactive canvas and every drawing tool. The teacher draws structures and reaction schemes
by clicking, dragging and typing; the canvas shows exactly what svg-render will export, with the
editor's own overlays (hover, selection, handles, warnings, guides, ghosts) on top. Every edit is
one doc-model transaction, so undo always works.

User stories served (`SPEC.md`): 1 (bonds, labels, ring templates; naphthalene by fusing two
benzenes, pyridine by setting one ring atom to N), 2 (name insert, arrows, conditions with
auto-subscript, Tidy reaction), 3 (curved arrows, lone pairs, radicals, charges, δ+/δ−), 4 (free
text only; see "Left out"), 5 (formula/MW of the selection, valence warnings). Stories 6 and 7
belong to `clipboard-export` and `app-shell`; the editor exposes the seam they use.

## Scope

**In:** the window chrome inside the renderer (top bar, tool rail, status bar), the canvas (pan,
zoom, mounting svg-render parts), overlays, hit-testing, selection and transforms, every tool and
gesture in "Behaviour rules", the name/SMILES/reaction insert field, the label and text editors,
Clean up, Kekulé ⇄ circle, Expand, Tidy reaction, preset switching, in-app copy/paste, undo/redo,
keyboard shortcuts, dirty state, the controller API for the host, a context-menu request on the
host seam.

**Out:** menus (including any right-click menu), file dialogs, save/open, recent files,
settings, window creation (`app-shell`); system clipboard formats, export, embedding
(`clipboard-export`); any chemistry decision (`chem-core`); how anything looks in the export
(`svg-render`); creation UI for captions (compound numbers), callouts, brackets, highlight
shapes, colours, atom numbers, isotopes and bold or wavy bonds. Objects and fields of those
kinds that arrive in a file are drawn, hit-tested, selected, moved, rotated, flipped, copied and
deleted like any other item; they are not edited.

## Normative sources

| Source | Status |
|---|---|
| `docs/mockups/editor/tokens.css` | **Normative.** Every colour, size, alpha, font, radius, shadow and motion value. Lifted byte-for-byte into `src/renderer/editor/view/tokens.css` (a tooling test compares the two after the header comment). This spec names tokens; it does not repeat their values |
| `docs/mockups/editor/icons.svg` | **Normative.** Every icon, one `<symbol>` per id. Lifted byte-for-byte into `src/renderer/editor/view/icons.svg` (same tooling test) and injected once, hidden, as an inline sprite at the editor root (`?raw` import), so `<use href="#id">` is a same-document reference (Chromium blocks external sprite references on `file://`, which is how the packaged app loads) |
| `docs/mockups/editor/NN-*.html`, `mockup.css` | **Normative for layout and appearance** (screens 01–11 at 1280×800, 11 at 960×640). `mockup.css` is the reference for region and control CSS; the implementation's `editor.css` follows it with the `.is-hover`/`.is-pressed`/`.is-focus` stand-ins dropped |
| `docs/mockups/editor/DEVIATIONS.md` | History of how the mock-ups departed from the draft; folded into this spec |
| This spec | Behaviour, structure and anything the mock-ups do not show. Where a mock-up and this spec disagree on appearance, the mock-up wins, except the item in "Decisions" row 14 (status-bar formula uses `<sub>`); R12's zoom-readout exception is superseded by R49 (the mock-up's "Zoom to 100%" wins) |

Reference PNGs of the mock-ups: `node docs/mockups/editor/build.mjs --png out/mockups` (needs
Playwright's Chromium).

## Facts relied on

Verified against the code on 2026-11-10.

| Fact (source) | Consequence |
|---|---|
| doc-model exports `addAtom → [Doc, AtomId]`, `addBond(doc, a1, a2, init?) → [Doc, BondId]` (throws `self-bond`, `duplicate-bond`), `updateAtom`, `updateBond` (patch cannot touch `a1`/`a2`), `addObject → [Doc, ObjectId]`, `updateObject`, `deleteItems`, `mergeAtoms(doc, keep, drop)`, `transformItems(doc, sel, m)`, `insert(doc, sub, at) → [Doc, Selection]`, `extract(doc, sel) → SubDoc`, `everything`, `fragments`, `neighbors`, `findBond`, `resolveAnchor`, `bounds` (geometric BLU, no ink), `paintLayers`, `translation`, `rotation(rad, center?)`, `scaling(sx, sy?, center?)`, `checkInvariants`, `emptyDoc(now)` (`index.ts`) | Every edit is a recipe of these ops inside one `transact`; recipes thread the returned doc and capture ids from the tuples |
| `transact(h, label, recipe, { coalesceKey })`; the recipe gets a draft; errors propagate and leave `h` unchanged; a recipe that changes nothing records no step; a transact with a different (or no) key closes the open coalesce run; `undo`/`redo` clear it (`history.ts`) | One gesture = one `transact`; nudges coalesce; failures are caught by the store |
| Undo restores `nextId`; ids may be reissued (`SPEC-doc-model.md`) | Selection, hover, editors and gestures are cleared on undo/redo |
| A bond's `a1`/`a2` are immutable; the wedge narrow end is `a1`. `deleteItems` turns curved-arrow/callout anchors on a deleted bond into point anchors | Reversing a wedge = delete + add reversed + re-anchor the curved arrows that pointed at the old bond, in one recipe (rule B5) |
| No doc-model op sets `doc.style`, creates a group or reorders `zOrder` | `setStyle` is a required change; groups and z-order get no UI |
| `insert` lands the sub-doc's origin at `at`; `SubDoc`s (from `extract`, `parseSmiles`, `structureFromText`) are centred on the origin | Templates, name inserts and pastes are `SubDoc`s placed by their centre |
| svg-render: `render(doc, { perception })` → `Scene { parts, bounds, extents, style, notices }` in pt; `ItemKey` = `atom:`/`bond:`/`obj:`/`ring:` + id(s); a bare skeleton vertex has no `extents` entry; `toSvg`, `renderSvg`; `bluToPt(p, style)` / `ptToBlu(p, style)` multiply/divide by `style.ptPerBlu` (= `style.bondLength` when skeletal, twice it when structural: svg-render Decision 16, R53); `resolveStyle(doc.style)`; `STYLE_PRESETS` (slides: bond 40 pt, font 24; journal: bond 14.4 pt, font 10); no memoising renderer (cut for v1). Text `at`: `align` places lines relative to `at.x`, the first line's cap-height box is centred on `at.y`; `attachedTo` is ignored; sub/sup at `subScale` 0.7, shifted `subShift` 0.2·fs / `supShift` 0.4·fs | Canvas mounts keyed parts and patches changed ones; condition placement reads `extents`; the WYSIWYG editor copies these text metrics |
| svg-render's measured glyph table covers Latin, Greek, `→` (U+2192), `°`, `−`; not `⇌` (U+21CC) | Text formatting turns `->` into `→` but never produces `⇌` (it would be unmeasured and Arial has no glyph) |
| chem-core: `createPerceiver(): (doc) => Perception` memoises per fragment; `Perception.atoms[id].valence`, `.bonds[id].aromatic`, `.fragments[i].formula`, `.warnings: ChemWarning[]` (`code`, `atoms`, `bonds`, `message`) | One perceiver per controller; warnings drive the warning overlay; "Show circle" uses `bonds[id].aromatic` |
| `interpretLabel(text)` → `{ kind: 'element', element, hCount?, charge? }` / `{ kind: 'abbreviation', key, element }` / `{ kind: 'unknown' }` | Label editor commits through it (rule L3) |
| `structureFromText(text, names)` → `Result<{ sub, source, entry? }, ChemError>`; failure codes `empty`, `not-found` (with `suggestions: string[]` from `NameIndex.closest`), `too-large`, `invalid-smiles`, `invalid-molfile`. `NameIndex.suggest(prefix, limit)` (exact, then display-name, then synonym prefix matches, shorter first), `closest(query, limit)`; `createNameIndex(json)`; `CompoundEntry { name, synonyms, smiles, formula (Hill), mw }` | Name field: suggestions while typing, insert on Enter, "Did you mean" on failure |
| `closest('ethanl')` returns acetaldehyde, ethane, ethanol: all three are edit distance 1 (`ethanal` is acetaldehyde's synonym) and ties sort by name (`names.ts`) | Closest-first order needs a chem-core change (required change 2) |
| `cleanStructure(doc, atoms)`, `kekulize(doc, atoms?)` (throws `ChemError('cannot-kekulize')`, changes nothing), `aromatize(doc, atoms?)` (idempotent; leaves rings it cannot read back unchanged), `expandLabel(doc, atom)` (throws `unknown-label`), `formulaOf(doc, atoms)` → `Formula { counts, charge, hill, text, mw, exactMass }` covering **every whole fragment touched** (SPEC.md decision); `Formula.text` carries the charge as Unicode superscripts | Selection actions; the status-bar formula is built from `hill` + `charge` with real `<sub>`/`<sup>`, and a one-atom selection shows its whole fragment's formula |
| `package.json`: React 19.3.1, react-dom 19.3.1 (incl. `react-dom/server`), Immer, Zod, fast-check, Playwright 1.65; **no Zustand, no jsdom, no Testing Library**; Vitest `environment: 'node'`; coverage includes `src/renderer/**/*.{ts,tsx}` | No new dependency: a small store on `useSyncExternalStore`; logic tested in node; view components rendered with `react-dom/server` in node for markup tests; DOM behaviour in Playwright e2e |
| Scaffold: `src/main/index.ts` window 1280×800, min 800×500, no `Menu` call (Electron's default menu binds Ctrl+0/Ctrl+−/Ctrl+= to page zoom); CSP allows inline styles and `data:` images, no inline scripts; `App.tsx` renders a 40 px toolbar and `canvas-area` | Required scaffold changes; custom cursors use `data:` SVG |
| `resources/compounds/compounds.json`: 406 entries incl. ethanol, water, benzene, toluene, acetic acid, ethyl acetate, `h2o` | Imported as a JSON module by the editor and indexed once |
| ESLint: the renderer block sets `no-restricted-imports` with only the `openchemlib` path; a later block that sets the rule for the same files replaces it | The new renderer boundary rule repeats the `openchemlib` restriction |

## Decisions

Binding until a spec change. Rows 1–16 are the orchestrator's; R-rows are the reviewer's
resolutions of the draft's open questions and of problems found in review.

| # | Decision | Reason | Date |
|---|---|---|---|
| 1 | Bond options: Single, Double, Triple, Wedge, Hash. No Wavy | Wavy bonds are rare at grade 11–12; one fewer control | 2026-11-10 |
| 2 | Ring options, in order: Benzene, Cyclohexane, Cyclopentane, Cyclobutane, Cyclopropane. No cycloheptane, no chair | Commonest first; the chair is better drawn in a dedicated tool later than as a fixed template | 2026-11-10 |
| 3 | Arrow options: Reaction, Equilibrium, Resonance, No reaction. No retrosynthesis | Retrosynthesis is beyond the syllabus. Files with retro arrows still render | 2026-11-10 |
| 4 | Preset switch labels "Slides" / "Handout" (Handout = svg-render's `journal` preset) | "Journal" means nothing to a teacher; a handout is what they print | 2026-11-10 |
| 5 | At launch: Bond (single) is the active tool, canvas focused | The first click draws, as in screen 01 | 2026-11-10 |
| 6 | Select: a click on an atom or bond selects its whole fragment; a second click (press and release without a drag) on an atom or bond of an already fully selected fragment narrows the selection to that atom or bond (PowerPoint group model). Alt+click selects one atom or bond directly. A drag always moves the current selection | A teacher clicking a molecule wants to move it; the second click reaches the parts, as in PowerPoint groups | 2026-11-10 |
| 7 | Tool rail 64 px wide, buttons 56×48 with one-word captions under the icons (Select, Erase, Bond, Chain, Ring, Atom, Arrow, Plus, Curly, Text); sizes as in the mock-ups | The rail explains itself without tooltips | 2026-11-10 |
| 8 | Default zoom 150 % for Slides; Handout keeps the same on-screen bond length (rule V2). After a name insert or Tidy reaction, if the drawing's ink box no longer fits the viewport with a 48 px margin, zoom out to fit; never zoom in automatically, never above the default (name inserts: see V7 and R22) | Bonds of 80 px are comfortable to click; the drawing never runs off screen | 2026-11-10 |
| 9 | Select options bar: Clean up, Show Kekulé / Show circle (icon + label, `min-width` of the longer label so the bar never jumps), Tidy reaction, divider, Flip horizontal, Flip vertical. "Number" is cut (rule C4 removed). "Expand" is rendered only when the selection contains an abbreviation | Screens 03 / 03b; compound numbers can be typed as text | 2026-11-10 |
| 10 | Text and label editing is WYSIWYG, no markup ever shown: real sub/superscripts while editing; x₂ / x² toggle sub/sup on the selection; B / I toggle the object; auto-formatting (formula subscripts, `->` to →, trailing charge) applied on commit to characters the user did not format explicitly; `^` / `_` typed shortcuts honoured on commit; re-opening shows the text formatted. Implementation: a `contenteditable` element that is a projection of a pure editing model (rule T2) | Teachers know Word, not markup; the model-first design keeps every rule pure and testable | 2026-11-10 |
| 11 | Name suggestions are ordered closest match first ("ethanl" offers ethanol first). Fixed in chem-core (required change 2) | The intended word must be the first chip | 2026-11-10 |
| 12 | No right-click menu drawn by the editor. The editor emits a `context-menu` event (hit target + screen position) on its host seam; app-shell shows a native menu (Cut, Copy, Paste, Duplicate, Delete) | Native menus look right on Windows and belong to app-shell | 2026-11-10 |
| 13 | Empty-state sentence: "Type a compound name above, or click anywhere to start drawing." | Bond is active at launch, so any click draws | 2026-11-10 |
| 14 | Hover highlight alpha 0.45 (`--overlay-hover`), status hint 13 px (`--type-hint`). Status-bar and dropdown formulas use real `<sub>` digits at ≥ 10 px, not Unicode subscript characters | Unicode subscripts rendered at about 7 px | 2026-11-10 |
| 15 | Accepted draft defaults: bonds snap to 30°, arrows to 15°; reaction text like `A + B -> C` accepted in the name field; name-inserted structures placed automatically to the right of the drawing; minimum window 960×640; no jsdom (pure node unit tests plus Playwright e2e); switching preset keeps on-screen size; the orphan-carbon rule on erase; hover keys act on the hovered atom/bond before tool keys (L sets Cl, B sets Br on a hovered atom) | Draft open questions 2–5, 8, 9, 11, 13, 14 | 2026-11-10 |
| 16 | Approved changes outside the editor: doc-model gains an additive `setStyle` op (no schema bump; `SPEC-doc-model.md` updated first); `SPEC.md` drops Zustand for the hand-written store and corrects the Testing table; scaffold gets min size 960×640 and no default application menu; ESLint gains renderer import-boundary and DOM-free rules with tooling probes. No new dependencies | Needed by the editor; each is specified under "Required changes" | 2026-11-10 |
| R1 | Zoom range is 25–800 % (draft: 400 %) and the default zoom is the zoom at which a bond is 80 screen px: 150 % for Slides, 416.67 % for Handout (`150 × 40 / 14.4`) | Decision 8 puts the Handout default above 400 %; the old clamp made it impossible | 2026-11-10 |
| R2 | Double-click opens the label/text editor **only with the Select tool**. With drawing tools, Enter over a hovered atom opens the label editor; the Text tool edits a text with a single click | With Bond, a double-click on an atom is two sprout clicks; opening an editor as well would add two bonds | 2026-11-10 |
| R3 | Typing a letter that is not a hover key over a hovered atom does **not** open the label editor; it falls through to tool keys | Otherwise a resting pointer swallowed V, E, Z, R, A, M, T | 2026-11-10 |
| R4 | No modifier disables snapping (draft: Alt). Alt keeps one meaning in Select: pick one atom or bond | Alt+drag (pick one atom, move it, join it) and "Alt disables snapping" collided; snapping is a 6 px pull, easy to avoid | 2026-11-10 |
| R5 | Hovered atom + `1` / `2` / `3` sprouts a single / double / triple bond in the default direction (rule P1); hovered bond + `1` / `2` / `3` sets its order | Toluene in 3 actions (SPEC.md SC2): Ring, click, hover a ring atom + `1`. Same digit, same meaning ("this bond order here") | 2026-11-10 |
| R6 | Hover and tool keys match `KeyboardEvent.key` (letters case-insensitive); Ctrl, Alt and Meta must be up; Shift is ignored | `+` needs Shift on most layouts; the draft said "no modifier" | 2026-11-10 |
| R7 | Undo/Redo buttons and Ctrl+Z / Ctrl+Y act on the editing model while a label/text editor is open (local undo), and on the document otherwise; the Undo/Redo buttons are disabled while an editor is open | Undoing the document under an open editor would leave the editor pointing at changed or missing items | 2026-11-10 |
| R8 | Text editing edits `text` objects only. Captions, callouts, brackets, shapes and bracket corners are not editable (select, move, delete only). Captions are never created | Their creation UI is cut; editing without creation is half a feature | 2026-11-10 |
| R9 | Name-field suggestions appear only for a single name (no `+` and no arrow token outside brackets). Reaction text gets no dropdown until Enter; a part that is not found gets the not-found row and "Did you mean" chips that replace that part | One clear behaviour; replacing parts mid-typing is confusing | 2026-11-10 |
| R10 | Suggestion rows show the matched key with the typed prefix in 600 weight: the display name when it matches the prefix, else the first matching synonym followed by `--text-muted` " — " + display name (`ethanoic acid — acetic acid`) | Teachers search by IUPAC or common names; a row must show why it matched | 2026-11-10 |
| R11 | "Show circle" is offered when the scope has an aromatic bond (`Perception.bonds[id].aromatic`) that is not order 1.5 (draft: "a ring bond of order 2", which would offer it on cyclohexene) | Correct chemistry, read from chem-core | 2026-11-10 |
| R12 | **Superseded by R49 (2026-11-11).** The zoom readout button and Ctrl+1 reset to the default zoom (150 % Slides); aria-label "Reset zoom (Ctrl+1)" (mock-up: "Zoom to 100%") | Clicking "150%" and getting 100 % would surprise; the default is what the teacher knows | 2026-11-10 |
| R13 | Zoom to fit (button, Ctrl+0, load): the largest whole percent ≤ the default zoom that shows the ink box with a 48 px margin on every side (screen 08: 115 %) | Fitting a small molecule should not blow it up past the default | 2026-11-10 |
| R14 | Reaction-text arrow tokens: `->`, `→`, `=>` (forward), `<=>`, `⇌` (equilibrium) | Retrosynthesis is cut; `=>` is a likely typo for `->` | 2026-11-10 |
| R15 | View components are covered by markup tests in node with `react-dom/server` (`renderToStaticMarkup`), no jsdom | Coverage counts `view/*.tsx`; static markup proves states and ARIA without a new dependency | 2026-11-10 |
| R16 | Screenshots for review come from a Playwright-against-Electron harness: `npm run shots` writes `out/shots/<task-id>/<name>.png` at 1280×800 content size (960×640 where named), device scale 1 | The same viewport as the mock-up PNGs, so they can be compared side by side | 2026-11-10 |
| R17 | Rotate handle, arrow end handles and curved-arrow handles stay; scale handles, grid, rulers, group/z-order UI stay out | Rotating and re-aiming arrows are everyday edits; the rest is noise for this user | 2026-11-10 |
| R18 | Text size stays one `fontSize` per document (svg-render Decision 2); no schema bump | Titles belong in PowerPoint | 2026-11-10 |
| R19 | `createRenderer` is not requested now; it is requested (svg-render spec change first) only if the profiling task measures a budget miss with the drag fast path in place | Measure before asking | 2026-11-10 |
| R20 | An info notice (such as "Inserted ethanol") is plain `--text` with no icon; only warnings and errors carry the `warning` icon, in `--warning` | A warning triangle on a success message reads as a problem | 2026-11-10 |
| R21 | A name insert selects what it inserted and switches to Select, like pasting an object into PowerPoint; the name field keeps focus and is cleared. Applies to single names, chips and reaction text | The teacher can drag the new structure at once | 2026-11-10 |
| R22 | After a name or scheme insert the whole drawing is framed (V7): zoom `min(current, fit)` and the drawing's ink box centred. Supersedes Decision 8's reveal for inserts | The third molecule ended at the right edge with the left half of the canvas empty | 2026-11-10 |
| R23 | Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z act on the document while the name field is focused and empty; with text in it they are the field's text undo | After typing a name and Enter the field is empty and focused, and undoing the insert is the natural next key | 2026-11-10 |
| R24 | Shift is additive everywhere in Select: Shift+click on empty canvas keeps the selection (it no longer clears it); Shift+drag from empty canvas draws a marquee whose result is added to the selection; Shift+click on an item toggles it | One modifier, one meaning: a slipped Shift never throws a careful selection away | 2026-11-10 |
| R25 | Ctrl+V and Ctrl+D place the copy at the source's position + (1.0, 1.0) BLU; further pastes cascade by another (1.0, 1.0); a cut's first paste lands in place; an explicit point (context menu) centres the copy there (rule CB1) | A paste at the pointer usually landed on the original, as if nothing had happened | 2026-11-10 |
| R26 | P1 tie-break for a one-neighbour atom whose neighbour has no other neighbours: the candidate nearer horizontal, then more upward, then more rightward (draft: more upward first, which sprouted straight up from the end of a lone bond and drew a bent chain, not the propane zig-zag) | Propane by two clicks must be the textbook zig-zag (E19) | 2026-11-10 |
| R27 | A hovered labelled atom gets a box around its label's ink (2 px padding, radius 4) at alpha 0.25 (`--overlay-hover-label`), not the 0.45 box, and no hover ghost (HV4). Skeleton atoms keep the Ø 18 circle at 0.45, bonds the 8 px band at 0.45 | The heavy box hid the letters and the ghost bond ran through the H of "OH" | 2026-11-10 |
| R28 | Chain and Ring corrections (E21): P2 counts one bond per cos 30 BLU, so a 4 BLU drag is 5 bonds; P4 with one neighbour points the ring straight away from it (mock-up 04), not along P1; P5 gives a pointer within 4 px of the bond line no choice of side, so a click on a ring bond fuses outside it; templates are vertex lists, not SubDocs | The first draft of each rule contradicted its own mock-up or example (a ring bond along the existing bond; a click inside the ring it fuses to) | 2026-11-10 |
| R29 | Atom tool (E22): a mark clicked on empty canvas gives its info notice through the tool step (`ToolStep.notice`), not a document change; lone pairs store 0 explicitly after 4 (the cycle returns to 0); radical toggles 0 and 1 (a stored 2 becomes 0) | The tool machine must be able to tell the user why nothing happened; the cycle needs a defined end | 2026-11-10 |
| R30 | Empty state hides while something is drawn (E22 fix): it shows only when the document is empty AND no gesture runs AND no preview exists. Amended 2026-11-10: while the document is empty there is NO hover ghost for any tool, so moving the pointer never hides the block or its chips; it stays until a gesture starts (a pointer press on the canvas) or the document becomes non-empty, and returns after Esc cancels that first gesture or after undo empties the document. Once the document has an item, hover ghosts behave as before | The first bond's ghost drew over the art and the sentence; the rule is the function `emptyStateVisible(doc, gesture, preview)` | 2026-11-10 |
| R31 | Chain count badge shows carbon atoms including the start atom (`bonds + 1`: pentane reads 5; three bonds from an existing atom read 4), as a tooltip-style badge with the same colour tokens, kept inside the canvas | A teacher counts carbons, not bonds; the tiny tinted digit was unreadable | 2026-11-10 |
| R32 | With the Select tool, a hovered item that is already selected shows no hover highlight (HV5); the cursor, hover keys and tooltips are unchanged | A selected label atom under the pointer stacked the selection and hover tints into a heavy blue box | 2026-11-10 |
| R33 | Default curved-arrow bend (E25 fix): apex height `max(0.2 × chord, 0.45 BLU)`, `\|bend\| = 2h / chord` (chord 0.5 BLU: 1.8; 1.0: 0.9; 3.0: 0.4); side = apex farther from the nearest atom that is not an anchor's own, ties under 0.1 BLU keep the away-from-centroid side. Stored documents and the bend handle are unchanged | A 0.4 bend over a bond-to-own-atom chord (0.5 BLU) was a 5 px bump lying on the bond with its head stuck to it | 2026-11-10 |
| R34 | `finishText` reads a trailing `+` / `-` after a digit run as a charge (T4 step 3): `Fe2+` → Fe²⁺, `NH4+` → NH₄⁺, `SO42-` → SO₄²⁻ | Teachers type `NH4+` and `Fe2+` constantly; the E26 rule left them flat | 2026-11-10 |
| R35 | Text editor (E27): the Text tool opens the box on release, not on press (the press would give focus back to the canvas and close it); the box stands on the object's `at` by its `align` (left edge, centre or right edge, first line centred on `at.y`) and its lines align the same way; Insert buttons add plain non-explicit text; a paste or drop takes the clipboard's `text/plain` only (a `plaintext-only` box otherwise turns rich HTML into its own text); the empty state is hidden while an editor is open | A press-opened box lost focus at once; a left-aligned text drew centred lines in the box; rich clipboard HTML pasted with wrong line breaks; the chips sat behind a new box | 2026-11-10 |
| R36 | Conditions and Tidy (E28): "above" is screen-up for a horizontal arrow whichever way it points, else the left of its travel direction (T3); a tilted arrow's ink reaches half the thickness of the same arrow lying flat beyond its shaft; a new condition is placed by the content it is committed with (and again when edited, resized or rotated), a nominal one-line `H` stands in for the slot box and the editor; the Text tool shows a slot for the pointer's side within 1.0 BLU of a shaft, after texts; Tidy attaches a free text to a slot only if the slot is free and sets `align` to `center`; changes under 1e-9 BLU are noise, so a tidied document plans nothing and a second Tidy records no step; Ctrl+Shift+T (Ctrl+Shift+R since R59, 2026-11-12) runs whenever the editor is idle and says "Nothing to tidy" when no arrow is in scope (the Tidy button stays disabled without any arrow) | The rules left these open; each is what makes T3 and TR6 exact and idempotent | 2026-11-10 |
| R37 | Short curly arrows (E25 follow-up; svg-render Decision 13 draws `\|bend\| > 0.5` as a cubic whose ends are square to the chord): when either anchor is an atom drawn with a label, the default apex height is at least `0.9 − 0.5 × chord` BLU (chord 0.5: 0.65, bend 2.6; from chord 0.9 on R33 alone decides, so chord ≥ 0.9 arrows are unchanged). Hit-testing (H1), the hover band and the bend handle use svg-render's `curveControls`, so they follow the drawn curve | At bend 1.8 the label's clearance (≈ 0.3 BLU) ate the return leg and the head sat beside the O pointing away from it; with 0.65 the arc leaves the bond sideways and the head arrives at the label edge pointing at it (head within 20° of the label centre, visible arc ≥ 5 head lengths in both presets) | 2026-11-10 |
| R38 | The viewport follows the document's preset whenever a change alters the style's bond length: the preset switch, undo and redo all call `switchPreset(viewport, old, new)` (zoom × old / new bond length, drawing centre kept). The viewport is still not part of history; `load` keeps its own default-zoom rule. Replaces "the zoom stays" in PR1 | Undoing a Handout switch left the Slides style at the Handout zoom, so the drawing looked 2.8 times too big | 2026-11-10 |
| R39 | A structure inserted through the name field (single names, chips, reaction parts; N2, N3) with exactly two atoms and one bond is rotated about its centre so the bond is horizontal, first atom on the left; done in the editor's insert path, not in chem-core | `2 H2 + O2 -> 2 H2O` drew H-H and O=O at the zig-zag angle, wrong beside "H₂O" | 2026-11-10 |
| R40 | E32 measured every performance budget with room to spare on the development machine (worst e2e p95 3.5 ms against 16 ms), so the drag fast path and the keyed patch are enough and `createRenderer` is not requested (R19 stays as the rule for a future miss). A frame sample is script + forced style and layout on the main thread, one event per frame; raster and vsync are not in it | Measure before asking; the owner's laptop run is on the Windows checklist | 2026-11-10 |
| R41 | The preset segments are 64×24 (`--preset-seg-h: 24px`), centred in the 28 px status bar: the group is 24 + 2 × 1 px padding + 2 × 1 px outline = 28 px, so its outline lies inside the bar | The mock-up's 64×20 was 4 px under the 24 px hit target of Accessibility; the status-bar controls now all meet it (zoom buttons and the warnings button are 24 high already) | 2026-11-10 |
| R42 | `--border-control` is `#79818c` (was `#7a828e`, 2.96 : 1 on `--pressed-bg`): 3.64 on `--chrome-bg`, 3.94 on `--canvas-bg`, 3.30 on `--hover-bg`, 3.00 on `--pressed-bg`. The contrast table now lists hover and pressed; the test asserts all four | A control border must reach 3 : 1 on every background the control can have, including while pressed. The darkest step that does it keeps the field and chip borders from looking heavier | 2026-11-10 |
| R43 | The UI font stack keeps Segoe UI first, then Arial and Liberation Sans before system-ui | Linux without Segoe UI used wider DejaVu Sans, breaking the 109 px Kekulé toggle and shifting its neighbours; the Arial-compatible fallback preserves the approved control boxes without bundling fonts. The Kekulé toggle has fixed 109 px width, 4 px left and right padding and 4 px icon gap, retaining 32 px height and 2 px neighbour gaps | 2026-11-10 |
| R44 | Host actions slot after Redo (clipboard-export O1): optional `actions?: React.ReactNode`, last top-bar child in `topbar-actions`, with `has-actions` only when supplied; host supplies `--namefield-compact` | Keeps host controls after history in layout and tab order; preserves the editor without a host | 2026-11-10 |
| R45 | Host notices and a busy event (clipboard-export): notify dispatches notice-show; busy fires exactly when idle = canRun({type: 'set-preset'}) changes | Host feedback uses the same hint, expiry and announcement slot | 2026-11-10 |
| R46 | Right-click on an unselected item selects it first (app-shell CM1): whole fragment for an atom/bond, object itself, tool Select before emitting; selected hits and empty canvas retain selection | Native menu acts on the item clicked | 2026-11-10 |
| R47 | Host-callable name-field focus: canRun unless a label/text editor is open; run increments a focus request counter observed by the view; Ctrl+F uses the same path | Host and view share focus behavior | 2026-11-10 |
| R48 | IME: a blur during a composition defers the commit to `compositionend`, after the DOM is reconciled into the model (T2 "Model first"). Internal to the view; no public surface or schema change. The host (app-shell F4a) uses only the public `canRun('focus-name-field')` and `subscribe` to wait for the box to close | The model never holds the composing text: committing it at blur would lose or stale the word being typed | 2026-11-11 |
| R49 | Supersedes R12. `zoom-reset` sets zoom 1 (100 % = true size, 1 pt = 4/3 CSS px) about the canvas centre, whatever the preset, and is the same command from the status-bar readout, Ctrl+1 and app-shell's View > "Zoom to &100%" (A06); the readout's aria-label and tooltip read "Zoom to 100% (Ctrl+1)" / "Zoom to 100%" with key Ctrl+1 (**amended by R59, 2026-11-12: no key; aria-label "Zoom to 100%"; app-shell R46**). The default zoom of a new or loaded document (V2: 150 % Slides, 416.67 % Handout), fit (V3, R13), reveal, frame, the 25–800 % range and every performance budget are unchanged; only an explicit reset changes | The approved app menu and shortcuts list (A06, A12) say "Zoom to 100%"; one command must do what all three places say. R12's 150 % would make the menu item lie | 2026-11-11 |
| R50 | **Number keys for the tool rail** (owner's request 2026-11-12, "Tools unless hovering"; feature F1). The ten rail tools get the plain digits `1`…`9`, `0` in rail order: Select 1, Erase 2, Bond 3, Chain 4, Ring 5, Atom 6, Arrow 7, Plus 8, Curved arrow 9, Text 0. A digit picks its tool under exactly the conditions of the tool's letter key (K2: canvas focused, no label or text editor open, no Ctrl/Alt/Meta, Shift ignored, `KeyboardEvent.key`, so the number row and the number pad with Num Lock both work; on a layout whose number row gives symbols unshifted (French AZERTY: `&é"'(-è_çà`) a digit is reached with Shift, which is ignored, and the unshifted symbol does nothing: there is no `KeyboardEvent.code` fallback (it would act on a character the user did not type; task N5b tests it); not repeated while held; a gesture is cancelled as for a letter, G3; HV3 refresh). **Exception:** while an atom or bond is hovered **and hover keys are active** (every tool except Erase and Text, K2), `1`, `2`, `3` keep R5 (sprout / set order); `4`…`9`, `0` pick tools there too. With Erase or Text, and over objects or empty canvas, every digit picks its tool. The letter keys stay; Ctrl+1 / Ctrl+0 (zoom) are unchanged (they need Ctrl, K2 needs Ctrl up) (2026-11-12, R59: Ctrl+1 is the host's tab key now; zoom to 100% has no key). **UI decisions (W9, for the owner):** U1 each rail button shows its digit as a badge, top-right (2 px from the top, 4 px from the right edge), `--type-caption` with the caption's colours (`--text-muted`, `--text` on hover and pressed, `--active-fg` when selected), so no new colour pair and the 56×48 target and icon box are unchanged; U2 the button's accessible name is the tool name alone ("Bond"), both keys are in `aria-keyshortcuts="3 B"` (digit first; the plus key is written `Plus`), the badge and caption are `aria-hidden`, so each key is announced once; the tooltip shows the title and two key chips, digit first (**Bond** `3` `B`); U3 the 1–3 exception follows K2's hover-key rule exactly (so under Erase and Text a digit over an atom picks a tool) | The owner: "a numbered display for the left tool bar so navigation is easy through the number keys in the keyboard". R5's digits are the toluene-in-3-actions path (SC2), so they win where they already act; one rule (K2's) decides both | 2026-11-12 |
| R51 | **Structural formula switch** (owner's request 2026-11-12, "Same shape, carbons written"; feature F2). One action button in the Select options bar, right after Show Kekulé / Show circle, built like it (action primitive, icon + label, fixed width so the bar never jumps): "Show structural" (icon `show-structural`) while the drawing is skeletal, "Show skeletal" (icon `show-skeletal`) while it is structural. It always acts on the **whole document** (selection ignored): one commit `setStyle(doc, { formula })`, labelled "Show structural formula" / "Show skeletal formula", one undo step; atoms, bonds and coordinates are untouched, so undo or switching back gives the skeletal drawing exactly. It travels with the file, the clipboard drawing and every export (doc-model D1; clipboard-export R11). **UI decisions (W9):** U5 labels, icons and place as above, `aria-label` "Show structural formula" / "Show skeletal formula" (contains the visible label), width `--formula-btn-w` (124 px: "Show structural" is 89.6 px in Arial 13 px, 88.7 px in Segoe UI); U6 "Show structural" is disabled on an empty document (tooltip help "Draw a molecule first."), "Show skeletal" is always enabled; tooltip help "Writes every carbon with its hydrogens (CH3, CH2, CH) in the whole drawing." (superseded by R53 U15) / "Draws carbons as corners and line ends again, in the whole drawing."; U8 below 1100 px content width the switch is icon-only (32×32, name and tooltip unchanged): with the full label the Select bar plus Expand is 613 px against 563 px available at 960 px beside the Copy button (shell A15c); U9 no menu entry (app-shell leaves the options-bar actions Clean up, Kekulé, Tidy and Flip out of the menus on purpose); U10 new drawings are skeletal (not remembered like the preset). **Proposed, not decided (U7, orchestrator):** the key Ctrl+Shift+F (free in K1, the host's K1 and K3; Clean up, Kekulé and Tidy have Ctrl+Shift keys, Flip and Expand none); until approved there is no key, no K1 row and no shortcuts-list row | The owner asked for "an option like the 'Show circle' for the benzene rings on the top"; a document property, not a rewrite of atoms, so switching back is exact and a pasted picture shows what the canvas shows | 2026-11-12 |
| R52 | **Editor consequences of structural mode** (F2). The canvas mounts svg-render's parts, so it shows whatever svg-render draws (its layout waits for svg-render question S1). Every rule below already keys on "labelled atom" (an `atom:` extents entry), so in structural mode it applies to every carbon: hit-testing (H1: extents grown 4 px), hover (R27 light box), selection halos, valence-warning boxes, the curved-arrow default bend (R37, `isLabelled(atom, n, doc.style.formula)`), and **HV4: no hover ghost over a carbon** (the click still sprouts; U12, W9: kept as the rule says, because the ghost bond would cross the `H3`). Ghosts and previews render the preview doc with the same setting (a neighbour's label in a preview may change, e.g. `CH3` → `CH2`, and is shown at full opacity: it is what the commit gives). **U11 (W9):** the label editor on a structural carbon with no `label` opens filled with the text it shows (`CH3`), so committing it unchanged makes no change and no undo step (L3: the typed H count equals the automatic one). Unchanged: the empty-state rules (R30), name insert (N2, N3, P7), Tidy (TR1–TR6 use ink boxes, so a structural scheme is spaced by its wider labels), Clean up, Kekulé (C3), the formula and weight (C5), the preset switch, the performance budgets (a miss is a `createRenderer` request, never a looser budget) | Nothing new to decide in the editor beyond what svg-render draws; the existing "labelled atom" rules were made for exactly this case | 2026-11-12 |
| R53 | **Structural mode on the canvas** (2026-11-12; svg-render Decision 16 answers S1: the owner chose "B", ordinary labels with bonds twice as long, and "Rings can stay how they are"). **What you see is what is copied:** the canvas mounts svg-render's parts, so a structural drawing is shown twice as large in coordinates (bonds, rings, arrows, gaps between molecules), with labels, line widths and other decorations at their skeletal size; ring carbons are drawn exactly as in skeletal mode (no letters). **Units:** every conversion between BLU and pt or screen px uses `scene.style.ptPerBlu` (or `resolveStyle(doc.style).ptPerBlu`), never `bondLength`: `bluToScreen`, `screenToBlu`, ink boxes to BLU (Tidy, placement P7/N3, frame, `selectionInk`, flip centre, plus snapping, handles, overlays, warnings, move, select handles, conditions, scheme text). Model coordinates and every distance stored or given in BLU stay in BLU, so they double on screen and in pictures with the drawing: G4's 1.0 BLU bond, the 30°/15° angle snaps, P6's 0.15 BLU merge, H3's 0.3 BLU, P1–P5, P7's 1.0 BLU and N3's 1.5 BLU, TR1's band, TR3's 2.5 BLU and TR5's 0.6/0.4 BLU, CB1's (+1.0, +1.0) paste and duplicate shift. Every distance given in screen px stays in px (H1's 10/6/4 px, the 4 px drag threshold, S3's 6 px snap, the chain badge's 14 px offset, FIT_MARGIN 48, PAN_KEEP 64). Every distance given in pt of the style stays (T3's condition gap `0.2 × bondLength` pt is the style's: as in skeletal mode). **Behaviour in structural mode** (nothing new to build beyond the units and the ring flag): drawing tools work in BLU, so a chain drag needs twice the screen distance per bond and every ghost (rendered with the document's setting) is twice as long as in skeletal mode; HV4 suppresses the hover ghost over written carbons only, ring carbons are skeleton vertices and keep theirs (so toluene in 3 actions works as today); hit-testing finds a written carbon by its label extents (H1) and a ring carbon within 10 px of its vertex; R37's default bend uses `isLabelled(atom, n, formula, ringAtoms(doc).has(atom.id))`; Tidy measures ink in BLU through `ptPerBlu`, so a structural scheme is spaced by its structural ink and a tidy keeps its coordinates when the formula is switched (svg-render open question S2 on condition texts); the name insert, paste and duplicate place in BLU and then frame or reveal as today. U11 applies to written carbons only: the label editor on a ring carbon without a label opens filled with `C`, as in skeletal mode (nothing new for ring atoms). **UI decisions (W12, for the owner):** **U13** switching the formula (and undo or redo of a switch) keeps the zoom and keeps the centre of the drawing's ink box at the same screen point, so the drawing grows (or shrinks) about its centre; then V5 (reveal: pan if it fits, else zoom out to `min(fit, z₀)`, never in). Supersedes C7's last sentence ("follows R38 like a preset switch"): R38 would halve the zoom, keep the bonds at 80 px and shrink the labels on screen to half the size they have in the copy, which is not what the teacher chose; with U13 the labels keep their screen size and the bonds visibly double, as in the owner's picture B. Ethanol at the Slides default: bonds 80 px → 160 px, label text unchanged. **U14** viewport defaults keep using the style's `bondLength`: V2's `z₀ = 1.5 × 40 / bondLength` (150 % Slides, 416.67 % Handout) also for a structural document, so it opens with bonds of 160 px and labels at the usual screen size, fitted by V3 when it does not fit; V3's cap, V6 and R38 use `bondLength` (in structural mode their ratio equals the `ptPerBlu` ratio, the factor being 2 in both presets); R49's 100 % = true size holds. **U15** the switch's tooltip help becomes "Writes the carbons outside rings with their hydrogens (CH3, CH2, CH); bonds become twice as long." (replaces U6's "Writes every carbon with its hydrogens (CH3, CH2, CH) in the whole drawing.", which is no longer true for rings); "Show skeletal" keeps its help. Mock-up 10 updated | The owner's choice is a picture; the canvas must show the same picture the copy gives. Every editor rule is already in BLU, px or style pt; only the BLU ↔ pt factor changes, and it comes from svg-render, so the canvas, the hit-testing and the copy cannot disagree | 2026-11-12 |
| R54 | **Structural mode: where svg-render's S2 rule reaches the editor** (2026-11-12; svg-render Decision 16 (e), answered B). svg-render draws an atom anchor's `offset` (a lone-pair arrow's tail, a callout's anchor) and the offset of a condition text from its arrow's midpoint at the style's scale (`x bondLength`), not at `x ptPerBlu`, so in structural mode they are not at `x ptPerBlu` like every other coordinate. **Rule: on the canvas every item is hit, outlined and dragged where the renderer draws it; stored values stay in their own units** (the offsets stay BLU, unchanged by a switch of the formula). So: (1) wherever the editor turns an anchor into a screen point (hit-testing and outlines of curved arrows, selection handles and their drag, the curved-arrow bend) it uses `anchorBlu(doc, anchor, style)` = `resolveAnchor` with an atom anchor's `offset` divided by `r = ptPerBlu / bondLength` (r = 1 when skeletal: the same numbers bit for bit); (2) a move of a text attached to an arrow whose arrow does not move (drag, nudge) stores `r x` the pointer's BLU delta, so the text follows the pointer on screen (`moveItems`; r = 1: plain translation); a text that moves with its arrow, a flip or a rotation need nothing (offsets rotate and mirror alike at either scale); (3) T3 places a condition with `mid` at `ptPerBlu` and the offset at `bondLength` (`at = mid + (centre - now) / bondLength`), so the stored `at` is what svg-render draws as the 0.2 x bondLength gap. The editor never creates an atom anchor with an `offset` (curved arrows start at the label edge); only files and fixtures hold them | R53 said every BLU <-> pt conversion uses `ptPerBlu`; Decision 16 (e) makes two stored offsets the exception, and without this row the canvas would hit and drag them at half their drawn distance | 2026-11-12 |
| R55 | **Hint to tidy after a switch to structural** (orchestrator's UI decision **U16**, 2026-11-12). When a switch to structural succeeds (the `toggle-formula` commit, R51) and the Tidy reaction action is enabled for the document at that moment (it has a straight arrow, "Selection actions"), the editor shows the info notice "Press Tidy reaction to make room for the written carbons." in the status bar's hint slot, through the existing notice mechanism (info kind, plain `--text`, no icon, `role="status"` `aria-live="polite"`, replaced by the next notice, cleared by the next canvas action, Esc or after 8 s; "Notices and errors"). Shown for the switch to structural only: not on switching back to skeletal, not on undo or redo of a switch, not when Tidy is not enabled (no arrow), not when the switch does nothing (empty document, editor open, gesture running). The switch itself still moves nothing (R51): atoms, bonds and coordinates are untouched; the notice is the only consequence. Task N14 | Written carbons take room that the stored spacing did not allow for, so in a reaction scheme a plus sign can sit against a written `CH3` after the switch (seen in `out/shots/N7/select-bar-960-structural.png`); Tidy reaction spaces it by ink boxes (R52). The editor tells the teacher instead of moving things behind her back | 2026-11-12 |
| R56 | **Host slots for the ☰ button and the tab strip** (app-shell R31, R32, owner 2026-11-12). `Editor` gains two optional props like `actions` (R44): `menu?: React.ReactNode`, rendered as the first child of the top bar, before the name field (the name field then starts after it; sizes and gaps as mock-ups A19 and A01 updated); and `tabs?: React.ReactNode`, rendered at the top of the canvas column, right of the rail, between the top bar's border line and the canvas, full canvas-column width, its height set by the host's content (mock-up A18). Without them the layout is unchanged. The rail keeps its place and height (the strip is not above it), so the 960×640 rail rule is unaffected; the canvas loses the strip's height and its viewport size follows (V-rules unchanged). The canvas wrapper takes `role="tabpanel"` and an `aria-labelledby` the host passes when `tabs` is supplied (`tabPanelLabelledBy?: string`). K4 order: `menu` first, `tabs` after the rail and before the canvas | The owner placed the strip over the canvas it switches and the menu at the far left; the editor owns the layout, the host owns what is in the slots | 2026-11-12 |
| R57 | **Per-tab state seam** (app-shell R43; **public surface, approved by the owner 2026-11-12**; revised in the fix round). One controller serves every tab. New in `index.ts`: the opaque type `EditorTabState` (undo history, saved baseline, selection, viewport zoom and the BLU point at the canvas centre). On the controller: `takeState(): EditorTabState` for a tab switch (precondition: no label or text editor open, `canRun('focus-name-field')`; a gesture in progress is cancelled first, never committed); `putState(s: EditorTabState): void` (replaces history, saved, selection and viewport; keeps the canvas size and restores the state's zoom (app-shell SS1), putting the stored centre at the centre of the current canvas; clears hover, gesture, preview, editing and notice; keeps tool, variants, name-field text and the in-app clipboard; emits `doc`, `selection`, `history`, `dirty` as they change; resets the derive caches as `load` does); `snapshotState(): EditorTabState` (**read-only:** the committed state as it is, no precondition, no side effect: a gesture, a preview, an open label or text editor and an IME composition are left alone and are not in it; for app-shell's timer record and shutdown flush, SS4, SS10); `newState(doc: Doc): EditorTabState` (what `load(doc)` would make: new history, saved = doc, empty selection, V2 default view; touches nothing). Pure exports: `tabStateDoc(s)`, `tabStateDirty(s)`, `tabStateCanUndo(s)`, `tabStateCanRedo(s)` (app-shell T17's "no undo or redo step"), `tabStateView(s): { zoom; centre }` (for app-shell SS4's index), `tabStateMarkSaved(s, doc): EditorTabState` (the saved baseline becomes `doc`; for an inactive tab whose auto-save finished, app-shell AS3); `tabStateToRecord(s, { maxSteps }): EditorTabRecord` (JSON-serialisable: doc-model `HistoryRecord` (`SPEC-doc-model.md` D2: the drawing and the newest `maxSteps` undo steps; no redo steps) and nothing else: the view and the saved state are the host's, app-shell SS3) and `tabStateFromRecord(value: unknown, { clock, view, saved: 'current' \| 'unknown' }): Result<{ state; droppedSteps }, ParseError>` (strict shape; history through D2; `saved: 'unknown'` makes the state dirty until `markSaved` or `tabStateMarkSaved`, even if undo returns to the saved drawing; (2026-11-12, TB17) `view: null` (app-shell SS3: no stored view) gives V2's default view, fitted to the canvas when put, as `newState` does). `load` stays (it is `putState(newState(doc))`). `EditorEvent` gains `{ type: 'view' }`, emitted when the zoom or the pan changes (not on a canvas resize), so the host knows when to store the view. In a run the history keeps doc-model's 500 steps (app-shell R50) | Inactive tabs must not each keep a live editor (memory, start-up: E32, SC1); the history is doc-model's opaque type, so only the editor and doc-model may look inside; the store must read the active tab every 2 s while she draws and at shutdown during an IME composition (app-shell R25), which a state-changing `takeState` cannot do; an auto-save result may arrive after a switch and must mark the tab it was written for | 2026-11-12 |
| R58 | **`replace-doc` command** (app-shell AS7; **public surface, approved by the owner 2026-11-12**). `EditorCommand` gains `{ type: 'replace-doc'; doc: Doc; label: string }`: `canRun` when idle; one `transact` whose recipe returns `doc` (a whole replacement: coarse patches, correct undo; `nextId` comes from `doc`), labelled `label`; selection cleared; viewport kept; not marked saved (the host calls `markSaved`) | A file changed outside Chalkbond is shown without losing her version: one Ctrl+Z brings it back | 2026-11-12 |
| R59 | **Keys moved for the tabs** (app-shell R36, R46, owner 2026-11-12). K1: Tidy reaction is Ctrl+Shift+R (was Ctrl+Shift+T). Zoom to 100% has **no key** (app-shell R46, the owner's answer: Windows commonly swallows Ctrl+Shift+0 with two input languages installed); it was Ctrl+1. `globalCommand` returns `null` for Ctrl+1 … Ctrl+9, Ctrl+Shift+T, Ctrl+T, Ctrl+W, Ctrl+Tab and Ctrl+PageUp / PageDown (the host's, app-shell K1, K2) and binds nothing to Ctrl+Shift+0. Ctrl+Shift+R is free in K1, K2, K3, app-shell K1 and native text editing; nothing in Electron binds it with no application menu. Tooltips and labels follow: the Tidy action's key chip `Ctrl+Shift+R`; the zoom readout `aria-label` "Zoom to 100%" and its tooltip without a key chip (R49). Mock-ups 03 / 03b / 10 and the status-bar tooltip specimens need the new chips | The owner gave Ctrl+1 and Ctrl+Shift+T to the tabs (Chrome's keys) and chose no key for Zoom to 100% | 2026-11-12 |

---

## UI design

### Layout

(2026-11-12, R56: with a host, the top bar starts with the ☰ slot, `[☰] [⌕ Type a compound name…]`,
and the host's tab strip sits between the top bar and the canvas, right of the rail; mock-ups
A01 updated, A18, A21.)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [⌕ Type a compound name…     ] │ (tool options, contextual)             [↶] [↷] │ 48 px top bar
├────────┬─────────────────────────────────────────────────────────────────────────┤
│ Select │                                                                         │
│ Erase  │                                                                         │
│ ────── │                                                                         │
│ Bond   │                         canvas (white)                                  │
│ Chain  │                                                                         │
│ Ring   │                                                                         │
│ Atom   │                                                                         │
│ ────── │                                                                         │
│ Arrow  │                                                                         │
│ Plus   │                                                                         │
│ Curly  │                                                                         │
│ Text   │                                                                         │
├────────┴─────────────────────────────────────────────────────────────────────────┤
│ Click to add a bond…        C₂H₆O · 46.07 g/mol  ⚠ 1  [Slides|Handout]  − 150% + ⤢ │ 28 px
└──────────────────────────────────────────────────────────────────────────────────┘
  64 px rail
```

Sizes come from tokens (`--topbar-h`, `--rail-w`, `--statusbar-h`, `--rail-btn-w`,
`--rail-btn-h`, `--option-btn`, `--topbar-btn`, `--status-btn`); `mockup.css` is the reference.
The numbers below are what the e2e layout test measures at 1280×800 (and 960×640).

| Region | Measured box | Holds |
|---|---|---|
| Top bar | full width × 48 px, then a 1 px `--border` line; padding 0 12 | name field (x = 12, width `round(down, clamp(240px, 26vw, 360px), 1px)`, height 32); a 1×24 divider with 12 px either side; the options bar (flex, gap 2, scrolls horizontally with no visible scrollbar if ever too narrow); Undo and Redo (32×32, 4 px apart, 12 px left margin, 12 px from the right edge); then the host’s optional actions, 12 px after Redo, 8 px below 1100 px content width, when the name field becomes `--namefield-compact` (204 px, supplied by the host’s shell tokens). Actions end 12 px from the right edge; without actions the layout is unchanged |
| Tool rail | 64 px wide + 1 px `--border` line, between top bar and status bar | 10 buttons 56×48 at x = 4, first at y = 8, 2 px apart within a group; group separators 32×1 with 8 px above and below. At 960×640 the content (544 px) fits in the 562 px available; it would scroll vertically only below that |
| Tab strip (host slot `tabs`, R56; 2026-11-12) | the canvas column's width × the host content's height (A18), directly under the top bar's line, right of the rail | the host's tab strip; absent without a host |
| Canvas | the rest | white surface, overlays, empty state, editors |
| Status bar | full width × 28 px after a 1 px `--border` line; padding 0 12, gap 16 | left: hint or notice (flex, ellipsis); then formula (hidden below 1000 px window width), warnings button (only when there are warnings), preset switch, zoom cluster (−, readout 48 px, +, fit; 2 px apart) |

- Minimum window **960 × 640** (fits a 1366×768 laptop with the taskbar); set by the scaffold.
- No other boxes or panels. Resizing keeps the document point under the canvas centre fixed.

### Tool rail

| # | Group | Tool (`aria-label`) | Caption | Number key and badge (R50) | Key | Icon | Options bar |
|---|---|---|---|---|---|---|---|
| 1 | Pick | Select | Select | `1` | `V` | `select` | Selection actions |
| 2 | Pick | Erase | Erase | `2` | `E` | `erase` | empty |
| 3 | Structure | Bond | Bond | `3` | `B` | current bond option's icon | Single, Double, Triple, Wedge, Hash (`bond-*`) |
| 4 | Structure | Chain | Chain | `4` | `Z` | `chain` | empty |
| 5 | Structure | Ring | Ring | `5` | `R` | current ring's icon | Benzene, Cyclohexane, Cyclopentane, Cyclobutane, Cyclopropane (`ring-benzene`, `ring-6`, `ring-5`, `ring-4`, `ring-3`) |
| 6 | Structure | Atom | Atom | `6` | `L` | current element as text (`--type-rail`), or the mark's icon | C H N O S P F Cl Br I │ Positive charge, Negative charge, Lone pair, Radical (`mark-*`), δ+, δ− |
| 7 | Reaction | Arrow | Arrow | `7` | `A` | current arrow's icon | Reaction, Equilibrium, Resonance, No reaction (`arrow-forward`, `-equilibrium`, `-resonance`, `-nogo`) |
| 8 | Reaction | Plus | Plus | `8` | `+` | `plus` | empty |
| 9 | Reaction | Curved arrow | Curly | `9` | `M` | current head's icon | Electron pair, Single electron (`curved-full`, `curved-fishhook`) |
| 10 | Reaction | Text | Text | `0` | `T` | `text` | empty (text editing options while a text editor is open) |

Each rail button carries its number as a badge (R50, U1): `<span class="rail-key"
aria-hidden="true">` in the top-right corner, `top: var(--space-1)`, `right: var(--space-2)`,
`font: var(--type-caption)`, tabular digits, the caption's colour in every state (`--text-muted`,
`--text` on hover and pressed, `--active-fg` when selected), `pointer-events: none`. It changes
neither the 56×48 box nor the icon and caption positions. The button's `aria-label` is the tool
name alone and `aria-keyshortcuts` is `"<digit> <letter>"` (`"8 Plus"` for Plus), U2.

Element and δ buttons are text glyphs (`--type-md` 600); the others are 20 px icons.
Each option button's tooltip names it (`Chlorine`, `Cyclopentane`) with one help line where the
mock-up shows one ("Click an atom to make it Cl.").

**Selection actions** (Select active), left to right (screens 03, 03b):

| Control | Kind | Enabled when (else disabled with the tooltip help) | Does |
|---|---|---|---|
| Clean up | `clean-up` + label | the scope has a fragment with ≥ 2 atoms ("Draw a molecule first.") | rule C1 |
| Show Kekulé / Show circle | `show-kekule` / `show-circle` + label; `min-width` fits "Show Kekulé"; label left-aligned | scope has an order-1.5 bond → "Show Kekulé"; else an aromatic non-1.5 bond (R11) → "Show circle"; else disabled as "Show Kekulé" ("No benzene ring here.") | rule C3 |
| Show structural / Show skeletal (R51) | `show-structural` / `show-skeletal` + label; width `--formula-btn-w`; label left-aligned; `aria-label` "Show structural formula" / "Show skeletal formula"; icon-only (32×32) below 1100 px content width (U8); `data-testid="act-formula"` | the drawing is skeletal → "Show structural", disabled on an empty document ("Draw a molecule first."); structural → "Show skeletal", always enabled. Ignores the selection (whole document) | rule C7 |
| Tidy reaction | `tidy` + label | the document has a straight arrow ("Draw an arrow first.") | rules TR1–TR6 |
| divider | | | |
| Flip horizontal / Flip vertical | `flip-h` / `flip-v` icons | selection non-empty ("Select a molecule first.") | `transformItems` with `scaling(-1, 1, c)` / `scaling(1, -1, c)`, c = centre of the selection's ink box; one "Flip" commit |
| divider + Expand | `expand` + label; **rendered only** when the selection has an abbreviation atom | always enabled when shown | rule C2 |

"Scope" = the selection, or the whole document when nothing is selected.

**Text editing options** (replace the options bar while a text editor is open, screen 09):
Subscript (x₂), Superscript (x²), Bold (B), Italic (I), separator, muted caption "Insert", Δ, hν,
° (`glyph-degree`), → (`glyph-arrow`). x₂ / x² / B / I are toggle buttons (`aria-pressed` shows
the state at the caret or selection). The label editor does not change the options bar.

### Left out (deliberately not on screen)

| Left out | Why |
|---|---|
| Grid and rulers | Angle snapping, fixed bond length and Tidy reaction give alignment; a grid is noise on a slide |
| Hidden flyouts, press-and-hold menus | The active tool's options are always visible in the top bar |
| Editor-drawn context menu | Decision 12: app-shell may show a native one from the `context-menu` event |
| Scale handles | Bond length is the document's scale; stretching makes wrong bond lengths |
| Wavy, bold bonds; chair, cycloheptane; retro arrows; captions, callouts, brackets, highlight shapes, colours, atom numbers, isotopes, δδ± | Decisions 1–3, 9; rare at grade 11–12 basics. Present in a file → drawn, movable, deletable |
| Style panel (bond length, line width, font) | Two presets cover slides and handouts |
| Periodic-table picker | Ten common elements in the options bar; anything else is typed in the label editor |
| Group / ungroup, bring to front | No doc-model op; clicking an atom already selects the whole molecule |
| Template library beyond rings | Name insert covers 406 compounds |
| Layers, inspector, minimap, rotation readouts | Noise for this user |
| File, print, export, copy-as-image buttons | `app-shell` / `clipboard-export` |

### Visual language

All values live in `tokens.css` (normative). Summary:

- **Colour roles**: `--chrome-bg` (bars), `--canvas-bg` (canvas, fields, editors), `--border`
  (region lines), `--border-control` (field and chip borders), `--text`, `--text-muted` (hints,
  captions at rest, formulas, placeholders), `--text-disabled`, `--hover-bg`, `--pressed-bg`,
  `--accent` (focus, selection, active bar, canvas overlays), `--active-bg` / `--active-fg` /
  `--active-hover-bg` (selected tool and option), `--warning` / `--warning-bg`, tooltip colours,
  `--empty-art`.
- **Canvas overlay alphas** (group opacity, never per shape): `--overlay-hover` 0.45,
  `--overlay-selection` 0.24, `--overlay-marquee` 0.08, `--overlay-merge` 0.32, `--ghost-opacity`
  0.45, `--erase-ghost-opacity` 0.3 (E1), `--guide-opacity` 0.6.
- **Type**: `--font-ui` (Segoe UI Variable Text, Segoe UI, Arial, Liberation Sans, system-ui; nothing bundled);
  `--type-xs` 12/16 (status controls, tooltips, captions under editors), `--type-sm` 13/18
  (action labels, chips), `--type-md` 14/20 (name field, dropdown names, option glyphs 600,
  empty-state text), `--type-rail` 600 18/24 (Atom rail glyph), `--type-caption` 500 11/14 (rail
  captions), `--type-hint` 13/18 (status hint). Status numbers use `tabular-nums`. Canvas text is
  svg-render's.
- **Spacing** `--space-1…7` = 2, 4, 8, 12, 16, 24, 32 px; no other values. **Radii** 4 / 6 /
  14 (pill). **Shadows** `--shadow-1` (dropdown, editors), `--shadow-2` (tooltip). **Motion**
  `--motion-fade` 120 ms (tooltip, dropdown), `--motion-pan` 160 ms (reveal pan); both 0 under
  `prefers-reduced-motion: reduce`.

**Contrast pairs** (WCAG 2.x; recomputed from `tokens.css` by `tests/tooling/editor-tokens.test.ts`):

| Foreground | Background(s) | Minimum |
|---|---|---|
| `--text` | `--chrome-bg`, `--canvas-bg`, `--hover-bg`, `--pressed-bg`, `--warning-bg` | 4.5 |
| `--text-muted` | `--chrome-bg`, `--canvas-bg`, `--hover-bg`, `--pressed-bg` | 4.5 |
| `--active-fg` | `--active-bg`, `--active-hover-bg` | 4.5 |
| `--warning` | `--canvas-bg`, `--chrome-bg`, `--warning-bg` | 4.5 |
| `--tooltip-fg`, `--tooltip-muted` | `--tooltip-bg` | 4.5 |
| `--accent` | `--canvas-bg`, `--chrome-bg`, `--active-bg` | 3.0 (focus ring, indicator) |
| `--border-control` | `--canvas-bg`, `--chrome-bg`, `--hover-bg`, `--pressed-bg` | 3.0 (control boundary) |

`--text-disabled` is exempt (WCAG 1.4.3, disabled controls). Selected state never relies on
colour alone: rail buttons get the 3×24 `--accent` bar at the rail's left edge; option buttons a
2×16 underline 2 px above the bottom edge.

**Icons**: ids in `icons.svg`: `select erase bond-single bond-double bond-triple bond-wedge
bond-hash chain ring-benzene ring-6 ring-5 ring-4 ring-3 mark-plus mark-minus mark-lone-pair
mark-radical arrow-forward arrow-equilibrium arrow-resonance arrow-nogo plus curved-full
curved-fishhook text search undo redo zoom-in zoom-out fit warning clean-up tidy show-kekule
show-circle show-structural show-skeletal expand flip-h flip-v glyph-degree glyph-arrow`
(`show-structural` and `show-skeletal` added 2026-11-12, R51). Rendered by one `Icon` component at
24 px (rail), 20 px (top bar, options), 16 px (status bar); `aria-hidden`, colour
`currentColor`. Nothing else draws icons.

### Control states

All controls are `<button>` (or `<input>`) with an accessible name; toggles carry `aria-pressed`;
disabled controls use `aria-disabled="true"`, stay focusable and keep their tooltip, whose help
line says why. Focus ring: `outline: 2px solid var(--accent)`, offset 2 px (rail and status-bar buttons:
offset 0), only on `:focus-visible`. States per control as in `mockup.css` and screen 10:

| Control | Rest | Hover | Pressed | Selected | Disabled |
|---|---|---|---|---|---|
| Rail button 56×48 | transparent; icon `--text`, caption `--text-muted` | `--hover-bg`; caption `--text` | `--pressed-bg`; caption `--text` | `--active-bg`, icon and caption `--active-fg`, accent bar 3×24 at the rail edge, top 12; + hover `--active-hover-bg` | never |
| Option button 32×32 (text glyphs auto width, padding 0 8) | transparent, `--text` | `--hover-bg` | `--pressed-bg` | `--active-bg`, `--active-fg`, underline 2×16 | `--text-disabled` |
| Action button (icon + label, height 32, padding 0 8 0 4, gap 4) | as option | as option | as option | — | as option |
| Undo / Redo 32×32 | transparent, `--text` | `--hover-bg` | `--pressed-bg` | — | `--text-disabled` when nothing to undo/redo or an editor is open (R7) |
| Name field 32 high, radius 6, padding 0 8 0 32, `search` icon at x 7 | `--canvas-bg`, 1 px `--border-control`, placeholder `--text-muted` | border `--text-muted` | — | focused: 1 px border + 1 px inset, both `--accent` | not found: `--warning` border; focused + not found: 2 px `--warning` |
| Status controls 24 high (readout 48 wide) | transparent, `--text-muted` | `--hover-bg`, `--text` | `--pressed-bg` | preset segment (64×24 inside a 1 px `--border` outline with 1 px padding, radius 4: the 28 px group fills the 28 px bar, the outline inside it): `--active-bg`, `--active-fg`, 600 | zoom −/+ at 25 % / 800 % |
| Warnings button (auto width, padding 0 4) | `warning` icon + count, `--warning`, 600 | `--hover-bg` | `--pressed-bg` | — | hidden when there are no warnings |
| Chip (empty state, "Did you mean") 28 high, pill | `--canvas-bg`, 1 px `--border-control` | `--hover-bg`, border `--text-muted` | `--pressed-bg` | — | — |
| Dropdown row 36 high | transparent | `--hover-bg` | — | keyboard-highlighted `--active-bg` (`aria-selected`) | — |

**Tooltips** (screen 10): on every rail button, option button, icon-only control and disabled
control. Show after 500 ms hover or on keyboard focus; once one is shown, the next appears with
no delay until the pointer has been off all tooltipped controls for 300 ms. Placement: right of
rail buttons (8 px gap), below top-bar controls, above status-bar controls; flipped if clipped.
Content: title (600) then the key in a `kbd` chip (18 px tall), then optionally one help line in
`--tooltip-muted`. A rail tool shows two chips, its digit then its letter, 4 px apart (R50).
Example: **Bond** `3` `B` / "Click to add a bond. Drag to aim it." Max width
240 px, padding 4 8. Dismissed on pointer down, Esc or blur. `role="tooltip"`, linked by
`aria-describedby`.

### Canvas appearance

| Element | Appearance (screen px; colours `--accent` unless stated) |
|---|---|
| Background | `--canvas-bg`; no page border |
| Document parts | svg-render parts, unchanged |
| Hover (group opacity `--overlay-hover`, 0.45) | skeleton vertex: filled circle Ø 18; bond: 8 px round-capped band between the atoms; straight or curved arrow: 8 px band along the path; text, plus and other objects: `extents` grown 3 px, radius 4 |
| Hover of a labelled atom (O, N, Cl, OH, an abbreviation: any atom whose part is text; group opacity `--overlay-hover-label`, 0.25) | its `extents` box grown 2 px, radius 4, so the letters stay legible |
| Selection (group opacity `--overlay-selection`) | atoms: circle r 12 (labelled: `extents` + 3 px box), omitted for a skeleton vertex whose selected bonds already cover it; bonds: 12 px round-capped bands; objects: as hover but 12 px bands / `extents` + 4 px. Plus the **frame**: union of the selected items' `extents` and vertex points, grown 8 px, 1 px dashed (`4 3`) |
| Rotate handle | circle Ø 10, white fill, 1.5 px stroke, 24 px above the frame's top centre, joined by a 1 px line; hit Ø 20 |
| Arrow end handles | 8×8 squares, white fill, 1.5 px stroke, at `from` and `to`; hit 16×16 |
| Curved-arrow handles | ends: circles Ø 8; bend: 9×9 diamond at the curve's t = 0.5 point; hit 16×16 |
| Marquee | rectangle, fill at `--overlay-marquee`, 1 px solid stroke |
| Ghost preview | the would-be parts at `--ghost-opacity`; a merge-target atom gets the hover circle at `--overlay-merge` |
| Snapping guide | 1 px dashed (`4 4`) line at `--guide-opacity`, across the visible canvas |
| Valence warning | atom: circle r 13 (labelled: `extents` + 4 px, radius 4), 1.5 px `--warning` stroke, dash `3 2`, no fill; `cannot-kekulize` bonds: 3 px dashed `--warning` line along each bond. Never exported |
| Condition slot (Text tool near an arrow) | dashed rounded rect (radius 4), 2 BLU wide × `capHeight` + 8 px, centred where the text will go |
| Chain count | the number of carbon atoms of the zig-zag, start atom included (R31), in a tooltip-style badge: `--tooltip-bg` / `--tooltip-fg`, 12 px weight 600, padding 2 px top and bottom and 6 px left and right, radius 4 px; top-left corner 14 px right of and 14 px below the pointer, flipped to the left of or above the pointer when it would cross the canvas edge |

**Cursors**: Select: `default` on empty canvas, `move` over an item or the selection; handles:
`pointer` (arrow ends, bend), `grab`/`grabbing` (rotate); Bond, Chain, Ring, Atom, Arrow, Plus,
Curly: `crosshair`; Erase: 20×20 `data:` SVG of the `erase` path, hotspot 4,18, fallback
`crosshair`; Text tool, or over a text with Select: `text`; Space held or middle button: `grab`,
`grabbing` while panning.

### Empty state

Shown when the document has no atoms and no objects (screen 01), no gesture is in progress and no preview exists (R30: the first bond, chain or ring being dragged, or a press starting it, replaces it; there is no hover ghost while the document is empty; it returns when the gesture is cancelled and nothing was added); removed on the first item.
Centred in the canvas, the block (art to chips) centred 16 px above the canvas centre (the mock-up pads the bottom by 32 px), `pointer-events` only on the chips:

1. The benzene outline (`ring-benzene` geometry) at 96 px, stroke width 1 in the 24 grid,
   `--empty-art`, `aria-hidden`.
2. 16 px below, `--type-md` `--text-muted`: "Type a compound name above, or click anywhere to
   start drawing."
3. 12 px below: "Try:" then three chips 8 px apart: **ethanol**, **benzene**, **ethanol + acetic
   acid -> ethyl acetate + water**. A chip runs its text through the name field (rule N4).

A click on the canvas outside the chips is a normal click of the active tool.

### Notices and errors

No modal dialogs. Two places only:

| Kind | Where | Behaviour |
|---|---|---|
| Name not found, scheme part not found, invalid SMILES | the name-field dropdown (screen 07): a `--warning-bg` row with the `warning` icon: `No compound named “ethanl”.`; below it "Did you mean" (`--type-xs`) and ≤ 3 chips from `suggestions`, closest first; `role="alert"`; dropdown `min-width` 320 | Stays while the text is unchanged; editing the text, Esc or blur clears it; a chip replaces the failing part (the whole text for a single name) and inserts |
| Everything else (Kekulé impossible, nothing to tidy, Expand on a non-abbreviation, a recipe that threw; the "Inserted ethanol" announcement) | the status bar's hint slot. An error or warning: `warning` icon + text in `--warning`. An info notice: plain text in `--text`, **no icon**. The slot has `role="status"` `aria-live="polite"` | Replaces the hint; cleared by the next canvas action, Esc, or after 8 s |

Wording: sentence case, plain, says what happened and what to do, never blames, no codes:
"This ring can't be shown with alternating double bonds." · "Nothing to tidy: draw an arrow
between the molecules first." · "Only abbreviations like Ph or CO2H can be expanded." · "That
structure is too big to draw (over 1000 atoms)." · "That edit isn't possible here." (`DocError`,
which the UI should never cause; also logged with `console.error`). chem-core warning `message`s
are shown as given. After a switch to structural with an arrow in the drawing: "Press Tidy reaction to make room for the written carbons." (R55, U16).

### Status-bar hints (`--type-hint`, `--text-muted`)

| Context | Hint |
|---|---|
| Select | "Click a molecule to select it. Drag to move. Drag on empty space to select an area." |
| Erase | "Click or drag over anything to erase it." |
| Bond | "Click to add a bond. Drag to aim it. Click a bond to change it." |
| Chain | "Drag to draw a carbon chain." |
| Ring | "Click to place the ring. Click an atom or bond to attach it." |
| Atom | "Click an atom to change it. Click empty space to add an atom." |
| Arrow | "Drag to draw an arrow." |
| Plus | "Click to place a plus sign." |
| Curved arrow | "Drag from an atom or bond to where the electrons go." |
| Text | "Click to type. Click above or below an arrow for conditions." |
| Hovering an atom (hover keys active) | "Type O, N, Cl… to change this atom. Enter for any label." (screen 02) |
| Hovering a bond (hover keys active) | "Press 1, 2 or 3 for single, double, triple." |
| Name field focused | "Enter inserts. Write a reaction like: ethanol + acetic acid -> ethyl acetate" |
| Bond or Chain drag | "Hold Shift for any angle." |
| Label editor open | "Enter finishes. Esc cancels." |
| Text editor open | "Enter finishes. Shift+Enter starts a new line. Formulas like H2SO4 get their subscripts when you finish." |

### Keyboard

**K1 Global shortcuts** (focus anywhere in the editor except a text input or editor, where only
Esc, Enter and K3 apply; with `shortcuts: 'canvas-only'` the Ctrl rows are left to the host):

| Keys | Command |
|---|---|
| Ctrl+Z / Ctrl+Y, Ctrl+Shift+Z | Undo / Redo. In the name field they act on the document while the field is empty; while it holds text they are the field's own text undo |
| Ctrl+C / Ctrl+X / Ctrl+V | Copy / Cut / Paste (in-app, rule CB1) |
| Ctrl+D | Duplicate selection |
| Ctrl+A | Select all (switches to Select) |
| Delete, Backspace | Delete the selection, else the hovered item |
| Ctrl+F | Focus the name field |
| Ctrl+= (Ctrl++), Ctrl+− | Zoom in / out one step |
| Ctrl+0 | Zoom to fit (R13). (Zoom to 100 %, R49, was Ctrl+1 and has no key since R59 / app-shell R46: the status-bar readout and the host's menu) |
| Ctrl+Shift+K | Show Kekulé / Show circle |
| Ctrl+Shift+L | Clean up |
| Ctrl+Shift+R | Tidy reaction (R59, was Ctrl+Shift+T) |
| Arrow keys / Shift+arrow keys | Nudge the selection 0.1 / 1.0 BLU (one undo step per run of nudges) |
| Esc | One step per press: cancel gesture → close editor/dropdown → clear notice → clear selection → switch to Select |
| Space (hold, canvas focused) | Pan with the pointer |

**K2 Canvas keys** (canvas focused; R6). If an atom or bond is hovered and the key is one of its
hover keys, the key acts on it; otherwise a tool key selects that tool; other keys do nothing.
Hover keys work with every tool except Erase and Text.

| Hovered | Key | Effect |
|---|---|---|
| atom | `C` `H` `N` `O` `S` `P` `F` `I` | set element (rule A2) |
| atom | `L` → Cl, `B` → Br | set element |
| atom | `+` / `=`, `-` | charge +1 / −1 (clamped −4…4) |
| atom | `1` `2` `3` | sprout a single / double / triple bond in P1's direction (R5) |
| atom | Enter | open the label editor (L1) |
| bond | `1` `2` `3` | set order single / double / triple (stereo cleared) |
| bond | `W` / `H` | wedge / hash; again reverses the direction (rule B5) |
| atom or bond | Delete, Backspace | erase it (rule E2) |
| — | `V` `E` `B` `Z` `R` `L` `A` `+` `M` `T` | select that tool |
| — | `1` `2` `3` `4` `5` `6` `7` `8` `9` `0` | select the tool with that number (R50): Select, Erase, Bond, Chain, Ring, Atom, Arrow, Plus, Curved arrow, Text. `1` `2` `3` reach this row only when no atom or bond takes them as hover keys (rows above), the same precedence as `L` and `B` |

Every plain digit binding in the editor (searched 2026-11-12 in this spec and in
`src/renderer/editor`): the `1` `2` `3` hover keys above (R5); the K2 tool row of R50; Ctrl+0 and
Ctrl+1 (K1, need Ctrl; since R59 only Ctrl+0, while Ctrl+1 … Ctrl+9 are app-shell's tab keys); digits typed into the name field, the label editor and the text editor
(text targets, never K2). Nothing else binds a digit, in the editor or in app-shell's host keys.

**K3 Editor keys** (label or text editor focused): Enter commits; Shift+Enter new line (text
only); Esc cancels; Ctrl+Z / Ctrl+Y local undo/redo (R7); text only: Ctrl+B bold, Ctrl+I italic,
Ctrl+= subscript, Ctrl+Shift+= (Ctrl++) superscript, Ctrl+Shift+D inserts Δ, Ctrl+Shift+H
inserts hν.

**K4 Tab order**: host `menu` slot (☰, when supplied; R56) → name field → options bar (one tab stop; ←/→ move, roving `tabindex`) → Undo
→ Redo → host actions (when supplied) → rail (one tab stop; ↑/↓ move, Enter/Space activates; `role="toolbar"`
`aria-orientation="vertical"`) → host `tabs` slot (when supplied; R56: the tab list, one tab stop, then the + button, app-shell T16) → canvas (`role="application"`, `aria-label="Drawing canvas"`,
`aria-describedby` the hint) → status-bar controls (warnings, Slides, Handout, zoom −, readout,
zoom +, fit). Shift+Tab reverses. Empty-state chips sit after the canvas in tab order while shown.

**K5 Focus**: a mouse press on a rail, options or status button does not take focus
(`mousedown` default prevented) and, if focus was in the name field, moves it to the canvas, so
tool and hover keys work at once; keyboard activation keeps focus on the button. Clicking the
canvas focuses it (committing an open editor). Committing or cancelling an editor returns focus
to the canvas. After a name insert the field keeps focus and is cleared (several compounds in a
row); Esc in the field: close dropdown → clear text → focus the canvas. At launch the canvas has
focus (Decision 5).

### Accessibility

- Every tool and action is reachable by keyboard (K1–K4). Drawing needs a pointer; a
  keyboard-only user draws through the name field and edits with select-all, delete, nudge, flip
  and the selection actions.
- Visible focus on every control; the canvas shows a 2 px inset `--accent` outline when focused by
  keyboard.
- Contrast per the pairs table; hit targets: rail 56×48, top bar 32, options 32, status 24 (all
  ≥ 24 px, WCAG 2.5.8); canvas tolerances in screen px, independent of zoom (H1).
- `prefers-reduced-motion: reduce` turns off every transition and the reveal pan.
- The hint slot announces notices and inserts ("Inserted ethanol"); rail captions and number
  badges are `aria-hidden`; the button's `aria-label` is the tool name ("Bond") and its
  `aria-keyshortcuts` names both keys ("3 B"), so each key is announced once (R50, U2; until
  2026-11-12 the label carried the letter, "Bond (B)"). Other controls keep the key in their
  label ("Undo (Ctrl+Z)").
- Works at Windows display scaling 100–200 % (all sizes are CSS px).

---

## Architecture

### Where the code lives

`src/renderer/editor/` (coverage target 70 % lines). Imports core only as `@core/doc-model`,
`@core/chem-core`, `@core/svg-render`. Never `openchemlib`.

```
src/renderer/editor/
  index.ts              public entry (named exports only)
  model/                pure, DOM-free, React-free: data in, data out
    geometry.ts         vectors, angles, snapping, distance to segment / quadratic
    viewport.ts         BLU ↔ pt ↔ screen, zoom steps, default zoom, fit, reveal, pan clamp
    hit-test.ts         hitTest, marquee selection
    placement.ts        sprout direction, chain points, ring placement, insert placement
    templates.ts        ring SubDocs (generated)
    commands.ts         recipes: (doc, args) => Doc, built only from core ops
    cleanup.ts          orphan-carbon rule
    selection.ts        fragment closure, scope, narrowing, selection sets
    text-edit.ts        editing model for the label/text editors (runs, caret, ops, local undo)
    chem-text.ts        finishText (auto-formatting on commit), fromStored, labelDisplayRuns
    formula.ts          Formula / Hill string → display runs (real sub/sup)
    scheme-text.ts      split "A + B -> C", build and lay out a scheme
    tidy.ts             tidyReaction, conditionPosition
    overlay.ts          overlay shapes in screen px from state + scene
    keymap.ts           key event → command / tool / hover action
    derive.ts           perception + scene for a doc (last-one caches)
    patch.ts            keyed-part patch plan (old keys/markup → new parts)
  tools/                pure state machines, one file per tool, plus tool.ts
  state/
    editor-state.ts     EditorState type, initial state
    reducer.ts          reduce(state, action, ctx) → state
    store.ts            createStore: getState / dispatch / subscribe
    controller.ts       createEditorController (host API)
  view/                 thin React components
    Editor.tsx TopBar.tsx NameField.tsx OptionsBar.tsx ToolRail.tsx StatusBar.tsx Canvas.tsx
    Overlay.tsx TextBox.tsx text-dom.ts EmptyState.tsx Tooltip.tsx Icon.tsx use-store.ts
    tokens.css icons.svg editor.css
```

`model/`, `tools/` and `state/` are DOM-free and React-free: an ESLint block bans `react`,
`react-dom`, `electron` imports and the globals `window`, `document`, `navigator`,
`requestAnimationFrame`, `performance`, `setTimeout`, `Date` there (the clock is injected),
proven by a tooling probe. React components hold no logic beyond wiring events to `dispatch` and
mapping state to elements; DOM-only helpers (`text-dom.ts`: selection ↔ offsets, IME reconcile)
live in `view/` and are tested by e2e.

### State model

```ts
interface EditorState {
  history: History;                 // doc-model; the document is current(history)
  saved: Doc;                       // last loaded/saved doc, for dirty
  selection: Selection;             // never holds ids across undo/redo
  tool: ToolId;                     // 'select' | 'erase' | 'bond' | 'chain' | 'ring' | 'atom'
                                    // | 'arrow' | 'plus' | 'curved' | 'text'
  variants: { bond: BondVariant; ring: RingTemplate; atom: AtomItem;
              arrow: 'forward' | 'equilibrium' | 'resonance' | 'no-go';
              curved: 'full' | 'fishhook' };
  hover: Hit | null;
  gesture: GestureState | null;     // the active tool's machine state (discriminated union)
  preview: Preview | null;          // { doc; added: ReadonlySet<ItemKey>; mergeTarget?: AtomId;
                                    //   translate?: { keys: ItemKey[]; dx: number; dy: number } }
  viewport: Viewport;               // { zoom: number; pan: Point (screen px); size: Size }
  editing: LabelEditing | TextEditing | null;   // target + TextEditState (text-edit.ts)
  nameField: { text: string; open: boolean; highlighted: number; error: NameError | null };
  notice: Notice | null;            // { id: number; kind: 'info' | 'error'; text: string }
  clipboard: SubDoc | null;
  spaceHeld: boolean;
}
```

| Undoable (in `history`) | Not undoable (editor state) |
|---|---|
| every document change: gestures, label/text commits, inserts, Clean up, Kekulé toggle, Expand, Tidy, preset switch | selection, hover, tool, variants, viewport, previews, editors, name-field text, notices, clipboard |

The **store** is a plain object with `getState`, `dispatch(action)`, `subscribe`; the reducer is
pure: `reduce(state, action, ctx)` with `ctx = { derive, names, clock }`. React subscribes with
`useSyncExternalStore` (server snapshot = client snapshot, so `react-dom/server` can render
views in node tests). Timers (notice expiry, tooltip delays, pointer-move coalescing) live in
`view/` and dispatch actions.

**Derived data** (`derive.ts`): `derive(doc) → { perception, scene }` with a one-entry cache keyed
by doc identity and one `createPerceiver()` per controller; the preview doc has its own
one-entry cache. `scene = render(doc, { perception })`.

### Coordinates

Doc in BLU (y down) → pt (`bluToPt(p, scene.style)`) → screen px: `s = pt · k + pan`, `k = zoom ·
4/3` (zoom 1 = 100 % = true size: 1 pt = 4/3 CSS px, as PowerPoint shows it at 100 %; at 150 %,
1 pt = 2 px). Pointer events are converted once, at the edge, into BLU for the tools; tolerances
stay in screen px.

### Tools and gestures

```ts
type CanvasEvent =
  | { type: 'down' | 'move' | 'up'; p: Point /* BLU */; screen: Point; button: 0 | 1 | 2;
      mods: { shift: boolean; alt: boolean; ctrl: boolean } }
  | { type: 'dblclick'; p: Point; screen: Point } | { type: 'leave' } | { type: 'cancel' };

interface Tool<G> {
  readonly id: ToolId;
  step(gesture: G | null, ev: CanvasEvent, ctx: ToolContext): ToolStep<G>;
  cursor(gesture: G | null, hit: Hit | null): Cursor;
}
interface ToolContext { doc: Doc; scene: Scene; perception: Perception; selection: Selection;
                        viewport: Viewport; variant: unknown; hit: Hit | null; }
interface ToolStep<G> {
  gesture: G | null;                 // null = idle
  preview?: Preview | null;          // undefined = unchanged
  commit?: { label: string; recipe: (d: Doc) => Doc; select?: 'inserted' | Selection;
             coalesceKey?: string };
  selection?: Selection;
  editing?: 'label' | 'text';        // open an editor on the hit after the commit
  notice?: Notice;
}
```

- Every tool is idle → (down, button 0) pressed → (move beyond 4 px) dragging → (up) commit, or
  (up within 4 px) click. `cancel` (Esc, right button down, pointer capture lost, window blur)
  returns to idle with no commit and clears the preview. Chorded right-down may arrive as
  `pointermove` (`button: 2`, `buttons: 3`): it cancels once and consumes its context menu.
  Cancellation clears queued drag and hover feedback. Button-held moves (including chorded
  right-up with `buttons: 1`) cannot hover; only a subsequent unpressed hover movement restores
  normal HV ghosts.
- **Previews never touch history**: the tool runs the same recipe on the committed doc outside
  `transact` (plain ops on a frozen doc). Because ids come from `nextId`, preview ids equal the ids
  the commit will issue, so `added` (keys not in the committed scene) marks the ghost parts.
- **One gesture = one `transact`**, label = the action name ("Add bond", "Add ring", "Move",
  "Rotate", "Erase", "Change atom", "Edit text" …). Nudges use `coalesceKey: 'nudge'`.
- A recipe that throws leaves history unchanged; the store shows a notice (rule X1).
- Pointer moves are coalesced to one dispatch per animation frame (latest event wins) in
  `Canvas.tsx`; the reducer is synchronous.

### Rendering

1. `Canvas.tsx` holds one `<svg>` filling the canvas with `<g data-layer="content"
   transform="matrix(k 0 0 k panX panY)">`. Inside it, one `<g data-key="…">` per scene part, in
   paint order, whose content is `part.svg` (svg-render's allow-listed, escaped markup, set with
   `innerHTML` on the SVG `<g>`, which parses in the SVG namespace).
2. Patching follows svg-render's editor contract: `patch.ts` turns (mounted keys and markup, new
   parts) into a plan — replace content where `svg` changed, insert new keys, remove missing ones,
   reorder with `insertBefore`; `Canvas.tsx` applies it to a `Map<ItemKey, SVGGElement>` from a ref
   in `useLayoutEffect`. React does not own these children.
3. While a preview is active the preview scene is mounted the same way; parts whose key is in
   `preview.added` get `opacity` `--ghost-opacity`. Cancelling remounts the committed scene (only
   changed parts are touched).
4. **Drag fast path**: when a move drags a set of items no unmoved part depends on (whole
   fragments plus objects; no unselected curved arrow, callout or caption refers to a moved atom
   or bond), the preview is `translate` only: the moved parts' `<g>` get
   `transform="translate(dx dy)"` (pt) and nothing is re-rendered until release. Otherwise every
   frame renders `preview.doc`.
5. **Overlay** (`Overlay.tsx`) is a second `<svg>` above the first, `pointer-events: none`, in
   screen px with no transform; its shapes come from the pure `overlayShapes(state, scene) →
   OverlayShape[]`, grouped by kind with group opacity. Strokes are crisp at every zoom.
6. The label and text editors (`TextBox.tsx`) are absolutely positioned HTML over the canvas.

### Hit-testing

`hitTest(doc, scene, viewport, screenPoint, opts) → Hit | null`, pure, linear scan.

```ts
type Hit =
  | { kind: 'atom'; id: AtomId } | { kind: 'bond'; id: BondId }
  | { kind: 'object'; id: ObjectId; type: DrawObjectType }
  | { kind: 'handle'; handle: 'rotate' | 'arrow-from' | 'arrow-to' | 'curve-from' | 'curve-to'
      | 'curve-bend'; id?: ObjectId }
  | { kind: 'slot'; arrow: ObjectId; slot: 'above' | 'below' };   // Text tool only (T1)
```

| H# | Rule |
|---|---|
| H1 | Tolerances in screen px: atom 10 px around the vertex, or inside its `extents['atom:id']` grown 4 px for a labelled atom; bond 6 px from the segment between its atoms; straight arrow 6 px from `from→to`; curved arrow 6 px from the drawn curve (svg-render's `curveControls`) sampled at 32 steps (anchors via `resolveAnchor`); handles: their hit boxes; text, caption, plus, bracket, shape, callout: inside `extents` grown 4 px |
| H2 | Priority: handles of the selection > atoms > bonds > text-like objects (text, caption, callout) > straight arrows > curved arrows > plus > brackets > shapes. Within a class the nearest wins; ties by lower id number |
| H3 | Merge target while dragging an atom or a bond end: the nearest other atom within 12 px (screen) or 0.3 BLU, whichever is larger, excluding the atoms being moved |
| H4 | Marquee: atoms whose position is inside; bonds whose two atoms are inside; objects whose `extents` box is entirely inside. Shift adds to the selection |

### Seam to the host (`app-shell`, `clipboard-export`)

```ts
// src/renderer/editor/index.ts
export { Editor } from './view/Editor';                 // <Editor controller={c} actions={node?} />
// 2026-11-12, R56: also menu={node?} tabs={node?} tabPanelLabelledBy={id?}
// 2026-11-12, R57 (approved): export type { EditorTabState, EditorTabRecord };
//   export { tabStateToRecord, tabStateFromRecord, tabStateMarkSaved, tabStateDoc,
//            tabStateDirty, tabStateCanUndo, tabStateCanRedo, tabStateView }
export { createEditorController } from './state/controller';
export type { EditorController, EditorOptions, EditorCommand, EditorEvent, HostHit }
  from './state/controller';

interface EditorOptions {
  doc?: Doc;                         // default emptyDoc(clock())
  clock: () => string;               // ISO timestamps for new docs and history; injected
  names?: NameIndex;                 // default: createNameIndex(compounds.json), built once
  shortcuts?: 'all' | 'canvas-only'; // 'canvas-only' when the host's menu owns K1's Ctrl shortcuts
  onCopy?: (sub: SubDoc, doc: Doc, selection: Selection) => void;  // clipboard-export hook
  logError?: (error: unknown) => void; // X1 logging; default console.error
}
interface EditorController {
  getDoc(): Doc;
  getSelection(): Selection;
  load(doc: Doc): void;              // new history, cleared selection, marks saved, V2 view
  markSaved(): void;                 // dirty := false
  isDirty(): boolean;                // doc differs from `saved` ignoring meta.modified
  run(cmd: EditorCommand): void;
  canRun(cmd: EditorCommand): boolean;
  undoLabel(): string | undefined;   // for menu text "Undo Add bond"
  redoLabel(): string | undefined;
  notify(kind: 'info' | 'error', text: string): void; // host notice in the hint slot (Notices and errors)
  subscribe(listener: (e: EditorEvent) => void): () => void;
  takeState(): EditorTabState;       // R57 (approved): the active tab's part, for a tab switch
  putState(s: EditorTabState): void; // R57: put a tab's part back (or a new one)
  newState(doc: Doc): EditorTabState; // R57: what load(doc) would make; touches nothing
  snapshotState(): EditorTabState;   // R57: read-only committed state; no precondition, no effect
}
type EditorCommand =
  | 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'duplicate' | 'delete' | 'select-all'
  | 'zoom-in' | 'zoom-out' | 'zoom-fit' | 'zoom-reset' | 'clean-up' | 'toggle-kekulé'
  | 'tidy-reaction' | 'focus-name-field'
  | 'toggle-formula'                          // R51, C7: canRun = idle and (structural or non-empty)
  | { type: 'set-preset'; preset: StylePreset }
  | { type: 'paste-sub'; sub: SubDoc }        // host read a Chalkbond fragment from the clipboard
  | { type: 'insert-text'; text: string }     // host read text (name, SMILES, Molfile)
  | { type: 'replace-doc'; doc: Doc; label: string }; // R58 (approved): one undo step
type HostHit = { kind: 'atom'; id: AtomId } | { kind: 'bond'; id: BondId }
  | { kind: 'object'; id: ObjectId };
type EditorEvent =
  | { type: 'doc' | 'selection' | 'dirty' | 'history' | 'notice' | 'busy' } // idle state changed; idle = canRun({type: 'set-preset'})
  | { type: 'view' }                         // R57 (approved): zoom or pan changed
  | { type: 'context-menu'; target: HostHit | null; screen: Point };   // CM1
```

- `focus-name-field` asks the view to focus the name field: `canRun` is true when no label or text
  editor is open; `run` records a focus request counter and the view moves DOM focus. Ctrl+F uses
  the same run path. Every command's `canRun` and `run` agree: with
  `canRun` false `run` changes nothing, with it true `run` has its documented effect
  (`state/controller-commands.test.ts`).
- `clipboard-export` renders with svg-render from `getDoc()` and `getSelection()` (or the
  `onCopy` payload); the editor never builds export SVG.
- `app-shell` owns save/open and calls `load` / `markSaved`; it shows the dirty marker from the
  `dirty` event; its menus call `run` and enable items with `canRun`; it may answer
  `context-menu` with a native menu.
- **Before app-shell exists**, `App.tsx` (scaffold) renders `<Editor controller={…} />` filling
  the window with default options and `shortcuts: 'all'`, inside an element that keeps
  `data-testid="canvas-area"`; this is enough to run and e2e-test everything in this spec.
- Test hooks: every control has a `data-testid` (`tool-<id>`, `opt-<variant>`, `act-<action>`,
  `undo`, `redo`, `name-field`, `name-dropdown`, `hint`, `formula`, `warnings`, `preset-slides`,
  `preset-handout`, `zoom-out`, `zoom-reset`, `zoom-in`, `zoom-fit`, `canvas`, `text-editor`,
  `label-editor`, `empty-state`); each mounted part's `<g>` has `data-key`; the content layer
  carries its transform. The editor defines no test-only globals: app-shell's test hook (SPEC-app-shell.md TH1-TH3) exposes the controller to e2e in an unpackaged build started with `--chalkbond-test-hooks`, and e2e reads document geometry from part bounding
  boxes and the content transform.

### Dependencies

**None new.** React 19.3.1 and `react-dom/server` (installed), Immer and Zod through core, the
JSON import of `resources/compounds/compounds.json` (`resolveJsonModule` is on), Vite `?raw`
imports for `icons.svg`.

---

## Behaviour rules

Numbered so tasks can cite them.

### General

- **G1** Every document change is one `transact` with a human label. No document change happens
  outside a gesture commit, an editor commit, a command or a selection action.
- **G2** Undo/redo clear selection, hover, preview and any gesture; they are not available while
  an editor is open (R7).
- **G3** Switching tool cancels any gesture and commits an open editor; the selection is kept
  only when switching to Select.
- **G4** Atoms are placed at exactly 1.0 BLU bond length by every drawing tool. Only moving a
  single atom (S2) changes bond lengths.

### Viewport

- **V1** Zoom steps: 25, 33, 50, 67, 75, 90, 100, 125, 150, 200, 250, 300, 400, 500, 600, 800 %;
  range 25–800 % (R1). Ctrl+wheel and touchpad pinch zoom continuously about the pointer (factor
  1.0015^(−deltaY), clamped); buttons and keys step about the canvas centre to the next step
  above/below the current zoom. The readout shows the zoom rounded to a whole percent.
- **V2** Default zoom `z₀ = 1.5 × 40 / bondLength` (bondLength from `resolveStyle(doc.style)`),
  clamped to the range: 150 % Slides, 416.67 % Handout. New or loaded document: zoom `z₀`; empty
  → the doc origin at the canvas centre; non-empty → ink box centred, and if it does not fit with
  a 48 px margin, zoom to fit (V3).
- **V3** Fit (R13): zoom = the largest whole percent ≤ `z₀` at which the scene `bounds` (pt) plus
  48 px on every side fit the canvas; centred.
- **V4** Wheel pans vertically, Shift+wheel horizontally; Space+drag and middle-drag pan. Pan is
  clamped so at least 64 px of the content's bounds stay on screen.
- **V5** **Reveal** after a paste, duplicate or Tidy reaction (a name or scheme insert uses V7): if the
  document's ink box is fully visible inside a 48 px margin, nothing; else if it fits at the
  current zoom, pan by the smallest amount that brings it inside the margin; else set zoom to
  `min(fit zoom, z₀)` when that is below the current zoom, centred on the ink box (Decision 8).
  Pans animate over `--motion-pan` (none under reduced motion).
- **V6** Preset switch keeps the drawing's on-screen size: zoom × oldBondLength / newBondLength
  (not snapped to steps, clamped to the range), about the canvas centre.
- **V7** **Frame** after a name insert or a scheme insert (N2, N3): zoom = `min(current zoom, fit
  zoom)` (R13: fit with the 48 px margin, never above z₀), and the ink box of the whole drawing
  (not only the new structure) is centred in the canvas. Starting from an empty document at 1280 ×
  800: ethanol is centred at 150 %; benzene added: both, as one group, centred at 150 %; acetic acid
  added: all three centred as a group, 150 % if they fit with 48 px margins, else the fit zoom.
  Placement of the new structure (P7, N3) does not change. Pasting, duplicating and Tidy reaction
  keep V5.

### Hover

- **HV1** With any tool except Erase and Text, hovering an atom or bond (H1/H2) highlights it and
  enables K2 hover keys. Select also highlights objects. Erase highlights what it would erase.
  Text highlights texts and condition slots only.
- **HV2** Hovering an atom or bond with a warning shows the warning's `message` as a tooltip
  after 500 ms (screen 08).
- **HV3** What rests under the pointer is hovered again after a release (B6) and after any key press
  that changed the tool or the document (`controller.refreshHover()`), not only when the pointer
  next moves: `V` then `O` over an atom works without wiggling the mouse. Not while a gesture
  runs (Esc cancels it; the release brings the hover back). A held key does not repeat a hover or
  tool key.
- **HV4** A hovered atom that draws a label (its `extents` has an `atom:` entry) is highlighted
  with the light box of Canvas appearance (R27) and shows **no hover ghost**: a ghost bond through
  the letters is noise. A click still does what its tool does; only the ghost is suppressed.
  Skeleton atoms and empty canvas keep their ghosts.
- **HV5** With the Select tool, an item that is already in the selection shows no hover highlight:
  the selection tint stands alone (a hovered, selected label atom would otherwise stack both tints
  into a heavy box). The cursor is still `move`, hover keys and warning tooltips still work. Items
  not selected highlight as before; other tools are unchanged.

### Select tool

- **S1** Click (press and release within 4 px) — Decision 6:
  - on an atom or bond whose fragment is **not** fully selected: the selection becomes that
    whole fragment (atoms + bonds);
  - on an atom or bond of a fragment that **is** fully selected: the selection becomes just that
    atom or bond (narrowing; any other selected items are dropped);
  - on an object: the selection becomes that object;
  - Alt+click on an atom or bond: the selection becomes just that atom or bond;
  - Shift+click: toggles the item's fragment (or the object, or with Alt the single atom/bond)
    in or out of the selection;
  - on empty canvas: clears the selection; with Shift it keeps it (R24).
- **S2** Drag: from an item in the selection moves the selection as it is (no narrowing); from an
  item not in the selection first applies S1's click rule for that item (with its modifiers),
  then moves; from empty canvas draws a marquee (H4; with Shift its result is added to the
  selection, R24); from a handle runs the handle (S5, S6).
- **S3** Moving: `transformItems(doc, sel, translation(dx, dy))` committed once on release
  ("Move"). Shift constrains to horizontal or vertical. Snapping: if the moving ink box's centre
  x or y comes within 6 px (screen) of the centre x or y of another fragment's or object's ink
  box, it snaps and a guide is drawn.
- **S4** When the moved set is exactly one atom and it is released over a merge target (H3), the
  commit is the move plus `mergeAtoms(doc, target, moved)` ("Join atoms").
- **S5** Rotate handle: rotation about the centre of the selection frame, snapped to 15°
  (Shift: free); one "Rotate" commit.
- **S6** Arrow end handle: moves that end; the angle to the other end snaps to 15° (Shift: free);
  attached texts are re-placed by T3 in the same commit. Curved-arrow end handle: re-anchors onto
  the hit atom (`{ kind: 'atom', atom }`), bond (`{ kind: 'bond', bond, t: 0.5 }`) or a point;
  bend handle sets `bend = 2 · d / chordLength`, d = signed distance of the pointer from the
  chord midpoint along the left normal of `from→to` (t = 0.5 of svg-render's quadratic lies at
  `bend · chord / 2` from the midpoint). One "Adjust arrow" commit.
- **S7** Double-click (Select only, R2): on an atom opens the label editor; on a `text` object
  opens the text editor. Elsewhere it is two clicks.
- **S8** Delete / Backspace: `deleteItems` on the selection plus the orphan rule (E2), "Delete".

### Erase tool

- **E1** Click erases the hit item; dragging erases every item hit along the path (ghosted at
  opacity 0.3 while dragging), one "Erase" commit on release.
- **E2** **Orphan rule**: after any deletion, an atom that lost a bond in this commit and now has
  no bonds is also deleted if it is a plain skeleton carbon (element `C`, no label, charge 0,
  radical 0, no lone pairs, isotope, explicitH, partialCharge, number or colour), unless a curved
  arrow, callout or caption refers to it. A deleted bond would otherwise leave a stray "CH₄".

### Bond tool (single · double · triple · wedge · hash)

The new bond gets the option's order/stereo (wedge and hash are order 1); its `a1` is the start
atom, so a wedge's narrow end is where the gesture started.

- **B1** Click on empty canvas: atom at p, second atom at p + (cos 30°, −sin 30°) (up-right),
  bond.
- **B2** Drag from empty canvas: first atom at the press point; the second follows the pointer's
  direction snapped to multiples of 30° (Shift: free), at 1.0 BLU. If the end is over a merge
  target (H3), the bond ends on that atom (no new atom); if the two atoms are already bonded,
  nothing is committed.
- **B3** Click on an atom: sprout in the default direction (P1); if the new position is within
  0.25 BLU of an existing atom not bonded to it, bond to that atom (ring closure); if bonded
  already, use P1's next candidate.
- **B4** Drag from an atom: as B2, starting at that atom.
- **B5** Click on a bond (a press on a bond never drags): single: if the bond has stereo, clear
  it; else cycle order 1 → 2 → 3 → 1 (1.5 → 2). Double: if order ≠ 2, set 2; else cycle
  `doublePlacement` auto → left → right → center → auto. Triple: set 3. Wedge/hash: if the stereo
  differs, set it with the narrow end at the atom nearer the click (reversing if needed); if
  equal, reverse. **Reverse** = in one recipe: delete the bond, add it with `a1`/`a2` swapped and
  the same fields, and point every curved arrow / callout anchor that referred to the old bond at
  the new one with `t' = 1 − t`.
- **B6** A ghost preview shows the click result while hovering and the drag result while
  dragging.
  Hovering an atom shows the sprouted bond; hovering empty canvas shows the two-atom bond of B1
  with its first atom under the pointer; hovering a bond shows no ghost (its highlight is the
  cue). A ghost that closes a ring (B3, B2) also shows the atom it joins with the merge circle.
  Commit labels: "Add bond" for B1-B4, "Change bond" for B5. After a release the atom or bond under
  the pointer is hovered again at once (a hover key or the next ghost need no pointer move). A
  press on a bond released more than 4 px away changes nothing.

### Placement rules

- **P1** **Default sprout direction** from atom X with neighbour unit vectors u₁…uₙ: n = 0: 30°
  up-right. n = 1: the two directions at ±120° from u₁; pick the one farther from the neighbour's
  other neighbours (the zig-zag continues); tie → the one nearer horizontal (a zig-zag has no
  vertical bonds: from the up-right end of a lone bond the sprout goes down-right, propane), then
  the more upward, then the more rightward. n ≥ 2:
  the bisector of the largest angular gap (ties: the gap starting at the smallest angle
  counter-clockwise from +x). "Next candidate" = the other ±120° direction, then the bisector of
  the second-largest gap.
- **P2** **Chain**: zig-zag of single bonds from the start (empty point or atom) along the
  snapped drag direction d̂ (30° steps, Shift free): the bonds alternate between the two
  directions 30° either side of d̂ (atom 2k lies on the axis through the start, atom 2k+1
  0.5 BLU off it; bond length 1.0), n = round(projected drag length / cos 30°), 1 ≤ n ≤ 20 (a
  drag of 4 BLU is 5 bonds). First bond: when the start atom has a neighbour, the direction nearest
  P1's default direction (the zig-zag continues); otherwise the more upward, then the more
  rightward. The count badge (carbons, start atom included) follows the pointer. A click (no drag) adds one bond as B1/B3; a
  press on a bond starts nothing. One "Add chain" commit.
- **P3** **Ring onto empty canvas**: the template centred at the click, canonical orientation
  (vertex up for 3, 5, 6; square axis-aligned).
- **P4** **Ring onto an atom**: the ring shares that atom; its centre lies at the circumradius
  R = 1 / (2 sin(π/n)) in the *away* direction, oriented so the shared atom is a vertex. Away =
  P1's default direction (30° up-right for a lone atom, the bisector of the largest gap for two
  or more neighbours), but for **one** neighbour straight away from it, so the existing bond
  leaves the ring vertex outward as in screen 04 (P1's ±120° would run a ring bond along the
  existing bond).
- **P5** **Ring onto a bond**: fused, sharing the bond, on the pointer's side. A pointer within
  0.05 BLU (4 px) of the bond's line does not choose (a click that hits a bond is within 6 px of
  it): the side with fewer neighbour atoms of the bond's two ends, then the higher one, then the
  right-hand one, so a click on a bond of a ring fuses outside it. Benzene onto a bond of an
  all-1.5 ring → all new bonds 1.5 (naphthalene: two circles). Benzene onto any other bond →
  Kekulé, alternating so that a shared double bond stays double and a shared single bond stays
  single. The shared bond's order never changes.
- **P6** **Merging coincident atoms**: every new atom of a template or chain within 0.15 BLU of an
  existing atom (nearest first, each existing atom at most once) is that atom instead of a new
  one (the same result as `mergeAtoms(doc, existing, new)`; a bond that exists keeps its fields).
  A ring that adds nothing is not committed.
- **P7** **Insert placement** (a single structure from the name field, a chip or `insert-text`):
  empty doc → centred on the canvas centre. Otherwise its ink box's left edge 1.0 BLU right of the
  document's ink box right edge, vertically centred on the centre of the rightmost fragment or
  object. Then V7 (frame). The inserted items are selected and the tool becomes Select, as when an
  object is pasted into PowerPoint, so the teacher can drag it at once; the name field keeps focus.

### Ring templates

Generated in `templates.ts` as vertex lists (`RingTemplate`) centred on the origin, bond length
1.0; `ring-ops.ts` turns, moves and draws them (P3-P6). A press released more than 4 px from where
it began adds no ring. The hover ghost follows the pointer, snapped to the atom or bond under it
(none over an atom that draws a label, HV4). Benzene (regular
hexagon, vertex up, all order 1.5, drawn with a circle); Cyclohexane, Cyclopentane, Cyclobutane,
Cyclopropane (regular n-gon, vertex up; square axis-aligned; single bonds).

### Atom tool (C H N O S P F Cl Br I, or a mark)

- **A1** Element option: click an atom → set its element (A2); click empty canvas → a lone atom
  of that element (a lone O renders "H₂O"); drag from an atom → bond to a new atom of that element
  (B4 geometry). A press on a bond, a drag from empty canvas and a press released more than 4 px
  away (other than a drag from an atom) change nothing. Commit labels: "Change atom", "Add atom", "Add bond".
- **A2** Setting an element: `updateAtom(element, label: undefined, explicitH: undefined)`;
  charge and marks kept. Setting the element it already has does nothing.
- **A3** Mark options on a clicked atom (Shift+click reverses): Positive / Negative charge ±1
  (clamped −4…4); Lone pair: `lonePairs` 0 → 1 → … → 4 → 0; Radical 0 ↔ 1; δ+ / δ−: set, or clear
  if already that value. On empty canvas: nothing, notice "Click an atom to add this." (info). A mark option dragged does nothing. A charge already at ±4 pressed again, and a click that
  changes nothing, make no undo step.

### Label editor

- **L1** Opens with Enter over a hovered atom (any tool except Erase and Text) or a double-click
  with Select (S7): a `TextBox` in label mode centred on the atom, min 64 px wide, Arial at the rendered
  label's size and zoom, padding 2 8, 1 px `--accent` outline on `--canvas-bg` as in screen 09
  (amended 2026-11-10: the earlier 28 px / 2 px / radius 6 box did not match the rendered text
  size or screen 09); the edited atom's own label and the selection halo are hidden while it is
  open; filled with
  the atom's label, else its element (with H count when `explicitH` is set: `OH`; in structural
  mode a carbon outside a ring without a label is filled with its H count as drawn, `CH3`, R52 U11;
  a ring carbon opens with `C` as in skeletal mode, R53), all selected.
  Display is WYSIWYG through `labelDisplayRuns(text)`: digits after a letter or `)` as
  subscripts, a trailing charge as superscript; typing is plain characters, nothing to toggle.
- **L2** Below it (4 px), a caption in `--type-xs`: `--text-muted` "e.g. OH, NH2, Cl, Ph, CO2H";
  when the text interprets as `unknown`, `--warning` "Not a known group; it will be drawn as
  typed."
- **L3** Enter commits ("Change atom") through `interpretLabel`: `element` → set `element`,
  clear `label`, `charge` = typed charge ?? 0, `explicitH` = typed H count only if it differs from
  the automatic count (perceive the doc with `explicitH` cleared), else undefined;
  `abbreviation` → `element` = its attachment element, `label` = key; `unknown` → element `*`,
  `label` = the text. Empty text → plain carbon. Esc cancels; clicking elsewhere commits.

### Arrow, Plus, Curved arrow

- **R1** Arrow: drag from p₀ to p₁ → arrow of the option's kind, angle snapped to 15° (Shift
  free); a drag shorter than 0.5 BLU counts as a click; click on empty canvas → arrow from p to
  p + (2.5, 0). Click on an existing arrow sets its kind to the option.
- **R2** Plus: click → plus at p; snapping as S3 (centre alignment with other items). While the
  button is down a ghost plus follows the pointer with its guide; the plus lands where the button
  is released. Arrow, Plus and Curved arrow leave the selection as it was (nothing is selected).
- **R3** Curved arrow: press on an atom or bond (else nothing, notice "Start on an atom or a
  bond." (info)), release on an atom, a bond or empty canvas. Anchors: atom → `{ kind: 'atom',
  atom }`, bond → `{ kind: 'bond', bond, t: 0.5 }`, empty → `{ kind: 'point', p }`. Same start and
  end → cancel. Default `bend` (R33, R37): apex height `h = max(0.2 × chord, 0.45 BLU)`, raised
  to `0.9 − 0.5 × chord` BLU when either anchor is an atom drawn with a label (svg-render's
  `isLabelled`; chord 0.5 BLU: 0.65), so `|bend| = 2h / chord`; the sign puts the apex on the side farther from the nearest atom that is
  not an anchor's own (both atoms of a bond anchor), and when the two distances differ by less
  than 0.1 BLU, on the side away from the centroid of the atoms of the fragments the anchors
  touch (`+` when the centroid lies on the chord). Head = the option.

### Text tool and conditions

- **T1** Click on empty canvas → new `text` at p (`align: 'left'`) with the text editor open;
  click on an existing `text` → edit it. Hovering within 1.0 BLU of an arrow's shaft and between
  its ends shows the condition slot on the pointer's side (above/below); clicking it creates a
  `text` with `attachedTo: { arrow, slot }`, `align: 'center'`, placed by T3, or edits the text
  already attached there.
- **T2** **Text editor** (Decision 10). A `TextBox` in text mode over the text: a
  `contenteditable="plaintext-only"` element showing the runs as svg-render draws them — Arial at
  `fontSize · k` px, sub/sup spans at 0.7 × size shifted 0.2 em / 0.4 em, bold/italic as the
  object — with padding 2 8 inside a 1 px `--accent` outline on `--canvas-bg` (screen 09); the
  svg-render part is hidden while editing.
  - **Model first.** The DOM is a projection of a pure `TextEditState` (`text-edit.ts`):
    `runs: EditRun[]` (`{ text, script?: 'sub' | 'sup', explicit?: true }`), `anchor`/`focus`
    offsets (UTF-16, never inside a surrogate pair), `pending` script, a local undo stack. Every
    cancelable `beforeinput` (insertText, insertReplacementText, insertLineBreak,
    insertParagraph, insertFromPaste, insertFromDrop, delete*, historyUndo/Redo) is cancelled and
    applied to the model; the view re-renders the spans and restores the selection. IME
    composition (not cancelable) is allowed to edit the DOM and reconciled into the model on
    `compositionend` (`text-dom.ts`). A blur during a composition (a click elsewhere, the host's
    F4a) does not commit the model, which lacks the composing text: the commit waits, and on
    `compositionend` the DOM is first reconciled into the model, then the waiting commit runs
    (R48). Focus coming back before `compositionend` drops the waiting commit. No timeout, no
    cancel. Pasted content is plain text.
  - Why: `execCommand`-style rich editing produces inconsistent markup (`<sub>` vs styles,
    nested spans) and unpredictable caret affinity at run boundaries; with the model first, every
    rule is a pure, unit-tested function and only selection ↔ offset mapping and IME reconcile
    touch the DOM (tested by e2e). `plaintext-only` stops Chromium inserting its own formatting.
  - Typing inherits the pending script if set, else the script and `explicit` flag of the
    character before the caret (at offset 0: after it), else plain.
  - x₂ / x² (and Ctrl+= / Ctrl+Shift+=) on a selection: if every selected character already has
    that script, set them to plain, else to that script; either way they become `explicit`. On a
    collapsed caret they toggle `pending` (shown pressed) until the caret moves.
  - B / I (Ctrl+B / Ctrl+I) toggle bold / italic of the whole object (every run).
  - Δ, hν, °, → insert that text at the caret (plain, not explicit).
  - Enter commits ("Edit text" or "Add text"), Shift+Enter inserts a line break, Esc cancels,
    clicking elsewhere commits. On commit the runs go through `finishText` (T4); an empty result
    deletes the text (or never creates it).
  - Re-opening a text loads it with `fromStored(runs)`: every character `explicit`, so committing
    without changes changes nothing; only newly typed characters are auto-formatted.
- **T3** **Condition position**: text centred on the arrow's midpoint along the shaft; above: the
  text's ink box bottom is `0.2 · bondLength` pt above the highest point of the arrow's ink (shaft
  and heads); below: its ink top the same distance below the lowest. Computed from render
  `extents` (two passes: place, render, shift). For a non-horizontal arrow "above" is the arrow's
  left side (travel direction), offset along the left normal.
- **T4** **`finishText(runs: EditRun[], style: { bold?, italic? }) → TextRun[]`** (pure):
  `explicit` characters keep their script; the rest are formatted:
  1. `->` becomes `→`.
  2. Typed shortcuts: `^{…}` / `_{…}` → sup / sub of the braced text; `^` / `_` followed by a
     run of `[0-9+\-−]` → sup / sub of that run (`Fe^3+`, `SO4^2-`). A `-` inside a sup becomes
     `−`. The markers are removed.
  3. Auto: a **formula token** (maximal run of `[A-Za-z0-9()\[\]]`) whose letters parse as a
     sequence of element symbols (`PERIODIC_SYMBOLS`, case-sensitive: `H2SO4`, `CH3COOH`,
     `Cu(NH3)4`, `LiAlH4`) has every digit run directly after a letter, `)` or `]` subscripted; a
     `+` or `-` ending such a token right after a letter, `)` or `]` becomes a superscript `+` /
     `−` (`H3O+`, `OH-`). Never formulas: `SN1`, `SN2`, `SNi`, `E1`, `E2`, `E1cb`, and tokens
     starting with a digit (`25`, `2nd`). Tokens are found over the whole text (explicit
     characters included), but only non-explicit characters change.
     Clarified in E26: a character that already has a script is never changed either (so the
     formatter is idempotent); a sign counts as a charge only when no letter or digit follows it
     (`NaOH+HCl` is left alone). Amended 2026-11-10 (R34): a trailing sign after a digit run is a
     charge: one element symbol plus one digit (`Fe2+`, `O2-`) makes digit and sign superscript;
     otherwise a one-digit run keeps its subscript and only the sign is superscript (`NH4+`,
     `NO3-`); a longer run gives its last digit to the charge (`SO42-`, `Cr2O72-`, `Hg22+`).
  4. Adjacent runs with equal script/bold/italic merge; bold/italic come from the object.
  `fromStored(runs)` inverts the storage form (all explicit). `labelDisplayRuns(text)` is the
  display-only formatter of L1.
  Properties: (a) explicit characters are never changed; (b) idempotence:
  `finishText(asPlainScripts(finishText(r)))` = `finishText(r)`, where `asPlainScripts` keeps
  scripts but drops `explicit`; (c) the concatenated text equals the input minus consumed
  markers, with `->` replaced.
- **T5** Text editing options (options bar while editing) as listed under "Text editing
  options"; their `aria-pressed` follows the model at the caret/selection.

### Tidy reaction

- **TR1** Scope: the selection, or everything. Row items: fragments, straight arrows, pluses, and
  free texts (no `attachedTo`); with no selection only items whose ink box intersects the band
  [min − 1.5, max + 1.5] BLU around the arrows' shaft-midpoint y values. Captions and anchored
  objects follow their atoms. No arrow in scope → notice "Nothing to tidy: draw an arrow between
  the molecules first."
- **TR2** Order: sort row items by ink-box centre x.
- **TR3** Arrows become horizontal, keeping their sense (`to.x ≥ from.x` stays rightward, else
  leftward), length = max(2.5 BLU, widest attached text ink width + 0.6 BLU). Unattached texts
  whose centre lies within 1.0 BLU of an arrow's shaft and within its span get `attachedTo` (slot
  by side).
- **TR4** Baseline: y = the ink-box centre y of the first row item. Every item is translated so its
  ink-box centre y (arrows: the shaft) equals the baseline.
- **TR5** Spacing: left to right, the gap between consecutive ink boxes is 0.6 BLU, except 0.4
  BLU on either side of a plus. The first item stays where it is.
- **TR6** Attached texts are re-placed by T3. The whole tidy is one "Tidy reaction" commit, then
  V5; running it twice changes nothing (idempotent, property-tested).

### Name field and reaction text

- **N1** Suggestions (single names only, R9): from 2 typed characters, `names.suggest(text, 8)`
  in a dropdown under the field (screen 06): width = field width, `min-width` 320, ≤ 8 rows × 36
  px, `--shadow-1`, radius 6, `role="listbox"`. Row: matched key with the typed prefix in 600
  weight (R10) left (`--type-md`); Hill formula right (`--type-sm` `--text-muted`, digits in real
  `<sub>` at 10 px). ↑/↓ highlight, Enter inserts the highlighted entry (or the typed text if
  none), click inserts, Esc closes.
- **N2** Insert: `structureFromText(text, names)`; success → `insert` placed by P7, labelled
  "Insert ethanol" (entry name, else "Insert structure"), announced "Inserted ethanol" (an info notice, no icon). The inserted items become the selection and
  the tool becomes Select; the field keeps focus and is cleared; the view is framed (V7). Failure →
  the not-found row (`not-found`, `invalid-smiles`, `invalid-molfile`); `too-large` → that
  message in the row; `empty` → nothing. A fragment with exactly two atoms joined by one bond (H₂,
  O₂, Cl₂, ...) is rotated about its centre so the bond is horizontal, the atoms in the order
  chem-core returned them (first on the left); any other fragment is untouched (R39). This applies
  to N3 parts as well.
- **N3** **Reaction text**: if the text contains an arrow token (R14) outside brackets and
  parentheses, it is a scheme. Split at arrow tokens into sides, each side at `+` outside brackets
  and parentheses (spaces optional) into parts; a part starting with an integer and a space
  (`2 H2O`) gives a coefficient text `2` before the structure. Every part goes through
  `structureFromText`; if any fails, nothing is inserted and the not-found row names that part.
  Otherwise the scheme (structures, coefficient texts, pluses, arrows of kind `forward`, or
  `equilibrium` for `<=>`/`⇌`) is laid out by TR2–TR5 as one "Insert reaction" commit, placed:
  empty doc → centred on the canvas centre; else its ink box's left edge at the document's left
  edge and its top 1.5 BLU below the document's bottom. Then V7; the inserted items are selected
  and the tool becomes Select.
  A `+` is a charge sign, not a separator, when it touches the character before it and a space,
  the end of the text, an arrow token or another `+` follows (`NH4+ + OH- -> NH3 + H2O` has two
  parts on the left); any other `+` separates. An arrow with a missing part or side (`ethanol ->`)
  does nothing. After the insert the status slot announces "Inserted reaction".
- **N4** Empty-state chips and `insert-text` commands go through N2/N3 exactly.
- **N5** The dictionary is imported as JSON and `createNameIndex` is called once per controller
  (time measured in the perf test).

### Selection actions

- **C1** Clean up: `cleanStructure(doc, scopeAtoms)`, "Clean up".
- **C2** Expand: `expandLabel` on each abbreviation atom in the selection, "Expand label".
- **C3** Kekulé ⇄ circle: scope has a 1.5 bond → `kekulize(doc, scopeAtoms)` ("Show Kekulé");
  `ChemError('cannot-kekulize')` → notice "This ring can't be shown with alternating double
  bonds." Else `aromatize(doc, scopeAtoms)` ("Show circle"); an unchanged doc records nothing and
  shows "No benzene ring here to show as a circle." (info).
- **C4** *(cut, Decision 9)*.
- **C5** Status-bar formula (`data-testid="formula"`): selection has atoms →
  `formulaOf(doc, selectedAtoms)` (whole fragments touched); else, if the document has exactly
  one fragment, its formula; else hidden. Shown as the Hill string with digits in real `<sub>`
  (≥ 10 px), the charge as a `<sup>` (`2−`, `+`), then " · " and `mw` to 2 decimals + " g/mol"
  when `mw` is not null (screen 03: "C₆H₆ · 78.11 g/mol"). The element's text content reads
  "C6H6 · 78.11 g/mol".
- **C6** Warnings button: hidden when `perception.warnings` is empty; else `warning` icon + count;
  click selects the atoms (and bonds) of the next warning in order, cycling, and reveals them.
- **C7** Formula switch (R51; `toggle-formula`): skeletal → `setStyle(doc, { formula:
  'structural' })` ("Show structural formula"); structural → `setStyle(doc, { formula:
  'skeletal' })` ("Show skeletal formula"); one commit, whole document, selection kept, tool
  unchanged. Not run on an empty skeletal document (disabled) nor while a gesture runs or an
  editor is open (`canRun` false, as Clean up). The viewport follows U13 (R53, 2026-11-12, which
  supersedes "follows R38 like a preset switch"): the zoom stays, the drawing's ink-box centre
  stays at its screen point, then V5; the same after undo or redo of a switch.

### Clipboard (in-app)

- **CB1** Copy: `extract(doc, selection)` into `state.clipboard`, remembering the centre of the
  copied selection, then `onCopy?.(sub, doc, selection)`. Cut = copy + delete (E2), "Cut".
  Paste (Ctrl+V): `insert(doc, clipboard, at)` with `at` = the source's centre shifted by
  **+1.0 BLU in x and +1.0 BLU in y** (right and down; 80 px at the default zoom), as in
  PowerPoint, wherever the pointer is. Each further paste of the same clipboard is shifted another
  (+1.0, +1.0) from the previous one; a new copy or cut resets this. After a cut the first paste
  lands at the original position (no shift), later ones cascade from there. A paste with an
  explicit point (`paste {at}`, the context-menu path) centres the copy's bounds on that point
  and does not advance the cascade. "Paste"; the pasted items become the selection, the tool
  becomes Select; then V5. Duplicate (Ctrl+D): `insert` of `extract` at the selection's centre +
  (1.0, 1.0) BLU, "Duplicate" (the copy is the selection, so repeating cascades). `paste-sub` /
  `insert-text` commands follow the same placement (text via N2/N3); a `paste-sub` fragment has no
  source and goes to the pointer, else the canvas centre.

### Context menu

- **CM1** A `contextmenu` event on the canvas is default-prevented; if a gesture is active it is
  cancelled and nothing else happens; otherwise, if the H1/H2 hit (atoms, bonds, objects) is not
  selected, selection becomes what a Select click makes (Decision 6) and the tool becomes Select
  before the event. Selected hits and empty canvas keep the selection. The controller emits `{ type: 'context-menu',
  target, screen }` with the H1/H2 hit at that point (atoms, bonds, objects only; handles and
  slots → null). App-shell shows a native menu.

### Preset

- **PR1** The status-bar switch "Slides | Handout" calls `setStyle(doc, { preset })` in one
  commit ("Switch to Handout style" / "Switch to Slides style"), then V6. The switch shows the
  document's preset. It is a two-option `radiogroup` (`role="radio"`, `aria-checked`): one tab stop
  (the selected option), arrow keys move to the other option and choose it, Home / End the ends.
  Undo and redo flip the style only; the viewport is not part of history, but it follows the
  style: whenever a document change alters the style's bond length (the switch, undo, redo),
  `switchPreset(viewport, oldBondLength, newBondLength)` keeps one bond's on-screen length and the
  drawing's centre where it was. `load` keeps its own rule (default zoom for the loaded preset).

### Errors

- **X1** Any exception from a commit recipe or chem-core call is caught by the store: history
  unchanged, gesture cleared, notice (ChemError → the rule's wording above, else its message;
  DocError → "That edit isn't possible here." and `console.error`). Nothing crashes the renderer.

---

## Settled items from AGENTS.md "Next: editor"

| Item | Decision |
|---|---|
| Selection, hit-testing, marquee | Editor's own (`hit-test.ts`, H1–H4) from `Scene.extents` and doc geometry |
| Overlays | Editor's own screen-space layer (`overlay.ts`), never in the export |
| `setStyle` op | Added to doc-model (required change 1). Preset switch is undoable |
| `createRenderer` | Not requested (R19) |
| Tidy reaction / condition positions | TR1–TR6 and T3; `attachedTo` set by the Text tool and Tidy; reactions stay unstored (inferred from layout) |
| Kekulé/circle, Clean Structure | Selection actions C1, C3 calling chem-core |
| Text size | One `fontSize` (R18) |
| compounds.json | Imported as a JSON module by the editor; `createNameIndex` once per controller (N5) |

## Model gaps (not representable; no UI, listed for later)

| Gap | Effect | Would need |
|---|---|---|
| No dotted / hydrogen bond, no dative bond | No H-bonding diagrams or coordinate bonds | a `BondStereo` or order variant (schema bump) |
| Curved-arrow anchors can't name a specific lone pair | Arrows start at the atom's label edge | an anchor offset convention shared with svg-render's slots |
| No per-object text size, no text rotation | One text size per document | schema bump |
| No op for groups or z-order | No group/ungroup, no bring-to-front | doc-model ops |
| Straight reaction arrows only | No curved (non-electron) reaction arrows | `DrawObject` variant |

## Required changes to finished modules and scaffold

Each is a task in `tasks/todo-editor.md`, done (spec first, then code) before the editor code
that depends on it.

| # | Target | Change | Spec edit |
|---|---|---|---|
| 1 | `doc-model` | Add `setStyle(doc: Doc, patch: { preset?: StylePreset; overrides?: Partial<StyleSettings> }): Doc`, draft-aware like the other ops. `preset`, when given, must be `'slides'` or `'journal'`; `overrides`, when given, replaces the whole overrides object and is validated like the `.chalk` schema (numbers finite and > 0, `fontFamily` a string, no unknown keys); otherwise `DocError('invalid-value')`. Exported from `index.ts`. **No schema or `schemaVersion` change.** Tests: preset change through `transact` and undo, overrides replace, each invalid value throws and leaves the doc unchanged | `SPEC-doc-model.md` "Public API": add under a new `// style` heading: `setStyle(doc, patch: { preset?: StylePreset; overrides?: Partial<StyleSettings> }): Doc   // preset ∈ {'slides','journal'}; overrides replaces the whole object, validated like the schema; DocError('invalid-value') otherwise. No schema change.` |
| 2 | `chem-core` | `NameIndex.closest` orders its near-spelling matches by: edit distance; then matches on a display name before matches only on a synonym; then keys of which the query is a subsequence (a pure omission typo) first; then display name. Prefix matches still come first. Regression: `closest('ethanl')` = `['ethanol', 'ethane', 'acetaldehyde', …]` and `structureFromText('ethanl', names)` fails with `suggestions[0] === 'ethanol'`; existing `etanol`, `benzne`, `aceton` tests unchanged | `SPEC-chem-core.md` "Public API", the `closest` comment becomes: `// (C8) prefix matches, then near spellings (edit distance ≤ max(1, ⌊len/4⌋)) ordered by distance, then display-name before synonym matches, then omission typos (query is a subsequence of the key), then name; feeds the 'not-found' suggestions (closest first)`. (The SPEC.md Decisions-log row was added at review.) |
| 3 | `SPEC.md` | Tech Stack: remove the Zustand row (never installed; the editor uses a hand-written store on `useSyncExternalStore`). Testing Strategy "Component" row becomes: "Vitest (node) — editor tool state machines and reducer (event sequences → document); view markup via `react-dom/server`; DOM behaviour in Playwright e2e". Decisions Log rows are added at review (done) | `SPEC.md` |
| 4 | Scaffold `src/main/index.ts` | `minWidth: 960`, `minHeight: 640`; `Menu.setApplicationMenu(null)` until app-shell defines menus (the default View menu binds Ctrl+0/Ctrl+−/Ctrl+= to page zoom and shows a menu bar) | none (scaffold). `SPEC-app-shell.md` later inherits: menus must not bind page zoom; use `shortcuts: 'canvas-only'` + `run` |
| 5 | Scaffold `src/renderer/app/App.tsx`, `app.css` | Mount `<Editor>` filling the window inside the element with `data-testid="canvas-area"` (so `e2e/smoke.spec.ts` passes); the scaffold toolbar is removed (the editor has its own top bar) | none |
| 6 | Tooling | ESLint: (a) `src/renderer/**` may import core only as `@core/<module>` (no deep paths, no relative paths into `src/core`), except test files importing `@core/<module>/__fixtures__/*`; the block repeats the `openchemlib` restriction; (b) a DOM-free block for `src/renderer/editor/{model,tools,state}/**` (bans in "Where the code lives"; repeats the named-export restriction). Probes in `tests/tooling/editor-lint.test.ts`. Playwright projects `e2e` and `shots`; npm script `shots` | none |
| — | `svg-render` | None | — |
| 7 (2026-11-12) | `doc-model` | Schema v2 `style.formula` and `setStyle`'s `formula` patch (R51) | `SPEC-doc-model.md` D1 (done with this amendment) |
| 8 (2026-11-12) | `svg-render` | Structural mode in `render` and `isLabelled(atom, n, formula)` (R51, R52); layout waits for question S1 | `SPEC-svg-render.md` Decision 15 (done with this amendment) |
| 9 (2026-11-12) | `svg-render` | S1 answered: `ResolvedStyle.ptPerBlu`, `STRUCTURAL_SCALE`, `ringAtoms(doc)` and `isLabelled`'s `inRing` (R53) | `SPEC-svg-render.md` Decision 16 (done with this amendment) |

## Testing

| Level | What | Where |
|---|---|---|
| Unit (node) | every `model/` function: geometry, viewport maths (V1–V6), P1–P7, templates (bond lengths 1.0 ± 1e-9), hit-test priority and tolerances at 25 % / 150 % / 800 %, marquee, E2, `text-edit` ops, T4 (`H2SO4`, `CH3COOH`, `Cu(NH3)4^2+`, `H3O+`, `OH-`, `SN2`, `25 °C`, `2nd`, `Pd/C`, `->`, explicit runs kept), `labelDisplayRuns`, formula runs, N3 splitting (brackets, coefficients, `[NH4+]` not split), TR1–TR6, C3, C5, overlay shapes, keymap (K2 precedence, R5, R6), patch plans | colocated `*.test.ts` |
| Tool machines (node) | per tool: event sequences → `ToolStep`s → doc after commit; preview ids equal commit ids; cancel leaves history untouched; every gesture is exactly one undo step | `tools/*.test.ts` |
| Scenarios (node) | the e2e stories replayed through the reducer with exact numbers: ethanol by gestures, toluene in 3 actions, the SC3 scheme (arrow horizontal, row centres within 0.01 BLU of the baseline, conditions centred within 0.01 BLU) | `state/scenarios.test.ts` |
| Property (fast-check) | (1) random tool-event sequences on random docs (doc-model `arbitraries.ts`) keep `checkInvariants` empty and never throw out of the reducer; (2) undo of every committed gesture restores the previous doc exactly; (3) T4 properties a–c; (4) Tidy is idempotent; (5) hit-test of an atom's own screen position returns that atom when nothing overlaps it; (6) `text-edit` ops keep offsets inside the text and never split a surrogate pair | `*.prop.test.ts` |
| Store/controller (node) | dirty tracking through edit/undo/save, `canRun`, events (incl. `context-menu`), `load`, `onCopy` payload, R7 | `state/*.test.ts` |
| View markup (node) | `renderToStaticMarkup` of rail, options bars, status bar, empty state, tooltips for given states: names, `aria-pressed`, `aria-disabled`, test ids, hidden/visible controls (R15) | `view/*.test.tsx` |
| Tooling | lifted `tokens.css` / `icons.svg` identical to the mock-ups; contrast pairs; ESLint probes | `tests/tooling/editor-*.test.ts` |
| Perf (node, perf project, timings skipped under `--coverage`) | `hitTest` on a 500-atom doc < 0.5 ms median; one bond-drag preview step (tool + render with cached perception) on the 40-atom scheme < 10 ms median; `tidyReaction` on the 4-molecule scheme < 25 ms; `createNameIndex(compounds.json)` < 30 ms. 2026-11-12 (R52): the `hitTest` and bond-drag scenes also run in structural mode with the same budgets | `src/renderer/editor/perf.test.ts` |
| E2E (Playwright `_electron`, built app) | `e2e/editor-*.spec.ts`: layout boxes, focus order, drawing stories, name field, text editor DOM ↔ runs, zoom, preset, frame-time probe | `e2e/` |
| Screenshots | `e2e/shots/<task-id>.shot.ts` → `out/shots/<task-id>/<name>.png` via `npm run shots` (R16); each UI task names its shots | `e2e/shots/` |
| Manual (Windows) | "Editor" section of `docs/windows-checklist.md` | checklist |

Coverage: `src/renderer/editor` ≥ 70 % lines with `npm test -- --coverage`; no file excluded to
reach it.

## Performance

| Budget | Where measured |
|---|---|
| Pointer move → next paint, whole-fragment drag of a 40-atom scheme (fast path): p95 ≤ 16 ms | e2e frame-time probe, Windows |
| Pointer move → next paint, bond-drag preview and partial-selection drag in a 100-atom doc: p95 ≤ 16 ms | e2e frame-time probe, Windows |
| Commit → paint for any single gesture on a 100-atom doc: ≤ 50 ms | e2e |
| Cold start to usable canvas (with name index): < 3 s (`SPEC.md` SC1) | e2e smoke timing |

The profiling task records medians and p95 in `docs/editor-perf.md`. A miss after the fast path
leads to a request for svg-render's `createRenderer` (svg-render spec change first, R19); budgets
are never loosened.

Measured 2026-11-10 (E32; Intel Core i5-11400H, 16 GB, Windows 11; details and the definition of a
frame sample in `docs/editor-perf.md`). No budget was missed, so `createRenderer` is not requested.

| Scenario | Budget | Measured | Date |
|---|---|---|---|
| `hitTest`, 500-atom document (node, median) | < 0.5 ms | 0.14 ms | 2026-11-10 |
| One bond-drag preview step, 40-atom scheme (node, median) | < 10 ms | 0.62 ms | 2026-11-10 |
| `tidy` on the 4-molecule scheme (node, median) | < 25 ms | 1.5 ms | 2026-11-10 |
| `createNameIndex(compounds.json)` (node, median) | < 30 ms | 0.56 ms | 2026-11-10 |
| Whole-fragment drag, 40-atom scheme (e2e, p95) | <= 16 ms | 3.5 ms | 2026-11-10 |
| Bond-drag preview, 100-atom doc (e2e, p95) | <= 16 ms | 2.9 ms | 2026-11-10 |
| Partial-selection drag, 100-atom doc (e2e, p95) | <= 16 ms | 1.8 ms | 2026-11-10 |
| Commit to paint, 100-atom doc (e2e, worst of 9) | <= 50 ms | 12 ms | 2026-11-10 |
| Cold start to usable canvas (e2e) | < 3 s | 0.44 s | 2026-11-10 |

## Success Criteria

1. A first-time user draws ethanol and benzene with no instructions: `e2e/editor-structures.spec.ts`
   draws ethanol by gestures (Bond click on empty canvas, hover the end atom, `O`) and
   `[data-testid=formula]` reads "C2H6O · 46.07 g/mol"; a Ring click places benzene ("C6H6 ·
   78.11 g/mol"). Shots `E20/hover-key-O.png`, `E21/toluene.png`.
   **Partly proven:** `e2e/editor-structures.spec.ts`, shots `E20/hover-key-O.png`, `E21/toluene.png`. **Manual, pending:** the "no instructions" part is a human judgement (first-use pass, `docs/windows-checklist.md` Checkpoint R). Update 2026-11-12: ticked there from the owner's own hand check (check 1 of the owner's list of 31, details not reported per item).
2. Toluene in ≤ 3 actions (Ring, click canvas, hover a ring atom + `1`) and the SC3 reaction
   ("ethanol + acetic acid -> ethyl acetate + water", H₂SO₄ above, Δ below) in ≤ 15 actions,
   aligned: `state/scenarios.test.ts` (exact, 0.01 BLU) and `e2e/editor-reaction.spec.ts`
   (action counter; part boxes aligned within 1 screen px).
   **Proven:** `state/scenarios.test.ts`, `e2e/editor-reaction.spec.ts`.
3. Every gesture in "Behaviour rules" has a tool-machine test, commits exactly one undo step, and
   undo restores the previous doc exactly (property 2).
   **Proven:** tool-machine tests (`tools/*.test.ts`) and property 2 in `state/editor.prop.test.ts`.
4. No reachable event sequence produces an invalid document or an uncaught exception (property 1,
   1,000 runs, explicit timeout).
   **Proven:** property 1 in `state/editor.prop.test.ts` (1,000 runs).
5. All ten tools, every option, every selection action and every K1 command are reachable by
   keyboard, every control shows a focus ring and has an accessible name:
   `e2e/editor-keyboard.spec.ts` (keyboard-only walkthrough inserting ethanol, selecting all,
   flipping, undoing).
   **Proven:** `e2e/editor-a11y.spec.ts` (keyboard-only walkthrough, every tool and option by arrows and Enter, selection actions, Esc from the name dropdown and both editors, rings on every button, names against tooltips, `role` and `aria-*` wiring), `e2e/editor-keyboard.spec.ts` (tab order, roving stops), shots `E33/keyboard-walkthrough-*.png`, `E33/focus-*.png`. Not literally proven for every K1 row: Ctrl+Shift+L is asserted to run without changing a clean structure; its geometry is covered by reducer tests only.
6. Contrast pairs pass (`tests/tooling/editor-tokens.test.ts`); lifted `tokens.css` and
   `icons.svg` equal the mock-up files; hit targets ≥ 24 px (`e2e/editor-layout.spec.ts` boxes).
   **Proven:** `tests/tooling/editor-tokens.test.ts` (spec pairs plus every colour pair `editor.css` uses), `e2e/editor-a11y.spec.ts` (hit targets). The preset segments are 64 x 24 (R41), so every status-bar control meets 24 px; `--border-control` reaches 3 : 1 on rest, hover and pressed (R42).
7. The window matches the approved mock-ups: `e2e/editor-layout.spec.ts` measures the region and
   control boxes in "Layout" at 1280×800 and 960×640 (±1 px), and the named shots of every UI task
   exist for side-by-side review with `out/mockups/*.png`.
   **Partly proven:** `e2e/editor-layout.spec.ts` boxes; **Manual, pending:** the side-by-side shot review (`docs/windows-checklist.md` Checkpoint R). Update 2026-11-12: ticked there from the owner's own hand check (check 13 of the owner's list of 31, details not reported per item).
8. Valence warnings appear as overlays with their message on hover and never in exports: an
   overlay unit test for a doc with an `H20` label, an e2e hover over it showing chem-core's
   message `Unknown label "H20".` (shot `E24/warning-tooltip.png`), and a unit test that `renderSvg(doc)` of that doc
   contains no `#b42318`.
   **Proven:** overlay unit test, `e2e/editor-warnings.spec.ts`, shot `E24/warning-tooltip.png`, svg-render no-`#b42318` test.
9. Name insert: exact names insert, prefixes suggest, misspellings show "Did you mean" with the
   closest first ("ethanl" → ethanol), reaction text builds a tidy scheme (unit + e2e).
   **Proven:** `state/reducer-name.test.ts`, `e2e/editor-name.spec.ts`, `e2e/editor-reactions.spec.ts`.
10. Performance budgets met on Windows and node perf budgets pass.
   **Partly proven:** `src/renderer/editor/perf.test.ts` (node) and `e2e/editor-perf.spec.ts` on the development machine (table in "Performance"). **Manual, pending:** the owner's laptop (`docs/windows-checklist.md` E32 and Checkpoint R). Update 2026-11-12: Checkpoint R is ticked from the owner's own hand checks; "Pen or touch" is ticked as not applicable (the owner says the teacher uses mouse or touchpad only, not run); E32 stays open and is not claimed. Note 2026-11-12 (owner decision): the development machine is not the teacher's laptop, so the E32 run on that laptop stays open.
11. `npm run check` green; `src/renderer/editor` ≥ 70 % line coverage; the DOM-free lint block
    and boundary probes pass.
   **Proven:** `npm run check` green; `npm test -- --coverage` reports `src/renderer/editor` at 85.5 % lines (model 99.4, state 99.5, tools 98.7, view 27.1) with a 70 % threshold enforced in `vitest.config.mts`; lint probes in `tests/tooling/`.
12. The editor runs in the scaffold window with no app-shell code beyond the listed scaffold
    changes; `e2e/smoke.spec.ts` passes.
   **Proven:** `e2e/smoke.spec.ts` and the whole e2e suite run in the scaffold window.
13. (F1, R50; automated unless marked) Number keys: `keymap.test.ts` asserts, for every tool,
    digit → `select-tool` with nothing hovered, over an object and over an atom or bond with Erase
    and Text; `1` `2` `3` over an atom → sprout and over a bond → order with every other tool;
    `4`…`0` over an atom or bond → their tools; Ctrl+1 / Ctrl+0 still zoom (2026-11-12, R59: Ctrl+0 zooms to fit; Ctrl+1 returns `null`, it is app-shell's; zoom to 100 % has no key); Alt/Meta+digit and a
    held (repeated) digit do nothing; a digit in the name field, the label editor and the text
    editor is typed text. View markup (`ToolRail.test.tsx`): every rail button has the badge
    (`aria-hidden`, its digit), `aria-label` = the tool name, `aria-keyshortcuts` = digit and
    letter. Task N5b adds what N4 and N5 left out: a held digit, digits in the name field, label editor and text editor, numpad digits and the shifted-digit-row rule (R50). E2E (`e2e/editor-keyboard.spec.ts`): pressing `1`…`0` on the canvas selects each tool
    in turn; hovering a ring atom with Ring active then `1` sprouts a bond (toluene, SC2 unchanged).
    `e2e/editor-a11y.spec.ts`: badge boxes lie inside their 56×48 buttons, buttons unchanged in
    size, tooltip names both keys. Shots `N5/rail-badges.png` and `N5/rail-tooltip.png` (`e2e/shots/N5.shot.ts`) compared
    with mock-ups 03 and 10 by eye (human).
14. (F2, R51, R52; automated unless marked) Formula switch: `OptionsBar.test.tsx` (labels, icons,
    `aria-label`, disabled on an empty document, enabled when structural); reducer tests: one
    commit, one undo step, undo and a second switch each give a doc deep-equal to the start, the
    selection and tool are kept, `isDirty` is false after switching twice; R37's default bend
    uses `isLabelled(..., formula)`; HV4 suppresses the ghost over a structural carbon; U11's
    label editor text. E2E (`e2e/editor-formula.spec.ts`): the button flips the drawing and back,
    Ctrl+Z restores, at 960×640 the Select bar (with Expand) does not overflow
    (`scrollWidth <= clientWidth`). The node perf budgets pass with a structural-mode variant of
    the bond-drag preview scene (same budget). Structural canvas (R53, U13, U14): unit tests that
    every BLU ↔ screen conversion uses `ptPerBlu` (a structural doc's atom lies under the pointer
    that placed it; hit-test, Tidy, P7 and T3 give the same BLU results as the oracle of svg-render
    Decision 16 predicts), that a switch keeps the zoom and the ink-box centre and then reveals,
    and that V2's default zoom of a structural document is the skeletal one; e2e: after the switch
    the bond between ethanol's carbons measures twice its skeletal screen length within 1 px and a
    label's font size is unchanged. Shots `N7/select-bar.png`, `N7/select-bar-abbrev.png` and
    `N7/select-bar-960.png` are compared with mock-ups 03, 03b and shell A15c by eye, and
    `N7/structural-canvas.png` (ethanol, toluene and acetic acid after "Show structural") is
    compared with the structural goldens on the golden sheet.

## Boundaries (module-specific)

- **Always:** edit only through doc-model ops inside `transact`; read chemistry only from
  chem-core and pixels only from svg-render; keep `model/`, `tools/`, `state/` DOM-free; keep
  tolerances in screen px; use tokens (no raw colours or sizes in components or `editor.css`);
  give every control an accessible name, tooltip and test id; name the screenshots each UI task
  produces.
- **Ask first:** any new dependency (jsdom, Zustand, an icon set); any `Atom`/`Bond`/`DrawObject`
  or `StyleSettings` field; asking svg-render for `createRenderer` or any new option; adding a
  visible control not listed here; creation UI for anything in "Left out".
- **Never:** draw overlays into svg-render output or exports; hold ids across undo/redo; import
  `openchemlib` or deep core paths; open a modal dialog for a routine message; use network, fonts
  or icons from outside the repo; edit `tokens.css` or `icons.svg` in `src/` without changing the
  mock-up files first; use ChemDraw's names, icons or assets.

Corrective implementation note (2026-11-10): right-chord cancellation previously listened only
for pointerdown, missing Chromium's chorded pointermove; its right-up then queued hover while
the primary button was held. The view detects that transition and gates hover on buttons=0.
