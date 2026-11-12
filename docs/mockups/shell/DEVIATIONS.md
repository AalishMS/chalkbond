# Shell and export mock-ups: deviations from SPEC-app-shell.md and SPEC-clipboard-export.md

Static mock-ups of everything `clipboard-export` and `app-shell` add around the editor. The two
specs' "UI design" sections are the source; each row below is a place where the mock-ups differ,
so the specs can be updated to match (or the mock-up reverted).

Files: `shell-tokens.css` (new tokens only; the editor's `../editor/tokens.css` applies unchanged),
`shell.css` (in-window UI, tokens only: exactly what will be built), `shell-icons.svg` (new icons,
editor sprite rules), `native.css` + `native.svg` (Windows 11 stand-ins for the title bar, menu
bar, popup menus and message boxes: not built, approximate), `icons-sheet.css` and `tabs-sheet.css` (sheet layout
only), `app-icon*.svg` / `file-icon*.svg` (icon sources), `A*.html` (one per screen),
`canvas/*.svg` (real svg-render output), `build.mjs` + `pages.mjs` (regenerate everything;
`--png <dir>` screenshots every page with Playwright's Chromium at device scale 1; `--serve`
serves `docs/mockups` on 127.0.0.1). The editor parts (rail, top bar, options, status bar) come
from `../editor/pages.mjs`, so the two sets cannot drift.

## Structural concerns (most important first)

1. **The rail does not fit a 960 × 640 window any more (A15).** The native title bar (31 px) and
   menu bar (20 px) take 51 px from the page, leaving 589 px; the rail needs 544 px of the space
   between top bar and status bar, which is now 511 px, so Text is cut off and the rail scrolls
   with a hidden scrollbar. Proposal (A15b): `useContentSize: true` and a minimum **content**
   size of 960 × 640 (window about 960 × 691). A maximized window on a 1366 × 768 laptop still
   has about 669 px of page, so nothing changes there.
2. **Icon-only Copy below 1100 px is not self-explanatory, and it does not fit either.** Two
   overlapping sheets read as "duplicate" as easily as "copy", and nothing says "PowerPoint".
   At 960 px the widest options bar (Atom: 10 elements, 6 marks) already leaves only about 28 px,
   so even the 32 px icon button makes the bar overflow and hides δ−. Proposal: keep the word,
   drop the icon (label-only "Copy", 56 px), shrink the name field to 204 px and put Copy 8 px
   from Redo below 1100 px. The Atom bar then fits at 960 with **2 px to spare**: fragile, so the
   implementation should prove it with an e2e shot at 960 (or the minimum width should be 1000).
3. **Copy moved to the right end of the top bar, after Undo/Redo** (spec: before Undo). The top
   right corner is where Office, browsers and Canva put the "send it on" action; Copy becomes the
   last stop of the bar, and Undo/Redo stay exactly where the approved editor and the built app
   already have them. Needs editor required change 1 to place the `actions` slot after the history
   group; tab order becomes name field → options → Undo → Redo → **Copy** → rail.
4. **Two bands of chrome.** Windows draws the title bar and menu bar white; the editor top bar is
   `--chrome-bg` grey with its own border. The window still reads as one frame at 1280 × 800
   (A01) and at 960 (A15b), but it is 99 px of chrome before the canvas. It cannot be styled;
   accepted, not fixed.
5. **Shortcuts dialog height.** Spec: top 96 px, max height `calc(100vh - 96px)`, so its bottom
   touches the window edge. Mock-up: 32 px left below (`--dialog-bottom`). It still scrolls
   (about 55 rows); a teacher may not notice, so the list ends on a rule above the footer and has
   an always-visible thin scrollbar (A12 draws a stand-in thumb: headless Chromium hides
   scrollbars).
6. Path of the normative files: spec A12 says `docs/mockups/app/` and `app-tokens.css`; they are
   `docs/mockups/shell/` and `shell-tokens.css` (orchestrator instruction).

## Deviations

| Spec | Mock-up | Why |
|---|---|---|
| Screens rendered at 1280 × 800 (A15 at 960 × 640) | The **window** (outer, title bar included) is 1280 × 800 (960 × 640) on a desktop with 24 px around it and a caption below: PNGs 1328 × 872 and 1008 × 712. Page inside: 1280 × 749; canvas 1215 × 671; scheme at zoom to fit = 117 % | Native parts need a caption outside the frame; an Electron window's size includes its title bar and menu bar |
| A01 title `*ethanol - Chalkbond` | `*esterification - Chalkbond`; the same name in the save prompt and notices | The drawing on screen is the esterification scheme |
| Copy before Undo/Redo, 12 px gap | after Redo, 12 px gap (8 px below 1100 px) | Structural concern 3 |
| Copy below 1100 px: icon only 32 × 32 | label only, `min-width: var(--copy-compact-w)` 56 px, padding 0 12; name field `--namefield-compact` 204 px | Structural concern 2. The spec's variant is still drawn in A03 and A15 |
| Copy padding 0 12 0 8, icon + 4 + label, min 84 | unchanged; label left-aligned so "Copy" → "Copied" does not move the icon | Keeps the icon still while the label changes |
| Dialog shadow `--shadow-1` | new `--shadow-dialog` (0 12 32 rgba(31,35,40,.2) + 1 px `--border` ring) | `--shadow-1` (made for dropdowns) is lost on the 32 % scrim; a modal needs a clearer edge |
| Export: "Size" label left of the segmented control | label above, like "Format" | One alignment rule in a narrow dialog; nothing to line up beside |
| Size meanings only in tooltips ("Print — 300 dpi, sharp on paper") | live line under the control names the chosen size and its pixels: "Sharp on paper. 2,984 × 362 pixels." (Screen: "For messages and websites.", Poster: "For large prints.") | Tooltips need hovering; the teacher should see what "Print" means without it. No "dpi" on screen. When reduced (R3): "… pixels (less sharp: the drawing is very large)" |
| Segmented control outline 1 px `--border`, segments padding 0 12 | outline and dividers 1 px `--border-control`; segments min-width 76 | `--border` on white is 1.3 : 1 and the control looked like loose words; matches the secondary button's edge |
| Reopen line: `--type-xs --text-muted` | adds the 16 px `info` icon; the PDF version ("PDF files can't be opened in Chalkbond again. Keep the drawing as a .chalk file too.") in `--text` | The PDF line is a caution and must not be skipped; same position and size in all three states |
| Checkbox help "Leave off for slides with a coloured background." | "Leave this off for slides with a coloured background." | Reads as a sentence |
| Key chip: 1 px border, padding 0 6 | 1 px border with a 2 px bottom edge, padding 0 4, min-width 20; a combination is one chip per key joined by a muted "+" (Ctrl + Shift + L); alternatives side by side | Reads as keys on a keyboard at a glance; the teacher presses what she sees |
| Shortcuts rows: terse meanings ("set the element", "reset zoom", "pan", "nudge") | plain sentences: "Change it to that element", "Change it to chlorine (Cl)", "Add a single, double or triple bond", "Type a label, such as OH or CH3", "Move the selection (hold Shift to move further)", "Zoom to 100%", "Move around the drawing", "New drawing", "Insert Δ (heat)"; key column 136 px (C H N O S P F I wraps to two lines) | Teacher language; the 184-px column left a wide gap between key and meaning |
| Edit menu: `&Copy` always | `&Copy whole drawing` when nothing is selected (like the context menu) | One label for one behaviour in both menus; says what will happen |
| View menu `&Reset zoom  Ctrl+1` | `Zoom to &100%  Ctrl+1` | Matches the editor's zoom tooltip "Zoom to 100% (Ctrl+1)"; "reset" does not say to what |
| Recovery box `type: 'warning'`, buttons Recover · Discard, detail "Do you want to recover it?" | `type: 'info'`, buttons **Recover** · **Delete**, detail "Do you want to recover it? If you delete it, it can't be brought back." | The news is good (the work was kept): a yellow triangle and the warning sound alarm; "Discard" is jargon and hides that it is final |
| Notice "Copied. The drawing is very large, so the picture is 150 dpi." | "Copied. The drawing is very large, so the picture is less sharp than usual." | No "dpi" |
| "Couldn't copy to the clipboard. Please try again." | "Couldn't copy. Please try again." | "Clipboard" is not a word the teacher uses |
| "The copied drawing is damaged and can't be pasted." | adds "Copy it again." | Says what to do next |
| "That text is too long to insert." | "That text is too long to paste." | She pasted; "insert" is our word |
| "Exported ethanol.png at 300 dpi. The drawing is very large." | "Exported ethanol.png. The drawing is very large, so the picture is less sharp than you chose." | No "dpi"; says what changed |
| "Exported ethanol.png. The drawing is too large to keep editable inside the picture." | "Exported ethanol.png. It is too large to open again in Chalkbond, so keep the .chalk file." | Says the consequence and the next step |
| RC4 "Recovered your drawing. Open ethanol.chalk again after saving it." | "Recovered your unsaved drawing. Save it, then open ethanol.chalk again." | Steps in the order she does them |
| App icon tile `#24584a` (IC1, IC2) | `#2f6e60` | On a dark taskbar `#24584a` is 2.0 : 1 against `#202020` and the tile edge melts; `#2f6e60` is 2.7 : 1, chalk-white on it is still 5.5 : 1, and it moves further from Excel's green toward slate |
| IC2 file icon: ring centred at (132, 150) | the whole glyph (ring and substituent) centred there | Centring the ring pushed the bond end to x 210, past the page edge (208) |
| A16 sizes 16, 20, 24, 32, 48, 256 | adds 64; adds a light and a dark taskbar with stand-in tiles for Explorer, Word, PowerPoint, Excel and Edge (not their logos) | Task brief; judging the icon needs its neighbours |
| (none) | A15b: the proposal for concerns 1 and 2; A08a: opened with Ctrl+E, so the chosen card shows its focus ring (A08b/c: chosen with the mouse) | So both can be judged |

## Tabs and the menu button (owner decisions 2026-11-12; A01, A18-A21)

The native menu bar is gone, a tab strip (one tab per drawing) sits under the top bar in the canvas
column, and a menu button opens File, Edit, View and Help. These rows supersede SPEC-app-shell.md
O3 (always-visible native menu bar) and the `*` title rule; the spec is not edited here.
**Superseded pages are kept as they were**, each with a "Superseded" caption: A04-A06 (menus under
the old menu bar; the trees are now reached from the menu button, A19), A09 (save-changes prompt: a
named drawing saves itself; A20 is the prompt for an unnamed one), A15, A15b, A15c (minimum window;
A21). Every other page (A01-A03, A08, A10-A14) was updated in place to the new chrome.

| Topic | Mock-up | Why |
|---|---|---|
| Window chrome | Title bar 31 px only. Content 960 x 640 means a 960 x 671 window (A15b: 691). The page loses the 20 px menu bar and gains a 33 px strip: canvas 1215 x 658 at 1280 x 800 (was 671), 895 x 529 at the minimum | Owner decisions 1 and 2 |
| Window title | `esterification - Chalkbond`: the active tab's name; a leading `*` means "not saved as a file" (W3), so an unnamed drawing with content reads `*Untitled 2 - Chalkbond` (A20) | Autosave: a drawing that has a file has no unsaved changes |
| Strip | 32 px + 1 px line (33 px, as `--topbar-h`). Tabs 28 px high, 4 px under the top bar's line (breathing room, and the active tab reads as a tab); the active one is 29 px and covers the line. The rail runs down both rows, so its top meets the strip's top | Chrome's strip is 34 px; 32 px keeps 24 px hit targets and costs 12 px net against the old 20 px menu bar |
| Tab | 96-200 px wide (200 by default), padding 12 left / 4 right, `--type-sm`, title cut with an ellipsis; 2 px gap and a faint 1 px divider between inactive tabs (hidden beside the active or a hovered tab) | 200 px holds "esterification" and most names; 96 px leaves about 6 letters, and 8 tabs still fit in the 895 px column of the minimum window |
| Tab colours | Inactive: strip colour (`--chrome-bg`), `--text-muted` title (5.7 : 1). Hover `--hover-bg`, pressed `--pressed-bg`, title `--text`. Active: `--canvas-bg` so it runs into the canvas, `--text`, a 2 px `--accent` line on top. Keyboard focus: 2 px `--accent` ring, inset | The active tab differs from the strip by only 1.07 : 1, so the accent line is the non-colour cue (5.4 : 1), as the rail's accent bar. No new colour token |
| Close cross | 24 x 24 button, 16 px glyph, on the active tab and on a hovered or keyboard-focused one (room always kept, so titles never move); hover `--pressed-bg`, pressed `--border` with a 1 px `--border-control` ring. Not a tab stop (tabindex -1); Ctrl+W and middle click close | Follows Firefox; fewer marks on a calm strip |
| New tab | 28 x 28 button right after the last tab (pinned at the right end when the strip overflows), `add` icon 20 px, tooltip "New tab" Ctrl+T | Chrome position |
| Saving | T5 and T6 of SPEC-app-shell.md. **A file tab shows nothing**, also while it writes (no "Saving..."). **Unsaved: a 6 px dot** (`--text-muted`, 5.7 : 1) before the title: an unnamed drawing with content, an edited picture tab, a kept copy; tooltip "Not saved as a file yet. Chalkbond keeps it for you. Press Ctrl+S to save it." **Unavailable file (AS6) or unkept drawing (SS6): the 16 px warning icon in `--warning` in the dot's place**; tooltips "Couldn't save this file. Check that its folder is still there, or use Save as." and "Chalkbond couldn't keep this drawing. Free some disk space, or save it with Save as." (verbatim from T5). An unnamed empty drawing shows nothing | One marker per problem: the dot is calm, the icon asks for action |
| Overflow | Tabs shrink to 96 px, then the strip scrolls; two 24 x 28 chevrons appear at the ends, each only on a side that has more tabs; the wheel scrolls, and new and chosen tabs scroll into view | Chevrons are more discoverable for a non-technical user than a hidden wheel, and cost nothing until about 9 tabs. No tab-list dropdown (one more control) |
| Drag to reorder | The tab lifts (`--shadow-2`) and follows the pointer, its place dims to 45 %, a 2 px `--accent` line shows the drop position | Needs only the position, not a live reflow |
| Tab context menu | Native popup: New tab Ctrl+T, Close tab Ctrl+W, separator, Reopen closed tab Ctrl+Shift+T (no "Close other tabs" or "Close tabs to the right") | Spec |
| Tab tooltip | Title = the full name; help "Switch tabs with Ctrl+Tab and Ctrl+Shift+Tab." | The only place the two keys are shown on screen |
| Menu button | 32 x 32 (`--topbar-btn`), `menu` icon 20 px, first item of the top bar, 8 px before the name field; open: stays pressed (`aria-expanded`); tooltip "Menu (Alt or F10)". The popup lists File, Edit, View, Help as submenus; File is New tab Ctrl+T, Open... Ctrl+O, Open recent, Save, Save as..., Export..., Reopen closed tab Ctrl+Shift+T, Close tab Ctrl+W, Exit. Opened with the mouse, so access keys are not underlined (A04-A06 were opened with the keyboard). Ctrl+N stays as an alternative to New tab (listed in A12). New tab, Reopen closed tab and Close tab are approved | Owner decision 2 |
| Close prompt (A20) | Message "Do you want to save “Untitled 2”?", detail "If you don't save, your drawing will be lost.", buttons Save, Don't save, Cancel; window title `*Untitled 2 - Chalkbond` | Spec; modelled on A09 |
| Minimum window (A21) | The 960 px top bar had 2 px to spare in the Atom bar (A15b); the menu button takes 40 px, so below 1100 px option buttons are 28 px wide instead of 32 (`has-tabs` only; hit target 24 px or more). Every bar fits: Atom 16 px spare, Select with Expand 10 px, the rest more | The name field (204 px) and Copy (label-only) already gave all they could; narrower option buttons cost the least |

## Decisions folded in (round 2) and what is left to sync

1. Tidy reaction moved from Ctrl+Shift+T to **Ctrl+Shift+R** (A12). Ctrl+Shift+T is "Reopen closed tab".
2. A12 "Tabs and files" section (was Files; ends with F10 Open the menu, F1): New tab Ctrl+T / Ctrl+N, Close tab, Reopen closed tab, Next tab / previous tab
   Ctrl+Tab / Ctrl+Shift+Tab, Go to tab 1-8 Ctrl+1-8, Go to the last tab Ctrl+9. Ctrl+N New drawing is gone.
3. **Zoom to 100% has no shortcut** (Ctrl+1 now goes to tab 1). A12 lists only keyed commands, so its
   "Zoom to 100%" row is dropped; A06 and the status-bar zoom button show no key. (The editor mock-up
   `pages.mjs` zoom button label lost its "(Ctrl+1)" too.) A19 shows only the File submenu, which has no zoom.
4. Closing the last tab leaves one empty "Untitled" tab (A18 "One tab").
5. **To sync at implementation:** `src/renderer/app/model/shortcuts.ts` must match the A12 `SHORTCUTS` rows,
   otherwise `src/renderer/app/model/shortcuts.test.ts` (which mirrors `pages.mjs`) fails. The editor keymap
   (Tidy) and the editor zoom tooltip text follow.
6. Decided (R48, T12): "Reopen closed tab" also brings back an unnamed drawing closed with Don't save, for the current run (the last 10 closed tabs).

## New tokens (in `shell-tokens.css`; merge into `app-tokens.css` or `tokens.css`)

From the spec, unchanged: `--primary-bg`, `--primary-hover-bg`, `--primary-pressed-bg`,
`--primary-fg`, `--scrim`, `--drop-bg`, `--type-title`, `--dialog-w-sm`, `--dialog-w-md`,
`--dialog-top`, `--copy-min-w`, `--radio-size`, `--check-size`.

New: `--shadow-dialog`, `--dialog-bottom` (32 px), `--control-h` (32 px, dialog buttons and
segmented control), `--copy-compact-w` (56 px), `--namefield-compact` (204 px), `--kbd-h` (20 px).
Tabs (2026-11-12, sizes only, no new colour): `--tabstrip-h` (32 px), `--tab-h` (28), `--tab-min-w`
(96), `--tab-max-w` (200), `--tab-close` (24), `--tab-add` (28), `--tab-scroll-w` (24), `--dot-size` (6),
`--option-btn-compact` (28).

## New icons (in `shell-icons.svg`; merge into the editor sprite / `icons.tsx`)

`copy` and `check` (spec geometry), `info` (circle r 8.5, stem `M12 11V16.5`, dot at 12, 7.75).
Tabs (2026-11-12): `menu` (three bars), `close` (cross, drawn at 16 px), `add` (plus), `chevron-left`,
`chevron-right`; same 24 grid, stroke 1.5, round caps.

## Notes

- Native approximations (`native.css`, `native.svg`): Windows 11 23H2 light theme at 100 %,
  Segoe UI 12 px, eyeballed. Menus show access keys underlined (as when opened with Alt or the
  Menu key). Message boxes follow the task dialog Electron uses: main instruction in blue 16 px,
  detail 12 px, buttons right-aligned in the order given, the first one default.
- Fonts: the token stack resolves to Segoe UI Variable Text / Segoe UI on Windows; canvas text is
  svg-render's Arial.
- The drop overlay keeps the spec's `--drop-bg` (94 %); the scheme still shows faintly and its
  condition text sits just above "Drop to open" in A13. Acceptable; if it bothers, raise the
  alpha to 0.97 rather than adding a card.
