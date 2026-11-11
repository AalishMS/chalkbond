// Export dialog state and flow (SPEC-clipboard-export.md "Export dialog", EX1, EX2; app-shell ST2)
// over injected ports: DOM-free, no timers. EX1 opens with the remembered choices; the drawing's
// size (pt) is measured once per document (one unembedded `exportSvg`), so a choice change is
// pixel arithmetic only. EX2: Save… takes one snapshot of the drawing, remembers the choices
// (settings:set), closes the dialog, then asks for the file (C3). Writing the file (EX3–EX5) is the
// `chosen` port's job; `createExportWriter` is that port (C11, C12).
import {
  drawingPayload,
  exportFileName,
  exportSvg,
  groupDigits,
  MAX_PICTURE_BYTES,
  pngPixelSize,
  readPdfDrawing,
  readPngDrawing,
  readSvgDrawing,
  withPdfDrawing,
} from '@core/clipboard-export';
import { MAX_FILE_BYTES, type Doc } from '@core/doc-model';
import type { SvgDocument } from '@core/svg-render';
import type { EditorController } from '../../editor';
import type {
  FileProblem,
  FileRef,
  PrintPdfRequest,
  PrintPdfResponse,
  RendererSettings,
  WriteFileResponse,
} from '../../../shared/ipc-types';

export type ExportChoices = RendererSettings['export'];
export type ExportFormat = ExportChoices['format'];
export type PngDpi = ExportChoices['pngDpi'];
/** The C4 probe outcome (rule PDF-A or PDF-B). */
export type PdfOutcome = 'A' | 'B';
/** Decision C4: PDF-A applies (Linux probe; Windows confirmation pending). */
export const PDF_OUTCOME: PdfOutcome = 'A';

/** The drawing's size in pt (1 SVG unit = 1 pt), as the export SVG has it. */
export interface DrawingSize {
  width: number;
  height: number;
}

export interface ExportDialogState {
  choices: ExportChoices;
  size: DrawingSize;
}

/** Size segments in order (A08a): test id, label, the size line's lead. */
export const PNG_SIZES: readonly { dpi: PngDpi; id: string; title: string; lead: string }[] = [
  { dpi: 150, id: 'screen', title: 'Screen', lead: 'For messages and websites.' },
  { dpi: 300, id: 'print', title: 'Print', lead: 'Sharp on paper.' },
  { dpi: 600, id: 'poster', title: 'Poster', lead: 'For large prints.' },
];

/** The live size line for a PNG of `size` at `dpi` (R3 reduced form; R7 grouping; no "dpi"). */
export function sizeLine(size: DrawingSize, dpi: PngDpi): string {
  const lead = PNG_SIZES.find((s) => s.dpi === dpi)?.lead ?? '';
  const px = pngPixelSize(size.width, size.height, dpi);
  const pixels = `${groupDigits(px.width)} × ${groupDigits(px.height)} pixels`;
  return px.reduced
    ? `${lead} ${pixels} (less sharp: the drawing is very large).`
    : `${lead} ${pixels}.`;
}

/** The reopen line: the promise, or under PDF-B the PDF caution (in `--text`). */
export function reopenLine(
  format: ExportFormat,
  outcome: PdfOutcome,
): { text: string; caution: boolean } {
  if (format === 'pdf' && outcome === 'B') {
    return {
      text: "PDF files can't be opened in Chalkbond again. Keep the drawing as a .chalk file too.",
      caution: true,
    };
  }
  return {
    text: 'You can open this file in Chalkbond again to change the drawing.',
    caution: false,
  };
}

/** No atom and no object: nothing to export. */
export function isEmptyDrawing(doc: Doc): boolean {
  return Object.keys(doc.atoms).length === 0 && Object.keys(doc.objects).length === 0;
}

export interface ExportFlowOptions {
  /** C3: the Save dialog for `format`; null when cancelled. */
  main: { chooseSave(format: ExportFormat, suggestedName: string): Promise<FileRef | null> };
  controller: Pick<EditorController, 'getDoc' | 'canRun'>;
  /** The remembered choices (`RendererSettings.export`). */
  settings(): ExportChoices;
  /** I8 `settings:set { export }`. */
  remember(choices: ExportChoices): Promise<void>;
  /** The session's file name (`esterification.chalk`), or null for an Untitled drawing. */
  sessionName(): string | null;
  /** The drawing's size in pt; default one unembedded `exportSvg` (no payload is built). */
  measure?(doc: Doc): DrawingSize;
  /**
   * EX3–EX5 for the chosen file (C11, C12) with the drawing as it was when Save… was pressed.
   * Without it nothing is written.
   */
  chosen?(ref: FileRef, choices: ExportChoices, doc: Doc): Promise<void>;
  logError?(message: string): void;
}

export interface ExportFlow {
  /** The open dialog, or null. */
  state(): ExportDialogState | null;
  subscribe(listener: () => void): () => void;
  /** EX1 (Ctrl+E, File > Export…): only when idle, the drawing not empty and no export runs. */
  open(): boolean;
  choose(change: Partial<ExportChoices>): void;
  /** Cancel, Esc, the scrim: closes with no effect. */
  cancel(): void;
  /** EX2 (Save…, Enter). */
  save(): Promise<void>;
  /** From Save… until the export step has ended. */
  busy(): boolean;
}

const measureSvg = (doc: Doc): DrawingSize => {
  const svg = exportSvg(doc, null, { embed: false });
  return { width: svg.width, height: svg.height };
};

export function createExportFlow(o: ExportFlowOptions): ExportFlow {
  const measure = o.measure ?? measureSvg;
  const log = o.logError ?? (() => undefined);
  const listeners = new Set<() => void>();
  let state: ExportDialogState | null = null;
  let saving = false;
  let measured: { doc: Doc; size: DrawingSize } | null = null;

  const set = (next: ExportDialogState | null): void => {
    state = next;
    for (const listener of [...listeners]) listener();
  };

  const sizeOf = (doc: Doc): DrawingSize => {
    if (measured?.doc !== doc) measured = { doc, size: measure(doc) };
    return measured.size;
  };

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open() {
      const doc = o.controller.getDoc();
      const idle = o.controller.canRun({ type: 'set-preset', preset: doc.style.preset });
      if (state !== null || saving || !idle || isEmptyDrawing(doc)) return false;
      set({ choices: { ...o.settings() }, size: sizeOf(doc) });
      return true;
    },
    choose(change) {
      if (state === null) return;
      set({ ...state, choices: { ...state.choices, ...change } });
    },
    cancel() {
      if (state !== null) set(null);
    },
    async save() {
      if (state === null) return;
      const { choices } = state;
      // EX4: one snapshot before any await; edits made meanwhile are not exported.
      const doc = o.controller.getDoc();
      saving = true;
      set(null);
      try {
        // EX2: the choices are remembered on Save…, before the Save dialog, even if it is cancelled.
        await o.remember(choices).catch((error: unknown) => {
          log(`Export choices not stored: ${String(error)}`);
        });
        const name = exportFileName(o.sessionName(), choices.format);
        const ref = await o.main.chooseSave(choices.format, name);
        if (ref !== null && o.chosen) await o.chosen(ref, choices, doc);
      } catch (error) {
        log(`Export failed: ${String(error)}`);
      } finally {
        saving = false;
      }
    },
    busy: () => saving,
  };
}

/** N-E1, N-E2, N-E3 (A17): N-E3 outranks N-E2, which outranks N-E1. */
export function exportNotice(
  name: string,
  written: { embedded: boolean; reduced: boolean },
): string {
  if (!written.embedded)
    return `Exported ${name}. It is too large to open again in Chalkbond, so keep the .chalk file.`;
  if (written.reduced)
    return `Exported ${name}. The drawing is very large, so the picture is less sharp than you chose.`;
  return `Exported ${name}.`;
}

export interface ExportWriterOptions {
  /** C4, the app-shell error box (I5) and C5 (the PDF printed in main, PD1). */
  main: {
    writeFile(ref: FileRef, data: Uint8Array): Promise<WriteFileResponse>;
    showFileError(problem: FileProblem, name: string): Promise<void>;
    printPdf(request: PrintPdfRequest): Promise<PrintPdfResponse>;
  };
  /** R1 (`rasterise.ts`). */
  rasterise(
    svg: SvgDocument,
    dpi: number,
    white: boolean,
  ): Promise<{ png: Uint8Array; dpi: number; reduced: boolean }>;
  /** The status-bar notice (`controller.notify`). */
  notify(kind: 'info' | 'error', text: string): void;
  encodeUtf8(text: string): Uint8Array;
  logError?(message: string): void;
  /** The picture carrier cap (Decision C9); default `MAX_PICTURE_BYTES`. A test seam only. */
  pictureCap?: number;
}

/** The picture to write and what it holds (judged from its own bytes, EX4). */
interface Picture {
  bytes: Uint8Array;
  embedded: boolean;
  reduced: boolean;
}

/**
 * The `chosen` port (EX3–EX5): builds the picture from the snapshot, writes it through C4, then
 * shows N-E1–N-E3, or the error box when nothing could be written. It reads and changes nothing
 * else: no document, dirty state, history, session file or recovery file.
 */
export function createExportWriter(
  o: ExportWriterOptions,
): (ref: FileRef, choices: ExportChoices, doc: Doc) => Promise<void> {
  const log = o.logError ?? (() => undefined);
  const cap = o.pictureCap ?? MAX_PICTURE_BYTES;

  /** PDF-A2: the printed PDF with the drawing, or unchanged (N-E3, logged) when it can't hold it. */
  function withDrawing(printed: Uint8Array, doc: Doc): Uint8Array {
    if (printed.length > cap) return printed; // fails below as any picture over the cap
    const payload = drawingPayload(doc);
    if (payload.length > MAX_FILE_BYTES) {
      log('PDF written without the drawing: the drawing is over 20 MiB');
      return printed;
    }
    const embedded = withPdfDrawing(printed, payload);
    if (!embedded.ok) {
      log(`PDF written without the drawing: the embedder refused (${embedded.reason})`);
      return printed;
    }
    if (embedded.pdf.length > cap) {
      log('PDF written without the drawing: with it the file would be over 64 MiB');
      return printed;
    }
    return embedded.pdf;
  }

  async function picture(choices: ExportChoices, doc: Doc): Promise<Picture> {
    if (choices.format === 'png') {
      const png = await o.rasterise(exportSvg(doc, null), choices.pngDpi, choices.pngWhite);
      return { bytes: png.png, embedded: readPngDrawing(png.png) !== null, reduced: png.reduced };
    }
    if (choices.format === 'svg') {
      const { svg } = exportSvg(doc, null);
      return { bytes: o.encodeUtf8(svg), embedded: readSvgDrawing(svg) !== null, reduced: false };
    }
    // EX3 PDF: printed in main from the unembedded SVG (C5), the drawing embedded here (R2).
    const svg = exportSvg(doc, null, { embed: false });
    const printed = await o.main.printPdf({
      svg: svg.svg,
      widthPt: svg.width,
      heightPt: svg.height,
    });
    if (!printed.ok) throw new Error('PDF printing failed');
    const bytes = withDrawing(printed.pdf, doc);
    // Read back from the bytes written; a PDF over the cap is not written, so it is not read.
    const embedded = bytes.length <= cap && readPdfDrawing(bytes) !== null;
    return { bytes, embedded, reduced: false };
  }

  return async (ref, choices, doc) => {
    let made: Picture;
    try {
      made = await picture(choices, doc);
    } catch (error) {
      log(`Export failed: ${String(error)}`);
      await o.main.showFileError('write-failed', ref.name);
      return;
    }
    // C9: a picture over the carrier cap fails as before; it is never sent to main.
    if (made.bytes.length > cap) {
      log(`Export refused: ${made.bytes.length} bytes is over the picture limit`);
      await o.main.showFileError('write-failed', ref.name);
      return;
    }
    let result: WriteFileResponse;
    try {
      result = await o.main.writeFile(ref, made.bytes);
    } catch (error) {
      log(`Export write refused: ${String(error)}`);
      result = { ok: false, problem: 'write-failed' };
    }
    if (!result.ok) {
      await o.main.showFileError(result.problem, ref.name);
      return;
    }
    if (!made.embedded) log('Export written without the drawing: too large to embed');
    o.notify('info', exportNotice(ref.name, made));
  };
}
