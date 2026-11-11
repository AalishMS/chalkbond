// Probe C3 (P1-P7, P2b) as assertions: the Windows facts CB-W1 rests on, observed with Electron
// 45.2.3 on Windows 11 (2026-11-11). They are tests so a change of Electron or Windows that breaks
// a key shows up. The `PROBE` line is the raw observation (docs: SPEC-clipboard-export.md Facts).
import { test, expect } from '@playwright/test';
import { renderSvg } from '../../src/core/svg-render';
import { serialize } from '../../src/core/doc-model';
import {
  BITMAP_KEY,
  DRAWING_KEY,
  SVG_KEY,
  preferredFormats,
} from '../../src/main/clipboard-export/formats';
import { goldenDoc } from '../harness';
import { launchApp } from '../launch';
import {
  pngSize,
  pngWithPhys,
  readElectronClipboard,
  readWindowsClipboard,
  writeEntries,
} from './windows-clipboard';

/** Observed to have no effect (P4): never written by the product. */
const RAW_PNG_KEY = 'electron application/osclipboard;format="PNG"';
const doc = goldenDoc('ethanol');
const svg = Buffer.from(renderSvg(doc).svg);
const drawing = Buffer.from(serialize(doc));

test('the product keys are exactly the verified three', () => {
  expect(preferredFormats).toEqual({ bitmap: BITMAP_KEY, svg: SVG_KEY, drawing: DRAWING_KEY });
  expect(Object.keys(preferredFormats)).toEqual(['bitmap', 'svg', 'drawing']);
});

test('P1/P2/P2b/P3/P6: the CB-W1 write is accepted, listed and byte-exact', async () => {
  const app = await launchApp();
  try {
    const png = await pngWithPhys(app);
    await writeEntries(app, [
      { key: BITMAP_KEY, value: png, type: 'image/png' },
      { key: SVG_KEY, value: svg },
      { key: DRAWING_KEY, value: drawing },
    ]);
    const electron = await readElectronClipboard(app, [BITMAP_KEY, DRAWING_KEY, SVG_KEY]);
    const native = readWindowsClipboard();
    console.log(
      `PROBE C3 ${JSON.stringify({ electron: { ...electron, bytes: undefined }, native: native.nativeFormats })}`,
    );
    // P2: bitmap and drawing are found by `has`; the raw SVG key is not, Electron reports the
    // entry under its plain name.
    expect(electron.has[BITMAP_KEY]).toBe(true);
    expect(electron.has[DRAWING_KEY]).toBe(true);
    expect(electron.has[SVG_KEY]).toBe(false);
    expect(electron.types).toContain(DRAWING_KEY);
    expect(electron.types).toContain('image/svg+xml');
    expect(electron.types).not.toContain(SVG_KEY);
    // P3: the drawing is exact through Electron's own getType.
    expect(Buffer.from(electron.bytes[DRAWING_KEY] ?? [])).toEqual(drawing);
    // P2b: the native list Office sees, and no text format (P6).
    expect(native.nativeFormats).toEqual(
      expect.arrayContaining(['PNG', 'image/svg+xml', 'application/x-chalkbond']),
    );
    expect(native.formats).not.toContain('Text');
    expect(native.formats).not.toContain('UnicodeText');
    // P3: the native SVG and drawing streams are byte-identical to what was written.
    expect(native.streams['image/svg+xml']).toEqual(svg);
    expect(native.streams['application/x-chalkbond']).toEqual(drawing);
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

test('P4: the native PNG is Chromium re-encoding without pHYs, with or without the raw PNG key', async () => {
  const app = await launchApp();
  try {
    const png = await pngWithPhys(app);
    expect(png.includes('pHYs')).toBe(true);
    await writeEntries(app, [{ key: BITMAP_KEY, value: png, type: 'image/png' }]);
    const alone = readWindowsClipboard().streams['PNG'];
    await writeEntries(app, [
      { key: BITMAP_KEY, value: png, type: 'image/png' },
      { key: RAW_PNG_KEY, value: png },
    ]);
    const electron = await readElectronClipboard(app, [BITMAP_KEY, RAW_PNG_KEY]);
    const withRaw = readWindowsClipboard().streams['PNG'];
    console.log(
      `PROBE P4 ${JSON.stringify({ has: electron.has, alone: alone?.length, withRaw: withRaw?.length })}`,
    );
    expect(alone).toBeDefined();
    expect(alone?.includes('pHYs')).toBe(false);
    expect(alone).not.toEqual(png);
    expect(pngSize(alone ?? Buffer.alloc(24))).toEqual({ width: 8, height: 8 });
    // The raw key changes nothing, and `has` does not find it even though a native PNG exists.
    expect(withRaw).toEqual(alone);
    expect(electron.has[RAW_PNG_KEY]).toBe(false);
    expect(electron.has[BITMAP_KEY]).toBe(true);
    expect(Buffer.from(electron.bytes[BITMAP_KEY] ?? []).includes('pHYs')).toBe(false);
  } finally {
    await app.close();
  }
});

test('P5: the raw drawing key survives its writer quitting', async () => {
  let app = await launchApp();
  try {
    await writeEntries(app, [
      { key: BITMAP_KEY, value: await pngWithPhys(app), type: 'image/png' },
      { key: SVG_KEY, value: svg },
      { key: DRAWING_KEY, value: drawing },
    ]);
  } finally {
    await app.close();
  }
  // The writer is gone: the native data is still there ...
  const native = readWindowsClipboard();
  expect(native.streams['application/x-chalkbond']).toEqual(drawing);
  expect(native.streams['image/svg+xml']).toEqual(svg);
  // ... and a second launch reads the drawing through Electron.
  app = await launchApp();
  try {
    const electron = await readElectronClipboard(app, [DRAWING_KEY]);
    expect(electron.has[DRAWING_KEY]).toBe(true);
    expect(Buffer.from(electron.bytes[DRAWING_KEY] ?? [])).toEqual(drawing);
  } finally {
    await app.close();
  }
});

test('P7: the MIME SVG key is dropped, the web drawing key round-trips', async () => {
  const app = await launchApp();
  try {
    const png = await pngWithPhys(app);
    const variants = [
      { key: 'image/svg+xml', value: svg },
      { key: 'image/svg+xml', value: svg, type: 'image/svg+xml' },
      { key: 'image/svg+xml', value: svg.toString() },
    ];
    for (const variant of variants) {
      await writeEntries(app, [{ key: BITMAP_KEY, value: png, type: 'image/png' }, variant]);
      const electron = await readElectronClipboard(app, ['image/svg+xml']);
      expect(electron.types).not.toContain('image/svg+xml');
      expect(readWindowsClipboard().nativeFormats).not.toContain('image/svg+xml');
    }
    await writeEntries(app, [
      { key: BITMAP_KEY, value: png, type: 'image/png' },
      { key: 'web application/x-chalkbond', value: drawing },
    ]);
    const web = await readElectronClipboard(app, ['web application/x-chalkbond']);
    expect(web.has['web application/x-chalkbond']).toBe(true);
    expect(Buffer.from(web.bytes['web application/x-chalkbond'] ?? [])).toEqual(drawing);
  } finally {
    await app.close();
  }
});

test('P1: the bitmap alone is found by has', async () => {
  const app = await launchApp();
  try {
    await writeEntries(app, [
      { key: BITMAP_KEY, value: await pngWithPhys(app), type: 'image/png' },
    ]);
    expect(await app.evaluate(({ clipboard }) => clipboard.has('image/png'))).toBe(true);
  } finally {
    await app.close();
  }
});
