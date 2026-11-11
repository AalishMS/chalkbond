// C9 shots (tasks/todo-clipboard-export.md). UI/model success only: main's clipboard is the
// in-memory store of e2e/stub-clipboard-memory.mjs behind the real adapter, flow and rasteriser.
// Not Windows clipboard proof: that is e2e/win/clipboard-paste.spec.ts.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { preferredFormats } from '../../src/main/clipboard-export/formats';
import { heardNotices, openApp, readDocument, readSelection, shot } from '../harness';
import { loadScheme, selectEthanol } from '../fixtures';

const away = { x: 640, y: 760 }; // the status bar's empty middle: no hover, no tooltip
/** A 1×1 transparent PNG, base64: a picture from another app. */
const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

type StubGlobal = { __chalkbondClipboardStub: { set(entries: Record<string, string>): void } };
const setClipboard = (app: ElectronApplication, entries: Record<string, string>) =>
  app.evaluate((_electron, value) => {
    (globalThis as unknown as StubGlobal).__chalkbondClipboardStub.set(value);
  }, entries);

async function pasteOnCanvas(page: Page): Promise<void> {
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Control+v');
}

test('C9 pasted-cascade: ethanol selected, Ctrl+C, Ctrl+V: a second ethanol 1 BLU right and down', async () => {
  const { app, page } = await openApp({ launch: { clipboardMemory: true } });
  try {
    const before = await loadScheme(page);
    await selectEthanol(page);
    const source = (await readSelection(page)).atoms;
    await page.keyboard.press('Control+c');
    await expect(page.getByTestId('copy')).toHaveText('Copied');
    await page.keyboard.press('Control+v');
    await expect
      .poll(async () => Object.keys((await readDocument(page)).atoms).length)
      .toBe(Object.keys(before.atoms).length + 3);
    const after = await readDocument(page);
    const selected = (await readSelection(page)).atoms;
    expect(selected).toHaveLength(3);
    const first = after.atoms[source[0] as keyof typeof after.atoms];
    const moved = selected.map((id) => after.atoms[id as keyof typeof after.atoms]);
    expect(moved.some((a) => a && first && a.x === first.x + 1 && a.y === first.y + 1)).toBe(true);
    await page.mouse.move(away.x, away.y);
    await shot(page, 'C9', 'pasted-cascade');
  } finally {
    await app.close();
  }
});

test('C9 notice-picture-only: an image-only clipboard, Ctrl+V: N-P1 as A17', async () => {
  const { app, page } = await openApp({ launch: { clipboardMemory: true } });
  try {
    const before = await loadScheme(page);
    await setClipboard(app, { 'image/png': PIXEL });
    await pasteOnCanvas(page);
    const text = 'Only drawings copied from Chalkbond can be pasted here.';
    await expect(page.getByRole('status')).toHaveText(text);
    expect((await heardNotices(page)).at(-1)).toEqual({ kind: 'info', text });
    expect(await readDocument(page)).toEqual(before);
    await page.mouse.move(away.x, away.y);
    await shot(page, 'C9', 'notice-picture-only');
  } finally {
    await app.close();
  }
});

test('C9 notice-damaged: a damaged drawing entry, Ctrl+V: N-P4 with the warning icon', async () => {
  const { app, page } = await openApp({ launch: { clipboardMemory: true } });
  try {
    const before = await loadScheme(page);
    await setClipboard(app, { [preferredFormats.drawing]: '{"format":' });
    await pasteOnCanvas(page);
    const text = "The copied drawing is damaged and can't be pasted. Copy it again.";
    await expect(page.getByRole('status')).toHaveText(text);
    expect((await heardNotices(page)).at(-1)).toEqual({ kind: 'error', text });
    expect(await readDocument(page)).toEqual(before);
    await page.mouse.move(away.x, away.y);
    await shot(page, 'C9', 'notice-damaged');
  } finally {
    await app.close();
  }
});
