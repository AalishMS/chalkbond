import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  activateTab,
  goldenDoc,
  heardEvents,
  listenEvents,
  loadDocument,
  openApp,
  openTab,
  readDocument,
  readTabs,
  tabKeys,
} from './harness';
import { launchApp } from './launch';

// The test hook (SPEC-app-shell.md TH1-TH4): present with the flag, absent without it.

type HookWindow = Window & {
  __chalkbondTest?: { getSelection(): { atoms: string[]; bonds: string[]; objects: string[] } };
};

test('with the flags the hook loads a document and reads it back', async () => {
  const { app, page } = await openApp();
  try {
    const doc = goldenDoc('ethanol');
    await loadDocument(page, doc);
    expect(await readDocument(page)).toEqual(doc);
    await expect(page.locator('[data-layer="content"] [data-key]').first()).toBeAttached();
  } finally {
    await app.close();
  }
});

test('the hook reports the selection as arrays of ids and the events after an edit', async () => {
  const { app, page } = await openApp();
  try {
    await loadDocument(page, goldenDoc('ethanol'));
    await listenEvents(page);
    expect(await heardEvents(page)).toEqual([]);
    await page.getByTestId('canvas').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+a');
    const selection = await page.evaluate(() =>
      (window as HookWindow).__chalkbondTest?.getSelection(),
    );
    expect(selection?.atoms.length).toBeGreaterThan(0);
    expect(selection?.atoms.every((id) => typeof id === 'string')).toBe(true);
    await page.keyboard.press('Delete');
    const types = (await heardEvents(page)).map((e) => e.type);
    expect(types).toContain('selection');
    expect(types).toContain('doc');
    expect(Object.keys((await readDocument(page)).atoms)).toEqual([]);
  } finally {
    await app.close();
  }
});

test('TB20: the hook reads the tabs (id, label, kind, active, marker) and activates one', async () => {
  const { app, page } = await openApp();
  try {
    await expect.poll(async () => (await readTabs(page)).length).toBe(1);
    const [first] = await readTabs(page);
    expect(first).toEqual({
      id: expect.any(String),
      label: 'Untitled',
      kind: 'untitled',
      active: true,
      marker: 'none',
    });
    await loadDocument(page, goldenDoc('ethanol'));
    await expect.poll(async () => (await readTabs(page))[0]?.marker).toBe('dot');
    const second = await openTab(page);
    expect(await tabKeys(page)).toEqual([first?.id, second]);
    expect(Object.keys((await readDocument(page)).atoms)).toEqual([]);
    await activateTab(page, first?.id ?? '');
    expect((await readTabs(page)).map((t) => t.active)).toEqual([true, false]);
    expect((await readDocument(page)).atoms).toEqual(goldenDoc('ethanol').atoms);
  } finally {
    await app.close();
  }
});

test('without --chalkbond-test-hooks the hook does not exist at all', async () => {
  const { app, page } = await openApp({ launch: { testHooks: false } });
  try {
    // The editor has mounted, so an absent hook is not just a hook that has not appeared yet.
    await expect(page.getByTestId('canvas')).toBeVisible();
    expect(await page.evaluate(() => typeof (window as HookWindow).__chalkbondTest)).toBe(
      'undefined',
    );
    expect(await page.evaluate(() => window.location.search)).toBe('');
    expect(
      await app.evaluate(
        () => typeof (globalThis as { __chalkbondTestMain?: unknown }).__chalkbondTestMain,
      ),
    ).toBe('undefined');
  } finally {
    await app.close();
  }
});

test('with the flag main defines the test object with a zero blocked-request count', async () => {
  const { app } = await openApp();
  try {
    expect(
      await app.evaluate(
        () =>
          (globalThis as { __chalkbondTestMain?: { blockedRequests: number } }).__chalkbondTestMain,
      ),
    ).toEqual({ blockedRequests: 0 });
  } finally {
    await app.close();
  }
});

test('two launches get different user-data folders that exist while the app runs', async () => {
  const first = await launchApp();
  const second = await launchApp();
  try {
    const dirs = await Promise.all(
      [first, second].map((a) => a.evaluate(({ app }) => app.getPath('userData'))),
    );
    expect(dirs[0]).not.toBe(dirs[1]);
    expect(dirs[0]).toContain('chalkbond-e2e-');
    expect(dirs[1]).toContain('chalkbond-e2e-');
    expect(existsSync(dirs[0] ?? '')).toBe(true);
  } finally {
    await first.close();
    await second.close();
  }
});

test('a launch given a user-data folder uses it', async () => {
  const dir = (await launchApp().then(async (a) => {
    const d = await a.evaluate(({ app }) => app.getPath('userData'));
    await a.close();
    return d;
  })) as string;
  const app = await launchApp({ userData: dir });
  try {
    expect(dir).toContain('chalkbond-e2e-');
    expect(await app.evaluate(({ app: a }) => a.getPath('userData'))).toBe(dir);
  } finally {
    await app.close();
  }
});

test('a launch with scripted dialogs answers in order and records the options', async () => {
  const app = await launchApp({
    dialogs: [
      { response: 1, checkboxChecked: false },
      { canceled: true, filePaths: [] },
    ],
  });
  try {
    const answers = await app.evaluate(async ({ dialog }) => [
      await dialog.showMessageBox({ message: 'Save changes?', buttons: ['Save', "Don't save"] }),
      await dialog.showOpenDialog({ title: 'Open', properties: ['openFile'] }),
    ]);
    expect(answers).toEqual([
      { response: 1, checkboxChecked: false },
      { canceled: true, filePaths: [] },
    ]);
    const log = await app.evaluate(
      () => (globalThis as { __chalkbondDialogLog?: unknown[] }).__chalkbondDialogLog,
    );
    expect(log).toEqual([
      {
        method: 'showMessageBox',
        options: { message: 'Save changes?', buttons: ['Save', "Don't save"] },
      },
      { method: 'showOpenDialog', options: { title: 'Open', properties: ['openFile'] } },
    ]);
    // Nothing is left to answer a third box: it fails loudly instead of hanging.
    const error = await app.evaluate(({ dialog }) =>
      dialog.showSaveDialog({}).then(
        () => 'resolved',
        (e: Error) => e.message,
      ),
    );
    expect(error).toContain('no scripted answer');
  } finally {
    await app.close();
  }
});
