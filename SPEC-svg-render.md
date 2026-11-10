# Spec: `svg-render`

Shared stack, commands, style and boundaries: see `SPEC.md`. Module map: `CAPABILITY-MAP.md`.
Depends on: `doc-model`, `chem-core` (public entries only). Status: **draft 2026-11-10, awaiting
review**.

Audience: a teacher of grade 11–12 chemistry in Nepal (NEB curriculum) building slides and
worksheets on Windows with Office 2021. Output must look like a textbook figure with no manual
touching up, and work with no network.

## Objective

Turn a `doc-model` document (or part of one) into an **SVG string** using a style preset. It is
the single source of truth for what a figure looks like: the editor's canvas, the clipboard
image and every export are this module's output, so "what you see is what you paste" holds by
construction.

It draws what `chem-core` perceives (implicit H on heteroatoms, charges, aromatic circles) and
what `doc-model` stores (bonds, arrows, text …). It decides nothing chemical and edits nothing.

User stories served (from `SPEC.md`): 1 (labels such as `OH`, `CO2H`, `Ph` laid out correctly),
2 (reaction schemes: arrows, plus signs, conditions with auto sub/superscripts), 3 (curved
electron-pushing arrows, lone pairs, radicals, charges, δ+/δ−), 4 (text, callouts, compound
numbers, brackets, colours, highlight shapes), 6 (crisp, tight, transparent image), and the
shared look of screen and export (success criterion 5).

## Scope

**In:** layout and drawing of every `doc-model` item type; the two style presets and the final
`StyleSettings` meaning; deterministic text measurement; ink extents (bounds including labels
and strokes); rendering the whole document or a subset; keyed output parts and a memoising
renderer for the editor; SVG text escaping and output safety.

**Out:** pointer interaction, hit-testing, selection handles/halos, valence-warning overlays,
grid, zoom and pan (`editor`; this module only supplies per-item extents); rasterising to PNG,
PDF, clipboard formats, embedding the document in files (`clipboard-export`; this module only
emits an opaque `<metadata>` string it is given); chemistry (`chem-core`); positions of
reaction-condition text (`editor` Tidy reaction; `attachedTo` is ignored when drawing); fonts
files (none are bundled or loaded); any DOM, canvas or network use.

## Facts relied on

| Fact | Consequence |
|---|---|
| Coordinates are BLU, y down, bond length 1.0 (`SPEC-doc-model.md`) | SVG user unit = **point (pt)**: `pt = BLU × bondLength`. No y flip |
| `bounds(doc, sel)` is the geometric hull and excludes label and stroke extents | This module computes the real ink extents (below); `bounds` is used only in tests as a lower bound |
| Rings are not stored; aromaticity is `order: 1.5` | Ring detection for circles and double-bond side is geometry-free graph work done here (`rings.ts`); chem-core exports no rings and none are needed from it |
| `perceive(doc)` gives `AtomInfo.implicitH` (= `explicitH` when set), unknown/abbreviation atoms report `implicitH: 0` | Atom text is built from `implicitH`; no chemistry here |
| `StyleSettings` is already in `Doc.style.overrides` and in the strict `.chalk` schema | Adding or renaming a field is a schema bump (see "Required changes") — the five fields stay |
| `interpretLabel` stores `OH`, `NH3+` … as element + `explicitH` + `charge`, never as a label | Only true abbreviations (`Ph`, `CO2H`, `OMe` …) and unknown labels arrive as `Atom.label` |
| Vitest and Electron both run V8 | `Math.sin/cos/atan2/sqrt` are bit-identical across Windows and Linux (V8's fdlibm port); see "Determinism" for what is avoided |

## Style

`Doc.style = { preset, overrides }` (doc-model, unchanged). **Final `StyleSettings`** (the type
stays exported from `doc-model`; this section owns the meaning):

```ts
interface StyleSettings {
  bondLength: number;         // pt. Scale of the whole figure (BLU → pt)
  lineWidth: number;          // pt. Bond, arrow, bracket, shape-outline stroke width
  doubleBondSpacing: number;  // fraction of bondLength: centre-to-centre gap of multiple-bond lines
  fontFamily: string;         // CSS family list for all text, e.g. 'Arial, Helvetica, sans-serif'
  fontSize: number;           // pt. Atom labels and every text-like object
}
```

Presets (`STYLE_PRESETS`); numbers are first values, confirmed at the Checkpoint-G-style visual
review of the golden sheet:

| Preset | bondLength | lineWidth | doubleBondSpacing | fontFamily | fontSize | Intent |
|---|---|---|---|---|---|---|
| `slides` | 40 | 2.0 | 0.18 | `Arial, Helvetica, sans-serif` | 20 | Readable from the back of a classroom |
| `journal` | 14.4 | 0.6 | 0.18 | `Arial, Helvetica, sans-serif` | 10 | ACS Document 1996 proportions (14.4 pt bond, 0.6 pt line, 10 pt Arial, 18 % spacing) |

`resolveStyle` merges `preset` then `overrides`. An override that is not a finite number in its
legal range (`bondLength` 4–400, `lineWidth` 0.05–20, `doubleBondSpacing` 0.05–0.5, `fontSize`
2–200) is ignored (the preset value is used), never an error: a hand-edited `.chalk` must still
render. `fontFamily` is sanitised (see "Output safety").

Everything else is **derived** from the three scale fields, so a style change rescales the figure
consistently (property: uniform scale invariance). Let `L` = bondLength, `lw` = lineWidth,
`fs` = fontSize. Initial values, tuned during implementation (a tuning change regenerates the
goldens and is reviewed visually):

| Derived (`ResolvedStyle`) | Value |
|---|---|
| `doubleGap` | `doubleBondSpacing·L` |
| `boldWidth` / `wedgeWide` (full width at the wide end) | `0.14·L` |
| `hashSpacing` | `0.17·L` |
| `labelMargin` (gap between a bond end and a label box) | `0.11·L` |
| `wavyAmplitude`, `wavyLength` | `0.07·L`, `0.2·L` |
| `arrowHeadLength`, `arrowHeadHalfWidth` | `0.22·L`, `0.09·L` |
| `equilibriumGap`, `noGoHalf`, `plusArm` (half length) | `0.12·L`, `0.12·L`, `0.15·L` |
| `curvedGap` (curve end to label box) | `0.08·L` |
| `circleRatio` (aromatic circle radius ÷ ring apothem) | `0.65` |
| `bracketSerif`, `roundBulge`, `curlyDepth` | `0.2·L`, `0.12·L`, `0.2·L` |
| `captionGap`, `calloutPad` | `0.5·L`, `0.2·fs` |
| `subScale`, `subShift` (down), `supShift` (up) | `0.7`, `0.2·fs`, `0.4·fs` (fs of the parent run) |
| `satelliteScale`, `satelliteGap`, `dotRadius`, `pairSeparation` | `0.7`, `0.12·fs`, `0.08·fs`, `0.16·fs` |
| `lineHeight` (multi-line text) | `1.2·fs` |
| `ink` | `#000000` (default colour of anything with no `color`) |

## Data Model

```ts
import type {
  AtomId, BondId, ObjectId, Color, Doc, Point, Rect, Selection, StylePreset, StyleSettings,
  TextRun,
} from '../doc-model';
import type { Perception } from '../chem-core';

type ResolvedStyle = Readonly<StyleSettings & { /* every derived value in the table above */ }>;

type ItemKey =                       // stable across renders of the same ids
  | `atom:${string}` | `bond:${string}` | `obj:${string}`
  | `ring:${string}`;                // ring circle: its sorted atom ids joined by ','

type Layer = 'beneath' | 'rings' | 'bonds' | 'atoms' | 'above';
                                     // paint order; 'beneath' = shape highlights, 'above' =
                                     // other objects in zOrder (paintLayers decides)

interface RenderPart { key: ItemKey; layer: Layer; svg: string }   // markup of one item, in
                                     // document pt coordinates; never contains a newline except
                                     // between elements

interface RenderOptions {
  style?: Doc['style'];              // draw with this style instead of doc.style (preview a
                                     // preset switch without editing the doc)
  only?: Selection;                  // draw a subset (see "Subsets"); default: everything
  perception?: Perception;           // must be perceive(doc) of this doc; default computed
  ink?: Color;                       // default colour, default '#000000'
  ids?: boolean;                     // add data-chalk-id="atom:a1" etc.; default false
}
interface Scene {                    // layout result; no SVG wrapper yet
  parts: RenderPart[];               // paint order
  bounds: Rect | null;               // ink extents, pt, document coordinates; null if empty
  extents: Readonly<Record<ItemKey, Rect>>;   // ink extents per drawn item, pt
  style: ResolvedStyle;
  notices: RenderNotice[];
}
type RenderNotice =
  | { code: 'unmeasured-glyph'; chars: string }      // fallback width used for these characters
  | { code: 'skipped-item'; key: ItemKey; reason: string };  // e.g. non-finite coordinate

interface SvgOptions {
  padding?: number;                  // pt added on every side, default 0 (tight)
  background?: Color;                // default: none (transparent)
  metadata?: string;                 // opaque text, escaped, emitted as <metadata id="chalkbond">
}
interface SvgDocument {
  svg: string;                       // complete standalone SVG, '\n' line ends, trailing newline
  width: number; height: number;     // pt (= the svg width/height attributes)
  origin: Point;                     // document pt coordinate shown at the SVG's (0,0), i.e.
                                     // (bounds.x - padding, bounds.y - padding)
}
```

## Public API

All functions are pure (no clock, no randomness, no I/O, no DOM) and never mutate the document.

```ts
// style
STYLE_PRESETS: Readonly<Record<StylePreset, StyleSettings>>
resolveStyle(style: Doc['style']): ResolvedStyle
bluToPt(p: Point, style: ResolvedStyle): Point         // × bondLength
ptToBlu(p: Point, style: ResolvedStyle): Point

// rendering
render(doc: Doc, opts?: RenderOptions): Scene
toSvg(scene: Scene, opts?: SvgOptions): SvgDocument
renderSvg(doc: Doc, opts?: RenderOptions & SvgOptions): SvgDocument & { bounds: Rect | null }
    // = toSvg(render(doc, opts), opts). Whole document, or a subset via `only`.
contentBounds(doc: Doc, opts?: Pick<RenderOptions, 'style' | 'only' | 'perception'>): Rect | null
    // pt; the ink extents without building markup strings' wrapper (still lays out)

// editor / repeated use
createRenderer(): { render(doc: Doc, opts?: RenderOptions): Scene }
    // identical results to render(); memoises per fragment and per object (see "Editor contract")

// text
measureRuns(runs: readonly TextRun[], style: ResolvedStyle, opts?: { size?: number }):
  { width: number; ascent: number; descent: number; lines: number; notices: RenderNotice[] }
    // the same function the layout uses; the editor sizes its in-place text field with it
```

`render` of an empty document (or an empty subset) gives `parts: []`, `bounds: null`; `toSvg`
then emits a valid, empty `<svg width="0pt" height="0pt" viewBox="0 0 0 0">` (callers guard
against empty exports). Documents are assumed to satisfy doc-model's invariants; defensive
checks only skip an offending item with a `skipped-item` notice, never throw.

## Subsets

`only` follows doc-model's `extract` closure: selected bonds bring their atoms; a bond is drawn
iff both its atoms are in the closure; objects are drawn iff selected (an arrow does **not**
bring its attached texts here — the caller selects what it wants). **Layout is computed on the
whole document and then filtered**: implicit H, label orientation, double-bond sides, satellite
placement and anchor resolution see the full neighbourhood. Consequences, both tested:

- every part of a subset render is byte-identical to the same-key part of the full render;
- a ring circle is drawn iff all of the ring's atoms are in the closure.

Curved arrows and callouts resolve their anchors against the whole document, so a selected
curved arrow still points at atoms that were not selected.

## Rendering rules

Paint order: `beneath` objects (shapes, in `zOrder`) → ring circles → bonds → atoms (labels and
satellites) → `above` objects in `zOrder`. Bonds and atoms in ascending id number. Groups have no
visual effect. The root sets defaults (`fill="none"`, `stroke` = ink, round caps and joins);
every filled element and every `<text>` sets `fill` (and `stroke="none"`) itself so no consumer
depends on inheritance for correctness.

### Atoms and labels

An atom is **labelled** (its text is drawn) when: element ≠ `C`; or it has a `label`; or `isotope`
or `explicitH` is set; or it has no bonds. Otherwise it is a skeleton vertex: no letter, no H.
Charge, radical, lone pairs, partial charge and `number` never force a letter.

| Part | Rule |
|---|---|
| Text | `[isotope superscript][H-part][symbol][H-part][charge superscript]`, symbol = `element` (pseudo-atoms `R`, `X`, `*` as typed) or the abbreviation/unknown `label` as typed. H-part = `H` + subscript `n` when `n` > 1, `n` = `AtomInfo.implicitH`, only for non-abbreviation atoms. Digits inside abbreviation labels (`CO2H`) are subscripted. Isotope sits immediately before the symbol |
| Side | Sum the unit vectors to the neighbours. `sx < -0.1` (neighbours left): H-part **after** the symbol (`OH`, `NH2`); `sx > 0.1` (neighbours right): **before** it (`HO`, `H2N`); otherwise after. For an abbreviation with a known reversed form (table below), `sx > 0.1` shows the reversed text; any other label is drawn as typed |
| Anchor | The symbol glyphs (for an abbreviation: the attachment glyph range given by the display table) are the **anchor box**. The label is positioned so the anchor box's centre is the atom position; baseline = `y + capHeight/2` (`capHeight` = 0.716·fs) |
| Bonds at a label | Bond lines end at the anchor box grown by `labelMargin` (geometric clip: no halos, no clip paths, so backgrounds stay transparent) |
| Charge | Superscript at the end of the text: `+`, `−` (U+2212), magnitude first when > 1 (`2−`). On a skeleton vertex it is drawn only as the sign, as a satellite (below) |
| Colour | `atom.color ?? ink` for all of the atom's text and satellites. Bonds do **not** inherit atom colour |
| Display table | `src/core/svg-render/label-display.ts`: for every key of chem-core's `ABBREVIATIONS`: reversed text and anchor range, e.g. `OMe` ↔ `MeO`, `OEt` ↔ `EtO`, `CO2H` ↔ `HO2C`, `COOH` ↔ `HOOC`, `CO2Me` ↔ `MeO2C`, `CHO` ↔ `OHC`, `NO2` ↔ `O2N`, `SO3H` ↔ `HO3S`, `CN` ↔ `NC`, `CONH2` ↔ `H2NOC`; symmetric ones (`Me`, `Ph`, `Ac`…) have none. A test fails if `ABBREVIATIONS` gains a key with no entry |

**Satellites** (lone pairs, radical dots, charge on a skeleton vertex, partial charge, atom
number) go into the angular **gaps between bond directions** (all bonds of the atom in the whole
document). Order of assignment: charge sign, lone pairs, radical dots, `partialCharge`,
`number`. Gaps are sorted by size (descending, ties by smaller angle), satellites are dealt
round-robin, and the `k` satellites of one gap sit at fractions `(j+1)/(k+1)` of it. An atom with
no bond has the single slots up, down, left, right (screen angles 270°, 90°, 180°, 0°). Distance:
from the atom centre to the edge of its anchor box along the direction (to the centre itself for
a vertex) plus `satelliteGap` (vertex: `0.3·fs`). A lone pair is two dots `pairSeparation` apart,
perpendicular to the direction; a radical dot is one dot; `partialCharge` and `number` are text
at `satelliteScale·fs`.

### Bonds

`L1` = clipped end points, `n` = left normal. "Left" is the visual left when travelling from `a1`
to `a2` on screen (y down). All lines are `lineWidth`, round caps.

| Bond | Rule |
|---|---|
| Single (`order 1`, `stereo none`) | one line |
| Double | `auto`: line on the side of the smallest ring containing the bond (towards its centroid; ties by lowest atom id); not in a ring: count the other neighbours of both atoms on each side — more on one side puts the second line there, equal counts (including 0) centre both lines. `center`: two lines at ±`doubleGap/2`. `left` / `right`: main line on the bond axis, second line `doubleGap` to that side. The shifted second line is shortened at each end by `doubleGap / tan φ` (φ = angle to the nearest neighbour bond on that side, 30°–90°; 0 if there is none), at most `0.5·L` in total |
| Triple | axis line plus lines at ±`doubleGap`; `doublePlacement` ignored |
| 1.5, ring with all bonds 1.5 | one plain line; the ring gets a circle (below) |
| 1.5, anywhere else | solid line plus dashed line (`stroke-dasharray` 0.25·L on, 0.15·L off), placed as a double bond (`auto` → centred; solid on the left) |
| `wedge` | filled polygon, point at `a1`, `wedgeWide` wide at `a2` |
| `hash` | `n = max(3, round(len / hashSpacing))` lines at `t = (i+0.5)/n`, half-length `wedgeWide/2 · t`, perpendicular to the axis |
| `bold` | filled rectangle `boldWidth` wide (the order's lines are not drawn; order is 1) |
| `wavy` | quadratic-Bézier sine path, amplitude `wavyAmplitude`, `2·round(len/wavyLength/2)` half-waves (min 2) |
| Wedge/hash/bold/wavy on order ≠ 1 | stereo is ignored, drawn as its order (doc-model allows the combination; chem-core exports single bonds only) |
| Colour | `bond.color ?? ink` |

Wedges and hashes are clipped at labels along the axis; their width profile follows the original
length, truncated to the clipped span.

### Aromatic circles

Smallest rings (minimal cycle basis, ring size 3–8, found by `rings.ts`) whose bonds are all
order 1.5 get one circle each: centre = ring centroid, radius = `circleRatio` × mean distance from
the centroid to the bond midpoints, stroke `lineWidth`, colour `ink`. Fused systems get one
circle per ring (naphthalene: 2). Perception's `BondInfo.aromatic` is not consulted: the stored
order rules (as `SPEC-doc-model.md` says), so a ring the user toggled partly to Kekulé is just
lines and doubles.

### Objects

Text positions `at` are in BLU and become pt. Text, caption and callout text use `fontSize` and
`fontFamily` (no per-object size exists in doc-model; see Open Questions).

| Object | Rule |
|---|---|
| `arrow` `forward` | shaft from `from` to the head base, solid triangular head at `to` (`arrowHeadLength` × `arrowHeadHalfWidth`) |
| `arrow` `equilibrium` | two parallel half-arrows (harpoons) `equilibriumGap` apart, each with a one-sided head: the one on the left of travel points to `to`, the other to `from`; barbs on the outer sides |
| `arrow` `retro` | two parallel lines `equilibriumGap` apart ending in an open chevron head at `to` (the retrosynthetic ⇒) |
| `arrow` `resonance` | one shaft, solid triangular heads at both ends |
| `arrow` `no-go` | a forward arrow with a cross (two lines, half-size `noGoHalf`) centred on the shaft midpoint |
| `arrow` length | head length is clamped to `0.5 × length`; `from = to` draws nothing |
| `curved-arrow` | Quadratic Bézier from `resolveAnchor(from)` to `resolveAnchor(to)`. Control point = chord midpoint + `bend × chordLength × n`, `n` = left normal of `from→to`; `bend 0` is a straight line (positive bends bulge to the visual left). Atom anchors **without** `offset` are clipped out of the atom's anchor box by `curvedGap` along the curve; an offset (lone pair), bond and point anchors are used as given. `full`: solid triangular head at the end; the shaft stops at the head base. `fishhook`: the head is the outer half only (the barb on the side away from the bulge) |
| `plus` | two lines crossing at `at`, arm `plusArm` |
| `text` | each run is its own `<text>` at an absolute x,y computed from measurement (no reliance on the renderer's inline layout); `align` places the line relative to `at.x`; the first line's cap-height box is vertically centred on `at.y`; `\n` in a run starts a new line (`lineHeight`). Runs: `sub`/`sup` at `subScale`, shifted by `subShift`/`supShift`; `bold`, `italic`; `color ?? ink`. `attachedTo` is ignored (the editor positions the text) |
| `caption` | centred horizontally on the union of the target atoms' ink extents (labels included), top edge `captionGap` below that union; multi-line allowed. Targets missing from the doc are skipped; none left → nothing drawn |
| `callout` | text centred at `at`; a leader line (`lineWidth`, no head) from the nearest point of the text box grown by `calloutPad` to `resolveAnchor(anchor)`, clipped out of an atom anchor's box like curved arrows |
| `bracket` | `square`: two sides at `rect.x` and `rect.x + w`, spanning `y … y+h`, serifs `bracketSerif` (clamped to `w/2`) pointing inwards. `round`: arcs bulging outwards by `roundBulge`. `curly`: four-cubic braces, tip depth `curlyDepth`. `corner` runs: left edge `0.15·fs` right of the right bracket; bottom-right (baseline at `y+h`) unless the first run is `sup`, then top-right (cap top at `y`) |
| `shape` | `rect` / `ellipse` of `rect`; `fill` with `fillOpacity` (`fill-opacity`), `stroke` at `lineWidth`; neither → nothing drawn. Painted in the `beneath` layer by `zOrder` |
| `zOrder` | `paintLayers(doc)` gives the layers; ids in it that are not drawn (subset) are skipped |

## Text measurement (no DOM)

**The main design risk:** label extents decide where bonds stop and where the bounds are, so they
must be known without a browser and be identical on every machine.

**Decision: a committed advance-width table.** `src/core/svg-render/font-metrics.ts` holds, in
1/1000 em, the advance widths and the vertical metrics of **Arial** (regular and bold; italic
uses the regular widths, as Arial's do), generated once by a dev script
`scripts/build-font-metrics.mjs` (no dependencies; ~60 lines reading `cmap` and `hmtx` from a
metric-identical font file passed on the command line — Liberation Sans, SIL OFL, so nothing
proprietary is committed — the TTF itself is not committed). Coverage: U+0020–007E, U+00A0, `°
± · × ÷ − † ‡ •`, the Greek block U+0391–03C9 (`δ`, `Δ`, `ν`, `μ`, `π` …), and the arrow
characters that exist in Arial. Any other character gets the fallback width `0.556 em` and a
`unmeasured-glyph` notice. Vertical: cap height 0.716 em, descent 0.212 em applied only to runs
that contain a descending glyph (`g j p q y , ; ( ) [ ] { } |` and `Q`); no kerning.

Why this works offline on Windows: the output asks for `Arial, Helvetica, sans-serif`. Arial ships
with every Windows 10/11 and every Office 2021, so the screen, PowerPoint and Word draw glyphs
whose advances equal the table; Linux CI has no Arial but nothing there measures anything, it
only compares strings. Every run is positioned absolutely, so a width error in one run cannot
shift another; the worst case is a slightly off label (≤ 1 % in Arial-compatible fonts).

**Other families.** An override of `fontFamily` is measured with Arial's table anyway (documented
limitation). The settings UI (`app-shell`) should offer only Arial-metric families (Arial,
Helvetica, Liberation Sans, Arimo).

**Rejected alternative A: measure in the renderer** (`canvas.measureText` / SVG `getBBox`). It
needs the DOM (forbidden in `core/*`), depends on which font the machine actually resolves, and
cannot give identical goldens on Linux and Windows.
**Rejected alternative B: convert text to outlines (paths)** from an embedded font. It would make
output font-independent and is attractive for Office paste, but it needs glyph outline data (large
table), makes text non-editable in PowerPoint and inflates files. Kept as an Open Question for
`clipboard-export`: `RenderOptions` can grow a `textAsPaths` flag later without changing anything
here. **Rejected alternative C: parse a font at runtime** (opentype.js): new dependency (ask
first), and Arial itself cannot be redistributed.

A calibration test in `e2e/` loads a fixed corpus in Electron's Chromium and compares
`getComputedTextLength()` with the table (≤ 1 %); on Windows that is real Arial, on Linux
Liberation Sans.

## Extents (bounds including labels and strokes)

`extents[key]` and `bounds` are the **ink boxes in pt**: every drawn primitive's geometry grown by
half its stroke width (round caps included), plus: label text boxes (all glyph runs, with
sub/superscripts, not just the anchor box), arrowheads, exact Bézier extrema for curves and
curved arrows, wedge polygons, circles, satellites, caption/callout/bracket/text boxes (measured
width × ascent/descent from `measureRuns`). `bounds` = union of `extents`; `padding` is added only
in `toSvg`. `bounds ⊇ bluToPt(doc-model bounds)` always (a test). An atom with no ink (a bare
skeleton vertex) has no extents entry; its position still contributes via its bonds.

## Determinism

Identical `(doc, options)` → **byte-identical** SVG on Linux and Windows.

- **Numbers:** one `fmt(n)`: `Math.round(n·1000)/1000`, printed without exponent or trailing
  zeros, `-0` → `0`, leading `0` kept (`0.5`), non-finite never reaches output (item skipped).
  Coordinates are pt, 3 decimals. Angles and ratios are never printed.
- **Maths:** only `+ − × ÷`, `Math.sqrt`, `sin`, `cos`, `atan2`, `abs`, `min`, `max`, `round`,
  `floor`. `Math.pow`, `hypot`, `exp`, `log`, `tan` are banned in render code (a lint-free grep
  test), the V8 versions have differed between platforms; `tan φ` is `sin/cos`.
- **Order:** records are iterated by ascending id number, never by object-key order; objects by
  `zOrder`; rings sorted by their sorted atom ids; satellites in the fixed order above; ties
  always by id.
- **Attributes:** every element is built by a helper that writes attributes in a fixed per-element
  order (listed in `svg-write.ts`); optional ones are omitted, never `undefined`. Colours are
  lower-cased `#rrggbb`.
- **Ids:** none are generated (no clip paths, gradients or `<use>`). Optional `data-chalk-id`
  (opt-in) carries the item key; the only other id is `<metadata id="chalkbond">`.
- **Text:** `\n` line ends, no indentation, one element per line, trailing newline; no XML
  prolog, no comments, no timestamps, no generator string.
- **Goldens:** stored with LF endings; `.gitattributes` marks `src/core/svg-render/__golden__/**`
  as `text eol=lf` so Windows `autocrlf` cannot dirty them.

## Output safety

- Escape `& < > " '` in every text node and attribute value. Characters illegal in XML 1.0
  (controls except tab/newline/CR, U+FFFE/U+FFFF, lone surrogates) become U+FFFD, so the output is
  always well-formed. `]]>` is covered by `>` escaping (no CDATA is used).
- Element allow-list: `svg g path polygon circle ellipse rect text metadata`. Attribute
  allow-list: geometry, `fill fill-opacity stroke stroke-width stroke-linecap stroke-linejoin
  stroke-dasharray font-family font-size font-weight font-style text-anchor xml:space transform
  xmlns width height viewBox data-chalk-id id` (`id` only on `<metadata>`).
- Never emitted: `script`, `style`, `foreignObject`, `use`, `image`, `a`, event attributes,
  `href`/`xlink:href`, any `url(…)` or other external reference. The only URL in the output is the
  `xmlns` namespace.
- Colours must match `^#[0-9a-fA-F]{6}$` (doc-model validates, but a doc can be built unchecked);
  anything else falls back to `ink`.
- `fontFamily` (user-supplied through overrides) is reduced to characters `A–Z a–z 0–9 space , - _
  ' "` (quotes stripped), at most 200 characters; empty after that → the preset's family.
- `metadata` is text content, escaped; it is the only free-text channel and is never parsed here.
- Text run content is only ever placed in `<text>` nodes; user text can never become markup.

## Editor contract (incremental / screen use)

The editor owns the canvas; this module supplies the following and promises nothing more.

1. **Keyed parts.** `Scene.parts` is the paint-ordered list; each part has a stable `key` and its
   markup string. The editor mounts parts in order and, on the next scene, replaces only parts
   whose `svg` string changed, adds new keys and drops missing ones (a bond's markup changes when
   a neighbour moves, and the string comparison catches that — no dependency tracking needed in
   the editor). `parts.map(p => p.svg).join('\n')` inside a transformed `<g>` is exactly the
   export content.
2. **Coordinates.** Parts are in document pt (`bluToPt`); no viewBox shift, no zoom. The editor
   applies pan/zoom with its own `transform` on a wrapping element. Pointer → BLU is
   `ptToBlu`.
3. **Extents.** `extents[key]` gives each item's ink box for hit-testing, marquee selection and
   selection halos. Finer hit-testing (distance to a bond segment, arrow path) is the editor's,
   using document geometry; this module offers boxes only.
4. **`createRenderer()`** memoises per fragment (keyed by the identity and contents of its atoms,
   bonds, perception and style — Immer's structural sharing makes unchanged items `===`) and per
   object. Result is **deep-equal to `render`** (property test), so correctness never depends on
   the cache. It also holds a `createPerceiver()` unless `opts.perception` is passed.
5. **Overlays are the editor's:** selection, handles, valence warnings (`Perception.warnings`
   with `extents` for placement), snapping guides, ghost previews (render a scratch doc built with
   `insert(emptyDoc, sub, at)` and wrap its parts in a `<g opacity>`), grid, rulers.
6. **No async, no side effects, no DOM** — the editor may call `render` inside a React render or
   a web worker; a render of a given doc is the same everywhere.
7. **Preset switching** is `render(doc, { style: { preset, overrides } })` (preview) or an edit of
   `doc.style` through doc-model (commit); both give the same bytes once committed.

## Required changes to other modules

Stated explicitly; nothing is assumed.

| Module | Change | Needed? |
|---|---|---|
| `doc-model` | `StyleSettings` **stays** in `doc-model/types.ts` and in the `.chalk` schema (it is part of `Doc`; moving it to `svg-render` would make `doc-model` import a downstream module, which the capability map forbids). Its five fields are final: **no code, schema or `schemaVersion` change.** Docs only: replace "Provisional field set" in the `types.ts` JSDoc and "(provisional; svg-render's spec owns it)" in `SPEC-doc-model.md` with "final; meaning defined in `SPEC-svg-render.md`" | Docs only |
| `chem-core` | None. This module consumes `perceive`, `createPerceiver`, `AtomInfo.implicitH`, `Perception`, and `ABBREVIATIONS` (for the display-table coverage test) | No |
| Tooling | `eslint.config.mjs` dependency table: `svg-render` may import `doc-model` and `chem-core` only; `.gitattributes` rule for goldens; `scripts/build-font-metrics.mjs`; an `npm run golden:sheet` Node script writing `out/golden-sheet.html` (not committed) for visual review; the metrics calibration test under `e2e/` | Yes |
| Future | A per-object font size or a `textAsPaths` option would add `doc-model` fields (schema bump, "ask first") — not part of v1 | No |

## Testing

- **Golden set** (`src/core/svg-render/__golden__/*.svg`, written with `toMatchFileSnapshot`,
  reviewed visually through the golden sheet at the checkpoint, because a byte snapshot cannot
  tell a wrong picture from a right one). Inputs are committed `.chalk` fixtures
  (`__golden__/inputs/`, produced once from chem-core's parsers and then frozen, so an OCL layout
  change never moves a golden; plus doc-model's `benzene`, `two-step-reaction`, `mechanism`,
  `kitchen-sink`). ≥ 30 scenes: benzene (circle), toluene, naphthalene (two circles), pyridine,
  Kekulé benzene (inside-ring double bonds), cyclohexane, ethanol (`OH`, side flip both ways),
  acetic acid (`C=O` placement, `CO2H`), acetate (1.5 pair), ammonium, nitro with charges, alkene
  cis and trans, propyne, wedge/hash/bold/wavy (alanine), `Ph`/`OMe`/`NO2`/`CO2H` attached on
  the left and on the right, `R` pseudo-atom, isotopes (`¹³C`, `D`), radical, carbanion with lone
  pair, HCl with δ+/δ−, atom numbers, coloured atoms and bonds; each arrow kind; a reaction
  scheme with conditions text (sub/sup/bold/italic); the mechanism with `full` and `fishhook`
  arrows; plus signs; caption; callout; square/round/curly brackets with `corner`; shapes with
  fill opacity; an empty-label-only doc; 3 scenes in each preset; a style-override scene; a
  subset scene.
- **Unit:** every public function; `fmt`; each row of every rule table; ring finder (benzene,
  naphthalene, cubane, spiro, bicyclic, 12-ring); satellite placement; double-bond side
  decision table; clipping against boxes from all 8 directions; measurement against known
  Helvetica/Arial widths (`W` 944, `i` 222, `0` 556, `m` 833 …) and a fallback-notice case;
  `resolveStyle` with every kind of bad override; escaping of `<`, `&`, `"`, `]]>`, control
  characters, lone surrogates, emoji; the allow-lists.
- **Properties (fast-check, reusing doc-model's command generator and chem-core's):**
  1. `render` never throws on any doc reachable by doc-model ops; output parses as XML (a test
     file with the jsdom environment uses `DOMParser`; the source stays DOM-free) and uses only
     allow-listed elements and attributes;
  2. determinism: same input twice, `parse(serialize(doc))`, and the doc rebuilt with reversed
     record key order all give identical bytes;
  3. every number in the output matches `^-?\d+(\.\d{1,3})?$` (no exponent, no `-0`);
  4. subset: each part of `render(doc, { only })` equals the same-key part of `render(doc)`;
  5. cache: `createRenderer().render` deep-equals `render` across an edit sequence;
  6. bounds: `bounds` contains the pt image of doc-model's `bounds`, equals the union of
     `extents`, and translating the whole doc by `(dx,dy)` BLU translates `bounds` by
     `(dx,dy)·L` with the same size (±0.002 pt);
  7. uniform scale: scaling `bondLength`, `lineWidth`, `fontSize` by `k` scales `bounds` by `k`
     (±0.005·k pt);
  8. safety: runs, labels, titles and `metadata` drawn from arbitrary Unicode (including `<script>`,
     `"onload=`, `]]>`) keep the output well-formed with no new elements, and the text round-trips
     through the parsed output (except illegal characters → U+FFFD).
- **Visual regression for the shipped pipeline** is manual (`docs/windows-checklist.md`): paste
  three goldens into PowerPoint/Word 2021 and check labels, bond ends and the circle look right.
- **Perf** (separate perf project like the other modules, skipped under `--coverage`):
  slide-sized scheme (4 molecules ≈ 40 atoms, 3 arrows, 6 texts) `render` < 8 ms median; 500-atom
  single fragment + 20 objects < 40 ms median; `createRenderer` re-render after moving one of ten
  50-atom fragments < 5 ms median.
- **Coverage:** `src/core/svg-render` line coverage ≥ 90 % (`SPEC.md` target; the generated
  metrics table and `__golden__/` excluded).

## Success Criteria

1. Every function in "Public API" exists with tests; line coverage ≥ 90 %.
2. Every doc-model item type and every `BondOrder`/`BondStereo`/`ArrowKind`/bracket/shape variant
   has a rendering rule above and a golden scene; the exhaustive `switch`es end in `never`.
3. Golden outputs are byte-identical on Linux and Windows (`npm test` passes on both with no
   `-u`), including after a Windows `git checkout` with `autocrlf`.
4. Same input → same bytes: determinism property passes at 1,000 runs.
5. `bounds` of every golden scene contains all drawn ink within 0.01 pt (checked by a test that
   rasterisation-free scans every number pair in the markup) and is tight to within 0.5 pt of
   the farthest drawn primitive.
6. Aromatic rings with all-1.5 bonds get circles (naphthalene: 2); a 1.5 bond elsewhere is a solid
   plus dashed line; Kekulé rings get inside-ring double bonds.
7. Heteroatom labels show implicit H from `perceive` and flip so the text reads away from the
   bonds (`OH` / `HO`, `NH2` / `H2N`); `CO2H`, `OMe`, `NO2` attach through the correct glyph.
8. Subset rendering equals the matching slice of the full rendering (property 4).
9. Output is well-formed XML containing only allow-listed elements/attributes and no external
   reference, for any user text (property 8).
10. Presets: `slides` and `journal` render the same doc with identical structure at different
    scale; uniform-scale invariance holds (property 7).
11. `createRenderer` agrees with `render` and meets its perf budget (properties 5, perf).
12. A transparent-background export of the slide-sized golden scheme has bounds within
    `lineWidth/2` of its ink on all four sides (tight bounds, success criterion 4 of `SPEC.md`).
13. No DOM, Node or Electron import in the module (lint and `tsconfig.core.json` pass); no
    network access.
14. Perf budgets met on Windows.

## Boundaries (module-specific)

- **Always:** render from `doc-model` types and `chem-core`'s public API only; keep every number
  through `fmt`; keep user text out of markup; update goldens only with a reviewed visual diff.
- **Ask first:** adding a `StyleSettings` field or a `DrawObject`/`Atom` field (schema bump);
  bundling a font or emitting outlines; adding a dependency (e.g. a font parser); changing a
  derived constant after the golden review (it moves goldens).
- **Never:** use a DOM, canvas or `getBBox`; emit scripts, styles or external references; rely on
  object-key order; embed timestamps or random ids; read or write files; draw interaction state
  (selection, warnings) into the output.

## Open Questions

Each needs a human decision; the default is what the plan will assume unless told otherwise.

1. **Charge on a skeleton carbon (carbocation, carbanion):** sign only at the vertex (default,
   ChemDraw-like) or `C⁺` with the letter shown?
2. **Text size:** all text-like objects use `fontSize`; doc-model has no per-object size. Default:
   keep, and add a field (schema bump) only if the teacher asks for big titles.
3. **Fishhook barb side:** default the outer side of the curve (away from the bulge). Confirm
   against textbook figures at the golden review.
4. **Text as outlines for Office paste:** default `<text>` in Arial for v1; `clipboard-export`
   decides after testing on Office 2021 whether to ask for a `textAsPaths` flag.
5. **Metrics source font:** default Liberation Sans via the dev script (OFL, metric-identical to
   Arial). Alternative: the Adobe Helvetica AFM (ASCII only, no Greek).
6. **Fonts other than Arial:** default measured with Arial widths and the UI offers only
   metric-compatible families. Alternative: a second table for Segoe UI / Calibri.
7. **Ring perception location:** default a small internal `rings.ts` (cycle basis, sizes 3–12).
   Alternative: ask chem-core to export rings (adds a public function there).
8. **Reversed-label table ownership:** default in `svg-render` (`label-display.ts`) with a test
   tying it to `ABBREVIATIONS`. Alternative: put `reversed`/`anchor` data in chem-core's table.
9. **Bond colour inheritance:** default none (bonds are `bond.color ?? ink`). Alternative: a bond
   whose two atoms share a colour takes it, half-and-half when they differ.
10. **Equilibrium arrow:** default two harpoons; alternative two full arrowheads. Retro arrow is
    the open double-line ⇒.
11. **Padding:** default `padding: 0` in `toSvg` (tight); `clipboard-export` adds any margin.
12. **Preset numbers and derived constants** (Slides 40 pt / 2 pt / 20 pt, wedge width,
    arrowhead size …): default as tabled; adjust after the visual golden review.
13. **Valence warnings in output:** default never drawn here; the editor overlays them using
    `extents`. Alternative: an opt-in `showWarnings` that draws a red underline.
14. **Group rendering:** default none (groups affect selection only).
15. **`ids` option:** default off, so exported SVG carries no `data-chalk-id`; the editor opts in
    if it wants DOM-level hit-testing instead of boxes.
