// TB28 (SPEC-app-shell.md TH7, SEC12): the main-process test seam that holds the session store's
// chain after a record write or after the file write of an auto-save, so an e2e test can kill the
// process at that exact point (item (5)). The seam reads `__chalkbondTestMain.hold`; index.ts wires
// it only when the test flags are honoured, so a packaged or flagless run never consults it.
import { describe, expect, it } from 'vitest';
import { createStoreHold, type StoreHold } from './store-hold';

const T = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
const U = '6a1f0c2d-3b4e-4f5a-9b6c-7d8e9f0a1b2c';

/** True when `promise` has not settled after the microtask queue drained. */
async function pending(promise: Promise<void>): Promise<boolean> {
  let settled = false;
  void promise.then(() => {
    settled = true;
  });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  return !settled;
}

describe('createStoreHold (TB28, TH7)', () => {
  it('lets every point through when the test object has no hold', async () => {
    const hold = createStoreHold(() => ({ blockedRequests: 0 }));
    await hold('record-written', T);
    await hold('file-written', T);
  });

  it('lets every point through when there is no test object at all', async () => {
    const hold = createStoreHold(() => undefined);
    await hold('record-written', T);
    await hold('file-written', T);
  });

  it('holds the chain at the named point for the named tab and counts the arrival', async () => {
    const state: StoreHold = { point: 'record-written', tabId: T, reached: 0 };
    const hold = createStoreHold(() => ({ hold: state }));
    const held = hold('record-written', T);
    expect(await pending(held)).toBe(true);
    expect(state.reached).toBe(1);
  });

  it('lets another point and another tab through without counting them', async () => {
    const state: StoreHold = { point: 'file-written', tabId: T, reached: 0 };
    const hold = createStoreHold(() => ({ hold: state }));
    await hold('record-written', T);
    await hold('file-written', U);
    expect(state.reached).toBe(0);
  });

  it('a hold with no tab id matches every tab', async () => {
    const state: StoreHold = { point: 'record-written', reached: 0 };
    const hold = createStoreHold(() => ({ hold: state }));
    expect(await pending(hold('record-written', U))).toBe(true);
    expect(state.reached).toBe(1);
  });

  it('reads the object at call time, so a hold set after start-up works', async () => {
    let main: { hold?: StoreHold } = {};
    const hold = createStoreHold(() => main);
    await hold('record-written', T);
    main = { hold: { point: 'record-written', reached: 0 } };
    expect(await pending(hold('record-written', T))).toBe(true);
    expect(main.hold?.reached).toBe(1);
  });

  it('ignores a hold that is not well formed', async () => {
    for (const bad of [
      null,
      'record-written',
      { point: 'somewhere', reached: 0 },
      { point: 'record-written', reached: 'x' },
      { point: 'record-written', tabId: 5, reached: 0 },
    ]) {
      const hold = createStoreHold(() => ({ hold: bad as never }));
      await hold('record-written', T);
    }
  });
});
