import { expect, test } from '@playwright/test';
import { openApp } from './harness';

// Deterministic guard for e2e/no-os-mouse.mjs: it never touches the real cursor. The preload
// records every window it made click-through for OS mouse input on `globalThis`; this spec
// asserts the module was loaded and that every window, also one created later, is in the record.
// (The cursor-moving regression test is e2e/os-input/os-mouse.spec.ts, project `os-input`.)

test('every test window, including one created after launch, is made ignore OS mouse input', async () => {
  const { app } = await openApp();
  try {
    const before = await app.evaluate(({ BrowserWindow }) => {
      const guard = (globalThis as unknown as { __chalkbondNoOsMouse?: { ids: number[] } })
        .__chalkbondNoOsMouse;
      return {
        loaded: guard !== undefined,
        windows: BrowserWindow.getAllWindows().map((w) => w.id),
        guarded: guard?.ids ?? [],
      };
    });
    expect(before.loaded).toBe(true);
    expect(before.windows.length).toBeGreaterThan(0);
    for (const id of before.windows) expect(before.guarded).toContain(id);

    const after = await app.evaluate(({ BrowserWindow }) => {
      const extra = new BrowserWindow({ show: false });
      const guard = (globalThis as unknown as { __chalkbondNoOsMouse?: { ids: number[] } })
        .__chalkbondNoOsMouse;
      const result = { id: extra.id, guarded: guard?.ids ?? [] };
      extra.destroy();
      return result;
    });
    expect(after.guarded).toContain(after.id);
  } finally {
    await app.close();
  }
});
