// Paste provenance after a failed copy (SPEC-clipboard-export.md CB-C2, CB-P1, Decision C8).
// Portable: main's clipboard is the in-memory store of e2e/stub-clipboard-memory.mjs behind the
// real adapter, flow and rasteriser; its next write is made to fail. Not Windows clipboard proof.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { heardNotices, insertName, openApp, readDocument, readSelection } from './harness';

type StubGlobal = { __chalkbondClipboardStub: { failNextWrite(): void } };
const failNextWrite = (app: ElectronApplication) =>
  app.evaluate(() => {
    (globalThis as unknown as StubGlobal).__chalkbondClipboardStub.failNextWrite();
  });
type HookWindow = { __chalkbondTest?: { run(cmd: string): void } };
const selectAll = async (page: Page) => {
  await page.evaluate(() => (window as HookWindow).__chalkbondTest?.run('select-all'));
  await page.getByTestId('canvas').focus();
};
const atomCount = async (page: Page) => Object.keys((await readDocument(page)).atoms).length;
const lastNotice = async (page: Page) => (await heardNotices(page)).at(-1)?.text;

test('copy A, a failed copy B, Ctrl+V: pastes A (the clipboard), never B (the in-app copy)', async () => {
  const { app, page } = await openApp({ launch: { clipboardMemory: true } });
  try {
    await insertName(page, 'ethanol');
    await expect.poll(() => atomCount(page)).toBe(3);
    await selectAll(page);
    await page.keyboard.press('Control+c'); // A: ethanol, 3 atoms
    await expect
      .poll(() => lastNotice(page))
      .toBe('Copied. Paste into PowerPoint or Word with Ctrl+V.');

    await insertName(page, 'acetic acid');
    await expect.poll(() => atomCount(page)).toBe(7);
    await selectAll(page);
    expect((await readSelection(page)).atoms).toHaveLength(7);
    await failNextWrite(app);
    await page.keyboard.press('Control+c'); // B: 7 atoms; the system write fails
    await expect.poll(() => lastNotice(page)).toBe("Couldn't copy. Please try again.");

    await page.keyboard.press('Control+v');
    await expect.poll(() => atomCount(page)).not.toBe(7);
    expect(await atomCount(page)).toBe(7 + 3);
    expect((await readSelection(page)).atoms).toHaveLength(3);
  } finally {
    await app.close();
  }
});
