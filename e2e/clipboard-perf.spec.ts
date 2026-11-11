// SC12 portable measurement (SPEC-clipboard-export.md Decision C11): the ENCODING AND FLOW result,
// NOT the Windows OS clipboard. Main's clipboard is the in-memory store of
// e2e/stub-clipboard-memory.mjs behind the real C1 adapter and IPC; the Copy button, copy flow,
// exportSvg, rasteriser (SVG → Image → canvas → PNG) and chunk writing are the real ones. The
// Windows run on the real clipboard is e2e/win/clipboard-perf.spec.ts (C13).
import { expect, test } from '@playwright/test';
import { openApp } from './harness';
import {
  COPY_BUDGET_MS,
  COPY_SAMPLES,
  WHOLE,
  loadScheme40,
  reportCopies,
  timeCopies,
} from './copy-timing';

test('copy of the 40-atom scheme (in-memory transport): click to notice, median of 5 <= 500 ms', async () => {
  const { app, page } = await openApp({ launch: { clipboardMemory: true } });
  try {
    const atoms = await loadScheme40(page);
    const samples = await timeCopies(page);
    expect(samples).toHaveLength(COPY_SAMPLES);
    for (const s of samples)
      expect({ kind: s.kind, text: s.text }).toEqual({ kind: 'info', text: WHOLE });
    // The write completed: the store holds the copy's PNG, SVG and drawing.
    const types = await app.evaluate(async ({ clipboard }) =>
      (await clipboard.read()).flatMap((item) => [...item.types]),
    );
    expect(types).toContain('image/png');
    expect(
      reportCopies('copy, 40-atom scheme, in-memory transport', atoms, samples),
    ).toBeLessThanOrEqual(COPY_BUDGET_MS);
  } finally {
    await app.close();
  }
});
