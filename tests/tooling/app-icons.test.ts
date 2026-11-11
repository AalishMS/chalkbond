// A16 (SPEC-app-shell.md IC1–IC3; SC13): the pure ICO writer and reader, and the committed icons.
// ICO: 6-byte ICONDIR (0, 1, count), 16-byte entries (width / height byte 0 for 256), PNG data.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readIcoDirectory, writeIco } from '../../scripts/ico.mjs';

const ROOT = resolve(__dirname, '../..');
const SIZES = [16, 20, 24, 32, 40, 48, 64, 256];
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** A PNG signature and an IHDR chunk of `size`², enough for the directory (CRC not checked). */
function tinyPng(size: number, extra = 0): Uint8Array {
  const bytes = new Uint8Array(33 + extra);
  bytes.set(SIGNATURE, 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12); // IHDR
  view.setUint32(16, size);
  view.setUint32(20, size);
  bytes.set([8, 6, 0, 0, 0], 24);
  return bytes;
}

/** IHDR width and height of the PNG at `offset`. */
function ihdr(bytes: Uint8Array, offset: number): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
  return [view.getUint32(16), view.getUint32(20)];
}

describe('writeIco / readIcoDirectory', () => {
  it('writes the header, 16-byte entries, offsets and the PNGs back to back', () => {
    const small = tinyPng(16);
    const large = tinyPng(256, 7);
    const ico = writeIco([
      { size: 16, bytes: small },
      { size: 256, bytes: large },
    ]);
    expect(Array.from(ico.subarray(0, 6))).toEqual([0, 0, 1, 0, 2, 0]);
    // Width and height bytes: 16, and 0 for 256.
    expect(Array.from(ico.subarray(6, 8))).toEqual([16, 16]);
    expect(Array.from(ico.subarray(22, 24))).toEqual([0, 0]);
    const dir = readIcoDirectory(ico);
    expect(dir).toEqual({
      type: 1,
      entries: [
        { width: 16, height: 16, planes: 1, bitCount: 32, size: small.length, offset: 38 },
        {
          width: 256,
          height: 256,
          planes: 1,
          bitCount: 32,
          size: large.length,
          offset: 38 + small.length,
        },
      ],
    });
    expect(ico.length).toBe(38 + small.length + large.length);
    expect(Array.from(ico.subarray(38, 38 + small.length))).toEqual(Array.from(small));
    expect(Array.from(ico.subarray(38 + small.length))).toEqual(Array.from(large));
  });

  it('refuses a non-PNG entry, a size outside 1..256, or nothing at all', () => {
    expect(() => writeIco([{ size: 16, bytes: new Uint8Array([1, 2, 3]) }])).toThrow();
    expect(() => writeIco([{ size: 0, bytes: tinyPng(1) }])).toThrow();
    expect(() => writeIco([{ size: 257, bytes: tinyPng(257) }])).toThrow();
    expect(() => writeIco([])).toThrow();
  });

  it('readIcoDirectory refuses a file that is not an icon or is cut short', () => {
    expect(() => readIcoDirectory(new Uint8Array([0, 0, 2, 0, 0, 0]))).toThrow();
    const ico = writeIco([{ size: 16, bytes: tinyPng(16) }]);
    expect(() => readIcoDirectory(ico.subarray(0, 20))).toThrow();
    expect(() => readIcoDirectory(ico.subarray(0, ico.length - 1))).toThrow();
  });
});

describe('committed icons (IC1–IC3)', () => {
  for (const file of ['build/icon.ico', 'build/chalk-file.ico']) {
    it(`${file}: every IC3 size, each a PNG whose IHDR matches`, () => {
      const bytes = new Uint8Array(readFileSync(resolve(ROOT, file)));
      const dir = readIcoDirectory(bytes);
      expect(dir.entries.map((e) => e.width)).toEqual(SIZES);
      for (const entry of dir.entries) {
        expect(entry.height).toBe(entry.width);
        expect(Array.from(bytes.subarray(entry.offset, entry.offset + 8))).toEqual(SIGNATURE);
        expect(ihdr(bytes, entry.offset)).toEqual([entry.width, entry.width]);
      }
    });
  }

  it('build/icon.png is 256 × 256 and equals the app icon’s 256 entry (About box)', () => {
    const png = new Uint8Array(readFileSync(resolve(ROOT, 'build/icon.png')));
    expect(Array.from(png.subarray(0, 8))).toEqual(SIGNATURE);
    expect(ihdr(png, 0)).toEqual([256, 256]);
    const ico = new Uint8Array(readFileSync(resolve(ROOT, 'build/icon.ico')));
    const big = readIcoDirectory(ico).entries.at(-1);
    if (!big) throw new Error('no entries');
    expect(Array.from(ico.subarray(big.offset, big.offset + big.size))).toEqual(Array.from(png));
  });

  it('npm run icons is wired to scripts/build-icons.mjs', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['icons']).toBe('node scripts/build-icons.mjs');
  });
});
