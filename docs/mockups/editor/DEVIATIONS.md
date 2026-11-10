# Editor mock-ups: deviations from SPEC-editor.md

Static mock-ups of the editor UI. `SPEC-editor.md` "UI design" is the source; each row below is a
place where the mock-ups differ, so the spec can be updated to match (or the mock-up reverted).

Files: `tokens.css` (all tokens), `icons.svg` (sprite, one `<symbol>` per icon), `mockup.css`
(regions and controls), `NN-*.html` (one per screen), `canvas/*.svg` (real svg-render output,
Slides preset, 100 %, plus the overlays), `build.mjs` (regenerates `canvas/` and the pages from
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

## Visual refinements

| Spec value | Mock-up value | Why |
|---|---|---|
| `--type-rail` 15 / 20 px, 600 | 18 / 24 px, 600 | At 15 px the element letter on the Atom rail button was optically much smaller than the 24 px icons beside it |
| Options button 28 × 28 (`--option-btn`) | 32 × 32, 2 px apart inside a set; 8 px either side of a separator | At 28 px the 2 px selected underline touched the bottom of 20 px icons (hexagon, wedge). 32 matches the name field and Undo/Redo, so the top bar has one control height. The Atom bar still fits at 960 px with ~45 px to spare (screen 11) |
| Option text glyphs `--type-sm` (13 px) 600 | `--type-md` (14 px) 600 | 13 px element symbols looked undersized next to 20 px icons |
| Selected option underline "2 px above the bottom edge" | unchanged (2 px), now 4 px clear of the icon | follows from the 32 px button |
| Action button gap 6 px, padding 0 8 | gap 4 px, padding 0 8 0 4 | 6 is not on the spacing scale; the 20 px icons carry ~1.7 px of internal margin, so 4 reads as 6 and the left padding looks even |
| Number: icon only, tooltip "Number the molecule" | icon + label "Number" | Icon-only, the spec glyph read as ♀ or a map pin at 20 px; there is room for the label at 960 px |
| `number` icon: hexagon above a "1" | hexagon (centre 8.5,10, r 5.5) with a "1" at its lower right (`M16.5 14.5 L18.5 13 V20`, `M16.5 20 H20.5`) | Reads as "compound 1", like the caption it creates |
| `clean-up` icon: small hexagon + plus-shaped sparkle | hexagon centre 9.5,13.5 r 7; filled four-point star at 18.5,5.5 | The spec glyph read as "O⁺", an oxygen cation, which is the worst possible misreading in a chemistry app |
| `ring-3` triangle 12,4.5 19.5,18 4.5,18 | 12,4 20,18.5 4,18.5 | Triangles look smaller than squares/hexagons of the same box; this matches their optical size |
| `curved-full` / `curved-fishhook` shaft ends at 18,8.5; fishhook barb 17.5,9 | shaft ends at 17,8.2; barb 17.2,8.6 | The round cap poked out of the open side of the half head |
| Selection: every selected atom gets the r 12 hover circle at 24 % | A skeleton vertex whose bonds are also selected gets no circle (the round-capped 12 px bond bands cover it); all marks are drawn opaque in one group with `opacity` 0.24 (hover 0.16) | Circles on every vertex made a string of beads around the ring; per-shape alpha darkened every overlap |
| Preset switch: two transparent 64 × 24 segments | 1 px `--border` outline (radius 4, 24 px tall), segments 64 × 20 inside | Without a boundary the unselected "Handout" reads as plain text, not as the other half of a switch |
| Zoom cluster spacing unspecified | 2 px between −, 100 %, +, fit | |
| Warnings button 24 × 24 | auto width, padding 0 4, icon + count, 600 | The count needs room |
| Name field width `clamp(240px, 26vw, 360px)` | `round(down, clamp(240px, 26vw, 360px), 1px)` (dropdown too) | 26vw is 332.8 px at 1280: every icon right of the field landed on a half pixel and blurred |
| Name field: focused = 2 px accent; not found = 1 px warning | focused and not found = 2 px `--warning` | The combination is the normal case right after Enter and was unspecified |
| Dropdown width = field width | `min-width: 320px`; "Did you mean" on its own line (`--type-xs`) above the chips | At field width (249 px at 960) the three suggestion chips wrapped onto a second line |
| Dropdown row: name, formula | typed prefix in 600 weight | Easier to scan which part matched |
| Empty-state benzene: the 24-grid icon at 96 px (6 px stroke) | inline copy with `stroke-width` 1 (4 px at 96) | 6 px read as heavy clip-art rather than a quiet invitation |
| Tooltip: help line `--type-xs` (colour unspecified), padding unspecified | help line in new token `--tooltip-muted` `#C9CED6` (9.99 : 1 on `--tooltip-bg`); padding 4 8; title 600; `kbd` 18 px tall | Separates name from help without a second size |
| Text editor: borderless textarea, 1 px accent outline | padding 2 4 inside the outline | Glyphs and caret touched the outline |
| Status hint while editing text: none | "Enter finishes. Shift+Enter starts a new line. H2SO4 gets its subscripts by itself." | The textarea shows the source (`H2SO4`, no subscripts); without a word the teacher will think subscripts are broken |
| Text editing options: x₂ x² B I Δ hν ° → | same, with a separator and a muted "Insert" caption before Δ hν ° → | Says what the second group does |
| Atom options "·" between elements and marks; selection actions in one run | 1 × 20 px `--border` separator; selection actions grouped Clean up / Kekulé / Tidy │ Number / flips │ Expand | Grouping instead of one long row of equal-weight buttons |
| (tokens) | added `--radius-pill` 14 px, `--tooltip-kbd-border`, `--tooltip-muted`, overlay alphas, layout sizes | Values the spec states in prose, named once |

Not UI: the mouse pointers drawn on screens 02 and 08 only show where the pointer is in a still
picture.
