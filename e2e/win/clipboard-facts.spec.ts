import { test, expect, type ElectronApplication } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderSvg } from '../../src/core/svg-render';
import { serialize } from '../../src/core/doc-model';
import {
  BITMAP_KEY,
  DRAWING_KEY,
  PNG_KEY,
  SVG_KEY,
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

// C3 observation tests (recorders): each variant does ONE clipboard.write that always carries the
// bitmap, then records what Electron and .NET (outside Electron) report. They assert only that the
// observation is complete, never which keys work; the key decision is made from the PROBE lines.
interface ProbeEntry {
  key: string;
  kind: 'blob' | 'string';
  /** The Blob type (ignored for a string value). */
  type: string;
  bytes: number[];
}

const sha256 = (bytes: Uint8Array | number[]): string =>
  createHash('sha256').update(Uint8Array.from(bytes)).digest('hex');

async function probePng(app: ElectronApplication): Promise<number[]> {
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
  // The same valid pHYs chunk as `write` above: a platform re-encoding drops it.
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
  return png;
}

// .NET side, outside Electron. Raw formats come back as a MemoryStream; anything else is recorded.
const DOTNET_SCRIPT = String.raw`
Add-Type -AssemblyName System.Windows.Forms
$expect = Get-Content -Raw -Encoding UTF8 $env:CHALKBOND_PROBE_EXPECT | ConvertFrom-Json
$latin = [Text.Encoding]::GetEncoding(28591)
$sha = [Security.Cryptography.SHA256]::Create()
$data = [System.Windows.Forms.Clipboard]::GetDataObject()
$out = [ordered]@{ formats = @($data.GetFormats()); nativeFormats = @($data.GetFormats($false)); data = [ordered]@{} }
foreach ($name in $out.formats) {
  if ($name -notmatch '^(PNG|application/x-chalkbond|Web Custom Format\d+)$' -and $name -notlike '*svg*') { continue }
  $entry = [ordered]@{}
  try {
    $value = $data.GetData($name)
    if ($null -eq $value) { $entry.result = 'null' }
    elseif ($value -is [System.IO.MemoryStream]) {
      $bytes = $value.ToArray()
      $text = $latin.GetString($bytes)
      $want = $expect.sha.PSObject.Properties[$name]
      if ($null -eq $want -and $name -like '*svg*') { $want = $expect.sha.PSObject.Properties['image/svg+xml'] }
      $entry.result = 'stream'
      $entry.length = $bytes.Length
      $entry.sha256 = ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join ''
      $entry.equalsWritten = if ($null -eq $want) { $null } else { $entry.sha256 -eq $want.Value }
      $entry.containsPHYs = $text.Contains('pHYs')
      $entry.containsDrawing = $text.Contains($expect.drawingNeedle)
      $entry.containsSvg = $text.Contains($expect.svgNeedle)
    } else { $entry.result = 'other ' + $value.GetType().FullName }
  } catch { $entry.result = 'error ' + $_.Exception.Message }
  $out.data[$name] = $entry
}
$out | ConvertTo-Json -Depth 6 -Compress
`;

function dotnetSide(png: number[], svg: string, drawing: string) {
  const dir = mkdtempSync(join(tmpdir(), 'chalkbond-probe-'));
  try {
    const expectFile = join(dir, 'expect.json');
    const scriptFile = join(dir, 'probe.ps1');
    writeFileSync(
      expectFile,
      JSON.stringify({
        sha: {
          PNG: sha256(png),
          'image/svg+xml': sha256(Buffer.from(svg)),
          'application/x-chalkbond': sha256(Buffer.from(drawing)),
        },
        svgNeedle: svg.slice(0, 60),
        drawingNeedle: drawing.slice(0, 60),
      }),
    );
    writeFileSync(scriptFile, DOTNET_SCRIPT);
    const stdout = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptFile],
      { encoding: 'utf8', env: { ...process.env, CHALKBOND_PROBE_EXPECT: expectFile } },
    );
    return JSON.parse(stdout.trim()) as {
      formats: string[] | string;
      nativeFormats: string[] | string;
      data: Record<string, unknown>;
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function observe(
  variant: string,
  describe: (png: number[], svg: Uint8Array, drawing: Uint8Array) => ProbeEntry[],
): Promise<void> {
  const app = await launchApp();
  try {
    const png = await probePng(app);
    const doc = goldenDoc('ethanol');
    const svg = renderSvg(doc).svg;
    const drawing = serialize(doc);
    const entries = describe(png, Buffer.from(svg), Buffer.from(drawing));
    const write = await app.evaluate(async ({ clipboard, ClipboardItem }, list) => {
      try {
        await clipboard.write([
          new ClipboardItem(
            Object.fromEntries(
              list.map((entry) => [
                entry.key,
                entry.kind === 'string'
                  ? Buffer.from(entry.bytes).toString('utf8')
                  : new Blob([new Uint8Array(entry.bytes)], { type: entry.type }),
              ]),
            ),
          ),
        ]);
        return 'resolved';
      } catch (error) {
        return 'rejected: ' + String(error);
      }
    }, entries);
    const electronSide = await app.evaluate(async ({ clipboard }, list) => {
      const has: Record<string, boolean | string> = {};
      for (const entry of list) {
        has[entry.key] = await clipboard.has(entry.key).catch((error: unknown) => String(error));
      }
      const items = await clipboard.read();
      const types = items.map((item) => item.types);
      const read: Record<string, unknown> = {};
      for (const entry of list) {
        const item = items.find((i) => i.types.includes(entry.key));
        if (!item) {
          read[entry.key] = { inTypes: false };
          continue;
        }
        const blob = await item.getType(entry.key);
        const got = 'arrayBuffer' in blob ? Buffer.from(await blob.arrayBuffer()) : null;
        read[entry.key] = {
          inTypes: true,
          length: got?.length ?? null,
          equalsWritten: got?.equals(Buffer.from(entry.bytes)) ?? false,
          ...(entry.key === 'image/png' ? { containsPHYs: got?.includes('pHYs') ?? false } : {}),
        };
      }
      return { has, types, read };
    }, entries);
    const dotnet = dotnetSide(png, svg, drawing);
    const observation = {
      written: entries.map((e) => `${e.key} [${e.kind}${e.kind === 'blob' ? ' ' + e.type : ''}]`),
      write,
      ...electronSide,
      dotnet,
    };
    const json = JSON.stringify(observation);
    console.log(`PROBE ${variant} ${json}`);
    await test.info().attach(`PROBE ${variant}`, { body: json, contentType: 'application/json' });
    // Completeness only: the write returned or rejected, and .NET ran and returned a list.
    expect(write).toMatch(/^(resolved|rejected)/);
    expect(Array.isArray(electronSide.types)).toBe(true);
    expect(Array.isArray(dotnet.formats) || typeof dotnet.formats === 'string').toBe(true);
  } finally {
    await app.close();
  }
}

const blob = (key: string, bytes: Uint8Array | number[], type = ''): ProbeEntry => ({
  key,
  kind: 'blob',
  type,
  bytes: Array.from(bytes),
});
const bitmapEntry = (png: number[]): ProbeEntry => blob(BITMAP_KEY, png, 'image/png');

test('PROBE V1 preferred set (raw PNG, raw SVG, raw drawing; Blob type empty)', async () => {
  await observe('V1', (png, svg, drawing) => [
    bitmapEntry(png),
    blob(PNG_KEY, png),
    blob(SVG_KEY, svg),
    blob(DRAWING_KEY, drawing),
  ]);
});
test('PROBE V2 MIME image/svg+xml, Blob type image/svg+xml, raw drawing', async () => {
  await observe('V2', (png, svg, drawing) => [
    bitmapEntry(png),
    blob('image/svg+xml', svg, 'image/svg+xml'),
    blob(DRAWING_KEY, drawing),
  ]);
});
test('PROBE V3 MIME image/svg+xml, string value, raw drawing', async () => {
  await observe('V3', (png, svg, drawing) => [
    bitmapEntry(png),
    { key: 'image/svg+xml', kind: 'string', type: '', bytes: Array.from(svg) },
    blob(DRAWING_KEY, drawing),
  ]);
});
test('PROBE V4 raw SVG key, Blob type image/svg+xml, raw drawing', async () => {
  await observe('V4', (png, svg, drawing) => [
    bitmapEntry(png),
    blob(SVG_KEY, svg, 'image/svg+xml'),
    blob(DRAWING_KEY, drawing),
  ]);
});
test('PROBE V5 raw PNG key, Blob type image/png, raw drawing', async () => {
  await observe('V5', (png, _svg, drawing) => [
    bitmapEntry(png),
    blob(PNG_KEY, png, 'image/png'),
    blob(DRAWING_KEY, drawing),
  ]);
});
test('PROBE V6 web image/svg+xml, raw drawing', async () => {
  await observe('V6', (png, svg, drawing) => [
    bitmapEntry(png),
    blob('web image/svg+xml', svg),
    blob(DRAWING_KEY, drawing),
  ]);
});
test('PROBE V7 bitmap alone', async () => {
  await observe('V7', (png) => [bitmapEntry(png)]);
});
test('PROBE V8 bitmap + web application/x-chalkbond', async () => {
  await observe('V8', (png, _svg, drawing) => [
    bitmapEntry(png),
    blob('web application/x-chalkbond', drawing),
  ]);
});
// V9 repeats the earlier fallback exactly (MIME key, empty Blob type, raw drawing) as a control:
// V2 and V3 differ from it only in how the SVG value is typed.
test('PROBE V9 control: MIME image/svg+xml, Blob type empty, raw drawing', async () => {
  await observe('V9', (png, svg, drawing) => [
    bitmapEntry(png),
    blob('image/svg+xml', svg),
    blob(DRAWING_KEY, drawing),
  ]);
});
// V10: the full preferred set with every Blob typed (V1 leaves the types empty).
test('PROBE V10 preferred set with every Blob typed', async () => {
  await observe('V10', (png, svg, drawing) => [
    bitmapEntry(png),
    blob(PNG_KEY, png, 'image/png'),
    blob(SVG_KEY, svg, 'image/svg+xml'),
    blob(DRAWING_KEY, drawing, 'application/x-chalkbond'),
  ]);
});
