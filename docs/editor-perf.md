# Editor performance

Measured 2026-11-10 against the budgets of `SPEC-editor.md` "Performance". Budgets are never
loosened; a miss would lead to a request for svg-render's `createRenderer` (R19). None was missed.

Machine: 11th Gen Intel Core i5-11400H (2.7 GHz, 12 threads), 16 GB, Windows 11, Electron's
Chromium, `--force-device-scale-factor=1`, window 1280 x 800. Other machines: add a row.

## Node budgets (`npx vitest run --project perf`, medians after 20 warm-up runs)

| Scenario | Budget | Median |
|---|---|---|
| `hitTest` on a 500-atom document | < 0.5 ms | 0.14 ms |
| One bond-drag preview step on the 40-atom scheme (reducer + preview render + patch plan) | < 10 ms | 0.62 ms |
| `tidy` (Tidy reaction, plan + one commit) on the 4-molecule scheme | < 25 ms | 1.5 ms |
| `createNameIndex(compounds.json)` | < 30 ms | 0.56 ms |

## e2e frame probe (`npx playwright test e2e/editor-perf.spec.ts`)

One sample is one pointer event, one event per animation frame. `t0` is the capture-phase
listener on `window`; the next task (a `MessageChannel` message, `t1`) runs after the handlers, the
reducer, React's synchronous render and the part patch; in the next animation frame a forced
style and layout read costs `t3 - t2`. Frame cost = `(t1 - t0) + (t3 - t2)`: main-thread script,
style and layout. It leaves out raster and compositing (GPU) and the wait for the vsync. A
`MutationObserver` on the content layer checks that no render was deferred past `t1` (at most 2 %
of the samples may be late; none was). Timer resolution is 0.1 ms.

| Scenario | Budget | n | Median | p95 |
|---|---|---|---|---|
| Whole-fragment drag, 40-atom scheme (Select all, fast path) | p95 <= 16 ms | 91 | 2.6 ms | 3.5 ms |
| Bond-drag preview, 100-atom document | p95 <= 16 ms | 91 | 1.8 ms | 2.9 ms |
| Partial-selection drag, 100-atom document | p95 <= 16 ms | 91 | 1.5 ms | 1.8 ms |
| Commit to paint (bond released), 100-atom document | <= 50 ms | 9 | 5.0 ms | 12.0 ms |
| Cold start to usable canvas (canvas focused, name field visible) | < 3 s | 1 | 0.44 s | |

Run to run the p95 moves by about a millisecond; the budgets have a factor of four or more to
spare. The cold start includes launching Electron and resizing the window.

## Not measured here

Raster and compositing time, and the frame rate on the owner's laptop: `docs/windows-checklist.md`
"Checkpoint E32" asks for the run there. Note 2026-11-12 (owner decision): the development machine is not the teacher's laptop ("no this laptop is not the one the teacher will use"), so that run stays open.

## Checkpoint S corrective profiling (Linux, 2026-11-10)

The isolated checkpoint run missed whole-fragment drag: median 10.4 ms, p95 16.2 ms.
One targeted CDP CPU profile, with the unchanged 91-event frame probe, measured median
11.0 ms, p95 15.8 ms (script median 11.0 ms, layout 0.0 ms). This passing sample does not
invalidate the checkpoint miss. Profile spans 6003 ms including 4614 ms idle and 771 ms
unattributed program work. Inclusive sampled CPU: React synchronous work 488 ms, Editor
221 ms, statusFormula 215 ms, formulaOf 212 ms, perceiveFragment 194 ms, buildMolecule
162 ms. The selection spans multiple fragments, triggering formulaOf on each Editor render,
even though committed doc, perception and selection have identical identities during drag.
The existing committed/preview derive caches and translate fast path do not cache this value.
Host session publication listens to doc/dirty only and deduplicates identical updates; pointer
frames do not publish sessions. No check/coverage worker was running; pre-run load average
was 0.48/2.43/3.01 and no competing CPU-heavy process appeared in the process snapshot.

Correction: retain one status formula per mounted Editor, invalidating on doc, perception or
selection identity. No core or public API changes. The deterministic regression failed with
91 chemistry calls instead of one before caching, then passed; each input invalidates the
cache separately. This addresses the measured repeated chemistry work, not renderer caching;
no createRenderer API request is supported by this profile. Windows performance remains pending.

Raw profile and run logs: `/tmp/chalkbond-checkpoint-fixes-1ApUoY/` (`drag.cpuprofile`,
`profile.log`, `perf-red.log`, `perf-green.log`, `perf-fixed.log`). Temporary CDP instrumentation
was removed after profiling; the frame probe and all budgets are unchanged.

After correction, targeted e2e (5/5): whole-fragment median 8.8 ms / p95 9.4 ms; bond preview
p95 9.1 ms; partial selection p95 6.4 ms; commit maximum/p95 40.8 ms; cold start 442 ms.

## Copy timing, portable (clipboard-export SC12, Decision C11; Linux, 2026-11-11)

`npx playwright test --project=e2e e2e/clipboard-perf.spec.ts`: an **encoding and flow result,
not the Windows OS clipboard**. Main's clipboard is the in-memory store of
`e2e/stub-clipboard-memory.mjs` behind the real C1 adapter and IPC; the Copy button, copy flow,
`exportSvg`, rasteriser and chunk writing are real. Fixture: the editor perf scheme (41 atoms,
nothing selected, whole-drawing copy, 5470 × 954 px at 300 dpi). One sample: Copy click (capture
listener, renderer `performance.now`) to the first DOM mutation after which the button reads
"Copied" and the N-C2 notice has been heard (a MutationObserver: no polling task runs in the
page while the copy is under way). Five samples, no warm-up, no retry; between samples the spec
waits only for the button to return to rest. Machine: Intel Core i7-8750H (2.2 GHz, 12 threads),
15 GB, Linux, Electron's Chromium headless (no display), `--force-device-scale-factor=1`,
1280 x 800; load average about 5 from other work.

| Encoder | Budget | n | Median | Samples |
|---|---|---|---|---|
| `canvas.toBlob` (before C11) | <= 500 ms | 5 | 1044.4 ms | 1044.4, 1056.9, 1034.8, 1039.9, 1058.2 |
| `canvas.toDataURL` + `pngFromDataUrl` (C11) | <= 500 ms | 5 | 48.6 ms | 48.6, 67.1, 32.5, 37.7, 62.1 |

`toBlob` encodes in an idle task; the copy waited about a second for it. A first draft of the
probe that polled on zero-delay timers kept the page busy enough for the idle task to run at once
and read 55.6 ms for `toBlob`: the sample must not run tasks of its own. The PNGs of both encoders
have identical pixels (toluene at Print, transparent and white: byte-identical files; the scheme's
clipboard PNG: 0 of 20,873,520 RGBA bytes differ, same IHDR, pHYs and chunk layout; the tEXt
differs only in the document's `modified` time).

Logs of the portable run: `/tmp/chalkbond-opus-memory-encoder-lJJJQm/` (`t2-red-perf-e2e-2.log`,
`t2-green-perf-e2e.log`).

## Copy timing, Windows real clipboard (clipboard-export SC12; Windows 11, 2026-11-11)

`npx playwright test --project=e2e e2e/win/clipboard-perf.spec.ts`, run alone with nothing else
running, after `npx electron-vite build`. **The sample includes the real OS clipboard write**:
no clipboard stub is loaded, so the Copy click to "Copied" covers `exportSvg`, the rasteriser,
the C1 IPC and Electron's `clipboard.write` of the CB-W1 entries (bitmap, raw SVG, raw drawing);
the spec then checks the drawing key and the native `PNG`, `image/svg+xml`,
`application/x-chalkbond` formats are on the clipboard. Same fixture and sample definition as the
portable run (`e2e/copy-timing.ts`: 41 atoms, nothing selected, five samples, no warm-up, no
retry). Machine: Intel Core i5-11400H (2.7 GHz, 6 cores, 12 threads), 16 GB, Windows 11,
Electron 45.2.3, a real window.

| Run | Budget | n | Median | Samples |
|---|---|---|---|---|
| Windows, real clipboard (alone) | <= 500 ms | 5 | 50.9 ms | 90.6, 57.0, 49.0, 49.3, 50.9 |
| Windows, real clipboard (inside the full `npm run test:e2e`, orchestrator, 2026-11-11, `956a4a4`) | <= 500 ms | 5 | 47.4 ms | 88.4, 52.9, 46.5, 46.8, 47.4 |

The first sample is the slowest (cold encoder); the median is about a tenth of the budget.

### After the white-backed bitmap (clipboard-export R10, task N8; Windows 11, 2026-11-12)

The `image/png` entry is now rasterised on opaque white with a margin. Same spec, fixture, sample definition and machine
as above (`e2e/win/clipboard-perf.spec.ts`, real clipboard), run by the orchestrator on 2026-11-12;
this worker did not repeat the run.

| Run | Budget | n | Median | Samples |
|---|---|---|---|---|
| Windows, real clipboard (orchestrator, 2026-11-12, after N8) | <= 500 ms | 5 | 66.9 ms | 100.2, 67.6, 64.1, 66.9, 62.8 |

N8's own todo records 69.1 ms for the same spec at its commit; the 2026-11-11 rows above (50.9 ms,
47.4 ms) predate N8, so the median rose by roughly 16 ms. The budget is unchanged and met.

## Structural formula (feature set of 2026-11-12; budgets unchanged)

No new budget. The structural variants of the scenes reuse the skeletal budgets: the svg-render
perf scenes with `formula: 'structural'` (N2, N3a, `src/core/svg-render/perf.test.ts`), and the
editor's `hitTest` on a 500-atom structural document (0.5 ms median) and one bond-drag preview step
on the structural 40-atom scheme (10 ms median) in `src/renderer/editor/perf.test.ts` (N6, N13).
`npx vitest run --project perf` ran on Windows 11 on 2026-11-12 at N11 (this worker):
4 files, 17 tests, all passed. The tests assert the budgets and print no medians, so no structural
median is recorded here; a measured number would need the probes to log it. The structural frame-time
probe (`e2e/editor-perf.spec.ts`) was not run for N11 (needs a build; open for N12).

## Tabs (T11 budgets and SS8; tabs feature set, task TB31; Windows 11, 2026-11-13)

`npx playwright test --project=e2e e2e/app-tabs-perf.spec.ts`, run alone on `9818b2b` (the probe and its
two test seams are the only change), after `npx electron-vite build`, nothing else running.
Budgets approved by the owner 2026-11-12 (`SPEC-app-shell.md` T11): **100 ms** for a switch to a tab
loaded in this run, **300 ms** for a first activation from the store; none was missed and none was changed.

Machine: Intel Core i5-11400H (2.7 GHz, 6 cores, 12 threads), 16 GB, Windows 11 (10.0.26300),
Electron 45.2.3, a real window, `--force-device-scale-factor=1` (scale 1.0), 1280 x 800 content.

One sample is one real mouse click on a tab (Playwright). `t0` is the capture-phase `click` listener
on `window`. The end is the first painted frame that shows the incoming drawing: the first
`requestAnimationFrame` callback in which the strip marks the target tab selected and the content layer
holds that drawing's parts (a fingerprint of the first six parts, taken while that tab was active; the
drawings all differ and the spec asserts so), then a task posted from inside that callback, which runs
after the frame's style, layout and paint work on the main thread. Raster, compositing and the wait for
the vsync are not in it. Inside the sample: finishing the editor, taking the outgoing state out, its
record write (IPC and disk), AS5's check for a file tab, the record read and D2 verification when the
tab is not loaded, `putState` and React's render. Not inside it: the 100 ms pause between samples.
Every drawing is the 100-atom perf document of `editor-perf.spec.ts`, shifted per tab. 10 warm-up
switches, then 40 measured (n = 40, so p95 is the 39th of 40 sorted values); each pair of cells is two runs.

| Scenario | Budget | n | Median | p95 | Max |
|---|---|---|---|---|---|
| 2 Untitled tabs, loaded (run A / run B) | p95 <= 100 ms | 40 | 7.6 / 7.4 ms | 18.0 / 17.7 ms | 18.2 / 17.7 ms |
| 10 Untitled tabs, loaded (run A / run B) | p95 <= 100 ms | 40 | 8.2 / 7.8 ms | 17.7 / 17.5 ms | 17.8 / 17.6 ms |
| 2 file (.chalk) tabs, loaded (run A / run B) | p95 <= 100 ms | 40 | 19.1 / 19.3 ms | 19.6 / 19.6 ms | 19.7 / 19.6 ms |
| 10 file (.chalk) tabs, loaded (run A / run B) | p95 <= 100 ms | 40 | 27.4 / 26.1 ms | 31.5 / 28.3 ms | 31.6 / 28.4 ms |
| First activation from the store, 10 file tabs, after a relaunch (3 relaunches x 9 tabs; run A / run B) | p95 <= 300 ms | 27 | 26.4 / 28.7 ms | 30.6 / 35.3 ms | 32.3 / 35.4 ms |
| Restore of the active tab at start, 10 file tabs (strip shown to drawing painted; 3 relaunches; run A / run B) | <= 300 ms | 3 | 54.4 / 51.0 ms | | 79.5 / 64.9 ms |

Run A and run B are two consecutive runs of the final spec. Two earlier runs of the same probe (before its
renderer preload moved from a file into `probe-main.mjs`, same measurement) gave the same ranges: loaded p95
17.6-19.7 ms, 10 file tabs 28.7-36.5 ms, from the store p95 32.0-32.3 ms, restore 43.4-55.1 ms.

The Untitled samples fall into two groups, about 7.6 ms and about 17.7 ms: the end waits for the next
frame, so a sample lands in the frame that is current when the work is done. A file tab costs more than
an Untitled tab (about 19 ms with 2 tabs, 26-28 ms with 10, medians): the switch of a file tab also runs AS5's
check (file read and SHA-256) before the incoming state is put in, and hashes the outgoing drawing
against its written hash (`switchTo` in `tab-flows.ts`). The step from 2 to 10 tabs was not profiled: the
budgets are met by a factor of 2.7 or more, so there is nothing to fix. A first activation from the
store (a file tab: record read, D2 verification, AS5) costs about the same as a switch between ten
loaded file tabs. The restore at start is measured by a renderer preload (the source string in `e2e/probe-main.mjs`) that
sees the document from its first byte: it starts when the strip first shows the 10 tabs (`o.changed()`
before the load) and ends at the first painted frame of the restored drawing. The strip itself
appears about 260-300 ms after the page starts; that part is outside SS8's restore budget and is not
broken down here.
Cold start with 10 restored tabs against SC1's 3 s is the teacher's-laptop box of
`docs/windows-checklist.md` and is **not measured here** (E32 stays open; the development machine is not that laptop).

SS8, normal start reads one record: `e2e/probe-main.mjs` counts every `ipcMain.handle` call. After a
relaunch with 10 tabs in the store, once the active tab is painted and 500 ms have passed, the
`session:read-tab` (`readTabRecord`) count is 1; each of the nine first activations that follow adds
exactly one (the count was 2, 3, ... 10 after each click). LG1's main log holds errors only, so a
successful read has no line there; the count is the e2e twin of TB17's fake-port assertion.

The probe fails when a budget is not met: with both budgets locally set to 5 ms and 10 ms (not
committed) the four loaded-switch tests and the first relaunch failed on the same code (the rest of the serial group did not run) (for example received 17.6 ms against 5 ms,
and 51.4 ms against 10 ms for the restore).
