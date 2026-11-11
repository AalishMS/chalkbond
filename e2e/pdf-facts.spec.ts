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
import { viewerDifferences } from './pdf-viewer';

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
    const viewed = await viewerDifferences(app, [
      { name: 'original.pdf', bytes: result.pdf, ink: true },
      { name: 'blank.pdf', bytes: result.blank, ink: false },
      { name: 'updated.pdf', bytes: Array.from(embedded.pdf), ink: true },
    ]);
    const captures = {
      different: viewed.differences[1] ?? 0,
      updatedDifferent: viewed.differences[2] ?? 0,
      pixels: viewed.pixels,
      windows: viewed.windows,
    };
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
