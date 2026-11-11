// A14 shots (tasks/todo-app-shell.md): the relaunch after a kill with the stubbed box answering
// Recover: ethanol on the canvas, hint slot empty (`recovered`); with a .chalk on the command line,
// the RC4 notice in the hint slot (`recovered-with-file`). The box's look (A11) is on the checklist.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { serialize } from '../../src/core/doc-model';
import { goldenDoc, readDocument, shot } from '../harness';
import { drawThenKill, launchIn, RECOVER } from '../recovery-steps';

for (const name of ['recovered', 'recovered-with-file'] as const) {
  test(`A14 ${name}`, async () => {
    const userData = mkdtempSync(join(tmpdir(), 'chalkbond-shot-recovery-'));
    try {
      const file = join(userData, 'ethanol.chalk');
      writeFileSync(file, serialize(goldenDoc('ethanol')));
      const drawn = await drawThenKill(userData, 'ethanol');
      const { app, page } = await launchIn(userData, {
        dialogs: [RECOVER],
        extraArgs: name === 'recovered' ? [] : [file],
      });
      try {
        await expect.poll(async () => (await readDocument(page)).atoms).toEqual(drawn.atoms);
        if (name === 'recovered-with-file') {
          await expect(page.getByTestId('statusbar').getByRole('status')).toHaveText(
            'Recovered your unsaved drawing. Save it, then open ethanol.chalk again.',
          );
        }
        await page.mouse.move(1270, 790);
        await shot(page, 'A14', name);
      } finally {
        await app.close();
      }
    } finally {
      rmSync(userData, { recursive: true, force: true });
    }
  });
}
