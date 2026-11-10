# Spec: `clipboard-export`

Shared stack, commands, style and boundaries: see `SPEC.md`. Module map: `CAPABILITY-MAP.md`.
Core depends on: `doc-model`, `svg-render` (public `index.ts` entries only). Drafted together with
`SPEC-app-shell.md`; the two share one UI design and one IPC contract.
Status: **draft 2026-11-10**, awaiting approval.

Audience: a grade 11–12 chemistry teacher in Nepal (NEB curriculum) on a Windows laptop with
Office 2021, no network, not a power user of drawing software. The test for every choice:
*what would this teacher expect?* The one job this module exists for: **the teacher draws
something and gets it into PowerPoint or Word, looking like a textbook figure, without having to
learn anything.**

## Objective

1. **Copy.** One action (Ctrl+C, the top-bar **Copy** button, Edit > Copy, the canvas context
   menu) puts the selection, or the whole drawing when nothing is selected, on the Windows
   clipboard as a picture Office pastes well (vector SVG and a 300 dpi PNG) **and** as the
   Chalkbond drawing, in one atomic write. The same Ctrl+V then works in PowerPoint, in Word and
   back in Chalkbond (also in a later session).
2. **Export.** File > Export… writes the whole drawing as PNG, SVG or PDF.
3. **Reopen.** Every copied picture and every exported PNG and SVG carries the drawing, so
   app-shell's Open turns such a file back into an editable drawing.

User stories served (`SPEC.md`): 6 (copy and paste into PowerPoint / Word, export PNG / SVG / PDF)
and the second half of 7 (exported SVG / PNG reopen as editable).

## Scope

**In:** the picture of a copy or export (what is drawn, size, margins, background, resolution);
embedding the drawing in PNG, SVG and the clipboard and reading it back; rasterising SVG to PNG;
PDF output; the system clipboard write and read (main process); the paste decision (what Ctrl+V
does with what the clipboard holds); the Copy button; the Export dialog; their notices; the IPC
channels C1–C5 of `SPEC-app-shell.md` "Process split and IPC" that this module uses.

**Out:** menus, the context menu, file dialogs for Open/Save, title, prompts, recent files,
settings storage, the dialog shell and the shared UI primitives (`app-shell`; this module uses
them); how the figure looks (`svg-render`); in-app copy/paste placement (editor CB1).

**Non-goals (v1):** EMF / WMF clipboard formats; text as outlines; a "copy as SVG text" command;
exporting the selection only (Copy covers parts of a drawing); batch export; PDF reopening
(Decision X9); print.

## Facts relied on

Checked on 2026-11-10 against the code and `node_modules/electron/electron.d.ts` (Electron
45.2.3). Facts marked **probe** are pinned by `e2e/win/clipboard-facts.spec.ts` (phase X1) before
any code depends on them, like chem-core's OCL library-fact tests; if a probe fails, this spec is
amended first (the fallback is named in the row).

| Fact (source) | Consequence |
|---|---|
| `clipboard` exists only in the `Main` namespace (the `Renderer` namespace exports `contextBridge`, `ipcRenderer`, `webUtils`, no `clipboard`) | The main process owns the system clipboard; the renderer reaches it through IPC C1/C2 |
| Electron 45's `Clipboard` has only `clear`, `has(mimetype)`, `read(): Promise<ClipboardItem[]>`, `readText`, `write(data: ClipboardItem[])`, `writeText`; `write`: "All entries supplied in a single `write()` call are committed to the system clipboard atomically". No `writeImage`, `writeBuffer`, `readImage` or `availableFormats` | One `clipboard.write([new ClipboardItem({...})])` carries every format, so no format can clear another |
| `has()` doc: "To check for a raw format … use the `electron application/osclipboard` custom format (`electron application/osclipboard;format="…"`)". `ClipboardItem` constructor takes `Record<string, string \| ClipboardBookmark \| Blob \| Promise<Blob \| string>>`; `types` lists "the MIME types the platform clipboard currently makes available" | Windows registered formats (`PNG`, `image/svg+xml`, our own) are written by name as raw entries. **Probe P1–P3**: `write` accepts the four entries of rule CB-W1 together; `has` sees each raw entry; `read()` + `getType(raw type)` returns the exact bytes. Fallback if P3 fails for our own entry: the Chromium web custom format `web application/x-chalkbond` |
| Chromium's handling of an `image/png` entry on Windows (whether it also registers `PNG`, whether it re-encodes and drops ancillary chunks) is not documented in the typings | **Probe P4** records it. The raw `PNG` entry (our exact bytes with `pHYs`) is written unless P4 shows Electron rejects it next to `image/png` |
| Which clipboard format PowerPoint and Word 2021 prefer, and whether they honour a PNG's `pHYs` resolution on paste, **cannot be established from the repo** | Write vector (`image/svg+xml`, the name Chromium and Inkscape register on Windows) **and** bitmap (`PNG` + standard bitmap); never `text/plain`, `text/html` or `text/rtf` (Word and PowerPoint would paste them as text). Verified by hand: "Windows checks" |
| `webContents.printToPDF(options: PrintToPDFOptions): Promise<Buffer>`; `PrintToPDFOptions.pageSize` is a paper name or `{width, height}` in inches, `margins: PrintToPDFMargins {top, bottom, left, right}` in inches, `preferCSSPageSize`, `printBackground` | PDF = a hidden window printing one inline SVG on a page the size of the drawing (rule PD1) |
| svg-render: `renderSvg(doc, { only?, padding?, metadata? }) → SvgDocument { svg, width, height, origin }` in pt; `padding` default 0 (tight ink box, Decision 11); `metadata` is escaped text in `<metadata id="chalkbond">`, its only free-text channel; elements are allow-listed (`svg g path polygon circle ellipse rect text metadata`), no `<tspan>`, no `<use>`, no external reference; text stays `<text>` in Arial (Decision 4); an empty document gives `width = height = 0` | The SVG export, the clipboard SVG and the raster source are one `renderSvg` call. The drawing travels in the existing `<metadata>`: **no svg-render change** |
| svg-render `only` draws an object iff it is selected (an arrow does not bring its texts); doc-model `extract` brings the texts attached to selected arrows | The picture uses `pictureSelection` (rule PI2) so the picture and the pasted fragment agree |
| doc-model: `serialize(doc)` is deterministic 2-space JSON in the envelope `{format: 'chalkbond', schemaVersion, doc}`; `parse(text)` validates (size, JSON, envelope, version, migrations, strict schema, invariants) and returns `Result<Doc, ParseError>` with codes `too-large invalid-json not-chalkbond newer-version unsupported-version migration-failed schema invariants`; `MAX_FILE_BYTES` = 20 MB; `extract`, `insert`, `everything`, `emptyDoc`, `setStyle` exported | The embedded drawing is a `.chalk` text and is read back only through `parse`: one validation path for files, pictures and the clipboard. No doc-model change |
| Editor (`src/renderer/editor/state/controller.ts`): `onCopy(sub, doc, selection)` fires after `run('copy' \| 'cut')` (and the editor's own Ctrl+C / Ctrl+X) only when something was taken, with the document **before** a cut; `canRun('copy')` is false for an empty selection; `run('paste')` pastes the editor's in-app clipboard with CB1 cascade placement; `run({type: 'paste-sub', sub})` places a host fragment at the pointer, else the canvas centre; `run({type: 'insert-text', text})` goes through the name field rules N2/N3 | Copy of a selection goes through the editor; copy of the whole drawing and every paste are the host's (rules CB-C2, CB-P1) |
| Renderer CSP (`src/renderer/index.html`): `img-src 'self' data: blob:`; no `connect-src` beyond `'self'` | The rasteriser loads the SVG as a `blob:` image (rule R1); nothing new in the CSP |
| `SPEC.md` success criteria 4 and 5: paste sharp at 400 % zoom, transparent, bounds containing all ink; export PNG default 300 dpi transparent, SVG, PDF matching the screen | Clipboard picture transparent and tight; Export PNG defaults 300 dpi, transparent |

## Decisions

Binding until a spec change.

| # | Decision | Reason |
|---|---|---|
| X1 | **One Copy** puts picture and drawing on the clipboard together: `image/png`, raw `PNG`, raw `image/svg+xml`, raw `application/x-chalkbond` (rule CB-W1), atomically | One shortcut for PowerPoint, Word and Chalkbond; the teacher never chooses a format |
| X2 | Copy with **nothing selected copies the whole drawing**; with a selection, the selection (plus the texts attached to selected arrows) | "Copy" with nothing selected doing nothing looks broken; ChemDraw-style "select all first" is a step this user would not guess |
| X3 | Clipboard picture: **transparent, tight** (svg-render padding 0), **300 dpi** PNG, SVG at true size (1 SVG unit = 1 pt) | Slides often have coloured backgrounds; a tight box makes PowerPoint's handles hug the drawing (`SPEC.md` SC4); 300 dpi stays sharp at 400 % zoom on a slide |
| X4 | Size in Office follows the preset: Slides = 40 pt bonds, 24 pt labels (slide-sized); Handout = 14.4 pt bonds, 10 pt labels (ACS / textbook size, matches Word body text) | The preset switch already means "where this goes"; the teacher never resizes |
| X5 | The drawing travels as **compact ASCII `.chalk` text** (`drawingPayload`, rule E1) everywhere: clipboard entry, PNG `tEXt` chunk, SVG `<metadata>` | One format, read back only by doc-model `parse`; ASCII survives PNG `tEXt` (Latin-1) and XML escaping unchanged |
| X6 | Ctrl+V reads the **system** clipboard: the Chalkbond drawing if present (in-app cascade if it is the editor's own last copy, else placed as a new fragment), else plain text as a name / SMILES / Molfile, else a notice | The system clipboard is the truth; pasting a name copied from a worksheet is a bonus that costs nothing |
| X7 | A visible **Copy** button (primary style) in the editor top bar, before Undo/Redo; after a copy it reads "Copied" for 2 s and the status bar says what to do next | The teacher who never uses shortcuts must find the most important action; the confirmation answers "did it work, now what?" |
| X8 | **Export dialog** (in-window, small) chooses PNG / SVG / PDF and the two PNG options (size, white background); then the native Save dialog. Export is always the whole drawing | PNG needs two options a native Save dialog cannot ask; one small dialog keeps the choices together and explained in plain words |
| X9 | **PDF does not embed the drawing** in v1; the Export dialog says so | Chromium writes the PDF; embedding needs an incremental PDF update written by us (fragile for a rare need). The teacher reopens the `.chalk`, PNG or SVG. Open question Q1 |
| X10 | Rasterise in the **renderer** (SVG → `<img>` → `<canvas>` → PNG), then add `pHYs` and `tEXt` with pure code | Same Chromium and system Arial as the canvas, so the picture matches the screen; no hidden window, no native module, no dependency |
| X11 | **No new dependency** | PNG chunks and CRC-32 are 80 lines of pure code; PDF comes from Electron; rasterising from the browser |

---

## UI design

Tokens, icons and the shared primitives (primary and secondary buttons, dialog shell, radio
card, checkbox, segmented control) are defined in `SPEC-app-shell.md` "Visual language
additions"; editor tokens (`docs/mockups/editor/tokens.css`) are used unchanged. Pixel values
below are CSS px at 100 % display scaling.

### Copy button (`data-testid="copy"`)

Placed by the editor's `actions` slot (required editor change 1): top bar, after the options bar,
12 px before Undo. At window width ≥ 1100 px it shows icon + label; below, icon only.

| Property | Value |
|---|---|
| Size | height 32 (`--topbar-btn`); with label: padding 0 12 0 8, `min-width: var(--copy-min-w)` (84 px, fits "Copied"), icon 20 (`--icon-md`) + gap 4 (`--space-2`) + label; icon only: 32 × 32 |
| Type | label `--type-sm` weight 600 |
| Radius | `--radius-md` (6) |
| Rest | `--primary-bg`, icon and label `--primary-fg`; icon `copy`; label "Copy" |
| Hover | `--primary-hover-bg` |
| Pressed | `--primary-pressed-bg` |
| Copied (2 s after a successful copy, then back to rest) | as rest, icon `check`, label "Copied"; the width does not change (min-width) |
| Disabled (`aria-disabled="true"`, stays focusable, tooltip says why) | `--hover-bg`, icon and label `--text-disabled`. When: the document is empty ("Draw something first."), a label or text editor is open ("Press Enter to finish typing first."), or a gesture is running |
| Keyboard focus | `outline: 2px solid var(--accent)`, offset 2 px, on `:focus-visible` only |
| Accessible name | `aria-label="Copy (Ctrl+C)"`; the label text is `aria-hidden` when shown |
| Tooltip (editor tooltip component and rules) | title **Copy** `Ctrl+C`; help line: "Copies the selection, or the whole drawing, to paste into PowerPoint or Word." |
| Press | mouse press does not take focus (editor K5); click or Enter / Space runs rule CB-C1 |
| Tab order | name field → options bar → **Copy** → Undo → Redo → rail … |

The button is the only filled control in the window: it is the one thing the teacher must find.

### Copy and paste notices (status-bar hint slot, through `controller.notify`)

Info notices are plain `--text`, no icon (editor R20); errors use the `warning` icon and
`--warning`. Same 8 s / next-canvas-action / Esc expiry as every editor notice.

| When | Kind | Text |
|---|---|---|
| Copied a selection | info | "Copied. Paste into PowerPoint or Word with Ctrl+V." |
| Copied the whole drawing (nothing selected) | info | "Copied the whole drawing. Paste into PowerPoint or Word with Ctrl+V." |
| Cut | info | "Cut. Paste into PowerPoint or Word with Ctrl+V." |
| Copy with an empty document (shortcut path; the button is disabled) | info | "Nothing to copy yet. Draw something first." |
| The picture was made smaller than 300 dpi (rule R3) | info | "Copied. The drawing is very large, so the picture is 150 dpi." (the real dpi) |
| The clipboard write failed | error | "Couldn't copy to the clipboard. Please try again." |
| Paste: clipboard holds a picture but no Chalkbond drawing | info | "Only drawings copied from Chalkbond can be pasted here." |
| Paste: clipboard empty or holds nothing usable | info | "Nothing to paste. Copy a drawing, or a compound name, first." |
| Paste: drawing from a newer Chalkbond (`newer-version`) | error | "This drawing was copied from a newer version of Chalkbond and can't be pasted." |
| Paste: drawing damaged (any other `parse` failure) | error | "The copied drawing is damaged and can't be pasted." |
| Paste: text over 64 KB | info | "That text is too long to insert." |

Text paste that is not a compound name or SMILES gets the editor's own N2 / N3 notices.

### Export dialog (`data-testid="export-dialog"`)

Opened by File > Export… and Ctrl+E (app-shell), only when the document is not empty. Uses the
app-shell dialog shell (`--dialog-w-sm` 400 px wide, padding 24, scrim, focus trap).

```
┌ Export drawing ─────────────────────────────────┐   title --type-title
│ Format                                          │   --type-sm 600
│ ┌─────────────────────────────────────────────┐ │
│ │ ◉ PNG picture                               │ │   radio card 56 high
│ │   For WhatsApp, websites and printing.      │ │
│ └─────────────────────────────────────────────┘ │   4 px gap
│ ┌─────────────────────────────────────────────┐ │
│ │ ○ SVG drawing                               │ │
│ │   Stays sharp at any size in PowerPoint     │ │
│ │   and Word.                                 │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │ ○ PDF document                              │ │
│ │   For printing or sending as a document.    │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │   16 px
│ Size     [ Screen | Print | Poster ]            │   PNG only; segmented 32 high
│          2480 × 830 pixels                      │   --type-xs --text-muted, live
│ ☐ White background                              │   PNG only; 12 px above
│   Leave off for slides with a coloured          │   --type-xs --text-muted
│   background.                                   │
│                                                 │   16 px
│ You can open this file in Chalkbond again       │   --type-xs --text-muted
│ to change the drawing.                          │
│                                                 │   24 px
│                          [ Cancel ] [ Save… ]   │   secondary, primary; 8 px apart
└─────────────────────────────────────────────────┘
```

| Element | Rule |
|---|---|
| Format | radio group (`role="radiogroup"`, `aria-label="Format"`), three radio cards (app-shell primitive), one tab stop, ↑/↓ move and select. Default: the last format used (setting `export.format`), first run PNG |
| Size (PNG only) | segmented control, `role="radiogroup"` `aria-label="Picture size"`: **Screen** = 150 dpi, **Print** = 300 dpi (default), **Poster** = 600 dpi; remembered (`export.pngDpi`). Tooltips: "Screen — 150 dpi, for messages and websites", "Print — 300 dpi, sharp on paper", "Poster — 600 dpi, for large prints". Below it, live: "`W` × `H` pixels" from `pngPixelSize` (rule R3); if reduced: "`W` × `H` pixels (made smaller: the drawing is very large)" |
| White background (PNG only) | checkbox (app-shell primitive), unchecked = transparent (`SPEC.md` SC5); remembered (`export.pngWhite`) |
| Reopen line | PNG, SVG: "You can open this file in Chalkbond again to change the drawing." PDF: "PDF files can't be opened in Chalkbond again. Keep the drawing as a .chalk file too." |
| Buttons | **Cancel** (secondary) closes with no effect; **Save…** (primary, `data-testid="export-save"`) closes the dialog and opens the native Save dialog (rule EX2). Enter anywhere in the dialog = Save…; Esc and a click on the scrim = Cancel |
| Initial focus | the selected format card; focus returns to where it was (the canvas) on close |
| Accessible | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` the title |

Switching format hides or shows the PNG block; the dialog height changes, its top edge stays
where it was (the dialog is placed 96 px below the window top, horizontally centred, not
vertically centred).

### Export confirmation and errors

| When | Where | Text |
|---|---|---|
| Written | status-bar info notice | "Exported ethanol.png." (the file's name) |
| PNG made smaller (R3) | info notice | "Exported ethanol.png at 300 dpi. The drawing is very large." |
| Drawing too large to embed (payload > `MAX_FILE_BYTES`) | info notice | "Exported ethanol.png. The drawing is too large to keep editable inside the picture." |
| Write failed | native error box (app-shell `dialog:tell`), wording from app-shell F14 | e.g. "Couldn't save “ethanol.png”." / "Chalkbond isn't allowed to save in this folder. Choose another folder." |

### Left out (deliberately)

| Left out | Why |
|---|---|
| Format choice on copy ("Copy as SVG / PNG / MOL") | X1: one Copy writes all formats; the teacher should never meet the word "format" to paste |
| Copy resolution, margin and background settings | One good default (X3); Export has the options for the rare file that needs them |
| Export of the selection only | Copy already handles parts; one fewer question in the dialog |
| PDF page size, margins, orientation | The page is the drawing (PD1); placing it on A4 is Word's job |
| JPEG, EMF, TIFF, GIF | PNG and SVG cover Office, the web and messaging apps |
| "Open folder" after export | The teacher chose the folder seconds ago; one more button in the notice slot is clutter |
| Copy button in other places (status bar, floating) | One place, always visible |

---

## Architecture

### Where the code lives

```
src/core/clipboard-export/          pure (no DOM, no Node, no Electron); ≥ 90 % lines
  index.ts                          public entry (named exports only)
  payload.ts                        drawingPayload, pictureDoc, pictureSelection
  picture.ts                        exportSvg, pngPixelSize, RASTER_LIMITS
  png-chunks.ts                     crc32, readChunks, withPictureChunks, readPngDrawing
  svg-embed.ts                      readSvgDrawing
  drawing-file.ts                   fileKindOf, extractDrawing (used by app-shell's Open)
  paste.ts                          pasteAction
  names.ts                          exportFileName
src/renderer/clipboard-export/      DOM side, React; model/ is pure (≥ 90 %), the rest e2e-tested
  model/copy-flow.ts                copy and paste flows over injected ports (queue, notices)
  model/export-flow.ts              Export dialog state and the export flow over injected ports
  rasterise.ts                      SVG → PNG bytes in a <canvas>
  CopyButton.tsx  ExportDialog.tsx  export-dialog.css
src/main/clipboard-export/          Electron main
  clipboard.ts                      write / read the system clipboard (IPC C1, C2)
  pdf.ts                            hidden-window printToPDF (IPC C5)
e2e/clipboard-*.spec.ts  e2e/export-*.spec.ts  e2e/win/clipboard-facts.spec.ts
```

`src/core/clipboard-export` imports only `@core/doc-model` and `@core/svg-render` (already in
`CORE_DEPS` in `eslint.config.mjs`). The main process imports **no** core module (svg-render
pulls chem-core and OpenChemLib, which must not enter the main bundle): it moves bytes; the
renderer renders, embeds, extracts and parses.

### Public surface (`src/core/clipboard-export/index.ts`)

```ts
import type { Doc, Selection, SubDoc, ParseError } from '@core/doc-model';
import type { SvgDocument } from '@core/svg-render';

// payload (E1)
drawingPayload(doc: Doc): string
    // serialize(doc) re-printed without indentation and with every char ≥ U+007F as \uXXXX:
    // ASCII-only JSON that parse() accepts and that round-trips to a deep-equal doc
pictureSelection(doc: Doc, selection: Selection): Selection
    // selection ∪ texts whose attachedTo.arrow is a selected arrow (extract's object closure)
pictureDoc(doc: Doc, selection: Selection | null): Doc
    // null → doc itself; else insert(emptyDoc(doc.meta.created), extract(doc, sel), {x:0,y:0})
    // with setStyle(…, doc.style) and meta.created/modified copied: the standalone drawing a copy
    // pictures; deterministic (no clock read)

// picture (PI1–PI4)
exportSvg(doc: Doc, selection: Selection | null, opts?: { embed?: boolean }): SvgDocument
    // renderSvg(doc, { only: sel && pictureSelection(doc, sel), padding: 0,
    //   metadata: embed !== false && payload fits ? drawingPayload(pictureDoc(doc, sel)) : undefined })
RASTER_LIMITS: { readonly maxSide: 10000; readonly maxPixels: 50_000_000 }
pngPixelSize(widthPt: number, heightPt: number, dpi: number):
    { width: number; height: number; dpi: number; reduced: boolean }   // R3

// PNG chunks (E2)
crc32(bytes: Uint8Array): number
withPictureChunks(png: Uint8Array, opts: { dpi: number; payload: string | null }): Uint8Array
readPngDrawing(png: Uint8Array): string | null          // first tEXt 'chalkbond' text, or null

// SVG (E3)
readSvgDrawing(svgText: string): string | null          // unescaped <metadata id="chalkbond"> text

// opening embedded files (E4; app-shell Open uses it)
type DrawingFileKind = 'chalk' | 'png' | 'svg';
fileKindOf(name: string): DrawingFileKind | null        // by extension, case-insensitive
extractDrawing(kind: DrawingFileKind, bytes: Uint8Array, decodeUtf8: (b: Uint8Array) => string | null):
    { ok: true; text: string } | { ok: false; problem: 'no-drawing' | 'damaged' | 'too-large' }

// paste (CB-P1)
type ClipboardContents = { drawing: string | null; text: string | null; textTooLong: boolean; image: boolean };
type PasteAction =
  | { kind: 'in-app' }                                  // run('paste')
  | { kind: 'fragment'; sub: SubDoc }                   // run({type: 'paste-sub', sub})
  | { kind: 'text'; text: string }                      // run({type: 'insert-text', text})
  | { kind: 'notice'; notice: 'picture-only' | 'empty' | 'newer' | 'damaged' | 'text-too-long' };
pasteAction(clip: ClipboardContents, lastEditorCopy: string | null, inAppReady: boolean): PasteAction

// names
exportFileName(baseName: string | null, format: 'png' | 'svg' | 'pdf'): string
    // 'Untitled.png' for null; strips a .chalk/.png/.svg/.pdf ending, replaces <>:"/\|?* and
    // control chars with '-', trims dots and spaces, caps the stem at 120 chars, then adds .format
```

`decodeUtf8` is injected because `src/core` has no `TextDecoder` type; the renderer passes
`(b) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(b) } catch { return null } }`.

### Process split and IPC

The renderer renders, rasterises, embeds and decides; the main process owns the clipboard, the
file system and PDF printing. Channel names, payload schemas (Zod, in `src/shared/ipc.ts`) and
the security rules are in `SPEC-app-shell.md` "Process split and IPC" and "Security"; this module implements these:

| Ch. | Channel | Request | Response | Main does |
|---|---|---|---|---|
| C1 | `clipboard:write` | `{ png: Uint8Array ≤ 64 MB, svg: string ≤ 20 MB, drawing: string ≤ 20 MB, ASCII }` | `{ ok: boolean }` | rule CB-W1 |
| C2 | `clipboard:read` | `{}` | `{ drawing: string \| null, text: string \| null, textTooLong: boolean, image: boolean }` | rule CB-R1 |
| C3 | `file:choose-save` | `{ format: 'chalk' \| 'png' \| 'svg' \| 'pdf', suggestedName: string ≤ 255 }` | `FileRef \| null` | native Save dialog (app-shell rule F8) |
| C4 | `file:write` | `{ ref: string, data: Uint8Array ≤ 64 MB }` | `{ ok: true } \| { ok: false, problem: WriteProblem }` | atomic write (app-shell rule F9) |
| C5 | `file:write-pdf` | `{ ref: string, svg: string ≤ 20 MB, widthPt: number, heightPt: number }` | as C4 | rule PD1, then as C4 |

### Rasterising (renderer, `rasterise.ts`)

- **R1** `rasterise(svg: SvgDocument, dpi: number, white: boolean): Promise<{ png: Uint8Array;
  dpi: number; reduced: boolean }>`: `size = pngPixelSize(svg.width, svg.height, dpi)`; the SVG
  text gets its root `width` / `height` attributes rewritten to `size.width px` / `size.height
  px` (viewBox unchanged, so Chromium rasterises the vector at the target size, never scales a
  bitmap); loaded as `new Image()` from `URL.createObjectURL(new Blob([text], { type:
  'image/svg+xml' }))`, `await img.decode()`; drawn on a `<canvas>` of `size.width ×
  size.height`, preceded by a `#ffffff` fill when `white`; `canvas.toBlob('image/png')`; the
  object URL is revoked; the bytes go through `withPictureChunks`.
- **R2** Fonts: an SVG image in Chromium uses installed system fonts, so text is drawn in the
  same Arial as the canvas (Windows) or Liberation Sans (Linux CI); svg-render's metrics table
  is calibrated against both (`e2e/font-calibration.spec.ts`). No font is bundled or loaded.
- **R3** `pngPixelSize`: `px = pt × dpi / 72`, each side `Math.ceil`, at least 1. If a side would
  exceed `maxSide` (10 000) or the area `maxPixels` (50 M), `dpi` is lowered to the largest whole
  number that fits both and `reduced` is true. (Chromium's canvas limits are higher; these keep
  memory under 200 MB.) A Slides scheme of 800 × 200 pt at 300 dpi is 3334 × 834 px.
- **R4** Determinism: PNG pixels are **not** asserted byte-identical across machines (GPU
  rasterisation and font hinting differ). Asserted instead: dimensions exactly as R3; the
  `pHYs` and `tEXt` chunks byte-exact; the corner pixels fully transparent (or `#ffffff` with
  White background); for a text-free fixture (benzene) the bounding box of pixels with alpha > 0
  within 2 px of every edge; a bond stroke has ≥ 6 opaque pixels across at 300 dpi (Slides
  2 pt line = 8.3 px).

### Embedding

- **E1** Payload = `drawingPayload(pictureDoc(doc, selection))`: the `.chalk` envelope as compact
  ASCII JSON. Size limit `MAX_FILE_BYTES` (20 MB, the limit `parse` enforces, so whatever is
  embedded can be reopened); over it, the picture is written without the drawing (notice
  above). Recognition is the envelope itself (`"format":"chalkbond"`), checked by `parse`.
- **E2** PNG: `withPictureChunks` parses the chunk list (signature, then length / type / data /
  CRC; a bad signature or CRC throws `PngError`), removes any existing `pHYs` and any `tEXt`
  with keyword `chalkbond`, inserts `pHYs` (pixels per metre = `round(dpi / 0.0254)` both axes,
  unit 1) and `tEXt` (keyword `chalkbond`, NUL, payload as Latin-1 bytes) directly after
  `IHDR`, and recomputes nothing else. `tEXt` (not `iTXt` or `zTXt`) because the payload is
  ASCII and needs no compression code. `readPngDrawing` returns the first `tEXt` with keyword
  `chalkbond` before `IDAT`, else null; it never throws (a broken file → null).
- **E3** SVG: the payload is svg-render's `metadata` (escaped text in `<metadata
  id="chalkbond">`). No namespace element: svg-render's allow-list has no child elements in
  `<metadata>`, and the envelope's `format` field already identifies the content.
  `readSvgDrawing` finds the first `<metadata id="chalkbond">…</metadata>` (also with other
  attributes before `id`, single or double quotes, as an editor such as Inkscape may rewrite
  it), takes its text, unescapes `&amp; &lt; &gt; &quot; &apos;` and numeric character
  references, and returns it; anything else → null. A file saved by another program that drops
  the element simply has no drawing.
- **E4** `extractDrawing(kind, bytes)`: over `MAX_FILE_BYTES` → `too-large`. `chalk`: UTF-8
  decode (strip a leading BOM) → text, a decode failure → `damaged`. `png`: no PNG signature →
  `damaged`; `readPngDrawing` null → `no-drawing`. `svg`: UTF-8 decode, `readSvgDrawing` null →
  `no-drawing`. The returned text then goes through doc-model `parse` in the caller, whose
  errors map to app-shell's wording ("File errors").
- **E5** The clipboard entry `application/x-chalkbond` carries the same payload (X5).

### Picture rules

- **PI1** What is pictured: Copy → `selection` non-empty ? that selection : the whole document
  (X2). Export → the whole document. An empty document is never pictured (the controls are
  disabled; the functions are not called).
- **PI2** `pictureSelection` adds the texts attached to selected arrows, so the picture contains
  exactly what `extract` (and so a paste) contains.
- **PI3** Margins and background: `padding: 0` for SVG, PNG and PDF (ink-tight; text ink boxes keep
  svg-render's bounded slack). Clipboard: transparent always. Export PNG: transparent unless White
  background. SVG: transparent (no background element). PDF: the page is white (paper).
- **PI4** Size: the SVG says `width="Wpt" height="Hpt"` (svg-render), so Office shows it at true
  point size (X4). The PNG's `pHYs` says the dpi, so an application that honours it shows the
  same physical size; Office's behaviour is a checklist item.

### Clipboard rules

- **CB-W1** Write (main, C1): validate (Zod; `drawing` must match `^[\x20-\x7E]*$` and start with
  `{`; `png` must start with the PNG signature; `svg` must start with `<svg`), then one call:

  ```ts
  await clipboard.write([new ClipboardItem({
    'image/png': new Blob([png], { type: 'image/png' }),
    'electron application/osclipboard;format="PNG"': new Blob([png]),            // unless probe P4
    'electron application/osclipboard;format="image/svg+xml"': new Blob([svg]),   // UTF-8
    'electron application/osclipboard;format="application/x-chalkbond"': new Blob([drawing]),
  })]);
  ```

  No `text/plain`, `text/html`, `text/rtf`. A rejected write → `{ ok: false }` (logged).
- **CB-R1** Read (main, C2): `drawing` = the `application/x-chalkbond` entry's text if `has()`
  reports it and it is ≤ 20 MB, else null; `text` = `readText()` if non-empty and at most
  65 536 characters, else null with `textTooLong` true when it was longer; `image` =
  `has('image/png')`. Never throws (errors → all null / false, logged).
- **CB-C1** Copy (renderer, `copy-flow.ts`): selection non-empty → `controller.run('copy')`; the
  editor calls `onCopy(sub, doc, selection)` → `copyPicture(doc, selection, 'selection')`.
  Selection empty and document non-empty → `copyPicture(doc, null, 'all')` without touching the
  editor (its in-app clipboard stays as it was). Document empty → "Nothing to copy yet" notice.
- **CB-C2** `copyPicture(doc, sel, what)`: `svg = exportSvg(doc, sel)`; `png = rasterise(svg,
  300, false)`; payload = the SVG's embedded text (computed once); invoke C1; on success the Copy
  button shows "Copied" for 2 s and the notice for `what` (selection / all / cut) appears; set
  `lastEditorCopy = payload` when the copy came through `onCopy`, else `lastEditorCopy = null`.
  On failure the error notice.
- **CB-C3** Cut: `controller.run('cut')`; `onCopy` receives the document before the cut, so the
  picture is of what was removed; notice "Cut. …".
- **CB-Q** Clipboard jobs run **one at a time, in order** (a promise queue): a Ctrl+V pressed
  while a copy is still rasterising waits for the write, so it never reads the old clipboard.
- **CB-P1** Paste (renderer): invoke C2, then `pasteAction(clip, lastEditorCopy,
  controller.canRun('paste'))`:
  1. `drawing` non-null: `parse(drawing)`; `newer-version` → notice `newer`; other failure →
     `damaged`; ok and `drawing === lastEditorCopy` and `inAppReady` → `in-app` (editor CB1
     cascade: the copy lands 1 BLU right and down of its source, as in PowerPoint); else
     `fragment` with `extract(doc, everything(doc))` (lands at the pointer, else the canvas
     centre, selected, tool Select: editor CB1).
  2. else `textTooLong` → `text-too-long`; else `text` non-null → `text` (editor N2/N3 decide:
     name, SMILES, Molfile or "No compound named …").
  3. else `image` → `picture-only`; else `empty`.
- **CB-P2** A drawing copied in another Chalkbond session (or before a restart) is pasted by rule
  1 as a fragment: Windows keeps clipboard data after the copying process exits (Chromium writes
  every format immediately, no delayed rendering; probe P5 checks a value written by one app
  launch is read by the next).
- **CB-K** Keys (renderer, app-shell's host key handler): Ctrl+V on the canvas or any non-text
  target runs CB-P1 (the editor's own in-app Ctrl+V is never reached); Ctrl+C with an empty
  selection runs CB-C1's "all" branch; Ctrl+C with a selection and Ctrl+X are left to the editor
  (which calls `onCopy`). In the name field and the label / text editors every one of these keys
  keeps its native text meaning.

### Export rules

- **EX1** Export… (enabled when the document is non-empty and no editor or gesture is active)
  opens the Export dialog with the remembered format and PNG options.
- **EX2** Save… → C3 with `format` and `suggestedName = exportFileName(sessionName, format)`
  (`sessionName` from app-shell: the document's file name, else null). Cancel in the native
  dialog → nothing, no notice. The choices are saved to settings (`export.*`) when Save… is
  pressed.
- **EX3** PNG: `svg = exportSvg(doc, null)`; `rasterise(svg, dpi, white)`; C4. SVG:
  `exportSvg(doc, null).svg` as UTF-8 bytes, no BOM; C4. PDF: `exportSvg(doc, null, { embed:
  false })`; C5.
- **EX4** Then the notice "Exported `name`." (with the R3 / E1 variants) or the error box.
- **EX5** The SVG file is byte-identical to `exportSvg(doc, null).svg` (determinism carries over
  from svg-render; the payload is deterministic).

### PDF (main, `pdf.ts`)

- **PD1** C5: validate (`svg` starts with `<svg`, ≤ 20 MB; `widthPt`, `heightPt` finite, > 0, ≤
  14 400). Create `mkdtemp(join(app.getPath('temp'), 'chalkbond-pdf-'))`, write `page.html`:

  ```html
  <!doctype html><meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <style>@page{size:{W}pt {H}pt;margin:0}html,body{margin:0}svg{display:block}</style>{svg}
  ```

  open `new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation:
  true, nodeIntegration: false, javascript: false } })` (no preload; navigation and window-open
  blocked by app-shell's `web-contents-created` rule), `loadFile(page.html)`, then
  `webContents.printToPDF({ pageSize: { width: W / 72, height: H / 72 }, margins: { top: 0,
  bottom: 0, left: 0, right: 0 }, preferCSSPageSize: true, printBackground: false })`; close
  the window, delete the temp folder (also on failure), write the bytes as C4 does.
- **PD2** One page exactly the drawing's size. Text is real PDF text with Arial embedded as a
  subset by Chromium (selectable, sharp); lines are vectors. The e2e check: the PDF starts with
  `%PDF-`, has exactly one `/Type /Page` object whose `/MediaBox` is `[0 0 W H]` within 1 pt,
  contains a `/FontFile2` and no `/Subtype /Image`. Probe P6 checks a 20 × 20 pt page is
  accepted (tiny drawing such as one "O").
- **PD3** No embedded drawing (X9).

---

## Behaviour summary (numbered for tasks)

Rules above: R1–R4 (rasterising), E1–E5 (embedding), PI1–PI4 (picture), CB-W1, CB-R1, CB-C1–C3,
CB-Q, CB-P1–P2, CB-K (clipboard), EX1–EX5 (export), PD1–PD3 (PDF).

## Required changes to finished modules

Each is a task (spec edit first, then code) in phase X3, before the code that needs it.

| # | Target | Change | Spec edit |
|---|---|---|---|
| 1 | `editor` | `Editor` gets an optional prop `actions?: React.ReactNode`, rendered in the top bar between the options bar and Undo, with a 12 px gap before Undo; the options bar keeps `flex: 1` and still scrolls horizontally when too narrow. Tab order: name field → options bar → `actions` → Undo → Redo. No visual change when absent (the editor e2e layout boxes stay valid) | `SPEC-editor.md` "Layout" table, Top bar row: after "the options bar (…)" insert "; the host's `actions` (app-shell: the Copy button), 12 px before Undo". "Seam to the host": `export { Editor } … // <Editor controller={c} actions={node?} />`. K4: "options bar (…) → host actions → Undo → Redo". |
| 2 | `editor` | `EditorController.notify(kind: 'info' \| 'error', text: string): void` shows a notice in the hint slot through the existing `notice-show` action (same expiry and `role="status"` announcement as editor notices) | `SPEC-editor.md` "Seam to the host", `EditorController`: add `notify(kind: 'info' \| 'error', text: string): void;   // host notice in the hint slot (Notices and errors rules)` |
| — | `doc-model`, `svg-render`, `chem-core` | None | — |

(Required change 3 to the editor, the right-click selection rule, is app-shell's: see
`SPEC-app-shell.md`.)

## Dependencies

**None new.** Electron 45.2.3 (`clipboard`, `ClipboardItem`, `printToPDF`), Chromium's
`<canvas>` and `Image`, Zod (IPC validation), doc-model, svg-render.

## Testing

| Level | What | Where |
|---|---|---|
| Unit (node) | `drawingPayload` (ASCII only, `parse` round trip deep-equal, Devanagari text and emoji survive as `\u` escapes); `pictureSelection`, `pictureDoc` (style copied, geometry equals `extract`); `exportSvg` (equals `renderSvg` with the payload; `embed: false` has no `<metadata>`; over-limit payload omitted); `pngPixelSize` (rounding, 1 px minimum, both caps, `reduced`); `crc32` (known vectors: `"IEND"` → `0xAE426082`); `withPictureChunks` (order: `IHDR`, `pHYs`, `tEXt`, rest; replaces old `pHYs` / `chalkbond` `tEXt`; bad CRC throws); `readPngDrawing` / `readSvgDrawing` (round trips; attribute order and quote variants; entity and numeric references; truncated and garbage input → null, never throws); `extractDrawing` (every problem code; BOM); `pasteAction` (every branch); `exportFileName` (reserved characters, empty, long, existing extension) | `src/core/clipboard-export/*.test.ts` |
| Property (fast-check) | for docs from doc-model's `arbitraries.ts`: `parse(drawingPayload(d))` deep-equals `d`; `readSvgDrawing(exportSvg(d, null).svg)` returns the payload; `readPngDrawing(withPictureChunks(minimalPng, {dpi, payload}))` returns the payload; any byte string given to `readPngDrawing` / `readSvgDrawing` / `extractDrawing` never throws | `*.prop.test.ts` |
| Flow (node) | `copy-flow` and `export-flow` with fake ports: selection vs whole drawing, `lastEditorCopy` bookkeeping, queue order (paste after copy reads the new clipboard), notices and button state, cancel paths, settings saved on Save… | `src/renderer/clipboard-export/model/*.test.ts` |
| View markup (node) | `CopyButton` and `ExportDialog` via `renderToStaticMarkup`: names, roles, `aria-disabled`, `aria-checked`, test ids, PNG block hidden for SVG / PDF, reopen line per format | `*.test.tsx` |
| Probe (Electron, Windows) | P1 the four entries are accepted together; P2 `has` sees each raw entry; P3 `read` + `getType` returns exact bytes for the raw entries; P4 what `image/png` alone registers (`has('…format="PNG"')`) and whether `PNG` and `image/png` coexist; P5 a value written by one launch is read by the next; P6 `printToPDF` accepts a 20 × 20 pt CSS page; P7 no text format is present after CB-W1 | `e2e/win/clipboard-facts.spec.ts` (Playwright project `e2e-win`, enabled on win32 only; see app-shell) |
| E2E (built app) | Copy button with nothing selected → clipboard (read in main via `app.evaluate`) has the four entries; the SVG equals `exportSvg(doc, null)`; the drawing parses to the document. Copy of a selection → payload equals `extract` of the selection. Ctrl+V back → in-app cascade (+1 BLU). A drawing written to the clipboard from main (as another session would) → Ctrl+V inserts it as a fragment. Plain text "ethanol" on the clipboard → Ctrl+V inserts ethanol. An image-only clipboard → "Only drawings copied from Chalkbond …". Ctrl+C in the name field copies the field's text only. Export PNG / SVG / PDF with `dialog.showSaveDialog` stubbed in main → files exist; PNG: R4 assertions and the embedded drawing reopens through app-shell Open to an equal document; SVG: bytes equal `exportSvg`; PDF: PD2 assertions. Copy of the 40-atom scheme reaches the clipboard in ≤ 500 ms (median of 5) | `e2e/clipboard-*.spec.ts`, `e2e/export-*.spec.ts` |
| Shots | `X<n>/copy-button-*.png`, `X<n>/copied.png`, `X<n>/export-png.png`, `export-svg.png`, `export-pdf.png` at 1280×800, compared with the mock-ups | `e2e/shots/X<n>.shot.ts` |
| Manual (Windows, Office 2021) | "Windows checks" below | `docs/windows-checklist.md` |

Coverage: `src/core/clipboard-export` ≥ 90 % lines; `src/renderer/clipboard-export/model` ≥ 90 %;
thresholds added to `vitest.config.mts` for those globs. No file excluded to reach them.

## Windows checks (for `docs/windows-checklist.md`, section "Clipboard and export")

Run with the installed app (or `npm run dev`) and Office 2021.

- [ ] Draw the SC3 scheme (Slides), press the Copy button, paste into a blank PowerPoint slide with Ctrl+V: it arrives as a drawing (the ribbon shows **Graphics Format**, meaning SVG) or, if not, as a picture (**Picture Format**); write down which. Zoom to 400 %: lines and text are sharp.
- [ ] The pasted drawing's bonds measure 1.41 cm (40 pt) in PowerPoint (Format > Size, compared with a known bond count); text matches 24 pt slide text. Note whether the size is right when Office took the PNG (if it pasted about 3× too big, Office ignored the 300 dpi).
- [ ] Put a dark slide background behind the pasted drawing: no white or black box around it.
- [ ] Switch the drawing to Handout, copy, paste into Word 2021: bonds about 5 mm, labels the size of 10 pt body text; zoom to 400 %: sharp. Print preview looks like a textbook figure.
- [ ] Labels and subscripts in the pasted drawing (`H₂SO₄`, `OH`, `CO₂H`) are in Arial and sit as on screen, in PowerPoint and Word. If they shift, record it (this would be the trigger for svg-render's text-as-outlines question).
- [ ] Paste into WhatsApp Desktop (or another chat app) and into Paint: a picture arrives.
- [ ] Copy in Chalkbond, close Chalkbond, open it again, Ctrl+V: the drawing comes back editable.
- [ ] Copy a picture in PowerPoint, Ctrl+V in Chalkbond: "Only drawings copied from Chalkbond can be pasted here."
- [ ] Export PNG at Print: open it in the Photos app (it shows the drawing; with White background off, the background is transparent) and in Paint (shows white). Insert it into Word with Insert > Pictures: size matches the pasted SVG within a few percent (300 dpi honoured).
- [ ] Export SVG and insert it into PowerPoint with Insert > Pictures: identical to the paste.
- [ ] Export PDF, open it in Edge: one page the size of the drawing, text selectable; print it on A4: sharp.
- [ ] Open the exported PNG and SVG in Chalkbond (File > Open): the drawing is editable and identical.

## Success criteria

Each is testable as written.

1. Every function in "Public surface" exists with unit tests; `src/core/clipboard-export` ≥ 90 %
   lines; `npm run check` green.
2. Probe P1–P7 pass on Windows and their results are recorded in "Facts relied on" (spec amended
   first if a fallback is taken).
3. After the Copy button with nothing selected, the system clipboard holds `image/png`, raw
   `image/svg+xml` and raw `application/x-chalkbond` (and raw `PNG` per P4) and no text format;
   the SVG entry equals `exportSvg(doc, null).svg`; the drawing entry parses to a document whose
   `serialize` equals `serialize(doc)` (e2e).
4. Copy of a selection pictures exactly `pictureSelection` and its drawing equals
   `pictureDoc(doc, selection)` (unit + e2e).
5. Ctrl+V of the editor's own last copy pastes in place + (1, 1) BLU; of a drawing from another
   session pastes a fragment at the canvas centre; of the text "ethanol" inserts ethanol; of an
   image-only clipboard shows the picture-only notice (e2e).
6. A paste pressed during a copy reads the new clipboard (flow test of CB-Q).
7. Export PNG at Print of the benzene fixture is `ceil(W·300/72) × ceil(H·300/72)` px with `pHYs`
   11811 px/m and passes R4; reopening it through Open gives a document equal to the original
   (e2e).
8. Export SVG bytes equal `exportSvg(doc, null).svg`; reopening gives an equal document (e2e).
9. Export PDF passes PD2 (e2e).
10. Copy button: states, tooltip, name, focus ring and tab position as in "Copy button"
    (markup test + `e2e/clipboard-ui.spec.ts` + shots); the Export dialog's keyboard rules
    (↑/↓, Enter, Esc, focus return) hold (e2e).
11. Copy of the 40-atom scheme reaches the clipboard in ≤ 500 ms median on the development
    machine (e2e timing, recorded in `docs/editor-perf.md`).
12. The Windows checks above are ticked, with Office's choice of format written down.

## Boundaries (module-specific)

- **Always:** picture only through svg-render; read embedded drawings only through doc-model
  `parse`; write every clipboard format in one `clipboard.write`; keep the main process free of
  core imports; validate every IPC payload with Zod in main; keep the payload ASCII.
- **Ask first:** any new dependency (PNG or PDF library, native clipboard module); writing text
  formats to the clipboard; text as outlines (svg-render Decision 4); embedding in PDF;
  changing the clipboard resolution or margins; a new visible control.
- **Never:** put a stack trace or error code in a notice; read or write a path the user did not
  choose; use the network; write a clipboard format Office would paste as text; re-encode a
  user's file it opens.

## Suggested phases

| Phase | Tasks |
|---|---|
| X1 Facts | Playwright project `e2e-win`; probe P1–P7; record results in this spec |
| X2 Pure core | payload, picture, PNG chunks, SVG embed, `extractDrawing`, `pasteAction`, names; properties |
| X3 Seams | editor required changes 1–2 (spec first); `src/shared/ipc.ts` with C1–C5 schemas and the app-shell security baseline for these channels; preload functions; app tokens, icons and primitives from `SPEC-app-shell.md` |
| X4 Copy | `rasterise`, main `clipboard.ts`, `copy-flow` (CB-C1–C3, CB-Q, CB-P1), host keys CB-K, Copy button, notices; e2e and shots |
| X5 Export | Export dialog, `export-flow`, C3–C5, `pdf.ts`; e2e (export then reopen once app-shell Open exists: until then via `extractDrawing` + `parse` in the test) and shots |
| Checkpoint | `npm run check` green, e2e green on Windows, Windows checks run with Office 2021, findings folded into this spec |

## Open questions

Each has a recommended default (the orchestrator decides with "what would a grade 11–12 teacher
expect?").

| # | Question | Default | Reason |
|---|---|---|---|
| Q1 | Embed the drawing in PDF (incremental update: one stream object plus a trailer key, written by our own code)? | **No** for v1 | Rarely needed (the teacher keeps the `.chalk` or PNG); the Export dialog says so plainly |
| Q2 | Should exported PNG files default to a white background (WhatsApp in dark mode shows a transparent PNG's black lines on dark grey)? | **No**, keep transparent (`SPEC.md` SC5) with the remembered checkbox | The choice is one click and remembered; changing an approved success criterion needs the owner |
| Q3 | If Office 2021 turns out to ignore the SVG clipboard entry, keep writing it? | **Yes** | It costs nothing, and newer Office and other apps use it |
| Q4 | If Office ignores the PNG's 300 dpi and pastes it about 3× too large? | **Accept** for v1 (PowerPoint and Word shrink an oversized paste to fit) and record it; revisit only if the SVG entry is also ignored | Lowering the resolution would break "sharp at 400 %" |
| Q5 | Plain text on the clipboard: insert it as a name / SMILES on Ctrl+V? | **Yes** | Teachers copy names from worksheets; a wrong text gets the familiar "No compound named …" |
| Q6 | Copy button label below 1100 px window width: icon only? | **Yes** | Keeps the top bar from scrolling at 960 px; 1366-px laptops keep the label |
| Q7 | Clipboard PNG resolution | **300 dpi** | Sharp at 400 % zoom on a slide; about 1–3 MB on the clipboard |
