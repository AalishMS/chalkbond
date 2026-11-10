// SPEC-editor.md "Performance": frame-time probes on the built app, and the cold start.
// What one sample is: the pointer event reaches the window (capture phase, `t0`); the next task
// (a MessageChannel message, `t1`) runs after the handlers, the reducer, React's synchronous render
// and the part patch are done; in the next animation frame (`t2`) a forced style and layout read
// costs `t3 - t2`. The frame cost is `(t1 - t0) + (t3 - t2)`: script, style and layout time on the
// main thread. Raster and compositing (GPU) are not in it, and the wait for the vsync is not either.
// Events are sent one per frame. The results are written to docs/editor-perf.md by hand from the
// `PERF` lines this spec prints.
import { cpus, totalmem } from 'node:os';
import { expect, test, type Page } from '@playwright/test';
import { addAtom, addBond, emptyDoc, type AtomId, type Doc } from '../src/core/doc-model';
import { canvasPoint, insertName, loadDocument, openApp, readDocument } from './harness';

/** Budgets of SPEC-editor.md "Performance" (ms). */
const DRAG_FRAME_P95_MS = 16;
const COMMIT_TO_PAINT_MS = 50;
const COLD_START_MS = 3000;

const FRAMES = 90;

interface Sample {
  kind: string;
  frameCost: number;
  work: number;
  layout: number;
  /** The content layer changed after `t1`: the render was deferred past the sampled task. */
  late: boolean;
}

async function installProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const samples: Sample[] = [];
    interface Sample {
      kind: string;
      frameCost: number;
      work: number;
      layout: number;
      late: boolean;
    }
    let lastMutation = 0;
    const layer = document.querySelector('[data-layer="content"]');
    if (layer) {
      new MutationObserver(() => {
        lastMutation = performance.now();
      }).observe(layer, { subtree: true, childList: true, attributes: true });
    }
    for (const kind of ['pointermove', 'pointerup']) {
      window.addEventListener(
        kind,
        () => {
          const t0 = performance.now();
          const channel = new MessageChannel();
          channel.port1.onmessage = () => {
            const t1 = performance.now();
            requestAnimationFrame(() => {
              const t2 = performance.now();
              void document.body.offsetHeight;
              const t3 = performance.now();
              samples.push({
                kind,
                frameCost: t1 - t0 + (t3 - t2),
                work: t1 - t0,
                layout: t3 - t2,
                late: lastMutation > t1,
              });
            });
          };
          channel.port2.postMessage(0);
        },
        { capture: true },
      );
    }
    (window as unknown as { __probe: Sample[] }).__probe = samples;
  });
}

async function frames(page: Page, n = 2): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((done) => {
        const tick = (left: number): void => {
          if (left === 0) done();
          else requestAnimationFrame(() => tick(left - 1));
        };
        tick(count);
      }),
    n,
  );
}

async function takeSamples(page: Page): Promise<Sample[]> {
  await frames(page, 3);
  return page.evaluate(() => {
    const probe = (window as unknown as { __probe: unknown[] }).__probe;
    return probe.splice(0, probe.length) as never;
  });
}

const percentile = (values: number[], q: number): number => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] as number;
};
const median = (values: number[]): number => percentile(values, 0.5);

function report(name: string, samples: Sample[]): { median: number; p95: number } {
  // The probe is valid only if the render is done by the time its task runs.
  expect(samples.filter((s) => s.late).length).toBeLessThanOrEqual(samples.length * 0.02);
  const cost = samples.map((s) => s.frameCost);
  const out = { median: median(cost), p95: percentile(cost, 0.95) };
  console.log(
    `PERF ${name}: n=${samples.length} median ${out.median.toFixed(2)} ms, p95 ${out.p95.toFixed(2)} ms ` +
      `(script ${median(samples.map((s) => s.work)).toFixed(2)}, layout ${median(samples.map((s) => s.layout)).toFixed(2)} median)`,
  );
  return out;
}

/** Presses at `from`, then moves along a circle of `radius` px around it, one move per frame. */
async function dragAround(
  page: Page,
  from: { x: number; y: number },
  radius: number,
  start = 0.6,
  span = 0.8,
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await frames(page);
  for (let i = 1; i <= FRAMES; i++) {
    const a = Math.PI * (start + span * (i / FRAMES));
    await page.mouse.move(from.x + radius * Math.cos(a), from.y + radius * Math.sin(a));
    await frames(page);
  }
}

/** Ten rows of a ten-atom chain: 100 atoms. */
function doc100(): Doc {
  let doc = emptyDoc('2026-01-01T00:00:00.000Z');
  for (let row = 0; row < 10; row++) {
    let prev: AtomId | null = null;
    for (let i = 0; i < 10; i++) {
      let id: AtomId;
      [doc, id] = addAtom(doc, { element: 'C', x: i * 0.87, y: row * 2 + (i % 2) * 0.5 });
      if (prev !== null) [doc] = addBond(doc, prev, id);
      prev = id;
    }
  }
  return doc;
}

async function atomAt(page: Page, index: number): Promise<{ x: number; y: number }> {
  const doc = await readDocument(page);
  const atom = Object.values(doc.atoms)[index];
  if (!atom) throw new Error('no such atom');
  return canvasPoint(page, atom);
}

test('whole-fragment drag of a 40-atom scheme (fast path): p95 within the frame budget', async () => {
  const { app, page } = await openApp();
  try {
    await insertName(page, 'ethanol + acetic acid -> ethyl acetate + water');
    for (const name of ['toluene', 'cyclohexane', 'pentane', 'benzene', 'ethanol']) {
      await insertName(page, name);
    }
    expect(Object.keys((await readDocument(page)).atoms).length).toBeGreaterThanOrEqual(40);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+a');
    await installProbe(page);
    const grab = await atomAt(page, 0);
    await dragAround(page, grab, 60);
    await page.mouse.up();
    const moves = (await takeSamples(page)).filter((s) => s.kind === 'pointermove');
    expect(moves.length).toBeGreaterThan(FRAMES / 2);
    expect(report('whole-fragment drag, 40-atom scheme', moves).p95).toBeLessThanOrEqual(
      DRAG_FRAME_P95_MS,
    );
  } finally {
    await app.close();
  }
});

test('bond-drag preview in a 100-atom document: p95 within the frame budget', async () => {
  const { app, page } = await openApp();
  try {
    await loadDocument(page, doc100());
    await page.getByTestId('zoom-fit').click();
    await page.getByTestId('zoom-out').click();
    await page.getByTestId('zoom-out').click();
    await installProbe(page);
    // The last atom of the first row, dragged out to the right into free canvas.
    const grab = await atomAt(page, 9);
    await dragAround(page, grab, 50, -0.4, 0.8);
    const moves = (await takeSamples(page)).filter((s) => s.kind === 'pointermove');
    await page.mouse.up();
    expect(moves.length).toBeGreaterThan(FRAMES / 2);
    expect(report('bond-drag preview, 100-atom doc', moves).p95).toBeLessThanOrEqual(
      DRAG_FRAME_P95_MS,
    );
  } finally {
    await app.close();
  }
});

test('partial-selection drag in a 100-atom document: p95 within the frame budget', async () => {
  const { app, page } = await openApp();
  try {
    await loadDocument(page, doc100());
    await page.getByTestId('zoom-fit').click();
    await page.getByTestId('tool-select').click();
    const a = await atomAt(page, 34);
    const b = await atomAt(page, 35);
    await page.mouse.click(a.x, a.y);
    await page.keyboard.down('Shift');
    await page.mouse.click(b.x, b.y);
    await page.keyboard.up('Shift');
    await installProbe(page);
    await dragAround(page, a, 12);
    await page.mouse.up();
    const moves = (await takeSamples(page)).filter((s) => s.kind === 'pointermove');
    expect(moves.length).toBeGreaterThan(FRAMES / 2);
    expect(report('partial-selection drag, 100-atom doc', moves).p95).toBeLessThanOrEqual(
      DRAG_FRAME_P95_MS,
    );
  } finally {
    await app.close();
  }
});

test('commit to paint of single gestures on a 100-atom document: at most 50 ms', async () => {
  const { app, page } = await openApp();
  try {
    await loadDocument(page, doc100());
    await page.getByTestId('zoom-fit').click();
    await page.getByTestId('zoom-out').click();
    await page.getByTestId('zoom-out').click();
    await installProbe(page);
    const commits: Sample[] = [];
    // Bond tool: a drag from an end atom into free canvas, released (one commit), nine times.
    for (let i = 0; i < 9; i++) {
      const grab = await atomAt(page, 9 + 10 * (i % 10));
      await page.mouse.move(grab.x, grab.y);
      await page.mouse.down();
      await frames(page);
      await page.mouse.move(grab.x + 45, grab.y - 10);
      await frames(page);
      await takeSamples(page);
      await page.mouse.up();
      commits.push(...(await takeSamples(page)).filter((s) => s.kind === 'pointerup'));
    }
    expect(commits.length).toBeGreaterThanOrEqual(9);
    const out = report('commit to paint, 100-atom doc', commits);
    expect(Math.max(...commits.map((s) => s.frameCost))).toBeLessThanOrEqual(COMMIT_TO_PAINT_MS);
    expect(out.p95).toBeLessThanOrEqual(COMMIT_TO_PAINT_MS);
  } finally {
    await app.close();
  }
});

test('cold start to a usable canvas takes under 3 s', async () => {
  const t0 = Date.now();
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').waitFor();
    await expect(page.getByTestId('canvas')).toBeFocused();
    await expect(page.getByTestId('namefield-input')).toBeVisible();
    const ms = Date.now() - t0;
    console.log(
      `PERF cold start to usable canvas: ${ms} ms (${cpus()[0]?.model ?? 'cpu'}, ${cpus().length} threads, ${Math.round(totalmem() / 2 ** 30)} GB)`,
    );
    expect(ms).toBeLessThan(COLD_START_MS);
  } finally {
    await app.close();
  }
});
