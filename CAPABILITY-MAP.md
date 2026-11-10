# Capability Map: Chalkbond

Chalkbond is a Windows desktop app (Electron) for drawing chemical structures and reaction
schemes for teaching, and copying them into Word / PowerPoint.

Status: **approved 2026-11-09**. Module ids are stable — do not rename.

| Module id | Responsibility | Depends on | Spec |
|---|---|---|---|
| `doc-model` | Document data (atoms, bonds, arrows, plus signs, text, annotations, groups); edit transactions with undo/redo; sub-document extract/insert; native file (de)serialization + schema migration | — | `SPEC-doc-model.md` |
| `chem-core` | OpenChemLib wrapper: implicit H, valence warnings, aromaticity, formula/MW, SMILES/MOL in/out, 2D "Clean Structure", abbreviation expansion, offline name→structure dictionary | `doc-model` | `SPEC-chem-core.md` |
| `svg-render` | Document → SVG using a style preset (Slides, Journal/ACS-style). Single source of truth for screen, clipboard and export output | `doc-model`, `chem-core` | `SPEC-svg-render.md` |
| `editor` | Interactive canvas and all drawing tools: bonds, atoms, chains, rings/templates (aliphatic + aromatic), selection/transform, reaction arrows + conditions + "Tidy reaction", curved electron-pushing arrows, annotations, keyboard shortcuts, zoom | `doc-model`, `chem-core`, `svg-render` | `SPEC-editor.md` |
| `clipboard-export` | Copy selection/document to the Windows clipboard (PNG + SVG); export PNG/SVG/PDF; embed document so exported SVG/PNG can be reopened as editable | `doc-model`, `svg-render` | `SPEC-clipboard-export.md` |
| `app-shell` | Electron main/preload, window, menus, file dialogs, recent files, settings, NSIS packaging for Windows x64 | all of the above | `SPEC-app-shell.md` |

```
doc-model ──► chem-core ──► svg-render ──► editor ──────────┐
     │                          │                           ▼
     └──────────────────────────┴──► clipboard-export ──► app-shell
```

## Build order

0. `app-shell` **scaffold only** — empty window launches, test/lint/build tooling works.
1. `doc-model`
2. `chem-core`
3. `svg-render`
4. `editor` (largest module; its spec splits work into tool groups): **done**; `clipboard-export` is next
5. `clipboard-export`
6. `app-shell` complete + Windows installer

Each module runs Specify → Plan → Tasks → Implement, gated on review.
Shared stack, commands, code style and boundaries live in `SPEC.md`.
