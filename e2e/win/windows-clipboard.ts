// The Windows side of the clipboard, read outside Electron with .NET (System.Windows.Forms), as
// Office would see it. Shared by the e2e/win clipboard specs (CB-W1, probe C3). Windows only.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication } from '@playwright/test';

/** Native formats whose bytes are read back (each comes from a MemoryStream). */
const STREAM_FORMATS = ['PNG', 'image/svg+xml', 'application/x-chalkbond'];

const SCRIPT = String.raw`
Add-Type -AssemblyName System.Windows.Forms
$data = [System.Windows.Forms.Clipboard]::GetDataObject()
$out = [ordered]@{ formats = @(); nativeFormats = @(); streams = [ordered]@{} }
if ($null -ne $data) {
  $out.formats = @($data.GetFormats())
  $out.nativeFormats = @($data.GetFormats($false))
  foreach ($name in $env:CHALKBOND_STREAMS.Split(',')) {
    if ($out.formats -notcontains $name) { continue }
    $value = $data.GetData($name)
    if ($value -is [System.IO.MemoryStream]) {
      $out.streams[$name] = [Convert]::ToBase64String($value.ToArray())
    }
  }
}
$out | ConvertTo-Json -Depth 4 -Compress
`;

export interface WindowsClipboard {
  /** Every format name .NET lists (converted ones included). */
  formats: string[];
  /** The native (unconverted) names. */
  nativeFormats: string[];
  /** The bytes of each stream format in `STREAM_FORMATS` that is present. */
  streams: Record<string, Buffer>;
}

const asList = (value: string[] | string | null): string[] =>
  value === null ? [] : Array.isArray(value) ? value : [value];

/** Reads the current Windows clipboard through a separate `powershell -STA` process. */
export function readWindowsClipboard(): WindowsClipboard {
  const dir = mkdtempSync(join(tmpdir(), 'chalkbond-clip-'));
  try {
    const script = join(dir, 'read.ps1');
    writeFileSync(script, SCRIPT);
    const stdout = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script],
      { encoding: 'utf8', env: { ...process.env, CHALKBOND_STREAMS: STREAM_FORMATS.join(',') } },
    );
    const parsed = JSON.parse(stdout.trim()) as {
      formats: string[] | string | null;
      nativeFormats: string[] | string | null;
      streams: Record<string, string>;
    };
    return {
      formats: asList(parsed.formats),
      nativeFormats: asList(parsed.nativeFormats),
      streams: Object.fromEntries(
        Object.entries(parsed.streams).map(([name, base64]) => [
          name,
          Buffer.from(base64, 'base64'),
        ]),
      ),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const PHYS_DPI_11811 = (() => {
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
  return chunk;
})();

/** A real 8x8 canvas PNG with a valid `pHYs` chunk (11811 px/m) inserted after IHDR. */
export async function pngWithPhys(app: ElectronApplication): Promise<Buffer> {
  const page = await app.firstWindow();
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.fillRect(1, 1, 6, 6);
    return canvas.toDataURL().split(',')[1] ?? '';
  });
  const png = Buffer.from(base64, 'base64');
  return Buffer.concat([png.subarray(0, 33), PHYS_DPI_11811, png.subarray(33)]);
}

export interface ClipboardEntry {
  key: string;
  /** A string value, or bytes written as a Blob (typed when `type` is given). */
  value: string | Uint8Array;
  type?: string;
}

/** One `clipboard.write` of one `ClipboardItem` in main; resolves when the write resolved. */
export async function writeEntries(
  app: ElectronApplication,
  entries: ClipboardEntry[],
): Promise<void> {
  const serial = entries.map((e) => ({
    key: e.key,
    text: typeof e.value === 'string' ? e.value : null,
    bytes: typeof e.value === 'string' ? null : Array.from(e.value),
    type: e.type ?? '',
  }));
  await app.evaluate(async ({ clipboard, ClipboardItem }, list) => {
    await clipboard.write([
      new ClipboardItem(
        Object.fromEntries(
          list.map((e) => [
            e.key,
            e.text !== null ? e.text : new Blob([new Uint8Array(e.bytes ?? [])], { type: e.type }),
          ]),
        ),
      ),
    ]);
  }, serial);
}

export interface ElectronClipboard {
  types: string[];
  has: Record<string, boolean>;
  /** The bytes `getType(key)` returns, for each requested key that `read()` lists. */
  bytes: Record<string, number[]>;
}

/** What Electron's own `clipboard.has` / `read` report for the given keys. */
export async function readElectronClipboard(
  app: ElectronApplication,
  keys: string[],
): Promise<ElectronClipboard> {
  return app.evaluate(async ({ clipboard }, list) => {
    const items = await clipboard.read();
    const has: Record<string, boolean> = {};
    const bytes: Record<string, number[]> = {};
    for (const key of list) {
      has[key] = await clipboard.has(key);
      const item = items.find((i) => i.types.includes(key));
      if (!item) continue;
      const blob = await item.getType(key);
      if ('arrayBuffer' in blob) bytes[key] = Array.from(new Uint8Array(await blob.arrayBuffer()));
    }
    return { types: items.flatMap((i) => [...i.types]), has, bytes };
  }, keys);
}

/** Width and height from the IHDR chunk of a PNG. */
export function pngSize(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
