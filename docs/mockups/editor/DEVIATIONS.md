# Editor mock-ups: deviations from SPEC-editor.md

Static mock-ups of the editor UI. `SPEC-editor.md` "UI design" is the source; each row below is a
place where the mock-ups differ, so the spec can be updated to match (or the mock-up reverted).

Files: `tokens.css` (all tokens), `icons.svg` (sprite, one `<symbol>` per icon), `mockup.css`
(regions and controls), `NN-*.html` (one per screen), `canvas/*.svg` (real svg-render output,
Slides preset, 150 % (08/09: zoom to fit), plus the overlays), `build.mjs` (regenerates `canvas/` and the pages from
`pages.mjs` + `screens.mjs`; `--png <dir>` screenshots every page with Playwright's Chromium at
device scale 1; `--serve` serves the folder on 127.0.0.1, since Chromium blocks
`<use href="icons.svg#…">` on `file://`).

## Orchestrator decisions (amend the spec)

| Spec | Mock-up | Why |
|---|---|---|
| Bond options: Single, Double, Triple, Wedge, Hash, Wavy | Single, Double, Triple, Wedge, Hash; `bond-wavy` icon dropped | Orchestrator decision 1 |
| Ring options: Benzene, Cyclopropane … Cycloheptane, Chair | Benzene, Cyclohexane, Cyclopentane, Cyclobutane, Cyclopropane; `ring-7`, `ring-chair` dropped | Orchestrator decision 2 |
| Arrow options include Retrosynthesis | Reaction, Equilibrium, Resonance, No reaction; `arrow-retro` dropped | Orchestrator decision 3 |
| Preset switch "Slides │ Journal" | "Slides │ Handout" (Handout = `journal` preset) | Orchestrator decision 4 |
| (launch tool unspecified) | Bond (single) active, canvas focused | Orchestrator decision 5 |

### Iteration 2

| Spec | Mock-up | Why |
|---|---|---|
| Rail 56 px wide; buttons 40 × 40, icon only, 4 px apart | Rail 64 px (`--rail-w`); buttons 56 × 48 (`--rail-btn-w`, `--rail-btn-h`) at x = 4, first at y = 8, 2 px apart in a group; divider 1 × 32 with 8 px above and below. 24 px icon box at top 4 (its 20 px glyph area starts at 6), caption under it: new token `--type-caption` 500 11 / 14 px, baseline 9 px above the button bottom. Captions: Select, Erase, Bond, Chain, Ring, Atom, Arrow, Plus, Curly, Text | Orchestrator decision (item 1): one-word captions so the rail explains itself |
| (captions) | Caption `--text-muted` (5.67 : 1 on chrome, 5.14 on `--hover-bg`, 4.68 on `--pressed-bg`); hover and pressed `--text`; selected `--active-fg` (6.33 : 1 on `--active-bg`) | Item 1: ≥ 4.5 : 1 in every state, quieter than the icon at rest |
| Active bar 3 × 20 at x = 0, centred | 3 × 24 at x = 0, top 12 (centred on the 48 px button) | Item 1: scaled to the new button |
| Focus ring offset 2 px | rail buttons: offset 0 | With 2 px gaps an offset ring would cover the neighbouring button; offset 0 ends exactly in the gap and at the rail edge |
| Focus ring offset 2 px | status-bar buttons: offset 0 (E9) | A 24 px control in the 28 px bar with an offset ring is 32 px tall and is clipped by the window edge; offset 0 gives 28 px |
| Rail fits at 640 px | content 8 + 528 + 8 = 544 px of the 562 px between the borders at 960 × 640 (screen 11), no scrolling | Item 1 |
| Zoom at launch: unspecified (readout 100 %) | 150 % (1 pt = 2 px) on every canvas and readout; handles, outlines, marks and pointers stay in screen px | Orchestrator decision (item 2) |
| — | Reaction scheme (08, 09) at zoom to fit: largest whole percent ≤ 150 % with 48 px margin on every side = **115 %**. 09 keeps 08's view (correcting the H20 label does not re-fit; by itself 09's scheme would fit at 117 %) | Item 2 |
| Selection actions: Clean up, Show Kekulé (label, fixed 104 px), Tidy reaction, Number, Flip ×2, Expand | Clean up, Show Kekulé, Tidy reaction (all icon + label, same height 32, padding 0 8 0 4, gap 4), divider, Flip horizontal, Flip vertical (icon only). Number removed (and its icon). Expand (icon + label) only when the selection has an abbreviation, after a divider at the right end (screen 03b) | Orchestrator decision (item 3) |
| Show Kekulé fixed width 104 px | natural width; the real control should reserve the wider label ("Show Kekulé") with `min-width` and left-align, so the bar does not jump when it flips to "Show circle" | All three labelled actions look the same (item 3) |
| (icons) | new `show-kekule` (benzene hexagon, inner strokes `M12.7 7L16 8.9`, `M16 15.1L12.7 17`, `M7.6 13.9V10.1`), `show-circle` (= `ring-benzene`), `expand` (label box 2.5,3.5 7 × 5, elbow arrow down and right, pointy-left hexagon centre 16,14.5 r 5.5) | Item 3 |
| Atom hover circle r 12 at 16 %; bond hover 12 px band at 16 % | Atom hover: Ø 18 px (r 9) circle; bond hover: 8 px round-capped band; both `--accent` at **45 %** (`--overlay-hover` 0.45). Labelled atoms keep the extents box + 3 px at the same 45 %. Selection unchanged (r 12, 12 px bands, 24 %) | Orchestrator decision (item 4). At 30 % the 18 px dot sat under the pointer and read as a smudge; 40 % was visible on a second look; 45 % is obvious at a glance in screen 02 |
| Text editor: borderless textarea showing the source (`H2SO4`) | WYSIWYG box: the runs as svg-render draws them (Arial, sub at 0.7 × size, dropped 0.2 em), at the canvas zoom, caret at the end; padding 2 8 inside a 1 px `--accent` outline. No `_{}` / `^{}` anywhere | Orchestrator decision (item 5) |
| Status hint while editing text (iteration 1: "… H2SO4 gets its subscripts by itself.") | "Enter finishes. Shift+Enter starts a new line. Formulas like H2SO4 get their subscripts when you finish." | Item 5 |
| Text options ° and → as font glyphs | SVG icons `glyph-degree` (ring r 2.9 at 12,9.2) and `glyph-arrow` (`M4.5 13H19`, chevron 14.5,8.5 → 19,13 → 14.5,17.5), stroke 2 in the grid = 1.67 px at 20 px, matching the 14 px / 600 Δ | Item 5: the Segoe UI ° and → were thin and small next to Δ |
| Empty state: "Type a compound name above, or pick a tool and click here." | "Type a compound name above, or click anywhere to start drawing." | Orchestrator decision (item 6) |
| `flip-v`: `flip-h` rotated 90° | `flip-h`: isosceles triangles `M9.5 5V19L3 12Z` (filled) and `M14.5 5V19L21 12Z` (outline) either side of the dashed axis; `flip-v`: the same pair across a horizontal axis, `M5 9.5H19L12 3Z` / `M5 14.5H19L12 21Z`. Axis dashes butt-capped (round caps closed the 2 px gaps) | Item 7. Right triangles turned 90° form a "play" arrowhead; isosceles ones stay a mirror pair in both orientations. `flip-h` changed with it so the two remain twins |
| Status hint `--type-xs` 12 px, `--text-muted` | new token `--type-hint` 13 / 18 px 400, `--text-muted`: 5.67 : 1 on `--chrome-bg` | Orchestrator decision (item 8). Readable at a glance, still quieter than the 14 px `--text` of the top bar |
| "Did you mean" chips in chem-core's order (acetaldehyde, ethane, ethanol) | ethanol, ethane, acetaldehyde (closest first) | Orchestrator decision (item 9); chem-core's `suggestions` order should be fixed to match |
| Dropdown formulas with Unicode subscript digits | real `<sub>`, 10 px, `top: 3px`, line-height 0 | Orchestrator decision (item 10): the Unicode digits rendered at about 7 px |

## Visual refinements

| Spec value | Mock-up value | Why |
|---|---|---|
| `--type-rail` 15 / 20 px, 600 | 18 / 24 px, 600 | At 15 px the element letter on the Atom rail button was optically much smaller than the 24 px icons beside it |
| Options button 28 × 28 (`--option-btn`) | 32 × 32, 2 px apart inside a set; 8 px either side of a separator | At 28 px the 2 px selected underline touched the bottom of 20 px icons (hexagon, wedge). 32 matches the name field and Undo/Redo, so the top bar has one control height. The Atom bar still fits at 960 px with ~45 px to spare (screen 11) |
| Option text glyphs `--type-sm` (13 px) 600 | `--type-md` (14 px) 600 | 13 px element symbols looked undersized next to 20 px icons |
| Selected option underline "2 px above the bottom edge" | unchanged (2 px), now 4 px clear of the icon | follows from the 32 px button |
| Action button gap 6 px, padding 0 8 | gap 4 px, padding 0 8 0 4 | 6 is not on the spacing scale; the 20 px icons carry ~1.7 px of internal margin, so 4 reads as 6 and the left padding looks even |
| Number: icon only, tooltip "Number the molecule" | (superseded in iteration 2: Number removed) | |
| `clean-up` icon: small hexagon + plus-shaped sparkle | hexagon centre 9.5,13.5 r 7; filled four-point star at 18.5,5.5 | The spec glyph read as "O⁺", an oxygen cation, which is the worst possible misreading in a chemistry app |
| `ring-3` triangle 12,4.5 19.5,18 4.5,18 | 12,4 20,18.5 4,18.5 | Triangles look smaller than squares/hexagons of the same box; this matches their optical size |
| `curved-full` / `curved-fishhook` shaft ends at 18,8.5; fishhook barb 17.5,9 | shaft ends at 17,8.2; barb 17.2,8.6 | The round cap poked out of the open side of the half head |
| Selection: every selected atom gets the r 12 hover circle at 24 % | A skeleton vertex whose bonds are also selected gets no circle (the round-capped 12 px bond bands cover it); all marks are drawn opaque in one group with `opacity` 0.24 (hover: see iteration 2) | Circles on every vertex made a string of beads around the ring; per-shape alpha darkened every overlap |
| Preset switch: two transparent 64 × 24 segments | 1 px `--border` outline (radius 4, 24 px tall), segments 64 × 20 inside | Without a boundary the unselected "Handout" reads as plain text, not as the other half of a switch |
| Zoom cluster spacing unspecified | 2 px between −, 100 %, +, fit | |
| Warnings button 24 × 24 | auto width, padding 0 4, icon + count, 600 | The count needs room |
| Name field width `clamp(240px, 26vw, 360px)` | `round(down, clamp(240px, 26vw, 360px), 1px)` (dropdown too) | 26vw is 332.8 px at 1280: every icon right of the field landed on a half pixel and blurred |
| Name field: focused = 2 px accent; not found = 1 px warning | focused and not found = 2 px `--warning` | The combination is the normal case right after Enter and was unspecified |
| Dropdown width = field width | `min-width: 320px`; "Did you mean" on its own line (`--type-xs`) above the chips | At field width (249 px at 960) the three suggestion chips wrapped onto a second line |
| Dropdown row: name, formula | typed prefix in 600 weight | Easier to scan which part matched |
| Empty-state benzene: the 24-grid icon at 96 px (6 px stroke) | inline copy with `stroke-width` 1 (4 px at 96) | 6 px read as heavy clip-art rather than a quiet invitation |
| Tooltip: help line `--type-xs` (colour unspecified), padding unspecified | help line in new token `--tooltip-muted` `#C9CED6` (9.99 : 1 on `--tooltip-bg`); padding 4 8; title 600; `kbd` 18 px tall | Separates name from help without a second size |
| Text editor: borderless textarea, 1 px accent outline | (superseded in iteration 2: WYSIWYG box, padding 2 8) | Glyphs and caret touched the outline |
| Status hint while editing text: none | a hint (wording: see iteration 2) | Says how to finish and that formulas get their subscripts |
| Text editing options: x₂ x² B I Δ hν ° → | same, with a separator and a muted "Insert" caption before Δ hν ° → | Says what the second group does |
| Atom options "·" between elements and marks; selection actions in one run | 1 × 20 px `--border` separator; selection actions grouped Clean up / Kekulé / Tidy │ flips (│ Expand, see iteration 2) | Grouping instead of one long row of equal-weight buttons |
| (tokens) | added `--radius-pill` 14 px, `--tooltip-kbd-border`, `--tooltip-muted`, overlay alphas, layout sizes | Values the spec states in prose, named once |

### Accessibility corrections (2026-11-10)

| Spec | Mock-up | Why |
|---|---|---|
| Preset segments 64×20 (iteration 1 mock-up) | 64×24 (`--preset-seg-h: 24px`); the group is 28 px (1 px padding, 1 px outline), filling the 28 px status bar | Status-bar controls must be at least 24 px (SPEC-editor R41) |
| `--border-control` `#7a828e` (2.96 : 1 on `--pressed-bg`) | `#79818c`: 3.64 chrome, 3.94 canvas, 3.30 hover, 3.00 pressed | Control borders need 3 : 1 on every state background (SPEC-editor R42) |

Not UI: the mouse pointers drawn on screens 02 and 08 only show where the pointer is in a still
picture.
