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
| `editor` | Interactive canvas and drawing tools | not started (next) |
| `clipboard-export` | Clipboard, PNG/SVG/PDF export | not started |
| `app-shell` | Menus, dialogs, settings, installer | scaffold only |

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
npm run build               # electron-vite build -> out/
npm run dist:win            # NSIS installer for Windows x64 -> dist/
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

## Layout

```
src/core/doc-model/      document types, edits, history, serialization
src/core/chem-core/      chemistry (the only code that imports openchemlib)
src/core/svg-render/     SVG rendering; __golden__/ holds the reference SVGs
src/main/  src/preload/  Electron main process and preload bridge
src/renderer/            React UI (editor will live in src/renderer/editor)
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
- `SPEC-doc-model.md`, `SPEC-chem-core.md`, `SPEC-svg-render.md`: one per finished module.
- `AGENTS.md`: working rules for coding agents (also useful for people). `CLAUDE.md` adds notes for Claude Code.
