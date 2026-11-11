// C5 `pdf:print` (SPEC-clipboard-export.md PD1, CS6; Decision R2): the export SVG (validated by
// `printPdfSchema`) is written as `page.html` into a fresh `chalkbond-pdf-*` temp folder and
// printed by a hidden window that runs no script and has no preload. The window is destroyed and
// the folder removed in a `finally`, whatever happens. Only `%PDF-` bytes of at most 64 MiB (the
// C4 write cap, Decision C9) are returned. Main imports no core module (app-shell SEC9): the
// renderer embeds the drawing and writes the file through C4.
import { join } from 'node:path';
import type { BrowserWindowConstructorOptions, PrintToPDFOptions } from 'electron';
import type { PrintPdfRequest, PrintPdfResponse } from '../../shared/ipc-types';

/** clipboard-export Decision C9: a picture carrier may be up to 64 MiB. */
const MAX_PDF_BYTES = 64 * 1024 * 1024;

/** PD1: hidden, sandboxed, isolated, no Node, no JavaScript, no preload (app-shell SEC2 applies). */
export const PDF_WINDOW_OPTIONS = {
  show: false,
  webPreferences: {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    javascript: false,
  },
} as const satisfies BrowserWindowConstructorOptions;

/** PD1's page: no source allowed but inline style; the page is the drawing's size, margins 0. */
export function pdfPageHtml(svg: string, widthPt: number, heightPt: number): string {
  return (
    '<!doctype html><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">' +
    `<style>@page{size:${widthPt}pt ${heightPt}pt;margin:0}html,body{margin:0}svg{display:block}</style>` +
    svg
  );
}

/** The parts of a `BrowserWindow` the printer uses. */
export interface PrintWindow {
  loadFile(path: string): Promise<void>;
  webContents: { printToPDF(options: PrintToPDFOptions): Promise<Uint8Array> };
  destroy(): void;
}

export interface PdfPorts {
  /** `app.getPath('temp')`. */
  tempRoot(): string;
  mkdtemp(prefix: string): Promise<string>;
  writeFile(path: string, text: string): Promise<void>;
  /** Removes the folder and everything in it. */
  rm(path: string): Promise<void>;
  newWindow(options: typeof PDF_WINDOW_OPTIONS): PrintWindow;
  log(message: string): void;
}

const isPdf = (bytes: Uint8Array): boolean =>
  [37, 80, 68, 70, 45].every((byte, index) => bytes[index] === byte); // %PDF-

export function createPdfPrinter(
  ports: PdfPorts,
): (request: PrintPdfRequest) => Promise<PrintPdfResponse> {
  return async ({ svg, widthPt, heightPt }) => {
    let folder: string;
    try {
      folder = await ports.mkdtemp(join(ports.tempRoot(), 'chalkbond-pdf-'));
    } catch (error) {
      ports.log(`PDF temp folder failed: ${String(error)}`);
      return { ok: false };
    }
    let win: PrintWindow | undefined;
    try {
      const page = join(folder, 'page.html');
      await ports.writeFile(page, pdfPageHtml(svg, widthPt, heightPt));
      win = ports.newWindow(PDF_WINDOW_OPTIONS);
      await win.loadFile(page);
      const pdf = await win.webContents.printToPDF({
        pageSize: { width: widthPt / 72, height: heightPt / 72 },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        preferCSSPageSize: true,
        printBackground: false,
      });
      if (!isPdf(pdf) || pdf.length > MAX_PDF_BYTES) {
        ports.log(`PDF print refused: ${pdf.length} bytes, not a PDF or over the picture limit`);
        return { ok: false };
      }
      return { ok: true, pdf };
    } catch (error) {
      ports.log(`PDF print failed: ${String(error)}`);
      return { ok: false };
    } finally {
      win?.destroy();
      await ports.rm(folder).catch((error: unknown) => {
        ports.log(`PDF temp folder not removed: ${String(error)}`);
      });
    }
  };
}
