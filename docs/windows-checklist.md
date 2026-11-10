# Windows verification checklist

Run on the Windows machine (PowerShell) at each checkpoint. Tick items in the commit that
records the checkpoint.

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
