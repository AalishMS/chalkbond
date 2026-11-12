# Windows verification checklist

**Checkpoint Z (release) is partly run.** The automated steps 1-7 of "Checkpoint Z" ran and passed
on Windows on 2026-11-11 at `956a4a4`, run and read by the orchestrator. Step 8 is done (the
installer, unpacked and installed sizes are written). Step 9, the human sections, is in progress:
two batches (2026-11-11, Office 2016 Click-to-Run Version 2610 on the development machine,
performed by a computer-use agent at the owner's request and verified by the orchestrator) ticked
nine of the twelve human boxes of "Clipboard and export" (the paste into PowerPoint and Word, the
restart and paste-back round trip, the refused foreign picture, and the PNG and SVG exports and
their reopening) and the first box of "App shell and installer". Open in "Clipboard and export":
the labels box (a `CO₂H` label is still to be checked; reopened in batch 2), the chat-app paste
(only Paint was seen) and the PDF in Edge, in Adobe Acrobat Reader and on A4 paper (only pdf.js and
xpdf were tried). Open elsewhere: the clean-account install and SmartScreen, the other boxes of
"App shell and installer", and Checkpoints K, E32 and R. The release is not declared until they
pass.

## Owner decisions of 2026-11-12

1. **Teacher's laptop.** Asked "Is this laptop the one the teacher will use?", the owner answered "no this laptop is not the one the teacher will use". Checkpoint E32 and the box "Cold start of the installed app to a usable canvas is under 3 s on the teacher's laptop" cannot be done on the development machine. They stay open and unticked; what they require is unchanged.
2. **Office.** Asked whether the Office on the development machine is acceptable in place of Office 2021, the owner answered "sure it will work in it". That Office is Microsoft Office Professional Plus 2016 as its Account page shows it, Version 2610 (Build 20527.20150 Click-to-Run), Current Channel. Every Office check below (Checkpoint K, "Clipboard and export") may be run with it. The boxes keep their wording; each recorded result names the Office actually used.
3. **Windows 10.** Asked "Do you have a Windows 10 machine or VM? Without one, the Windows 10 install check can't be done and the release can't be declared as the checklist stands.", the owner answered "no we dont need that". The orchestrator's reading: the owner waives the Windows 10 human checks. The human sections and the clean-account install run on Windows 11 only, and Windows 10 is untested by hand for 1.0.0.

Run on the Windows machine (PowerShell) at each checkpoint. Tick items in the commit that
records the checkpoint.

## Checkpoint Z — release

Run on the Windows machine (PowerShell), in this order, from a clean clone. Record each result in
the commit that ticks the boxes.

1. `npm ci`
2. `npm run check`
3. `npm run test:e2e` (builds first; includes the Windows-only `e2e/win/` specs)
4. `npm run test:e2e:os-input` (opt-in; moves the real mouse cursor, do not touch the mouse while it runs)
5. The C3 clipboard probes P1-P7 and P2b: `e2e/win/clipboard-facts.spec.ts` (inside step 3, or alone with `npx playwright test e2e/win/clipboard-facts.spec.ts` after `npm run build`), as `tasks/todo-clipboard-export.md` C3 and `SPEC-clipboard-export.md` "Testing" describe them. Record the observed results in the spec's "Facts relied on" and in `src/main/clipboard-export/formats.ts`.
6. `npm run dist:win` (needs network once for the NSIS download)
7. `npm run test:packaged` (against `dist/win-unpacked`)
8. Write the installer size and the installed size into `SPEC-app-shell.md`, packaging item I1.
9. The human sections below ("Clipboard and export" and "App shell and installer"), on Windows 11 only (Windows 10 waived by the owner on 2026-11-12, untested by hand for 1.0.0).

State on 2026-11-11, at `956a4a4`, on Windows 11 Pro 26300 (Node 26.3.0, npm 11.16.0, Electron 45.2.3,
i5-11400H, 16 GB, display at 125 % with a second monitor). Run and read by the orchestrator:

1. `npm ci`: exit 0.
2. `npm run check`: exit 0, 231 files, 4038 tests.
3. `npm run test:e2e`: exit 0, 321 passed, 6.9 min, including `e2e/win/`, the font calibration against real Arial, the PDF probes P8 and P9 (outcome PDF-A confirmed on Windows) and the native window specs. Earlier the same day: 308 passed and 13 failed at `b99a6d6`, 319 passed and 1 failed at `85f968a`; the defects are in the `SPEC.md` Decisions Log.
4. `npm run test:e2e:os-input`: exit 0, 1 passed (the mouse was left alone).
5. The C3 probes P1-P7 and P2b passed inside step 3. The keys were decided by them (Decision R9 in `SPEC-clipboard-export.md`).
6. `npm run dist:win`, from a real console window: exit 0; `dist/Chalkbond-1.0.0-setup.exe` 109,915,593 bytes (104.8 MiB), `dist/win-unpacked` 347,499,681 bytes (331.4 MiB, 21 files), `dist/builder-effective-config.yaml` written.
7. `npm run test:packaged` against `dist/win-unpacked`: exit 0, 7 passed.
8. Installer, unpacked and installed sizes are written in `SPEC-app-shell.md` I1 (installed 347,681,841 bytes, 331.6 MiB, 24 files, after installing on the development machine on 2026-11-11).
9. In progress. Batch 1 (2026-11-11), performed by a computer-use agent in the Codex desktop app driving the real mouse and keyboard at the owner's request, verified by the orchestrator against its screenshots, an SVG exported from the same drawing, the installed folder, the shortcut files and the registry; machine: Windows 11 Pro 26H2 (build 26300.9818), the development laptop (not a clean account); Office: Microsoft Office Professional Plus 2016, Version 2610 (Build 20527.20150 Click-to-Run), Current Channel (not Office 2021). Done: install on the development machine; installed size; four human boxes of "Clipboard and export" (SVG drawing in PowerPoint and Word at true size; the fifth box, the labels, was ticked in error and reopened in batch 2); Paint received a 2607 x 362 px picture. One observation without a tick: closing Chalkbond with an unsaved drawing showed the native prompt "Do you want to save changes to \"Untitled\"?" with Save, Don't save and Cancel, and Don't save closed the app. Open: everything else.
   Batch 2 (2026-11-11), same machine, Office, installed Chalkbond 1.0.0 and way of working as batch 1 (the agent drove the real mouse and keyboard; the orchestrator verified its report against its screenshots and by parsing the exported files, kept in `%TEMP%\chalkbond-Z\human-b2`), scheme "ethanol + acetic acid -> ethyl acetate + water" plus a text H2SO4 above the arrow. Done: copy, close, restart and Ctrl+V brings the editable drawing back; a PowerPoint rectangle pasted into Chalkbond shows "Only drawings copied from Chalkbond can be pasted here."; PNG export at Print (948 x 137 px, `pHYs` 300 dpi, transparent; Word's Insert > Pictures gives 0.46" x 3.16", equal to the pasted SVG); SVG export (PowerPoint's Insert > Pictures identical to the paste); PDF export (one page of the drawing's size, embedded ArialMT, a valid incremental update; read by pdf.js in the default browser and by xpdf without error); all three files reopen in Chalkbond as editable drawings. That is five more boxes ticked and the labels box reopened (`CO₂H` was never drawn), so nine of the twelve human boxes of "Clipboard and export" are ticked. Not done: Microsoft Edge could not be launched on this machine, Adobe Acrobat Reader is not installed, nothing was printed on A4, no chat app was tried. Open: everything else.

Also run: `npm run shots` (97 passed, 220 PNGs), compared by eye by the orchestrator (see "Clipboard and export").

## Checkpoint A — scaffold and tooling

```powershell
git clone https://github.com/AalishMS/chalkbond.git
cd chalkbond
npm install
npm run check
npm run test:e2e
npm run dev
```

- [x] `npm install` completes (Electron binary downloads via `install-electron`)
- [x] `npm run check` passes — typecheck, lint, format, unit tests
- [x] `npm run test:e2e` passes — 1 test, "launches one secure window titled Chalkbond"
- [x] `npm run dev` opens a window titled **Chalkbond** with a grey toolbar and a white canvas
- [x] `git status` is clean after all of the above (no CRLF churn, no generated files)

If something fails, fix it in that session and add a row to the Decisions Log in `SPEC.md`.

## Checkpoint K — svg-render

Run on the Windows machine with Office 2021 installed.

Note 2026-11-12 (owner decision): the Office 2016 on the development machine (Version 2610 Click-to-Run) is accepted in place of Office 2021 for the boxes below.

```powershell
npm run golden:sheet
npm run test:e2e
```

Open `src/core/svg-render/__golden__/` and paste three goldens into PowerPoint and into Word
(open the `.svg` in a browser and copy it, or insert it with Insert > Pictures): `alanine.slides.svg`
(wedge/hash bonds, labels), `acetic-acid-co2h.slides.svg` (`CO2H`, double bond at a label) and
`naphthalene.slides.svg` (aromatic circles).

- [ ] PowerPoint 2021: labels (`OH`, `CO2H`, subscripts) sit on the right glyphs and are in Arial
- [ ] PowerPoint 2021: bond ends stop short of the labels with a visible gap, none runs through text
- [ ] PowerPoint 2021: aromatic circles are round, centred in the rings and as thick as the bonds
- [ ] Word 2021: the same three checks on the same three pictures
- [ ] The image background is transparent in both applications (no white box)
- [x] `npm run test:e2e` passes: 2 tests, including the font calibration against real Arial

## Checkpoint E32 — editor performance

Run on the owner's laptop (the machine the teacher uses), with the app built (`npm run build`):

Note 2026-11-12 (owner decision): the development machine is not the teacher's laptop ("no this laptop is not the one the teacher will use"), so this checkpoint cannot be done on it and stays open.

```
npx vitest run --project perf
npx playwright test e2e/editor-perf.spec.ts
```

Compare the `PERF` lines with the table in `docs/editor-perf.md` and add a row for the laptop.

- [ ] `npx vitest run --project perf` passes on the owner's laptop (bond-drag preview < 10 ms, tidyReaction < 25 ms, createNameIndex < 30 ms, hit-test < 0.5 ms)
- [ ] `e2e/editor-perf.spec.ts` passes on the owner's laptop (drag frames p95 <= 16 ms, commit <= 50 ms, cold start < 3 s); the numbers are added to `docs/editor-perf.md`
- [ ] Dragging a molecule of a 40-atom scheme and drawing a bond feel smooth by eye

## Checkpoint R — editor (human-only checks)

Run on the Windows machine with a build (`npm run dev` or the installed app). Everything an
automated test can see is covered by `npm run test:e2e`; these are what it cannot. The E32 perf
checks above belong to this checkpoint too.

- [ ] Look at `npm run shots` output beside the mock-ups (`node docs/mockups/editor/build.mjs --png out/mockups`): open the PNGs in `out/shots/` (after `npm run shots`) next to the matching `out/mockups/*.png`; layout, colours and icons match the mock-ups at 1280x800 and 960x640
- [ ] Touchpad: a two-finger pinch zooms around the pointer and a two-finger drag pans; zoom stops at 25 % and 800 %
- [ ] 125 % and 150 % Windows display scaling (Settings > System > Display > Scale), restart the app each time: rail icons, option icons and the status-bar icons are crisp (no blur or uneven stroke), canvas bond lines are crisp, text is not clipped, nothing overlaps at the 960x640 minimum window
- [ ] Devanagari IME in the label editor: draw ethanol, hover the O, press Enter, switch the Windows input to Nepali (Devanagari, phonetic or traditional), type `क`, `का` and a word of five letters; the glyphs appear while composing, Enter commits the label once, Esc cancels it, and Ctrl+Z undoes the commit as one step
- [ ] Devanagari IME in the text editor: press T, click the canvas, type "प्रतिक्रिया" with the IME, then type `H2SO4` and Enter; the Devanagari stays intact, `H2SO4` becomes H₂SO₄, and a second text can be started at once
- [ ] Rich paste from Word: in Word type "Heat" with "2" as a subscript and bold "Δ", copy it, press T, click the canvas and press Ctrl+V; the text editor receives plain text only (no Word fonts, colours or sub/superscripts, no stray line breaks) and Enter commits it
- [ ] Pen or touch (only if the teacher uses a touch screen or pen): with the Bond tool a finger or pen tap places a bond and a drag aims one; a tap on the rail changes the tool; nothing needs a hover or a right button
- [ ] Tooltips: hover a rail button and wait; the tooltip appears after about half a second, to the right, and the next one appears at once; moving off all buttons for about a third of a second restores the delay
- [ ] Cursors: arrow over empty canvas and rail with Select; a four-way move cursor over a hovered atom, bond or object with Select; a hand over the rotate handle (closed while turning) and a pointing hand over the other handles; crosshair with Bond, Chain, Ring, Atom, Arrow, Plus and Curly; I-beam with Text and over a text object; the small eraser icon with Erase; an open hand while Space is held and a closed hand while panning
- [ ] A first-use pass without help: draw ethanol, benzene, toluene and "ethanol + acetic acid -> ethyl acetate + water" (SC3); every step is discoverable from the screen alone

## Clipboard and export (clipboard-export, `SPEC-clipboard-export.md` "Windows checks")

Human-only: Office, other applications, eyes. Run with the installed app and Office 2021. Note 2026-11-12 (owner decision): the Office 2016 on the development machine is accepted in place of Office 2021.

Automated checks that only run on Windows (ticked from the orchestrator's run of 2026-11-11):

- [x] `npm run test:e2e` on Windows passes every `e2e/win/clipboard-*.spec.ts` (run by the orchestrator, 2026-11-11, `956a4a4`, 321 passed): probes P1-P7 including P2b (`clipboard-facts`, SC2), the CB-W1 formats, SVG, drawing and 300 dpi PNG (`clipboard-copy`, SC3 and SC4), the paste round trips (`clipboard-paste`, SC5) and the IPC handlers (`clipboard-ipc`). A probe that fails is recorded with its fallback in "Facts relied on" and `formats.ts` (SC2). None failed; the keys are decided (Decision R9).
- [x] `e2e/win/clipboard-perf.spec.ts` passes: copy of the 40-atom scheme reaches the real clipboard in at most 500 ms (median of 5; SC12). Append the measured number to `docs/editor-perf.md` as the Windows row. (Median 47.4 ms in the full run, orchestrator, 2026-11-11; 50.9 ms alone; both rows are in `docs/editor-perf.md`.)
- [x] Look at the C8 and C10 shots (`npm run shots -- C8`, `npm run shots -- C10`) beside the mock-ups A01, A02, A15b and A08a-c (`node docs/mockups/shell/build.mjs --png out/mockups-shell`): the Copy button states, the Export dialog and its three formats match by eye at 1280x800 and 960x640 (SC10). (Compared by the orchestrator on 2026-11-11 against A01, A02, A15b and A08a-c; they match, and the PDF note differs from A08c only in the PDF-A outcome wording, as the spec provides.)

Human-only checks, with the installed app and Office 2021 (owner decision 2026-11-12: the installed Office 2016 is accepted) (SC13: write down which format Office took, SVG drawing or picture):

- [x] Draw the SC3 scheme (Slides), press Copy, Ctrl+V on a blank PowerPoint slide: it arrives as a drawing (ribbon **Graphics Format** = SVG) or a picture (**Picture Format**); write down which. At 400 % zoom lines and text are sharp. Result 2026-11-11: it arrived as the SVG drawing (ribbon **Graphics Format**; SC13: SVG drawing in PowerPoint and Word, Click-to-Run Version 2610); lines and text sharp at 400 %. Scheme "ethanol + acetic acid -> ethyl acetate + water" plus a text "H2SO4" above the arrow. Performed by a computer-use agent at the owner's request, verified by the orchestrator against screenshots and files. Office actually used: Microsoft Office Professional Plus 2016 as the Account page shows it, Version 2610 (Build 20527.20150 Click-to-Run), Current Channel, not Office 2021.
- [x] The pasted bonds measure 1.41 cm (40 pt) in PowerPoint (Format > Size against a known bond count); labels match 24 pt slide text. If Office took the PNG and it is about 3× too big, write down "300 dpi ignored" (accepted for v1, O5). Result 2026-11-11: PowerPoint shows Height 1.21", Width 8.69"; the SVG exported from the same drawing is 625.597 x 86.808 pt (8.689 x 1.206 in), so the paste is at true size; bond segments 40.00 pt (1.41 cm), label font 24 pt (subscripts 16.8 pt). Office took the SVG, so "300 dpi ignored" does not apply. Performed by a computer-use agent at the owner's request, verified by the orchestrator against screenshots and the exported SVG. Office actually used: Microsoft Office Professional Plus 2016 as the Account page shows it, Version 2610 (Build 20527.20150 Click-to-Run), Current Channel, not Office 2021.
- [x] On a dark slide background the pasted drawing has no white or black box. Result 2026-11-11: on a dark blue slide background the drawing sits directly on the colour, no box. Performed by a computer-use agent at the owner's request, verified by the orchestrator against screenshots. Office actually used: Microsoft Office Professional Plus 2016 as the Account page shows it, Version 2610 (Build 20527.20150 Click-to-Run), Current Channel, not Office 2021.
- [x] Switch to Handout, copy, paste into Word 2021: bonds about 5 mm, labels the size of 10 pt body text; sharp at 400 %; the print preview looks like a textbook figure. Result 2026-11-11: pasted into Word (not Word 2021) under a line of Arial 10 pt text as SVG (**Graphics Format**), Height 0.46", Width 3.16" (0.364 of the Slides size, bonds about 14.5 pt = 5.1 mm), label letters about the height of the 10 pt text, sharp at 400 %, print preview a clean black-on-white figure within the page width. Performed by a computer-use agent at the owner's request, verified by the orchestrator against screenshots. Office actually used: Microsoft Office Professional Plus 2016 as the Account page shows it, Version 2610 (Build 20527.20150 Click-to-Run), Current Channel, not Office 2021.
- [ ] `H₂SO₄`, `OH`, `CO₂H` in the pasted drawing are Arial and sit as on screen in PowerPoint and Word (a shift would reopen svg-render's text-as-outlines question).
  - Partly seen 2026-11-11 (not ticked): `H2SO4`, `HO`/`OH`, `H2O` in PowerPoint and Word are plain sans-serif matching the canvas, subscripts smaller and lowered, nothing shifted, overlapping a bond or cut off. The font name inside Office was not read (no Convert to Shape); the SVG declares font-family "Arial, Helvetica, sans-serif". A `CO₂H` label was never drawn, so it is still to be checked; open. Reopened in human batch 2: this box was ticked in batch 1 although `CO₂H` was not among the labels checked. Performed by a computer-use agent at the owner's request, verified by the orchestrator against screenshots and the SVG. Office actually used: Microsoft Office Professional Plus 2016, Version 2610 (Build 20527.20150 Click-to-Run), Current Channel, not Office 2021.
- [ ] Paste into WhatsApp Desktop (or another chat app) and Paint: a picture arrives.
  - Partly seen 2026-11-11 (not ticked): Paint received a picture of 2607 x 362 px (the 300 dpi pixel size of the drawing) on its white canvas, performed by a computer-use agent at the owner's request, verified by the orchestrator. A chat app was not tried; open.
- [x] Copy in Chalkbond, close Chalkbond, start it, Ctrl+V: the drawing comes back editable. Result 2026-11-11 (batch 2): with the installed app, scheme "ethanol + acetic acid -> ethyl acetate + water" plus a text H2SO4 above the arrow, Copy, close Chalkbond (Don't save), start it again, Ctrl+V: the whole scheme including H2SO4 came back as an editable drawing (clicking ethanol selects it, dragging moves only ethanol, Ctrl+Z restores); no recovery box appeared at either start. Performed by a computer-use agent in the Codex desktop app at the owner's request, verified by the orchestrator against screenshots and the exported files. Office actually used: Microsoft Office Professional Plus 2016 as the Account page shows it, Version 2610 (Build 20527.20150 Click-to-Run), Current Channel, not Office 2021.
- [x] Copy a picture in PowerPoint, Ctrl+V in Chalkbond: "Only drawings copied from Chalkbond can be pasted here." Result 2026-11-11 (batch 2): a rectangle copied in PowerPoint, Ctrl+V in Chalkbond: the status bar shows exactly "Only drawings copied from Chalkbond can be pasted here." and nothing is added. Performed by a computer-use agent in the Codex desktop app at the owner's request, verified by the orchestrator against screenshots and the exported files. Office actually used: Microsoft Office Professional Plus 2016 as the Account page shows it, Version 2610 (Build 20527.20150 Click-to-Run), Current Channel, not Office 2021.
- [x] Export PNG at Print: the Photos app shows it (transparent with White background off); Insert > Pictures in Word gives the same size as the pasted SVG within a few percent. Result 2026-11-11 (batch 2): Print with White background off, Handout preset: the dialog says "Sharp on paper. 948 × 137 pixels."; the file is 948 x 137 px, 8-bit RGBA, `pHYs` 11811 x 11811 per metre (300 dpi), a `tEXt` chunk with key `chalkbond` holding the drawing, 121,844 of 129,876 pixels fully transparent. The Windows Photos app shows the drawing (black lines on Photos' dark grey surround, i.e. transparent). Inserted in Word with Insert > Pictures it is Height 0.46", Width 3.16" (Picture Format): Word honoured the file's 300 dpi, and the size is exactly that of the SVG pasted from the same Handout drawing (0.46" x 3.16", Graphics Format). The status-bar notice of this export was not captured. Performed by a computer-use agent in the Codex desktop app at the owner's request, verified by the orchestrator against screenshots and the exported files. Office actually used: Microsoft Office Professional Plus 2016 as the Account page shows it, Version 2610 (Build 20527.20150 Click-to-Run), Current Channel, not Office 2021.
- [x] Export SVG, Insert > Pictures in PowerPoint: identical to the paste. Result 2026-11-11 (batch 2): Slides, notice "Exported batch2-slides.svg."; the file is 625.597 x 86.808 pt with the `<metadata id="chalkbond">` drawing. Inserted in PowerPoint with Insert > Pictures it is Graphics Format, Height 1.21", Width 8.69", identical in size and look to the paste of the same drawing on the neighbouring slide. Performed by a computer-use agent in the Codex desktop app at the owner's request, verified by the orchestrator against screenshots and the exported files. Office actually used: Microsoft Office Professional Plus 2016 as the Account page shows it, Version 2610 (Build 20527.20150 Click-to-Run), Current Channel, not Office 2021.
- [ ] Export PDF, open it in Edge and in Adobe Acrobat Reader: one page the size of the drawing, text selectable, no error or repair prompt; print it on A4: sharp. (Under PDF-A also: open it in Chalkbond, the drawing is editable.)
  - Partly seen 2026-11-11 (not ticked, batch 2): Slides, the dialog's note reads "You can open this file in Chalkbond again to change the drawing."; notice "Exported batch2-slides.pdf.". The file (verified by the orchestrator): 16,166 bytes, %PDF-1.4, one page, MediaBox [0 0 625.92 87.12] pt (the drawing's size), embedded subset font ArialMT with a ToUnicode map, two classic xref sections (the incremental update with /Prev), no XRef stream, no /Encrypt; `pdftotext` (xpdf 4.00, an independent parser) extracts "HO", "H2SO4", "O", "H2O" without an error. Opened in the machine's default browser (Zen, Firefox family, pdf.js viewer): "1 of 1" page the size of the drawing, the labels highlight when selected, no error or repair message. File > Open of the PDF in Chalkbond: "batch2-slides.pdf - Chalkbond" with Slides selected, the scheme as the original, ethanol selectable (editable), no error box. Still open: Microsoft Edge (could not be launched on this machine), Adobe Acrobat Reader (not installed) and printing on A4 paper. Performed by a computer-use agent in the Codex desktop app at the owner's request, verified by the orchestrator.
- [x] Open the exported PNG and SVG in Chalkbond (File > Open): editable and identical. Result 2026-11-11 (batch 2): the PNG opens as "batch2-handout-print.png - Chalkbond" with Handout selected, the SVG as "batch2-slides.svg - Chalkbond" with Slides selected; each shows the same scheme as the original and ethanol can be selected on its own (editable); no error box. The exported PDF opened the same way too (see the PDF box). Performed by a computer-use agent in the Codex desktop app at the owner's request, verified by the orchestrator against screenshots and the exported files. Office actually used: Microsoft Office Professional Plus 2016 as the Account page shows it, Version 2610 (Build 20527.20150 Click-to-Run), Current Channel, not Office 2021.

## App shell and installer (app-shell, `SPEC-app-shell.md` "Windows checks")

Human-only: native chrome, other programs, a clean machine. Run with the installer built in step 6 of Checkpoint Z on a clean Windows 11 account (Windows 10 waived by the owner on 2026-11-12). The automated steps built the installer and smoke-tested the unpacked app; the first human batch (2026-11-11, development machine, by a computer-use agent, verified by the orchestrator) ticked the first box and left a note under the second; everything else is open.

- [x] `npm run dist:win` produces `dist/Chalkbond-1.0.0-setup.exe`; its size and the installed size are written in this spec (I1). Done 2026-11-11 (`dist:win` exit 0 at `956a4a4`): installer 109,915,593 bytes (104.8 MiB), unpacked `dist/win-unpacked` 347,499,681 bytes (331.4 MiB, 21 files), installed 347,681,841 bytes (331.6 MiB, 24 files, measured 2026-11-11 after installing on the development machine); all three are in `SPEC-app-shell.md` I1.
- [ ] On a clean Windows 11 account **without admin rights**, network disconnected: run the installer. SmartScreen shows "Windows protected your PC"; **More info** → **Run anyway** works; no admin prompt; Chalkbond opens by itself; Start-menu and desktop shortcuts show the new icon (A16).
  - Observed 2026-11-11 on the development machine only (Windows 11 Pro 26300, not a clean account): installed from `dist/Chalkbond-1.0.0-setup.exe` (the folder `%LOCALAPPDATA%\Programs\Chalkbond` did not exist before), "Chalkbond Setup, Installing, please wait...", Chalkbond opened by itself, no admin or UAC prompt, no SmartScreen box (the installer was built locally and has no Mark of the Web, so this says nothing about a downloaded or copied installer), desktop shortcut (in the OneDrive-redirected Desktop folder) and Start-menu shortcut "Chalkbond" with the green icon, `HKCU\Software\Classes\.chalk` is "Chalkbond drawing", `Chalkbond.exe` ProductVersion 1.0.0.0. Performed by a computer-use agent at the owner's request, verified by the orchestrator against screenshots, the installed folder, the shortcut files and the registry. Still open: SmartScreen, the installs on clean Windows 10 and Windows 11 accounts without admin rights, network disconnected. Update 2026-11-12 (owner decision, the orchestrator's reading of "no we dont need that"): the Windows 10 install is waived; this box is run on a clean Windows 11 account only, and Windows 10 is untested by hand for 1.0.0.
- [ ] Cold start of the installed app to a usable canvas is under 3 s on the teacher's laptop (`SPEC.md` SC1).
  - Note 2026-11-12 (owner decision): the development machine is not the teacher's laptop, so this box cannot be done here and stays open.
- [ ] Save `test.chalk` on the desktop: Explorer shows the A16 file icon and type "Chalkbond drawing"; double-clicking opens it; double-clicking a second `.chalk` while Chalkbond has unsaved changes shows the save prompt, then opens it in the same window.
- [ ] Menus look like A04–A06 and the context menus like A07 (sentence case, access keys underlined after Alt, shortcuts shown); Alt then F opens File, arrows and Enter work; every shown shortcut works from the canvas; Ctrl+C / Ctrl+V / Ctrl+Z inside the name field act on its text; right-click in the name field shows Cut / Copy / Paste / Select all.
- [ ] Alt+click an atom with Select, release Alt, press B: the Bond tool is chosen and the menu bar is not focused (K3).
- [ ] The save prompt (A09), open errors (A10), recovery box (A11) and About box (A14) look like their mock-ups; Narrator reads their text and buttons.
- [ ] Ctrl+mouse wheel and touchpad pinch zoom the drawing, never the window.
- [ ] Unsaved-changes prompt on title-bar ×, Alt+F4 and File > Exit: Save, Don't save and Cancel each do what they say.
- [ ] Power cut: draw for a minute without saving, wait 15 s, end Chalkbond in Task Manager (or switch the laptop off), start Chalkbond: the recovery box appears and the drawing comes back. Shut Windows down with unsaved changes: at the next start the recovery box appears (RC5).
- [ ] Cancelled shutdown: unsaved changes in Chalkbond and a program that asks before closing (for example Paint with an unsaved picture or Word with an unsaved document; Windows 11's Notepad does not ask: it restores its text and does not hold up a shutdown); choose Shut down; on the "apps are preventing shutdown" screen choose Cancel. Chalkbond is still open with the drawing, and closing it with × shows the save prompt (R24).
- [ ] Shutdown right after an edit: change the drawing and shut Windows down at once; at the next start the recovery box appears and the drawing comes back, at most without changes from the last 2 s (10 s while drawing continuously). Write down whether the last change was there (R24).
- [ ] Shutdown with a label typed but not confirmed: after the restart the recovered drawing contains the label. With an IME composition under way Chalkbond does not delay the shutdown and the drawing comes back without that label (R25).
- [ ] Display scaling 100, 125, 150, 175 %: menu bar, dialogs, Copy button and icons are crisp, nothing is cut off at the 960×640 minimum; the window position is remembered across restarts, also after unplugging an external monitor (the window comes back on the laptop screen).
- [ ] Uninstall from Settings > Apps: shortcuts and the `.chalk` association are gone, `%APPDATA%\Chalkbond` remains, drawings are untouched; reinstalling restores the recent list.
- [ ] Narrator: menu bar, Copy button, dialogs and prompts are announced with their names.
- [ ] About shows version 1.0.0 and the icon; **Licences** opens the notices in Notepad.
