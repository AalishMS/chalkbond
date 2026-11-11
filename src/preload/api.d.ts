import type {
  AskAnswer,
  AskRequest,
  ChooseSaveRequest,
  ClipboardWriteRequest,
  ClipboardReadResponse,
  FileProblem,
  FileRef,
  ReadFileResponse,
  WriteFileResponse,
  MainEvent,
  StartupResponse,
  SessionUpdate,
} from '../shared/ipc-types';
/** The API the preload script exposes on `window.chalkbond`. Grows as app-shell features land. */
export interface ChalkbondApi {
  clipboardWrite(value: ClipboardWriteRequest): Promise<{ ok: boolean }>;
  clipboardRead(): Promise<ClipboardReadResponse>;
  /** I1: the Open dialog; null when cancelled. */
  chooseOpen(): Promise<FileRef | null>;
  /** I2: the bytes of a ref main handed out. */
  readFile(ref: FileRef): Promise<ReadFileResponse>;
  /** C3: the Save dialog for `format`; `suggestedName` is a base name. Null when cancelled. */
  chooseSave(format: ChooseSaveRequest['format'], suggestedName: string): Promise<FileRef | null>;
  /** C4: writes `data` to a writable ref of its kind (atomic, F9). */
  writeFile(ref: FileRef, data: Uint8Array): Promise<WriteFileResponse>;
  /** I4: a native question box. */
  ask<R extends AskRequest>(request: R): Promise<AskAnswer<R>>;
  /** I5: the F14 error box for `{ problem, name }` (a base name). */
  showFileError(problem: FileProblem, name: string): Promise<void>;
  startup(): Promise<StartupResponse>;
  updateSession(value: SessionUpdate): void;
  /** N2: the session's file (null: Untitled after New); main keeps the folders, never the page. */
  sessionFile(ref: FileRef | null): void;
  /** N5: the renderer agreed to close (F13); main closes the window. */
  closeOk(): void;
  readonly platform: string;
  logError(message: string): void;
  onMainEvent(callback: (event: MainEvent) => void): () => void;
}

declare global {
  interface Window {
    readonly chalkbond: ChalkbondApi;
  }
}
