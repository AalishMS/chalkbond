// SC12 on the real Windows clipboard (C13; Windows only, e2e/win is ignored elsewhere). NOT RUN
// YET: prepared on Linux; no clipboard stub is loaded, so the sample includes the OS clipboard
// write. Same sample definition as the portable e2e/clipboard-perf.spec.ts (e2e/copy-timing.ts).
import { expect, test } from '@playwright/test';
import { preferredFormats } from '../../src/main/clipboard-export/formats';
import { openApp } from '../harness';
import {
  COPY_BUDGET_MS,
  COPY_SAMPLES,
  WHOLE,
  loadScheme40,
  reportCopies,
  timeCopies,
} from '../copy-timing';

test('SC12: copy of the 40-atom scheme reaches the Windows clipboard, median of 5 <= 500 ms', async () => {
  const { app, page } = await openApp();
  try {
    const atoms = await loadScheme40(page);
    const samples = await timeCopies(page);
    expect(samples).toHaveLength(COPY_SAMPLES);
    for (const s of samples)
      expect({ kind: s.kind, text: s.text }).toEqual({ kind: 'info', text: WHOLE });
    const has = await app.evaluate(
      async ({ clipboard }, key) => (key ? clipboard.has(key) : false),
      preferredFormats.png,
    );
    expect(has).toBe(true);
    expect(
      reportCopies('copy, 40-atom scheme, Windows clipboard', atoms, samples),
    ).toBeLessThanOrEqual(COPY_BUDGET_MS);
  } finally {
    await app.close();
  }
});
