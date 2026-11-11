import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { launchApp, expectBlockedRequests } from '../launch';
import { preferredFormats } from '../../src/main/clipboard-export/formats';

test('named IPC writes and reads the real Windows clipboard atomically', async () => {
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    const result = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 8;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
      if (!blob) throw Error('no PNG');
      const png = new Uint8Array(await blob.arrayBuffer());
      const request = { png, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', drawing: '{}' };
      return {
        ok: await window.chalkbond.clipboardWrite(request),
        clip: await window.chalkbond.clipboardRead(),
        png: Array.from(png),
        svg: request.svg,
      };
    });
    expect(result.ok).toEqual({ ok: true });
    expect(result.clip).toEqual({ drawing: '{}', text: null, textTooLong: false, image: true });
    const bytes = await app.evaluate(async ({ clipboard }, formats) => {
      const items = await clipboard.read();
      const values: Record<string, number[]> = {};
      for (const key of [formats.png, formats.svg, formats.drawing]) {
        if (!key) continue;
        const item = items.find((entry) => entry.types.includes(key));
        if (!item) throw Error(`Missing ${key}`);
        const blob = await item.getType(key);
        if (!('arrayBuffer' in blob)) throw Error('Expected Blob');
        values[key] = Array.from(new Uint8Array(await blob.arrayBuffer()));
      }
      return values;
    }, preferredFormats);
    expect(bytes[preferredFormats.png ?? '']).toEqual(result.png);
    expect(bytes[preferredFormats.svg ?? '']).toEqual(Array.from(Buffer.from(result.svg)));
    expect(bytes[preferredFormats.drawing]).toEqual(Array.from(Buffer.from('{}')));
    const formats = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-STA',
        '-Command',
        'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetDataObject().GetFormats()',
      ],
      { encoding: 'utf8' },
    );
    for (const key of ['PNG', 'image/svg+xml', 'application/x-chalkbond'])
      expect(formats).toContain(key);
    expect(formats).not.toMatch(/UnicodeText|^Text$/m);
    expectBlockedRequests(app, 0);
  } finally {
    await app.close();
  }
});
