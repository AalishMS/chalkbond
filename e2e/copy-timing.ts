// SC12 copy timing, shared by the portable spec (e2e/clipboard-perf.spec.ts, in-memory clipboard
// transport) and the Windows one (e2e/win/clipboard-perf.spec.ts, the real clipboard). One sample:
// a capture-phase listener on the Copy button records `t0` (performance.now, renderer clock) when
// Playwright's click reaches it; the copy's notice (shown right after the C1 write resolved, CB-C2)
// is detected by a MutationObserver (no polling task in the page while the copy runs): the first
// DOM mutation after which the button reads "Copied" and the test hook has heard a new notice;
// sample = that time - t0. No warm-up, no retry, no sleep: between samples the spec waits only for
// the button to return to rest.
import { cpus, totalmem } from 'node:os';
import { expect, type Page } from '@playwright/test';
import { insertName, readDocument, readSelection } from './harness';

/** SC12: the median of five copies of the 40-atom scheme. */
export const COPY_BUDGET_MS = 500;
export const COPY_SAMPLES = 5;
/** N-C2, exactly as mock-up A17. */
export const WHOLE = 'Copied the whole drawing. Paste into PowerPoint or Word with Ctrl+V.';

/** The editor perf fixture (e2e/editor-perf.spec.ts): the scheme plus five molecules, nothing selected. */
export async function loadScheme40(page: Page): Promise<number> {
  await insertName(page, 'ethanol + acetic acid -> ethyl acetate + water');
  for (const name of ['toluene', 'cyclohexane', 'pentane', 'benzene', 'ethanol']) {
    await insertName(page, name);
  }
  const atoms = Object.keys((await readDocument(page)).atoms).length;
  expect(atoms).toBeGreaterThanOrEqual(40);
  await page.getByTestId('canvas').focus();
  const empty = async () => {
    const s = await readSelection(page);
    return s.atoms.length + s.bonds.length + s.objects.length === 0;
  };
  for (let i = 0; i < 6 && !(await empty()); i++) await page.keyboard.press('Escape');
  expect(await empty()).toBe(true);
  return atoms;
}

interface CopySample {
  ms: number;
  kind: string;
  text: string;
}

/**
 * Clicks Copy `COPY_SAMPLES` times; returns each click-to-notice time (ms, renderer clock). Before
 * each click the button is back at rest ("Copy", after its 2 s); the sample ends at the first DOM
 * mutation (a MutationObserver, so the page runs no polling task of its own while the copy is
 * under way) after which the button reads "Copied" and the test hook has heard the new notice.
 */
export async function timeCopies(page: Page): Promise<CopySample[]> {
  const copy = page.getByTestId('copy');
  const samples: CopySample[] = [];
  for (let i = 0; i < COPY_SAMPLES; i++) {
    await expect(copy).toHaveText('Copy', { timeout: 5000 });
    await page.evaluate(() => {
      const w = window as unknown as {
        __chalkbondTest: { notices(): { kind: string; text: string }[] };
        __copySample: Promise<{ ms: number; kind: string; text: string }>;
      };
      const hook = w.__chalkbondTest;
      const button = document.querySelector('[data-testid="copy"]');
      if (!button) throw new Error('no Copy button');
      w.__copySample = new Promise((resolve) => {
        button.addEventListener(
          'click',
          () => {
            const t0 = performance.now();
            const before = hook.notices().length;
            const observer = new MutationObserver(() => {
              const t1 = performance.now();
              const last = hook.notices().at(-1);
              if (hook.notices().length > before && last && button.textContent === 'Copied') {
                observer.disconnect();
                resolve({ ms: t1 - t0, ...last });
              }
            });
            observer.observe(document.body, {
              subtree: true,
              childList: true,
              characterData: true,
              attributes: true,
            });
          },
          { capture: true, once: true },
        );
      });
    });
    await copy.click();
    samples.push(
      await page.evaluate(
        () => (window as unknown as { __copySample: Promise<CopySample> }).__copySample,
      ),
    );
  }
  return samples;
}

export function medianOf(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] as number;
}

/** The PERF line both specs print (docs/editor-perf.md takes it by hand). */
export function reportCopies(label: string, atoms: number, samples: CopySample[]): number {
  const ms = samples.map((s) => s.ms);
  const median = medianOf(ms);
  console.log(
    `PERF ${label}: ${atoms} atoms, n=${ms.length} median ${median.toFixed(1)} ms ` +
      `(samples ${ms.map((m) => m.toFixed(1)).join(', ')}); ${process.platform} ${process.arch}, ` +
      `${cpus()[0]?.model ?? '?'} x${cpus().length}, ${Math.round(totalmem() / 2 ** 30)} GB`,
  );
  return median;
}
