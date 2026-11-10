# Spec: `editor`

Shared stack, commands, style and boundaries: see `SPEC.md`. Module map: `CAPABILITY-MAP.md`.
Depends on: `doc-model`, `chem-core`, `svg-render` (public `index.ts` entries only).
Status: **draft 2026-11-10**, awaiting approval. Nothing is implemented until it is approved.

Audience: a grade 11–12 chemistry teacher in Nepal (NEB curriculum) making slides and handouts on
a Windows laptop, often 1366×768, no network. Not a power user of drawing software. The test for
every choice below: *can they open the app and draw ethanol or a benzene ring without reading
anything?*

## Objective

The interactive canvas and every drawing tool. The teacher draws structures and reaction schemes
by clicking, dragging and typing; the canvas shows exactly what svg-render will export, with the
editor's own overlays (hover, selection, handles, warnings, guides, ghosts) on top. Every edit is
one doc-model transaction, so undo always works.

User stories served (`SPEC.md`): 1 (bonds, labels, ring templates), 2 (name insert, arrows,
conditions with auto-subscript, Tidy reaction), 3 (curved arrows, lone pairs, radicals, charges,
δ+/δ−), 4 (free text, compound numbers; the rest of story 4 is deferred, see "Left out"),
5 (formula/MW of the selection, valence warnings). Stories 6 and 7 belong to `clipboard-export`
and `app-shell`; the editor exposes the seam they use.

## Scope

**In:** window chrome inside the renderer (top bar, tool rail, status bar), the canvas (pan,
zoom, mounting svg-render parts), overlays, hit-testing, selection and transforms, every tool and
gesture in "Tools and gestures", the name/SMILES insert field, label and text editors, Clean up,
Kekulé ⇄ circle, Expand, Number, Tidy reaction, preset switching, in-app copy/paste, undo/redo,
keyboard shortcuts, dirty state, the controller API for the host.

**Out:** menus, file dialogs, save/open, recent files, settings, window creation (`app-shell`);
system clipboard formats, export, embedding (`clipboard-export`); any chemistry decision
(`chem-core`); how anything looks in the export (`svg-render`); creation UI for brackets, callouts,
highlight shapes, colours, atom numbers and isotopes (deferred, phase E7, needs approval). Items of
those kinds that arrive in a file are drawn, hit-tested, selected, moved and deleted like any
other object.

## Facts relied on

| Fact (source) | Consequence |
|---|---|
| Ops `addAtom`, `addBond`, `updateAtom`, `updateBond`, `addObject`, `updateObject`, `deleteItems`, `mergeAtoms`, `transformItems`, `insert`, `extract`, `everything`, `fragments`, `neighbors`, `findBond`, `resolveAnchor`, `bounds`, `paintLayers` exist and are draft-aware (`doc-model/index.ts`) | Every edit is a recipe of these ops inside one `transact` |
| `transact(h, label, recipe, { coalesceKey })`; errors in the recipe propagate and leave `h` unchanged; a no-op recipe records nothing (`history.ts`) | One gesture = one `transact`; nudges coalesce; failures are caught by the store |
| Undo restores `nextId`; ids may be reissued (`SPEC-doc-model.md`) | Selection, hover and editors are cleared on undo/redo; nothing holds ids across them |
| A bond's `a1`/`a2` are immutable; the wedge narrow end is `a1` | Reversing a wedge = delete the bond and add it reversed in the same transaction |
| No doc-model op sets `doc.style`, creates a group or reorders `zOrder` | `setStyle` is requested ("Required changes"); groups and z-order get no UI |
| `insert(doc, sub, at)` lands the sub-doc's origin at `at`; `SubDoc`s are centred on the origin | Templates, name inserts and pastes are `SubDoc`s placed by their centre |
| `render(doc, { perception })` → `Scene { parts, bounds, extents, style }`, pt units, keyed parts; `toSvg`; `bluToPt`, `ptToBlu`, `resolveStyle`, `STYLE_PRESETS` (`svg-render/index.ts`). No memoising renderer (cut for v1) | Canvas mounts keyed parts and patches changed ones; budgets below are measured before asking for `createRenderer` |
| `createPerceiver()` memoises per fragment; `Perception.warnings: ChemWarning[]` with `code`, `atoms`, `bonds`, `message` | One perceiver per controller; warnings drive the warning overlay |
| `interpretLabel(text)` → `element` (+ `hCount`, `charge`) / `abbreviation` (`key`, `element`) / `unknown` | Label editor commits through it |
| `structureFromText(text, names)` → `Result<{ sub, source, entry? }, ChemError>`; `not-found` carries `suggestions`; `NameIndex.suggest(prefix, limit)`, `closest`; `createNameIndex(json)` | Name field: suggestions while typing, insert on Enter, "did you mean" on failure |
| `cleanStructure(doc, atoms)`, `kekulize(doc, atoms?)` (throws `ChemError('cannot-kekulize')`), `aromatize(doc, atoms?)`, `expandLabel(doc, atom)` (throws `unknown-label`), `formulaOf(doc, atoms)` → `Formula { text, mw }` | Selection actions and the status-bar formula |
| `emptyDoc` uses preset `slides`; presets: slides bond 40 pt, journal 14.4 pt | Default zoom per preset (rule V2) |
| `package.json` has React 19.3.1, Immer, Zod; **no Zustand, no jsdom, no Testing Library**; Vitest `environment: 'node'` | No new dependency: a 40-line store on `useSyncExternalStore`; logic is tested in node, DOM behaviour in Playwright e2e |
| Scaffold: `src/main/index.ts` window 1280×800, min 800×500, no `Menu` call (Electron's default menu, whose View items zoom the whole page on Ctrl+0/Ctrl+−/Ctrl+=); CSP allows inline styles and `data:` images, no inline scripts | Min size and menu changes are requested ("Required changes"); custom cursors use `data:` SVG |
| `resources/compounds/compounds.json` (406 entries, 74 KB; has ethanol, water, benzene, acetic acid, ethyl acetate, toluene, `h2o`) | Imported as a JSON module by the editor and indexed once |

---

## UI design

### Layout

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ [⌕ Type a compound name…        ] │ (tool options, contextual)        [↶] [↷] │ 48 px top bar
├──────┬────────────────────────────────────────────────────────────────────────┤
│  ⬚   │                                                                        │
│  ⌫   │                                                                        │
│ ──── │                                                                        │
│  ╱   │                         canvas (white)                                 │
│  ⌇   │                                                                        │
│  ⬡   │                                                                        │
│  C   │                                                                        │
│ ──── │                                                                        │
│  →   │                                                                        │
│  +   │                                                                        │
│  ↷   │                                                                        │
│  T   │                                                                        │
├──────┴────────────────────────────────────────────────────────────────────────┤
│ Click to add a bond. Drag to aim it.     C₂H₆O · 46.07 g/mol  ⚠ 1  Slides│Journal  − 100% + ⤢ │ 28 px
└───────────────────────────────────────────────────────────────────────────────┘
  56 px rail
```

| Region | Size | Holds | Resizing |
|---|---|---|---|
| Top bar | full width × 48 px, padding 0 12 px | name field (left, x = 12, width `clamp(240px, 26vw, 360px)`, height 32), 1 px divider (24 px tall) 12 px right of it, tool options bar (flex, left-aligned, 12 px after the divider), Undo and Redo (right, 32×32 each, 4 px apart, 12 px from the right edge) | Options bar takes the slack; if it would be narrower than its content (never at ≥ 960 px), it scrolls horizontally with no visible scrollbar |
| Tool rail | 56 px wide, from below the top bar to above the status bar | 10 tool buttons, 40×40, centred (x = 8), first at y = 8, 4 px apart in a group; groups separated by a 1 px × 32 px divider with 8 px above and below | Fixed width; if the window is shorter than the rail content (never at ≥ 640 px), the rail scrolls vertically |
| Canvas | the rest | white drawing surface, overlays, empty state, label/text editors | Fills; resizing keeps the document point under the canvas centre fixed |
| Status bar | full width × 28 px, padding 0 12 px | left: hint or notice (flex, ellipsis); right, 16 px apart: formula, warnings button, preset switch, zoom cluster | Hint truncates first; formula hides below 1000 px width |

- Minimum window **960 × 640** (fits a 1366×768 laptop with taskbar; requested from app-shell).
- Borders: 1 px `--border` under the top bar, right of the rail, above the status bar. No other
  boxes or panels.
- Rationale: a single left rail of 10 big tools mirrors what the teacher knows from Paint and
  PowerPoint; variants of the active tool are always visible in the top bar (no hidden flyouts to
  discover); the name field sits top-left where the eye lands first, because typing "ethanol" is
  the fastest way to a structure for this user.

### Tool rail (visible-control inventory)

| # | Group | Tool | Key | Icon | Options bar shows |
|---|---|---|---|---|---|
| 1 | Pick | Select | `V` | `select` | Selection actions (below) |
| 2 | Pick | Erase | `E` | `erase` | nothing |
| 3 | Structure | Bond | `B` | current bond variant | Single, Double, Triple, Wedge, Hash, Wavy |
| 4 | Structure | Chain | `Z` | `chain` | nothing |
| 5 | Structure | Ring | `R` | current template | Benzene, Cyclopropane, Cyclobutane, Cyclopentane, Cyclohexane, Cycloheptane, Chair |
| 6 | Structure | Atom | `L` | current item (element symbol as text, or mark icon) | C H N O S P F Cl Br I · ⊕ ⊖ Lone pair, Radical, δ+, δ− |
| 7 | Reaction | Arrow | `A` | current arrow kind | Reaction, Equilibrium, Resonance, Retrosynthesis, No reaction |
| 8 | Reaction | Plus | `+` | `plus` | nothing |
| 9 | Reaction | Curved arrow | `M` | current head | Electron pair, Single electron |
| 10 | Reaction | Text | `T` | `text` | nothing (while editing any text: see "Text editing options") |

Tool keys work when the canvas has focus and no atom or bond is hovered (hover keys win, rule K2).

**Selection actions** (options bar when Select is active), left to right, 8 px apart:

| Control | Kind | Enabled when | Does |
|---|---|---|---|
| Clean up | icon + label | doc has ≥ 1 fragment with ≥ 2 atoms | `cleanStructure` on the selection's atoms, or all atoms if nothing is selected |
| Show Kekulé / Show circle | label, fixed width 104 px | scope has an order-1.5 bond (→ "Show Kekulé") or a ring bond of order 2 (→ "Show circle") | `kekulize` / `aromatize` on the scope (rule C3) |
| Tidy reaction | icon + label | doc has ≥ 1 straight arrow | Rule T1, on the selection or everything |
| Number | icon, tooltip "Number the molecule" | ≥ 1 fragment selected | Rule C4 |
| Flip horizontal / Flip vertical | 2 icons | selection non-empty | `transformItems` with `scaling(-1, 1, c)` / `scaling(1, -1, c)`, c = centre of the selection's ink box |
| Expand | label | selection contains an abbreviation atom (`Ph`, `CO2H` …) | `expandLabel` on each |

**Text editing options** (replace the options bar content while a text editor is open, any tool):
Subscript `x₂`, Superscript `x²`, Bold `B`, Italic `I`, then inserts Δ, hν, °, →.

### Left out (deliberately not on screen)

| Left out | Why |
|---|---|
| Grid and rulers | Angle snapping, fixed bond length and Tidy reaction give alignment; a grid is visual noise on a slide-drawing canvas |
| Hidden flyouts / press-and-hold menus | Teachers do not discover them; the active tool's variants are always shown in the options bar |
| Context (right-click) menu | Duplicates the options bar and keys; one place per action. Right-click does nothing (cancels a gesture) |
| Scale handles | Bond length is the document's scale (style); stretching a molecule makes wrong bond lengths |
| Bold bonds, δδ±, isotopes, atom numbers, colours, brackets, callouts, highlight shapes | Rare at grade 11–12 basics; each adds controls. Drawn and editable (move/delete) when present in a file. Candidate phase E7 after the owner uses v1 |
| Style panel (bond length, line width, font) | Two presets cover slides and handouts; overrides stay possible in the file |
| Periodic-table picker | 10 common elements in the options bar; any other element or group is typed (label editor) |
| Group / ungroup, bring to front | doc-model has no op; clicking an atom already selects the whole molecule |
| Template library beyond rings | Name insert covers amino acids, sugars, aspirin … (406 compounds) |
| Layers, inspector, minimap, rotation readouts | Noise for this user |
| File, print, export, copy-as-image buttons | `app-shell` / `clipboard-export` (menus and shortcuts there) |

### Visual language (design tokens)

Defined once as CSS custom properties in `src/renderer/editor/view/tokens.css`. Contrast ratios
are WCAG 2.x, computed.

**Colour**

| Token | Hex | Used for | Contrast |
|---|---|---|---|
| `--chrome-bg` | `#F5F6F8` | top bar, rail, status bar | — |
| `--canvas-bg` | `#FFFFFF` | canvas, name field, editors | — |
| `--border` | `#DADDE3` | region dividers (decorative) | — |
| `--border-control` | `#7A828E` | name field and editor borders | 3.88 on `#FFFFFF`, 3.59 on chrome (≥ 3:1 non-text) |
| `--text` | `#1F2328` | primary text and icons | 14.61 on chrome, 15.80 on white |
| `--text-muted` | `#5B6270` | hints, formulas, placeholders | 5.67 on chrome, 6.13 on white |
| `--text-disabled` | `#9AA1AD` | disabled controls | 2.40 (disabled controls are exempt, WCAG 1.4.3) |
| `--hover-bg` | `#E9EBEF` | control hover | `--text` on it 13.24 |
| `--pressed-bg` | `#DDE1E7` | control pressed | `--text` on it 12.04 |
| `--accent` | `#1F5FD1` | focus ring, selection, active indicator bar, canvas hover/selection | 5.81 on white, 5.37 on chrome, 4.88 on `--active-bg` |
| `--active-bg` | `#E3ECFB` | selected tool / option background | — |
| `--active-fg` | `#1A4FB0` | selected tool / option icon and label | 6.33 on `--active-bg`, 5.65 on `--active-hover-bg` |
| `--active-hover-bg` | `#D2E0F8` | selected + hover | — |
| `--warning` | `#B42318` | valence warnings, error notices, not-found message | 6.57 on white, 6.08 on chrome, 5.75 on `--warning-bg` |
| `--warning-bg` | `#FDECEA` | not-found row background | `--text` on it 13.81 |
| `--tooltip-bg` / `--tooltip-fg` | `#1F2328` / `#FFFFFF` | tooltips | 15.80 |
| `--empty-art` | `#C9CED6` | empty-state illustration (decorative) | — |

Canvas overlays use `--accent` with alpha: hover fill 16 %, selection fill 24 %, marquee fill 8 %.
Ghost previews are the real parts at opacity 0.45.

**Type**: `--font-ui: 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif` (all ship
with Windows 10/11; nothing is bundled or fetched). Canvas text is svg-render's (`fontFamily`).

| Token | Size / line height | Weight | Used for |
|---|---|---|---|
| `--type-xs` | 12 / 16 px | 400 | status bar, tooltips, editor captions |
| `--type-sm` | 13 / 18 px | 400; 600 for element symbols and active labels | options bar, buttons, dropdown formulas |
| `--type-md` | 14 / 20 px | 400 | name field, dropdown names, empty-state text |
| `--type-rail` | 15 / 20 px | 600 | element symbol shown on the Atom rail button |

Numbers in the status bar use `font-variant-numeric: tabular-nums`.

**Spacing scale**: 2, 4, 8, 12, 16, 24, 32 px (`--space-1` … `--space-7`). No other values.
**Radii**: `--radius-sm` 4 px (buttons, tooltips, handles), `--radius-md` 6 px (fields, editors,
dropdown). **Elevation**: `--shadow-1` `0 4px 12px rgba(31,35,40,.12), 0 0 0 1px #DADDE3`
(dropdown, label/text editors); `--shadow-2` `0 2px 6px rgba(31,35,40,.20)` (tooltip). Nothing
else has a shadow. **Motion**: tooltip and dropdown fade 120 ms ease-out; viewport pans after
insert 160 ms ease-out; none at all under `prefers-reduced-motion: reduce`.

**Icons**: hand-drawn inline SVG in one file `src/renderer/editor/view/icons.tsx` (named exports,
one component per icon, no icon library). Grid 24×24 `viewBox`, stroke 1.5, `stroke-linecap` and
`stroke-linejoin` round, `fill="none"` unless "filled", colour `currentColor`, 2 px safe margin.
Rendered at 24 px in the rail, 20 px in the options bar and top bar, 16 px in the status bar.
Text-glyph buttons (elements, δ+, δ−, x₂, x², B, I, Δ, hν, °) use `--font-ui`, not SVG.

| Icon | Glyph (coordinates in the 24 grid) |
|---|---|
| `select` | arrow cursor outline: `M6 3 L6 19 L10.5 14.8 L13.5 21 L16 19.8 L13 13.8 L19 13.5 Z` |
| `erase` | eraser block: `M4.5 15.5 L13.5 6.5 Q15 5 16.5 6.5 L19.5 9.5 Q21 11 19.5 12.5 L12 20 H7.5 Z`; seam line 9,11 → 14,16; floor line 12,20 → 20,20 |
| `bond-single` | line 5,19 → 19,5 |
| `bond-double` | lines 4,16.5 → 16.5,4 and 7.5,20 → 20,7.5 |
| `bond-triple` | lines 3.5,15.5 → 15.5,3.5; 5,19 → 19,5; 8.5,20.5 → 20.5,8.5 |
| `bond-wedge` | filled triangle 5,19 / 17.6,4.4 / 19.6,6.4 |
| `bond-hash` | 6 strokes perpendicular to 5,19 → 19,5 at t = 1/12, 3/12 … 11/12, half-length 0.4 + 2.2 t |
| `bond-wavy` | `M4 20 q1.5 -3.5 3 -3 t3 -3 t3 -3 t3 -3 t3 -3` (smooth wave along the diagonal) |
| `chain` | polyline 3,16 7.5,8 12,16 16.5,8 21,16 |
| `ring-benzene` | hexagon, vertex up, centre 12,12, circumradius 8 (12,4 18.93,8 18.93,16 12,20 5.07,16 5.07,8); circle r 4.2 |
| `ring-3` | triangle 12,4.5 19.5,18 4.5,18 |
| `ring-4` | square 6,6 18,6 18,18 6,18 |
| `ring-5` | regular pentagon, vertex up, centre 12,12.8, circumradius 8 |
| `ring-6` | the benzene hexagon without the circle |
| `ring-7` | regular heptagon, vertex up, centre 12,12.5, circumradius 8.5 |
| `ring-chair` | closed polyline 3,13.5 7.5,9.5 13,11 21,9.5 16.5,14.5 11,13 (the chair template scaled) |
| `arrow-forward` | line 3,12 → 16,12; filled head 21,12 / 15.5,9 / 15.5,15 |
| `arrow-equilibrium` | line 3,9.5 → 21,9.5 with barb 21,9.5 → 17,6.5; line 21,14.5 → 3,14.5 with barb 3,14.5 → 7,17.5 |
| `arrow-resonance` | line 7,12 → 17,12; filled heads 3,12 / 8,9 / 8,15 and 21,12 / 16,9 / 16,15 |
| `arrow-retro` | lines 3,9.5 → 17,9.5 and 3,14.5 → 17,14.5; chevron 15,6 → 21,12 → 15,18 |
| `arrow-nogo` | `arrow-forward` plus cross 7,9 → 11,15 and 11,9 → 7,15 |
| `plus` | lines 12,5 → 12,19 and 5,12 → 19,12 |
| `curved-full` | `M4 19 Q6 5 18 8.5`; filled head 21,9.5 / 16.2,5.6 / 15.4,11 |
| `curved-fishhook` | same curve; one barb only: filled 21,9.5 / 16.2,5.6 / 17.5,9 |
| `text` | lines 6,5 → 18,5; 12,5 → 12,19; 9.5,19 → 14.5,19 |
| `mark-plus` | circle 12,12 r 7; lines 12,8.5 → 12,15.5 and 8.5,12 → 15.5,12 |
| `mark-minus` | circle 12,12 r 7; line 8.5,12 → 15.5,12 |
| `mark-lone-pair` | filled circles r 2.2 at 8.5,12 and 15.5,12 |
| `mark-radical` | filled circle r 2.6 at 12,12 |
| `search` | circle 10.5,10.5 r 6; line 15,15 → 20,20 |
| `undo` | `M9 5 L4 10 L9 15` and `M4 10 H14.5 A5 5 0 0 1 14.5 20 H11` |
| `redo` | `undo` mirrored about x = 12 |
| `zoom-in` / `zoom-out` | line 6,12 → 18,12 (+ line 12,6 → 12,18 for zoom-in) |
| `fit` | four corners: `M4 9 V4 H9`, `M15 4 H20 V9`, `M20 15 V20 H15`, `M9 20 H4 V15` |
| `warning` | triangle `M12 3.5 L21 19.5 H3 Z`; line 12,9.5 → 12,14; filled dot 12,17 r 1 |
| `clean-up` | hexagon centre 10,13 circumradius 6 (vertex up); sparkle lines 19,2.5 → 19,8.5 and 16,5.5 → 22,5.5 |
| `tidy` | outline rects 2.5,9 4×6 and 17.5,9 4×6; arrow 8.5,12 → 14,12 with filled head 16,12 / 13.5,10.5 / 13.5,13.5; line 2,20 → 22,20 |
| `number` | hexagon centre 12,8 circumradius 5 (vertex up); `M11 16 L12.5 14.5 V21` and `M10.5 21 H14.5` |
| `flip-h` | dashed line 12,3 → 12,21 (dash 2 2); filled triangle 10,6 / 10,18 / 3,18; outline triangle 14,6 / 14,18 / 21,18 |
| `flip-v` | `flip-h` rotated 90° about 12,12 |

### Control states

All controls are `<button>` (or `<input>`) elements with `aria-label` and, where they select,
`aria-pressed`. Focus ring everywhere: `outline: 2px solid var(--accent); outline-offset: 2px`,
only on `:focus-visible`.

| Control | Rest | Hover | Pressed | Selected / active | Disabled |
|---|---|---|---|---|---|
| Rail button 40×40, radius 4 | transparent, icon `--text` | `--hover-bg` | `--pressed-bg` | `--active-bg`, icon `--active-fg`, plus a 3×20 px `--accent` bar at x = 0 of the rail, vertically centred on the button (non-colour cue); selected + hover `--active-hover-bg` | never disabled |
| Options button 28×28 (icon or text glyph; text buttons are auto-width, min 28, padding 0 8) | transparent, `--text` | `--hover-bg` | `--pressed-bg` | `--active-bg`, `--active-fg`, 600 weight for text; a 2 px `--accent` underline 16 px wide, centred, 2 px above the bottom edge | `--text-disabled`, no hover, `aria-disabled`, still focusable, tooltip says why ("Select a molecule first") |
| Action button (icon + label, height 28, padding 0 8, gap 6) | as options button | as options | as options | — | as options |
| Undo / Redo 32×32 | transparent, `--text` | `--hover-bg` | `--pressed-bg` | — | `--text-disabled` when `canUndo`/`canRedo` is false |
| Name field 32 high, radius 6, padding 0 8 0 32, icon at x 8 | `--canvas-bg`, 1 px `--border-control`, placeholder `--text-muted` | border `--text-muted` | — | focused: 2 px `--accent` border (no extra outline) | — ; not-found: 1 px `--warning` border |
| Status controls (warnings, zoom −/+, fit) 24×24; zoom % text button 48×24; preset switch two segments 64×24 | transparent, `--text-muted` | `--hover-bg`, `--text` | `--pressed-bg` | preset segment: `--active-bg`, `--active-fg`, 600 | zoom −/+ disabled at 25 % / 400 % |
| Dropdown row 36 high | transparent | `--hover-bg` | — | keyboard-highlighted: `--active-bg` (`aria-selected`) | — |

**Tooltips**: on every icon-only control and every rail/options button. Show after 500 ms hover
or on keyboard focus; once one is shown, the next appears with no delay until the pointer has
been off all tooltipped controls for 300 ms. Placement: right of rail buttons (8 px gap), below
top-bar controls, above status-bar controls; flipped if clipped. Content: name, then the key in a
`kbd` chip (`--type-xs`, 1 px `#5B6270` border, radius 4), then optionally one line of help in
`--type-xs`. Example: **Bond** `B` / "Click to add a bond. Drag to aim it." Max width 240 px.
Dismissed on pointer down, Esc, or blur. `role="tooltip"`, linked by `aria-describedby`.

### Canvas appearance

| Element | Appearance |
|---|---|
| Background | `--canvas-bg` everywhere; no page border (exports are tight and transparent; the white stands for the slide) |
| Document parts | svg-render parts, unchanged |
| Atom hover | skeleton vertex: circle r 12 px (screen) filled `--accent` 16 %; labelled atom: its `extents` box grown 3 px, radius 4, same fill |
| Bond hover | line along the bond axis between the clipped ends, 12 px wide, round caps, `--accent` 16 % |
| Object hover | arrow/curved arrow: path stroke 12 px `--accent` 16 % along the shaft; text, caption, plus, bracket, shape: `extents` box grown 4 px, radius 4, same fill |
| Selection | each selected item drawn like hover at 24 %; plus a selection frame: the union of selected `extents` grown 8 px, 1 px dashed `--accent` (dash 4 3) |
| Rotate handle | circle Ø 10 px, white fill, 1.5 px `--accent` stroke, 24 px above the frame's top centre, joined by a 1 px `--accent` line; hit area Ø 20 px |
| Arrow end handles | 8×8 px squares, white fill, 1.5 px `--accent` stroke, at `from` and `to`; hit 16×16 |
| Curved-arrow handles | end handles as circles Ø 8 px; bend handle a 9×9 px diamond at the curve's t = 0.5 point |
| Marquee | rectangle `--accent` 8 % fill, 1 px solid `--accent` |
| Ghost preview | the would-be parts at opacity 0.45; a merge target atom gets the hover circle at 32 % |
| Snapping guide | 1 px dashed (`4 4`) `--accent` at 60 % opacity, spanning the visible canvas |
| Valence warning | atom: circle r 13 px (or `extents` box grown 4 px, radius 4) stroke 1.5 px `--warning`, dash `3 2`, no fill; `cannot-kekulize` bonds: 3 px dashed `--warning` line along each bond axis. Hovering the atom shows the warning's `message` as a tooltip. Never exported |
| Condition slot (Text tool over an arrow) | dashed `--accent` rounded rect (radius 4) 2 BLU wide × capHeight + 8 px, centred where the text will go |

**Cursors**

| Context | Cursor |
|---|---|
| Select, empty canvas | `default` |
| Select, over an item or the selection | `move` |
| Over a handle | arrow ends and bend: `pointer`; rotate: `grab` (`grabbing` while dragging) |
| Bond, Chain, Ring, Atom, Arrow, Plus, Curved arrow | `crosshair` |
| Erase | custom 20×20 `data:` SVG of the `erase` icon, hotspot 4,18; fallback `crosshair` |
| Text, or over an existing text with any tool | `text` |
| Space held / middle button | `grab`, `grabbing` while panning |

### Empty state

Shown when the document has no atoms and no objects; removed on the first item. Centred in the
canvas, `pointer-events` only on the chips:

1. The `ring-benzene` glyph drawn at 96 px in `--empty-art` (decorative, `aria-hidden`).
2. 16 px below, `--type-md` `--text-muted`: "Type a compound name above, or pick a tool and click
   here."
3. 12 px below, `--type-sm`: "Try:" followed by three chips (height 28, radius 14, 1 px
   `--border-control`, padding 0 12, 8 px apart): **ethanol**, **benzene**, **ethanol + acetic
   acid -> ethyl acetate + water**. Clicking a chip runs that text through the name field (rule N4).

Why: the two fastest first successes are one click away, and the third chip teaches the reaction
syntax by example without a help page.

### Notices and errors

No modal dialogs for anything routine. Two places only:

| Kind | Where | Behaviour |
|---|---|---|
| Name not found, scheme part not found, invalid SMILES | the name-field dropdown, one row with `warning` icon on `--warning-bg`: `No compound named “ethanl”.` then "Did you mean" chips (≤ 3, from `suggestions`) | Stays while the text is unchanged; editing the text, Esc, or blur clears it; clicking a chip replaces that part and inserts |
| Everything else (Kekulé impossible, Expand on a non-abbreviation, nothing to tidy, an op that threw) | the status bar's left slot, `warning` icon + text in `--warning` (errors) or `--text` (info), `role="status"` `aria-live="polite"` | Replaces the hint; cleared by the next canvas action, Esc, or after 8 s |

Wording: sentence case, plain, says what happened and what to do, never blames, no codes.
Examples: "This ring can't be shown with alternating double bonds." · "Nothing to tidy: draw an
arrow between the molecules first." · "Only abbreviations like Ph or CO2H can be expanded." ·
"That edit isn't possible here." (`DocError`, which the UI should never cause; also logged to the
console). chem-core warning `message`s are shown as given.

### Status-bar hints (left slot, `--text-muted`)

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
| Hovering an atom (any drawing tool) | "Type O, N, Cl… to change this atom. Enter for any label." |
| Hovering a bond (any drawing tool) | "Press 1, 2 or 3 for single, double, triple." |
| Name field focused | "Enter inserts. Write a reaction like: ethanol + acetic acid -> ethyl acetate" |
| Bond/Chain drag | "Hold Shift for any angle." |

### Keyboard

**K1 Global shortcuts** (any focus except inside a text input, where only Esc, Enter and the text
editing shortcuts apply):

| Keys | Command |
|---|---|
| Ctrl+Z / Ctrl+Y, Ctrl+Shift+Z | Undo / Redo |
| Ctrl+C / Ctrl+X / Ctrl+V | Copy / Cut / Paste (in-app; see rule P1) |
| Ctrl+D | Duplicate selection |
| Ctrl+A | Select all (switches to Select) |
| Delete, Backspace | Delete selection, else the hovered item |
| Ctrl+F | Focus the name field |
| Ctrl+= (or Ctrl++), Ctrl+− | Zoom in / out one step |
| Ctrl+0 / Ctrl+1 | Zoom to fit / 100 % |
| Ctrl+Shift+K | Show Kekulé / Show circle |
| Ctrl+Shift+L | Clean up |
| Ctrl+Shift+T | Tidy reaction |
| Arrow keys / Shift+arrow keys | Nudge selection 0.1 / 1.0 BLU (one undo step per run of nudges) |
| Esc | Cancel gesture → close editor/dropdown → clear selection → switch to Select, one per press |
| Space (hold) | Pan with the pointer |

**K2 Canvas keys** (canvas focused, no modifier). If an atom or bond is hovered, the key acts on
it; otherwise it selects a tool.

| Hovered | Key | Effect |
|---|---|---|
| atom | `C` `H` `N` `O` `S` `P` `F` `I` | set element (rule A2) |
| atom | `L` → Cl, `B` → Br | set element |
| atom | `+` (also `=`), `-` | charge +1 / −1 |
| atom | Enter | open label editor |
| bond | `1` `2` `3` | order single / double / triple (stereo cleared) |
| bond | `W` / `H` | wedge / hash; again reverses the direction |
| atom or bond | Delete, Backspace | erase it (rule E2) |
| nothing | `V` `E` `B` `Z` `R` `L` `A` `+` `M` `T` | select tool (table above) |

**K3 Text editing shortcuts** (label or text editor focused): Enter commits, Shift+Enter new line
(text editor only), Esc cancels, Ctrl+B bold, Ctrl+I italic, Ctrl+Shift+D inserts Δ,
Ctrl+Shift+H inserts hν.

**K4 Tab order**: name field → options bar (one tab stop; ←/→ move within, roving `tabindex`) →
Undo → Redo → rail (one tab stop; ↑/↓ move, Enter/Space activates; `role="toolbar"`
`aria-orientation="vertical"`) → canvas (`role="application"`, `aria-label="Drawing canvas"`,
`aria-describedby` the status hint) → status-bar controls. Shift+Tab reverses.

**K5 Focus management**: pressing a rail or options button with the mouse does not move focus
(`mousedown` default prevented), so tool and hover keys keep working on the canvas; activating by
keyboard keeps focus on the button. Clicking the canvas focuses it. Committing or cancelling a
label/text editor returns focus to the canvas. After a name insert the field keeps focus and is
cleared (several compounds in a row); Esc in an empty field returns focus to the canvas. On launch
the canvas has focus.

### Accessibility

- Every tool and action is reachable by keyboard (K1–K4). Drawing gestures need a pointer; a
  keyboard-only user draws through the name field and edits with select-all, delete, nudge, flip
  and the selection actions.
- Visible focus on every control (`:focus-visible` ring); the canvas shows a 2 px inset `--accent`
  outline when focused by keyboard.
- Contrast per the token table (all text ≥ 4.5:1, control boundaries and indicators ≥ 3:1).
  Selected state never relies on colour alone (indicator bar / underline).
- Hit targets: rail 40 px, top bar 32 px, options 28 px, status 24 px (all ≥ 24 px, WCAG 2.5.8);
  canvas hit tolerances are in screen pixels, independent of zoom (rule H1).
- `prefers-reduced-motion: reduce` turns off every transition and animated pan.
- Live region: the status slot announces notices and the inserted compound ("Inserted ethanol").
- Works at Windows display scaling 100–200 % (all sizes are CSS px).

---

## Architecture

### Where the code lives

`src/renderer/editor/` (coverage target 70 % lines, `SPEC.md`). Imports from core only through
`@core/doc-model`, `@core/chem-core`, `@core/svg-render` (their `index.ts`). Never `openchemlib`.

```
src/renderer/editor/
  index.ts              public entry (named exports only)
  model/                pure, DOM-free, React-free: data in, data out
    geometry.ts         vectors, angles, snapping, distance to segment / quadratic
    viewport.ts         BLU ↔ pt ↔ screen, zoom steps, fit, pan clamp
    hit-test.ts         hitTest, marquee selection
    placement.ts        sprout direction, chain points, ring placement, insert placement
    templates.ts        ring SubDocs (generated) and the chair (fixed coordinates)
    commands.ts         recipes: (doc, args) => Doc, built only from core ops
    cleanup.ts          orphan-carbon rule
    selection.ts        fragment closure, scope, selection sets
    chem-text.ts        formatChemText, runsToSource
    scheme-text.ts      split "A + B -> C" and lay out a scheme
    tidy.ts             tidyReaction, conditionPosition
    overlay.ts          overlay shapes in screen px from state + scene
    keymap.ts           key event → command / tool / hover action
    derive.ts           perception + scene for a doc (last-one cache)
  tools/                pure state machines, one file per tool (+ tool.ts interface)
  state/
    editor-state.ts     EditorState type, initial state
    reducer.ts          reduce(state, action, ctx) → state
    store.ts            createStore: getState / dispatch / subscribe (useSyncExternalStore)
    controller.ts       createEditorController (host API)
  view/                 thin React components
    Editor.tsx  TopBar.tsx  NameField.tsx  OptionsBar.tsx  ToolRail.tsx  StatusBar.tsx
    Canvas.tsx  Overlay.tsx  LabelEditor.tsx  TextEditor.tsx  EmptyState.tsx  Tooltip.tsx
    icons.tsx  tokens.css  editor.css
```

`model/`, `tools/` and `state/` (except `store.ts`'s React hook, which lives in `view/use-store.ts`)
are DOM-free: an ESLint block bans `react`, `react-dom`, `electron` imports and the globals
`window`, `document`, `navigator`, `requestAnimationFrame`, `performance`, `Date` there (clock is
injected), proven by a tooling probe. React components hold no logic beyond wiring events to
`dispatch` and mapping state to elements.

### State model

```ts
interface EditorState {
  history: History;                 // doc-model; the document is current(history)
  saved: Doc;                       // last loaded/saved doc, for dirty
  selection: Selection;             // never holds ids across undo/redo
  tool: ToolId;                     // 'select' | 'erase' | 'bond' | 'chain' | 'ring' | 'atom'
                                    // | 'arrow' | 'plus' | 'curved' | 'text'
  variants: { bond: BondVariant; ring: RingTemplate; atom: AtomItem;
              arrow: ArrowKind; curved: 'full' | 'fishhook' };
  hover: Hit | null;
  gesture: GestureState | null;     // the active tool's machine state (discriminated union)
  preview: Preview | null;          // { doc: Doc; added: ReadonlySet<ItemKey>; mergeTarget?: AtomId;
                                    //   translate?: { keys: ItemKey[]; dx: number; dy: number } }
  viewport: Viewport;               // { zoom: number; pan: { x: number; y: number } } (screen px)
  editing: LabelEditing | TextEditing | null;
  nameField: { text: string; open: boolean; highlighted: number; error: NameError | null };
  notice: Notice | null;
  clipboard: SubDoc | null;         // in-app clipboard
  spaceHeld: boolean;
}
```

| Undoable (in `history`) | Not undoable (editor state) |
|---|---|
| every document change, including preset switch, Clean up, Kekulé toggle, Tidy, captions | selection, hover, tool, variants, viewport, previews, editors, name-field text, notices, clipboard |

The **store** is a plain object with `getState`, `dispatch(action)`, `subscribe`; the reducer is
pure: `reduce(state, action, ctx)` where `ctx = { derive, names, clock }`. React subscribes with
`useSyncExternalStore` and selector functions. No Zustand (listed in `SPEC.md` but never
installed; see "Required changes").

**Derived data** (`derive.ts`): `derive(doc) → { perception, scene }` with a one-entry cache keyed
by doc identity and one `createPerceiver()` per controller; the preview doc gets its own
one-entry cache. `scene = render(doc, { perception })`.

### Coordinates

Doc in BLU (y down) → pt (`bluToPt`, × bondLength) → screen px: `s = pt · zoom · 4/3 + pan`
(zoom 1 = 100 % = true size: 1 pt = 4/3 CSS px, as PowerPoint shows it at 100 %). Pointer
events are converted once, at the edge, into BLU for the tools; tolerances stay in screen px.

### Tools and gestures (state machines)

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
  commit?: { label: string; recipe: (d: Doc) => Doc; select?: 'inserted' | Selection };
  selection?: Selection;
  notice?: Notice;
}
```

- Every tool is idle → (down) pressed → (move beyond 4 px) dragging → (up) commit, or (up within
  4 px) click → commit. `cancel` (Esc, right button, pointer capture lost, window blur) returns to
  idle with no commit and clears the preview.
- **Previews never touch history**: the tool builds `preview.doc` by running the same recipe on
  the committed doc outside `transact` (plain ops on a frozen doc). Because ids come from
  `nextId`, preview ids equal the ids the commit will issue, so `added` (keys not in the committed
  scene) marks the ghost parts.
- **One gesture = one `transact`**, label = the action name ("Add bond", "Add ring", "Move",
  "Rotate", "Erase", "Change atom" …). Nudges use `coalesceKey: 'nudge'`; any other action closes
  the run (doc-model clears `openKey` on a different key).
- A recipe that throws (`DocError`, `ChemError`) leaves history unchanged; the store shows a
  notice (rule X1).
- Pointer moves are coalesced to one dispatch per animation frame (latest event wins) in
  `Canvas.tsx`; the reducer itself is synchronous.

### Rendering

1. `Canvas.tsx` holds one `<svg>` filling the canvas with `<g data-layer="content"
   transform="matrix(k 0 0 k panX panY)">`, k = zoom · 4/3. Inside it, one `<g data-key="…">` per
   scene part, in paint order, whose content is set from `part.svg` (svg-render's allow-listed,
   escaped markup; parsed in the SVG namespace).
2. Patching follows svg-render's editor contract: keep a `Map<ItemKey, SVGGElement>`; on a new
   scene, replace the content only where `svg` changed, insert new keys, remove missing ones,
   and fix order with `insertBefore`. React does not own these children (a ref +
   `useLayoutEffect`).
3. While a preview is active the preview scene is mounted the same way; parts whose key is in
   `preview.added` get `opacity="0.45"`. Cancelling remounts the committed scene (only changed
   parts are touched).
4. **Drag fast path**: when a move drags a set of items that no unmoved part depends on (the
   selection is whole fragments plus objects, no unselected curved arrow, callout or caption
   refers to a moved atom or bond), the preview is `translate` only: the moved parts' `<g>` get
   `transform="translate(dx dy)"` (pt) and nothing is re-rendered until release. Otherwise every
   frame renders `preview.doc`.
5. **Overlay** (`Overlay.tsx`) is a second `<svg>` above the first, `pointer-events: none`
   (handles re-enable it), in screen px with no transform; its shapes come from the pure
   `overlayShapes(state, scene) → OverlayShape[]` (hover, selection, frame, handles, marquee,
   guides, warnings, condition slot). Strokes are therefore crisp at every zoom.
6. Label and text editors are absolutely positioned HTML over the canvas.

### Hit-testing

`hitTest(doc, scene, viewport, screenPoint) → Hit | null`, pure, linear scan (budget below):

| H# | Rule |
|---|---|
| H1 | Tolerances in screen px: atom 10 px radius around the vertex, or inside its `extents['atom:id']` grown 4 px for a labelled atom; bond 6 px from the segment between its atoms; straight arrow 6 px from `from→to`; curved arrow 6 px from the quadratic sampled at 32 steps (anchors via `resolveAnchor`); handles 8 px; text, caption, plus, bracket, shape, callout: inside `extents` grown 4 px |
| H2 | Priority: handles of the selection > atoms > bonds > text-like objects > arrows > curved arrows > plus > brackets > shapes. Within a class, the nearest wins; ties by lower id number |
| H3 | Merge target while dragging an atom or bond end: the nearest other atom within 12 px (screen) or 0.3 BLU, whichever is larger, excluding the atoms being moved |
| H4 | Marquee: atoms whose position is inside; bonds whose two atoms are inside; objects whose `extents` box is entirely inside. Shift adds to the selection |

### Seam to the host (`app-shell`, `clipboard-export`)

```ts
// src/renderer/editor/index.ts
export { Editor } from './view/Editor';                 // <Editor controller={c} />
export { createEditorController } from './state/controller';
export type { EditorController, EditorOptions, EditorCommand, EditorEvent } from './state/controller';

interface EditorOptions {
  doc?: Doc;                         // default emptyDoc(clock())
  clock?: () => string;              // ISO timestamps for history; default system clock
  names?: NameIndex;                 // default: createNameIndex(compounds.json), built once
  shortcuts?: 'all' | 'canvas-only'; // 'canvas-only' when the host's menu owns K1's Ctrl shortcuts
  onCopy?: (sub: SubDoc, doc: Doc, selection: Selection) => void;  // clipboard-export hook
}
interface EditorController {
  getDoc(): Doc;
  getSelection(): Selection;
  load(doc: Doc): void;              // new history, cleared selection, marks saved, fits view
  markSaved(): void;                 // dirty := false
  isDirty(): boolean;                // doc differs from `saved` ignoring meta.modified
  run(cmd: EditorCommand): void;
  canRun(cmd: EditorCommand): boolean;
  undoLabel(): string | undefined;   // for menu text "Undo Add bond"
  redoLabel(): string | undefined;
  subscribe(listener: (e: EditorEvent) => void): () => void;
}
type EditorCommand =
  | 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'duplicate' | 'delete' | 'select-all'
  | 'zoom-in' | 'zoom-out' | 'zoom-fit' | 'zoom-100' | 'clean-up' | 'toggle-kekule'
  | 'tidy-reaction' | 'focus-name-field'
  | { type: 'set-preset'; preset: StylePreset }
  | { type: 'paste-sub'; sub: SubDoc }        // host read a Chalkbond fragment from the clipboard
  | { type: 'insert-text'; text: string };    // host read text (name, SMILES, Molfile)
type EditorEvent = { type: 'doc' | 'selection' | 'dirty' | 'history' | 'notice' };
```

- `clipboard-export` renders with svg-render from `getDoc()` and `getSelection()` (or the
  `onCopy` payload); the editor never builds export SVG.
- `app-shell` owns save/open and calls `load` / `markSaved`; it shows the dirty marker from the
  `dirty` event; its menus call `run` and enable items with `canRun`.
- **Before app-shell exists** `App.tsx` (scaffold) renders `<Editor controller={…} />` inside
  `canvas-area` with default options and `shortcuts: 'all'`; this is enough to run and e2e-test
  everything in this spec.
- Test hooks: every control has a `data-testid`; each mounted part's `<g>` has `data-key`; the
  status-bar formula has `data-testid="formula"`. No test-only globals.

### Dependencies

**None new.** Uses React 19.3.1, Immer (through doc-model), Zod (through chem-core), and the JSON
import of `resources/compounds/compounds.json` (Vite JSON module; `resolveJsonModule` is on).
Zustand is not added (a 40-line store does the job). jsdom/Testing Library are not added (see
"Testing"; Open question 8 says when to ask).

---

## Behaviour rules

Numbered so tasks can cite them. "Scope" = the selection's atoms/objects, or the whole document
when nothing is selected.

### General

- **G1** Every document change is one `transact` with a human label. No document change happens
  outside a gesture commit, a command, or a selection action.
- **G2** Undo/redo clear selection, hover, preview, open editors and any gesture.
- **G3** Switching tool cancels any gesture and closes editors (committing a text/label editor
  first); selection is kept only when switching to Select, else cleared.
- **G4** Atoms are placed at exactly 1.0 BLU bond length by every tool; nothing scales bonds.

### Viewport

- **V1** Zoom steps: 25, 33, 50, 67, 75, 90, 100, 125, 150, 200, 250, 300, 400 %. Range clamps to
  25–400 %. Ctrl+wheel and touchpad pinch zoom continuously about the pointer (factor
  1.0015^(−deltaY), clamped); buttons and keys step about the canvas centre.
- **V2** New or loaded document: zoom 100 % for `slides`, 250 % for `journal` (bond ≈ 48–53 px on
  screen); empty doc: origin at the canvas centre; non-empty: fit.
- **V3** Fit: the scene `bounds` (pt) plus 48 px margin each side, zoom ≤ 200 %, centred.
- **V4** Wheel pans vertically, Shift+wheel horizontally; Space+drag and middle-drag pan. Pan is
  clamped so at least 64 px of the content's bounds stay on screen (no losing the drawing).
- **V5** After an insert (name, paste, duplicate) whose ink box is not fully visible, pan to
  centre it (animated 160 ms unless reduced motion); if larger than the canvas, fit.
- **V6** Preset switch keeps the drawing's on-screen size: zoom is multiplied by
  oldBondLength / newBondLength (unclamped to steps, clamped to range) about the canvas centre,
  so only line weights and text change visibly.

### Hover

- **HV1** With any tool except Erase and Text, hovering an atom or bond (H1/H2) highlights it and
  enables K2 hover keys. Erase highlights what it would erase. Text highlights texts and condition
  slots only.
- **HV2** Hovering an atom with a warning shows the warning message tooltip after 500 ms.

### Select tool

- **S1** Click on an atom or bond selects its whole fragment (atoms + bonds). Alt+click selects
  only that atom or bond. Click on an object selects it. Shift+click toggles that item (fragment
  rule applies) in the selection. Click on empty canvas clears the selection.
- **S2** Drag from a selected item moves the selection; drag from an unselected item first
  selects it (S1) then moves; drag from empty canvas draws a marquee (H4).
- **S3** Moving: `transformItems(doc, sel, translation(dx, dy))` committed once on release
  ("Move"). Shift constrains to horizontal or vertical. Snapping: if the moving ink box's centre
  x or y comes within 6 px (screen) of the centre of another fragment's or object's ink box, it
  snaps and a guide is shown; Alt disables snapping.
- **S4** When the moved set is exactly one atom (Alt-selected) and it is released over a merge
  target (H3), the commit is `mergeAtoms(doc, target, moved)` after the move ("Join atoms").
- **S5** Rotate handle: rotation about the centre of the selection frame, snapped to 15°
  (Shift: free); one "Rotate" commit.
- **S6** Arrow end handle: moves that end; the angle to the other end snaps to 15° (Shift: free);
  attached texts are re-placed by T3. Curved-arrow end handle: re-anchors onto the hit atom
  (atom anchor), bond (bond anchor, t = 0.5) or a point; bend handle sets
  `bend = 2 · d / chordLength`, d = signed distance of the pointer from the chord midpoint along
  the left normal of `from→to`.
- **S7** Double-click: on an atom opens the label editor (any tool except Erase); on a text or
  caption opens the text editor.
- **S8** Delete / Backspace: `deleteItems` on the selection plus the orphan rule (E2), "Delete".

### Erase tool

- **E1** Click erases the hit item; dragging erases every item hit along the path (ghosted at
  opacity 0.3 while dragging), one "Erase" commit on release.
- **E2** **Orphan rule**: after any deletion, an atom that lost a bond in this commit and now has
  no bonds is also deleted if it is a plain skeleton carbon (element `C`, no label, charge 0,
  radical 0, no lone pairs, isotope, explicitH, partialCharge, number or colour). Otherwise a
  deleted bond would leave a stray "CH₄".

### Bond tool (variant: single · double · triple · wedge · hash · wavy)

The new bond gets the variant's order/stereo (`wedge`/`hash`/`wavy` are order 1); its `a1` is the
start atom, so a wedge's narrow end is where the gesture started.

- **B1** Click on empty canvas: atom at p, second atom at p + (cos 30°, −sin 30°) (up-right), bond.
- **B2** Drag from empty canvas: first atom at the press point; the second follows the pointer's
  direction snapped to multiples of 30° (Shift: free), at 1.0 BLU. If the end is over a merge
  target (H3), the bond ends on that atom instead (no new atom).
- **B3** Click on an atom: sprout in the default direction (P1); if the new position is within
  0.25 BLU of an existing atom not yet bonded to it, bond to that atom (ring closure); if bonded
  already, use the next candidate direction of P1.
- **B4** Drag from an atom: as B2, starting at that atom.
- **B5** Click on a bond: variant single: if the bond has stereo, clear it; else cycle order
  1 → 2 → 3 → 1 (1.5 → 2). Double: if order ≠ 2, set 2; else cycle `doublePlacement` auto → left
  → right → center → auto. Triple: set 3. Wedge/hash: if the stereo differs, set it with the
  narrow end at the atom nearer the click (reversing as below if needed); if equal, reverse.
  Wavy: set wavy. Reverse = delete the bond and add it with `a1`/`a2` swapped and the same fields,
  in one commit.
- **B6** The preview (ghost) is shown while hovering (click result) and while dragging.

### Placement rules

- **P1** **Default sprout direction** from atom X with neighbour unit vectors u₁…uₙ:
  n = 0: 30° up-right. n = 1: the two directions at ±120° from u₁; pick the one farther from the
  neighbour's other neighbours (zig-zag continues); tie → the more upward, then the more
  rightward. n ≥ 2: the bisector of the largest angular gap between neighbours (ties: the gap that
  starts at the smallest angle counter-clockwise from +x). "Next candidate" = the other ±120° one,
  then the bisector of the second-largest gap.
- **P2** **Chain**: zig-zag of single bonds from the start along the snapped drag direction
  (30° steps, Shift free): atom k at start + k·(cos 30°)·d̂ ± (sin 30° / 2)·n̂, alternating sides
  (bond length 1.0 exactly), n = round(projected drag length / cos 30°), 1 ≤ n ≤ 20. When the
  start atom has a neighbour, the first zig goes to the side that continues its zig-zag (P1's
  choice). A small count label "n" (`--type-xs`, `--text-muted`) follows the pointer 12 px
  below-right.
- **P3** **Ring onto empty canvas**: the template centred at the click, in its canonical
  orientation (vertex up for 3, 5, 6, 7; square axis-aligned; chair as stored).
- **P4** **Ring onto an atom**: the ring shares that atom; its centre lies on P1's direction at
  the ring's circumradius R = 1 / (2 sin(π/n)), orientation so the shared atom is a vertex.
- **P5** **Ring onto a bond**: fused, sharing the bond; the new ring is on the side of the
  pointer (ties: the side with fewer neighbour atoms). Benzene onto a bond of an all-1.5 ring →
  all new bonds 1.5 (naphthalene: two circles). Benzene onto any other bond → Kekulé, with double
  bonds alternating so that a shared double bond stays double and a shared single bond stays
  single. The shared bond's own order is never changed.
- **P6** **Merging coincident atoms**: after placing a template or chain, every new atom within
  0.15 BLU of an existing atom is merged into the existing one (`mergeAtoms(keep: existing)`).
- **P7** **Insert placement** (single structure from the name field or a chip): empty doc →
  centred on the canvas centre. Otherwise to the right of everything: its ink box's left edge
  1.0 BLU right of the document's ink box right edge, vertically centred on the centre of the
  rightmost fragment or object. Then V5. The inserted items are selected and the tool becomes
  Select.

### Ring templates

All generated in `templates.ts` as `SubDoc`s centred on the origin, bond length 1.0.

| Template | Atoms | Bonds |
|---|---|---|
| Benzene | regular hexagon, vertex up | all order 1.5 (drawn with a circle) |
| Cyclopropane … cycloheptane | regular n-gon, vertex up (square axis-aligned) | single |
| Chair | (−1.45, 0.20), (−0.80, −0.30), (0.20, −0.10), (1.45, −0.20), (0.80, 0.30), (−0.20, 0.10); first values, tuned at the visual review | single, ring order |

### Atom tool (variant: element C H N O S P F Cl Br I, or a mark)

- **A1** Element variant: click an atom → set its element (A2); click empty canvas → a lone atom
  of that element (a lone O renders "H₂O"); drag from an atom → bond to a new atom of that element
  (B4 geometry).
- **A2** Setting an element: `updateAtom(element, label: undefined, explicitH: undefined)`;
  charge and marks kept. Setting the element it already has does nothing.
- **A3** Mark variants on a clicked atom (Shift+click reverses): ⊕ charge +1, ⊖ charge −1
  (clamped −4…4); lone pair: `lonePairs` 0 → 1 → … → 4 → 0; radical 0 ↔ 1; δ+ / δ−: set, or clear
  if already that value. On empty canvas: nothing (hint "Click an atom").

### Label editor

- **L1** Opens on double-click or Enter over an atom: an input centred on the atom, min 64 px,
  grows to 160 px, 28 px high, `--type-md` in Arial, radius 6, 2 px `--accent` border,
  `--shadow-1`; prefilled with the atom's label, else its element (with H count if `explicitH` is
  set, e.g. `OH`), all selected. Typing a letter over a hovered atom whose key is not a K2 quick
  key also opens it with that letter.
- **L2** Below it (4 px), a caption in `--type-xs`: `--text-muted` "e.g. OH, NH2, Cl, Ph, CO2H";
  when the text interprets as `unknown`, `--warning` "Not a known group; it will be drawn as
  typed."
- **L3** Enter commits ("Change atom") through `interpretLabel`: `element` → set `element`,
  clear `label`, `charge` = typed charge ?? 0, `explicitH` = typed H count only if it differs from
  the automatic count (computed by perceiving the doc with `explicitH` cleared), else undefined;
  `abbreviation` → `element` = its attachment element, `label` = key; `unknown` → element `*`,
  `label` = the text. Empty text → plain carbon. Esc cancels; clicking elsewhere commits.

### Arrow, Plus, Curved arrow

- **R1** Arrow: drag from p₀ to p₁ → arrow of the variant kind, angle snapped to 15° (Shift free);
  a drag shorter than 0.5 BLU counts as a click; click → arrow from p to p + (2.5, 0). Click on an
  existing arrow sets its kind to the variant.
- **R2** Plus: click → plus at p; snapping as S3 (centre alignment with other items).
- **R3** Curved arrow: press on an atom or bond (else nothing, hint "Start on an atom or a bond"),
  release on an atom, a bond or empty canvas. Anchors: atom → `{ kind: 'atom', atom }`, bond →
  `{ kind: 'bond', bond, t: 0.5 }`, empty → `{ kind: 'point', p }`. Same start and end → cancel.
  `bend` = ±0.4, the sign that bulges away from the centroid of the atoms of the fragments the
  anchors touch (`+` if the centroid lies on the chord). Head = variant.

### Text tool and conditions

- **T1** Click on empty canvas → new text at p (`align: 'left'`) with the text editor open; click
  on an existing text or caption → edit it. Hovering within 1.0 BLU of an arrow's shaft and
  between its ends shows the condition slot on the pointer's side (above/below); clicking it
  creates a text with `attachedTo: { arrow, slot }`, `align: 'center'`, placed by T3.
- **T2** Text editor: a borderless auto-growing `<textarea>` over the text, Arial at
  fontSize · zoom · 4/3 px, 1 px `--accent` outline, `--canvas-bg`. It edits the **source**
  (`runsToSource(runs)`); the svg-render text is hidden while editing. Enter commits ("Edit
  text"), Shift+Enter new line, Esc cancels, click elsewhere commits. Empty on commit → the text is
  deleted (or never created). Bold/Italic apply to the whole text object (every run). Captions
  default to bold.
- **T3** **Condition position**: text centred on the arrow's midpoint along the shaft; above:
  the text's ink box bottom is `0.2·bondLength` pt above the highest point of the arrow's ink
  (shaft and heads); below: its ink top is the same distance below the lowest. Computed from
  render `extents` (two passes: place, render, shift). For a non-horizontal arrow "above" means the
  arrow's left side (travel direction), offset along the left normal.
- **T4** **`formatChemText(source) → TextRun[]`** (pure):
  1. `->` becomes `→`; `<=>` becomes `⇌`.
  2. Explicit marks: `^{…}` / `_{…}` → sup / sub of the braced text; `^` / `_` followed by a run of
     `[0-9+\-−]` → sup / sub of that run (`Fe^3+`, `SO4^2-`); `\^`, `\_` are literal. A `-` inside a
     sup becomes `−`.
  3. Auto: a **formula token** (maximal run of `[A-Za-z0-9()\[\]]`) whose letters parse as a
     sequence of element symbols (`PERIODIC_SYMBOLS`, e.g. `H2SO4`, `CH3COOH`, `Cu(NH3)4`,
     `LiAlH4`) has every digit run that directly follows a letter, `)` or `]` subscripted; a `+` or
     `-` ending such a token right after a letter, `)` or `]` becomes a superscript `+` / `−`
     (`H3O+`, `OH-`). Exceptions, never subscripted: `SN1`, `SN2`, `SNi`, `E1`, `E2`, `E1cb`.
     Tokens starting with a digit (`25`, `2nd`) are never formulas.
  4. Bold/italic come from the object, not the source.
  `runsToSource(runs)` writes plain text where T4.3 would regenerate the run, else explicit marks.
  Property: `formatChemText(runsToSource(r)) = r` for every `r` that `formatChemText` produces.
- **T5** Text editing options (options bar while editing): x₂ / x² wrap the textarea selection in
  `_{}` / `^{}`; B / I toggle the object's bold/italic; Δ, hν, °, → insert that text at the caret.

### Tidy reaction

- **TR1** Scope: selection or everything. Row items: fragments, straight arrows, pluses, and
  free texts (no `attachedTo`) whose ink box overlaps the horizontal band through the arrows'
  shafts; captions and anchored objects follow their atoms. Nothing to do (no arrow) → notice
  "Nothing to tidy: draw an arrow between the molecules first."
- **TR2** Order: sort row items by ink-box centre x.
- **TR3** Arrows: made horizontal (direction kept left→right as drawn, reversed if drawn
  right→left), length = max(2.5 BLU, widest attached text ink width + 0.6 BLU).
  Unattached texts whose centre lies within 1.0 BLU of an arrow's shaft and within its span get
  `attachedTo` (slot by side).
- **TR4** Baseline: y = the ink-box centre y of the first row item. Every item is translated so its
  ink-box centre y equals the baseline (arrows: the shaft).
- **TR5** Spacing: left to right, the gap between consecutive ink boxes is 0.6 BLU, except 0.4
  BLU on either side of a plus. The first item stays where it is.
- **TR6** Attached texts are re-placed by T3. The whole tidy is one "Tidy reaction" commit; running
  it twice changes nothing (idempotent, tested).

### Name field and reaction text

- **N1** Suggestions: from 2 typed characters, `names.suggest(text, 8)`, shown in a dropdown under
  the field (width = field width, max 8 rows × 36 px, `--shadow-1`, radius 6). Row: name
  (`--type-md`) left, formula (`--type-sm`, `--text-muted`, digits as Unicode subscripts) right.
  ↑/↓ highlight, Enter inserts the highlighted entry (or the typed text if none is highlighted),
  click inserts, Esc closes (second Esc clears; third returns focus to the canvas).
- **N2** Insert: `structureFromText(text, names)`; success → `insert` placed by P7, "Insert
  ethanol" (entry name, else "Insert structure"), live-region announcement "Inserted ethanol".
  Failure → the not-found row (see "Notices"); `too-large` → "That structure is too big to draw
  (over 1000 atoms)."
- **N3** **Reaction text**: if the text contains `->`, `→`, `=>`, `<=>` or `⇌` outside brackets, it
  is a scheme. Split at those arrow tokens into sides, each side at ` + ` (space, plus, space) into
  parts; a part starting with an integer and a space (`2 H2O`) gives a coefficient text `2` before
  the structure. Every part goes through `structureFromText`; if any fails, nothing is inserted and
  the not-found row names that part. Otherwise the scheme is built (structures, pluses, arrows of
  kind `forward`, or `equilibrium` for `<=>`/`⇌`; `=>` gives `retro`) and laid out by TR2–TR5 as
  one "Insert reaction" commit, placed: empty doc → centred; else its ink box's left edge at the
  document's left edge and its top 1.5 BLU below the document's bottom. Then V5.
- **N4** Empty-state chips and `insert-text` commands go through N2/N3 exactly.
- **N5** The dictionary is imported as JSON and `createNameIndex` is called once when the
  controller is created (≈ 400 entries; time measured in the perf test).

### Selection actions

- **C1** Clean up: `cleanStructure(doc, scopeAtoms)`, "Clean up".
- **C2** Expand: `expandLabel` on each abbreviation atom in scope, "Expand label"; none →
  notice "Only abbreviations like Ph or CO2H can be expanded."
- **C3** Kekulé ⇄ circle: if the scope has a 1.5 bond → `kekulize(doc, scopeAtoms)` ("Show
  Kekulé"); `ChemError('cannot-kekulize')` → notice "This ring can't be shown with alternating
  double bonds." Else `aromatize(doc, scopeAtoms)` ("Show circle"); unchanged doc → notice "No
  aromatic ring here to show as a circle."
- **C4** Number: one caption per selected fragment, left to right, `runs: [{ text: n, bold:
  true }]`, `target` = all its atoms; n continues from the largest integer among existing captions
  (first is 1). A fragment that already has a caption is skipped.
- **C5** Status-bar formula: selection non-empty → `formulaOf(doc, selectedAtoms)`; else, if the
  document has exactly one fragment, that fragment's formula; else hidden. Shown as `Formula.text`
  with digits as Unicode subscripts, then " · " and `mw` to 2 decimals + " g/mol" when not null.
- **C6** Warnings button (status bar): hidden when there are none; else `warning` icon + count in
  `--warning`; click selects the atoms of the first warning (cycling on further clicks) and pans
  to them.

### Clipboard (in-app)

- **P1** Copy: `extract(doc, selection)` into `state.clipboard`, then `onCopy?.(sub, doc,
  selection)`. Cut = copy + delete (E2), "Cut". Paste: `insert(doc, clipboard, at)` with `at` =
  the pointer position if the pointer is over the canvas, else the canvas centre; "Paste"; the
  pasted items become the selection. Duplicate: `insert` of `extract` at the selection's centre
  + (1.0, 1.0) BLU, "Duplicate". `paste-sub` / `insert-text` commands from the host follow the same
  placement (text via N2/N3).

### Preset

- **PR1** The status-bar switch "Slides | Journal" calls `setStyle(doc, { preset })` in one
  "Switch to Journal style" commit (undoable), then V6.

### Errors

- **X1** Any exception from a commit recipe or chem-core call is caught by the store: history
  unchanged, gesture cleared, notice (ChemError → its message, or the rule's wording above;
  DocError → "That edit isn't possible here."). Nothing crashes the renderer.

---

## Settled items from AGENTS.md "Next: editor"

| Item | Decision |
|---|---|
| Selection, hit-testing, marquee | Editor's own (`hit-test.ts`, H1–H4), using `Scene.extents` and doc geometry |
| Overlays | Editor's own screen-space overlay layer (`overlay.ts`), never in the export |
| `setStyle` op | **Requested** in doc-model (additive, no schema change). Preset switch is undoable |
| `createRenderer` | **Not requested.** Keyed-part patching + drag fast path + perceiver cache; budgets below. If the E6 profiling task misses a budget, the editor asks for it via a svg-render spec change first |
| Tidy reaction / condition positions | TR1–TR6 and T3; `attachedTo` is set by the Text tool and Tidy; reactions stay unstored (inferred from layout) |
| Kekulé/circle, Clean Structure | Selection actions C1, C3 calling chem-core |
| Text size | Keep one `fontSize` (svg-render Decision 2). No schema bump. Titles belong in PowerPoint |
| compounds.json | Imported as a JSON module by the editor; `createNameIndex` once per controller (N5) |

## Model gaps (not representable; no UI, listed for later)

| Gap | Effect | Would need |
|---|---|---|
| No dotted / hydrogen bond, no dative (arrow) bond | Can't draw H-bonding diagrams or coordinate bonds | a `BondStereo` or order variant (schema bump) |
| Curved-arrow anchors can't name a specific lone pair | Arrows start at the atom's label edge, not at a chosen pair | anchor offset convention shared with svg-render's slots |
| No per-object text size, no text rotation | One text size per document | schema bump |
| No op for groups or z-order | No group/ungroup, no bring-to-front | doc-model ops |
| Straight reaction arrows only | No curved (non-electron) reaction arrows | `DrawObject` variant |

## Required changes to finished modules and scaffold

Each is specified here; the target spec is updated first by a later worker.

| Target | Change | Spec edit needed |
|---|---|---|
| `doc-model` | Add `setStyle(doc: Doc, style: { preset?: StylePreset; overrides?: Partial<StyleSettings> }): Doc`, draft-aware like the other ops; `overrides`, when given, replaces the whole overrides object; validates `preset ∈ {'slides','journal'}` and every override value finite (else `DocError('invalid-value')`). Exported from `index.ts`. **No schema or `schemaVersion` change.** Tests: round trip through `transact`/undo, invalid values throw | `SPEC-doc-model.md` "Public API": add the signature under a `// style` heading |
| `SPEC.md` | Tech Stack: remove the Zustand row (never installed; the editor uses a hand-written store). Testing Strategy "Component" row: "pure tool state machines (event sequences → document) in Vitest node; DOM behaviour in Playwright e2e" instead of "Vitest + jsdom". Decisions Log rows for both | `SPEC.md` |
| `app-shell` scaffold (`src/main/index.ts`) | `minWidth: 960`, `minHeight: 640`; `Menu.setApplicationMenu(null)` until app-shell defines menus (the default menu's View → zoom items capture Ctrl+0/Ctrl+−/Ctrl+= and zoom the whole page) | none (scaffold); `SPEC-app-shell.md` later inherits: menus must not bind page zoom, and use `shortcuts: 'canvas-only'` + `run` |
| `src/renderer/app/App.tsx` (scaffold) | Mount `<Editor>` in `canvas-area` (keep `data-testid="canvas-area"`, so `e2e/smoke.spec.ts` still passes); the top bar moves into the editor | none |
| Tooling | ESLint: (a) `src/renderer/**` may import core only as `@core/<module>` (no deep paths), except `*.test.ts` files importing `@core/<module>/__fixtures__/*` (doc-model's `arbitraries.ts`); (b) DOM-free block for `src/renderer/editor/{model,tools,state}/**` (bans listed in "Where the code lives"; repeat the named-export restriction). Probes in `tests/tooling/editor-lint.test.ts` | none |
| `svg-render`, `chem-core` | None | — |

## Testing

| Level | What | Where |
|---|---|---|
| Unit (node) | every `model/` function: geometry, viewport maths, P1–P7, templates (bond lengths 1.0 ± 1e-9, chair excepted), hit-test priority and tolerances at 25 % / 100 % / 400 %, marquee, E2 orphan rule, T4 (`H2SO4`, `CH3COOH`, `Cu(NH3)4^2+`, `H3O+`, `OH-`, `SN2`, `25 °C`, `2nd`, `Pd/C`, `->`), N3 splitting (brackets, coefficients, `[NH4+]` not split), TR1–TR6, C3–C5, overlay shapes, keymap (K2 hover precedence) | colocated `*.test.ts` |
| Tool machines (node) | for each tool, event sequences → `ToolStep`s → doc after commit; preview ids equal commit ids; cancel leaves history untouched; every gesture is exactly one undo step | `tools/*.test.ts` |
| Property (fast-check) | (1) any random sequence of tool events on random docs (doc-model `arbitraries.ts`) keeps `checkInvariants` empty and never throws out of the reducer; (2) undo of every committed gesture restores the previous doc exactly; (3) T4 round trip; (4) Tidy is idempotent; (5) hit-test of an atom's own screen position returns that atom when nothing overlaps it | `*.prop.test.ts` |
| Store/controller (node) | dirty tracking through edit/undo/save, `canRun`, events, `load`, `onCopy` payload | `state/*.test.ts` |
| Perf (node, perf project, skipped timings under `--coverage`) | `hitTest` on a 500-atom doc < 0.5 ms median; one bond-drag preview step (tool + render with cached perception) on the 40-atom scheme < 10 ms median; `tidyReaction` on the 4-molecule scheme < 25 ms; `createNameIndex(compounds.json)` < 30 ms | `src/renderer/editor/perf.test.ts` |
| E2E (Playwright `_electron`, built app) | see list below; each test saves screenshots to `test-results/editor/<test>-<step>.png` (git-ignored) | `e2e/editor-*.spec.ts` |
| Manual (Windows) | the "Editor" section added to `docs/windows-checklist.md`: look at the screenshots, touchpad pinch, 125 %/150 % display scaling, a keyboard-only pass, a first-use pass by the owner | checklist |

E2E list: (a) draw ethanol by gestures (Bond click, click atom, hover end atom + `O`) → formula
`C₂H₆O`; (b) benzene template then toluene in ≤ 3 actions (`SPEC.md` SC2); (c) the reaction of
`SPEC.md` SC3 via the name field + two condition texts + Tidy in ≤ 15 actions, final layout
checked (arrow horizontal, item centres within 0.01 BLU of one baseline, conditions centred);
(d) undo/redo of every tool's gesture; (e) Tab reaches every control, rail ↑/↓, Enter selects a
tool, Esc ladder; (f) zoom keys and Ctrl+wheel, fit; (g) name not found → "Did you mean"; (h)
preset switch keeps on-screen bond length within 1 px; (i) frame-time probe (performance marks
around the pointermove handler and the next `requestAnimationFrame`) for a 40-atom scheme drag
(fast path) and a 100-atom partial drag. The current setup supports all of this
(`e2e/launch.ts`, `page.mouse`, `page.keyboard`, `page.screenshot`).

Coverage: `src/renderer/editor` ≥ 70 % lines. The logic lives in `model/`, `tools/`, `state/`,
covered in node; `view/` is kept thin. If coverage misses 70 % because of `view/`, raise Open
question 8 rather than excluding files.

## Performance

| Budget | Where measured |
|---|---|
| Pointer move → next paint, whole-fragment drag of a 40-atom scheme (fast path): p95 ≤ 16 ms | e2e (i), Windows |
| Pointer move → next paint, bond-drag preview and partial-selection drag in a 100-atom doc: p95 ≤ 16 ms | e2e (i), Windows |
| Commit → paint for any single gesture on a 100-atom doc: ≤ 50 ms | e2e |
| Cold start to usable canvas (with name index): within `SPEC.md` SC1 (< 3 s) | e2e smoke timing |

**Profiling task (E6):** run (i) on the owner's Windows laptop, record medians and p95 in
`docs/`; if any budget fails after the fast path, write the request for svg-render's
`createRenderer` (spec change first), do not loosen the budget.

## Success Criteria

1. A first-time user draws ethanol and benzene with no instructions: e2e (a) and (b) pass, and
   the owner's first-use pass (checklist) succeeds without help.
2. Toluene in ≤ 3 actions; the SC3 reaction in ≤ 15 actions, perfectly aligned (e2e b, c).
3. Every gesture in "Behaviour rules" has a tool-machine test, commits exactly one undo step, and
   undo restores the previous doc exactly (property 2).
4. No reachable sequence of events produces an invalid document or an uncaught exception
   (property 1, 1,000 runs with an explicit timeout).
5. All ten tools, every option, every selection action and every K1 command are reachable by
   keyboard (e2e e); every control shows a visible focus ring and has an accessible name.
6. Text and indicator colours meet the contrast ratios in the token table (a unit test reads
   `tokens.css` and recomputes them: `tests/tooling/editor-tokens.test.ts`, since renderer tests
   have no Node types); hit targets ≥ 24 px.
7. Valence warnings from `perceive` appear as overlays with their message on hover and never in
   `toSvg` output (unit: export of a doc with warnings is byte-identical to svg-render's).
8. Name insert: exact names insert, prefixes suggest, misspellings show "Did you mean", reaction
   text builds a tidy scheme (unit + e2e g).
9. Performance budgets met on Windows; node perf budgets pass.
10. `npm run check` green with `src/renderer/editor` ≥ 70 % line coverage; the DOM-free lint block
    and boundary probes pass.
11. The editor runs in the scaffold window with no app-shell code beyond the listed scaffold
    changes; `e2e/smoke.spec.ts` still passes.

## Phases (tool groups)

The plan (`tasks/plan-editor.md`, `tasks/todo-editor.md`) is written later; it should follow this
order, each phase ending in a checkpoint with screenshots reviewed.

| Phase | Content | Prerequisite |
|---|---|---|
| E0 | Required changes: `setStyle` (doc-model spec then code), `SPEC.md` edits, scaffold min size + menu, lint blocks | approval |
| E1 | Shell and canvas: tokens, icons, layout, rail/options/status (static), store, viewport, keyed-part mounting, pan/zoom, empty state, perf harness | E0 |
| E2 | Select and Erase: hit-test, hover, selection, marquee, move (fast path), rotate, flip, delete + orphan rule, undo/redo, in-app clipboard, controller + dirty | E1 |
| E3 | Structure tools: Bond, Chain, Ring, Atom + marks, hover keys, label editor, warning overlay, formula | E2 |
| E4 | Name field: suggestions, insert, not-found, reaction text, empty-state chips; Clean up, Kekulé, Expand, Number; preset switch | E3 |
| E5 | Reaction tools: Arrow, Plus, Text + T4 formatting + conditions, Tidy reaction, Curved arrow + handles | E4 |
| E6 | Acceptance: keyboard/a11y pass, contrast test, e2e suite, profiling task, Windows checklist | E5 |
| E7 (optional, needs approval) | Annotation creation UI: brackets (‡, n), callouts, highlight shapes, colours | owner feedback |

## Boundaries (module-specific)

- **Always:** edit only through doc-model ops inside `transact`; read chemistry only from
  chem-core and pixels only from svg-render; keep `model/`, `tools/`, `state/` DOM-free; keep
  tolerances in screen px; use the tokens (no raw colours or sizes in components); give every
  control an accessible name, tooltip and test id.
- **Ask first:** any new dependency (jsdom, Zustand, an icon set); any `Atom`/`Bond`/`DrawObject`
  or `StyleSettings` field; asking svg-render for `createRenderer` or any new option; adding a
  visible control not listed in this spec; E7.
- **Never:** draw overlays into svg-render output or exports; hold ids across undo/redo; import
  `openchemlib` or deep core paths; open a modal dialog for a routine message; use network, fonts
  or icons from outside the repo; use ChemDraw's names, icons or assets.

## Open questions

Each has the default this spec ships with.

| # | Question | Default | Reason |
|---|---|---|---|
| 1 | Does a click with Select pick the whole molecule or one atom/bond? | Whole molecule; Alt+click for one | A teacher clicking a molecule wants to move it, not distort it |
| 2 | Bond angle snap step | 30° (Shift free); arrows 15° | 30° multiples give textbook zig-zags and rings; 45° arrows are common |
| 3 | Reaction text in the name field (`A + B -> C`) | In | Fastest route to SC3; the empty-state chip teaches it |
| 4 | Where does a name-inserted structure land? | Auto, right of the drawing, then selected | No extra click; the teacher can drag it at once |
| 5 | Minimum window 960×640 instead of 800×500 | 960×640 | Fits 1366×768 laptops and every control without scrolling |
| 6 | Auto-subscript digits in formula-like words (with SN1/SN2/E1/E2 exceptions) | On | `H2SO4` "is auto-subscripted" is a user story; `^` covers charges |
| 7 | Annotation creation UI (brackets, callouts, highlights, colours) | Deferred to E7 | Few controls done well; basics-level figures rarely need them |
| 8 | jsdom + Testing Library for component tests | Not added; ask only if `renderer/editor` coverage < 70 % because of `view/` | No new dependency unless the bar can't be met otherwise |
| 9 | Preset switch keeps the on-screen size | Yes | Shows the style difference without the drawing jumping in size |
| 10 | Default zoom | 100 % Slides, 250 % Journal | Bonds ≈ 50 px on screen either way |
| 11 | Erasing a bond removes stray plain carbons | Yes | A leftover bare carbon renders as "CH₄", which no teacher wants |
| 12 | Chair template in the Ring options | In | Cyclohexane conformations are on the grade 12 syllabus; costs one button |
| 13 | Hover keys win over tool keys | Yes | ChemDraw-like; the highlight shows what the key will change |
| 14 | Quick keys `L` → Cl and `B` → Br on a hovered atom | Yes | Haloalkanes are core grade 11 content; two-letter symbols need a single key |
