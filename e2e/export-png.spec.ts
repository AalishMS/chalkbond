// C11 (SPEC-clipboard-export.md EX3, EX4, R3, R4, E2, PI3; SC7): Export PNG of the toluene golden
// input at Print through the real dialog, rasteriser and C4 write; the file's IHDR, pHYs and tEXt;
// the pixels decoded in the page (corners, ink box, bond width); White background; the file
// reopens through the real A9 Open flow to an equal document; dirty and title stay as they were.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { drawingPayload, exportSvg, readPngDrawing } from '../src/core/clipboard-export';
import { serialize, type Doc } from '../src/core/doc-model';
import { bluToPt, resolveStyle } from '../src/core/svg-render';
import { BOX_OK, dialogLog, exportWith, expectNotice, openFrom, saveTo } from './export-steps';
import { goldenDoc, heardNotices, loadDocument, openApp, readDocument } from './harness';
import { windowTitle } from './relaunch';

let dir: string;
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chalkbond-export-png-'));
});
test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** The PNG's chunks (type → data), in file order. */
function chunks(png: Buffer): { type: string; data: Buffer }[] {
  const out: { type: string; data: Buffer }[] = [];
  for (let at = 8; at + 12 <= png.length;) {
    const length = png.readUInt32BE(at);
    out.push({
      type: png.toString('latin1', at + 4, at + 8),
      data: png.subarray(at + 8, at + 8 + length),
    });
    at += length + 12;
  }
  return out;
}

interface PixelFacts {
  width: number;
  height: number;
  corners: number[][];
  ink: { left: number; top: number; right: number; bottom: number };
  across: number;
}

/**
 * Decodes the PNG in the page (bytes → Blob → createImageBitmap → canvas) and reports the four
 * corner pixels, the box of pixels with alpha > 0, and the longest run of opaque pixels (alpha ≥
 * 250) along the normal through `mid` (px) of a bond whose direction is `dir`.
 */
async function pixelFacts(
  page: Page,
  png: Buffer,
  mid: { x: number; y: number },
  dir: { x: number; y: number },
): Promise<PixelFacts> {
  return page.evaluate(
    async ({ bytes, mid, dir }) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
      );
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no canvas');
      ctx.drawImage(bitmap, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      const px = (x: number, y: number) =>
        Array.from(data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4));
      const corners = [px(0, 0), px(width - 1, 0), px(0, height - 1), px(width - 1, height - 1)];
      let left = width,
        top = height,
        right = -1,
        bottom = -1;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if ((data[(y * width + x) * 4 + 3] ?? 0) > 0) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
      const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
      const n = { x: -dir.y / len, y: dir.x / len };
      let across = 0,
        run = 0;
      for (let t = -40; t <= 40; t += 0.25) {
        const x = Math.round(mid.x + n.x * t),
          y = Math.round(mid.y + n.y * t);
        const opaque =
          x >= 0 &&
          y >= 0 &&
          x < width &&
          y < height &&
          (data[(y * width + x) * 4 + 3] ?? 0) >= 250;
        run = opaque ? run + 0.25 : 0;
        across = Math.max(across, run);
      }
      return { width, height, corners, ink: { left, top, right, bottom }, across };
    },
    { bytes: Array.from(png), mid, dir },
  );
}

/** The single bond to toluene's methyl carbon, its midpoint and direction in PNG px. */
function methylBond(doc: Doc, scale: number) {
  const degree = (id: string) =>
    Object.values(doc.bonds).filter((b) => b.a1 === id || b.a2 === id).length;
  const bond = Object.values(doc.bonds).find(
    (b) => b.order === 1 && (degree(b.a1) === 1 || degree(b.a2) === 1),
  );
  if (!bond) throw new Error('no methyl bond');
  const style = resolveStyle(doc.style);
  const svg = exportSvg(doc, null);
  const at = (id: string) => {
    const atom = doc.atoms[id as keyof typeof doc.atoms];
    if (!atom) throw new Error('no atom');
    const p = bluToPt(atom, style);
    return { x: (p.x - svg.origin.x) * scale, y: (p.y - svg.origin.y) * scale };
  };
  const a = at(bond.a1),
    b = at(bond.a2);
  return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dir: { x: b.x - a.x, y: b.y - a.y } };
}

test('SC7: Export PNG at Print: size, pHYs, tEXt, pixels; reopens equal; dirty unchanged', async () => {
  const chalk = join(dir, 'toluene.chalk');
  const file = join(dir, 'toluene.png');
  const { app, page } = await openApp({
    launch: { dialogs: [saveTo(chalk), saveTo(file), openFrom(file)] },
  });
  try {
    await loadDocument(page, goldenDoc('toluene'));
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+s');
    await expect.poll(() => windowTitle(app)).toBe('toluene - Chalkbond');
    const doc = await readDocument(page);

    await exportWith(page, { format: 'png', size: 'print', white: false });
    await expectNotice(page, 'Exported toluene.png.');
    const log = await dialogLog(app);
    expect(log[1]?.options['defaultPath']).toBe(join(dir, 'toluene.png'));
    // EX4: no document, dirty, title or session change.
    expect(serialize(await readDocument(page))).toBe(serialize(doc));
    expect(await windowTitle(app)).toBe('toluene - Chalkbond');

    const png = readFileSync(file);
    const svg = exportSvg(doc, null);
    const width = Math.ceil((svg.width * 300) / 72);
    const height = Math.ceil((svg.height * 300) / 72);
    const list = chunks(png);
    const ihdr = list[0];
    expect(ihdr?.type).toBe('IHDR');
    expect([ihdr?.data.readUInt32BE(0), ihdr?.data.readUInt32BE(4)]).toEqual([width, height]);
    const phys = list.find((c) => c.type === 'pHYs');
    expect(phys && [phys.data.readUInt32BE(0), phys.data.readUInt32BE(4), phys.data[8]]).toEqual([
      11811, 11811, 1,
    ]);
    expect(
      list.some((c) => c.type === 'tEXt' && c.data.toString('latin1').startsWith('chalkbond\0')),
    ).toBe(true);
    expect(readPngDrawing(new Uint8Array(png))).toBe(drawingPayload(doc));

    const bond = methylBond(doc, width / svg.width);
    const facts = await pixelFacts(page, png, bond.mid, bond.dir);
    expect([facts.width, facts.height]).toEqual([width, height]);
    for (const corner of facts.corners) expect(corner[3]).toBe(0);
    expect(facts.ink.left).toBeLessThanOrEqual(2);
    expect(facts.ink.top).toBeLessThanOrEqual(2);
    expect(width - 1 - facts.ink.right).toBeLessThanOrEqual(2);
    expect(height - 1 - facts.ink.bottom).toBeLessThanOrEqual(2);
    expect(facts.across).toBeGreaterThanOrEqual(6);

    // The real A9 flow: File > Open (Ctrl+O, stubbed dialog) of the exported PNG.
    await page.keyboard.press('Control+o');
    await expect.poll(() => windowTitle(app)).toBe('toluene.png - Chalkbond');
    expect(serialize(await readDocument(page))).toBe(serialize(doc));
  } finally {
    await app.close();
  }
});

test('White background: corners #ffffff opaque; a dirty drawing stays dirty', async () => {
  const file = join(dir, 'white.png');
  const { app, page } = await openApp({ launch: { dialogs: [saveTo(file)] } });
  try {
    await loadDocument(page, goldenDoc('toluene'));
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+d'); // an edit: the drawing is dirty
    await expect.poll(() => windowTitle(app)).toBe('*Untitled - Chalkbond');
    const doc = await readDocument(page);
    await page.keyboard.press('Escape');
    await exportWith(page, { format: 'png', size: 'screen', white: true });
    await expectNotice(page, 'Exported white.png.');
    const png = readFileSync(file);
    const svg = exportSvg(doc, null);
    const facts = await pixelFacts(page, png, { x: 0, y: 0 }, { x: 1, y: 0 });
    expect([facts.width, facts.height]).toEqual([
      Math.ceil((svg.width * 150) / 72),
      Math.ceil((svg.height * 150) / 72),
    ]);
    for (const corner of facts.corners) expect(corner).toEqual([255, 255, 255, 255]);
    expect(serialize(await readDocument(page))).toBe(serialize(doc));
    expect(await windowTitle(app)).toBe('*Untitled - Chalkbond');
  } finally {
    await app.close();
  }
});

test('a failed write: the error box "Couldn\'t save", no notice, drawing and dirty unchanged', async () => {
  const file = join(dir, 'gone', 'toluene.png'); // the folder does not exist
  const { app, page } = await openApp({ launch: { dialogs: [saveTo(file), BOX_OK] } });
  try {
    await loadDocument(page, goldenDoc('toluene'));
    const doc = await readDocument(page);
    // N1 follows the loaded drawing within a frame: an Untitled tab with content is unsaved.
    await expect.poll(() => windowTitle(app)).toBe('*Untitled - Chalkbond');
    const title = await windowTitle(app);
    await exportWith(page, { format: 'png' });
    await expect.poll(async () => (await dialogLog(app)).length).toBe(2);
    const box = (await dialogLog(app))[1];
    expect(box?.method).toBe('showMessageBox');
    expect(String(box?.options['message'])).toBe("Couldn't save “toluene.png”.");
    expect((await heardNotices(page)).filter((n) => n.text.startsWith('Exported'))).toEqual([]);
    expect(serialize(await readDocument(page))).toBe(serialize(doc));
    expect(await windowTitle(app)).toBe(title);
  } finally {
    await app.close();
  }
});
