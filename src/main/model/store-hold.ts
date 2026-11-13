// TB28 (SPEC-app-shell.md TH7, SEC12): the main-process test seam that stops the session store's
// chain at a named point, so an e2e test can kill the process exactly there (item (5): between the
// record write and the file write, and between the file write and the index). The test arms it by
// setting `globalThis.__chalkbondTestMain.hold = { point, tabId, reached: 0 }` and reads `reached`.
// Pure: no Electron, no Node built-ins. `index.ts` builds the function only when the test flags are
// honoured (an unpackaged build started with `--chalkbond-test-hooks`); otherwise the store gets
// no hold at all and nothing here is ever called.

/** Where the chain can be held (SS5's order: record, index with `writing`, file, index). */
export type HoldPoint = 'record-written' | 'file-written';

/** An armed hold: `tabId` absent means every tab; `reached` counts the arrivals (the test reads it). */
export interface StoreHold {
  point: HoldPoint;
  tabId?: string;
  reached: number;
}

/** The hold the test armed, or null when there is none or it is not well formed. */
function armed(main: unknown): StoreHold | null {
  if (typeof main !== 'object' || main === null) return null;
  const hold = (main as { hold?: unknown }).hold;
  if (typeof hold !== 'object' || hold === null) return null;
  const { point, tabId, reached } = hold as Record<string, unknown>;
  if (point !== 'record-written' && point !== 'file-written') return null;
  if (typeof reached !== 'number') return null;
  if (tabId !== undefined && typeof tabId !== 'string') return null;
  return hold as StoreHold;
}

/**
 * The store's `hold` option: resolves at once unless the armed hold names this point (and this
 * tab); then it counts the arrival and never settles, so the chain stays where it is until the
 * test kills the process. `read` is asked on every call, so a hold armed after start-up works.
 */
export function createStoreHold(
  read: () => unknown,
): (point: HoldPoint, tabId: string) => Promise<void> {
  return (point, tabId) => {
    const hold = armed(read());
    if (hold === null || hold.point !== point) return Promise.resolve();
    if (hold.tabId !== undefined && hold.tabId !== tabId) return Promise.resolve();
    hold.reached++;
    return new Promise<void>(() => undefined);
  };
}
