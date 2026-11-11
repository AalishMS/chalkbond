// A9 shot (tasks/todo-app-shell.md): toluene opened from an exported PNG through the stubbed Open
// dialog, at the default zoom, nothing selected, the top bar's Copy enabled.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { drawingPayload, withPictureChunks } from '../../src/core/clipboard-export';
import { goldenDoc, openApp, readSelection, shot } from '../harness';

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const away = { x: 640, y: 786 }; // inside the status bar's empty middle: no canvas hover ghost

test('A9 opened-picture: toluene.png opened, nothing selected, Copy enabled', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chalkbond-a9-shot-'));
  const file = join(dir, 'toluene.png');
  writeFileSync(
    file,
    withPictureChunks(PIXEL, { dpi: 300, payload: drawingPayload(goldenDoc('toluene')) }),
  );
  const { app, page } = await openApp({
    launch: { dialogs: [{ canceled: false, filePaths: [file] }] },
  });
  try {
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+o');
    await expect
      .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle()))
      .toBe('toluene.png - Chalkbond');
    expect(await readSelection(page)).toEqual({ atoms: [], bonds: [], objects: [] });
    await expect(page.getByTestId('copy')).toBeEnabled();
    await page.mouse.move(away.x, away.y);
    await shot(page, 'A9', 'opened-picture');
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
