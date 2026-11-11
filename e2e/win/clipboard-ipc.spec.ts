import { expect, test } from '@playwright/test';
import { launchApp, expectBlockedRequests } from '../launch';
import { preferredFormats } from '../../src/main/clipboard-export/formats';
import { pngSize, readElectronClipboard, readWindowsClipboard } from './windows-clipboard';

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
    // Electron: the drawing is exact, the bitmap is found, the SVG is listed under its plain name.
    const electron = await readElectronClipboard(app, [
      preferredFormats.bitmap,
      preferredFormats.drawing,
    ]);
    expect(electron.has[preferredFormats.bitmap]).toBe(true);
    expect(Buffer.from(electron.bytes[preferredFormats.drawing] ?? [])).toEqual(Buffer.from('{}'));
    expect(electron.types).toContain('image/svg+xml');
    // Windows (what Office sees): native SVG and drawing exact, a PNG of the same pixel size
    // (Chromium re-encodes it, so the bytes differ), no text format.
    const native = readWindowsClipboard();
    expect(native.nativeFormats).toEqual(
      expect.arrayContaining(['PNG', 'image/svg+xml', 'application/x-chalkbond']),
    );
    expect(native.formats).not.toContain('Text');
    expect(native.formats).not.toContain('UnicodeText');
    expect(native.streams['image/svg+xml']).toEqual(Buffer.from(result.svg));
    expect(native.streams['application/x-chalkbond']).toEqual(Buffer.from('{}'));
    expect(pngSize(native.streams['PNG'] ?? Buffer.alloc(24))).toEqual(
      pngSize(Uint8Array.from(result.png)),
    );
    expectBlockedRequests(app, 0);
  } finally {
    await app.close();
  }
});
