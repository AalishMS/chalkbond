// A14 shots (tasks/todo-app-shell.md; TB20: the session store replaced the recovery box): the
// relaunch after a kill restores the drawing with no box (`restored`); with a .chalk on the command
// line the file opens in a new tab after the restore (`restored-with-file`). TB32 looks at them.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { serialize } from '../../src/core/doc-model';
import { goldenDoc, readDocument, shot } from '../harness';
import { drawThenKill, launchIn } from '../session-steps';

for (const name of ['restored', 'restored-with-file'] as const) {
  test(`A14 ${name}`, async () => {
    const userData = mkdtempSync(join(tmpdir(), 'chalkbond-shot-session-'));
    try {
      const file = join(userData, 'ethanol.chalk');
      writeFileSync(file, serialize(goldenDoc('ethanol')));
      const drawn = await drawThenKill(userData, 'benzene');
      const { app, page } = await launchIn(userData, {
        dialogs: [],
        extraArgs: name === 'restored' ? [] : [file],
      });
      try {
        const want = name === 'restored' ? drawn.doc.atoms : goldenDoc('ethanol').atoms;
        await expect.poll(async () => (await readDocument(page)).atoms).toEqual(want);
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
