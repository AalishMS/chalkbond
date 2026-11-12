# Tasks: `editor`

Plan: `tasks/plan-editor.md`. Spec: `SPEC.md`, `SPEC-editor.md`; mock-ups `docs/mockups/editor/`.
Definition of done for every task: acceptance criteria met, `npm run check` green, committed (one
commit per task, `feat(editor): E<n> …` or the module named). "SC n" is success criterion n of
`SPEC-editor.md`; rule ids (S1, T4, V5 …) are its behaviour rules; "R n" / "Decision n" are rows
of its Decisions table.

Shots: `npm run shots -- E<n>` builds the app and writes `out/shots/E<n>/<name>.png` (1280×800
content size unless the name ends in `-960`, then 960×640). Every shot listed under Verification
must exist after the run; scripted shots drive the app with the mouse/keyboard before capturing.
Compare with `out/mockups/*.png` (`node docs/mockups/editor/build.mjs --png out/mockups`).

Example molecules (formula · MW as the status bar shows them): ethanol C2H6O · 46.07, benzene
C6H6 · 78.11, toluene C7H8 · 92.14, acetic acid C2H4O2 · 60.05, ethyl acetate C4H8O2 · 88.11,
water H2O · 18.02. At the default Slides zoom (150 %) one bond is 80 screen px.

---

## E1: doc-model `setStyle`

**Description:** Required change 1. First edit `SPEC-doc-model.md` "Public API" (add the `// style`
heading and the `setStyle` line exactly as in `SPEC-editor.md`), then implement
`setStyle(doc, patch: { preset?: StylePreset; overrides?: Partial<StyleSettings> }): Doc` in
`src/core/doc-model/style.ts`, draft-aware (`edit`), exported from `index.ts`. Validation mirrors
the `.chalk` schema's `styleSettings` (numbers finite and > 0, `fontFamily` string, no unknown
keys) and the preset enum; violations throw `DocError('invalid-value')`.

**Tests first:** `style.test.ts`: preset change on a frozen doc and inside `transact` (one undo
step, undo restores `slides`); `overrides` replaces the whole object; an empty patch changes
nothing (no history step); `preset: 'x'`, `bondLength: 0`, `NaN`, `-1`, `Infinity`, `fontFamily: 3`,
an unknown key each throw `invalid-value` and leave the doc unchanged; the result passes
`checkInvariants` and `serialize`/`parse` round-trips.

**Acceptance criteria:**
- [x] `SPEC-doc-model.md` lists `setStyle` under `// style` (committed in this task, before the code)
- [x] `setStyle` exported from `@core/doc-model`; draft-aware; no schema or `schemaVersion` change
- [x] All tests above pass; doc-model coverage stays ≥ 95 % lines

**Verification:** `npm test -- src/core/doc-model` then `npm run check`

**Dependencies:** None

**Files:** `SPEC-doc-model.md`, `src/core/doc-model/{style.ts,style.test.ts,index.ts}`

**Scope:** S

## E2: chem-core `closest` ranking

**Description:** Required change 2 (Decision 11). First edit the `closest` comment in
`SPEC-chem-core.md` "Public API" exactly as in `SPEC-editor.md`. Then change `closest` in
`src/core/chem-core/names.ts`: prefix matches first (unchanged); near spellings ordered by edit
distance, then display-name match before synonym-only match, then omission typos (the normalised
query is a subsequence of the key) first, then display name. Record for each entry the best
(distance, isName, isSubsequence) over its keys.

**Tests first:** in `names.test.ts`: regression `closest('ethanl').map(e => e.name)` starts with
`['ethanol', 'ethane', 'acetaldehyde']`; `structureFromText('ethanl', names)` fails with
`error.suggestions[0] === 'ethanol'` and the message "Did you mean ethanol?"; existing
`etanol`, `benzne`, `aceton` expectations unchanged; a synonym-only hit ranks after a display-name
hit at the same distance.

**Acceptance criteria:**
- [x] `SPEC-chem-core.md` updated before the code (same task, separate hunk)
- [x] "ethanl" offers ethanol, ethane, acetaldehyde in that order (matches screen 07)
- [x] chem-core coverage stays ≥ 90 % lines; library-fact tests untouched

**Verification:** `npm test -- src/core/chem-core` then `npm run check`

**Dependencies:** None

**Files:** `SPEC-chem-core.md`, `src/core/chem-core/{names.ts,names.test.ts}`

**Scope:** XS

## E3: SPEC.md rows; scaffold min size and no menu

**Description:** Required changes 3 and 4. `SPEC.md`: remove the Zustand row from Tech Stack;
rewrite the Testing Strategy "Component" row as in `SPEC-editor.md` required change 3.
`src/main/index.ts`: `minWidth: 960`, `minHeight: 640`, `Menu.setApplicationMenu(null)` before
the window is created.

**Tests first:** extend `e2e/smoke.spec.ts`: `BrowserWindow.getMinimumSize()` is `[960, 640]` and
`Menu.getApplicationMenu()` is `null` (via `app.evaluate`).

**Acceptance criteria:**
- [x] `SPEC.md` has no Zustand row; the Component row names node tests, `react-dom/server` markup and Playwright
- [x] Smoke e2e asserts min size 960×640 and no application menu, and passes
- [x] Ctrl+0 / Ctrl+= no longer zoom the page (no menu accelerators): asserted in the smoke test by pressing Ctrl+= and reading `webContents.getZoomFactor() === 1`

**Verification:** `npm run check` then `npm run test:e2e`

**Dependencies:** None

**Files:** `SPEC.md`, `src/main/index.ts`, `e2e/smoke.spec.ts`

**Scope:** XS

## E4: ESLint renderer boundary and DOM-free block

**Description:** Required change 6 (lint part). In `eslint.config.mjs`: (a) a block for
`src/renderer/**/*.{ts,tsx}` whose `no-restricted-imports` repeats the `openchemlib` path and adds
patterns rejecting relative imports into `src/core` and deep `@core/<module>/<file>` paths,
except `@core/<module>/__fixtures__/*` in `*.test.{ts,tsx}`; (b) a block for
`src/renderer/editor/{model,tools,state}/**` banning imports of `react`, `react-dom`, `electron`
and the globals `window`, `document`, `navigator`, `requestAnimationFrame`, `performance`,
`setTimeout`, `Date`, repeating the named-export `no-restricted-syntax` rule.

**Tests first:** `tests/tooling/editor-lint.test.ts` (pattern of `lint-boundaries.test.ts`, warm
ESLint in `beforeAll`): rejects `@core/doc-model/history` and `../../core/doc-model` in
`src/renderer/editor/view/x.tsx`; accepts `@core/doc-model`; accepts
`@core/doc-model/__fixtures__/arbitraries` in `src/renderer/editor/model/x.test.ts` and rejects it in
`x.ts`; rejects `openchemlib` in renderer; rejects `react`, `document`, `Date`, `setTimeout`,
`export default` in `src/renderer/editor/model/x.ts`, `tools/x.ts`, `state/x.ts`; accepts
`react` in `src/renderer/editor/view/x.tsx`.

**Acceptance criteria:**
- [x] Every probe above passes; existing `lint-boundaries` and `svg-render-lint` probes still pass
- [x] `npm run lint` clean on the current tree

**Verification:** `npm test -- tests/tooling` then `npm run check`

**Dependencies:** None

**Files:** `eslint.config.mjs`, `tests/tooling/editor-lint.test.ts`

**Scope:** S

## E5: Screenshot harness and `npm run shots`

**Description:** `e2e/harness.ts`: `openApp({ size?: [number, number] })` launches the built app
(via `launchApp`, adding `--force-device-scale-factor=1`), sets the window content size (default
1280×800) with `app.evaluate` + `setContentSize`, waits for the window to be ready and returns
`{ app, page }`; `shot(page, taskId, name)` saves `out/shots/<taskId>/<name>.png` (creating
folders, Node `path`, no shell). `playwright.config.ts` gets two projects: `e2e`
(`testMatch: /.*\.spec\.ts/`) and `shots` (`testMatch: /.*\.shot\.ts/`). `package.json`:
`test:e2e` = `electron-vite build && playwright test --project=e2e`; `shots` =
`electron-vite build && playwright test --project=shots` (a task filter is a trailing file
argument: `npm run shots -- E5`). Later tasks add helpers here (canvas point from BLU, type into
the name field) as they need them.

**Tests first:** `e2e/shots/E5.shot.ts` itself; `openApp` throws a clear error ("run npm run build
first") when `out/main/index.js` is missing (checked at the top of the helper).

**Acceptance criteria:**
- [x] `npm run shots -- E5` writes `out/shots/E5/launch.png` (1280×800 PNG) and `out/shots/E5/resized-960.png` (scripted: resize to 960×640, then capture); image sizes asserted in the shot file by reading the PNG header
- [x] `npm run test:e2e` runs only `*.spec.ts`; `npm run shots` runs only `*.shot.ts`
- [x] Scripts contain no POSIX-only syntax (work in PowerShell)

**Verification:** `npm run shots -- E5`, `npm run test:e2e`, `npm run check`

**Dependencies:** E3 (no menu bar, so the content size is the page size)

**Files:** `e2e/harness.ts`, `e2e/shots/E5.shot.ts`, `playwright.config.ts`, `package.json`

**Scope:** S

### Checkpoint L — foundations
- [x] `npm run check` green; `npm run test:e2e` green; `npm run shots -- E5` writes its PNGs
- [x] Commit + push

---

## E6: Editor shell: lifted tokens and icons, window grid

**Description:** Copy `docs/mockups/editor/tokens.css` and `icons.svg` unchanged into
`src/renderer/editor/view/`. `Icon.tsx` renders `<svg aria-hidden><use href="#id"/></svg>` at
16/20/24 px; `Editor.tsx` injects the sprite once (hidden, from `icons.svg?raw`) and lays out the
grid of `mockup.css` ("Window grid"): top bar 48 + 1, rail 64 + 1, status 28 + 1, canvas the rest,
all from tokens, in `editor.css`. `App.tsx` mounts `<Editor controller={createEditorController({ clock })}>`
inside the element with `data-testid="canvas-area"` filling the window; the scaffold toolbar and
its CSS go (required change 5). A minimal `createEditorController` and `index.ts` exist (later
tasks fill them).

**Tests first:** `tests/tooling/editor-tokens.test.ts`: the two lifted files equal the mock-up
files (after the leading comment block of `tokens.css`); every contrast pair of the spec table
meets its minimum, computed from `tokens.css`. `e2e/editor-layout.spec.ts` (first part): region
boxes at 1280×800 and 960×640 — top bar height 48 and border 1, rail width 64, status 28, canvas
fills the rest (±1 px). `e2e/smoke.spec.ts` still passes.

**Acceptance criteria:**
- [x] Lifted files byte-identical (test); contrast pairs pass (SC6)
- [x] Region boxes match "Layout" at both sizes (SC7)
- [x] No raw colour or px value in `editor.css` outside the 1 px borders (grep check in the tooling test)
- [x] Smoke e2e green

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E6` → `E6/shell.png`, `E6/shell-960.png` (scripted: resize the window to 960×640 before capturing)

**Dependencies:** E3, E4, E5

**Files:** `src/renderer/editor/{index.ts,view/Editor.tsx,view/Icon.tsx,view/tokens.css,view/icons.svg,view/editor.css,state/controller.ts}`, `src/renderer/app/{App.tsx,app.css}`, `tests/tooling/editor-tokens.test.ts`, `e2e/editor-layout.spec.ts`, `e2e/shots/E6.shot.ts`

**Scope:** S

## E7: Tool rail, options bars, selection actions bar

**Description:** `state/editor-state.ts` and `state/reducer.ts` start with `tool` and `variants`
(actions `select-tool`, `select-variant`); `state/store.ts` (`getState`/`dispatch`/`subscribe`)
and `view/use-store.ts` (`useSyncExternalStore`, server snapshot = client snapshot).
`ToolRail.tsx`: the 10 buttons of the "Tool rail" table (56×48, icon + caption, `aria-label`
"Bond (B)", `aria-pressed`, accent bar), group separators; the Bond, Ring, Atom and Arrow/Curly
buttons show their current option's icon/glyph. `OptionsBar.tsx`: per-tool option sets exactly
as screens 01, 04, 05 (Atom: elements │ marks, δ+, δ−), the selection actions bar of screens 03
and 03b (enablement from a `scope` summary prop; Expand rendered only when the selection has an
abbreviation; Show Kekulé/Show circle with `min-width` of the longer label), and the text editing
options of screen 09 (rendered by later tasks). Launch state: Bond / Single (Decision 5). Mouse
press on a rail/option button does not take focus (K5).

**Tests first:** reducer tests (tool and variant selection, initial state Bond/Single). View markup
tests with `renderToStaticMarkup` (`view/ToolRail.test.tsx`, `view/OptionsBar.test.tsx`): ten rail
buttons in order with captions Select…Text and keys V E B Z R L A + M T; exactly one
`aria-pressed="true"`; option sets per tool in the spec order (bonds 5, rings 5, atom 10 + 6,
arrows 4, curly 2); selection actions disabled with tooltip text when the scope is empty; Expand
absent without an abbreviation, present with one; Show Kekulé vs Show circle labels. If Vitest
needs `esbuild: { jsx: 'automatic' }` for `.tsx` tests, add it to `vitest.config.mts`.

**Acceptance criteria:**
- [x] Clicking a rail button or pressing nothing else changes only the tool; clicking an option changes the variant and the rail icon (Ring → Cyclopentane shows `ring-5` on the rail)
- [x] Option sets and order exactly as Decisions 1–3 and 9 (markup tests)
- [x] e2e boxes: rail buttons 56×48 at x = 4 (relative to the rail), first at y = 8, 2 px gaps, separators 32×1 with 8 px above and below; option buttons 32×32, 2 px apart; Atom bar fits at 960 px (no horizontal scroll: `scrollWidth === clientWidth`)
- [x] The rail fits at 960×640 without scrolling

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E7` → `E7/bond-options.png` (launch), `E7/ring-options.png` (scripted: click Ring, then Cyclopentane; compare screen 04's top bar and rail), `E7/atom-options.png` (scripted: click Atom; screen 05), `E7/select-actions.png` (scripted: click Select; screen 03 bar with Clean up/Kekulé/Tidy disabled on an empty doc), `E7/atom-options-960.png`

**Dependencies:** E6

**Files:** `src/renderer/editor/state/{editor-state.ts,reducer.ts,reducer.test.ts,store.ts,store.test.ts}`, `src/renderer/editor/view/{ToolRail.tsx,ToolRail.test.tsx,OptionsBar.tsx,OptionsBar.test.tsx,use-store.ts,editor.css}`, `e2e/editor-layout.spec.ts`, `e2e/shots/E7.shot.ts`, `vitest.config.mts` (only if needed)

**Scope:** M

## E8: Top bar, status bar, empty state

**Description:** `TopBar.tsx`: the name field (static input with `search` icon, placeholder
"Type a compound name…", states of "Control states"), divider, options bar slot, Undo/Redo
(32×32, `aria-disabled` while nothing to undo). `StatusBar.tsx`: hint per tool from "Status-bar
hints" (`--type-hint`, `role="status"`, `aria-live="polite"`), formula slot (hidden when empty and
below 1000 px), warnings slot (hidden), preset switch "Slides | Handout" (outline, 64×20 segments,
shows `doc.style.preset`), zoom cluster (−, readout "150%", +, fit; 2 px apart; readout
aria-label "Reset zoom (Ctrl+1)"). `EmptyState.tsx`: screen 01 exactly (96 px benzene outline,
Decision 13 sentence, "Try:" and three chips). Buttons are wired to no-op actions where the
behaviour comes later.

**Tests first:** markup tests: hint text per tool (all ten), Undo/Redo disabled, preset switch
pressed state from the doc, readout text "150%", empty-state sentence and chip texts. e2e boxes:
name field x = 12, height 32, width `floor(clamp(240, 0.26·W, 360))` (332 at 1280, 249 at 960);
divider 1×24 with 12 px either side; Undo/Redo 32×32, 4 px apart, 12 px from the right edge;
status controls 24 high, readout 48 wide, preset segments 64×20; formula hidden at 960 px.

**Acceptance criteria:**
- [x] Hints match the spec table word for word (markup test)
- [x] Empty state shows the Decision 13 sentence and the three chips, centred 16 px above the canvas centre (the mock-up pads the bottom by 32 px) (e2e box)
- [x] All boxes above ±1 px at 1280×800 and 960×640 (SC7); every control ≥ 24 px (SC6)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E8` → `E8/empty.png` (compare `01-empty.png` whole window), `E8/empty-960.png` (compare `11-min-window.png` chrome), `E8/hint-ring.png` (scripted: press `R`; the hint reads "Click to place the ring. Click an atom or bond to attach it.")

**Dependencies:** E7

**Files:** `src/renderer/editor/view/{TopBar.tsx,NameField.tsx,StatusBar.tsx,EmptyState.tsx,*.test.tsx,editor.css}`, `e2e/editor-layout.spec.ts`, `e2e/shots/E8.shot.ts`

**Scope:** M

## E9: Tooltips, focus order, control states

**Description:** `Tooltip.tsx` per "Tooltips" (500 ms delay, warm-up chaining 300 ms, placement
right of rail / below top bar / above status bar, flip when clipped, title + `kbd` + help line,
`role="tooltip"`, `aria-describedby`, dismissed on pointer down, Esc, blur). Tooltip content for
every rail button, option and action (disabled ones carry the reason). K4 tab order with roving
`tabindex` in the options bar (←/→) and rail (↑/↓, Enter/Space), canvas element
(`role="application"`, `aria-label="Drawing canvas"`, `tabindex=0`, `aria-describedby` the hint)
focused at launch; K5 mouse-focus rule; focus rings (`:focus-visible`, rail offset 0, canvas 2 px
inset outline when keyboard-focused).

**Tests first:** markup tests for tooltip content (Bond: "Bond", `B`, "Click to add a bond. Drag
to aim it."; Flip disabled: "Select a molecule first."). `e2e/editor-keyboard.spec.ts` (first
part): Tab from the canvas walks status controls, then wraps name field → options → Undo → Redo
→ rail → canvas; ↑/↓ in the rail moves focus, Enter selects the tool; ←/→ in the options bar;
clicking a rail button with the mouse leaves `document.activeElement` on the canvas; hovering a
rail button 600 ms shows a tooltip to its right with an 8 px gap.

**Acceptance criteria:**
- [x] Every rail, option, action and icon-only status control has a tooltip; each disabled control's tooltip says why
- [x] Tab order and roving focus exactly as K4 (e2e)
- [x] Focus ring visible on keyboard focus only (e2e: computed `outline-style` is `solid` after Tab, `none` after mouse click)
- [x] Launch focus is the canvas (e2e)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E9` → `E9/tooltip-bond.png` (scripted: hover Bond 600 ms; compare the Bond tooltip in `10-states.png`), `E9/tooltip-disabled-flip.png` (scripted: Select, hover Flip horizontal), `E9/focus-rail.png` (scripted: Tab to the rail, ↓ twice), `E9/states-hover-pressed.png` (scripted: hover Chain, press and hold on Ring), `E9/focus-name-field.png` (scripted: Ctrl+F)

**Dependencies:** E8

**Files:** `src/renderer/editor/view/{Tooltip.tsx,Tooltip.test.tsx,ToolRail.tsx,OptionsBar.tsx,StatusBar.tsx,TopBar.tsx,Canvas.tsx,editor.css}`, `e2e/editor-keyboard.spec.ts`, `e2e/shots/E9.shot.ts`

**Scope:** M

### Checkpoint M — the window matches the mock-ups
- [x] `npm run check` green; `e2e/editor-layout.spec.ts` green at 1280×800 and 960×640
- [x] Shots of E6–E9 compared side by side with `out/mockups/01-empty.png`, `10-states.png`, `11-min-window.png`
- [x] Commit + push

---

## E10: Viewport, geometry, derive and patch models

**Description:** Pure modules. `model/geometry.ts` (vectors, angles, angle snapping to n°,
distance to segment and to a sampled quadratic, rect helpers). `model/viewport.ts`: `Viewport {
zoom, pan, size }`; BLU ↔ pt ↔ screen (`k = zoom · 4/3`); zoom steps and stepping (V1, range
25–800 %, R1); default zoom `z₀` (V2); `fit` (V3/R13: largest whole percent ≤ `z₀`, 48 px margin);
`reveal` (V5); pan clamp (V4); preset-switch zoom (V6); zoom about a screen point. `model/derive.ts`:
`createDerive()` with one perceiver and one-entry caches for doc and preview. `model/patch.ts`:
`planPatch(mounted: { key, svg }[], parts) → ops` (replace/insert/remove/move).

**Tests first:** viewport: `z₀` = 1.5 for slides, 1.5 × 40/14.4 for journal; stepping from 150 → 200
and from 416.67 → 500 / 400; clamp at 25 and 800; fit of the 08 scheme bounds at 1215×722 canvas →
1.15; fit never exceeds `z₀`; reveal cases (visible → unchanged; offscreen but fits → minimal
pan; too big → `min(fit, z₀)` only if below current); V6 keeps the screen bond length; round
trip BLU → screen → BLU. patch: empty → all inserts; changed svg → one replace; reorder → moves
only; removed key → remove. derive: same doc object → same scene object; changed doc → new.

**Acceptance criteria:**
- [x] V1–V6 and R1/R13 behaviour covered by named tests
- [x] `planPatch` applied to the old list yields the new list for random inputs (fast-check)
- [x] 100 % of the three modules' lines covered

**Verification:** `npm test -- src/renderer/editor/model`

**Dependencies:** E4

**Files:** `src/renderer/editor/model/{geometry.ts,viewport.ts,derive.ts,patch.ts}` and their `*.test.ts`

**Scope:** M

## E11: Store, reducer core, controller and host seam

**Description:** Full `EditorState` (spec "State model"); reducer core: `commit` (one
`transact`, label, optional `coalesceKey`, selection after commit), undo/redo (G2, R7), notices
(`notice-show` / `notice-expired` by id; X1 catching `DocError`/`ChemError` with the spec wording
and `console.error` for `DocError` through an injected logger), `load`, `markSaved`, dirty
(ignoring `meta.modified`). `state/controller.ts`: `createEditorController(options)` with the full
`EditorController` API, `EditorCommand`s routed to the reducer (`canRun` per command), `EditorEvent`s
(`doc`, `selection`, `dirty`, `history`, `notice`, `context-menu`), `onCopy`, default name index
(`createNameIndex` of the imported `compounds.json`, built once). Wire the Undo/Redo buttons, K1
Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, and the status-bar notice (icon + text, 8 s expiry timer in the
view).

**Tests first:** `state/reducer.test.ts`, `state/controller.test.ts`: a commit is one undo step
with its label; a throwing recipe leaves history unchanged and sets a notice (DocError → "That
edit isn't possible here.", logger called); undo/redo clear selection/hover/gesture; undo is
refused while an editor is open; dirty after an edit, clean after undo back to `saved`, clean after
`markSaved`; `load` resets history and selection; events fire once per change; `canRun('undo')`
false on a new doc; `undoLabel()` returns "Add bond" after such a commit (use a test recipe).

**Acceptance criteria:**
- [x] Controller API and events exactly as "Seam to the host" (type-level test: the exported types compile against a usage file)
- [x] X1, G2, R7 covered by named tests
- [x] Undo/Redo buttons enable/disable with history (e2e after E13 can exercise them; markup test here)

**Verification:** `npm test -- src/renderer/editor/state`, `npm run check`

**Dependencies:** E10

**Files:** `src/renderer/editor/state/{editor-state.ts,reducer.ts,store.ts,controller.ts}` and tests, `src/renderer/editor/index.ts`, `src/renderer/editor/view/{TopBar.tsx,StatusBar.tsx}`

**Scope:** M

## E12: Canvas mounting, pan and zoom

**Description:** `Canvas.tsx`: the content `<svg>` with `<g data-layer="content"
transform="matrix(k 0 0 k panX panY)">`, keyed `<g data-key>` parts applied from `planPatch` in
`useLayoutEffect`; `Overlay.tsx` (empty shape list for now) above it; canvas size tracked with a
`ResizeObserver` (resize keeps the centre point, "Layout"). Pointer → BLU conversion at the edge
and rAF coalescing of moves. Pan/zoom input: wheel / Shift+wheel pan, Ctrl+wheel and pinch zoom
about the pointer, Space+drag and middle-drag pan with `grab`/`grabbing` cursors (V4), zoom
buttons, readout (R12 reset), fit (R13), K1 Ctrl+= / Ctrl+− / Ctrl+0 / Ctrl+1; `load` and launch
apply V2.

**Tests first:** reducer tests for zoom/pan actions (steps, clamps, reset to `z₀`, fit with an
empty doc keeps `z₀` and centres the origin). `e2e/editor-canvas.spec.ts`: at launch the readout
reads "150%" and the content transform is `matrix(2 0 0 2 cx cy)` with (cx, cy) the canvas
centre; Ctrl+= → "200%"; Ctrl+wheel up at a point keeps that point fixed (±1 px); Space+drag by
(100, 50) moves the pan by (100, 50); readout click returns to "150%"; zoom − is `aria-disabled`
at 25 %.

**Acceptance criteria:**
- [x] Parts are mounted in paint order and patched (unit: patch ops; e2e after E13 shows parts)
- [x] Every V1/V4 input above works (e2e)
- [x] No React re-render of the parts layer on pan (the parts' `<g>` elements keep identity: e2e marks one with a property and checks it after panning)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E12` → `E12/zoom-200.png` (scripted: Ctrl+=; readout 200 %), `E12/zoom-25.png` (scripted: Ctrl+− until disabled; zoom − greyed), `E12/pan-space.png` (scripted: hold Space and drag; cursor `grabbing` visible in the capture is not required)

**Dependencies:** E11

**Files:** `src/renderer/editor/view/{Canvas.tsx,Overlay.tsx,StatusBar.tsx}`, `src/renderer/editor/state/reducer.ts` (+ tests), `src/renderer/editor/model/keymap.ts` (zoom entries only), `e2e/editor-canvas.spec.ts`, `e2e/shots/E12.shot.ts`

**Scope:** M

## E13: Name field: suggestions, insert, not found, reveal, formula

**Description:** N1 (single names only, R9; `suggest(text, 8)`, rows with the R10 matched key and
a Hill formula in real `<sub>` at 10 px, ↑/↓/Enter/click/Esc), N2 (insert via
`structureFromText`, P7 placement, "Insert ethanol" label, live-region "Inserted ethanol",
selection = inserted, tool → Select), not-found row with ≤ 3 "Did you mean" chips (closest first,
from E2) per "Notices" and screen 07, field border states, K5 field focus rules (keeps focus,
cleared after insert; Esc ladder), Ctrl+F, N5. V7 frame after insert (was V5 until the 2026-11-10 correction). `model/formula.ts`:
Hill string / `Formula` → display runs; status-bar formula C5 (selection's atoms, else the single
fragment). Empty-state chips run N2 (the reaction chip completes in E29). `e2e/harness.ts` gains
`insertName(page, text)` and `canvasPoint(page, bluPoint)` (from the content transform).

**Tests first:** unit: formula runs for `C2H6O`, `C2H3O2` with charge −1 (`<sub>2</sub>…<sup>−</sup>`),
`H2O`; P7 placement on an empty doc (centre) and next to an existing fragment (left edge 1.0 BLU
right of the ink box, centred on the rightmost fragment); suggestion row model for "eth" (ethane
first, prefix bold) and "ethanoic" (`ethanoic acid — acetic acid`); not-found state for "ethanl"
with chips ethanol, ethane, acetaldehyde. e2e `e2e/editor-name.spec.ts`: type "ethanol" + Enter →
parts `atom:*`/`bond:*` mounted, formula "C2H6O · 46.07 g/mol", field empty and focused, Undo
enabled; Ctrl+Z → empty state again; "ethanl" + Enter → not-found row and chips in that order;
click "ethanol" chip → inserted; "eth" shows 8 rows with the first highlighted, ↓ Enter inserts the second (ethene).

**Acceptance criteria:**
- [x] Ethanol inserts centred at 150 % (C–C bond 80 px on screen ±1, from part boxes) and is selected
- [x] Inserting benzene then acetic acid places acetic acid to the right (its box left edge 1.0 BLU = 80 px right of benzene's ink box ±1 px)
- [x] Not-found row and chips exactly as screen 07; dropdown rows as screen 06 (row height 36, `min-width` 320)
- [x] A molecule inserted off-screen frames the drawing (V7, replacing V5 for inserts; e2e: zoom to 400 %, pan away, insert; the readout reads 150 % and the drawing is centred)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E13` → `E13/dropdown-eth.png` (scripted: type "eth"; compare `06-name-dropdown.png`), `E13/notfound-ethanl.png` (scripted: type "ethanl" + Enter; compare `07-name-nomatch.png`), `E13/ethanol-inserted.png` (scripted: insert ethanol; formula visible), `E13/three-inserted.png` (scripted: insert ethanol, benzene, acetic acid in a row)

**Dependencies:** E2, E12

**Files:** `src/renderer/editor/model/{formula.ts,placement.ts,selection.ts}` (+ tests), `src/renderer/editor/view/{NameField.tsx,StatusBar.tsx,EmptyState.tsx}`, `src/renderer/editor/state/{reducer.ts,controller.ts}`, `e2e/harness.ts`, `e2e/editor-name.spec.ts`, `e2e/shots/E13.shot.ts`

**Scope:** M

### Checkpoint N — documents appear on the canvas
- [x] `npm run check` green; typing "ethanol" + Enter draws ethanol at 150 % with "C2H6O · 46.07 g/mol"
- [x] Commit + push

---

## E14: Hit-testing, hover overlay, cursors

**Description:** `model/hit-test.ts` (H1–H4, `Hit` type) and `model/overlay.ts` hover shapes per
"Canvas appearance" (vertex circle Ø 18, labelled-atom box + 3, bond band 8 px, arrow bands,
object boxes; one group at `--overlay-hover`). `Overlay.tsx` renders shapes; hover updates on
pointer move (HV1, per tool); cursors per "Cursors" (erase cursor as a `data:` SVG built from the
`erase` path). Add the perf test for `hitTest`.

**Tests first:** hit-test at 25 %, 150 % and 800 %: atom within 10 px wins over a bond within 6 px;
labelled atom by its extents + 4; bond at 5 px hit, 7 px miss; arrow vs plus priority; ties by id;
merge target H3 (12 px or 0.3 BLU, excludes moving atoms); marquee H4 (bond needs both atoms,
objects need whole extents). Overlay shapes for a hovered vertex / labelled atom / bond.
`perf.test.ts`: `hitTest` on a 500-atom doc < 0.5 ms median.

**Acceptance criteria:**
- [x] H1–H4 covered by named tests; property 5 (atom's own point hits it) passes
- [x] Hover appearance as screen 02 (atom Ø 18 at 0.45) — e2e reads the overlay circle's `r` = 9 and group opacity 0.45
- [x] Perf budget met

**Verification:** `npm test -- src/renderer/editor`, `npm run check`, `npm run shots -- E14` → `E14/hover-atom.png` (scripted: insert propan-1-ol, hover the O end atom with Bond active; compare `02-drawing.png` hover), `E14/hover-bond.png` (scripted: hover a C–C bond)

**Dependencies:** E13

**Files:** `src/renderer/editor/model/{hit-test.ts,overlay.ts}` (+ tests, `hit-test.prop.test.ts`), `src/renderer/editor/view/{Overlay.tsx,Canvas.tsx}`, `src/renderer/editor/perf.test.ts`, `e2e/shots/E14.shot.ts`

**Scope:** M

## E15: Select clicks, marquee, selection overlay, delete and orphan rule

**Description:** `tools/tool.ts` (interface, shared press/drag/click machine), `tools/select.ts`
for clicks and marquee: S1 (fragment, narrowing on a second click of a fully selected fragment,
Alt+click single, Shift toggles, empty clears — Decision 6), H4 marquee overlay, selection
overlay and frame (screen 03: bands 12 px, circles r 12 only where no selected bond covers the
vertex, group 0.24, dashed frame grown 8 px), S8 delete with `model/cleanup.ts` (E2 orphan rule),
K1 Delete/Backspace, Ctrl+A, Esc ladder, C5 formula for the selection, selection actions bar
enablement from the scope.

**Tests first:** `tools/select.test.ts`: click atom → whole fragment; second click same atom →
just that atom; second click a bond → just that bond; third click → whole fragment again; Alt+click
→ single; Shift+click adds a second fragment, again removes it; click empty clears. `cleanup.test.ts`:
deleting the C1–C2 bond of ethanol removes the now bondless plain C1 and keeps C2–O;
deleting the C–O bond keeps the lone O (not a carbon); a bondless carbon with a charge or lone
pair is kept; a bondless carbon a curved arrow refers to is kept. Delete is one undo step. Overlay: benzene fully selected has 6 bands and
0 circles.

**Acceptance criteria:**
- [x] Decision 6 click sequence passes in node and in e2e (`e2e/editor-select.spec.ts`: click a benzene atom → formula "C6H6 · 78.11 g/mol"; click again → overlay shows one circle)
- [x] E2 orphan rule as specified, including the anchor exception
- [x] Esc ladder steps in order (unit)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E15` → `E15/select-benzene.png` (scripted: insert benzene, Select, click a ring atom; compare `03-select.png`), `E15/select-narrowed.png` (scripted: click the same atom again), `E15/marquee.png` (scripted: drag a marquee half over ethanol, capture before release)

**Dependencies:** E14

**Files:** `src/renderer/editor/tools/{tool.ts,select.ts,index.ts}`, `src/renderer/editor/model/{selection.ts,cleanup.ts,overlay.ts,scope.ts}` (+ tests), `src/renderer/editor/state/{reducer.ts,pointer.ts,commands.ts}`, `src/renderer/editor/view/{Overlay.tsx,OptionsBar.tsx}`, `e2e/editor-select.spec.ts`, `e2e/shots/E15.shot.ts`

**Scope:** M

## E16: Move, snapping, fast path, join atoms, nudges

**Description:** S2 (drag from the selection moves it; from an unselected item applies S1 then
moves; no narrowing on drag), S3 move with Shift constraint and centre snapping with guides
(6 px, R4: no modifier disables it), drag fast path (translate-only preview, rendering rule 4),
S4 join on release over a merge target, K1 nudges (0.1 / 1.0 BLU, `coalesceKey: 'nudge'`).

**Tests first:** select tool machine: drag of a whole fragment → one "Move" commit with the
dragged delta; Shift constrains; snap when the centre comes within 6 px of another fragment's
centre (and a guide shape exists); fast-path decision (whole fragments → translate; a curved
arrow anchored to the moved fragment but unselected → full preview); single atom released over
another atom → "Join atoms" with `mergeAtoms`; three nudges → one undo step; a nudge after a move
→ two steps.

**Acceptance criteria:**
- [x] One commit per drag; previews never touch history (assert `history.past.length` during the drag)
- [x] Snapping guide drawn and removed on release (unit + e2e)
- [x] Nudges coalesce (unit)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E16` → `E16/move-guide.png` (scripted: insert ethanol and benzene, drag benzene until its centre aligns with ethanol's; capture before release showing the guide), `E16/moved.png` (after release)

**Dependencies:** E15

**Files:** `src/renderer/editor/tools/select.ts` (+ tests), `src/renderer/editor/model/{move.ts,snap.ts,overlay.ts,keymap.ts}`, `src/renderer/editor/state/{commands.ts,reducer.ts}`, `src/renderer/editor/view/{Canvas.tsx,Editor.tsx,use-canvas-input.ts}`, `e2e/editor-move.spec.ts`, `e2e/shots/E16.shot.ts`

**Scope:** M

## E17: Rotate, flip, arrow and curved-arrow handles

**Description:** Rotate handle (S5: about the frame centre, 15° snap, Shift free, one "Rotate"),
Flip horizontal / vertical actions (about the ink-box centre, one "Flip"), straight-arrow end
handles (S6: 15° snap, attached texts re-placed — call a `conditionPosition` stub that keeps
offsets until E28), curved-arrow end and bend handles (S6 re-anchoring and `bend = 2d/chord`),
handle overlay shapes and hit priority (H2). Arrows and curved arrows for tests come from fixture
docs (doc-model `mechanismDoc`, `twoStepReactionDoc`) until their tools exist.

**Tests first:** rotate by a 40° drag snaps to 45°; flip negates x about the centre and negates a
curved arrow's bend (doc-model behaviour); arrow end drag snaps to 15°; curved end dropped on an
atom → atom anchor, on a bond → bond anchor t 0.5, on empty → point; bend handle dragged 0.5 BLU
off a chord of 2 BLU → bend 0.5.

**Acceptance criteria:**
- [x] S5, S6 and the flips each one undo step (unit)
- [x] Handles drawn as specified (overlay unit: rotate circle Ø 10 24 px above the frame)
- [x] Flip buttons disabled without a selection, with the tooltip reason

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E17` → `E17/rotate-handle.png` (scripted: select benzene; compare the handle in `03-select.png`), `E17/rotated-45.png` (scripted: drag the rotate handle on ethanol), `E17/flipped.png` (scripted: insert toluene, select, Flip horizontal; methyl now on the other side)

**Dependencies:** E16

**Files:** `src/renderer/editor/tools/select.ts`, `src/renderer/editor/model/{commands.ts,overlay.ts,hit-test.ts}` (+ tests), `src/renderer/editor/view/OptionsBar.tsx`, `e2e/shots/E17.shot.ts`

**Scope:** M

## E18: Erase tool, in-app clipboard, context-menu event

**Description:** `tools/erase.ts` (E1 click and drag path with 0.3 ghosting, one "Erase", E2),
CB1 copy/cut/paste/duplicate (K1 Ctrl+C/X/V/D, pointer-or-centre paste position, V5 reveal,
`onCopy`), CM1 (`contextmenu` default-prevented, cancels a gesture, else emits `context-menu`
with the hit and screen point; selection untouched).

**Tests first:** erase machine: click a bond of butane removes it (and orphan carbons per E2);
drag across three bonds → one commit; copy then paste inserts at the pointer and selects the
paste; cut = copy + delete in one step; duplicate offsets by (1, 1) BLU; `onCopy` receives the
extracted sub-doc; context-menu event carries `{ kind: 'atom', id }` over an atom and `null` on
empty canvas, and nothing during a drag except the cancel.

**Acceptance criteria:**
- [x] Erase and clipboard commands are one undo step each (unit)
- [x] `canRun('paste')` false until something is copied
- [x] Right-click shows no menu (e2e: no new window/element appears; a listener on the controller receives the event)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E18` → `E18/erase-drag.png` (scripted: insert hexane, Erase, drag across two bonds; capture mid-drag with ghosted parts), `E18/pasted.png` (scripted: select ethanol, Ctrl+C, move the pointer, Ctrl+V)

**Dependencies:** E17

**Files:** `src/renderer/editor/tools/erase.ts` (+ tests), `src/renderer/editor/state/{reducer.ts,controller.ts}` (+ tests), `src/renderer/editor/view/Canvas.tsx`, `src/renderer/editor/model/keymap.ts`, `e2e/shots/E18.shot.ts`

**Scope:** M

### Checkpoint O — selection and transforms
- [x] `npm run check` green; every Select/Erase gesture is one undo step (tool-machine tests)
- [x] Commit + push (origin/main contains 76b7ead, checked with `git merge-base --is-ancestor`)

---

## E19: Bond tool and ghost previews

**Description:** `tools/bond.ts`: B1–B6 with P1 (`model/placement.ts` sprout direction and next
candidate), H3 merge target, 30° snapping (Shift free), duplicate-bond guard, B5 cycling and the
wedge/hash reverse recipe (delete + add reversed + re-anchor bond anchors with `t' = 1 − t`).
Preview pipeline: `preview.doc` mounted with ghost opacity for `added` keys, merge target circle
at `--overlay-merge`; hover preview of the click result (B6).

**Tests first:** click empty → two atoms 1.0 apart at 30° up-right; drag snaps to 30° (and Shift
gives 37°); click on a 1-neighbour atom zig-zags (P1 ±120°, more upward on a tie); n ≥ 2 bisects
the largest gap; ring closure within 0.25 BLU; drag ending on a bonded atom commits nothing; B5
cycles 1 → 2 → 3 → 1, double placement cycle, wedge set with narrow end near the click, second
wedge click reverses and a curved arrow anchored at t 0.3 ends at t 0.7 on the new bond; preview
ids equal commit ids.

**Acceptance criteria:**
- [x] B1–B6, P1 covered by named tests; one undo step per gesture
- [x] Ghost parts appear while hovering with Bond (e2e: a `[data-key]` with opacity 0.45 exists while hovering empty canvas)
- [x] Propane by gestures: click empty, click the right atom → 3-carbon zig-zag with formula "C3H8 · 44.10 g/mol" (e2e)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E19` → `E19/bond-ghost.png` (scripted: hover empty canvas with Bond), `E19/zigzag.png` (scripted: click empty, click end atom twice → butane zig-zag; compare `02-drawing.png` geometry), `E19/wedge.png` (scripted: Wedge option, click a bond)

**Dependencies:** E18

**Files:** `src/renderer/editor/tools/bond.ts` (+ tests), `src/renderer/editor/model/{placement.ts,bond-ops.ts}` (+ tests; the recipes live in `bond-ops.ts`), `src/renderer/editor/view/Canvas.tsx`, `e2e/editor-structures.spec.ts`, `e2e/shots/E19.shot.ts`

**Scope:** M

## E20: Keymap, hover keys and tool keys

**Description:** `model/keymap.ts`: K1 (remaining entries), K2 with R3, R5, R6 (match `key`,
case-insensitive letters, Ctrl/Alt/Meta up, Shift ignored; hover keys first, then tool keys, else
nothing), wired in the canvas `keydown`. Hover actions: set element (A2) incl. L → Cl, B → Br;
charge ±1 clamped; `1`/`2`/`3` on an atom sprout a bond of that order via P1; on a bond set order
(stereo cleared); `W`/`H` wedge/hash with reverse on repeat; Delete/Backspace erase the hovered
item (E2); Enter opens the label editor (a hook that does nothing until E23 lands). Hints for hovered atom/bond (already in the status bar since E14). Ctrl+Shift+K / L / T map to `toggle-kekulé` / `clean-up` / `tidy-reaction`; the controller runs them when E24 / E28 turn them on.

**Tests first:** keymap table tests for every row of K2 including: `B` with an atom hovered →
Br; `B` with a bond hovered → Bond tool; `B` with nothing hovered → Bond tool; `V` over an atom →
Select tool (R3); `Shift` + `=` (key `+`) over an atom → charge +1; `Ctrl+=` → zoom, never charge;
`1` over a ring atom of benzene sprouts a methyl (toluene); keys ignored when focus is in the name
field.

**Acceptance criteria:**
- [x] Every K1 and K2 row has a keymap test; no hover key fires with Ctrl/Alt/Meta down
- [x] Hover + `1` on a ring atom of benzene (inserted by name) gives toluene, "C7H8 · 92.14 g/mol" (e2e); the 3-action version with the Ring tool is in E21
- [x] Ethanol by gestures: Bond click on empty, hover the end atom, `O` → "C2H6O · 46.07 g/mol" (e2e, SC1)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E20` → `E20/hover-key-O.png` (scripted: draw a bond, hover its end, press O → ethanol), `E20/hover-key-L.png` (scripted: hover the other end, press L → chloroethanol; Cl label drawn)

**Dependencies:** E19

**Files:** `src/renderer/editor/model/keymap.ts` (+ tests), `src/renderer/editor/state/{commands.ts,reducer.ts,controller.ts}` (+ tests), `src/renderer/editor/view/Editor.tsx`, `e2e/editor-hover-keys.spec.ts`, `e2e/shots/E20.shot.ts`

**Scope:** M

## E21: Chain and Ring tools

**Description:** `tools/chain.ts` (P2 zig-zag, 1–20 bonds, 30° snap, first zig continues P1, count
label overlay, click = one bond), `model/templates.ts` (five rings, centred, bond length 1.0),
`tools/ring.ts` (P3 empty canvas, P4 onto an atom, P5 fused onto a bond with naphthalene circles
or Kekulé alternation, P6 merge within 0.15 BLU), previews for both.

**Tests first:** chain of 4 by a drag of 3.5 BLU → 4 bonds of length 1.0 alternating ±; from an
atom with a neighbour the first zig continues the zig-zag; templates: every bond 1.0 ± 1e-9,
centred, benzene all 1.5; ring on empty canvas vertex up; on an atom shares it and points along
P1; benzene fused onto a benzene bond → naphthalene, all new bonds 1.5, formula C10H8; benzene
fused onto a cyclohexane bond → alternating with the shared bond single; P6 merges coincident
atoms (spiro onto a ring atom adds exactly n − 1 atoms).

**Acceptance criteria:**
- [x] P2–P6 and the five templates covered by named tests; one undo step per gesture
- [x] Ring option order Benzene, Cyclohexane, Cyclopentane, Cyclobutane, Cyclopropane (Decision 2)
- [x] Benzene by one Ring click shows "C6H6 · 78.11 g/mol" (e2e, SC1); naphthalene by two clicks shows "C10H8 · 128.17 g/mol"
- [x] Toluene in 3 actions (press `R`, click the canvas, hover a ring atom + `1`) → "C7H8 · 92.14 g/mol": scenario test in `state/scenarios.test.ts` and e2e with an action counter (SC2, R5)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E21` → `E21/chain-count.png` (scripted: Chain drag mid-way; count label visible), `E21/ring-ghost.png` (scripted: Ring hover over empty canvas; compare `04-ring-options.png`), `E21/naphthalene.png` (scripted: click, then click a ring bond), `E21/toluene.png` (scripted: Ring click, hover atom + `1`)

**Dependencies:** E20

**Files:** `src/renderer/editor/tools/{chain.ts,ring.ts,ghost.ts,testing.ts}` (+ tests), `src/renderer/editor/model/{templates.ts,chain-ops.ts,ring-ops.ts,placement.ts,overlay.ts}` (+ tests; the recipes live in `chain-ops.ts` and `ring-ops.ts`), `src/renderer/editor/state/scenarios.test.ts`, `e2e/editor-structures.spec.ts`, `e2e/shots/E21.shot.ts`

**Scope:** M

## E22: Atom tool and marks

**Description:** `tools/atom.ts`: A1 (element on an atom, lone atom on empty canvas, drag from an
atom bonds a new atom of that element), A2, A3 marks (charges clamped, lone pairs cycle 0–4,
radical toggle, δ+/δ− set/clear, Shift reverses; on empty canvas an info notice "Click an atom to
add this."); the Atom rail button shows the current element glyph or mark icon.

**Tests first:** click a carbon with O → O; same element again → no step; click empty with N →
lone N (renders NH3, formula "H3N · 17.03 g/mol"); drag from an atom with Cl → C–Cl bond; ⊕ twice
→ charge +2, Shift+⊕ → +1; lone pair cycles to 4 then 0; δ+ set then cleared; marks on empty →
notice, no step.

**Acceptance criteria:**
- [x] A1–A3 covered by named tests; one undo step each
- [x] Rail Atom button shows "Cl" after choosing Chlorine (markup test; screen 05)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E22` → `E22/atom-options.png` (scripted: insert propan-1-ol, Atom, Chlorine selected, hover a carbon; compare `05-atom-options.png`), `E22/marks.png` (scripted: insert water; Atom tool, Lone pair option, click the O twice; δ− option, click the O)

**Dependencies:** E21

**Files:** `src/renderer/editor/tools/atom.ts`, `src/renderer/editor/model/atom-ops.ts` (+ tests), `src/renderer/editor/tools/tool.ts` (`ToolStep.notice`), `src/renderer/editor/state/pointer.ts`, `src/renderer/editor/view/{ToolRail.tsx,OptionsBar.tsx}`, `e2e/shots/E22.shot.ts`

**Scope:** S

## E23: Text-editing model and label editor

**Description:** `model/text-edit.ts`: `TextEditState` and pure ops (insert text, delete
backward/forward/word, line break, set selection, toggle script with pending, local undo/redo,
`fromStored`), offsets in UTF-16 never inside a surrogate pair; `labelDisplayRuns(text)` in
`model/chem-text.ts`. `view/TextBox.tsx` + `view/text-dom.ts`: `contenteditable="plaintext-only"`
projection — cancel `beforeinput`, apply the op, re-render spans, restore the selection; IME
reconcile on `compositionend`. Label mode (L1–L3): opens with Enter over a hovered atom (any tool
except Erase/Text) or Select double-click (R2, S7); caption L2; commit via `interpretLabel` with
the `explicitH` rule; empty → plain carbon; Esc cancels; blur commits; R7 (local Ctrl+Z, Undo/Redo
buttons disabled while open).

**Tests first:** `text-edit.test.ts` + `text-edit.prop.test.ts` (property 6): typing inherits the
script of the previous character; toggling sub on a selection marks it explicit; pending sub on a
collapsed caret applies to the next typed character and clears on caret move; delete across run
boundaries merges runs; local undo restores the previous state; surrogate pairs never split.
`labelDisplayRuns('NH2')` → N, H, sub 2; `CO2H`; `NH4+` with sup +. L3 commit table: `OH` →
element O, explicitH undefined (automatic is 1); `OH2` → explicitH 2 only when automatic differs;
`Ph` → label Ph, element C; `H20` → element `*`, label `H20`; empty → C. e2e `editor-label.spec.ts`:
hover the oxygen of ethanol, Enter, type "NH2", Enter → formula "C2H7N · 45.08 g/mol" (the carbon-end example gave a formula the rules cannot produce); the editor
showed "NH₂" with a real `<span data-script="sub">2</span>` while typing.

**Acceptance criteria:**
- [x] Every op and property above passes; the label editor never shows markup (e2e reads the editor's DOM: only text and `data-script` spans)
- [x] L1–L3 covered; R2 (no editor on a Bond double-click: e2e double-click with Bond adds bonds and opens nothing) and R7 covered
- [x] Focus returns to the canvas on commit and cancel (e2e)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E23` → `E23/label-editor.png` (scripted: hover a carbon, Enter, type "CO2H" before committing; caption visible), `E23/label-unknown.png` (scripted: type "H20"; warning caption)

**Dependencies:** E22

**Files:** `src/renderer/editor/model/{text-edit.ts,chem-text.ts}` (+ tests), `src/renderer/editor/view/{TextBox.tsx,text-dom.ts}`, `src/renderer/editor/state/reducer.ts`, `e2e/editor-label.spec.ts`, `e2e/shots/E23.shot.ts`

**Scope:** L

## E24: Warnings overlay, Clean up, Kekulé ⇄ circle, Expand

**Description:** Warning overlay shapes (atom dashed circle r 13 / box, `cannot-kekulize` bond
dashes), HV2 tooltip with the warning `message`, warnings button C6 (count, cycling selection +
reveal), selection actions C1 (Clean up), C3 (Kekulé ⇄ circle with R11 and the two notices), C2
(Expand, rendered only with an abbreviation), K1 Ctrl+Shift+K / Ctrl+Shift+L.

**Tests first:** overlay shapes for an `H20` label (`unknown-label`) and an over-valent carbon;
`renderSvg` of that doc contains no `#b42318` (SC8); C3: benzene → Kekulé (3 double bonds), again →
circle; cyclohexene → button disabled (R11); a non-kekulizable 1.5 system → notice text; C1 one
undo step; C2 on `Ph` → 6 more carbons, formula unchanged; Expand hidden without an abbreviation
(markup).

**Acceptance criteria:**
- [x] Warnings never exported (SC8 unit); warnings button hidden at 0, shows the count otherwise
- [x] Show Kekulé / Show circle label flips without the bar moving (e2e: the next button's x is unchanged ±0.5 px)
- [x] C1–C3 one undo step each; notices word for word

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E24` → `E24/warning-h20.png` (scripted: insert water, set the O label to "H20" via the label editor; warnings button "1"), `E24/warning-tooltip.png` (scripted: hover the H20 atom 600 ms; compare `08-reaction.png` tooltip), `E24/kekule.png` (scripted: insert benzene, Select, Show Kekulé), `E24/expand.png` (scripted: insert benzyl alcohol drawn with a `Ph` label via the label editor, select it; Expand shown as in `03b-select-abbrev.png`)

**Dependencies:** E23

**Files:** `src/renderer/editor/model/{overlay.ts,commands.ts}` (+ tests), `src/renderer/editor/view/{Overlay.tsx,StatusBar.tsx,OptionsBar.tsx,Tooltip.tsx}`, `src/renderer/editor/state/reducer.ts`, `e2e/editor-structures.spec.ts`, `e2e/shots/E24.shot.ts`

**Scope:** M

### Checkpoint P — structures
- [x] `npm run check` green; `e2e/editor-structures.spec.ts`: ethanol by gestures, benzene, toluene in 3 actions
- [x] Commit + push (origin/main contains 1a7452b, checked with `git merge-base --is-ancestor`)

---

## E25: Arrow, Plus and Curved-arrow tools

**Description:** `tools/arrow.ts` (R1: drag with 15° snap, short drag = click = 2.5 BLU arrow,
click on an arrow sets its kind), `tools/plus.ts` (R2 with S3 centre snapping), `tools/curved.ts`
(R3: start on an atom or bond, anchors, ±0.4 bend away from the centroid, same start/end cancels,
info notice when starting on empty canvas). Options: Reaction, Equilibrium, Resonance, No
reaction; Electron pair, Single electron.

**Tests first:** arrow drag at 10° → 15°; drag of 0.3 BLU → 2.5 BLU arrow at the press point;
clicking an existing arrow with Equilibrium changes its kind (one step); plus snaps to a
molecule's centre y; curved arrow from an O lone-pair atom to a C–O bond → atom/bond anchors,
bend sign away from the fragment centroid; start on empty → notice, no step.

**Acceptance criteria:**
- [x] R1–R3 covered; one undo step per gesture; previews ghosted
- [x] Arrow kinds exactly the four of Decision 3 (markup)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E25` → `E25/arrow-drag.png` (scripted: insert ethanol and acetic acid, Arrow, drag between them; capture mid-drag), `E25/curly.png` (scripted: insert water and chloromethane; Curly, Electron pair, drag from water's O to the C of chloromethane)

**Dependencies:** E24

**Files:** `src/renderer/editor/tools/{arrow.ts,plus.ts,curved.ts}` (+ tests), `src/renderer/editor/view/OptionsBar.tsx`, `e2e/shots/E25.shot.ts`

**Scope:** M

## E26: `finishText` formatter

**Description:** `model/chem-text.ts` `finishText(runs, style) → TextRun[]` per T4: `->` → `→`;
`^{…}`, `_{…}`, `^` / `_` + run of `[0-9+\-−]` (markers removed, `-` → `−` in sup); formula tokens
over the whole text with element symbols from `PERIODIC_SYMBOLS` (case-sensitive), digits after
a letter/`)`/`]` subscripted, trailing `+`/`-` superscripted; exceptions `SN1 SN2 SNi E1 E2 E1cb`;
digit-first tokens never; only non-explicit characters change; adjacent equal runs merged;
bold/italic from the object.

**Tests first:** `chem-text.test.ts`: `H2SO4`, `CH3COOH`, `Cu(NH3)4^2+`, `H3O+`, `OH-`, `SN2`,
`25 °C`, `2nd`, `Pd/C`, `conc. H2SO4, Δ`, `A -> B`, `Fe^3+`, `SO4^2-`, `x_{ab}`; an explicit plain
"2" in `CO2` stays plain; `fromStored` round trip. `chem-text.prop.test.ts`: T4 properties a–c.

**Acceptance criteria:**
- [x] Every example above produces the expected runs
- [x] Properties a–c pass at the default run count; never produces `⇌`

**Verification:** `npm test -- src/renderer/editor/model`

**Dependencies:** E23 (`EditRun` type)

**Files:** `src/renderer/editor/model/{chem-text.ts,chem-text.test.ts,chem-text.prop.test.ts}`

**Scope:** S

## E27: Text tool and WYSIWYG text editor

**Description:** `tools/text.ts` (T1: new text on empty canvas, edit an existing `text`; slots
come in E28), `TextBox` text mode (T2): Arial at `fontSize · k`, sub/sup spans at 0.7 × size with
0.2 / 0.4 em shifts, bold/italic, padding 2 8, 1 px accent outline, svg-render part hidden while
editing; text editing options bar (T5: x₂, x², B, I, Insert Δ hν ° →, `aria-pressed` from the
model); K3 shortcuts; commit through `finishText` ("Add text" / "Edit text"); empty → delete;
re-open with `fromStored`; Select double-click on a text opens it (S7); R8 (captions, callouts not
editable).

**Tests first:** text tool machine: click empty → editing state with a new text target; commit
of `H2SO4` → runs H, sub 2, S, O, sub 4; empty commit → no step / deletes an existing text; re-open
and commit unchanged → no step. e2e `editor-text.spec.ts` (DOM ↔ runs): type "H2SO4" → the editor
shows plain "H2SO4" until Enter, then the part's `<text>` elements show sub "2" and "4"; re-open →
the editor shows `<span data-script="sub">2</span>`; select "2" with Shift+← and press x₂ → plain
"2" after commit (explicit); Ctrl+Shift+D inserts Δ; paste of rich HTML inserts plain text; Esc
restores the original text.

**Acceptance criteria:**
- [x] No markup characters (`_`, `^`, `{`) ever appear in the editor DOM for these flows (e2e)
- [x] T2, T5, K3 covered by unit and e2e tests; one undo step per commit
- [x] Undo/Redo buttons disabled while editing; Ctrl+Z inside undoes the last typing step (e2e)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E27` → `E27/text-editing.png` (scripted: Text tool, click, type "conc. H2SO4" without committing; compare `09-text-editing.png` box and options bar), `E27/text-committed.png` (after Enter: subscripts drawn), `E27/text-reopened.png` (scripted: Select, double-click the text)

**Dependencies:** E26

**Files:** `src/renderer/editor/tools/text.ts` (+ tests), `src/renderer/editor/view/{TextBox.tsx,text-dom.ts,OptionsBar.tsx}`, `src/renderer/editor/state/reducer.ts`, `e2e/editor-text.spec.ts`, `e2e/shots/E27.shot.ts`

**Scope:** L

## E28: Conditions and Tidy reaction

**Description:** T1 condition slots (within 1.0 BLU of a shaft, between its ends, above/below by
pointer side; slot overlay; creates or edits the attached text), T3 `conditionPosition` (two
passes over `extents`; left normal for non-horizontal arrows; replaces the E17 stub), `model/tidy.ts`
TR1–TR6 (scope, band, order, horizontal arrows keeping sense, length from attached text, attach
nearby texts, baseline, spacing 0.6 / 0.4 BLU, re-place conditions, one commit, V5 reveal), Tidy
action enablement and Ctrl+Shift+T, the "Nothing to tidy" notice.

**Tests first:** condition above a horizontal arrow: text ink bottom exactly `0.2 · bondLength` pt
above the arrow's ink top, centred on the midpoint (±0.01 pt); below likewise; on a 45° arrow along
the left normal. Tidy on a hand-placed esterification scheme (fixture: four molecules, two pluses,
one arrow slightly tilted, H₂SO₄ text near the arrow): arrow horizontal, item centres within 0.01
BLU of the baseline, gaps 0.6 / 0.4 BLU, the text attached above; property: tidy twice = tidy once
(fast-check over jittered layouts); no arrow → notice, no step.

**Acceptance criteria:**
- [x] TR1–TR6 and T3 covered by named tests; idempotence property passes
- [x] One "Tidy reaction" undo step; V5 applied (unit on viewport)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E28` → `E28/condition-slot.png` (scripted: insert ethanol, then acetic acid, draw an arrow between them, Text tool, hover above the arrow), `E28/before-tidy.png`, `E28/after-tidy.png` (scripted: Select, Tidy reaction; compare `08-reaction.png` layout)

**Dependencies:** E27

**Files:** `src/renderer/editor/model/{tidy.ts,overlay.ts}` (+ tests, `tidy.prop.test.ts`), `src/renderer/editor/tools/{text.ts,select.ts}`, `src/renderer/editor/view/OptionsBar.tsx`, `e2e/shots/E28.shot.ts`

**Scope:** M

## E29: Reaction text in the name field

**Description:** `model/scheme-text.ts`: N3 split (R14 arrow tokens and `+` outside brackets and
parentheses, spaces optional, `2 H2O` coefficients), build the scheme (structures, coefficient
texts, pluses, arrows `forward` / `equilibrium`), lay out with TR2–TR5, place (empty → centred;
else below the document), one "Insert reaction" commit, V5, selection + Select tool; failing part
→ not-found row naming that part, chips replace that part. N4: the third empty-state chip and
`insert-text` commands. `state/scenarios.test.ts` for SC2.

**Tests first:** split tests (`ethanol + acetic acid -> ethyl acetate + water`, `A+B->C`,
`[NH4+] + OH- -> NH3 + H2O` keeps `[NH4+]`, `2 H2O`, `<=>` / `⇌` equilibrium, `=>` forward, no arrow
→ single name); a misspelt part (`ethanol + acetic acd -> …`) inserts nothing and names
"acetic acd" with chip "acetic acid"; scenario: the SC3 reaction in ≤ 15 actions (insert the text,
Text tool, click above the arrow, type `H2SO4`, Enter, click below, Ctrl+Shift+D, Enter) — arrow
horizontal, centres on one baseline within 0.01 BLU, conditions centred within 0.01 BLU.
`e2e/editor-reaction.spec.ts`: same flow with an action counter ≤ 15 and part boxes aligned within 1
screen px.

**Acceptance criteria:**
- [x] SC2 (reaction half) met by the scenario test and the e2e
- [x] The reaction chip inserts the esterification scheme on an empty doc and zooms out to fit if needed (Decision 8: readout ≤ 150 %)
- [x] One undo step removes the whole inserted scheme

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E29` → `E29/reaction-chip.png` (scripted: click the third empty-state chip; compare `08-reaction.png`), `E29/reaction-conditions.png` (scripted: add H₂SO₄ above and Δ below), `E29/reaction-notfound.png` (scripted: type the misspelt reaction + Enter)

**Dependencies:** E28

**Files:** `src/renderer/editor/model/scheme-text.ts` (+ tests), `src/renderer/editor/state/{reducer.ts,scenarios.test.ts}`, `src/renderer/editor/view/{NameField.tsx,EmptyState.tsx}`, `e2e/editor-reaction.spec.ts`, `e2e/shots/E29.shot.ts`

**Scope:** M

### Checkpoint Q — reactions
- [x] `npm run check` green; SC3 reaction in ≤ 15 actions (`state/scenarios.test.ts`, `e2e/editor-reaction.spec.ts`)
- [x] Commit + push

---

## E30: Preset switch

**Description:** PR1: the Slides | Handout switch calls `setStyle(doc, { preset })` in one commit
("Switch to Handout style" / "Switch to Slides style"), V6 keeps the on-screen size (zoom ×
old/new bond length about the canvas centre), the switch follows the document (undo flips it
back); `run({ type: 'set-preset' })`.

**Tests first:** reducer: switch to journal → preset journal, zoom 1.5 → 4.1667, screen bond
length unchanged; undo → slides and the switch shows Slides (the viewport follows the style, R38: atoms within 1 px of where they started, zoom back to its value; redo → the Handout state);
switching to the current preset records nothing.

**Acceptance criteria:**
- [x] PR1 and V6 covered; one undo step
- [x] e2e: a C–C bond's on-screen length is unchanged within 1 px after switching; readout shows "417%"

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- E30` → `E30/handout.png` (scripted: insert the reaction chip, click Handout), `E30/slides-again.png` (scripted: Ctrl+Z)

**Dependencies:** E29, E1

**Files:** `src/renderer/editor/state/reducer.ts` (+ tests), `src/renderer/editor/view/StatusBar.tsx`, `e2e/editor-canvas.spec.ts` (+ keyboard and layout specs for the radio group), `e2e/shots/E30.shot.ts`

**Scope:** S

## E31: Property suite and controller completeness

**Description:** `state/editor.prop.test.ts`: property 1 (random tool events — every tool, random
points, modifiers, keys, undo/redo — on random docs from doc-model `arbitraries.ts`: no throw out of
the reducer, `checkInvariants` empty), property 2 (undo after every commit restores the previous
doc exactly), with an explicit timeout and 1,000 runs. Fill any controller gaps (`canRun` for every
command, `paste-sub`, `insert-text`, `shortcuts: 'canvas-only'` leaves Ctrl keys alone).

**Tests first:** the properties themselves; a failure's seed becomes a fixed regression test
(AGENTS.md).

**Acceptance criteria:**
- [x] Properties 1 and 2 pass at 1,000 runs (SC3, SC4)
- [x] Every `EditorCommand` has a `canRun` and `run` test

**Verification:** `npm test -- src/renderer/editor/state` (run twice to vary seeds), `npm run check`

**Dependencies:** E30

**Files:** `src/renderer/editor/state/{editor.prop.test.ts,controller-commands.test.ts}` (no `controller.ts` change was needed)

**Scope:** M

## E32: Performance measurement

**Description:** Node perf budgets in `src/renderer/editor/perf.test.ts` (one bond-drag preview
step on the 40-atom scheme < 10 ms, `tidyReaction` < 25 ms, `createNameIndex` < 30 ms, plus E14's
hit-test). `e2e/editor-perf.spec.ts`: frame-time probe (`performance.mark` around the pointermove
handler and the next `requestAnimationFrame`) for a whole-fragment drag of a 40-atom scheme (fast
path), a bond-drag preview and a partial drag in a 100-atom doc (p95 ≤ 16 ms), commit → paint ≤ 50
ms, cold start to usable canvas < 3 s. Results (median, p95, machine) in `docs/editor-perf.md`. On
a miss after the fast path: write the `createRenderer` request as a `SPEC-svg-render.md` change
proposal in the report and stop (R19); never loosen a budget.

**Tests first:** the perf tests themselves.

**Acceptance criteria:**
- [x] Node perf budgets pass (timings skipped under `--coverage`)
- [x] e2e budgets measured on this machine and recorded in `docs/editor-perf.md`; any miss recorded with the proposed svg-render change, budgets unchanged (no miss)
- [x] A Windows checklist item asks for the run on the owner's laptop
  - Note 2026-11-12 (owner decision): the development machine is not the teacher's laptop; that run stays open in `docs/windows-checklist.md` (E32).

**Verification:** `npm test`, `npm run test:e2e`

**Dependencies:** E31

**Files:** `src/renderer/editor/perf.test.ts`, `e2e/editor-perf.spec.ts`, `docs/editor-perf.md`

**Scope:** S

## E33: Coverage and accessibility pass

**Description:** `npm test -- --coverage`; add tests (unit or markup) until `src/renderer/editor`
≥ 70 % lines without excluding files. Accessibility: `e2e/editor-keyboard.spec.ts` completed as a
keyboard-only walkthrough (Ctrl+F, type "ethanol", Enter, Esc to the canvas, Ctrl+A, Tab to the
options bar, → to Flip horizontal, Enter, Ctrl+Z, reach every tool and option with the keyboard,
Esc ladder), every control has an accessible name (e2e: no button without one), focus ring
visible on each keyboard stop, `prefers-reduced-motion: reduce` (Playwright `emulateMedia`) gives
0 ms transitions, hit targets ≥ 24 px, contrast test green.

**Tests first:** the coverage report decides the extra tests; the walkthrough e2e.

**Acceptance criteria:**
- [x] `src/renderer/editor` ≥ 70 % lines in the coverage report (SC11); no new coverage excludes
- [x] Keyboard walkthrough passes (SC5); reduced-motion check passes
- [x] Every interactive element has an accessible name (e2e) and a visible focus indicator

**Verification:** `npm test -- --coverage`, `npm run test:e2e`, `npm run shots -- E33` → `E33/keyboard-walkthrough-*.png` (one per walkthrough step, scripted)

**Dependencies:** E32

**Files:** tests across `src/renderer/editor/**`, `e2e/editor-keyboard.spec.ts`, `e2e/shots/E33.shot.ts`

**Scope:** M

## E34: Windows checklist, AGENTS.md, success-criteria sweep

**Description:** `docs/windows-checklist.md` "Editor" section (only what a human can check):
look at `npm run shots` output against `out/mockups`; touchpad pinch zoom and two-finger pan;
125 % and 150 % display scaling; a Devanagari IME typing into a text; the e2e perf run on the
owner's laptop; a first-use pass (draw ethanol, benzene, toluene and the SC3 reaction without
help). `AGENTS.md`: status table (editor done), "Module notes → editor" (DOM-free layers, tools as
state machines, one transact per gesture, model-first text editing, shots), new commands
(`npm run shots`, `npm run shots -- E<n>`, mock-up PNGs), "Next" pointing at `clipboard-export`.
Sweep every SC of `SPEC-editor.md` and tick the plan's checkboxes.

**Tests first:** none (docs); `npm run check`, `npm run test:e2e` and `npm run shots` as the final
gate.

**Acceptance criteria:**
- [x] Checklist section added, items unticked (the owner ticks them)
- [x] AGENTS.md status, notes and commands updated
- [x] Every SC in `SPEC-editor.md` mapped to a passing test or a checklist item in the plan's coverage table

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots`

**Dependencies:** E33

**Files:** `docs/windows-checklist.md`, `AGENTS.md`, `tasks/plan-editor.md`, `tasks/todo-editor.md`

**Scope:** S

### Checkpoint R — module complete
- [x] Every success criterion in `SPEC-editor.md` met by a test or shot (SC 2-6, 8, 9, 11 fully); `src/renderer/editor` ≥ 70 % lines (coverage 85.5 % verified). The human-only parts of SC 1, 7 and 10 are named "manual, pending" beside each SC and listed in `docs/windows-checklist.md`, unticked when this box was ticked and not claimed. Update 2026-11-12: the owner's hand checks ticked Checkpoint R there except "Pen or touch"; E32 stays open. SC 6: preset segments now 64x24 (R41), `--border-control` 3 : 1 on every state (R42)
- [x] `npm run check` green; `npm run test:e2e` green; `npm run shots` green
- [ ] Commit + push
