import { test, expect, type ElectronApplication } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { renderSvg } from '../../src/core/svg-render';
import { serialize } from '../../src/core/doc-model';
import {
  preferredFormats,
  selectFormats,
  type FormatSelection,
} from '../../src/main/clipboard-export/formats';
import { goldenDoc } from '../harness';
import { launchApp } from '../launch';

// Observations, not mocked failures: rejection selects only the named CB-W1 fallback.
async function write(app: ElectronApplication, formats: FormatSelection, bitmapOnly = false) {
  const page = await app.firstWindow();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.fillRect(1, 1, 6, 6);
    return Array.from(
      Uint8Array.from(atob(canvas.toDataURL().split(',')[1] ?? ''), (c) => c.charCodeAt(0)),
    );
  });
  // A real canvas PNG plus a valid pHYs chunk: P4 detects platform re-encoding.
  const chunk = Buffer.alloc(21);
  chunk.writeUInt32BE(9, 0);
  chunk.write('pHYs', 4);
  chunk.writeUInt32BE(11811, 8);
  chunk.writeUInt32BE(11811, 12);
  chunk[16] = 1;
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, 17)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 17);
  png.splice(33, 0, ...chunk);
  const doc = goldenDoc('ethanol');
  const svg = renderSvg(doc).svg;
  const drawing = serialize(doc);
  const entries: [string, number[]][] = [
    [formats.bitmap, png],
    ...(formats.png ? [[formats.png, png] as [string, number[]]] : []),
    ...(formats.svg ? [[formats.svg, Array.from(Buffer.from(svg))] as [string, number[]]] : []),
    [formats.drawing, Array.from(Buffer.from(drawing))],
  ];
  if (bitmapOnly) entries.splice(1);
  await app.evaluate(async ({ clipboard, ClipboardItem }, pairs) => {
    await clipboard.write([
      new ClipboardItem(
        Object.fromEntries(
          pairs.map(([key, bytes]) => [
            key,
            new Blob([new Uint8Array(bytes)], { type: key === 'image/png' ? key : '' }),
          ]),
        ),
      ),
    ]);
  }, entries);
  return entries;
}
async function roundtrip(app: ElectronApplication, entries: [string, number[]][]) {
  return app.evaluate(async ({ clipboard }, pairs) => {
    const items = await clipboard.read();
    const result = [];
    for (const [key, bytes] of pairs) {
      const item = items.find((i) => i.types.includes(key));
      const blob = item ? await item.getType(key) : null;
      result.push({
        key,
        has: await clipboard.has(key),
        equal:
          blob !== null &&
          'arrayBuffer' in blob &&
          Buffer.from(await blob.arrayBuffer()).equals(Buffer.from(bytes)),
      });
    }
    return result;
  }, entries);
}
const cases = [
  ['preferred', preferredFormats],
  ['raw PNG omitted', selectFormats({ png: 'omit' })],
  ['SVG MIME fallback', selectFormats({ png: 'omit', svg: 'mime' })],
  ['SVG omitted', selectFormats({ png: 'omit', svg: 'omit' })],
  ['drawing web fallback', selectFormats({ png: 'omit', svg: 'omit', drawing: 'web' })],
] as const;
for (const [name, formats] of cases) {
  test('P1/P2/P2b/P3/P6/P7 ' + name, async ({ browserName }, info) => {
    void browserName;
    const app = await launchApp();
    try {
      let entries: [string, number[]][];
      try {
        entries = await write(app, formats);
      } catch (error) {
        await info.attach('rejected-format', { body: String(error), contentType: 'text/plain' });
        // Only optional formats may fail; the all-fallback case must work.
        if (name === 'drawing web fallback') throw error;
        return;
      }
      const results = await roundtrip(app, entries);
      await info.attach('readback', {
        body: JSON.stringify(results),
        contentType: 'application/json',
      });
      for (const result of results) {
        expect(result.has).toBe(true);
        if (result.key !== 'image/png') expect(result.equal).toBe(true);
      }
      const names = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-STA',
          '-Command',
          'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetDataObject().GetFormats()',
        ],
        { encoding: 'utf8' },
      )
        .trim()
        .split(/\r?\n/);
      await info.attach('dotnet-formats', {
        body: JSON.stringify(names),
        contentType: 'application/json',
      });
      expect(names).not.toContain('Text');
      expect(names).not.toContain('UnicodeText');
      if (formats.png) expect(names).toContain('PNG');
      if (formats.svg === preferredFormats.svg) expect(names).toContain('image/svg+xml');
      if (formats.drawing === preferredFormats.drawing)
        expect(names).toContain('application/x-chalkbond');
      expect(
        await app.evaluate(async ({ clipboard }) => ({
          has: await clipboard.has('text/plain'),
          text: await clipboard.readText(),
        })),
      ).toEqual({ has: false, text: '' });
    } finally {
      await app.close();
    }
  });
}
test('P4 bitmap alone and P5 drawing survives quitting its writer', async ({
  browserName,
}, info) => {
  void browserName;
  let app = await launchApp();
  let entries: [string, number[]][];
  try {
    entries = await write(app, selectFormats({ png: 'omit', svg: 'omit', drawing: 'web' }));
  } finally {
    await app.close();
  }
  app = await launchApp();
  try {
    const drawing = entries.filter(([key]) => key === 'web application/x-chalkbond');
    expect(await roundtrip(app, drawing)).toEqual([
      { key: 'web application/x-chalkbond', has: true, equal: true },
    ]);
    const bitmap = entries.filter(([key]) => key === 'image/png');
    await app.evaluate(async ({ clipboard, ClipboardItem }, pairs) => {
      await clipboard.write([
        new ClipboardItem(
          Object.fromEntries(
            pairs.map(([key, bytes]) => [key, new Blob([new Uint8Array(bytes)], { type: key })]),
          ),
        ),
      ]);
    }, bitmap);
    const observation = await app.evaluate(async ({ clipboard }) => {
      const raw = 'electron application/osclipboard;format="PNG"';
      const items = await clipboard.read();
      const item = items.find((i) => i.types.includes(raw));
      const bytes = item ? Buffer.from(await (await item.getType(raw)).arrayBuffer()) : null;
      return {
        rawPNG: await clipboard.has(raw),
        phys: bytes?.includes(Buffer.from('pHYs')) ?? false,
        bitmapPhys: await (async () => {
          const image = items.find((i) => i.types.includes('image/png'));
          return image
            ? Buffer.from(await (await image.getType('image/png')).arrayBuffer()).includes(
                Buffer.from('pHYs'),
              )
            : false;
        })(),
      };
    });
    await info.attach('P4', { body: JSON.stringify(observation), contentType: 'application/json' });
  } finally {
    await app.close();
  }
});

test('P1 required bitmap has no fallback', async () => {
  const app = await launchApp();
  try {
    await write(app, preferredFormats, true);
    expect(await app.evaluate(({ clipboard }) => clipboard.has('image/png'))).toBe(true);
  } finally {
    await app.close();
  }
});
