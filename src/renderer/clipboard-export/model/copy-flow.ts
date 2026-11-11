// The copy half of the clipboard flow (SPEC-clipboard-export.md CB-C1–CB-C3, CB-Q and notices
// N-C1–N-C6) over injected ports: DOM-free, no timers of its own. C9 adds paste on `enqueue`.
import { exportSvg, readSvgDrawing } from '@core/clipboard-export';
import type { Doc, Selection, SubDoc } from '@core/doc-model';
import type { SvgDocument } from '@core/svg-render';
import type { EditorController } from '../../editor';
import type { ClipboardWriteRequest } from '../../../shared/ipc-types';

/** How long the Copy button reads "Copied" after a successful copy (a new copy restarts it). */
export const COPIED_MS = 2000;
/** Clipboard pictures are 300 dpi, transparent (X3). */
const CLIPBOARD_DPI = 300;

/** Notice texts, exactly as mock-up A17 (O6). */
export const NOTICES = {
  selection: 'Copied. Paste into PowerPoint or Word with Ctrl+V.',
  whole: 'Copied the whole drawing. Paste into PowerPoint or Word with Ctrl+V.',
  cut: 'Cut. Paste into PowerPoint or Word with Ctrl+V.',
  empty: 'Nothing to copy yet. Draw something first.',
  reduced: 'Copied. The drawing is very large, so the picture is less sharp than usual.',
  failed: "Couldn't copy. Please try again.",
} as const;

export interface CopyPorts {
  readonly controller: Pick<EditorController, 'getDoc' | 'getSelection' | 'run' | 'notify'>;
  /** C1 through the preload (`window.chalkbond.clipboardWrite`). */
  write(value: ClipboardWriteRequest): Promise<{ ok: boolean }>;
  /** `rasterise.ts` (R1). */
  rasterise(
    svg: SvgDocument,
    dpi: number,
    white: boolean,
  ): Promise<{ png: Uint8Array; dpi: number; reduced: boolean }>;
  /** Runs `fn` after `ms`; returns a cancel function. */
  schedule(fn: () => void, ms: number): () => void;
}

export interface CopyFlow {
  /** CB-C1: the Copy button and the host's Ctrl+C. Resolves when the copy has finished. */
  copy(): Promise<void>;
  /** The editor's `onCopy` (CB-C1 selection branch, CB-C3 cut). */
  onCopy(sub: SubDoc, doc: Doc, selection: Selection): Promise<void>;
  /** CB-Q: runs `job` after every clipboard job before it; a rejection reaches only its caller. */
  enqueue<T>(job: () => Promise<T>): Promise<T>;
  /** Resolves when every queued job has finished. */
  whenIdle(): Promise<void>;
  /** The drawing payload of the last successful copy that came through `onCopy`, else null. */
  lastEditorCopy(): string | null;
  /** The Copy button reads "Copied". */
  copied(): boolean;
  /** Called when `copied()` may have changed. */
  subscribe(listener: () => void): () => void;
}

type What = 'selection' | 'whole' | 'cut';

const isEmptyDoc = (doc: Doc): boolean =>
  Object.keys(doc.atoms).length === 0 && Object.keys(doc.objects).length === 0;
const isEmptySelection = (s: Selection): boolean =>
  s.atoms.size === 0 && s.bonds.size === 0 && s.objects.size === 0;

export function createCopyFlow(ports: CopyPorts): CopyFlow {
  const { controller } = ports;
  let tail: Promise<unknown> = Promise.resolve();
  let last: string | null = null;
  let copied = false;
  let cancelTimer: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const changed = (): void => {
    for (const listener of [...listeners]) listener();
  };

  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = tail.then(job);
    tail = result.catch(() => undefined);
    return result;
  }

  function showCopied(): void {
    cancelTimer?.();
    copied = true;
    cancelTimer = ports.schedule(() => {
      cancelTimer = null;
      copied = false;
      changed();
    }, COPIED_MS);
    changed();
  }

  /** CB-C2: one exportSvg; its embedded payload is the drawing entry (null when over the limit). */
  function copyPicture(doc: Doc, selection: Selection | null, what: What): Promise<void> {
    return enqueue(async () => {
      try {
        const svg = exportSvg(doc, selection);
        const drawing = readSvgDrawing(svg.svg);
        const raster = await ports.rasterise(svg, CLIPBOARD_DPI, false);
        const result = await ports.write({ png: raster.png, svg: svg.svg, drawing });
        if (!result.ok) throw new Error('clipboard write failed');
        last = what === 'whole' ? null : drawing;
        showCopied();
        controller.notify('info', raster.reduced ? NOTICES.reduced : NOTICES[what]);
      } catch {
        controller.notify('error', NOTICES.failed);
      }
    });
  }

  return {
    async copy() {
      const doc = controller.getDoc();
      if (isEmptyDoc(doc)) {
        controller.notify('info', NOTICES.empty);
        return;
      }
      const selection = controller.getSelection();
      if (isEmptySelection(selection)) {
        await copyPicture(doc, null, 'whole');
        return;
      }
      controller.run('copy'); // the editor calls onCopy, which queues the picture
      await tail;
    },
    onCopy(_sub, doc, selection) {
      // The editor calls onCopy after its own copy or cut: a cut has changed the document.
      return copyPicture(doc, selection, controller.getDoc() === doc ? 'selection' : 'cut');
    },
    enqueue,
    whenIdle: async () => {
      await tail;
    },
    lastEditorCopy: () => last,
    copied: () => copied,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
