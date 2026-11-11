// SC5 and the paste round trips (tasks/todo-clipboard-export.md C9) on the real Windows clipboard
// (Windows only; e2e/win is ignored elsewhere). The drawing key is the one probe C3 verified.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { drawingPayload } from '../../src/core/clipboard-export';
import {
  bounds,
  type AtomId,
  type BondId,
  type Doc,
  type ObjectId,
} from '../../src/core/doc-model';
import { preferredFormats } from '../../src/main/clipboard-export/formats';
import { expectBlockedRequests } from '../launch';
import {
  canvasPoint,
  goldenDoc,
  heardNotices,
  openApp,
  readContentView,
  readDocument,
  readSelection,
} from '../harness';
import { loadScheme, selectEthanol } from '../fixtures';

/** A 1×1 transparent PNG, base64: a picture from another app. */
const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** Main writes a drawing entry under the CB-W1 drawing key, as another Chalkbond session would. */
const writeDrawing = (app: ElectronApplication, drawing: string) =>
  app.evaluate(
    async ({ clipboard, ClipboardItem }, { key, text }) => {
      clipboard.clear();
      await clipboard.write([new ClipboardItem({ [key]: new Blob([text]) })]);
    },
    { key: preferredFormats.drawing, text: drawing },
  );
const writeText = (app: ElectronApplication, text: string) =>
  app.evaluate(async ({ clipboard }, value) => {
    clipboard.clear();
    await clipboard.writeText(value);
  }, text);

/** Focus on the canvas (a non-text target), then Ctrl+V. */
async function pasteOnCanvas(page: Page): Promise<void> {
  await page.getByTestId('canvas').focus();
  await page.keyboard.press('Control+v');
}

const atomIds = (doc: Doc): string[] => Object.keys(doc.atoms);
const added = (before: Doc, after: Doc): string[] =>
  atomIds(after).filter((id) => !(id in before.atoms));

async function expectNotice(page: Page, kind: string, text: string): Promise<void> {
  await expect(page.getByRole('status')).toHaveText(text);
  expect((await heardNotices(page)).at(-1)).toEqual({ kind, text });
}

test('SC5: ethanol selected, Ctrl+C, Ctrl+V: a copy at +(1, 1) BLU, selected, tool Select', async () => {
  const { app, page } = await openApp();
  try {
    await loadScheme(page);
    await selectEthanol(page);
    const before = await readDocument(page);
    const source = (await readSelection(page)).atoms;
    await page.keyboard.press('Control+c');
    await expect(page.getByTestId('copy')).toHaveText('Copied');
    await page.keyboard.press('Control+v');
    await expect
      .poll(async () => atomIds(await readDocument(page)).length)
      .toBe(atomIds(before).length + 3);
    const after = await readDocument(page);
    const fresh = added(before, after);
    const key = (p: { x: number; y: number; element: string }) =>
      `${p.element}@${p.x.toFixed(6)},${p.y.toFixed(6)}`;
    const atomOf = (doc: Doc, id: string) => {
      const atom = doc.atoms[id as AtomId];
      if (!atom) throw new Error(`no atom ${id}`);
      return atom;
    };
    const shifted = source.map((id) => {
      const atom = atomOf(before, id);
      return key({ element: atom.element, x: atom.x + 1, y: atom.y + 1 });
    });
    expect(fresh.map((id) => key(atomOf(after, id))).sort()).toEqual(shifted.sort());
    expect((await readSelection(page)).atoms.sort()).toEqual([...fresh].sort());
    await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
    expectBlockedRequests(app, 0);
  } finally {
    await app.close();
  }
});

test('Copy with nothing selected, Ctrl+V: the whole drawing as a fragment at the canvas centre', async () => {
  const { app, page } = await openApp();
  try {
    const before = await loadScheme(page);
    await page.getByTestId('copy').click();
    await expect(page.getByTestId('copy')).toHaveText('Copied');
    // CB1 places the fragment at the canvas centre of the view as it is when Ctrl+V is pressed;
    // V5 then brings the result into view and may zoom or pan, so the view is read first.
    const view = await readContentView(page);
    await pasteOnCanvas(page);
    await expect
      .poll(async () => atomIds(await readDocument(page)).length)
      .toBe(2 * atomIds(before).length);
    const after = await readDocument(page);
    expect(Object.keys(after.objects)).toHaveLength(2 * Object.keys(before.objects).length);
    const selection = await readSelection(page);
    expect(selection.atoms.sort()).toEqual(added(before, after).sort());
    // The pasted part's bounds centre was the canvas centre in the view at paste time (the pointer
    // is over the Copy button). Measured with the view of that moment, not the one after V5.
    const box = bounds(after, {
      atoms: new Set(selection.atoms as AtomId[]),
      bonds: new Set(selection.bonds as BondId[]),
      objects: new Set(selection.objects as ObjectId[]),
    });
    if (!box) throw new Error('nothing pasted');
    const canvas = await page.getByTestId('canvas').boundingBox();
    if (!canvas) throw new Error('canvas has no box');
    const centre = await canvasPoint(
      page,
      { x: box.x + box.w / 2, y: box.y + box.h / 2 },
      undefined,
      view,
    );
    expect(Math.abs(centre.x - (canvas.x + canvas.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(centre.y - (canvas.y + canvas.height / 2))).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
    expectBlockedRequests(app, 0);
  } finally {
    await app.close();
  }
});

test('CB-P2: a drawing main wrote as another session pastes as a fragment', async () => {
  const { app, page } = await openApp();
  try {
    const other = goldenDoc('naphthalene');
    await writeDrawing(app, drawingPayload(other));
    await pasteOnCanvas(page);
    await expect
      .poll(async () => atomIds(await readDocument(page)).length)
      .toBe(atomIds(other).length);
    const doc = await readDocument(page);
    expect(Object.keys(doc.bonds)).toHaveLength(Object.keys(other.bonds).length);
    expect((await readSelection(page)).atoms).toHaveLength(atomIds(other).length);
    expectBlockedRequests(app, 0);
  } finally {
    await app.close();
  }
});

test('plain text "ethanol" pastes through the name path: C2H6O in the status bar', async () => {
  const { app, page } = await openApp();
  try {
    await writeText(app, 'ethanol');
    await pasteOnCanvas(page);
    await expect(page.getByTestId('formula')).toContainText('C2H6O');
    expect(atomIds(await readDocument(page))).toHaveLength(3);
    expectBlockedRequests(app, 0);
  } finally {
    await app.close();
  }
});

test('N-P1: an image-only clipboard is not pasted', async () => {
  const { app, page } = await openApp();
  try {
    const before = await loadScheme(page);
    await app.evaluate(async ({ clipboard, ClipboardItem }, base64) => {
      clipboard.clear();
      const png = new Blob([Buffer.from(base64, 'base64')], { type: 'image/png' });
      await clipboard.write([new ClipboardItem({ 'image/png': png })]);
    }, PIXEL);
    await pasteOnCanvas(page);
    await expectNotice(page, 'info', 'Only drawings copied from Chalkbond can be pasted here.');
    expect(await readDocument(page)).toEqual(before);
    expectBlockedRequests(app, 0);
  } finally {
    await app.close();
  }
});

test('N-P3: a drawing from a newer Chalkbond is refused', async () => {
  const { app, page } = await openApp();
  try {
    const before = await loadScheme(page);
    const newer = drawingPayload(before).replace('"schemaVersion":1', '"schemaVersion":999');
    expect(newer).not.toBe(drawingPayload(before));
    await writeDrawing(app, newer);
    await pasteOnCanvas(page);
    await expectNotice(
      page,
      'error',
      "This drawing was copied from a newer version of Chalkbond and can't be pasted.",
    );
    expect(await readDocument(page)).toEqual(before);
    expectBlockedRequests(app, 0);
  } finally {
    await app.close();
  }
});

test('N-P4: a damaged drawing entry is refused', async () => {
  const { app, page } = await openApp();
  try {
    const before = await loadScheme(page);
    await writeDrawing(app, '{"format":');
    await pasteOnCanvas(page);
    await expectNotice(
      page,
      'error',
      "The copied drawing is damaged and can't be pasted. Copy it again.",
    );
    expect(await readDocument(page)).toEqual(before);
    expectBlockedRequests(app, 0);
  } finally {
    await app.close();
  }
});

test('N-P5: 70 000 characters of text are too long to paste', async () => {
  const { app, page } = await openApp();
  try {
    const before = await loadScheme(page);
    await writeText(app, 'a'.repeat(70000));
    await pasteOnCanvas(page);
    await expectNotice(page, 'info', 'That text is too long to paste.');
    expect(await readDocument(page)).toEqual(before);
    expectBlockedRequests(app, 0);
  } finally {
    await app.close();
  }
});

test('R4: Ctrl+V in the name field pastes the text into the field, not the drawing', async () => {
  const { app, page } = await openApp();
  try {
    const before = await loadScheme(page);
    await writeText(app, 'ethanol');
    const field = page.getByTestId('namefield-input');
    await field.click();
    await field.fill('');
    await page.keyboard.press('Control+v');
    await expect(field).toHaveValue('ethanol');
    expect(await readDocument(page)).toEqual(before);
    expectBlockedRequests(app, 0);
  } finally {
    await app.close();
  }
});
