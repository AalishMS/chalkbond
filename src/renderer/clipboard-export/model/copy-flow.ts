// The clipboard flow (SPEC-clipboard-export.md CB-C1–CB-C3 copy, CB-P1 paste, the CB-Q queue and
// notices N-C1–N-C6, N-P1–N-P5) over injected ports: DOM-free, no timers of its own.
import {
  clipboardBitmapPadding,
  exportSvg,
  pasteAction,
  readSvgDrawing,
  type PasteAction,
} from '@core/clipboard-export';
import type { Doc, Selection, SubDoc } from '@core/doc-model';
import type { SvgDocument } from '@core/svg-render';
import type { EditorController } from '../../editor';
import type { ClipboardReadResponse, ClipboardWriteRequest } from '../../../shared/ipc-types';

/** How long the Copy button reads "Copied" after a successful copy (a new copy restarts it). */
export const COPIED_MS = 2000;
/** Clipboard pictures are 300 dpi (X3); the SVG entry is transparent, the bitmap white (R10). */
const CLIPBOARD_DPI = 300;

/** Notice texts, exactly as mock-up A17 (O6). */
export const NOTICES = {
  selection: 'Copied. Paste into PowerPoint or Word with Ctrl+V.',
  whole: 'Copied the whole drawing. Paste into PowerPoint or Word with Ctrl+V.',
  cut: 'Cut. Paste into PowerPoint or Word with Ctrl+V.',
  empty: 'Nothing to copy yet. Draw something first.',
  reduced: 'Copied. The drawing is very large, so the picture is less sharp than usual.',
  failed: "Couldn't copy. Please try again.",
  pictureOnly: 'Only drawings copied from Chalkbond can be pasted here.',
  nothingToPaste: 'Nothing to paste. Copy a drawing, or a compound name, first.',
  newer: "This drawing was copied from a newer version of Chalkbond and can't be pasted.",
  damaged: "The copied drawing is damaged and can't be pasted. Copy it again.",
  textTooLong: 'That text is too long to paste.',
} as const;

type PasteNotice = Extract<PasteAction, { kind: 'notice' }>['notice'];
/** N-P1–N-P5: kind and text of each paste notice. */
const PASTE_NOTICES: Record<PasteNotice, readonly ['info' | 'error', string]> = {
  'picture-only': ['info', NOTICES.pictureOnly],
  empty: ['info', NOTICES.nothingToPaste],
  newer: ['error', NOTICES.newer],
  damaged: ['error', NOTICES.damaged],
  'text-too-long': ['info', NOTICES.textTooLong],
};
/** What CB-R1 reports when the read fails. */
const NOTHING: ClipboardReadResponse = {
  drawing: null,
  text: null,
  textTooLong: false,
  image: false,
};

export interface CopyPorts {
  readonly controller: Pick<
    EditorController,
    'getDoc' | 'getSelection' | 'run' | 'canRun' | 'notify'
  >;
  /** C1 through the preload (`window.chalkbond.clipboardWrite`). */
  write(value: ClipboardWriteRequest): Promise<{ ok: boolean }>;
  /** C2 through the preload (`window.chalkbond.clipboardRead`). */
  read(): Promise<ClipboardReadResponse>;
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
  /**
   * CB-P1: the host's Ctrl+V (and later Edit > Paste, the context menu). Does nothing unless the
   * editor is idle, both when pressed and when its queued turn comes. Resolves when it has finished.
   */
  paste(): Promise<void>;
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
  /**
   * Decision C8: bumped by every `onCopy` (the editor's in-app clipboard has just changed);
   * `lastGeneration` is the generation of the copy whose successful write set `last`.
   */
  let generation = 0;
  let lastGeneration = -1;
  let copied = false;
  let cancelTimer: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const changed = (): void => {
    for (const listener of [...listeners]) listener();
  };

  /** No gesture runs and no label or text editor is open (the editor's `busy` event). */
  const idle = (): boolean => controller.canRun({ type: 'set-preset', preset: 'slides' });

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

  /**
   * CB-C2: one exportSvg; its embedded payload is the drawing entry (null when over the limit).
   * The bitmap is a second, unembedded exportSvg with the R10 margin, rasterised on white.
   * `copyGeneration` is the editor-copy generation of the `onCopy` behind a selection or cut copy.
   */
  function copyPicture(
    doc: Doc,
    selection: Selection | null,
    what: What,
    copyGeneration: number,
  ): Promise<void> {
    return enqueue(async () => {
      try {
        const svg = exportSvg(doc, selection);
        const drawing = readSvgDrawing(svg.svg);
        const bitmapSvg = exportSvg(doc, selection, {
          embed: false,
          padding: clipboardBitmapPadding(doc),
        });
        const raster = await ports.rasterise(bitmapSvg, CLIPBOARD_DPI, true);
        const result = await ports.write({ png: raster.png, svg: svg.svg, drawing });
        if (!result.ok) throw new Error('clipboard write failed');
        last = what === 'whole' ? null : drawing;
        lastGeneration = copyGeneration;
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
        await copyPicture(doc, null, 'whole', generation);
        return;
      }
      controller.run('copy'); // the editor calls onCopy, which queues the picture
      await tail;
    },
    onCopy(_sub, doc, selection) {
      // The editor calls onCopy after its own copy or cut, which has just replaced its in-app
      // clipboard (C8); a cut has changed the document.
      generation += 1;
      const what = controller.getDoc() === doc ? 'selection' : 'cut';
      return copyPicture(doc, selection, what, generation);
    },
    async paste() {
      if (!idle()) return;
      await enqueue(async () => {
        if (!idle()) return; // a gesture or a text session began while the paste waited
        const contents = await ports.read().catch(() => NOTHING);
        // Re-checked after the read: a commit must never land in a gesture or text session.
        if (!idle()) return;
        // C8, after the read: cascade only while the editor's clipboard is the copy that reached
        // the system clipboard (no failed or still-queued onCopy since).
        const own = lastGeneration === generation;
        const action = pasteAction(contents, last, own && controller.canRun('paste'));
        switch (action.kind) {
          case 'in-app':
            controller.run('paste');
            break;
          case 'fragment':
            controller.run({ type: 'paste-sub', sub: action.sub });
            break;
          case 'text':
            controller.run({ type: 'insert-text', text: action.text });
            break;
          case 'notice': {
            const [kind, text] = PASTE_NOTICES[action.notice];
            controller.notify(kind, text);
            break;
          }
        }
      });
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
