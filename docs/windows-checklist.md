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
