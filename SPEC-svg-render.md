# Spec: `svg-render`

Shared stack, commands, style and boundaries: see `SPEC.md`. Module map: `CAPABILITY-MAP.md`.
Depends on: `doc-model`, `chem-core` (public entries only). Status: **approved 2026-11-10**
(reviewed and approved by the delegated reviewer; see "Decisions").

Audience: a teacher of grade 11–12 chemistry in Nepal (NEB curriculum) building slides and
worksheets on Windows with Office 2021. Output must look like a textbook figure with no manual
touching up, and work with no network.

## Objective

Turn a `doc-model` document (or part of one) into an **SVG string** using a style preset. It is
the single source of truth for what a figure looks like: the editor's canvas, the clipboard
image and every export are this module's output, so "what you see is what you paste" holds by
construction.

It draws what `chem-core` perceives (implicit H on heteroatoms) and what `doc-model` stores
(bonds, arrows, text …). It decides nothing chemical and edits nothing.

User stories served (from `SPEC.md`): 1 (labels such as `OH`, `CO2H`, `Ph` laid out correctly),
2 (reaction schemes: arrows, plus signs, conditions with sub/superscripts), 3 (curved
electron-pushing arrows, lone pairs, radicals, charges, δ+/δ−), 4 (text, callouts, compound
numbers, brackets, colours, highlight shapes), 6 (crisp, tight, transparent image), and the
shared look of screen and export (success criterion 5).

## Scope

**In:** layout and drawing of every `doc-model` item type; the two style presets and the final
`StyleSettings` meaning; deterministic text measurement; ink extents (bounds including labels
and strokes); rendering the whole document or a subset; SVG text escaping and output safety.

**Out:** pointer interaction, hit-testing, selection handles, valence-warning overlays, grid,
zoom and pan (`editor`; this module only supplies per-item extents); rasterising to PNG, PDF,
clipboard formats, embedding the document in files (`clipboard-export`; this module only emits
an opaque `<metadata>` string it is given); chemistry (`chem-core`); positions of reaction
condition text (`editor` Tidy reaction; `attachedTo` is ignored when drawing); font files (none
are bundled or loaded); any DOM, canvas or network use; a memoising renderer (deferred, see
"Decisions").

## Facts relied on

| Fact | Consequence |
|---|---|
| Coordinates are BLU, y down, bond length 1.0 (`SPEC-doc-model.md`) | SVG user unit = **point (pt)**: `pt = BLU × bondLength`. No y flip |
| `bounds(doc, sel)` is the geometric hull and excludes label and stroke extents | This module computes the real ink extents (below); `bounds` is used only in tests as a lower bound |
| Rings are not stored; aromaticity is `order: 1.5`. chem-core exports no ring information (`Perception` has per-atom/bond flags and fragments only) and its `BondInfo.aromatic` follows OCL, not the stored order | Ring finding for circles and double-bond side is done here (`rings.ts`) on stored bond orders, as `SPEC-doc-model.md` prescribes |
| `perceive(doc)` gives `AtomInfo.implicitH` (= `explicitH` when set); abbreviation and unknown-label atoms report `implicitH: 0` | Atom text is built from `implicitH`; no chemistry here |
| `StyleSettings` is already in `Doc.style.overrides` and in the strict `.chalk` schema | Its five fields are final here; adding or renaming one is a schema bump ("Ask first") |
| `interpretLabel` stores `OH`, `NH3+` … as element + `explicitH` + `charge`, never as a label | Only true abbreviations (`Ph`, `CO2H`, `OMe` …) and unknown labels arrive as `Atom.label` |
| `tsconfig.core.json` has no DOM and no Node types; ESLint already restricts `svg-render` to `doc-model` + `chem-core` imports (`CORE_DEPS`, probed in `tests/tooling/lint-boundaries.test.ts`) | Nothing to add for import boundaries |
| Vitest and Electron both run V8 | `Math.sin/cos/atan2/sqrt` are bit-identical across Windows and Linux (V8 uses its own fdlibm port, not the C library); see "Determinism" for what is avoided |

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

Presets (`STYLE_PRESETS`); first values, checked at the visual review of the golden sheet:

| Preset | bondLength | lineWidth | doubleBondSpacing | fontFamily | fontSize | Intent |
|---|---|---|---|---|---|---|
| `slides` | 40 | 2.0 | 0.18 | `Arial, Helvetica, sans-serif` | 24 | Readable from the back of a classroom; 24 pt (not 28) so a bond between two labelled atoms (Lewis `H–O–H`, `N–H`, nitro `N–O`) keeps a visible length at a 40 pt bond (golden review) |
| `journal` | 14.4 | 0.6 | 0.18 | `Arial, Helvetica, sans-serif` | 10 | ACS Document 1996 proportions (14.4 pt bond, 0.6 pt line, 10 pt Arial, 18 % spacing) |

`resolveStyle` merges `preset` then `overrides`. An override that is not a finite number in its
legal range (`bondLength` 4–400, `lineWidth` 0.05–20, `doubleBondSpacing` 0.05–0.5, `fontSize`
2–200) is ignored (the preset value is used), never an error: a hand-edited `.chalk` must still
render. `fontFamily` is sanitised (see "Output safety").

Everything else is **derived** from the scale fields, so a style change rescales the figure
consistently. Let `L` = bondLength, `fs` = fontSize. Initial values; a tuning change regenerates
the goldens and is reviewed visually:

| Derived (`ResolvedStyle`) | Value |
|---|---|
| `doubleGap` | `doubleBondSpacing·L` |
| `boldWidth` / `wedgeWide` (full width at the wide end) | `0.14·L` |
| `hashSpacing` | `0.17·L` |
| `dashOn`, `dashOff` (1.5 bond second line) | `0.25·L`, `0.15·L` |
| `labelMargin` (gap between a bond end and a label box) | `0.11·L` |
| `wavyAmplitude`, `wavyLength` | `0.07·L`, `0.2·L` |
| `arrowHeadLength`, `arrowHeadHalfWidth` | `0.22·L`, `0.09·L` |
| `equilibriumGap`, `noGoHalf`, `plusArm` (half length) | `0.12·L`, `0.12·L`, `0.15·L` |
| `curvedGap` (curve end to label box) | `0.08·L` |
| `circleRatio` (aromatic circle radius ÷ ring apothem) | `0.65` |
| `bracketSerif`, `roundBulge`, `curlyDepth` | `0.2·L`, `0.12·L`, `0.2·L` |
| `captionGap`, `calloutPad`, `cornerGap` | `0.5·L`, `0.2·fs`, `0.15·fs` |
| `subScale`, `subShift` (down), `supShift` (up) | `0.7`, `0.2·fs`, `0.4·fs` (fs of the parent run) |
| `satelliteScale` (sign and number text), `satelliteGap` (box to nearest satellite ink), `dotRadius`, `pairSeparation` (centre to centre of a lone pair's dots) | `0.7`, `0.10·fs`, `0.05·fs`, `0.24·fs` |
| `capHeight`, `lineHeight` (multi-line text) | `0.716·fs`, `1.2·fs` |

The default colour of anything without a `color` is the constant `INK = '#000000'`.

## Decisions

Resolved during review (they replace the draft's open questions); binding until a spec change.

1. **Charge on a skeleton carbon** (carbocation, carbanion): the sign alone is drawn at the
   vertex (as a satellite, with magnitude when > 1); the letter is not forced.
2. **Text size:** every text-like object uses `fontSize`; doc-model has no per-object size. A
   field (schema bump, "ask first") is added only if the teacher needs big titles.
3. **Fishhook barb:** the convex side of the curve (the side the curve bulges toward, i.e. away
   from the centre of curvature; the textbook convention).
4. **Text stays `<text>`** in Arial for v1; no `textAsPaths` option. `clipboard-export` may ask
   for one after testing on Office 2021 ("ask first").
5. **Metrics source:** Liberation Sans (SIL OFL, advance-identical to Arial) read by a dev
   script; Arial from `C:\Windows\Fonts` is equally valid input. Adobe AFM is rejected (no Greek).
6. **Other font families** are measured with Arial's table (documented limitation); `app-shell`
   should offer only Arial-metric families (Arial, Helvetica, Liberation Sans, Arimo).
   **Non-Latin text** (e.g. a Devanagari caption) is drawn by the system's fallback font; its
   width is the fallback width, so its extents and centring are approximate (a notice is
   emitted). Per-script tables are not part of v1.
7. **Ring finding** stays internal (`rings.ts`, ring sizes 3–8), per "Facts relied on".
8. **Reversed-label table** lives in `svg-render` (`label-display.ts`), tied to chem-core's
   `ABBREVIATIONS` by a test (display concern, not chemistry).
9. **Bond colour** is `bond.color ?? INK`; bonds never inherit atom colour.
10. **Equilibrium arrow** is two harpoons (⇌); the retro arrow is the open double line ⇒.
11. **Padding** defaults to 0 (tight); `clipboard-export` adds any margin. **Preset numbers
    and derived constants** are as tabled, adjusted only at the golden review. **Valence
    warnings** are never drawn here (the editor overlays them using `extents`). **Groups** have no
    visual effect.
12. **Cut for v1** (nothing in `editor` / `clipboard-export` demonstrably needs them; each can
    be added later without breaking the API): the `ids` option and `data-chalk-id`;
    `createRenderer` (render meets the editor's budget unmemoised and chem-core already caches
    perception; the editor spec may request it after profiling); the `ink`, `style` and
    `background` options; `contentBounds` (use `render(...).bounds`); a public `measureRuns`
    (internal; the editor reads text extents from `Scene.extents`).
13. **Short curved arrows (2026-11-10):** above `|bend| 0.5` a curved arrow is a symmetric cubic
    whose end handles turn from the quadratic's towards square to the chord (reached at
    `|bend| 1`), instead of a quadratic whose control point runs away. A tall quadratic is a
    narrow V whose ends run back along its own chord: over a bond-to-own-atom chord (0.5 BLU) the
    label clip ate the far leg and left a stub with a head pointing away from the atom. With
    square handles the arc leaves its source sideways and arrives at its target head-on, so the
    label clip cuts a leg that already points at the label's centre. Up to `|bend| 0.5` the curve
    and its markup are unchanged (every stored document drawn before keeps its bytes), and the
    curve's `t = 0.5` point is `chord midpoint + bend × chord / 2 × n` for every bend, so the
    editor's bend handle stays on the drawn apex. `curveControls` is exported so the editor's
    hit-testing and hover band follow the drawn curve, and `isLabelled` so the editor's default
    bend knows which ends are clipped out of a label (`SPEC-editor.md` R37).

14. **Linux ink calibration (2026-11-10):** the glyph-specific ink allowances in Text
    measurement cover installed Liberation Sans as well as Arial, without changing advances,
    layout boxes or other glyphs' extents. Calibration tolerances and corpus stay unchanged.

## Data Model

```ts
import type {
  AtomId, BondId, Color, Doc, ObjectId, Point, Rect, Selection, StylePreset, StyleSettings,
} from '../doc-model';
import type { Perception } from '../chem-core';

type ResolvedStyle = Readonly<StyleSettings & { /* every derived value in the table above */ }>;

type ItemKey =                       // stable across renders of the same ids
  | `atom:${string}` | `bond:${string}` | `obj:${string}`
  | `ring:${string}`;                // ring circle: its atom ids sorted by number, joined by ','

interface RenderPart { key: ItemKey; svg: string }   // markup of one item, document pt coordinates;
                                     // elements separated by '\n', no other newline

interface RenderOptions {
  only?: Selection;                  // draw a subset (see "Subsets"); undefined = everything,
                                     // empty sets = nothing
  perception?: Perception;           // must be perceive(doc) of this doc; default computed
}
interface Scene {                    // layout result; no SVG wrapper yet
  parts: RenderPart[];               // paint order
  bounds: Rect | null;               // ink extents, pt, document coordinates; null if empty
  extents: Readonly<Record<ItemKey, Rect>>;   // ink extents per drawn item, pt
  style: ResolvedStyle;
  notices: RenderNotice[];           // deterministic order
}
type RenderNotice =
  | { code: 'unmeasured-glyph'; chars: string }      // fallback width used; chars deduplicated,
                                                     // sorted by code point
  | { code: 'skipped-item'; key: ItemKey; reason: string };  // e.g. non-finite coordinate

interface SvgOptions {
  padding?: number;                  // pt added on every side, default 0 (tight)
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
renderSvg(doc: Doc, opts?: RenderOptions & SvgOptions): SvgDocument
    // = toSvg(render(doc, opts), opts). Whole document, or a subset via `only`.

// geometry shared with the editor (Decision 13)
curveControls(from: Point, to: Point, bend: number): [Point, Point, Point, Point]
    // the cubic control points of a curved arrow's whole (unclipped) curve between its resolved
    // anchors, in any one unit; for |bend| ≤ 0.5 the degree-raised quadratic (same point set)
isLabelled(atom: Atom, bondCount: number): boolean
    // whether the atom is drawn with a text label (so curved-arrow ends are clipped out of it):
    // element ≠ C, a custom label, an isotope, explicit H, or no bonds
```

`render` of an empty document (or an empty subset) gives `parts: []`, `bounds: null`; `toSvg`
then emits a valid empty `<svg width="0pt" height="0pt" viewBox="0 0 0 0">` with no group
(callers guard against empty exports). Otherwise the output is
`<svg xmlns width="Wpt" height="Hpt" viewBox="0 0 W H">`, an optional `<metadata>`, and one
`<g transform="translate(-ox -oy)" …>` holding the parts (so the SVG's own coordinates start at
0,0, which Office imports reliably). Documents are assumed to satisfy doc-model's invariants;
defensive checks only skip an offending item with a `skipped-item` notice, never throw.

## Subsets

`only` uses `extract`'s atom/bond closure — selected bonds bring their atoms, and a bond is drawn
iff both its atoms are in the closure — but objects are drawn iff selected (an arrow does **not**
bring its attached texts; the caller selects what it wants). **Layout is computed on the whole
document and then filtered**: implicit H, label orientation, double-bond sides, satellite
placement and anchor resolution see the full neighbourhood (so a pasted fragment looks exactly
as it did on screen). Consequences, both tested:

- every part of a subset render is byte-identical to the same-key part of the full render;
- a ring circle is drawn iff all of the ring's atoms are in the closure.

Curved arrows and callouts resolve their anchors against the whole document, so a selected
curved arrow still points at atoms that were not selected.

## Rendering rules

Paint order: `paintLayers(doc).beneath` objects (shapes, in `zOrder`) → ring circles → bonds →
atoms (labels and satellites) → `paintLayers(doc).above` objects in `zOrder`. Bonds and atoms in
ascending id number; ids in `zOrder` that are not drawn (subset) are skipped. The one `<g>` sets
defaults (`fill="none"`, round caps and joins); every filled element and `<text>` sets `fill` and
`stroke="none"`, every stroked element sets `stroke` and `stroke-width`: no reliance on inheritance.

### Atoms and labels

An atom is **labelled** (its text is drawn) when: element ≠ `C`; or it has a `label`; or
`isotope` or `explicitH` is set; or it has no bonds. Otherwise it is a skeleton vertex: no
letter, no H. Charge, radical, lone pairs, partial charge and `number` never force a letter.

| Part | Rule |
|---|---|
| Text | `[H-part][isotope superscript][symbol][H-part][charge superscript]` (one H-part, before or after). Symbol = `element` (pseudo-atoms `R`, `X`, `*` as typed) or the abbreviation/unknown `label` as typed. H-part = `H`, plus subscript `n` when `n` > 1, `n` = `AtomInfo.implicitH`, only for non-label atoms. Element `H` with isotope 2 / 3 is drawn `D` / `T` with no superscript. Digits inside labels are subscripted (`CO2H`, `R1`) |
| Side | Sum the unit vectors to the neighbours. `sx < -0.1` (neighbours left): H-part **after** the symbol (`OH`, `NH2`); `sx > 0.1` (neighbours right): **before** it (`HO`, `H2N`); otherwise after. A label with a reversed form (table below) is drawn reversed when `sx > 0.1`; any other label is drawn as typed |
| No bonds | A bare atom is written as a formula: H-part before the symbol for F, Cl, Br, I (`HCl`) and for O, S, Se with `n ≥ 2` (`H2O`, `H3O+`, `H2S`); otherwise after (`OH−`, `NH3`, `CH4`, `NH4+`) |
| Anchor | The **anchor box** is the symbol glyphs; for a label without a reversed form it is the whole label text. The text is positioned so the anchor box's centre is the atom position; baseline = `y + capHeight/2`. The anchor box height is `capHeight` |
| Bonds at a label | The label is a set of glyph boxes, each grown by `labelMargin`: the anchor box and, separately, every other part (H, counts and subscripts, isotope, charge superscript). A bond line ends at the farthest exit among the boxes it actually intersects, so `NH2` with a bond leaving up-right stops before the `H2`, while a bond passing under a superscript charge or over a subscript is not shortened by it (nitromethane's N⁺–CH₃). Geometric clip only: no halos, no clip paths, so backgrounds stay transparent |
| Charge | Superscript at the end of the text: `+`, `−` (U+2212), magnitude first when > 1 (`2−`). On a skeleton vertex it is a satellite (below), and so it is on a labelled atom when a bond's line crosses the superscript's glyph box (as for nitro `O⁻` with the nitrogen up-right): the trailing form is dropped. **Leading superscript:** if the label's hydrogens are written before the element symbol (`H3N`, `HCl`: the symbol is the last glyph run), the sign is tried next as a leading superscript, `⁺H3N`, the mirror image of the trailing one: same glyph, size and vertical shift, its glyph box ending where the label text begins (the gap the trailing form leaves to the last glyph, mirrored), used when no bond line crosses that box. Only then does the sign leave the text and take the first free slot of NW, N, W, NE, E, SW, S, SE. Extents, the ink box and bond trimming include the sign wherever it lands. A label with only the symbol (`O⁻` at a left end) is unchanged |
| Partial charge | Stored `δ+`, `δ-`, `δδ+`, `δδ-`; drawn with U+2212 for the minus, as a satellite |
| Colour | `atom.color ?? INK` for all of the atom's text and satellites |
| Display table | `src/core/svg-render/label-display.ts`: for every key of chem-core's `ABBREVIATIONS`, its reversed text and attachment glyph, or none for symmetric ones. Reversed: `OMe`↔`MeO`, `OEt`↔`EtO`, `OPh`↔`PhO`, `OAc`↔`AcO`, `CO2H`↔`HO2C`, `COOH`↔`HOOC`, `CO2Me`↔`MeO2C`, `CO2Et`↔`EtO2C`, `CHO`↔`OHC`, `COCl`↔`ClOC`, `CONH2`↔`H2NOC`, `CN`↔`NC`, `NO2`↔`O2N`, `SO3H`↔`HO3S`. None: `Me Et Pr iPr Bu tBu Ph Bn Ac`. A test fails if `ABBREVIATIONS` gains a key with no entry |

**Satellites** (lone pairs, radical dots, the charge sign of a skeleton vertex, partial charge,
atom number) sit in one of eight **slots** round a reference box.

*Reference box.* The element symbol's glyph box: left and right are the symbol's advance extent,
top is the cap height (also for two-letter symbols such as `Cl`; the x-height is irrelevant),
bottom is the baseline. It is not the font's ascent/descent line box. For a typed label with no
reversed form it is just the symbol inside the label (`HO` puts everything round the `O`). For an
unlabelled skeleton vertex the box is the point.

*Slots.* Four cardinal slots N, E, S, W, then four diagonal slots NE, NW, SE, SW (screen
directions; N is up). A cardinal slot's centre is the middle of that box edge, pushed out so that
the satellite's nearest ink edge is `satelliteGap` from the box. A diagonal slot hangs off the
box corner with the same gap, measured along the diagonal. A lone pair is two dots
`pairSeparation` apart (radius `dotRadius`) along the box edge: horizontal for N and S, vertical
for E and W, along the diagonal's tangent for a diagonal. A radical is one dot. Charge, partial
charge and number are text at `satelliteScale·fs`, placed by their cap-height box (baseline on
its bottom edge).

*Blocked slots.* A slot is blocked if (a) a bond leaves the atom within 45° of the slot's
direction (strictly less than 45°: a diagonal next to a cardinal bond is not blocked), or (b)
the label's hydrogen or count part lies on that side (E when it is right of the symbol, W when
left). The formal-charge sign is not an H part.

*Order of assignment:* lone pairs, then radical dots, then the charge sign of a skeleton vertex,
then `partialCharge`, then `number`. The formal charge of a labelled atom stays in the label
text (superscript at the upper right, or leading on a hydrogens-first label) except as the Charge rule says.

*Preference order.*
- Lone pairs and radical dots, with bonds: the cardinals sorted by angular distance from the
  nearest bond, farthest first, ties N, S, E, W; then NE, NW, SE, SW.
- Lone pairs and radical dots, no bonds: N, S, the cardinal opposite the H part, the remaining
  cardinal, then the diagonals (a bare skeleton vertex: N, S, E, W).
- Text (partial charge, number): N, NE, NW, S, SE, SW, E, W. The formal charge of a skeleton
  vertex takes, among the slots that are not blocked or taken, the one with the greatest angular
  distance from the nearest bond (ties N, NE, E, SE, S, SW, W, NW), so it never sits in the notch
  between two bonds (if its ink would touch an earlier satellite it slides outward along the
  slot in steps of `satelliteGap`, up to four, before the next slot is tried).

Each satellite takes the first slot in its list that is not blocked, not already taken and whose
ink does not touch another glyph of the label (H part, subscript, charge sign), the charge sign,
a bond leaving the atom (a dot or pair keeps its radius clear of the line; a text's cap-height box must not touch it) or an earlier satellite.

*Formal charge beside an E dot.* If a lone pair or radical dot takes the E slot and the label has
a charge superscript, the superscript moves right so that it starts `satelliteGap` beyond the dots
(`HO:⁻`: the dots stand between the `O` and the minus). `layoutSatellites` reports the shift and
the label is rebuilt with it; no later satellite may touch the moved sign.

*Crowding.* If every slot is blocked, taken or in the way, the first preference slot that is not
blocked is used, pushed outward by one slot depth plus the gap per ring until nothing is in the
way. Everything depends only on the input, so it is deterministic.

Examples (all with no or one bond): `OH⁻` three pairs N, S, W; `HO⁻` N, S, E with the sign beyond
the E pair; `H₂O` N, S; `NH₃` N; `H–Cl` with the bond west: Cl pairs E, N, S and `δ−` NE, the
hydrogen's `δ+` N; a methyl radical on a vertex with two bonds: the dot opposite them.

### Bonds

`L1` = clipped end points, `n` = left normal. "Left" is the visual left when travelling from `a1`
to `a2` on screen (y down). All lines are `lineWidth`, round caps.

| Bond | Rule |
|---|---|
| Single (`order 1`, `stereo none`) | one line |
| Double | `auto`: second line towards the centroid of the smallest ring through the bond (see "Aromatic circles"; ties by lowest sorted atom ids); not in a ring: count the other neighbours of both atoms on each side — more on one side puts the second line there, equal counts (including 0) centre both lines. `center`: two lines at ±`doubleGap/2`. `left` / `right`: main line on the bond axis, second line `doubleGap` to that side. A shifted second line is shortened at each end by `doubleGap · cot(φ/2)`, φ = angle between the bond and the nearest neighbour bond on that side, clamped to 30°–150° (benzene: φ = 120°, 0.104·L); no neighbour on that side: no shortening; total shortening at most `0.5·L` |
| Triple | axis line plus lines at ±`doubleGap`; `doublePlacement` ignored |
| 1.5 in a circled ring | one plain line (the ring gets a circle, below) |
| 1.5 anywhere else | solid line plus dashed line (`dashOn`/`dashOff`), placed as a double bond (`auto` → centred; solid on the left) |
| `wedge` | filled polygon, point at `a1`, `wedgeWide` wide at `a2` |
| `hash` | `n = max(3, round(len / hashSpacing))` lines at `t = (i+0.5)/n`, half-length `wedgeWide/2 · t`, perpendicular to the axis |
| `bold` | filled rectangle `boldWidth` wide |
| `wavy` | quadratic-Bézier sine path, amplitude `wavyAmplitude`, `2·round(len/wavyLength/2)` half-waves (min 2) |
| Wedge/hash/bold/wavy on order ≠ 1 | stereo is ignored, drawn as its order (doc-model allows the combination; chem-core exports single bonds only) |
| Colour | `bond.color ?? INK` |

Wedges and hashes are clipped at labels along the axis; their width profile follows the
original length, truncated to the clipped span.

### Aromatic circles

`rings.ts`: for each bond, its **smallest ring** is the shortest cycle through it of size 3–8
(breadth-first, ties by lexicographically smallest sorted atom-id list); this single ring is the
one the double-bond side rule uses. The rings of a doc are the distinct rings that are a smallest
ring of some bond, **counting every tied minimum ring** (a single tie-broken ring per bond would
drop one cube face, since the greatest face loses every tie). (Naphthalene: two 6-rings; the
10-ring is nobody's smallest. Cubane: its six faces.) A ring whose bonds are all order 1.5 is **circled**: one
circle, centre = ring centroid, radius = `circleRatio` × mean distance from the centroid to the
bond midpoints, stroke `lineWidth`, colour = the bonds' common `color` if they all share one,
else `INK`. Perception's `BondInfo.aromatic` is not consulted: the stored order rules, so a ring
the user toggled partly to Kekulé is just lines and doubles.

### Objects

Text positions `at` are in BLU and become pt. Text, caption, callout and bracket-corner text use
`fontSize` and `fontFamily` (Decision 2).

| Object | Rule |
|---|---|
| `arrow` `forward` | shaft from `from` to the head base, solid triangular head at `to` (`arrowHeadLength` × `arrowHeadHalfWidth`) |
| `arrow` `equilibrium` | two parallel half-arrows (harpoons) `equilibriumGap` apart, each with a one-sided head: the one on the left of travel points to `to`, the other to `from`; barbs on the outer sides |
| `arrow` `retro` | two parallel lines `equilibriumGap` apart ending in an open chevron head at `to` (the retrosynthetic ⇒) |
| `arrow` `resonance` | one shaft, solid triangular heads at both ends |
| `arrow` `no-go` | a forward arrow with a cross (two lines, half-size `noGoHalf`) centred on the shaft midpoint |
| `arrow` length | head length is clamped to `0.5 × length` (`0.25 ×` for resonance); `from = to` draws nothing |
| `curved-arrow` | A curve from `resolveAnchor(from)` = p₀ to `resolveAnchor(to)` = p₃; `c` = chord `p₃ − p₀`, `n` = its left normal. `|bend| ≤ 0.5`: quadratic Bézier, control point = chord midpoint + `bend × |c| × n` (drawn `M … Q …`); `bend 0` is a straight line (positive bends bulge to the visual left). `|bend| > 0.5` (Decision 13): cubic Bézier (drawn `M … C …`) with `c₁ = p₀ + a·c + (2/3)·bend·|c|·n`, `c₂ = p₃ − a·c + (2/3)·bend·|c|·n`, `a = (1/3)·clamp(2 − 2·|bend|, 0, 1)`: at 0.5 it is the same curve as the quadratic, from 1 on its handles are square to the chord; its `t = 0.5` point is the chord midpoint + `bend × |c| / 2 × n` like the quadratic's. The shaft is the piece of the same curve (de Casteljau), the head is placed as below. An atom anchor **without** `offset` on a labelled atom is clipped out of the label's anchor box grown by `curvedGap` (bisection, 40 fixed steps); on a skeleton vertex, and for an offset (lone pair), bond and point anchors, the end is used as given. `full`: solid triangular head at the end; the shaft stops at the head base. `fishhook`: the head is the half on the convex side (the side the curve bulges toward) only (Decision 3). The head length is clamped to `0.5 ×` the length of the clipped chord; the shaft ends where the curve is one head length from the tip; a fishhook with `bend 0` has its barb on the right of travel. An anchor that cannot be resolved (missing atom or bond, non-finite number) skips the object with a `skipped-item` notice |
| `plus` | two lines crossing at `at`, arm `plusArm` |
| `text` | each run is its own `<text>` at an absolute x,y computed from measurement (no reliance on the renderer's inline layout); `align` places each line relative to `at.x`; the first line's cap-height box is vertically centred on `at.y`; `\n` in a run starts a new line (`lineHeight`). Runs: `sub`/`sup` at `subScale`, shifted by `subShift`/`supShift`; `bold`, `italic`; `color ?? INK`. `attachedTo` is ignored |
| `caption` | centred horizontally on the union of the target atoms' ink extents (labels and satellites included; a bare skeleton vertex counts as its position), top edge `captionGap` below that union; multi-line allowed. Targets missing from the doc are skipped; none left → nothing drawn |
| `callout` | text centred at `at`; a leader line (`lineWidth`, no head) from the nearest point of the text box grown by `calloutPad` to `resolveAnchor(anchor)`, clipped out of an atom anchor's box like curved arrows |
| `bracket` | `square`: two sides at `rect.x` and `rect.x + w`, spanning `y … y+h`, serifs `bracketSerif` (clamped to `w/2`) pointing inwards. `round`: arcs bulging outwards by `roundBulge`. `curly`: four-cubic braces, tip depth `curlyDepth`. `corner` runs: left edge `cornerGap` right of the right bracket; baseline at `y+h`, unless the first run is `sup`, then cap top at `y` |
| `shape` | `rect` / `ellipse` of `rect`; `fill` with `fillOpacity` (clamped to 0–1, `fill-opacity`), `stroke` at `lineWidth`; neither → nothing drawn. Painted in the beneath layer |

## Text measurement (no DOM)

**The main design risk:** label extents decide where bonds stop and where the bounds are, so they
must be known without a browser and be identical on every machine.

**Decision: a committed advance-width table.**

- **Where:** `src/core/svg-render/font-metrics.ts`, generated, committed, listed in
  `.prettierignore`. Exports `UNITS_PER_EM = 1000`, `ADVANCE_REGULAR` and `ADVANCE_BOLD`
  (`Readonly<Record<number, number>>`: code point → integer advance in 1/1000 em, rounded from the
  font's units), and a header comment with the font file names and their SHA-256. Italic uses the
  regular widths (Arial's are equal); bold italic uses bold. Output is sorted by code point with
  LF endings so regenerating from the same fonts gives identical bytes.
- **Coverage (code points):** U+0020–007E, U+00A0–00FF, U+0391–03C9 (those the font has: `δ`,
  `Δ`, `ν`, `μ`, `π`, `α` …), U+2013, U+2014, U+2018, U+2019, U+201C, U+201D, U+2020, U+2021,
  U+2022, U+2026, U+2190–2195 (arrows), U+2212 (minus). Text is iterated by code point.
- **Fallback:** any other code point has width `0.556 em` (Arial's digit width) and adds an
  `unmeasured-glyph` notice. No kerning.
- **Vertical:** two boxes. The *layout* box (`ascent`, `descent`) uses cap height 0.716 em and
  descent 0.212 em (Arial's); the descent applies only to runs containing a descending glyph
  (`g j p q y Q , ; ( ) [ ] { } |`). The *ink* box (`inkAscent`, `inkDescent`, used for every
  extent) is safe for every glyph: each run, sub/superscripts and Greek included, is boxed at
  the font's full ascent 0.905 em (bold: 0.925 em, Arial Bold's accented capitals rise above the
  ascent line) above and full descent 0.212 em below its own baseline, and grown 0.05 em left and
  right (side-bearing overhang: `j` reaches 0.047 em left of its origin, `f` 0.042 em beyond its
  advance); bold runs containing `|` or `¦` use 0.225 em ink descent, and bold runs containing
  `¼` or `¾` use 0.075 em right overhang to include Liberation Sans ink on Linux. Advances and
  layout boxes are unchanged. Thus glyphs taller than the caps (`δ`, accents) or overshooting
  the baseline (round letters, `δ`) cannot be clipped by the viewBox; sub/superscript shifts extend the box. The
  calibration e2e rasterises the corpus and proves every inked pixel lies inside this box.
- **Generator:** `scripts/build-font-metrics.mjs <regular.ttf> <bold.ttf>` — Node, no
  dependencies, ~60 lines: reads `head.unitsPerEm`, `hhea.numberOfHMetrics`, `hmtx` and the
  `cmap` (format 4) from the two files given on the command line. It never touches the network
  and is never run by tests or `npm run check`. The developer obtains Liberation Sans Regular
  and Bold (2.1.x, SIL OFL, from the liberationfonts GitHub release) once, or passes Windows'
  own `arial.ttf` / `arialbd.ttf`. The TTFs are not committed.
- **Table test** (`tests/tooling/font-metrics.test.ts`): known widths (`W` 944, `i` 222, `0` 556,
  `m` 833, `−` 584, bold `W` 944), every coverage range present, sorted, integer values.

Why this works offline on Windows: Arial ships with every Windows 10/11 and Office 2021, so the
screen, PowerPoint and Word draw glyphs whose advances equal the table. Every run is positioned
absolutely, so a width error in one run cannot shift another (worst case: a slightly off label).

**Rejected:** measuring in the renderer (needs the DOM, machine-dependent); text as outlines
(Decision 4); parsing a font at runtime (new dependency; Arial cannot be redistributed).

A calibration test in `e2e/` creates SVG `<text>` elements for a fixed corpus in the Electron
window and compares `getComputedTextLength()` with the table (≤ 1 %, 20 px at font-size 100); on
Windows that is real Arial. It also rasterises the corpus and checks that no inked pixel leaves
the computed ink box. The table has no kerning; Chromium kerns, which accounts for the largest
measured difference (0.67 %, `Δ α β …`). U+00AD (soft hyphen) is measured as width 0 because
browsers draw it with no advance.

## Extents (bounds including labels and strokes)

`extents[key]` and `bounds` are the **ink boxes in pt**: every drawn primitive's geometry grown by
half its stroke width (round caps included), plus: label text boxes (all glyph runs, with
sub/superscripts, not just the anchor box), arrowheads, exact Bézier extrema for curves and
curved arrows (not control points), wedge polygons, circles, satellites, caption/callout/
bracket/text boxes (measured width plus 0.05 em overhang each side × the ink box: full font ascent/descent per run). `bounds` =
union of `extents`; `padding` is added only in `toSvg`. Extents therefore **contain all ink as
the browser renders it** and are exact for every non-text primitive; around text they are loose
by at most 0.19 em (0.21 bold) above the cap height, 0.21 em below the baseline and 0.05 em at each side. An atom with no ink (a bare skeleton vertex) has no extents entry; its
position still contributes via its bonds. A zero-length bond (both end atoms at one point) draws nothing, so unlabelled end atoms joined only by it have no ink and no extents entry; a caption on them is still placed at their position and its box is the only ink.

## Determinism

Identical `(doc, options)` → **byte-identical** SVG on Linux and Windows.

- **Numbers:** one `fmt(n)`: `Math.round(n·1000)/1000`, printed without exponent or trailing
  zeros, `-0` → `0`, leading `0` kept (`0.5`). Non-finite never reaches output (item skipped).
  Coordinates are pt, 3 decimals. Angles and ratios are never printed.
- **Maths:** only `+ − × ÷`, `Math.sqrt`, `sin`, `cos`, `atan2`, `abs`, `min`, `max`, `round`,
  `floor`. `Math.pow`, `**`, `hypot`, `exp`, `log`, `tan`, `random`, `Date`, `Intl`,
  `localeCompare` and `toLocaleString` are banned in `src/core/svg-render/**` by an ESLint rule
  block (not a grep test); V8's `pow` and `tan` have differed between platforms. `cot` is
  `cos/sin`.
- **Order:** records are iterated by ascending id number (numeric suffix, own comparator: doc-model exports none), never by object-key order; objects by
  `zOrder`; rings sorted by their sorted atom ids; satellites in the fixed order above; ties
  always by id.
- **Attributes:** every element is built by a helper that writes attributes in a fixed per-element
  order (listed in `svg-write.ts`); optional ones are omitted, never `undefined`. Colours are
  lower-cased `#rrggbb`.
- **Ids:** none generated (no clip paths, gradients or `<use>`); the only id is
  `<metadata id="chalkbond">`.
- **Text:** `\n` line ends, no indentation, one element per line, trailing newline; no XML
  prolog, no comments, no timestamps, no generator string.
- **Goldens:** stored with LF endings. The repo's `* text=auto eol=lf` already covers them; an
  explicit `src/core/svg-render/__golden__/** text eol=lf` line is added so a later change to the
  global rule cannot dirty them on Windows (`autocrlf`).

## Output safety

- Escape `& < > " '` in every text node and attribute value. Characters illegal in XML 1.0
  (controls except tab/newline/CR, U+FFFE/U+FFFF, lone surrogates) become U+FFFD, so the output is
  always well-formed. `]]>` is covered by `>` escaping (no CDATA is used).
- Element allow-list: `svg g path polygon circle ellipse rect text metadata`. Attribute
  allow-list: `d points cx cy r rx ry x y width height transform viewBox xmlns xml:space fill
  fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray font-family
  font-size font-weight font-style id` (`id` only on `<metadata>`; `xml:space="preserve"` only on
  `<text>`).
- Never emitted: `script`, `style`, `foreignObject`, `use`, `image`, `a`, event attributes,
  `href`/`xlink:href`, any `url(…)` or other external reference. The only URL in the output is the
  `xmlns` namespace.
- Colours must match `^#[0-9a-fA-F]{6}$` (doc-model validates, but a doc can be built unchecked);
  anything else falls back to `INK`.
- `fontFamily` (user-supplied through overrides) is reduced to the characters `A–Z a–z 0–9`,
  space, `,`, `-`, `_` (everything else, quotes included, is removed), at most 200 characters;
  empty after that → the preset's family.
- `metadata` is text content, escaped; it is the only free-text channel and is never parsed here.
- Text run content is only ever placed in `<text>` nodes; user text can never become markup.

## Editor contract (screen use)

The editor owns the canvas; this module supplies the following and nothing more.
1. **Keyed parts.** `Scene.parts` is the paint-ordered list; each part has a stable `key` and its
   markup. The editor mounts parts in order and, on the next scene, replaces only parts whose
   `svg` string changed, adds new keys and drops missing ones (string comparison catches a
   bond whose markup changed because a neighbour moved). `parts.map(p => p.svg).join('\n')`
   inside a translated `<g>` is exactly the export content.
2. **Coordinates.** Parts are in document pt (`bluToPt`); no zoom. The editor applies pan/zoom
   with its own `transform` on a wrapping element. Pointer → BLU is `ptToBlu`.
3. **Extents.** `extents[key]` gives each item's ink box for hit-testing, marquee selection and
   selection halos. Finer hit-testing (distance to a bond segment, arrow path) is the editor's,
   using document geometry.
4. **Overlays are the editor's:** selection, handles, valence warnings (`Perception.warnings`
   with `extents` for placement), snapping guides, ghost previews (render a scratch doc built
   with `insert(emptyDoc, sub, at)`), grid, rulers. Pass `perception` from `createPerceiver()` to
   avoid recomputing it.
5. **Preset switching** is an edit of `doc.style` through doc-model; the editor spec decides
   whether it wants a `setStyle` op there (additive, not a schema change). `render` is
   synchronous and effect-free, so it may run inside a React render or a worker.

## Required changes to other modules

| Module | Change | Needed? |
|---|---|---|
| `doc-model` | `StyleSettings` **stays** in `doc-model/types.ts` and in the `.chalk` schema (moving it would make `doc-model` import a downstream module, which the capability map forbids). Its five fields are final: **no code, schema or `schemaVersion` change.** Docs only: "(provisional; svg-render's spec owns it)" in `SPEC-doc-model.md` becomes "(final; meaning defined in `SPEC-svg-render.md`)" (done at approval); the "Provisional field set" JSDoc in `types.ts` gets the same wording in the first implementation task | Docs only |
| `chem-core` | None. Consumes `perceive`, `Perception`, `AtomInfo.implicitH`, `ABBREVIATIONS` (display-table coverage test) | No |
| Tooling | ESLint block for `src/core/svg-render/**` banning the non-deterministic APIs above (the boundary entry already exists); `.gitattributes` golden line; `scripts/build-font-metrics.mjs`; `scripts/golden-sheet.mjs` + `npm run golden:sheet` (reads the committed `__golden__/*.svg`, writes `out/golden-sheet.html`, not committed; optional `--png <file>` screenshots it with Playwright's Chromium into `<file>-slides.png` and `<file>-journal.png`, numbered when a preset needs several pages; goldens are named `<scene>.<preset>.svg`, every scene in both presets); `.prettierignore` entry for `font-metrics.ts`; the calibration test under `e2e/` | Yes |

## Testing

- **Golden set** (`src/core/svg-render/__golden__/*.svg`, written with `toMatchFileSnapshot`,
  reviewed visually through the golden sheet at checkpoints, because a byte snapshot cannot tell
  a wrong picture from a right one). Inputs are committed `.chalk` fixtures
  (`__golden__/inputs/`, produced once from chem-core's parsers and then frozen, so an OCL layout
  change never moves a golden; plus doc-model's `benzene`, `two-step-reaction`, `mechanism`,
  `kitchen-sink`). ≥ 30 scenes: benzene (circle), toluene, naphthalene (two circles), pyridine,
  Kekulé benzene (inside-ring double bonds), cyclohexane, ethanol (`OH`, side flip both ways),
  water and HCl (bare atoms), acetic acid (`C=O` placement, `CO2H`), acetate (1.5 pair),
  ammonium, nitro with charges, alkene cis and trans, propyne, wedge/hash/bold/wavy (alanine),
  `Ph`/`OMe`/`NO2`/`CO2H` attached on the left and on the right, `R` pseudo-atom, isotopes
  (`¹³C`, `D`), radical (1 and 2), carbanion with lone pair, HCl with δ+/δ−, atom numbers,
  coloured atoms and bonds (coloured ring circle); each arrow kind; a reaction scheme with
  conditions text (sub/sup/bold/italic); the mechanism with `full` and `fishhook` arrows; the
  short curly arrows of Decision 13 (`curly-short`: π bond → O, σ bond → Cl, homolysis
  fishhooks, lone pair → bond, bond → adjacent bond, with the editor's default bends); plus
  signs; caption; callout; square/round/curly brackets with `corner`; shapes with fill opacity;
  3 scenes in each preset; a style-override scene; a subset scene. A test scans the inputs and
  asserts every `BondOrder`, `BondStereo`, `DoublePlacement`, `ArrowKind`, curved-arrow `head`,
  bracket `shape`, shape `shape`, text `align`, run `script` value and every object type occurs.
- **Unit:** every public function; `fmt`; each row of every rule table; ring finder (benzene,
  naphthalene, cubane, spiro, bicyclic, a 10-ring gets no circle); satellite slots (identities and geometry, every case of the "Satellites" examples; no dot
  touches a dot or a glyph; extents contain every satellite as `ink-scan` boxes it); double-bond
  side decision table; clipping against boxes from all 8 directions; text measurement (known
  widths, fallback notice, descent rule); `resolveStyle` with every kind of bad override;
  escaping of `<`, `&`, `"`, `]]>`, control characters, lone surrogates, emoji; the allow-lists.
- **Test helpers (no DOM, no new dependency):** `__fixtures__/xml-check.ts`, a ~60-line
  well-formedness checker (balanced tags, attribute syntax, only the five entities, no illegal
  characters) that also returns elements and attributes for allow-list checks; and
  `__fixtures__/ink-scan.ts`, an independent ink-box computation from the markup (path vertices,
  curves sampled at 64 steps, polygon/circle/rect/ellipse geometry, stroke half-widths, `<text>`
  boxes from the font table: full ascent and descent).
- **Properties (fast-check, reusing doc-model's `arbitraries.ts` command generator):**
  1. `render` never throws on any doc reachable by doc-model ops; output passes `xml-check` and
     uses only allow-listed elements and attributes;
  2. determinism: same input twice, `parse(serialize(doc))`, and the doc rebuilt with reversed
     record key order all give identical bytes;
  3. every numeric attribute token (after stripping the `pt` unit; `<text>` and `<metadata>`
     content excluded) matches `^-?\d+(\.\d{1,3})?$` (no exponent, no `-0`);
  4. subset: each part of `render(doc, { only })` equals the same-key part of `render(doc)`;
  5. bounds: `bounds` equals the union of `extents`; contains the pt image of doc-model's
     `bounds` of the drawn items (the selection of keys that produced parts); translating the
     whole doc by `(dx,dy)` BLU translates `bounds` by `(dx,dy)·L` with the same size (±0.002 pt);
  6. uniform scale: scaling `bondLength`, `lineWidth`, `fontSize` by a power of two `k` scales
     `bounds` by `k` (±0.005·k pt);
  7. safety: runs, labels, `number` and `metadata` drawn from arbitrary Unicode (including
     `<script>`, `"onload=`, `]]>`) keep the output well-formed with no new elements, and the text
     round-trips through the parsed output (except illegal characters → U+FFFD).
- **Tooling tests** (`tests/tooling/`, may use Node): `font-metrics.test.ts` (above); the ESLint
  determinism block rejects `Math.pow`, `**`, `Math.tan`, `Date.now`, `localeCompare` in
  `src/core/svg-render`; `.gitattributes` contains the golden line and no committed golden
  contains `\r`.
- **Shipped pipeline** is checked manually (`docs/windows-checklist.md`): paste three goldens
  into PowerPoint/Word 2021; labels, bond ends and circles must look right. (Owner decision 2026-11-12:
  the Office 2016 on the development machine is accepted for this check.)
- **Perf** (separate perf project like the other modules, skipped under `--coverage`; `perception`
  supplied, since `perceive` has its own budget): slide-sized scheme (4 molecules ≈ 40 atoms, 3
  arrows, 6 texts) `render` < 8 ms median; 500-atom single fragment + 20 objects < 40 ms median.
- **Coverage:** `src/core/svg-render` line coverage ≥ 90 % (`SPEC.md` target; the generated metrics
  table and `__golden__/` excluded).

## Success Criteria

1. Every function in "Public API" exists with tests; line coverage ≥ 90 %.
2. Every doc-model item type and every `BondOrder`/`BondStereo`/`DoublePlacement`/`ArrowKind`/
   curved-arrow head/bracket/shape variant has a rendering rule above and appears in a golden
   input (scan test); the exhaustive `switch`es end in `never` (`npm run typecheck`).
3. Goldens are stable: `npm test` passes with no `-u`, goldens are LF (tooling test), and render
   code uses only the allowed maths (ESLint block, tooling test). Cross-OS byte identity rests on
   that rule set and the V8 argument in "Facts relied on"; tests run on the Windows dev machine.
4. Same input → same bytes: determinism property passes at 1,000 runs (explicit test timeout).
5. For every golden scene, `bounds` equals the ink box computed independently by `ink-scan` within
   0.01 pt (so it contains all drawn ink, with `ink-scan` boxing text exactly as the renderer
   does; non-text ink is tight, text is within 0.19 em above / 0.21 em below the glyphs: a
   transparent export with `padding: 0` has no visible margin beyond that, `SPEC.md` success
   criterion 4); property 5 holds.
6. Circled rings and Kekulé rules: a ring of all-1.5 bonds gets one circle (naphthalene: 2); a
   1.5 bond outside a circled ring is a solid plus dashed line; Kekulé rings get inside-ring
   double bonds with the shortening rule.
7. Heteroatom labels show implicit H from `perceive` and flip so the text reads away from the
   bonds (`OH` / `HO`, `NH2` / `H2N`); bare atoms read `H2O`, `HCl`, `NH3`; `CO2H`, `OMe`, `NO2`
   attach through the correct glyph (bond end position tested); no bond line crosses its label's
   text.
8. Subset rendering equals the matching slice of the full rendering (property 4).
9. Output is well-formed XML containing only allow-listed elements/attributes and no external
   reference, for any user text (properties 1 and 7).
10. `slides` and `journal` render the same doc with identical element and attribute-name
    sequences at different scale; uniform-scale invariance holds (property 6).
11. Perf budgets met on Windows (both rows).
12. No DOM, Node or Electron import in the module (lint and `tsconfig.core.json` pass).
13. Text measurement: the table test passes; the calibration e2e test agrees with real Arial
    within 1 % on Windows.

## Boundaries (module-specific)

- **Always:** render from `doc-model` types and `chem-core`'s public API only; keep every number
  through `fmt`; keep user text out of markup; update goldens only with a reviewed visual diff.
- **Ask first:** adding a `StyleSettings` field or a `DrawObject`/`Atom` field (schema bump);
  bundling a font or emitting outlines; adding a dependency (e.g. a font parser, jsdom);
  changing a derived constant after the golden review (it moves goldens); adding options or a
  memoising renderer.
- **Never:** use a DOM, canvas or `getBBox`; emit scripts, styles or external references; rely on
  object-key order; embed timestamps or random ids; read or write files; draw interaction state
  (selection, warnings) into the output.
