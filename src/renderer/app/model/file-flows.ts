// File flows (SPEC-app-shell.md "Files" F1–F7, F13; CO4; R7, R14) over injected ports: DOM-free,
// no timers. One in-progress flag; one pending request (an open ref or a close, latest wins).
// Every session change publishes N1 itself, after the session changed.
import {
  emptyDoc,
  parse,
  serialize,
  setStyle,
  type Doc,
  type ParseErrorCode,
} from '@core/doc-model';
import type { EditorController } from '../../editor';
import type {
  FileProblem,
  FileRef,
  ReadFileResponse,
  WriteFileResponse,
} from '../../../shared/ipc-types';
import { displayName, fileSession, saveAsName, type Session } from './session';

/** The preload functions the flows use (`window.chalkbond`). */
export interface FlowMain {
  chooseOpen(): Promise<FileRef | null>;
  readFile(ref: FileRef): Promise<ReadFileResponse>;
  chooseSave(format: 'chalk', suggestedName: string): Promise<FileRef | null>;
  writeFile(ref: FileRef, data: Uint8Array): Promise<WriteFileResponse>;
  ask(request: { kind: 'save-changes'; name: string }): Promise<'save' | 'discard' | 'cancel'>;
  showFileError(problem: FileProblem, name: string): Promise<void>;
  sessionFile(ref: FileRef | null): void;
  closeOk(): void;
  logError(message: string): void;
}

export interface FileFlowOptions {
  main: FlowMain;
  controller: Pick<EditorController, 'getDoc' | 'load' | 'markSaved' | 'isDirty' | 'notify'>;
  /** The window's session, changed in place. */
  session: Session;
  /** Sends N1 (title, dirty) for the current session and document. */
  publish(): void;
  clock(): string;
  /** ST1: the style of a new drawing (startup settings; `slides` until A10 remembers). */
  newDrawingStyle(): 'slides' | 'journal';
  /** Strict UTF-8 decode; null on a malformed sequence. */
  decodeUtf8(bytes: Uint8Array): string | null;
  encodeUtf8(text: string): Uint8Array;
}

export interface FileFlows {
  /** F1 (Ctrl+N). Ignored while a flow runs. */
  newDrawing(): Promise<void>;
  /** F2 then F3 (Ctrl+O). Ignored while a flow runs. */
  open(): Promise<void>;
  /** F3 for a ref main handed over (F11, F12); waits while a flow runs (latest wins). */
  openRef(ref: FileRef): Promise<void>;
  /** F5 (Ctrl+S). Ignored while a flow runs. */
  save(): Promise<void>;
  /** F6 (Ctrl+Shift+S). Ignored while a flow runs. */
  saveAs(): Promise<void>;
  /** F13 `close-requested`; waits while a flow runs (latest wins). */
  requestClose(): Promise<void>;
  /** F7. */
  dirty(): boolean;
  busy(): boolean;
}

type Pending = { kind: 'open'; ref: FileRef } | { kind: 'close' };

/** doc-model `parse` codes → F14 (every other code is a damaged file). */
function parseProblem(code: ParseErrorCode): FileProblem {
  if (code === 'newer-version') return 'newer-version';
  if (code === 'too-large') return 'too-large';
  return 'damaged';
}

export function createFileFlows(o: FileFlowOptions): FileFlows {
  const { main, controller, session } = o;
  let running = false;
  let pending: Pending | null = null;

  const dirty = (): boolean => session.forcedDirty || controller.isDirty();

  function replaceSession(next: Session): void {
    Object.assign(session, next);
  }

  /** Runs one flow under the flag; afterwards the pending request (if any) runs. */
  async function run(flow: () => Promise<void>): Promise<void> {
    running = true;
    try {
      await flow();
    } catch (error) {
      main.logError(`File flow failed: ${String(error)}`);
    } finally {
      running = false;
    }
    const next = pending;
    pending = null;
    if (next?.kind === 'open') await run(() => openNow(next.ref));
    else if (next?.kind === 'close') await run(closeNow);
  }

  /** Writes `serialize(snapshot)` to `ref`; true when written. R7: marked saved only if unchanged. */
  async function write(ref: FileRef, asNewFile: boolean): Promise<boolean> {
    const before = controller.getDoc();
    const result = await main.writeFile(ref, o.encodeUtf8(serialize(before)));
    if (!result.ok) {
      await main.showFileError(result.problem, ref.name);
      return false;
    }
    if (controller.getDoc() === before) {
      controller.markSaved();
      session.forcedDirty = false;
    }
    if (asNewFile) {
      replaceSession({ ...fileSession(ref), forcedDirty: session.forcedDirty });
      main.sessionFile(ref);
    }
    controller.notify('info', `Saved ${ref.name}.`);
    o.publish();
    return true;
  }

  /** F6: false when cancelled or failed (nothing changed then). */
  async function saveAsNow(): Promise<boolean> {
    const ref = await main.chooseSave('chalk', saveAsName(session));
    if (ref === null) return false;
    return write(ref, true);
  }

  /** F5: in place for a writable `.chalk` session, else F6. */
  async function saveNow(): Promise<boolean> {
    if (session.kind === 'chalk' && session.ref !== null) return write(session.ref, false);
    return saveAsNow();
  }

  /** F4 with R14: Save proceeds only when it succeeded and the drawing is clean afterwards. */
  async function confirmDiscard(): Promise<boolean> {
    if (!dirty()) return true;
    const answer = await main.ask({ kind: 'save-changes', name: displayName(session) });
    if (answer === 'discard') return true;
    if (answer === 'cancel') return false;
    return (await saveNow()) && !dirty();
  }

  /** Replaces the drawing (CO1: only through `load`) and the session; N1 after both changed. */
  function replace(doc: Doc, next: Session, ref: FileRef | null): void {
    controller.load(doc);
    replaceSession(next);
    main.sessionFile(ref);
    o.publish();
  }

  /** The drawing text inside the file, or the F14 problem. */
  function drawingText(
    ref: FileRef,
    bytes: Uint8Array,
  ): { ok: true; text: string } | { ok: false; problem: FileProblem } {
    if (ref.kind !== 'chalk') return { ok: false, problem: 'no-drawing' };
    const text = o.decodeUtf8(bytes);
    return text === null
      ? { ok: false, problem: 'damaged' }
      : { ok: true, text: text.replace(/^\ufeff/, '') };
  }

  /** F3: read, validate, then F4; any failure shows F14 and changes nothing. */
  async function openNow(ref: FileRef): Promise<void> {
    const read = await main.readFile(ref);
    if (!read.ok) return main.showFileError(read.problem, ref.name);
    const text = drawingText(ref, read.bytes);
    if (!text.ok) return main.showFileError(text.problem, ref.name);
    const parsed = parse(text.text);
    if (!parsed.ok) return main.showFileError(parseProblem(parsed.error.code), ref.name);
    if (!(await confirmDiscard())) return;
    replace(parsed.value, fileSession(ref), ref);
  }

  async function closeNow(): Promise<void> {
    if (await confirmDiscard()) main.closeOk();
  }

  return {
    newDrawing: () =>
      running
        ? Promise.resolve()
        : run(async () => {
            if (!(await confirmDiscard())) return;
            const doc = setStyle(emptyDoc(o.clock()), { preset: o.newDrawingStyle() });
            replace(
              doc,
              { name: 'Untitled', kind: 'untitled', ref: null, forcedDirty: false },
              null,
            );
          }),
    open: () =>
      running
        ? Promise.resolve()
        : run(async () => {
            const ref = await main.chooseOpen();
            if (ref !== null) await openNow(ref);
          }),
    openRef(ref) {
      if (!running) return run(() => openNow(ref));
      pending = { kind: 'open', ref };
      return Promise.resolve();
    },
    save: () =>
      running
        ? Promise.resolve()
        : run(async () => {
            await saveNow();
          }),
    saveAs: () =>
      running
        ? Promise.resolve()
        : run(async () => {
            await saveAsNow();
          }),
    requestClose() {
      if (!running) return run(closeNow);
      pending = { kind: 'close' };
      return Promise.resolve();
    },
    dirty,
    busy: () => running,
  };
}
