import type {
  AskAnswer,
  AskRequest,
  AutoSaveProblem,
  ChooseSaveRequest,
  ClipboardWriteRequest,
  ClipboardReadResponse,
  ContextMenuAnswer,
  ContextMenuRequest,
  FileDroppedResponse,
  FileProblem,
  FileRef,
  KeepProblem,
  PrintPdfRequest,
  PrintPdfResponse,
  ReadFileResponse,
  ReadTabRecordResponse,
  SessionIndexUpdate,
  WriteFileResponse,
  WriteTabRecordRequest,
  WriteTabRecordResponse,
  MainEvent,
  RendererSettings,
  StartupResponse,
  TabMenuAnswer,
  TabMenuRequest,
  SessionUpdate,
  WriteRecoveryRequest,
} from '../shared/ipc-types';
/** The API the preload script exposes on `window.chalkbond`. Grows as app-shell features land. */
export interface ChalkbondApi {
  clipboardWrite(value: ClipboardWriteRequest): Promise<{ ok: boolean }>;
  clipboardRead(): Promise<ClipboardReadResponse>;
  /** I1: the Open dialog; null when cancelled. */
  chooseOpen(): Promise<FileRef | null>;
  /** I2: the bytes of a ref main handed out. */
  readFile(ref: FileRef): Promise<ReadFileResponse>;
  /**
   * I3 (F12, SEC14): a dropped file; the preload reads its path (`webUtils.getPathForFile`) and
   * main checks it. A ref to open, or why not (`unsupported` with an empty name for a JS-made File).
   */
  openDroppedFile(file: File): Promise<FileDroppedResponse>;
  /** C3: the Save dialog for `format`; `suggestedName` is a base name. Null when cancelled. */
  chooseSave(format: ChooseSaveRequest['format'], suggestedName: string): Promise<FileRef | null>;
  /** C4: writes `data` to a writable ref of its kind (atomic, F9). */
  writeFile(ref: FileRef, data: Uint8Array): Promise<WriteFileResponse>;
  /** C5: prints the export SVG to a one-page PDF in a hidden window (PD1). */
  printPdf(request: PrintPdfRequest): Promise<PrintPdfResponse>;
  /** I4: a native question box. */
  ask<R extends AskRequest>(request: R): Promise<AskAnswer<R>>;
  /** I5: the F14 error box for `{ problem, name }` (a base name). */
  showFileError(problem: FileProblem, name: string): Promise<void>;
  /** I5 (AS6, AS7, SS6): the auto-save box (a failed write, `missing`, changed outside) for a base name. */
  showFileError(problem: AutoSaveProblem, name: string, context: 'auto-save'): Promise<void>;
  /** I5 (SS6): the "couldn't keep" box for a session record that could not be written. */
  showFileError(problem: KeepProblem, name: string, context: 'keep'): Promise<void>;
  /** I6 (CM1): the canvas context menu at the cursor; the chosen command or null. */
  showContextMenu(request: ContextMenuRequest): Promise<ContextMenuAnswer>;
  /** I10 (T15, CM4): the tab menu at the cursor (`at` null) or at a point; the chosen item or null. */
  showTabMenu(request: TabMenuRequest): Promise<TabMenuAnswer>;
  startup(): Promise<StartupResponse>;
  /** I8: remembers renderer settings (ST1 style, Export choices); main writes settings.json. */
  setSettings(value: Partial<RendererSettings>): Promise<void>;
  updateSession(value: SessionUpdate): void;
  /** N2: the session's file (null: Untitled after New); main keeps the folders, never the page. */
  sessionFile(ref: FileRef | null): void;
  /** N5: the renderer agreed to close (F13); main closes the window. */
  closeOk(): void;
  /** I11 (SS7): a tab's session record by tab id (main checks only size and signature). */
  readTabRecord(tabId: string): Promise<ReadTabRecordResponse>;
  /**
   * N7 (SS4, SS6): writes a tab's record atomically on the session chain; a failure keeps the
   * previous record and answers the problem (the tab is then unkept).
   */
  writeTabRecord(value: WriteTabRecordRequest): Promise<WriteTabRecordResponse>;
  /** N8 (SS4): the renderer's part of the session index; main merges its paths and hashes. */
  updateSessionIndex(value: SessionIndexUpdate): void;
  /** N3 (RC1): writes the recovery file (main queues it, RC6). */
  writeRecovery(value: WriteRecoveryRequest): void;
  /** N4 (RC2): removes the recovery file (queued after every earlier write). */
  clearRecovery(): void;
  readonly platform: string;
  logError(message: string): void;
  onMainEvent(callback: (event: MainEvent) => void): () => void;
}

declare global {
  interface Window {
    readonly chalkbond: ChalkbondApi;
  }
}
