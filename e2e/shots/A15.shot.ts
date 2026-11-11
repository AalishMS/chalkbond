// A15 shot (tasks/todo-app-shell.md; mock-up A13): the scheme with a synthetic Files dragenter:
// the pale blue overlay over the whole page, the 8 px inset dashed accent box, "Drop to open" and
// the second line centred.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { serialize } from '../../src/core/doc-model';
import { dispatchDrag, stageFiles } from '../drop-steps';
import { loadScheme } from '../fixtures';
import { goldenDoc, openApp, shot } from '../harness';

test('A15 drop', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chalkbond-shot-drop-'));
  const { app, page } = await openApp();
  try {
    const file = join(dir, 'ethanol.chalk');
    writeFileSync(file, serialize(goldenDoc('ethanol')));
    await loadScheme(page);
    await page.mouse.move(1270, 790);
    await stageFiles(page, [file]);
    await dispatchDrag(page, 'dragenter');
    await expect(page.getByTestId('drop-overlay')).toBeVisible();
    await shot(page, 'A15', 'drop');
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
