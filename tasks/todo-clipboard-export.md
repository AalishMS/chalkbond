# Tasks: `clipboard-export`

Plan: `tasks/plan-clipboard-export.md` (the overall order across both modules is at its top).
Spec: `SPEC.md`, `SPEC-clipboard-export.md`, `SPEC-app-shell.md` (IPC, security, primitives);
mock-ups `docs/mockups/shell/` (PNG references: `node docs/mockups/shell/build.mjs --png
out/mockups-shell`). Definition of done for every task: acceptance criteria met, `npm run check`
green, committed (one commit per task, `feat(clipboard-export): C<n> …`, or `feat(editor): …`
for an editor change, `test(clipboard-export): …` for a probe). "SC n" is success criterion n of
`SPEC-clipboard-export.md`; rule ids (CB-W1, E2, PD1 …) are its rules; "app-shell X" points into
`SPEC-app-shell.md`.

Shots: `npm run shots -- C<n>` builds the app and writes `out/shots/C<n>/<name>.png` (1280×800
content size unless the name ends in `-960`, then 960×640). Every listed shot must exist after the
run; scripted shots drive the app with mouse and keyboard before capturing. Compare the page area
of the mock-up PNG named beside each shot (mock-up PNGs also show the native title bar and menu
bar, which no shot contains).

Windows-only e2e files live in `e2e/win/` (ignored on other platforms by `testIgnore`, app-shell
TH6). Dialog and menu stubs: app-shell TH4 (`app.evaluate`, or `launchApp` options for boxes shown
at startup).

The **scheme fixture** used by shots and e2e is built by `loadScheme(page)` in `e2e/fixtures.ts`
(added in C8): it types `ethanol + acetic acid -> ethyl acetate + water` into the name field, adds
the condition `conc. H2SO4, Δ` above the arrow with the Text tool, presses Esc until nothing is
selected and the Select tool is active (the Esc ladder's last step) and returns the document (the SC3 scheme of A01). Golden inputs (`ethanol`,
`toluene`, `naphthalene`) come from `e2e/harness.ts` `goldenDoc`.

---

## C1: Editor `actions` slot after Undo/Redo

**Description:** clipboard-export required change 1 (Decision O1). First edit `SPEC-editor.md`
exactly as the change table says ("Layout" Top bar row, "Seam to the host", K4, a new R-row with
the next free number), commit-ready before any code. Then `Editor` accepts `actions?:
React.ReactNode`; `TopBar.tsx` renders it as the last child of the top bar inside `<div
className="topbar-actions" data-testid="topbar-actions">`, after Redo, and adds `has-actions` to
the top bar. `editor.css`: `.topbar-actions { margin-left: var(--space-4) }`; under `@media
(max-width: 1099.98px)`: `.topbar.has-actions .topbar-actions { margin-left: var(--space-3) }` and
`.topbar.has-actions` name field `width: var(--namefield-compact)` (the token comes from the shell
set, loaded by app-shell; the editor never uses the rule without a host). No `actions` → markup
and layout unchanged.

**Tests first:** `view/TopBar.test.tsx` / `Editor.test.tsx` markup: with `actions` the wrapper is
the last child after `data-testid="redo"` and the top bar has `has-actions`; without it neither
exists; the tab order in DOM is name field → options → Undo → Redo → wrapper.

**Acceptance criteria:**
- [x] `SPEC-editor.md` edited first (same commit, separate hunk), R-row added
- [x] Markup tests above pass; existing `e2e/editor-layout.spec.ts` and `editor-keyboard.spec.ts` pass unchanged (no actions in the editor e2e)
- [x] Editor coverage stays ≥ 70 % lines

**Verification:** `npm test -- src/renderer/editor/view`, `npm run check`, `npm run test:e2e`.
No visible change yet (the slot is empty until C8), so no shots; the boxes are asserted in C8.

**Dependencies:** A1

**Files:** `SPEC-editor.md`, `src/renderer/editor/view/{Editor.tsx,TopBar.tsx,TopBar.test.tsx,Editor.test.tsx,editor.css}`

**Scope:** S

## C2: Editor `notify` and the `busy` event

**Description:** clipboard-export required change 2. First edit `SPEC-editor.md` "Seam to the
host" (`notify` line, `'busy'` in `EditorEvent`) and add an R-row. Then
`EditorController.notify(kind, text)` dispatches `notice-show`; the controller's store subscriber
emits `{ type: 'busy' }` whenever `canRun({type: 'set-preset'})` changes value. Export the
updated types from `src/renderer/editor/index.ts`.

**Tests first:** `state/controller.test.ts`: `notify('info', 'x')` puts the notice in state with
kind info and emits `notice`; `notify('error', …)` kind error; a bond drag emits `busy` at its
start and at its release (exactly two); opening and committing the label editor emits two; an
edit with no gesture emits none; `controller-commands.test.ts` still agrees for every command.

**Acceptance criteria:**
- [x] `SPEC-editor.md` edited first; R-row added
- [x] Tests above pass; no other controller test changed
- [x] `npm run test:e2e` editor suite green

**Verification:** `npm test -- src/renderer/editor/state`, `npm run check`. No visible change.

**Dependencies:** C1

**Files:** `SPEC-editor.md`, `src/renderer/editor/{index.ts,state/controller.ts,state/controller.test.ts}`

**Scope:** XS

## C3: Windows clipboard probe

Preparation only (2026-11-10, Linux): probe and typed selector written; P1–P7 UNRUN,
needs Windows. Preferred constants UNVERIFIED; no fallback selected. C3 remains incomplete.

**Description:** rule R1, probes P1–P7 (spec "Testing"). Write
`e2e/win/clipboard-facts.spec.ts`, which runs the clipboard API in main through `app.evaluate`
with a small real PNG (made in the page with a `<canvas>`), an SVG (`renderSvg` of
`goldenDoc('ethanol')`) and an ASCII drawing string: P1 the four preferred CB-W1 entries in one
`write` resolve; P2 `has()` is true for each key; P2b `powershell -NoProfile -STA -Command
"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetDataObject().GetFormats()"`
lists `PNG`, `image/svg+xml` and the drawing format and no `Text` / `UnicodeText`; P3 `read()` +
`getType(key)` return exactly the written bytes for every raw entry; P4 with `image/png` alone,
whether `has('electron application/osclipboard;format="PNG"')` is true and whether the `PNG` bytes
keep the `pHYs` chunk; P5 a drawing written by one launch is read back by a second launch after
the first has quit; P6 after the write `has('text/plain')` is false and `readText()` is `''`; P7
each fallback key of CB-W1 (`image/svg+xml`, `web application/x-chalkbond`) writes and reads back.
Record every result in the spec's "Facts relied on" (replace "probe P1–P3 / P4 / P2b" wording
with what was observed) and create `src/main/clipboard-export/formats.ts` exporting the key used
for each entry (`BITMAP_KEY`, `PNG_KEY | null`, `SVG_KEY | null`, `DRAWING_KEY`) with a comment
naming the probe line.

**Tests first:** the probe spec itself (each P a `test`). A probe whose preferred key fails is
not a failing test: the test asserts the observed behaviour and the fallback's success, and the
spec row says which applies. If `image/png` itself is rejected (P1), stop and report: no fallback
is allowed for the bitmap.

**Acceptance criteria:**
- [ ] `e2e/win/clipboard-facts.spec.ts` green on Windows (`npx playwright test e2e/win/clipboard-facts.spec.ts` after `npm run build`)
- [ ] Facts table rows for the clipboard rewritten with the observed results, in this commit
- [ ] `formats.ts` exists, typed, with the chosen keys; CB-W1's table unchanged or amended to match

**Verification:** `npm run build`, the probe spec above, `npm run check`. No visible change.

**Dependencies:** A2 (test hook, `e2e/win` ignore rule), A3 (main structure)

**Files:** `e2e/win/clipboard-facts.spec.ts`, `src/main/clipboard-export/formats.ts`, `SPEC-clipboard-export.md`

**Scope:** S

## C4: PDF incremental-update probe

2026-11-10 corrective Linux probe: PDF-A verified; original/blank differ 4,238 pixels,
updated/original differ 0/480,000. Headless viewer was clamped to 1×1; minimum dimensions
fix the hidden probe. No production security changes. Windows confirmation remains pending.
Fixture-reading tests live in `tests/clipboard-export/`: the core TypeScript project and lint
boundaries prohibit Node filesystem APIs even in colocated tests.

**Description:** Decision O4, rules PD1 (probe form), PDF-A1, PDF-A3, probes P8, P9. (1)
`e2e/pdf-facts.spec.ts` prints `renderSvg(goldenDoc('toluene'))` exactly as PD1 does (hidden
window via `app.evaluate`, temp `page.html`, `printToPDF`), writes it to `out/pdf-facts/print.pdf`
and asserts P8: the last `startxref` points at the keyword `xref` (classic table), no `/Type
/XRef`, no `/Encrypt`. Copy that file once to `src/core/clipboard-export/__fixtures__/chromium-45.pdf`
(a second assertion keeps the fixture honest: fresh output and fixture have the same structure
kind). (2) Test-first `src/core/clipboard-export/pdf-embed.ts`: `withPdfDrawing`,
`readPdfDrawing` as PDF-A1 and PDF-A3. (3) In the same e2e: embed the drawing of toluene into the
fresh print; open the plain and the embedded PDF each in a hidden `BrowserWindow` with
`webPreferences: { plugins: true, partition: 'probe-pdf' }` (own session, so SEC4 does not block
the viewer); poll `capturePage()` for up to 10 s until dark pixels appear; assert the two captures
are equal (≤ 0.5 % of pixels differ); `readPdfDrawing` returns the payload. P9: a 20 × 20 pt page
prints. **Decide:** all pass → outcome A: delete the "Outcome B" paragraph from the spec and add a
Decisions row "PDF-A applies (probe C4, date)". P8 fails or the embedded capture differs →
outcome B: delete `pdf-embed.ts` and its tests, delete the "Outcome A" paragraph and the
`'pdf'` mentions marked "PDF-A only" / "under PDF-A" in both specs, add the Decisions row. If the
plain PDF never renders (control fails), stop and report: the probe is inconclusive.

**Tests first:** `pdf-embed.test.ts` on the fixture: the original is a byte prefix of the result;
the new xref section has one entry whose offset points at `n 0 obj`; the new trailer's `/Prev`
equals the old `startxref`, `/Size` = old + 1, `/Root` and `/ID` copied; `readPdfDrawing` round
trip; refusals built by editing a copy of the fixture: `/Type /XRef` at `startxref` →
`xref-stream`, `/Encrypt` in the trailer → `encrypted`, no `%%EOF` → `unrecognised`;
`readPdfDrawing` of the plain fixture → null. `pdf-embed.prop.test.ts`: any payload of printable
ASCII round-trips; truncations and random bytes never throw (CS3).

**Acceptance criteria:**
- [ ] `e2e/pdf-facts.spec.ts` green (Windows and Linux)
- [x] Under A: `pdf-embed.ts` ≥ 90 % lines, properties pass; under B: the files are gone and no reference to them remains (`npm run check` green)
- [x] The spec has exactly one outcome paragraph, a Facts row for P8/P9 with what was observed, and the Decisions row

**Verification:** `npm test -- src/core/clipboard-export`, `npm run build`, `npx playwright test e2e/pdf-facts.spec.ts`, `npm run check`. No visible change.

**Dependencies:** A3 (SEC2/SEC4 in place, so the probe proves the partition approach)

**Files:** `e2e/pdf-facts.spec.ts`, `src/core/clipboard-export/{pdf-embed.ts,pdf-embed.test.ts,pdf-embed.prop.test.ts,index.ts,__fixtures__/chromium-45.pdf}`, `SPEC-clipboard-export.md`, `SPEC-app-shell.md` (outcome B only)

**Scope:** M

## C5: Pure core: payload, picture, PNG and SVG embedding

**Description:** `payload.ts` (`drawingPayload`, `pictureSelection`, `pictureDoc`), `picture.ts`
(`exportSvg`, `pngPixelSize`, `RASTER_LIMITS`, `groupDigits`), `png-chunks.ts` (`crc32`,
`withPictureChunks`, `readPngDrawing`, `PngError`), `svg-embed.ts` (`readSvgDrawing`), exported
from `index.ts`, exactly as "Public surface", E1–E3, PI1–PI4, R3, R7.

**Tests first:** the unit rows of the spec's Testing table for these functions, plus:
`drawingPayload` output matches `/^[\x20-\x7E]*$/`; `pictureDoc(doc, null) === doc`;
`pictureDoc` for a selected arrow brings its attached texts; `exportSvg(doc, sel).svg` contains
exactly the selected parts' keys; `pngPixelSize(800, 200, 300)` = 3334 × 834; a 4000 × 4000 pt
drawing at 600 dpi is reduced to fit 10 000 px and 50 MP; `groupDigits(2984)` = "2,984",
`groupDigits(999)` = "999", `groupDigits(1234567)` = "1,234,567". Property tests (fast-check, doc
arbitraries): payload round trip; `readSvgDrawing(exportSvg(d, null).svg)` equals the payload;
PNG chunk round trip on a minimal 1×1 PNG; arbitrary bytes and truncations to the readers never
throw.

**Acceptance criteria:**
- [x] All functions exported from `@core/clipboard-export`; the lint boundary (doc-model, svg-render only) holds
- [x] Unit and property tests pass; `src/core/clipboard-export` ≥ 90 % lines for these files (`npm test -- --coverage src/core/clipboard-export`)
- [x] No clock, DOM or Node API used (tsconfig.core compiles)

**Verification:** `npm test -- src/core/clipboard-export`, `npm run check`. No visible change.

**Dependencies:** C4 (index.ts shape)

**Files:** `src/core/clipboard-export/{index.ts,payload.ts,picture.ts,png-chunks.ts,svg-embed.ts,*.test.ts,*.prop.test.ts}`

**Scope:** M

## C6: Pure core: paste decision, opening embedded files, file names

**Description:** `paste.ts` (`pasteAction`, `ClipboardContents`, `PasteAction`), `drawing-file.ts`
(`fileKindOf`, `extractDrawing`; `'pdf'` only under PDF-A), `names.ts` (`exportFileName`), per
CB-P1, E4, "names".

**Tests first:** `pasteAction` every branch of CB-P1 (drawing equal to `lastEditorCopy` with and
without `inAppReady`; other drawing → fragment equal to `extract(doc, everything(doc))`;
newer-version → `newer`; invalid JSON → `damaged`; long text; text; image only; empty);
`extractDrawing` every problem code and the BOM; `fileKindOf('A.CHALK')` = `'chalk'`,
`'x.docx'` → null; `exportFileName` per its comment (reserved characters, control chars, `...`,
empty → `Untitled.png`, a 200-char name capped, `ethanol.chalk` → `ethanol.png`, `a.PNG` → `a.png`).
Property: `extractDrawing` on arbitrary bytes for every kind never throws.

**Acceptance criteria:**
- [x] Exported from `@core/clipboard-export`; tests pass; module ≥ 90 % lines so far
- [x] `pasteAction` reads no clock and calls `parse` only
- [x] Correction (2026-11-11, Decision C9 size policy): `exportSvg` (one `renderSvg`) removes only its own metadata when the SVG would pass `MAX_PICTURE_BYTES` (64 MiB UTF-8; the result equals `embed: false`); `extractDrawing` refuses a `.chalk` over 20 MiB and a picture over 64 MiB, the text inside still meets `parse`'s 20 MiB; pure `utf8ByteLength` (surrogates) (`limits.test.ts` with scaled injected limits; real-size production checks in `e2e/picture-limits.spec.ts`)

**Verification:** `npm test -- src/core/clipboard-export`, `npm run check`. No visible change.

**Dependencies:** C5

**Files:** `src/core/clipboard-export/{index.ts,paste.ts,drawing-file.ts,names.ts,*.test.ts,*.prop.test.ts}`

**Scope:** S

## C7: Main clipboard (C1, C2) and the renderer rasteriser

**Description:** `src/main/clipboard-export/clipboard.ts`: CB-W1 (keys from `formats.ts`) and
CB-R1; registered through app-shell's `handle()` with Zod schemas in `src/main/ipc-schemas.ts`
(C1, C2 rows); preload functions `clipboardWrite`, `clipboardRead` (channel names in
`src/shared/channels.ts`); types in `src/shared/ipc-types.ts`. Renderer
`src/renderer/clipboard-export/rasterise.ts` per R1 (attribute rewrite, blob image, canvas, white
fill, `withPictureChunks`, object URL revoked in `finally`).

**Tests first:** `clipboard.test.ts` with a stubbed `clipboard` object: the write builds one
`ClipboardItem` with exactly the chosen keys; a rejected write returns `{ ok: false }` and logs;
CS1 (each invalid field of C1 rejected by the schema through `handle()` with a fake event); CS2
(a 21 MB drawing entry → null; 70 000-char text → null + `textTooLong`). `e2e/win/clipboard-ipc.spec.ts`:
the page calls `window.chalkbond.clipboardWrite` with a canvas-made PNG, an SVG and a drawing; main
reads back the same bytes; P2b's PowerShell list shows the formats; `clipboardRead` returns the
drawing and `image: true`.

**Acceptance criteria:**
- [x] Handler unit tests pass; schemas reject every CS1 case
- [x] Correction (2026-11-11, Decision C9): C1 takes an SVG up to 64 MiB of UTF-8 (20 MiB + 1 accepted, 64 MiB + 2 bytes in 32 Mi + 3 characters refused); the drawing stays at 20 MiB. `rasterise` adds the chunks through `withPictureChunksCapped`: a payload that alone pushes the PNG past 64 MiB is left out, `pHYs` kept (`rasterise.test.ts` with an injected cap; the 64 MiB case in `e2e/picture-limits.spec.ts`)
- [ ] `e2e/win/clipboard-ipc.spec.ts` green on Windows; the SEC4 request counter is 0 at the end
- [ ] `window.chalkbond` exposes the two new functions and nothing else new (SEC5 list updated; bridge e2e pending)

**Verification:** `npm test -- src/main`, `npm run build`, `npx playwright test e2e/win/clipboard-ipc.spec.ts`, `npm run check`. No visible change (rasterise is exercised by C8 and C11).

**Dependencies:** C3, C5, A3

**Files:** `src/main/clipboard-export/{clipboard.ts,clipboard.test.ts}`, `src/main/{ipc-schemas.ts,index.ts}`, `src/shared/{channels.ts,ipc-types.ts}`, `src/preload/{index.ts,api.d.ts}`, `src/renderer/clipboard-export/rasterise.ts`, `e2e/win/clipboard-ipc.spec.ts`

**Scope:** M

## C8: Copy: flow, Copy button, Ctrl+C, notices

**Description:** `model/copy-flow.ts` (copy half): CB-C1–CB-C3, CB-Q queue, the 2 s "Copied" timer
(injected clock and scheduler), `lastEditorCopy`, notices N-C1–N-C6 through `controller.notify`.
`CopyButton.tsx` + `clipboard-export.css` per "Copy button" (states, label-only below 1100 px,
disabled reasons from the `busy` event, tooltip, `aria-label`, K5 mouse press). App wiring
(app-shell host from A6): `onCopy` option, `<Editor actions={<CopyButton …/>}>`, host key
Ctrl+C (whole drawing, empty selection, non-text target) in `src/renderer/app/host-keys.ts` +
`model/keys.ts` (first K1 rows). `e2e/fixtures.ts` `loadScheme`.

**Tests first:** flow tests with fake ports: selection copy runs `controller.run('copy')` and
pictures from the `onCopy` payload; empty selection pictures the whole doc without `run`; empty
doc → N-C4; failure → N-C6 and `lastEditorCopy` unchanged; button state copied for 2 s, restarted
by a second copy; a paste queued behind a copy runs after its write (CB-Q). Markup tests of
`CopyButton` (rest, copied, compact, disabled with each reason, `aria-label`). `keys.test.ts`:
Ctrl+C on canvas with empty selection → whole copy; in an input → not handled; with a selection
→ not handled (left to the editor). `e2e/win/clipboard-copy.spec.ts`: SC3 (formats via P2b, SVG
equals `exportSvg(doc, null).svg` computed in the test, drawing parses to `serialize`-equal doc,
PNG size and `pHYs`) and SC4 (select ethanol in the scheme, Ctrl+C, drawing entry equals
`drawingPayload(pictureDoc(doc, sel))`); Ctrl+C in the name field with "ethanol" typed and
selected leaves `readText() === 'ethanol'` and no drawing entry. `e2e/clipboard-ui.spec.ts` (all
platforms, no clicks on Copy): at 1280×800 the Copy box is ≥ 84 wide, 32 high, its left edge 12 px
after Redo's right edge, its right edge at 1268; at 960×640 it is ≥ 56 wide, label "Copy" with no
`svg` child, 8 px after Redo, name field 204 wide; with the Atom tool at 960×640 the options bar's
`scrollWidth <= clientWidth` (SC11); Tab order Redo → Copy → first rail button; empty document →
`aria-disabled="true"`.

**Acceptance criteria:**
- [x] Flow, markup and keys tests pass; `src/renderer/clipboard-export/model` ≥ 90 % lines so far
- [ ] `e2e/win/clipboard-copy.spec.ts` and `e2e/clipboard-ui.spec.ts` green (SC3, SC4, SC11, the box parts of SC10) — `clipboard-ui` green on Linux (its "UI success" group stubs main's `clipboard.write`); the Windows spec is written and not yet run
- [x] Shots exist and look as described below (Linux; transport stubbed, not clipboard proof)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- C8` →
`C8/main.png` (A01: scheme loaded, nothing selected; Copy at the right end of the top bar, blue,
copy icon + "Copy", Undo/Redo to its left; the rest of the window as the editor shots),
`C8/copied.png` (A02, scripted: click Copy, capture within 1 s: button "Copied" with a check, same
height and right edge, a few px wider as A02 draws it (88 px for 84); hint slot "Copied the whole drawing. Paste into PowerPoint or Word with Ctrl+V."),
`C8/copied-selection.png` (scripted: click ethanol with Select, Ctrl+C; hint "Copied. Paste into
PowerPoint or Word with Ctrl+V."), `C8/min-960.png` (A15b: Atom tool via the rail, label-only
"Copy" 8 px after Redo, name field 204 px, every Atom option visible including δ−),
`C8/disabled-960.png` (empty drawing: grey disabled "Copy", as A11's top bar).

**Dependencies:** C1, C2, C7, A5, A6

**Files:** `src/renderer/clipboard-export/{model/copy-flow.ts,model/copy-flow.test.ts,CopyButton.tsx,CopyButton.test.tsx,clipboard-export.css}`, `src/renderer/app/{App.tsx,host-keys.ts,model/keys.ts,model/keys.test.ts}`, `e2e/fixtures.ts`, `e2e/win/clipboard-copy.spec.ts`, `e2e/clipboard-ui.spec.ts`, `e2e/shots/C8.shot.ts`

**Scope:** L (split the e2e into a follow-up commit only if the session runs out; both inside C8)

## C9: Paste: flow, Ctrl+V, notices, round trips

**Description:** `copy-flow.ts` paste half: CB-P1 through `pasteAction`, run on the controller
(`run('paste')`, `paste-sub`, `insert-text`), notices N-P1–N-P5, CB-Q shared queue; host key
Ctrl+V (non-text target, idle) in `model/keys.ts`.

**Tests first:** flow tests for each `PasteAction` kind → the right controller call or notice; a
paste while not idle does nothing. `keys.test.ts`: Ctrl+V on the canvas → paste; in an input or
contenteditable → not handled. `e2e/win/clipboard-paste.spec.ts` (SC5, round trips): select
ethanol, Ctrl+C, Ctrl+V → a copy at source + (1, 1) BLU, selected, tool Select (positions read
through the test hook); Copy button with nothing selected, Ctrl+V → a fragment at the canvas
centre; main writes a drawing with the CB-W1 drawing key (as another session) → Ctrl+V inserts it
as a fragment; main `writeText('ethanol')` → Ctrl+V inserts ethanol (formula C2H6O in the status
bar); main writes only `image/png` → N-P1; a newer-version envelope → N-P3; `{"format":` garbage →
N-P4; 70 000 characters of text → N-P5; Ctrl+V in the name field pastes the text into the field
and leaves the document unchanged (SC6's queue order is the flow test).

**Acceptance criteria:**
- [x] Flow and keys tests pass
- [ ] `e2e/win/clipboard-paste.spec.ts` green: every round trip above — written, not yet run (Windows only)
- [x] Correction (2026-11-11, Decision C8 paste provenance): after copy A, a failed copy B (write not ok, write throws, rasteriser throws), a paste queued before a later `onCopy` B, or an `onCopy` B during the paste's read → Ctrl+V pastes the clipboard's A as a fragment, never the in-app B; repeated own-copy pastes still cascade (`copy-flow.test.ts` "paste provenance"; portable `e2e/clipboard-provenance.spec.ts` with a failing write in the memory stub: transport stub, not Windows clipboard proof)
- [x] Shots exist and look as described (Linux; main's clipboard is the in-memory store of
  `e2e/stub-clipboard-memory.mjs` behind the real adapter and flow: UI/model success, not clipboard proof)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- C9` →
`C9/pasted-cascade.png` (scripted: ethanol selected, Ctrl+C, Ctrl+V: a second ethanol 1 BLU right
and down, selected with the selection halo), `C9/notice-picture-only.png` (scripted: main writes
an image-only clipboard, Ctrl+V: hint "Only drawings copied from Chalkbond can be pasted here." in
`--text`, no icon, as A17), `C9/notice-damaged.png` (warning icon, red text "The copied drawing is
damaged and can't be pasted. Copy it again.").

**Dependencies:** C6, C8

**Files:** `src/renderer/clipboard-export/model/{copy-flow.ts,copy-flow.test.ts}`, `src/renderer/app/model/{keys.ts,keys.test.ts}`, `e2e/win/clipboard-paste.spec.ts`, `e2e/shots/C9.shot.ts`

**Scope:** M

### Checkpoint T — copy and paste work (see the plan)

## C10: Export dialog (A08a–c), remembered choices, Ctrl+E

**Description:** `ExportDialog.tsx` on app-shell's dialog shell, radio cards, segmented control
and checkbox, per "Export dialog" (wording, test ids, size line with `pngPixelSize` and
`groupDigits`, reopen line per format and PDF outcome, focus rules). `model/export-flow.ts`
(dialog state from `RendererSettings.export`, EX1, EX2 up to C3 with `exportFileName`). Host key
Ctrl+E (idle, drawing not empty) in `model/keys.ts`; the File > Export menu item arrives in A11.

**Tests first:** export-flow tests: initial choices from settings; first run PNG / Print /
transparent; Save… stores `settings:set { export }` before C3; C3 gets `Untitled.png` for an
untitled drawing and `esterification.svg` for `esterification.chalk`; Cancel and a cancelled
native dialog do nothing. Markup tests: three cards with titles and descriptions as A08; PNG block
only for PNG; size line texts for Screen / Print / Poster and the reduced form; reopen line per
format and outcome; `role`s and `aria-checked`. `e2e/export-dialog.spec.ts`: Ctrl+E opens it with
focus on the PNG card; ↓ selects SVG and hides the PNG block; Esc closes and focus returns to the
canvas; Enter = Save… calls the stubbed `showSaveDialog` with `defaultPath` ending `Untitled.png`
(cancelled by the stub); box: 400 wide, top edge 96 px below the content top, centred within 1 px;
choices survive a relaunch with the same user-data folder (Poster + White background stay
selected).

**Acceptance criteria:**
- [x] Flow, markup and e2e tests pass; `model/` ≥ 90 % lines so far (`export-flow.test.ts`, `ExportDialog.test.tsx`, `keys.test.ts` Ctrl+E, `primitives.test.tsx`; `e2e/export-dialog.spec.ts` incl. the 960 × 640 short window; Linux only). C10 stops at the chosen file: nothing is written and no success notice is shown until C11 / C12
- [x] No "dpi" text anywhere in the dialog (markup test)
- [x] Shots exist and match A08a–c (`C10/export-png.png`, `export-svg.png`, `export-pdf.png` under outcome A, `export-png-960.png`; looked at beside `docs/mockups/shell` A08a–c)

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- C10` →
`C10/export-png.png` (A08a, scripted: scheme, Ctrl+E: PNG card selected with keyboard focus ring,
Size "Print" selected, line "Sharp on paper. W × H pixels." with the scheme's numbers, White
background unchecked, reopen line with the info icon, Cancel and blue Save…),
`C10/export-svg.png` (A08b: SVG chosen with the mouse, no PNG block), `C10/export-pdf.png` (A08c
under outcome B: the caution in `--text`; under A the PNG reopen line), `C10/export-png-960.png`
(the PNG dialog at 960×640, fully visible).

**Dependencies:** A5, A7, A10, C5, C6

**Files:** `src/renderer/clipboard-export/{ExportDialog.tsx,ExportDialog.test.tsx,model/export-flow.ts,model/export-flow.test.ts,clipboard-export.css}`, `src/renderer/app/{App.tsx,model/keys.ts,model/keys.test.ts}`, `e2e/export-dialog.spec.ts`, `e2e/shots/C10.shot.ts`

**Scope:** M

## C11: Export PNG and SVG; reopen round trips

**Description:** EX3 (PNG through `rasterise`, SVG bytes), C4 write, EX4 notices N-E1–N-E3 and the
app-shell error box on failure, EX5. Export never touches dirty, the session file or recovery.

**Tests first:** export-flow tests: PNG at each size passes the dpi to `rasterise`; White
background fill flag; SVG bytes equal `exportSvg(doc, null).svg` UTF-8 with no BOM; a failed write
shows the file error (`write-denied` → stubbed box); the dirty flag is unchanged after export.
`e2e/export-png.spec.ts` (SC7, round trip): toluene golden input loaded, Export PNG at Print with
`showSaveDialog` stubbed to a temp path; the file's IHDR size is `ceil(W·300/72) × ceil(H·300/72)`,
`pHYs` 11811 px/m, `tEXt chalkbond` present; pixels checked in the page (bytes → `Blob` →
`createImageBitmap` → canvas): corners alpha 0, ink box within 2 px of every edge, a bond ≥ 6
opaque px across; White background → corners `#ffffff`; then File > Open (stubbed dialog, A9
flow) of that PNG gives a document whose `serialize` equals the original's. `e2e/export-svg.spec.ts`
(SC8): the file equals `exportSvg(doc, null).svg` and reopens to an equal document. Notice "Exported
toluene.png." after a save as `toluene.chalk` first.

**Acceptance criteria:**
- [ ] Flow tests pass; both e2e specs green (SC7, SC8 round trips)
- [ ] A drawing over `MAX_FILE_BYTES` payload (generated in a unit test) exports without the chunk and shows N-E3 (flow test)
- [ ] Shot exists

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- C11` →
`C11/exported.png` (scripted: scheme saved as `esterification.chalk` via stubbed dialogs, Export
PNG: hint "Exported esterification.png.", as A17's row).

**Dependencies:** C7, C10, A9

**Files:** `src/renderer/clipboard-export/model/{export-flow.ts,export-flow.test.ts}`, `e2e/export-png.spec.ts`, `e2e/export-svg.spec.ts`, `e2e/shots/C11.shot.ts`

**Scope:** M

## C12: Export PDF per the probe outcome

**Description:** `src/main/clipboard-export/pdf.ts` (C5 `pdf:print`, PD1) with schema and preload
`printPdf`; export-flow PDF branch: `exportSvg(doc, null, { embed: false })` → C5 → PDF-A2
(`withPdfDrawing`, fallback N-E3) or PDF-B1 → C4. Under PDF-A, app-shell's Open and drop accept
`.pdf` (`fileKindOf`, the I1 filter, F14 wording) in this task.

**Tests first:** `pdf.test.ts` (schema: width 0, 20 000, NaN rejected; non-`<svg` rejected).
Export-flow tests: PDF-A2 refusal path writes the printed bytes and shows N-E3. `e2e/export-pdf.spec.ts`
(SC9): Export PDF of the scheme → PD2 checks (`%PDF-`, one `/Type /Page`, MediaBox within 1 pt of
the SVG size, `/FontFile2`, no `/Subtype /Image`); under A: the C4 viewer comparison and File >
Open of the PDF gives an equal document; CS6: with `printToPDF` stubbed to reject, the
`chalkbond-pdf-*` temp folder no longer exists afterwards and the error box shows "Couldn't save".

**Acceptance criteria:**
- [ ] Unit and e2e tests pass (SC9; the PDF round trip under A)
- [ ] The hidden window has `javascript: false`, no preload, and is destroyed after each print (e2e: `BrowserWindow.getAllWindows().length` is 1 afterwards)
- [ ] Shot exists

**Verification:** `npm run check`, `npm run test:e2e`, `npm run shots -- C12` →
`C12/exported-pdf.png` (hint "Exported esterification.pdf." or, under B, the same notice; the
dialog before it showed the outcome's reopen line).

**Dependencies:** C4, C11

**Files:** `src/main/clipboard-export/{pdf.ts,pdf.test.ts}`, `src/main/{ipc-schemas.ts,index.ts}`, `src/shared/{channels.ts,ipc-types.ts}`, `src/preload/{index.ts,api.d.ts}`, `src/renderer/clipboard-export/model/export-flow.ts`, `e2e/export-pdf.spec.ts`, `e2e/shots/C12.shot.ts`; under A also `src/main/files.ts`, `src/main/model/messages.ts`, `src/renderer/app/DropOverlay.tsx` (only if A15 is done)

**Scope:** M

### Checkpoint V — export works (see the plan)

## C13: Coverage, copy performance, checklist section

**Description:** coverage thresholds in `vitest.config.mts`: `src/core/clipboard-export/**` and
`src/renderer/clipboard-export/model/**` at 90 % lines (no exclusions). `e2e/win/clipboard-perf.spec.ts`:
copy of the 40-atom scheme (the editor perf fixture) measured from the button click to the C1
write resolving (timestamps through the test hook's notices), median of 5 ≤ 500 ms (SC12), the
number appended to `docs/editor-perf.md`. `docs/windows-checklist.md`: section "Clipboard and
export" with the spec's "Windows checks", unticked. Sweep SC1–SC13 into the plan's coverage table
(mark which are human-only).

**Tests first:** the thresholds (they fail if coverage is short); the perf spec.

**Acceptance criteria:**
- [ ] `npm test -- --coverage` passes the new thresholds
- [ ] `e2e/win/clipboard-perf.spec.ts` green; `docs/editor-perf.md` has the row
- [ ] Checklist section added, unticked; plan SC table ticked where proven

**Verification:** `npm test -- --coverage`, `npm run test:e2e`, `npm run check`

**Dependencies:** C12, A18

**Files:** `vitest.config.mts`, `e2e/win/clipboard-perf.spec.ts`, `docs/editor-perf.md`, `docs/windows-checklist.md`, `tasks/plan-clipboard-export.md`, `tasks/todo-clipboard-export.md`

**Scope:** S

C7 worker evidence (2026-11-11): unit red missing implementation, then 3 adapter/schema tests green; npm run check exit 0, 190 files / 3449 tests. Windows IPC spec written, UNRUN Linux. Exception to red-first: Windows probe cannot run here; rasteriser and bridge e2e verification pending C8. Logs /tmp/chalkbond-c7-c8-wX2cOQ/c7-red.log.
