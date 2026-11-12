// File flows (SPEC-app-shell.md "Files" F1–F7, F13; CO4, CO5; R7, R14, R17, R20; A6 pictures; RC2–RC4) over injected
// ports: DOM-free, no timers. One in-progress flag; one pending request (an open ref or a close, latest wins).
// Every session change publishes N1 itself, after the session changed.
import {
  emptyDoc,
  parse,
  serialize,
  setStyle,
  type Doc,
  type ParseErrorCode,
} from '@core/doc-model';
import { extractDrawing, fileKindOf } from '@core/clipboard-export';
import type { EditorController } from '../../editor';
import type {
  AskAnswer,
  AskRequest,
  FileProblem,
  FileRef,
  OpenTarget,
  ReadFileResponse,
  StartupResponse,
  WriteFileResponse,
} from '../../../shared/ipc-types';
import type { Recovery } from './recovery';
import { displayName, fileSession, recoveredSession, saveAsName, type Session } from './session';

/** The preload functions the flows use (`window.chalkbond`). */
export interface FlowMain {
  /** I1; `{ focus }` (a file open in a tab, T17) cannot happen before tabs are bound (TB17). */
  chooseOpen(): Promise<OpenTarget | null>;
  readFile(ref: FileRef): Promise<ReadFileResponse>;
  chooseSave(format: 'chalk', suggestedName: string): Promise<FileRef | null>;
  writeFile(ref: FileRef, data: Uint8Array): Promise<WriteFileResponse>;
  /** I4: the save prompt (F4) or the recover box (RC3). */
  ask<R extends AskRequest>(request: R): Promise<AskAnswer<R>>;
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
  /**
   * F4a (R17): finishes an open label or text editor through its own commit path and resolves once
   * it has closed (at once when none is open). The host's DOM port; never cancels, no timeout.
   */
  finishEditing(): Promise<void>;
  /** RC2: the recovery file's clears (`model/recovery.ts`). */
  recovery: RecoveryPort;
}

/** What the flows tell recovery (RC2): explicit clears, a save's outcome, a recovered drawing. */
export type RecoveryPort = Pick<Recovery, 'clear' | 'settle' | 'adopt' | 'resume'>;

/** CO5: what I7 handed over: a recovery file main found (unparsed) and a file request (F11). */
export type Startup = Pick<StartupResponse, 'recovery' | 'open'>;

export interface FileFlows {
  /**
   * CO5, RC3, RC4: the recovery offer (a file that does not parse is cleared and logged), then the
   * file request unless Recover kept the recovered drawing (N-A2). Runs as a flow.
   */
  start(startup: Startup): Promise<void>;
  /** F1 (Ctrl+N). Ignored while a flow runs. */
  newDrawing(): Promise<void>;
  /** F2 then F3 (Ctrl+O). Ignored while a flow runs. */
  open(): Promise<void>;
  /**
   * F3 for a ref main handed over (F11, F12); waits while a flow runs (latest wins). During the
   * startup recovery offer it replaces the startup request instead (RC4, R23).
   */
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
export function parseProblem(code: ParseErrorCode): FileProblem {
  if (code === 'newer-version') return 'newer-version';
  if (code === 'too-large') return 'too-large';
  return 'damaged';
}

export function createFileFlows(o: FileFlowOptions): FileFlows {
  const { main, controller, session } = o;
  let running = false;
  let pending: Pending | null = null;
  /** RC4 (R23): while the startup offer is unanswered, the latest file request (else null). */
  let offering = false;
  let requested: FileRef | null = null;

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

  /**
   * F4 with F4a and R14: an open editor is finished before dirty is decided; Save proceeds only
   * when it succeeded and the drawing is clean afterwards, with an editor opened during the
   * write finished first (its newer text keeps the drawing dirty and stops the action).
   */
  async function confirmDiscard(): Promise<boolean> {
    await o.finishEditing();
    if (!dirty()) return true;
    const answer = await main.ask({ kind: 'save-changes', name: displayName(session) });
    if (answer === 'discard') return true;
    if (answer === 'cancel') return false;
    const saved = await saveNow();
    await o.finishEditing();
    // R20: the recovery file is cleared only when the drawing is clean after the write.
    if (saved) o.recovery.settle();
    return saved && !dirty();
  }

  /** Replaces the drawing (CO1: only through `load`) and the session; N1 after both changed. */
  function replace(doc: Doc, next: Session, ref: FileRef | null): void {
    controller.load(doc);
    replaceSession(next);
    main.sessionFile(ref);
    // RC2: F4 passed and the drawing was replaced: the old recovery file goes.
    o.recovery.clear();
    o.publish();
  }

  /**
   * RC3 Recover: the session first (forcedDirty), then the load, so the drawing is dirty from its
   * first event and its recovery file is never cleared by it.
   */
  function recover(doc: Doc, oldName: string): void {
    replaceSession(recoveredSession(oldName));
    controller.load(doc);
    main.sessionFile(null);
    o.recovery.adopt();
    o.publish();
  }

  /**
   * RC3, RC4, RC7 (R23): while the offer is open, file requests replace the startup one (latest
   * wins); Recover keeps the recovered drawing and names the latest in N-A2; Delete, or a file that
   * does not parse, opens only the latest. Recovery tracking resumes once the offer is answered.
   */
  async function startNow({ recovery, open: target }: Startup): Promise<void> {
    // T17's `{ focus }` needs a bound tab, which no flow makes before TB17.
    const open = target !== null && 'id' in target ? target : null;
    if (recovery === null) {
      if (open !== null) await openNow(open);
      return;
    }
    offering = true;
    requested = open;
    let kept = false;
    try {
      const parsed = parse(recovery.text);
      if (!parsed.ok) {
        // RC3: deleted silently and logged (the code only, never the drawing).
        o.recovery.clear();
        main.logError(`Recovery file not used: ${parsed.error.code}`);
      } else if ((await main.ask({ kind: 'recover' })) === 'recover') {
        recover(parsed.value, recovery.name);
        kept = true;
      } else {
        o.recovery.clear();
      }
    } finally {
      offering = false;
      o.recovery.resume();
    }
    const latest = requested;
    requested = null;
    if (latest === null) return;
    if (kept) {
      controller.notify(
        'info',
        `Recovered your unsaved drawing. Save it, then open ${latest.name} again.`,
      );
    } else {
      await openNow(latest);
    }
  }

  /**
   * The drawing text inside the file (clipboard-export E4: a `.chalk`, or the payload an exported
   * PNG, SVG or PDF carries), or the F14 problem. An SVG is only scanned as a string (CS4).
   */
  function drawingText(
    ref: FileRef,
    bytes: Uint8Array,
  ): { ok: true; text: string } | { ok: false; problem: FileProblem } {
    const kind = fileKindOf(ref.name);
    if (kind === null) return { ok: false, problem: 'unsupported' };
    return extractDrawing(kind, bytes, o.decodeUtf8);
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

  /** F13: proceed → N4 (RC2), then N5; main closes once the N4 is done. */
  async function closeNow(): Promise<void> {
    if (!(await confirmDiscard())) return;
    o.recovery.clear();
    main.closeOk();
  }

  return {
    start: (startup) => run(() => startNow(startup)),
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
            if (ref !== null && 'id' in ref) await openNow(ref);
          }),
    openRef(ref) {
      if (offering) {
        requested = ref;
        return Promise.resolve();
      }
      if (!running) return run(() => openNow(ref));
      pending = { kind: 'open', ref };
      return Promise.resolve();
    },
    save: () =>
      running
        ? Promise.resolve()
        : run(async () => {
            if (await saveNow()) o.recovery.settle();
          }),
    saveAs: () =>
      running
        ? Promise.resolve()
        : run(async () => {
            if (await saveAsNow()) o.recovery.settle();
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
