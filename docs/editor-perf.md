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
