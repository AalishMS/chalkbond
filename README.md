# Chalkbond

Chalkbond is a Windows desktop app for drawing chemical structures (aliphatic and aromatic) and
reaction schemes for teaching. It is built for one primary user: a chemistry teacher in Nepal
preparing slides and worksheets for grade 11-12 (NEB curriculum), mostly basic organic chemistry
with IUPAC and common names. The aim is a figure you can paste into PowerPoint or Word as a crisp,
transparent image. The app works fully offline. Target platform is Windows 10/11 x64; the
code is kept green on Linux as well.

The product spec is `SPEC.md`. Chalkbond is a personal project (`UNLICENSED`, private).

## Status

Modules and their order are defined in `CAPABILITY-MAP.md`.

| Module | What it is | Status |
|---|---|---|
| `doc-model` | Document data, edit transactions, undo/redo, file format | done |
| `chem-core` | OpenChemLib wrapper: valence, formula, SMILES/Molfile, name dictionary | done |
| `svg-render` | Document to SVG with style presets | done (Windows Office checklist not yet ticked) |
| `editor` | Interactive canvas and drawing tools | done (Windows "Editor" checklist not yet ticked) |
| `clipboard-export` | Clipboard, PNG/SVG/PDF export | implemented; Windows acceptance open |
| `app-shell` | Menus, dialogs, settings, installer | implemented; Windows acceptance open |

Version 1.0.0 is prepared. It is not released: the installer has not been built or run on Windows,
and the checks in `docs/windows-checklist.md` (Checkpoint Z) are all open.

## The editor

The window is the editor: a tool rail (Select, Erase, Bond, Chain, Ring, Atom, Arrow, Plus, Curly,
Text), an options bar per tool, and a name field that turns a compound name ("ethanol") or a
reaction ("ethanol + acetic acid -> ethyl acetate + water") into a drawing. It draws bonds,
chains, rings and atom labels, selects, moves, rotates, flips, copies and pastes inside the app,
adds reaction arrows, plus signs, curved electron-pushing arrows and conditions text (with Tidy
reaction), warns about valence problems, shows the formula and molar mass, and undoes every
gesture. Everything is reachable by keyboard. `npm run shots` builds the app and writes
screenshots of every screen to `out/shots/<task>/`; the approved mock-ups to compare with come
from `node docs/mockups/editor/build.mjs --png out/mockups`.

## Install (Windows 10/11 x64)

These steps describe the installer once it has been built (`npm run dist:win`, below). They have
not been tried on Windows yet.

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
- Windows 10/11 x64 for the app and installer. Commands are PowerShell-safe.
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
```

## Specs

- `SPEC.md`: objective, stack, commands, code style, boundaries, decisions log.
- `CAPABILITY-MAP.md`: module list, dependencies, build order.
- `SPEC-doc-model.md`, `SPEC-chem-core.md`, `SPEC-svg-render.md`, `SPEC-editor.md`, `SPEC-clipboard-export.md`, `SPEC-app-shell.md`: one per module.
- `AGENTS.md`: working rules for coding agents (also useful for people). `CLAUDE.md` adds notes for Claude Code.
