import type * as FsPromises from 'node:fs/promises';
import type * as NodePath from 'node:path';
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withPdfDrawing, readPdfDrawing } from '../src/core/clipboard-export';
import { serialize } from '../src/core/doc-model';
import { renderSvg } from '../src/core/svg-render';
import { goldenDoc } from './harness';
import { launchApp } from './launch';

test('P8/P9 PD1 print structure and original viewer control', async ({ browserName }, info) => {
  void browserName;
  const app = await launchApp();
  try {
    const drawing = renderSvg(goldenDoc('toluene'));
    const result = await app.evaluate(async ({ BrowserWindow, app }, input) => {
      const { mkdtemp, writeFile, rm } = process.getBuiltinModule(
        'node:fs/promises',
      ) as typeof FsPromises;
      const { join } = process.getBuiltinModule('node:path') as typeof NodePath;
      const folder = await mkdtemp(join(app.getPath('temp'), 'chalkbond-pdf-'));
      try {
        const print = async (svg: string, width: number, height: number) => {
          const file = join(folder, 'page.html');
          await writeFile(
            file,
            '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><style>@page{size:' +
              width +
              'pt ' +
              height +
              'pt;margin:0}html,body{margin:0}svg{display:block}</style>' +
              svg,
          );
          const win = new BrowserWindow({
            show: false,
            webPreferences: {
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false,
              javascript: false,
            },
          });
          try {
            await win.loadFile(file);
            return await win.webContents.printToPDF({
              pageSize: { width: width / 72, height: height / 72 },
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              preferCSSPageSize: true,
              printBackground: false,
            });
          } finally {
            win.destroy();
          }
        };
        const pdf = await print(input.svg, input.width, input.height);
        const tiny = await print(
          '<svg xmlns="http://www.w3.org/2000/svg" width="20pt" height="20pt"><text x="2" y="16">O</text></svg>',
          20,
          20,
        );
        const blank = await print(
          '<svg xmlns="http://www.w3.org/2000/svg" width="' +
            input.width +
            'pt" height="' +
            input.height +
            'pt"></svg>',
          input.width,
          input.height,
        );
        return {
          pdf: Array.from(pdf),
          blank: Array.from(blank),
          tiny: tiny.subarray(0, 5).toString(),
        };
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    }, drawing);
    const payload = JSON.stringify(JSON.parse(serialize(goldenDoc('toluene'))) as unknown);
    const embedded = withPdfDrawing(new Uint8Array(result.pdf), payload);
    expect(embedded.ok).toBe(true);
    if (!embedded.ok) throw new Error(embedded.reason);
    expect(readPdfDrawing(embedded.pdf)).toBe(payload);
    const captures = await app.evaluate(
      async ({ BrowserWindow, app }, input) => {
        const { mkdtemp, writeFile, rm } = process.getBuiltinModule(
          'node:fs/promises',
        ) as typeof FsPromises;
        const { join } = process.getBuiltinModule('node:path') as typeof NodePath;
        const folder = await mkdtemp(join(app.getPath('temp'), 'chalkbond-pdf-viewer-'));
        const capture = async (bytes: number[], name: string, ink: boolean) => {
          const path = join(folder, name);
          await writeFile(path, Buffer.from(bytes));
          const viewer = new BrowserWindow({
            show: false,
            width: 800,
            height: 600,
            minWidth: 800,
            minHeight: 600,
            webPreferences: { plugins: true, partition: 'probe-pdf', backgroundThrottling: false },
          });
          try {
            await viewer.loadFile(path);
            const deadline = Date.now() + 10_000;
            let previous: Buffer = Buffer.alloc(0);
            do {
              const image = await viewer.webContents.capturePage(undefined, { stayHidden: true });
              const pixels = image.toBitmap();
              const size = image.getSize();
              let white = 0,
                pageInk = 0;
              // Ignore toolbar and thumbnails: dark ink must touch white paper in the page area.
              for (let y = 65; y < size.height - 3; y++) {
                for (let x = 320; x < size.width - 3; x++) {
                  const i = (y * size.width + x) * 4;
                  if (pixels[i] === 255 && pixels[i + 1] === 255 && pixels[i + 2] === 255) white++;
                  if (
                    (pixels[i] ?? 255) < 100 &&
                    (pixels[i + 1] ?? 255) < 100 &&
                    (pixels[i + 2] ?? 255) < 100 &&
                    [12, size.width * 12].some((delta) =>
                      [i - delta, i + delta].every(
                        (at) =>
                          pixels[at] === 255 && pixels[at + 1] === 255 && pixels[at + 2] === 255,
                      ),
                    )
                  )
                    pageInk++;
                }
              }
              if (white > 1000 && (!ink || pageInk > 0) && pixels.equals(previous))
                return Array.from(pixels);
              previous = pixels;
              await new Promise((resolve) => setTimeout(resolve, 100));
            } while (Date.now() < deadline);
            throw new Error('INCONCLUSIVE: PDF page ' + name + ' never became ready within 10s');
          } finally {
            viewer.destroy();
          }
        };
        try {
          const original = await capture(input.pdf, 'original.pdf', true);
          const blank = await capture(input.blank, 'blank.pdf', false);
          const updated = await capture(input.updated, 'updated.pdf', true);
          let different = 0,
            updatedDifferent = 0;
          for (let i = 0; i < original.length; i += 4) {
            if (original.slice(i, i + 4).some((v, j) => v !== blank[i + j])) different++;
            if (original.slice(i, i + 4).some((v, j) => v !== updated[i + j])) updatedDifferent++;
          }
          return {
            different,
            updatedDifferent,
            pixels: original.length / 4,
            windows: BrowserWindow.getAllWindows().length,
          };
        } finally {
          await rm(folder, { recursive: true, force: true });
        }
      },
      { pdf: result.pdf, blank: result.blank, updated: Array.from(embedded.pdf) },
    );
    mkdirSync(resolve('out/pdf-facts'), { recursive: true });
    writeFileSync(resolve('out/pdf-facts/print.pdf'), Buffer.from(result.pdf));
    await info.attach('observations', {
      body: JSON.stringify({ ...result, pdf: undefined, blank: undefined, ...captures }),
      contentType: 'application/json',
    });
    const text = Buffer.from(result.pdf).toString('latin1');
    const offset = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(text)?.[1]);
    expect(text.slice(offset, offset + 4)).toBe('xref');
    const fixture = readFileSync(
      resolve('src/core/clipboard-export/__fixtures__/chromium-45.pdf'),
    ).toString('latin1');
    const fixtureOffset = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(fixture)?.[1]);
    expect(fixture.slice(fixtureOffset, fixtureOffset + 4)).toBe('xref');
    console.log('PDF control facts', { tiny: result.tiny, ...captures });
    expect(text).not.toMatch(/\/Type\s*\/XRef|\/Encrypt/);
    expect(result.tiny).toBe('%PDF-');
    expect(captures.windows).toBe(1);
    expect(
      captures.different,
      'INCONCLUSIVE: original and blank PDF controls have identical captures',
    ).toBeGreaterThan(0);
    expect(captures.updatedDifferent / captures.pixels).toBeLessThanOrEqual(0.005);
  } finally {
    await app.close();
  }
});
