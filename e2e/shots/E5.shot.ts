import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { openApp, resizeContent, shot } from '../harness';

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string): [number, number] {
  const buf = readFileSync(file);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

test('launch and resized screenshots have the requested sizes', async () => {
  const { app, page } = await openApp();
  try {
    const launch = await shot(page, 'E5', 'launch');
    expect(pngSize(launch)).toEqual([1280, 800]);

    await resizeContent(app, [960, 640]);
    await expect
      .poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight]))
      .toEqual([960, 640]);
    const small = await shot(page, 'E5', 'resized-960');
    expect(pngSize(small)).toEqual([960, 640]);
  } finally {
    await app.close();
  }
});
