# Spec: `clipboard-export`

Shared stack, commands, style and boundaries: see `SPEC.md`. Module map: `CAPABILITY-MAP.md`.
Core depends on: `doc-model`, `svg-render` (public `index.ts` entries only). Written together with
`SPEC-app-shell.md`; the two share one UI design (`docs/mockups/shell/`) and one IPC contract
(app-shell "Process split and IPC"). Status: **approved 2026-11-10** (drafted in commit 4dd7d48;
reviewed and approved by the delegated reviewer with the shell mock-ups of commit d3abe4b as the
visual source of truth; see "Decisions").

Audience: a grade 11–12 chemistry teacher in Nepal (NEB curriculum) on a Windows laptop with
Office 2021, no network, not a power user. The test for every choice: *what would this teacher
expect?* The one job of this module: **the teacher draws something and gets it into PowerPoint or
Word, looking like a textbook figure, without having to learn anything.**

## Objective

1. **Copy.** One action (Ctrl+C, the top-bar **Copy** button, Edit > Copy, the canvas context
   menu) puts the selection, or the whole drawing when nothing is selected, on the Windows
   clipboard as a picture Office pastes well (vector SVG and a transparent, tight, 300 dpi PNG)
   **and** as the Chalkbond drawing, in one clipboard write. Ctrl+V then works in PowerPoint, in
   Word and back in Chalkbond (also in a later session).
2. **Export.** File > Export… writes the whole drawing as PNG, SVG or PDF.
3. **Reopen.** Exported PNG and SVG files (and PDF, if probe C4 passes: rule PDF-A) carry the
   drawing, so app-shell's Open turns them back into an editable drawing.

User stories served (`SPEC.md`): 6 (copy and paste into PowerPoint / Word, export PNG / SVG / PDF)
and the second half of 7 (exported SVG / PNG reopen as editable).

## Scope

**In:** the picture of a copy or export (what is drawn, size, margins, background, resolution);
embedding the drawing in PNG, SVG, PDF (per probe) and the clipboard and reading it back;
rasterising SVG to PNG; PDF printing; the system clipboard write and read (main process); the
paste decision; the Copy button; the Export dialog; their notices; IPC channels C1–C5.

**Out:** menus, context menus, Open/Save dialogs, title, prompts, recent files, settings storage,
the dialog shell and the UI primitives (`app-shell`; this module uses them); how the figure looks
(`svg-render`); in-app paste placement (editor CB1).

**Non-goals (v1):** EMF / WMF clipboard formats; text as outlines; "copy as SVG text"; exporting
the selection only (Copy covers parts of a drawing); batch export; print.

## Facts relied on

C4 Linux observation (2026-11-10, Electron 45.2.3): **PDF-A applies**. P8 fresh PD1
print and committed fixture have classic xref tables (no XRef stream or Encrypt); P9
20×20 pt prints a PDF. Hidden original-vs-blank control differs by 4,238 pixels;
original-vs-incremental-update differs by 0 / 480,000 pixels (≤ 0.5%). Payload reads back.
Headless Linux clamps an unconstrained probe viewer to 1×1; minimum 800×600 dimensions
restore actual page rendering. Private probe-pdf session, hidden windows and SEC2/SEC4
remain intact. Readiness stops at stable page ink, within the unchanged 10 s maximum.
Windows P8/P9 remain UNRUN. All probe windows/folders are cleaned up; default SEC4 stays zero.


C3 preparation (2026-11-10): P1–P7 including P2b are **UNRUN on Linux; needs Windows**.
The exported preferred constants are UNVERIFIED. No fallback has been selected.
The typed selection interface includes every named CB-W1 fallback for C7.


Checked on 2026-11-10 against the code, `node_modules/electron/electron.d.ts` ("Type definitions
for Electron 45.2.3") and the installed packages. Rows marked **probe** are pinned by task C3
(`e2e/win/clipboard-facts.spec.ts`) or C4 (`e2e/pdf-facts.spec.ts`) before any code depends on
them, like chem-core's OCL library-fact tests. If a probe fails, the named fallback applies and
this table is amended in the probe's own commit.

| Fact (source, quoted) | Consequence |
|---|---|
| The clipboard exists only for main. `electron.d.ts` 26688–26701, `namespace Main { … const clipboard: Clipboard; class ClipboardItem extends Electron.ClipboardItem {} …`; 27122–27130, `namespace Renderer { const contextBridge … const ipcRenderer … const webFrame … const webUtils …` (no clipboard) | The main process owns the system clipboard; the renderer reaches it through C1 / C2 |
| **The draft's claim is correct.** 7441–7485, `interface Clipboard { clear(): void; has(mimetype: string): Promise<boolean>; read(): Promise<Electron.ClipboardItem[]>; readText(): Promise<string>; write(data: ClipboardItem[]): Promise<void>; writeText(text: string): Promise<void>; readonly selection: Clipboard; }`. No `writeImage`, `writeBuffer`, `readImage`, `availableFormats` | All formats go in one `write([new ClipboardItem({…})])` |
| 7466–7470, on `write`: "Resolves once the data has been written to the clipboard. All entries supplied in a single `write()` call are committed to the system clipboard atomically." | No format can clear another; a reader never sees half a copy |
| 7449–7455, on `has`: "To check for a raw format, eg `public/utf8-plain-text`, use the `electron application/osclipboard` custom format (`electron application/osclipboard;format="public/utf8-plain-text"`)." **The typings document the raw format only for `has`**, not as a `ClipboardItem` key for `write` or a `getType` argument | **UNRUN Linux; needs Windows (P1–P3)**: whether raw keys are accepted by `write` and returned by `read`/`getType`. Fallbacks per entry in rule CB-W1 |
| 7508, `constructor(items: Record<string, (string) \| (ClipboardBookmark) \| (Blob) \| (Promise<(Blob) \| (string)>)>)`; 7522–7529, `types`: "for an item returned by `clipboard.read()` these are the MIME types the platform clipboard currently makes available" | Entries are `Blob`s (Node's global `Blob`, typed by `@types/node`); the reader checks `types` before `getType` (which "Rejects when `type` is not present") |
| How Chromium stores an `image/png` entry on Windows (standard bitmap, its own `PNG` format, re-encoding that drops `pHYs`) is not in the typings | **UNRUN Linux; needs Windows (P4)** records it; the raw `PNG` entry carrying our `pHYs` is kept only if P4 shows it coexists with `image/png` |
| The Windows format names Office reads (`PNG`, `image/svg+xml`) can be listed outside Electron with .NET `System.Windows.Forms.Clipboard.GetDataObject().GetFormats()` in `powershell -STA` | **UNRUN Linux; needs Windows (P2b)** lists the formats a CB-W1 write leaves, exactly as Office sees them |
| Which format PowerPoint and Word 2021 prefer and whether they honour `pHYs` **cannot be established from the repo** | Write vector and bitmap; never `text/plain`, `text/html`, `text/rtf` (Office would paste text). Human check: "Windows checks" |
| 19400, `printToPDF(options: PrintToPDFOptions): Promise<Buffer>`; 12004–12080 `PrintToPDFOptions`: `margins?: PrintToPDFMargins`, `pageSize?: ('A0' … 'Ledger') \| (Size)`, `preferCSSPageSize?: boolean`, `printBackground?: boolean`, `generateTaggedPDF?: boolean` | PDF = a hidden window printing one inline SVG on a page the size of the drawing (rule PD1). Whether Chromium writes a classic cross-reference table (needed by rule PDF-A) is **probe P8** |
| P8 / P9 corrective probe, Linux Electron 45.2.3 (2026-11-10) | Classic xref in fresh print and fixture; hidden page ink proven against blank; embedded capture identical (0/480,000); payload readback equal; 20×20 pt print accepted. **PDF-A applies; Windows confirmation unrun** |
| svg-render `index.ts`: `renderSvg(doc, opts: RenderOptions & SvgOptions): SvgDocument`; `RenderOptions.only?: Selection` ("selected bonds bring their atoms; objects only when selected"); `SvgOptions { padding?: number /* default 0 (tight) */; metadata?: string /* "Opaque text, escaped, emitted as <metadata id="chalkbond">" */ }`; `SvgDocument { svg, width, height /* pt */, origin }`; `svgMetadata` writes `escapeText(content)` | The SVG export, the clipboard SVG and the raster source are one `renderSvg` call; the drawing travels in the existing `<metadata>`. **No svg-render change** |
| doc-model `index.ts`: `serialize`, `parse` → `Result<Doc, ParseError>` (codes `too-large invalid-json not-chalkbond newer-version unsupported-version migration-failed schema invariants`), `MAX_FILE_BYTES` (= 20 × 1024 × 1024, `serialize.ts:10`), `extract(source, sel): SubDoc`, `insert(doc, sub, at): [Doc, Selection]` (a tuple), `everything`, `emptyDoc`, `setStyle(doc, patch)` | The embedded drawing is `.chalk` text read back only through `parse`. **No doc-model change** |
| Editor `controller.ts`: `run('copy' \| 'cut')` calls `onCopy(taken, docBefore, selectionBefore)` only when something was taken; `canRun('copy')` = no gesture, no label/text editor, selection non-empty (`commands.ts` `canCopy`); `run('paste')` = in-app paste with CB1 cascade; `run({type:'paste-sub', sub})` places at the pointer, else the canvas centre; `canRun({type:'insert-text'})` is always true; `subscribe` events are `doc selection dirty history notice context-menu` only (no event when a label editor opens or a gesture starts); `notice-show {kind: 'info' \| 'error', text}` exists in the reducer but not on the controller | Copy of a selection goes through the editor; whole-drawing copy and every paste are the host's. The Copy button needs editor changes 1–2 ("Required changes") |
| Renderer CSP (`src/renderer/index.html`): `img-src 'self' data: blob:`; `connect-src 'self'` | The rasteriser loads the SVG as a `blob:` image (rule R1); no CSP change |
| electron-vite bundles the sandboxed preload; a sandboxed preload cannot `require` packages other than `electron` | The preload imports only channel names (app-shell rule SEC5); Zod schemas live in main |

## Decisions

Binding until a spec change. Rows O1–O6 are the orchestrator's decisions of 2026-11-10; X-rows
are the draft's, kept or amended at review; R-rows are the reviewer's resolutions.

| # | Decision | Reason | Date |
|---|---|---|---|
| C7 | C1 accepts drawing: null only when the editable payload exceeds MAX_FILE_BYTES (or, Decision C9, when its metadata would push the SVG past MAX_PICTURE_BYTES); omit its clipboard entry and retain bitmap / SVG. Non-null remains strict printable ASCII beginning with {. | Approved IPC correction; E1 already requires oversized payload omission; no document schema change | 2026-11-11 |
| C9 | Size policy: the editable drawing (`.chalk`, the payload, the clipboard drawing entry, the text found inside a picture) stays at `MAX_FILE_BYTES` (20 MiB, checked by `parse`). A picture carrier (PNG, SVG, PDF file; clipboard PNG and SVG) may be up to `MAX_PICTURE_BYTES` = 64 MiB, the C4 write cap: main reads a `.chalk` up to 20 MiB and a picture up to 64 MiB (app-shell SEC7), `extractDrawing` judges by kind the same way, C1 takes an SVG of up to 64 MiB of actual UTF-8. `exportSvg` stays one `renderSvg`; it embeds when the payload is at most 20 MiB and the final SVG at most 64 MiB UTF-8 bytes, else it removes only its own `<metadata id="chalkbond">` element (the rest byte-identical to `embed: false`). The PNG gets its chunks as usual unless the payload alone pushes it past 64 MiB: then it is rebuilt without the payload, `pHYs` kept. A picture over 64 MiB without the drawing still fails as before; no bound is lifted. F14 too-large detail: "Drawings can be up to 20 MB. Pictures made in Chalkbond can be up to 64 MB." | A Chalkbond picture with a small drawing could be written (64 MiB) but not reopened (20 MiB), and escaping (`\"` → `\&quot;`, 3.5×) let a payload under 20 MiB push the SVG past every carrier cap | 2026-11-11 |
| C8 | Paste provenance: every `onCopy` call bumps an editor-copy generation synchronously (the editor's in-app clipboard has just changed). Each queued selection or cut copy carries the generation of its `onCopy`; a successful write records it with `lastEditorCopy`. CB-P1 cascades in-app only when, compared after the awaited read, that recorded generation still equals the current one and the payload and `canRun('paste')` conditions hold; otherwise the clipboard's drawing pastes as a fragment. `lastEditorCopy` stays unchanged on failure, a whole copy still sets it to null; no editor API change | A failed copy B (or a copy B made while a paste waits or reads) changes the editor's clipboard but not the system's: comparing payloads alone pasted B when the system held A. Clearing `lastEditorCopy` on failure would miss the queue order | 2026-11-11 |
| C10 | PDF-A memory bound (correction of C12): `withPdfDrawing` and `readPdfDrawing` work on the bytes and must handle every PDF up to `MAX_PICTURE_BYTES` (64 MiB) in the renderer. They never convert the whole file, or any content stream, to a string, and never build a whole-file string, number array or chain of copies. Text is decoded only for the last 1024 bytes, the trailer dictionary and the classic-table lines (one line at a time, only when its bytes can match); the xref-stream check scans bytes; the reader resolves only the last `/ChalkbondDrawing` entry and its direct `/Length` stream, bounds-checked, and only the payload becomes a string, decoded in bounded chunks. The writer copies the original bytes once and writes the update after them. Every result (update bytes, `xref-stream` / `encrypted` / `unrecognised`, read text or null) equals C12's parser on every input; no public signature, cap or limit changes | C12's parser decoded the file one byte at a time into a string; on real near-64 MiB PDFs a Vitest worker reached 3.7 GB resident and spent 8–190 s per case (304 s for four), so Export PDF could exhaust or stall the renderer at a size the caps allow | 2026-11-11 |
| O7 | Positive fractional effective DPI is allowed only when no positive integer meets both raster caps after ceil and min 1. Search integers through floor(upper), upper = min(requestedDpi, 720000/widthPt, 720000/heightPt); if none fits, bisect [0,min(1,upper)] for 64 iterations (stop at an unrepresentable midpoint), retaining the feasible lower endpoint. Never return zero DPI; reduced is true. Keep rounded pHYs even when it is zero. | Approved orchestrator resolution for enormous finite drawings; avoids width × height overflow | 2026-11-11 |
| O1 | The **Copy** button sits at the right end of the top bar, after Undo/Redo (mock-ups A01, A02): a filled primary button with icon and label; after a copy it reads "Copied" with a check for 2 s; below 1100 px window width it shows the label "Copy" with no icon (never icon-only) and the name field narrows to 204 px (A15b) | The top-right corner is where Office and browsers put "send it on"; a word is self-explanatory, two overlapping sheets are not | 2026-11-10 |
| O2 | Ctrl+C, the Copy button and Edit > Copy copy the selection, or the whole drawing when nothing is selected, writing the picture formats and the editable drawing in one clipboard write. PNG transparent, tight, 300 dpi; SVG written too. Paste reads the system clipboard and follows the editor's cascade rule when the content is the editor's own last copy. Plain text pastes as a name or SMILES through the name-insert path | One shortcut for PowerPoint, Word and Chalkbond; the teacher never chooses a format | 2026-11-10 |
| O3 | Export dialog exactly as mock-ups A08a–c: three format cards; Size as Screen / Print / Poster in teacher language with the live pixel line and no "dpi"; "White background" off by default and remembered; one Save… button. Selection-only export is out | PNG needs two choices a Save dialog cannot ask; plain words | 2026-11-10 |
| C4 | PDF-A applies (probe C4, 2026-11-10, Linux); Windows confirmation pending | Hidden viewer control renders with minimum dimensions; embedded capture equals original | 2026-11-10 |
| O4 | Exports reopen as editable: PNG via a text chunk, SVG via svg-render's metadata. PDF: an early probe (C4) tries a standard incremental update; outcome A embeds, outcome B exports without embedding and says so (rule PDF-A / PDF-B) | Do not accept "no embedding" without evidence | 2026-11-10 |
| O5 | Accepted defaults: SVG stays on the clipboard even if Office ignores it; if Office ignores 300 dpi, accept for v1; plain error wording without codes | Costs nothing; newer Office and other apps use SVG; lowering the resolution would break "sharp at 400 %" | 2026-11-10 |
| O6 | All notice wordings as mock-up A17 | Teacher language, no "dpi", "clipboard" or "insert" | 2026-11-10 |
| X1 | One Copy writes the entries of rule CB-W1 in one `clipboard.write` | Atomic per the typings | 2026-11-10 |
| X3 | Clipboard picture: transparent, tight (padding 0), 300 dpi PNG, SVG at true size (1 SVG unit = 1 pt) | Slides have coloured backgrounds; tight handles (`SPEC.md` SC4) | 2026-11-10 |
| X4 | Size in Office follows the preset: Slides = 40 pt bonds, 24 pt labels; Handout = 14.4 pt bonds, 10 pt labels | The preset switch already means "where this goes"; no resizing | 2026-11-10 |
| X5 | The drawing travels as compact ASCII `.chalk` text (`drawingPayload`) everywhere: clipboard entry, PNG `tEXt`, SVG `<metadata>`, PDF stream | One format, read back only by `parse`; ASCII survives Latin-1 and XML escaping | 2026-11-10 |
| X10 | Rasterise in the renderer (SVG → `<img>` → `<canvas>` → PNG), then add `pHYs` and `tEXt` with pure code | Same Chromium and system Arial as the canvas; no hidden window, no native module | 2026-11-10 |
| X11 | No new dependency | PNG chunks, CRC-32 and a PDF incremental update are small pure code | 2026-11-10 |
| R1 | Raw Windows formats are written only after probe C3 shows `write` accepts them; each entry has a named fallback (CB-W1). The probe is the first implementation task of this module | The typings document the raw syntax for `has` only | 2026-11-10 |
| R2 | The PDF is printed in main and returned to the renderer (C5 `pdf:print`); the renderer embeds the drawing with pure code and writes the file through C4 | Keeps the main process free of core imports (app-shell SEC9) while the embedding stays a unit-tested core function | 2026-11-10 |
| R3 | Paste from the canvas context menu behaves exactly like Ctrl+V (CB-P1); the editor's explicit-point paste is not used | One paste rule; PowerPoint's context-menu Paste also lands where Ctrl+V does | 2026-11-10 |
| R4 | Ctrl+C / Ctrl+V / Ctrl+X in a text target (name field, label editor, text editor) are never handled by this module: native text behaviour wins. Edit > Cut / Copy / Paste with a text target focused act on the text (app-shell M3) | The teacher copying a name in the name field must get the name | 2026-11-10 |
| R5 | Copying the whole drawing does not touch the editor's in-app clipboard; pasting it back lands as a fragment at the pointer, else the canvas centre | The editor's copy needs a selection; selecting everything behind the teacher's back would surprise her | 2026-11-10 |
| R6 | A compact "Copied" (below 1100 px) shows the word without the check and may widen the button for its 2 s; the editor's options bar scrolls horizontally if it must | Keeping 56 px for "Copied" would clip it; the state lasts 2 s | 2026-11-10 |
| R7 | Numbers in the Export dialog are grouped with a comma by a pure function (`groupDigits`), never `toLocaleString` | Same text on every machine; testable | 2026-11-10 |
| R8 | Draft open questions resolved: Q1 → O4; Q2 (white PNG by default) → no, remembered checkbox (O3); Q3, Q4 → O5; Q5 → yes (O2); Q6 → label-only (O1); Q7 → 300 dpi (X3) | Recorded so no question stays open | 2026-11-10 |

---

## UI design

Normative visuals: `docs/mockups/shell/` (A01, A02, A03, A08a–c, A15b, A17), with the shell
tokens and icons of app-shell "Visual language" and the editor tokens unchanged. Pixel values are
CSS px at 100 % display scaling; "content" means the page inside the window.

### Copy button (`data-testid="copy"`)

Rendered by app-shell into the editor's `actions` slot (editor change 1): the last control of the
top bar, after Redo.

| Property | Value |
|---|---|
| Place | top bar, vertically centred; 12 px (`--space-4`) after Redo at content width ≥ 1100 px, 8 px (`--space-3`) below; its right edge 12 px from the window's right edge |
| Box, ≥ 1100 px | height 32 (`--topbar-btn`); padding 0 12 0 8; `min-width: var(--copy-min-w)` (84); icon 20 (`--icon-md`) + gap 4 (`--space-2`) + label; content left-aligned so "Copy" → "Copied" does not move the icon |
| Box, < 1100 px | label only, no icon; padding 0 12; `min-width: var(--copy-compact-w)` (56); centred; "Copied" may widen it (R6) |
| Type | label `--type-sm`, weight 600; `border-radius: var(--radius-md)` (6) |
| Rest | `--primary-bg`, text and icon `--primary-fg`; icon `copy`; label "Copy" |
| Hover / pressed | `--primary-hover-bg` / `--primary-pressed-bg` |
| Copied (2 s after a successful copy) | as rest; icon `check` (≥ 1100 px only); label "Copied" |
| Disabled (`aria-disabled="true"`, stays focusable) | `--hover-bg`, text and icon `--text-disabled`. When: the document is empty (tooltip help "Draw something first."); a label or text editor is open ("Press Enter to finish typing first."); a gesture runs (no tooltip change). Read from `controller.canRun({type: 'set-preset'})` and the `busy` event (editor change 2) |
| Focus | `outline: 2px solid var(--accent)`, offset 2 px, `:focus-visible` only |
| Accessible name | `aria-label="Copy (Ctrl+C)"`; the visible label is `aria-hidden`; after a copy the notice is announced by the hint slot (`role="status"`) |
| Tooltip | editor tooltip component: title **Copy**, key `Ctrl+C`, help "Copies the selection, or the whole drawing, to paste into PowerPoint or Word." (disabled: the reason above) |
| Press | a mouse press does not take focus (editor K5); click, Enter or Space runs CB-C1 |
| Tab order | name field → options bar → Undo → Redo → **Copy** → rail |

It is the only filled control in the window.

### Notices (status-bar hint slot, through `controller.notify`; wording exactly as A17)

Info: `--text`, no icon (editor R20). Error: `warning` icon, `--warning`. Expiry as every editor
notice (8 s, the next canvas action, or Esc).

| # | When | Kind | Text |
|---|---|---|---|
| N-C1 | Copied a selection (button, Ctrl+C, Edit, context menu) | info | Copied. Paste into PowerPoint or Word with Ctrl+V. |
| N-C2 | Copied with nothing selected | info | Copied the whole drawing. Paste into PowerPoint or Word with Ctrl+V. |
| N-C3 | Cut | info | Cut. Paste into PowerPoint or Word with Ctrl+V. |
| N-C4 | Ctrl+C or Edit > Copy on an empty drawing (the button is disabled) | info | Nothing to copy yet. Draw something first. |
| N-C5 | Copy of a very large drawing (picture made smaller, R3) | info | Copied. The drawing is very large, so the picture is less sharp than usual. |
| N-C6 | The clipboard write failed | error | Couldn't copy. Please try again. |
| N-P1 | Paste: a picture that is not from Chalkbond | info | Only drawings copied from Chalkbond can be pasted here. |
| N-P2 | Paste: nothing usable | info | Nothing to paste. Copy a drawing, or a compound name, first. |
| N-P3 | Paste: drawing from a newer Chalkbond | error | This drawing was copied from a newer version of Chalkbond and can't be pasted. |
| N-P4 | Paste: damaged drawing | error | The copied drawing is damaged and can't be pasted. Copy it again. |
| N-P5 | Paste: text over 64 KB | info | That text is too long to paste. |
| N-E1 | Export written | info | Exported esterification.png. *(the file's name)* |
| N-E2 | Export of a very large drawing (R3) | info | Exported esterification.png. The drawing is very large, so the picture is less sharp than you chose. |
| N-E3 | Export too large to embed the drawing (payload > `MAX_FILE_BYTES`, or the drawing left out because the carrier would pass `MAX_PICTURE_BYTES`: C9), or a PDF the embedder refused (PDF-A3) | info | Exported esterification.png. It is too large to open again in Chalkbond, so keep the .chalk file. |

Text that is not a compound name or SMILES gets the editor's own N2 / N3 notices. When a copy is
both N-C2 and N-C5, N-C5 is shown. A notice is the only feedback for an export; a failed export
write is a native error box (app-shell F14 "Couldn't save …").

### Export dialog (`data-testid="export-dialog"`; mock-ups A08a PNG, A08b SVG, A08c PDF)

Opened by File > Export… and Ctrl+E (app-shell), only when the document is non-empty and the
editor is idle. App-shell dialog shell: width `--dialog-w-sm` (400), top edge `--dialog-top` (96)
below the content top, centred horizontally, padding 24, `--shadow-dialog`, over `--scrim`.

| Element (top to bottom) | Rule |
|---|---|
| Title | "Export drawing", `--type-title`, `id` used by `aria-labelledby` |
| "Format" | label `--type-sm` 600, 16 px below the title; then a radio group (`role="radiogroup"`, `aria-label="Format"`), three radio cards (app-shell primitive), 4 px apart, one tab stop, ↑/↓ move and select, Home / End: **PNG picture** "For WhatsApp, websites and printing." · **SVG drawing** "Stays sharp at any size in PowerPoint and Word." · **PDF document** "For printing or sending as a document." Default: the remembered format (`export.format`), first run PNG. Test ids `export-format-png`, `-svg`, `-pdf` |
| "Size" (PNG only) | label above (like "Format"), 16 px below the cards; segmented control (`role="radiogroup"`, `aria-label="Picture size"`), 32 high (`--control-h`), segments min-width 76, outline and dividers 1 px `--border-control`: **Screen** (150 dpi) · **Print** (300 dpi, default) · **Poster** (600 dpi); remembered (`export.pngDpi`). Test ids `export-size-screen`, `-print`, `-poster` |
| Size line (PNG only) | 4 px below, `--type-xs`, `--text-muted`, live (`data-testid="export-size-line"`): Screen "For messages and websites. `W` × `H` pixels." · Print "Sharp on paper. `W` × `H` pixels." · Poster "For large prints. `W` × `H` pixels." with `W`, `H` from `pngPixelSize` grouped by `groupDigits` (A08a: "Sharp on paper. 2,984 × 362 pixels."). When reduced: "… `W` × `H` pixels (less sharp: the drawing is very large)." No "dpi" anywhere on screen |
| White background (PNG only) | 16 px below (`--space-5`, as `shell.css` `.export-white`); checkbox primitive (`data-testid="export-white"`), label "White background", help "Leave this off for slides with a coloured background."; unchecked = transparent (`SPEC.md` SC5); remembered (`export.pngWhite`) |
| Reopen line | 16 px below the last control; 16 px `info` icon + `--type-xs` text (`data-testid="export-reopen"`). PNG, SVG (and PDF under PDF-A): "You can open this file in Chalkbond again to change the drawing." in `--text-muted`. PDF under PDF-B: "PDF files can't be opened in Chalkbond again. Keep the drawing as a .chalk file too." in `--text` |
| Buttons | 24 px below, right-aligned, 8 px apart: **Cancel** (secondary) closes with no effect; **Save…** (primary, `data-testid="export-save"`) stores the choices (`settings:set`), closes the dialog and runs EX2. Enter anywhere = Save…; Esc and a click on the scrim = Cancel |
| Focus | opens with focus on the selected format card (keyboard focus ring, A08a); focus returns to the element focused before (normally the canvas) |
| Accessibility | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` the title; focus trapped |

Switching format hides or shows the PNG block; the top edge stays put. The dialog never mentions
selection: Export is the whole drawing.

Short windows (approved 2026-11-11): at the minimum 960 × 640 content the top edge stays at
`--dialog-top` (96) and `--dialog-bottom` (32) stays free below the box; when the PNG body needs
more room it scrolls inside the shell (the body has a 4 px gutter so focus rings are not clipped)
and the footer buttons stay visible. No token, control size or the top edge changes.

The drawing's size (pt) for the size line is measured once per document with one unembedded
`exportSvg(doc, null, { embed: false })` when the dialog opens (cached while the document is the
same); a format, size or background change is `pngPixelSize` arithmetic only.

### Left out (deliberately)

| Left out | Why |
|---|---|
| A format choice on copy | O2: the teacher never meets the word "format" to paste |
| Copy resolution, margin or background settings | One good default (X3); Export has the two options that matter |
| Export of the selection | Copy handles parts; one fewer question |
| PDF page size, margins, orientation | The page is the drawing (PD1); A4 layout is Word's job |
| JPEG, EMF, TIFF, GIF | PNG and SVG cover Office, the web and messaging apps |
| "Open folder" after export | The teacher chose the folder seconds ago |
| Copy controls elsewhere (status bar, floating) | One place, always visible |

---

## Architecture

### Where the code lives

```
src/core/clipboard-export/          pure (no DOM, no Node, no Electron); ≥ 90 % lines
  index.ts                          public entry (named exports only)
  payload.ts                        drawingPayload, pictureSelection, pictureDoc
  picture.ts                        exportSvg, pngPixelSize, RASTER_LIMITS, groupDigits
  png-chunks.ts                     crc32, withPictureChunks, readPngDrawing
  svg-embed.ts                      readSvgDrawing
  pdf-embed.ts                      withPdfDrawing, readPdfDrawing (rule PDF-A; removed under PDF-B)
  drawing-file.ts                   fileKindOf, extractDrawing (used by app-shell's Open)
  paste.ts                          pasteAction
  names.ts                          exportFileName
  __fixtures__/chromium-45.pdf      real printToPDF output captured by task C4
src/renderer/clipboard-export/
  model/copy-flow.ts                copy and paste flows over injected ports (DOM-free, ≥ 90 %)
  model/export-flow.ts              Export dialog state and the export flow over injected ports
  rasterise.ts                      SVG → PNG bytes in a <canvas> (e2e-tested)
  CopyButton.tsx  ExportDialog.tsx  clipboard-export.css
src/main/clipboard-export/          Electron main
  formats.ts                        the clipboard keys chosen by probe C3
  clipboard.ts                      C1 / C2
  pdf.ts                            C5 (hidden window, printToPDF)
e2e/win/clipboard-*.spec.ts         Windows-only (clipboard); ignored elsewhere (app-shell TH6)
e2e/export-*.spec.ts  e2e/pdf-facts.spec.ts  e2e/win/clipboard-facts.spec.ts
```

`src/core/clipboard-export` imports only `@core/doc-model` and `@core/svg-render` (already in
`CORE_DEPS`). `src/renderer/clipboard-export/model/**` is in the DOM-free lint block (app-shell
A1). The main process imports no core module.

### Public surface (`src/core/clipboard-export/index.ts`)

```ts
import type { Doc, Selection, SubDoc } from '@core/doc-model';
import type { SvgDocument } from '@core/svg-render';

// payload (E1)
drawingPayload(doc: Doc): string
    // serialize(doc) re-printed without indentation, every char ≥ U+007F as \uXXXX (surrogate
    // pairs as two escapes): printable-ASCII JSON that parse() accepts, deep-equal round trip
pictureSelection(doc: Doc, selection: Selection): Selection
    // selection ∪ texts whose attachedTo.arrow is a selected arrow (what extract brings)
pictureDoc(doc: Doc, selection: Selection | null): Doc
    // null → doc; else setStyle(insert(emptyDoc(doc.meta.created), extract(doc, sel), {x:0, y:0})[0],
    // {preset: doc.style.preset, overrides: doc.style.overrides}) with meta.created/modified copied;
    // reads no clock

// picture (PI1–PI4)
exportSvg(doc: Doc, selection: Selection | null, opts?: { embed?: boolean }): SvgDocument
    // renderSvg(doc, { only: sel && pictureSelection(doc, sel), padding: 0,
    //   metadata: embed !== false && payload.length <= MAX_FILE_BYTES ? payload : undefined })
    // payload = drawingPayload(pictureDoc(doc, sel)); one renderSvg call. C9: if the metadata was
    // added and the SVG is over MAX_PICTURE_BYTES UTF-8 bytes, its <metadata id="chalkbond"> line
    // is removed again (the result is then exactly the embed: false SVG)
MAX_PICTURE_BYTES = 64 * 1024 * 1024                                     // C9: picture carriers
RASTER_LIMITS: { readonly maxSide: 10000; readonly maxPixels: 50_000_000 }
pngPixelSize(widthPt: number, heightPt: number, dpi: number):
    { width: number; height: number; dpi: number; reduced: boolean }      // R3
groupDigits(n: number): string                                           // 2984 → "2,984" (R7)

// PNG (E2)
crc32(bytes: Uint8Array): number
withPictureChunks(png: Uint8Array, opts: { dpi: number; payload: string | null }): Uint8Array
readPngDrawing(png: Uint8Array): string | null

// SVG (E3)
readSvgDrawing(svgText: string): string | null

// PDF (PDF-A; deleted with its tests under PDF-B)
withPdfDrawing(pdf: Uint8Array, payload: string):
    { ok: true; pdf: Uint8Array } | { ok: false; reason: 'xref-stream' | 'encrypted' | 'unrecognised' }
readPdfDrawing(pdf: Uint8Array): string | null

// opening (E4; app-shell Open)
type DrawingFileKind = 'chalk' | 'png' | 'svg' | 'pdf';                 // 'pdf' only under PDF-A
fileKindOf(name: string): DrawingFileKind | null                        // by extension, any case
extractDrawing(kind: DrawingFileKind, bytes: Uint8Array, decodeUtf8: (b: Uint8Array) => string | null):
    { ok: true; text: string } | { ok: false; problem: 'no-drawing' | 'damaged' | 'too-large' }

// paste (CB-P1)
type ClipboardContents = { drawing: string | null; text: string | null; textTooLong: boolean; image: boolean };
type PasteAction =
  | { kind: 'in-app' }                                   // controller.run('paste')
  | { kind: 'fragment'; sub: SubDoc }                    // controller.run({type: 'paste-sub', sub})
  | { kind: 'text'; text: string }                       // controller.run({type: 'insert-text', text})
  | { kind: 'notice'; notice: 'picture-only' | 'empty' | 'newer' | 'damaged' | 'text-too-long' };
pasteAction(clip: ClipboardContents, lastEditorCopy: string | null, inAppReady: boolean): PasteAction

// names
exportFileName(baseName: string | null, format: 'png' | 'svg' | 'pdf'): string
    // null → 'Untitled.<format>'; strips one .chalk/.png/.svg/.pdf ending (any case); replaces
    // <>:"/\|?* and U+0000–U+001F with '-'; trims dots and spaces; stem capped at 120 chars;
    // an empty stem becomes 'Untitled'; then '.<format>'
```

`decodeUtf8` is injected because `src/core` has no `TextDecoder` type; the renderer passes
`(b) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(b) } catch { return null } }`.

### IPC channels used (schemas in `src/main/ipc-schemas.ts`, names in `src/shared/channels.ts`)

App-shell rules SEC5–SEC8 apply to each (named preload function, Zod validation in main, sender
check, size limits). Request limits are enforced by the schema.

| Ch. | Channel / preload function | Request | Response | Main does |
|---|---|---|---|---|
| C1 | `clipboard:write` / `clipboardWrite` | `{ png: Uint8Array ≤ 64 MB, starts with the PNG signature; svg: string ≤ 64 MiB of UTF-8 (C9), starts with "<svg"; drawing: string | null (null only when the editable payload was omitted: over MAX_FILE_BYTES, or its metadata over the C9 carrier cap); non-null: ≤ 20 MB, /^\{[\x20-\x7E]*$/ }` | `{ ok: boolean }` | CB-W1 |
| C2 | `clipboard:read` / `clipboardRead` | `{}` | `ClipboardContents` | CB-R1 |
| C3 | `file:choose-save` / `chooseSave` | `{ format: 'chalk' \| 'png' \| 'svg' \| 'pdf', suggestedName: string ≤ 255 }` | `FileRef \| null` | app-shell F8 |
| C4 | `file:write` / `writeFile` | `{ ref: uuid, data: Uint8Array ≤ 64 MB }` | `{ ok: true } \| { ok: false, problem: WriteProblem }` | app-shell F9, SEC8 |
| C5 | `pdf:print` / `printPdf` | `{ svg: string ≤ 64 MiB of actual UTF-8 (C9; approved 2026-11-11, built by C12) starting "<svg"; widthPt, heightPt: finite, > 0, ≤ 14 400 }` | `{ ok: true, pdf: Uint8Array } \| { ok: false }` | PD1 |

### Rasterising (renderer, `rasterise.ts`)

- **R1** `rasterise(svg: SvgDocument, dpi: number, white: boolean): Promise<{ png: Uint8Array;
  dpi: number; reduced: boolean }>`: `size = pngPixelSize(svg.width, svg.height, dpi)`; the root
  `<svg>` tag's `width` / `height` attributes are rewritten to `${size.width}px` /
  `${size.height}px` (viewBox unchanged, so Chromium rasterises the vector at the target size);
  the text is loaded as an `Image` from `URL.createObjectURL(new Blob([text], { type:
  'image/svg+xml' }))`, `await img.decode()`; drawn on a `<canvas>` of that size, after a
  `#ffffff` fill when `white`; `canvas.toBlob(…, 'image/png')`; the object URL is revoked in a
  `finally`; then `withPictureChunksCapped(bytes, { dpi: size.dpi, payload })` (C9: as
  `withPictureChunks`, but when the result with a payload is over `MAX_PICTURE_BYTES` it is rebuilt
  from the canvas bytes with `payload: null`, `pHYs` kept; a PNG over the cap even then is returned
  as it is and the write refuses it). The return shape is unchanged: a caller that must know whether
  the drawing is inside reads the PNG back with `readPngDrawing` (export N-E3). `toBlob` stays.
- **R2** Fonts: an SVG image uses installed system fonts: Arial on Windows, Liberation Sans on
  Linux, the faces svg-render's metrics are calibrated against. No font is bundled or loaded.
- **R3** `pngPixelSize`: `px = pt × dpi / 72` per side, `Math.ceil`, at least 1. If a side would
  exceed `maxSide` or the area `maxPixels`, `dpi` becomes the largest whole number that fits both
  and `reduced` is true. If no positive integer fits, use Decision O7’s positive fractional fallback. Example: 800 × 200 pt at 300 dpi = 3334 × 834 px.
- **R4** PNG pixels are not asserted byte-identical across machines. Asserted instead: dimensions
  exactly as R3; `pHYs` and `tEXt` byte-exact; the four corner pixels alpha 0 (or `#ffffff`
  opaque with White background); for the toluene golden input the box of pixels with alpha > 0
  lies within 2 px of every edge; a Slides bond is ≥ 6 opaque pixels across at 300 dpi.

### Embedding

- **E1** Payload = `drawingPayload(pictureDoc(doc, selection))`. Limit `MAX_FILE_BYTES` (what
  `parse` accepts); the carrier holding it is limited to `MAX_PICTURE_BYTES` (64 MiB, Decision C9:
  SVG by its UTF-8 bytes, PNG and PDF by the final file's bytes). Over either limit the picture is
  written without the drawing (N-E3; a copy omits the
  drawing entry and shows N-C1/N-C2 as usual). Recognition is the envelope itself, checked by
  `parse`.
- **E2** PNG: `withPictureChunks` walks the chunk list (signature; length, type, data, CRC; a bad
  signature, a length past the end or a bad CRC throws `PngError`), removes any `pHYs` and any
  `tEXt` with keyword `chalkbond`, inserts `pHYs` (pixels per metre `Math.round(dpi / 0.0254)`
  on both axes, unit 1) and `tEXt` (`chalkbond`, NUL, payload as bytes) directly after `IHDR`.
  `readPngDrawing` returns the first `tEXt` with keyword `chalkbond` anywhere in the file, else
  null; it never throws, never decompresses anything (no `zTXt`, `iTXt`, `IDAT` inflation) and
  never reads past the buffer.
- **E3** SVG: the payload is svg-render's `metadata`. `readSvgDrawing` scans the string for the
  first `<metadata …id="chalkbond"…>…</metadata>` (other attributes before or after `id`, single
  or double quotes), takes the text between, unescapes `&amp; &lt; &gt; &quot; &apos;` and
  decimal / hex character references, and returns it; anything else → null. The SVG is never
  parsed into a DOM, rendered or loaded as a document.
- **E4** `extractDrawing(kind, bytes)`: `chalk` over `MAX_FILE_BYTES`, or a picture (`png`, `svg`,
  `pdf`) over `MAX_PICTURE_BYTES` (C9) → `too-large`. `chalk`: UTF-8 decode
  (strip one BOM); a decode failure → `damaged`. `png`: no PNG signature → `damaged`; no chunk →
  `no-drawing`. `svg`: UTF-8 decode (failure → `damaged`); no metadata → `no-drawing`. `pdf`
  (PDF-A only): no `%PDF-` → `damaged`; `readPdfDrawing` null → `no-drawing`. The text then goes
  through doc-model `parse` in the caller (app-shell F3), whose codes map to app-shell F14; so the
  drawing found inside a picture of up to 64 MiB is still held to `parse`'s 20 MiB (`too-large`).
- **E5** The clipboard drawing entry carries the same payload.

### Picture rules

- **PI1** What is pictured: Copy → the selection if non-empty, else the whole document (O2).
  Export → the whole document. An empty document is never pictured (controls disabled; N-C4 for
  the shortcut).
- **PI2** `pictureSelection` adds the texts attached to selected arrows, so the picture shows
  exactly what `extract`, and so a paste, contains.
- **PI3** Margins: `padding: 0` everywhere (ink-tight; text boxes keep svg-render's bounded
  slack). Background: clipboard transparent; Export PNG transparent unless White background; SVG
  transparent; PDF page white (paper).
- **PI4** Size: the SVG says `width="Wpt" height="Hpt"`; the PNG's `pHYs` says its dpi.

### Clipboard rules (main `clipboard.ts`, renderer `copy-flow.ts`)

- **CB-W1** Write (C1), after validation, one call `clipboard.write([new ClipboardItem(entries)])`
  with the entries below (omit the drawing entry when C1 drawing is null). `formats.ts` holds the key actually used for each, chosen by probe C3
  and recorded in "Facts relied on"; no text format is ever written. A rejected write → `{ ok:
  false }` and a log line (app-shell LG1).

  | Entry | Preferred key | Fallback (used when the probe rejects the preferred key) |
  |---|---|---|
  | bitmap | `image/png`: `Blob([png], {type: 'image/png'})` | none: required. If P1 rejects it, stop and ask the orchestrator |
  | exact PNG (keeps `pHYs`) | `electron application/osclipboard;format="PNG"`: `Blob([png])` | omitted; the checklist records Office's size |
  | SVG (UTF-8) | `electron application/osclipboard;format="image/svg+xml"`: `Blob([svg])` | `image/svg+xml` (Chromium's own SVG entry); if also rejected, omitted |
  | drawing (ASCII) | `electron application/osclipboard;format="application/x-chalkbond"`: `Blob([drawing])` | `web application/x-chalkbond` (Chromium web custom format) |

- **CB-R1** Read (C2): `items = await clipboard.read()`; `drawing` = the drawing entry's text
  (key from `formats.ts`) if present and ≤ `MAX_FILE_BYTES` bytes, else null; `text` =
  `await clipboard.readText()` if non-empty and ≤ 65 536 characters, else null, `textTooLong`
  true when longer; `image` = `has('image/png')` or any `image/*` type in `items[0].types`. Never
  throws: any error → all null / false and a log line.
- **CB-C1** Copy (renderer): document empty → N-C4. Selection non-empty → `controller.run('copy')`;
  the editor calls `onCopy(sub, doc, selection)` → `copyPicture(doc, selection, 'selection')`.
  Selection empty → `copyPicture(doc, null, 'all')` without touching the editor.
- **CB-C2** `copyPicture(doc, sel, what)`: `svg = exportSvg(doc, sel)`; `png = rasterise(svg,
  300, false)`; payload computed once and reused for the SVG metadata and the drawing entry; C1.
  Success: the Copy button shows "Copied" for 2 s (a new copy restarts the 2 s); notice N-C1 /
  N-C2 / N-C3 (N-C5 if reduced); `lastEditorCopy = payload` when the copy came through `onCopy`,
  else null. Failure: N-C6, `lastEditorCopy` unchanged. Provenance (Decision C8): each `onCopy`
  call increments the editor-copy generation synchronously, before its picture job is queued; a
  successful selection or cut write records the generation of its own `onCopy` beside
  `lastEditorCopy`.
- **CB-C3** Cut: `controller.run('cut')`; `onCopy` receives the document before the cut, so the
  picture shows what was removed; N-C3.
- **CB-Q** Clipboard jobs (copy, cut, paste) run one at a time in order (a promise queue in
  `copy-flow.ts`): a paste pressed while a copy is rasterising waits and then reads the new
  clipboard.
- **CB-P1** Paste (renderer, editor idle): C2, then `pasteAction(clip, lastEditorCopy,
  inAppReady)` with `inAppReady = controller.canRun('paste')` and, checked after the awaited read,
  the generation recorded with `lastEditorCopy` equal to the current editor-copy generation
  (Decision C8: the editor's in-app clipboard still holds what the system clipboard holds):
  1. `drawing` non-null: `parse(drawing)`: `newer-version` → `newer` (N-P3); other failure →
     `damaged` (N-P4); ok, `drawing === lastEditorCopy` and `inAppReady` → `in-app` (editor CB1
     cascade, +1 BLU right and down); otherwise `fragment` with `extract(doc, everything(doc))`
     (at the pointer, else the canvas centre; selected; tool Select: editor CB1).
  2. else `textTooLong` → `text-too-long` (N-P5); else `text` → `text` (editor N2/N3 decide).
  3. else `image` → `picture-only` (N-P1); else `empty` (N-P2).
- **CB-P2** A drawing copied in another session, or before a restart, pastes as a fragment by
  CB-P1.1 (probe P5: a value written by one launch is read by the next).
- **CB-K** Keys (app-shell host keys K1): Ctrl+V on a non-text target runs CB-P1 (the editor's
  own Ctrl+V is never reached); Ctrl+C on a non-text target with an empty selection runs CB-C1's
  whole-drawing branch; Ctrl+C with a selection and Ctrl+X are left to the editor, which calls
  `onCopy`. In a text target none of these is handled here (R4).

### Export rules (renderer `export-flow.ts`)

- **EX1** Export… opens the dialog with the remembered choices (app-shell `RendererSettings`).
- **EX2** Save… → `settings:set { export }` (remembered even if the Save dialog is then cancelled),
  the dialog closes, then C3 with `format` and `suggestedName = exportFileName(session name,
  format)` (an Untitled session passes null); cancel in the native dialog → nothing, no notice.
  Cancel, Esc and the scrim remember nothing. Ctrl+E is ignored from Save… until the export ends.
- **EX3** PNG: `rasterise(exportSvg(doc, null), dpi, white)` → C4. SVG: UTF-8 bytes of
  `exportSvg(doc, null).svg`, no BOM → C4. PDF: `exportSvg(doc, null, { embed: false })` → C5,
  then PDF-A2 or PDF-B1 → C4.
- **EX4** Then N-E1 (N-E2 / N-E3 variants), or app-shell's error box for a failed write. Export
  never changes the document, the dirty state, the session's file or the recovery file.
  C9 obligations (C11, C12): N-E3 is chosen from the bytes actually written, never assumed: PNG
  `readPngDrawing(png) === null`, SVG `readSvgDrawing(svg) === null`, PDF the embedded file over
  `MAX_PICTURE_BYTES` (then the printed PDF is written unembedded) or not embedded. Only a picture
  written with its drawing (and at most 64 MiB) may be described as opening again in Chalkbond; the
  Export dialog's reopen line keeps its approved wording.
- **EX5** The exported SVG is byte-identical to `exportSvg(doc, null).svg`.

### PDF (main `pdf.ts`, rule PD1) and embedding (rule PDF-A or PDF-B)

- **PD1** C5: write `page.html` into `mkdtemp(join(app.getPath('temp'), 'chalkbond-pdf-'))`:

  ```html
  <!doctype html><meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <style>@page{size:{W}pt {H}pt;margin:0}html,body{margin:0}svg{display:block}</style>{svg}
  ```

  open `new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation:
  true, nodeIntegration: false, javascript: false } })` (no preload; app-shell SEC2 applies),
  `loadFile`, `printToPDF({ pageSize: { width: W / 72, height: H / 72 }, margins: { top: 0,
  bottom: 0, left: 0, right: 0 }, preferCSSPageSize: true, printBackground: false })`; destroy the
  window and remove the folder in a `finally`; return the bytes (must start with `%PDF-`).
- **PD2** One page exactly the drawing's size; text is real PDF text with Arial embedded as a
  subset; lines are vectors. Checked in e2e: starts with `%PDF-`; exactly one `/Type /Page`
  object; its `/MediaBox` is `[0 0 W H]` within 1 pt; contains `/FontFile2`; no `/Subtype
  /Image`. A 20 × 20 pt page (a lone "O") is accepted (probe P9).

**Outcome A (probe C4 passes): PDF keeps the drawing.**

- **PDF-A1** `withPdfDrawing(pdf, payload)` appends one standard incremental update (ISO 32000-1
  §7.5.6) and never changes a byte of the original (memory: Decision C10; the original is copied
  once, never decoded to text): (1) find the last `startxref` in the final
  1024 bytes, its offset `X`, and `%%EOF` after it; (2) at `X` require the keyword `xref` (a
  classic table); an indirect object with `/Type /XRef` there → `xref-stream`; anything else →
  `unrecognised`; (3) read the subsections up to `trailer` and the trailer dictionary shallowly:
  `/Size n`, `/Root a b R`, optional `/Info c d R` and `/ID [<…><…>]`; `/Encrypt` → `encrypted`;
  (4) append, after an EOL if the file does not end with one: object `n 0 obj` `<< /Type
  /EmbeddedFile /Subtype /application#2Fx-chalkbond /Length L >>` `stream` LF payload LF
  `endstream` `endobj`; then `xref` LF `n 1` LF one 20-byte entry `oooooooooo 00000 n` + space +
  LF; then `trailer` `<< /Size n+1 /Root a b R [/Info c d R] [/ID …] /Prev X /ChalkbondDrawing n 0
  R >>` `startxref` LF its offset LF `%%EOF` LF.
- **PDF-A2** Export PDF: `withPdfDrawing(printed, payload)`; `ok` and at most `MAX_PICTURE_BYTES`
  (C9) → write it; not ok, the payload over `MAX_FILE_BYTES`, or the embedded PDF over
  `MAX_PICTURE_BYTES` → write the printed PDF unchanged and show N-E3 (logged).
- **PDF-A3** `readPdfDrawing(pdf)`: last `startxref` → classic table → trailer `/ChalkbondDrawing
  n 0 R` → that section's offset for `n` → `n 0 obj` → direct integer `/Length L` → `stream`,
  EOL, `L` bytes, then `endstream`; returns the bytes as ASCII text, else null. Every offset is
  bounds-checked; it never throws, never inflates a stream and walks no object graph. It decodes
  only the tail, the trailer dictionary, the table lines and the payload (in bounded chunks), never
  the whole file or another stream (Decision C10); a near-64 MiB PDF runs under the unit timeout
  (`tests/clipboard-export/pdf-embed.large.test.ts`, no injected cap).
- **PDF-A4** `fileKindOf` accepts `.pdf`; app-shell's Open filter and drop list include `.pdf`;
  the Export dialog's PDF reopen line is the PNG one.


### Security (module rules; app-shell SEC1–SEC12 also apply)

| # | Rule | Test |
|---|---|---|
| CS1 | C1 rejects a payload that fails its schema (size, PNG signature, `<svg` start, ASCII drawing) | handler unit test with a fake event, one case per field |
| CS2 | C2 never returns more than `MAX_FILE_BYTES` of drawing or 65 536 characters of text, whatever the clipboard holds | unit test of `clipboard.ts` with a stubbed `clipboard` |
| CS3 | `readPngDrawing`, `readSvgDrawing`, `readPdfDrawing`, `extractDrawing` never throw, never read outside the buffer, never decompress, never execute or fetch anything | property tests on arbitrary bytes and on truncations of valid files |
| CS4 | An opened SVG is a string to scan; it is never put in an `<img>`, `innerHTML`, a `Blob` URL or a window | lint-free code review plus the open e2e (the SEC4 request counter stays 0 after opening an SVG whose `<image href="http://…">` would fetch) |
| CS5 | Pasted drawings, opened files and embedded payloads reach the document only through doc-model `parse` | unit tests of `pasteAction` / `extractDrawing` with damaged and newer payloads |
| CS6 | The PDF window runs no script (`javascript: false`), has no preload, loads only its temp file and is destroyed with its folder even when printing fails | e2e: the temp folder is gone after a forced failure (stubbed `printToPDF` rejecting) |

---

## Required changes to finished modules

Each is a task (`SPEC-editor.md` first, then code) before the code that needs it.

| # | Target | Change | Spec edit (`SPEC-editor.md`) |
|---|---|---|---|
| 1 | `editor` | `Editor` takes an optional prop `actions?: React.ReactNode`, rendered as the last child of the top bar, after Redo, in a wrapper (`data-testid="topbar-actions"`) 12 px after Redo (8 px when the content is narrower than 1100 px). When `actions` is given and the content is narrower than 1100 px, the name field is `var(--namefield-compact)` (204 px) wide. Undo/Redo keep 4 px between them; the actions end 12 px from the right edge. Tab order: name field → options bar → Undo → Redo → actions → rail. Without `actions` nothing changes (the editor layout e2e stays valid) | "Layout" Top bar row: after "Undo and Redo (…)" add "; then the host's `actions` (app-shell: the Copy button), 12 px after Redo, 8 px below 1100 px content width, when the name field becomes `--namefield-compact` (204 px, a shell token)". "Seam to the host": `export { Editor } … // <Editor controller={c} actions={node?} />`. K4: "… → Undo → Redo → host actions → rail". Decisions: add the next free R-row (R43 at the time of writing) "Host actions slot after Redo (clipboard-export O1)" |
| 2 | `editor` | `EditorController.notify(kind: 'info' \| 'error', text: string): void` dispatches `notice-show` (same slot, expiry and announcement as editor notices). `EditorEvent` gains `{ type: 'busy' }`, emitted whenever `canRun({type: 'set-preset'})` changes value (a gesture starts or ends, a label or text editor opens or closes) | "Seam to the host": add `notify(kind: 'info' \| 'error', text: string): void; // host notice in the hint slot (Notices and errors)` to `EditorController`, and `'busy'` to the `EditorEvent` kinds with "// idle state changed; idle = canRun({type: 'set-preset'})". Decisions: next free R-row "Host notices and a busy event (clipboard-export)" |
| — | `doc-model`, `svg-render`, `chem-core` | None | — |

Editor changes 3 (right-click selection) and 4 (host-callable name-field focus) and the test hook
are app-shell's (`SPEC-app-shell.md`).

## Dependencies

**None new.** Electron 45.2.3 (`clipboard`, `ClipboardItem`, `printToPDF`), Chromium's `<canvas>`
and `Image`, Zod 4.6.7, doc-model, svg-render.

## Testing

| Level | What | Where |
|---|---|---|
| Unit (node) | `drawingPayload` (ASCII only; `parse` round trip deep-equal; Devanagari and an emoji survive as escapes); `pictureSelection`, `pictureDoc` (style copied, geometry equals `extract`, no clock); `exportSvg` (equals `renderSvg` with the payload; `embed: false` has no `<metadata>`; over-limit payload omitted); `pngPixelSize` (rounding, 1 px minimum, both caps, `reduced`); `groupDigits`; `crc32` (`"IEND"` → `0xAE426082`); `withPictureChunks` (order `IHDR pHYs tEXt …`; replaces old ones; bad CRC throws); `readPngDrawing` / `readSvgDrawing` (round trips; attribute order, quote and entity variants; truncated and garbage input → null); `withPdfDrawing` / `readPdfDrawing` on `__fixtures__/chromium-45.pdf` (original bytes are a prefix of the result; every xref offset in the new section points at `n 0 obj`; `/Prev` = old `startxref`; refusal cases built by editing the fixture: xref stream, `/Encrypt`, missing `%%EOF`); `extractDrawing` (every problem code, BOM); `pasteAction` (every branch); `exportFileName` (reserved characters, empty, long, existing extension) | `src/core/clipboard-export/*.test.ts` |
| Property (fast-check) | for docs from doc-model's `arbitraries.ts`: `parse(drawingPayload(d))` deep-equals `d`; `readSvgDrawing(exportSvg(d, null).svg)` = the payload; `readPngDrawing(withPictureChunks(minimalPng, …))` = the payload; `readPdfDrawing(withPdfDrawing(fixture, p).pdf)` = `p`; arbitrary bytes and truncations to every reader never throw (CS3) | `*.prop.test.ts` |
| Flow (node) | `copy-flow`, `export-flow` with fake ports: selection vs whole drawing, `lastEditorCopy` bookkeeping, CB-Q order, notices, button state and its 2 s timer (injected clock), cancel paths, settings stored on Save…, PDF-A2 fallback | `src/renderer/clipboard-export/model/*.test.ts` |
| Handler (node) | C1, C2, C5 handlers with a fake `IpcMainInvokeEvent` and a stubbed `clipboard` (CS1, CS2) | `src/main/clipboard-export/*.test.ts` |
| View markup (node) | `CopyButton`, `ExportDialog` via `renderToStaticMarkup`: names, roles, `aria-disabled`, `aria-checked`, test ids, PNG block per format, reopen line per format and outcome | `*.test.tsx` |
| Probe (Electron) | C3 (Windows): P1 preferred entries accepted together; P2 `has` true for each; P2b the Windows format list contains `PNG`, `image/svg+xml` and the drawing format, and no `UnicodeText`/`Text`; P3 `read` + `getType` return exact bytes; P4 `image/png` alone vs with raw `PNG`; P5 a value written by one launch is read by the next; P6 no text after CB-W1 (`has('text/plain')` false, `readText()` empty); P7 each fallback key works. C4 (all platforms): P8 Chromium's printToPDF writes a classic xref table; the updated PDF renders in Chromium's PDF viewer identically to the original; P9 a 20 × 20 pt page | `e2e/win/clipboard-facts.spec.ts`, `e2e/pdf-facts.spec.ts` |
| E2E (built app) | rule-by-rule in the success criteria below | `e2e/win/clipboard-*.spec.ts`, `e2e/export-*.spec.ts` |
| Shots | named per task in `tasks/todo-clipboard-export.md`, compared with A01, A02, A08a–c, A15b, A17 | `e2e/shots/C<n>.shot.ts` |
| Manual (Windows, Office 2021) | "Windows checks" | `docs/windows-checklist.md` |

Coverage: `src/core/clipboard-export/**` ≥ 90 % lines; `src/renderer/clipboard-export/model/**`
≥ 90 % lines (thresholds in `vitest.config.mts`, no file excluded); main glue, `rasterise.ts` and
views by e2e.

## Windows checks (for `docs/windows-checklist.md`, section "Clipboard and export")

Human-only: Office, other applications, eyes. Run with the installed app and Office 2021.

- [ ] Draw the SC3 scheme (Slides), press Copy, Ctrl+V on a blank PowerPoint slide: it arrives as a drawing (ribbon **Graphics Format** = SVG) or a picture (**Picture Format**); write down which. At 400 % zoom lines and text are sharp.
- [ ] The pasted bonds measure 1.41 cm (40 pt) in PowerPoint (Format > Size against a known bond count); labels match 24 pt slide text. If Office took the PNG and it is about 3× too big, write down "300 dpi ignored" (accepted for v1, O5).
- [ ] On a dark slide background the pasted drawing has no white or black box.
- [ ] Switch to Handout, copy, paste into Word 2021: bonds about 5 mm, labels the size of 10 pt body text; sharp at 400 %; the print preview looks like a textbook figure.
- [ ] `H₂SO₄`, `OH`, `CO₂H` in the pasted drawing are Arial and sit as on screen in PowerPoint and Word (a shift would reopen svg-render's text-as-outlines question).
- [ ] Paste into WhatsApp Desktop (or another chat app) and Paint: a picture arrives.
- [ ] Copy in Chalkbond, close Chalkbond, start it, Ctrl+V: the drawing comes back editable.
- [ ] Copy a picture in PowerPoint, Ctrl+V in Chalkbond: "Only drawings copied from Chalkbond can be pasted here."
- [ ] Export PNG at Print: the Photos app shows it (transparent with White background off); Insert > Pictures in Word gives the same size as the pasted SVG within a few percent.
- [ ] Export SVG, Insert > Pictures in PowerPoint: identical to the paste.
- [ ] Export PDF, open it in Edge and in Adobe Acrobat Reader: one page the size of the drawing, text selectable, no error or repair prompt; print it on A4: sharp. (Under PDF-A also: open it in Chalkbond, the drawing is editable.)
- [ ] Open the exported PNG and SVG in Chalkbond (File > Open): editable and identical.

## Success criteria

Each names the test or check that proves it.

1. Every function in "Public surface" exists with unit and property tests; `src/core/clipboard-export`
   and `src/renderer/clipboard-export/model` ≥ 90 % lines (`npm test -- --coverage` thresholds);
   `npm run check` green.
2. Probes P1–P9 pass or their fallback is recorded in "Facts relied on" and `formats.ts`, in the
   probe task's commit (C3, C4).
3. After the Copy button with nothing selected, the Windows clipboard lists the CB-W1 formats and
   no text format (P2b check inside `e2e/win/clipboard-copy.spec.ts`); the SVG entry equals
   `exportSvg(doc, null).svg`; the drawing entry parses to a document whose `serialize` equals
   `serialize(doc)`; the PNG entry is `ceil(W·300/72) × ceil(H·300/72)` with `pHYs` 11811 px/m.
4. Copy of a selection: the drawing entry equals `drawingPayload(pictureDoc(doc, selection))`
   (unit + `clipboard-copy.spec.ts`).
5. Round trip in the app: copy a selection then Ctrl+V pastes at source + (1, 1) BLU; a drawing
   written to the clipboard from main (as another session) pastes as a fragment at the canvas
   centre; the text "ethanol" inserts ethanol; an image-only clipboard shows N-P1; a newer-version
   drawing shows N-P3 (`e2e/win/clipboard-paste.spec.ts`).
6. A paste pressed during a copy reads the new clipboard (flow test of CB-Q).
7. Export PNG at Print of the toluene golden input: size per R3, `pHYs` 11811, R4 holds; opening it
   through File > Open gives a document whose `serialize` equals the original's
   (`e2e/export-png.spec.ts`).
8. Export SVG bytes equal `exportSvg(doc, null).svg`; opening it gives an equal document
   (`e2e/export-svg.spec.ts`).
9. Export PDF passes PD2; under PDF-A, opening it gives an equal document and it renders in
   Chromium's viewer identically to the unembedded print (`e2e/export-pdf.spec.ts`).
10. Copy button and Export dialog: states, names, tab position, keyboard rules (↑/↓, Enter, Esc,
    focus return) and boxes (Copy right edge 12 px from the window edge, 84 px min at 1280, 56 px
    label-only at 960; dialog 400 wide, top 96) hold (markup tests + `e2e/clipboard-ui.spec.ts`)
    and the shots of C8 and C10 match A01, A02, A15b, A08a–c by eye at checkpoint V.
11. At 960 × 640 content with the Atom tool, the options bar does not overflow
    (`scrollWidth <= clientWidth`) with the Copy button at rest (`e2e/clipboard-ui.spec.ts`).
12. Copy of the 40-atom scheme reaches the clipboard in ≤ 500 ms (median of 5) on the development
    machine (`e2e/win/clipboard-perf.spec.ts`, number recorded in `docs/editor-perf.md`).
13. The Windows checks above are ticked, with Office's choice of format written down (human).

## Boundaries (module-specific)

- **Always:** picture only through svg-render; read embedded drawings only through doc-model
  `parse`; write every clipboard format in one `clipboard.write`; keep the main process free of
  core imports; validate every IPC payload with Zod in main; keep the payload ASCII.
- **Ask first:** any new dependency (PNG or PDF library, native clipboard module); writing text
  formats to the clipboard; text as outlines (svg-render Decision 4); changing the clipboard
  resolution or margins; a new visible control.
- **Never:** put a stack trace or error code in a notice; read or write a path the user did not
  choose; use the network; write a clipboard format Office would paste as text; render or
  execute an opened file; re-encode a user's file it opens.
