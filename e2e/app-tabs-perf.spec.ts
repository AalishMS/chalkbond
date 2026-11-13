// TB31 (SPEC-app-shell.md T11 "Budget", SS8; docs/editor-perf.md "Tabs"): the tab-switch budgets on
// the built app, in the style of editor-perf.spec.ts. Nothing here is a retry: every sample counts.
//
// One sample is one click on a tab. `t0` is the capture-phase `click` listener on `window`; the
// end is the first painted frame that shows the incoming drawing: a `requestAnimationFrame`
// callback in which the tab strip says the target tab is selected AND the content layer holds the
// target drawing's parts (a fingerprint of its first parts, taken beforehand while that tab was
// active; every tab's drawing differs), then a task posted from inside that callback, which runs
// once the frame's style, layout and paint work on the main thread is done. Raster and compositing
// (GPU) are not in it, the wait for the vsync is not either. Whatever the switch does before the
// incoming state is put in is inside the sample: finishing the editor, taking the outgoing state
// out, its record write (IPC and disk), an AS5 check for a file tab, the record read, the D2
// verification, and React's render. The pause between two samples is not.
//
// - T11 loaded: 2 tabs and 10 tabs, each holding the 100-atom perf document, p95 of 40 switches
//   after 10 warm-up switches within 100 ms (Untitled tabs and file tabs).
// - T11 from the store, SS7: after a relaunch every tab but the active one is read on its first
//   activation (record read, D2 verify, AS5 check of a file tab): p95 within 300 ms. The restore
//   of the active tab at start (the strip shows its tabs, then the drawing is painted) too (SS8).
// - SS8: the normal start path reads one record (`readTabRecord` is counted by `probe-main.mjs`:
//   LG1's main log holds errors only, so a successful read leaves no line there).
//
// The numbers are written to docs/editor-perf.md by hand from the `PERF` lines this spec prints.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir, totalmem } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import {
  addAtom,
  addBond,
  emptyDoc,
  serialize,
  type AtomId,
  type Doc,
} from '../src/core/doc-model';
import { CHANNELS } from '../src/shared/channels';
import { requestOpens } from './drop-steps';
import { loadDocument, openTab, readTabs } from './harness';
import { closeWindowForReal, launchIn, readIndex, recordIds } from './session-steps';

/** Budgets of SPEC-app-shell.md T11 (ms): approved by the owner 2026-11-12. */
const LOADED_SWITCH_P95_MS = 100;
const FROM_STORE_P95_MS = 300;

const WARMUP = 10;
const MEASURED = 40;
/** Between two samples: lets the trailing index write and the auto-save settle. Not measured. */
const QUIET_MS = 100;

interface Switch {
  /** Click to the end of the first painted frame that shows the incoming drawing. */
  ms: number;
  /** Click to the start of that frame (the `requestAnimationFrame` callback). */
  toFrame: number;
}

const percentile = (values: number[], q: number): number => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] as number;
};
const median = (values: number[]): number => percentile(values, 0.5);

function report(name: string, samples: Switch[]): { median: number; p95: number; max: number } {
  const all = samples.map((s) => s.ms);
  const out = { median: median(all), p95: percentile(all, 0.95), max: Math.max(...all) };
  console.log(
    `PERF ${name}: n=${samples.length} median ${out.median.toFixed(1)} ms, p95 ${out.p95.toFixed(1)} ms, ` +
      `max ${out.max.toFixed(1)} ms (to frame start: median ${median(samples.map((s) => s.toFrame)).toFixed(1)} ms; ` +
      `${cpus()[0]?.model ?? 'cpu'}, ${cpus().length} threads, ${Math.round(totalmem() / 2 ** 30)} GB, ${process.platform})`,
  );
  console.log(`PERF ${name} samples: ${all.map((v) => v.toFixed(1)).join(', ')}`);
  return out;
}

/** Ten rows of a ten-atom chain: 100 atoms (the perf document of editor-perf.spec.ts), shifted by `dx`. */
function doc100(dx: number): Doc {
  let doc = emptyDoc('2026-01-01T00:00:00.000Z');
  for (let row = 0; row < 10; row++) {
    let prev: AtomId | null = null;
    for (let i = 0; i < 10; i++) {
      let id: AtomId;
      [doc, id] = addAtom(doc, { element: 'C', x: dx + i * 0.87, y: row * 2 + (i % 2) * 0.5 });
      if (prev !== null) [doc] = addBond(doc, prev, id);
      prev = id;
    }
  }
  return doc;
}

/** What the content layer shows: its first parts, as markup. Differs from drawing to drawing. */
const fingerprint = (page: Page): Promise<string> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-layer="content"] [data-key]'))
      .slice(0, 6)
      .map((part) => part.outerHTML)
      .join('|'),
  );

/** Waits until the content layer shows a drawing other than `before`; returns its fingerprint. */
async function nextFingerprint(page: Page, before: string[]): Promise<string> {
  let seen = '';
  await expect
    .poll(async () => {
      seen = await fingerprint(page);
      return seen !== '' && !before.includes(seen);
    })
    .toBe(true);
  return seen;
}

type Probe = Window & { __switch?: Promise<Switch> };

/** Arms the page: the next `click` on `window` starts the clock; resolves via `window.__switch`. */
async function arm(page: Page, id: string, want: string): Promise<void> {
  await page.evaluate(
    ({ id: tabId, want: shows }) => {
      (window as Probe).__switch = new Promise<Switch>((resolve, reject) => {
        window.addEventListener(
          'click',
          () => {
            const t0 = performance.now();
            const parts = (): string =>
              Array.from(document.querySelectorAll('[data-layer="content"] [data-key]'))
                .slice(0, 6)
                .map((part) => part.outerHTML)
                .join('|');
            const frame = (): void => {
              const start = performance.now();
              const selected = document
                .querySelector('[data-testid="tab"][aria-selected="true"]')
                ?.getAttribute('data-tab-id');
              if (selected === tabId && parts() === shows) {
                const channel = new MessageChannel();
                channel.port1.onmessage = () =>
                  resolve({ ms: performance.now() - t0, toFrame: start - t0 });
                channel.port2.postMessage(0);
              } else if (start - t0 > 10_000) {
                reject(new Error('the incoming drawing was not painted within 10 s'));
              } else {
                requestAnimationFrame(frame);
              }
            };
            requestAnimationFrame(frame);
          },
          { capture: true, once: true },
        );
      });
    },
    { id, want },
  );
}

/** One real click on tab `id`, measured. */
async function switchTo(page: Page, id: string, want: string): Promise<Switch> {
  await arm(page, id, want);
  await page.locator(`[data-testid="tab"][data-tab-id="${id}"]`).click();
  const sample = await page.evaluate(() => (window as Probe).__switch as Promise<Switch>);
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
      ),
  );
  await page.waitForTimeout(QUIET_MS);
  return sample;
}

/** `ids` in the order a walk from the active tab visits them, forever (wraps). */
async function walk(page: Page, count: number): Promise<string[]> {
  const tabs = await readTabs(page);
  const start = tabs.findIndex((t) => t.active);
  return Array.from({ length: count }, (_, i) => tabs[(start + 1 + i) % tabs.length]?.id ?? '');
}

/** `count` tabs each holding its own 100-atom drawing, all loaded in this run. */
async function makeTabs(
  app: ElectronApplication,
  page: Page,
  kind: 'untitled' | 'chalk',
  count: number,
  folder: string,
): Promise<Record<string, string>> {
  const fingerprints: string[] = [];
  const byTab: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const doc = doc100(i * 0.37);
    if (kind === 'untitled') {
      if (i > 0) await openTab(page);
      await loadDocument(page, doc);
    } else {
      const file = join(folder, `lesson-${i}.chalk`);
      writeFileSync(file, serialize(doc));
      await requestOpens(app, [file]);
      await expect.poll(async () => (await readTabs(page)).length).toBe(i + 1);
    }
    const shown = await nextFingerprint(page, fingerprints);
    fingerprints.push(shown);
    const active = (await readTabs(page)).find((t) => t.active);
    expect(active?.kind).toBe(kind);
    byTab[active?.id ?? ''] = shown;
  }
  expect(Object.keys(byTab)).toHaveLength(count);
  expect(new Set(fingerprints).size).toBe(count);
  return byTab;
}

let folder: string;
test.beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), 'chalkbond-tabs-perf-'));
});
test.afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

for (const kind of ['untitled', 'chalk'] as const) {
  for (const count of [2, 10]) {
    test(`T11: a click on another tab reaches its first painted frame within ${LOADED_SWITCH_P95_MS} ms (p95): ${count} ${kind} tabs, 100 atoms each`, async () => {
      const userData = mkdtempSync(join(folder, 'user-'));
      const { app, page } = await launchIn(userData);
      try {
        const files = mkdtempSync(join(folder, 'files-'));
        const shown = await makeTabs(app, page, kind, count, files);
        await expect(page.getByTestId('tab')).toHaveCount(count);
        const order = await walk(page, WARMUP + MEASURED);
        const samples: Switch[] = [];
        for (const [i, id] of order.entries()) {
          const sample = await switchTo(page, id, shown[id] as string);
          if (i >= WARMUP) samples.push(sample);
        }
        const out = report(`T11 switch loaded, ${count} ${kind} tabs, 100 atoms`, samples);
        expect(samples).toHaveLength(MEASURED);
        expect(out.p95).toBeLessThanOrEqual(LOADED_SWITCH_P95_MS);
      } finally {
        await app.close();
      }
    });
  }
}

// ---- from the store, after a relaunch (SS7, SS8) ------------------------------------------------

const TABS_IN_STORE = 10;
const RELAUNCHES = 3;
const readsOf = (app: ElectronApplication): Promise<number> =>
  app.evaluate(
    (_electron, channel) =>
      (globalThis as { __chalkbondProbe?: { calls: Record<string, number> } }).__chalkbondProbe
        ?.calls[channel] ?? 0,
    CHANNELS.readTabRecord,
  );

test.describe.serial('T11 from the store, SS8', () => {
  let storeData: string;
  let shown: Record<string, string>;
  const activations: Switch[] = [];
  const restores: number[] = [];

  test.beforeAll(async () => {
    storeData = mkdtempSync(join(folder, 'store-'));
    const { app, page } = await launchIn(storeData);
    try {
      shown = await makeTabs(
        app,
        page,
        'chalk',
        TABS_IN_STORE,
        mkdtempSync(join(folder, 'store-files-')),
      );
      // Every record and the index are in the store before the window closes (AS2, SS4).
      await expect
        .poll(
          () =>
            recordIds(storeData).length === TABS_IN_STORE &&
            readIndex(storeData)?.tabs.length === TABS_IN_STORE,
          {
            timeout: 12_000,
          },
        )
        .toBe(true);
      await closeWindowForReal(app);
    } catch (error) {
      await app.close();
      throw error;
    }
  });

  for (let launch = 1; launch <= RELAUNCHES; launch++) {
    test(`relaunch ${launch}: the active tab is restored and the other ${TABS_IN_STORE - 1} are read on their first activation`, async () => {
      const { app, page } = await launchIn(storeData, { probe: true });
      try {
        await expect(page.getByTestId('tab')).toHaveCount(TABS_IN_STORE);
        await expect
          .poll(() =>
            page.evaluate(() =>
              (
                window as unknown as { __chalkbondRestoreProbe: { painted(): number | null } }
              ).__chalkbondRestoreProbe.painted(),
            ),
          )
          .not.toBeNull();
        const restore = await page.evaluate(() => {
          const probe = (
            window as unknown as {
              __chalkbondRestoreProbe: {
                events(): { t: number; tabs: number; parts: number }[];
                painted(): number;
              };
            }
          ).__chalkbondRestoreProbe;
          const strip = probe.events().find((e) => e.tabs >= 10);
          return { strip: strip?.t ?? NaN, painted: probe.painted() };
        });
        expect(restore.strip).toBeGreaterThan(0);
        const restoreMs = restore.painted - restore.strip;
        restores.push(restoreMs);
        console.log(
          `PERF restore of the active tab at start, relaunch ${launch}: ${restoreMs.toFixed(1)} ms ` +
            `(strip with ${TABS_IN_STORE} tabs at ${restore.strip.toFixed(0)} ms, drawing painted at ${restore.painted.toFixed(0)} ms after the page started)`,
        );
        expect(restoreMs).toBeLessThanOrEqual(FROM_STORE_P95_MS);
        // SS8: the normal start path reads the active tab's record and no other (quiet for 500 ms).
        await page.waitForTimeout(500);
        expect(await readsOf(app)).toBe(1);

        const tabs = await readTabs(page);
        const others = tabs.filter((t) => !t.active).map((t) => t.id);
        expect(others).toHaveLength(TABS_IN_STORE - 1);
        let reads = 1;
        for (const id of others) {
          activations.push(await switchTo(page, id, shown[id] as string));
          reads++;
          // One record read per first activation, and of that tab only.
          expect(await readsOf(app)).toBe(reads);
        }
        await closeWindowForReal(app);
      } catch (error) {
        await app.close();
        throw error;
      }
    });
  }

  test('T11 from the store: p95 of all first activations within 300 ms', () => {
    expect(activations).toHaveLength(RELAUNCHES * (TABS_IN_STORE - 1));
    const out = report(
      `T11 first activation from the store, ${RELAUNCHES} relaunches x ${TABS_IN_STORE - 1} tabs, 100 atoms, file tabs`,
      activations,
    );
    console.log(
      `PERF restore at start: median ${median(restores).toFixed(1)} ms, max ${Math.max(...restores).toFixed(1)} ms (n=${restores.length})`,
    );
    expect(out.p95).toBeLessThanOrEqual(FROM_STORE_P95_MS);
  });
});
