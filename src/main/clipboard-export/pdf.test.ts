// C12 (SPEC-clipboard-export.md C5, PD1, CS6, Decision C9): the `pdf:print` schema through the
// central sender check; the page HTML; the hidden print window's options; the window and the temp
// folder are gone after every print, failed or not; only `%PDF-` bytes up to 64 MiB are returned.
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { validateRequest } from '../ipc';
import { printPdfSchema } from '../ipc-schemas';
import { createPdfPrinter, pdfPageHtml, PDF_WINDOW_OPTIONS, type PdfPorts } from './pdf';

const MiB = 1024 * 1024;
const frame = { url: 'file:///app/index.html' };
const valid = { svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', widthPt: 120, heightPt: 40 };
const accepts = (value: unknown) =>
  validateRequest({ senderFrame: frame }, frame, frame.url, printPdfSchema, value, () => undefined);

describe('C5 pdf:print schema', () => {
  it('accepts an <svg of up to 64 MiB of UTF-8 and a size in (0, 14 400] pt', () => {
    expect(accepts(valid)).toEqual(valid);
    expect(accepts({ ...valid, widthPt: 14_400, heightPt: 0.001 })).toBeTruthy();
    expect(accepts({ ...valid, svg: '<svg' + 'a'.repeat(64 * MiB - 4) })).toBeTruthy();
  });

  it('rejects bad sizes, a non-<svg start, more than 64 MiB of UTF-8 and extra keys', () => {
    const log = vi.fn();
    for (const value of [
      { ...valid, widthPt: 0 },
      { ...valid, heightPt: 0 },
      { ...valid, widthPt: -1 },
      { ...valid, widthPt: 20_000 },
      { ...valid, heightPt: 14_400.5 },
      { ...valid, widthPt: Number.NaN },
      { ...valid, heightPt: Number.POSITIVE_INFINITY },
      { ...valid, widthPt: '120' },
      { ...valid, svg: '<html><svg/>' },
      { ...valid, svg: ' <svg/>' },
      { ...valid, svg: 3 },
      { ...valid, svg: '<svg' + 'a'.repeat(64 * MiB - 3) },
      // 32 Mi characters, but 64 MiB + 2 UTF-8 bytes: the cap counts bytes.
      { ...valid, svg: '<svg' + 'é'.repeat(32 * MiB - 1) },
      { ...valid, extra: true },
      { svg: valid.svg, widthPt: 1 },
      null,
    ])
      expect(() =>
        validateRequest({ senderFrame: frame }, frame, frame.url, printPdfSchema, value, log),
      ).toThrow('Rejected IPC request');
    expect(log).toHaveBeenCalled();
  });

  it('rejects another sender frame', () => {
    expect(() =>
      validateRequest(
        { senderFrame: { url: frame.url } },
        frame,
        frame.url,
        printPdfSchema,
        valid,
        () => undefined,
      ),
    ).toThrow('Rejected IPC request');
  });
});

describe('PD1 page and window', () => {
  it('the page: CSP default none with inline style only, page size in pt, margins 0, the SVG', () => {
    expect(pdfPageHtml('<svg/>', 120, 40.5)).toBe(
      '<!doctype html><meta charset="utf-8">' +
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">' +
        '<style>@page{size:120pt 40.5pt;margin:0}html,body{margin:0}svg{display:block}</style><svg/>',
    );
  });

  it('the window: hidden, sandboxed, isolated, no Node, no JavaScript, no preload', () => {
    expect(PDF_WINDOW_OPTIONS).toEqual({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: false,
      },
    });
    expect(PDF_WINDOW_OPTIONS.webPreferences).not.toHaveProperty('preload');
  });
});

const PDF = new Uint8Array([...'%PDF-1.4\n%%EOF\n'].map((c) => c.charCodeAt(0)));

function rig(over: { print?: () => Promise<Uint8Array>; load?: () => Promise<void> } = {}) {
  const calls: string[] = [];
  const windows: { destroyed: boolean }[] = [];
  const ports: PdfPorts = {
    tempRoot: () => '/tmp/x',
    mkdtemp: vi.fn((prefix: string) => {
      calls.push(`mkdtemp ${prefix}`);
      return Promise.resolve(`${prefix}abc`);
    }),
    writeFile: vi.fn((path: string, text: string) => {
      calls.push(`write ${path} ${text.length}`);
      return Promise.resolve();
    }),
    rm: vi.fn((path: string) => {
      calls.push(`rm ${path}`);
      return Promise.resolve();
    }),
    newWindow: vi.fn((options) => {
      calls.push(`window ${JSON.stringify(options)}`);
      const state = { destroyed: false };
      windows.push(state);
      return {
        loadFile: (path: string) => {
          calls.push(`load ${path}`);
          return over.load ? over.load() : Promise.resolve();
        },
        webContents: {
          printToPDF: (options: unknown) => {
            calls.push(`print ${JSON.stringify(options)}`);
            return over.print ? over.print() : Promise.resolve(PDF);
          },
        },
        destroy: () => {
          calls.push('destroy');
          state.destroyed = true;
        },
      };
    }),
    log: vi.fn(),
  };
  return { print: createPdfPrinter(ports), ports, calls, windows };
}

describe('PD1 printing and cleanup (CS6)', () => {
  it('prints the page at the SVG size and returns the %PDF- bytes; window and folder removed', async () => {
    const r = rig();
    const result = await r.print(valid);
    expect(result).toEqual({ ok: true, pdf: PDF });
    const folder = join('/tmp/x', 'chalkbond-pdf-') + 'abc';
    const page = join(folder, 'page.html');
    expect(r.calls).toEqual([
      `mkdtemp ${join('/tmp/x', 'chalkbond-pdf-')}`,
      `write ${page} ${pdfPageHtml(valid.svg, 120, 40).length}`,
      `window ${JSON.stringify(PDF_WINDOW_OPTIONS)}`,
      `load ${page}`,
      `print ${JSON.stringify({
        pageSize: { width: 120 / 72, height: 40 / 72 },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        preferCSSPageSize: true,
        printBackground: false,
      })}`,
      'destroy',
      `rm ${folder}`,
    ]);
    expect(r.ports.writeFile).toHaveBeenCalledWith(page, pdfPageHtml(valid.svg, 120, 40));
  });

  it('a rejected print: { ok: false }, logged; the window destroyed and the folder removed', async () => {
    const r = rig({ print: () => Promise.reject(new Error('printing failed')) });
    expect(await r.print(valid)).toEqual({ ok: false });
    expect(r.windows).toEqual([{ destroyed: true }]);
    expect(r.calls.at(-1)).toBe(`rm ${join('/tmp/x', 'chalkbond-pdf-')}abc`);
    expect(r.ports.log).toHaveBeenCalled();
  });

  it('a failed load: { ok: false }; window destroyed, folder removed, nothing printed', async () => {
    const r = rig({ load: () => Promise.reject(new Error('load')) });
    expect(await r.print(valid)).toEqual({ ok: false });
    expect(r.windows).toEqual([{ destroyed: true }]);
    expect(r.calls.some((c) => c.startsWith('print'))).toBe(false);
    expect(r.calls.at(-1)).toMatch(/^rm /);
  });

  it('a failed page write: no window; the folder removed', async () => {
    const r = rig();
    r.ports.writeFile = () => Promise.reject(new Error('disk'));
    const print = createPdfPrinter(r.ports);
    expect(await print(valid)).toEqual({ ok: false });
    expect(r.windows).toEqual([]);
    expect(r.calls.at(-1)).toMatch(/^rm /);
  });

  it('no temp folder: { ok: false }, nothing else', async () => {
    const r = rig();
    r.ports.mkdtemp = () => Promise.reject(new Error('temp'));
    const print = createPdfPrinter(r.ports);
    expect(await print(valid)).toEqual({ ok: false });
    expect(r.windows).toEqual([]);
    expect(r.ports.rm).not.toHaveBeenCalled();
  });

  it('a failed folder removal is logged; the print still answers', async () => {
    const r = rig();
    r.ports.rm = () => Promise.reject(new Error('busy'));
    const print = createPdfPrinter(r.ports);
    expect(await print(valid)).toEqual({ ok: true, pdf: PDF });
    expect(r.ports.log).toHaveBeenCalled();
  });

  it('bytes that are not a PDF, or over 64 MiB, are refused: { ok: false }', async () => {
    const notPdf = rig({ print: () => Promise.resolve(new Uint8Array([60, 104, 116])) });
    expect(await notPdf.print(valid)).toEqual({ ok: false });
    const huge = new Uint8Array(64 * MiB + 1);
    huge.set(PDF.subarray(0, 5));
    const tooLarge = rig({ print: () => Promise.resolve(huge) });
    expect(await tooLarge.print(valid)).toEqual({ ok: false });
    expect(tooLarge.windows).toEqual([{ destroyed: true }]);
  });
});
