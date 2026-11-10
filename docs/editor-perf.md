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
"Checkpoint E32" asks for the run there.
