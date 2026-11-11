# Windows verification checklist

**Checkpoint Z (release) is partly run.** The automated steps 1-7 of "Checkpoint Z" ran and passed
on Windows on 2026-11-11 at `956a4a4`, run and read by the orchestrator. Step 8 is half done (the
installer and unpacked sizes are written; the installed size is open) and step 9, the human
sections, is open: the human boxes in "Clipboard and export" and every box in "App shell and
installer" are unticked. The release is not declared until they pass.

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
9. The human sections below ("Clipboard and export" and "App shell and installer"), on Windows 10 and Windows 11.

State on 2026-11-11, at `956a4a4`, on Windows 11 Pro 26300 (Node 26.3.0, npm 11.16.0, Electron 45.2.3,
i5-11400H, 16 GB, display at 125 % with a second monitor). Run and read by the orchestrator:

1. `npm ci`: exit 0.
2. `npm run check`: exit 0, 231 files, 4038 tests.
3. `npm run test:e2e`: exit 0, 321 passed, 6.9 min, including `e2e/win/`, the font calibration against real Arial, the PDF probes P8 and P9 (outcome PDF-A confirmed on Windows) and the native window specs. Earlier the same day: 308 passed and 13 failed at `b99a6d6`, 319 passed and 1 failed at `85f968a`; the defects are in the `SPEC.md` Decisions Log.
4. `npm run test:e2e:os-input`: exit 0, 1 passed (the mouse was left alone).
5. The C3 probes P1-P7 and P2b passed inside step 3. The keys were decided by them (Decision R9 in `SPEC-clipboard-export.md`).
6. `npm run dist:win`, from a real console window: exit 0; `dist/Chalkbond-1.0.0-setup.exe` 109,915,593 bytes (104.8 MiB), `dist/win-unpacked` 347,499,681 bytes (331.4 MiB, 21 files), `dist/builder-effective-config.yaml` written.
7. `npm run test:packaged` against `dist/win-unpacked`: exit 0, 7 passed.
8. Installer and unpacked sizes are written in `SPEC-app-shell.md` I1. The installed size is not measured yet: it comes from the owner's install.
9. Not started: no human box is ticked.

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

Human-only: Office, other applications, eyes. Run with the installed app and Office 2021.

Automated checks that only run on Windows (ticked from the orchestrator's run of 2026-11-11):

- [x] `npm run test:e2e` on Windows passes every `e2e/win/clipboard-*.spec.ts` (run by the orchestrator, 2026-11-11, `956a4a4`, 321 passed): probes P1-P7 including P2b (`clipboard-facts`, SC2), the CB-W1 formats, SVG, drawing and 300 dpi PNG (`clipboard-copy`, SC3 and SC4), the paste round trips (`clipboard-paste`, SC5) and the IPC handlers (`clipboard-ipc`). A probe that fails is recorded with its fallback in "Facts relied on" and `formats.ts` (SC2). None failed; the keys are decided (Decision R9).
- [x] `e2e/win/clipboard-perf.spec.ts` passes: copy of the 40-atom scheme reaches the real clipboard in at most 500 ms (median of 5; SC12). Append the measured number to `docs/editor-perf.md` as the Windows row. (Median 47.4 ms in the full run, orchestrator, 2026-11-11; 50.9 ms alone; both rows are in `docs/editor-perf.md`.)
- [x] Look at the C8 and C10 shots (`npm run shots -- C8`, `npm run shots -- C10`) beside the mock-ups A01, A02, A15b and A08a-c (`node docs/mockups/shell/build.mjs --png out/mockups-shell`): the Copy button states, the Export dialog and its three formats match by eye at 1280x800 and 960x640 (SC10). (Compared by the orchestrator on 2026-11-11 against A01, A02, A15b and A08a-c; they match, and the PDF note differs from A08c only in the PDF-A outcome wording, as the spec provides.)

Human-only checks, with the installed app and Office 2021 (SC13: write down which format Office took, SVG drawing or picture):

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

## App shell and installer (app-shell, `SPEC-app-shell.md` "Windows checks")

Human-only: native chrome, other programs, a clean machine. Run with the installer built in step 6 of Checkpoint Z on a clean Windows 10 and a clean Windows 11 account. No human has run anything here yet; the automated steps built the installer and smoke-tested the unpacked app.

- [ ] `npm run dist:win` produces `dist/Chalkbond-1.0.0-setup.exe`; its size and the installed size are written in this spec (I1).
- [ ] On a clean Windows 10 and a clean Windows 11 account **without admin rights**, network disconnected: run the installer. SmartScreen shows "Windows protected your PC"; **More info** → **Run anyway** works; no admin prompt; Chalkbond opens by itself; Start-menu and desktop shortcuts show the new icon (A16).
- [ ] Cold start of the installed app to a usable canvas is under 3 s on the teacher's laptop (`SPEC.md` SC1).
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
