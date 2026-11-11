import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { goldenDoc, loadDocument, openApp, readDocument } from './harness';

// SPEC-app-shell.md F2 / F14: a name without an Open extension typed into the native Open dialog
// gets the `unsupported` error box (built in main from the base name), `chooseOpen` resolves null,
// and the drawing is untouched with no save prompt. The path stays in main (R8).

type ChooseOpenWindow = Window & { chalkbond: { chooseOpen(): Promise<unknown> } };

test('an unsupported name chosen in Open shows the F14 box and leaves the drawing', async () => {
  const typed = join(tmpdir(), 'Lessons', 'notes.docx');
  const { app, page } = await openApp({
    launch: { dialogs: [{ canceled: false, filePaths: [typed] }, { response: 0 }] },
  });
  try {
    const doc = goldenDoc('ethanol');
    await loadDocument(page, doc);
    const answer = await page.evaluate(() => (window as ChooseOpenWindow).chalkbond.chooseOpen());
    expect(answer).toBeNull();
    const log = await app.evaluate(
      () =>
        (globalThis as { __chalkbondDialogLog?: { method: string; options: unknown }[] })
          .__chalkbondDialogLog,
    );
    expect(log?.map((e) => e.method)).toEqual(['showOpenDialog', 'showMessageBox']);
    expect(log?.[1]?.options).toEqual({
      type: 'error',
      title: 'Chalkbond',
      message: "Chalkbond can't open “notes.docx”.",
      detail:
        'It opens Chalkbond drawings (.chalk) and pictures made in Chalkbond (.png, .svg, .pdf).',
      buttons: ['OK'],
    });
    expect(await readDocument(page)).toEqual(doc);
  } finally {
    await app.close();
  }
});
