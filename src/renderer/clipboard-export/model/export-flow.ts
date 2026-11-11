// Export dialog state and flow (SPEC-clipboard-export.md "Export dialog", EX1, EX2; app-shell ST2)
// over injected ports: DOM-free, no timers. EX1 opens with the remembered choices; the drawing's
// size (pt) is measured once per document (one unembedded `exportSvg`), so a choice change is
// pixel arithmetic only. EX2: Save… remembers the choices (settings:set), closes the dialog, then
// asks for the file (C3). Writing the file (EX3–EX5) is the `chosen` port's job (C11, C12).
import { exportFileName, exportSvg, groupDigits, pngPixelSize } from '@core/clipboard-export';
import type { Doc } from '@core/doc-model';
import type { EditorController } from '../../editor';
import type { FileRef, RendererSettings } from '../../../shared/ipc-types';

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
  /** EX3–EX5 for the chosen file (C11, C12). Without it nothing is written. */
  chosen?(ref: FileRef, choices: ExportChoices): Promise<void>;
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
      saving = true;
      set(null);
      try {
        // EX2: the choices are remembered on Save…, before the Save dialog, even if it is cancelled.
        await o.remember(choices).catch((error: unknown) => {
          log(`Export choices not stored: ${String(error)}`);
        });
        const name = exportFileName(o.sessionName(), choices.format);
        const ref = await o.main.chooseSave(choices.format, name);
        if (ref !== null && o.chosen) await o.chosen(ref, choices);
      } catch (error) {
        log(`Export failed: ${String(error)}`);
      } finally {
        saving = false;
      }
    },
    busy: () => saving,
  };
}
