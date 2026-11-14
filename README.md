# Chalkbond

Chalkbond is a Windows desktop app for drawing chemical structures (aliphatic and aromatic) and
reaction schemes for teaching. It is built for one primary user: a chemistry teacher in Nepal
preparing slides and worksheets for grade 11-12 (NEB curriculum), mostly basic organic chemistry
with IUPAC and common names. The aim is a figure you can paste into PowerPoint or Word as a crisp,
transparent image. The app works fully offline. Target platform is Windows 10/11 x64 (Windows 10 was not tested by hand before 1.0.0 (owner decision 2026-11-12)); the
code is kept green on Linux as well.

The product spec is `SPEC.md`. Chalkbond is a personal project (`UNLICENSED`). The product
website is https://aalishms.github.io/chalkbond/ (source in `site/`, published by
`.github/workflows/pages.yml` on every push to `main` that changes it).

## Status

Modules and their order are defined in `CAPABILITY-MAP.md`.

| Module | What it is | Status |
|---|---|---|
| `doc-model` | Document data, edit transactions, undo/redo, file format | done |
| `chem-core` | OpenChemLib wrapper: valence, formula, SMILES/Molfile, name dictionary | done |
| `svg-render` | Document to SVG with style presets | done (automated Windows checks passed; Office checks ticked 2026-11-12 from the owner's hand checks) |
| `editor` | Interactive canvas and drawing tools | done (automated Windows checks passed; "Editor" checks ticked 2026-11-12, pen or touch not applicable (mouse or touchpad only); E32 open on the teacher's laptop) |
| `clipboard-export` | Clipboard, PNG/SVG/PDF export | implemented; automated Windows gates passed; every human check ticked 2026-11-12 from the owner's hand checks |
| `app-shell` | Menus, dialogs, settings, installer | implemented; automated Windows gates passed; installed on the development machine; human checks ticked 2026-11-12 except the cold start on the teacher's laptop; the owner's re-checks on the final installer are open |

Version 1.0.0 is prepared. It is not released: the automated Windows gates passed on 2026-11-11,
the installer was installed on the development machine, and on 2026-11-12 the owner ran 31 checks
by hand with the installed app ("everything works well. the tests pass."; details were not reported
per item). The owner's written answers the same day closed "Shutdown right after an edit" (the last
change was there) and the pen or touch check (not applicable: mouse or touchpad only). Still open in
`docs/windows-checklist.md` (Checkpoint Z): on the teacher's laptop, Checkpoint E32 and the cold
start. The owner decided to add features before the release; the human
checks they touch will be repeated on the final installer. Owner decisions 2026-11-12: the human
checks run on Windows 11 only (Windows 10 is untested by hand for 1.0.0); the Office on the
development machine (Office 2016) is accepted for the Office checks; the development machine is not
the teacher's laptop, so the teacher's-laptop checks stay open.

The feature set of 2026-11-12 is implemented: number keys for the tool rail (1 to 9 and 0), a
"Show structural" / "Show skeletal" switch that writes the carbons (CH3, CH2) with bonds twice as
long, and a clipboard picture on a white background with a small margin (so it shows in dark-mode
chat apps). A structural drawing is saved as a version 2 `.chalk` file (a skeletal one is still
version 1, and the 1.0.0 build cannot open version 2). Its automated gates passed on Windows 11 at
`e34414b` on 2026-11-12 (check, e2e, OS-input test, installer build, packaged smoke test, shots).
The release is not declared and Checkpoint Z is not reached. Open: the owner's hand re-checks on the
final installer (`docs/windows-checklist.md`, "Re-checks after the 2026-11-12 feature set") and, on
the teacher's laptop, Checkpoint E32 and the cold start. The fixes that touched cross-platform code
still need a Linux re-run (list in the checklist).

## The editor

The window is the editor: a tool rail (Select, Erase, Bond, Chain, Ring, Atom, Arrow, Plus, Curly,
Text; keys 1 to 9 and 0 pick them in that order, the letters still work), an options bar per tool, and a name field that turns a compound name ("ethanol") or a
reaction ("ethanol + acetic acid -> ethyl acetate + water") into a drawing. It draws bonds,
chains, rings and atom labels, selects, moves, rotates, flips, copies and pastes inside the app,
adds reaction arrows, plus signs, curved electron-pushing arrows and conditions text (with Tidy
reaction), warns about valence problems, shows the formula and molar mass, and undoes every
gesture. Everything is reachable by keyboard. `npm run shots` builds the app and writes
screenshots of every screen to `out/shots/<task>/`; the approved mock-ups to compare with come
from `node docs/mockups/editor/build.mjs --png out/mockups`.

## Install (Windows 10/11 x64)

These steps describe the installer built by `npm run dist:win` (below). The installer has been
built on Windows, but these steps have not been tried yet. Windows 10 was not tested by hand before 1.0.0 (owner decision 2026-11-12).

1. Copy `Chalkbond-1.0.0-setup.exe` to the computer. No network and no administrator rights are needed.
2. Run it. The installer is unsigned, so Windows shows "Windows protected your PC": choose
   **More info**, then **Run anyway**.
3. Chalkbond installs for your user only and opens by itself. It adds Start-menu and desktop
   shortcuts and associates `.chalk` files.
4. To remove it, use Settings > Apps. Your drawings and `%APPDATA%\Chalkbond` (settings, recent
   files, recovery) are kept.

## First use

- Type a name such as "ethanol" in the name field, or draw with the tool rail (Bond, Chain, Ring,
  Atom and the others). Help > Keyboard shortcuts lists every key.
- **Copy** (top right, or Ctrl+C) puts the selection, or the whole drawing when nothing is
  selected, on the clipboard. Paste it into PowerPoint or Word with Ctrl+V: it arrives as a
  transparent picture, and pasting it back into Chalkbond gives an editable drawing. The preset at
  the bottom right (Slides or Handout) sets the size it takes in Office.
- **Save** (Ctrl+S) writes a `.chalk` file; **Open** (Ctrl+O) reads one. **Export** (Ctrl+E) writes
  PNG, SVG or PDF; an exported PNG or SVG (and PDF) can be opened again in Chalkbond and edited.
- If the computer loses power, start Chalkbond again: a box offers to recover the drawing (it is
  saved at most 10 seconds behind).

## Prerequisites

- Node.js and npm. Development has been done on Node 26.3 and npm 11.16.
- Windows 10/11 x64 for the app and installer (Windows 10 was not tested by hand before 1.0.0 (owner decision 2026-11-12)). Commands are PowerShell-safe.
- `npm install` downloads the Electron binary (postinstall runs `install-electron`).

## Commands

```
npm install                 # install dependencies
npm run dev                 # app with hot reload (electron-vite dev)
npm run check               # typecheck, lint, format check, unit/perf/tooling tests
npm test                    # vitest run
npm test -- --coverage      # with a coverage report (text + html in coverage/)
npm run test:e2e            # electron-vite build, then Playwright against the built app
npm run golden:sheet        # write out/golden-sheet.html from the committed goldens
npm run shots               # build, then write editor screenshots to out/shots/<task>/
npm run build               # electron-vite build -> out/
npm run dist:win            # NSIS installer for Windows x64 -> dist/Chalkbond-<version>-setup.exe
npm run test:packaged       # smoke test of the unpacked packaged app (after dist:win)
npm run icons               # regenerate the app and file icons in build/
npm run notices             # regenerate build/THIRD-PARTY-NOTICES.txt
```

Other commands: `npm run typecheck`, `npm run lint`, `npm run format`, `npm run format:check`,
`npm run test:watch`, `npm start` (preview the build).

Dev-time scripts (never run by `check`):

```
npm run golden:sheet -- --png out/sheet.png     # also screenshot the sheet (needs Playwright's Chromium)
node scripts/build-font-metrics.mjs <regular.ttf> <bold.ttf>   # regenerate svg-render's font-metrics.ts
node scripts/build-compounds.mjs                # rebuild resources/compounds/compounds.json (needs network)
```

If the screenshot step cannot find a browser, run `npx playwright install chromium`.

## Building from source

On Windows 10/11 x64 with Node.js and npm: `npm ci`, then `npm run dist:win`. The first build
downloads the NSIS toolset once, so that machine needs network access that one time; the app
itself never uses the network. The installer is `dist/Chalkbond-1.0.0-setup.exe`. Run
`npm run test:packaged` afterwards to smoke-test `dist/win-unpacked`. The manual checks for a
release are in `docs/windows-checklist.md`.

## Layout

```
src/core/doc-model/      document types, edits, history, serialization
src/core/chem-core/      chemistry (the only code that imports openchemlib)
src/core/svg-render/     SVG rendering; __golden__/ holds the reference SVGs
src/main/  src/preload/  Electron main process and preload bridge
src/renderer/            React UI; the editor lives in src/renderer/editor
resources/               compounds dictionary (JSON), icons
scripts/                 dev-time generators and the golden contact sheet
e2e/                     Playwright tests against the Electron app
tests/tooling/           tests of the tooling itself (lint rules, font table, goldens)
tasks/                   plan-<module>.md and todo-<module>.md per module
docs/windows-checklist.md   manual checks on the Windows machine
site/                    the product website (static, GitHub Pages)
```

## Specs

- `SPEC.md`: objective, stack, commands, code style, boundaries, decisions log.
- `CAPABILITY-MAP.md`: module list, dependencies, build order.
- `SPEC-doc-model.md`, `SPEC-chem-core.md`, `SPEC-svg-render.md`, `SPEC-editor.md`, `SPEC-clipboard-export.md`, `SPEC-app-shell.md`: one per module.
- `AGENTS.md`: working rules for coding agents (also useful for people). `CLAUDE.md` adds notes for Claude Code.
