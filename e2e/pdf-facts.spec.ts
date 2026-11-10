import type * as FsPromises from 'node:fs/promises';
import type * as NodePath from 'node:path';
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
        const file = join(folder, 'control.pdf');
        await writeFile(file, pdf);
        const capture = async (bytes: Buffer, name: string) => {
          const path = join(folder, name);
          await writeFile(path, bytes);
          const viewer = new BrowserWindow({
            show: false,
            width: 800,
            height: 600,
            webPreferences: { plugins: true, partition: 'probe-pdf' },
          });
          try {
            await viewer.loadFile(path);
            const deadline = Date.now() + 10_000;
            let pixels: Buffer = Buffer.alloc(0);
            while (Date.now() < deadline) {
              pixels = (await viewer.webContents.capturePage()).toBitmap();
              // Give the PDF plugin the full specified bound before declaring a blank control.
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
            return pixels;
          } finally {
            viewer.destroy();
          }
        };
        const control = await capture(pdf, 'original.pdf');
        const blankCapture = await capture(blank, 'blank.pdf');
        let dark = 0,
          different = 0;
        for (let i = 0; i < control.length; i += 4) {
          if (
            (control[i] ?? 255) < 100 &&
            (control[i + 1] ?? 255) < 100 &&
            (control[i + 2] ?? 255) < 100
          )
            dark++;
          if (!control.subarray(i, i + 4).equals(blankCapture.subarray(i, i + 4))) different++;
        }
        return {
          pdf: Array.from(pdf),
          tiny: tiny.subarray(0, 5).toString(),
          dark,
          different,
          windows: BrowserWindow.getAllWindows().length,
        };
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    }, drawing);
    mkdirSync(resolve('out/pdf-facts'), { recursive: true });
    writeFileSync(resolve('out/pdf-facts/print.pdf'), Buffer.from(result.pdf));
    await info.attach('observations', {
      body: JSON.stringify({ ...result, pdf: undefined }),
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
    console.log('PDF control facts', {
      tiny: result.tiny,
      dark: result.dark,
      different: result.different,
      windows: result.windows,
    });
    expect(text).not.toMatch(/\/Type\s*\/XRef|\/Encrypt/);
    expect(result.tiny).toBe('%PDF-');
    expect(result.windows).toBe(1);
    expect(
      result.different,
      'INCONCLUSIVE: original and blank PDF controls have identical captures',
    ).toBeGreaterThan(0);
    expect(
      result.dark,
      'INCONCLUSIVE: original PDF control did not render within 10s',
    ).toBeGreaterThan(0);
  } finally {
    await app.close();
  }
});
