import type {
  AcceptOutsideRequest,
  AskAnswer,
  AskRequest,
  AutoSaveProblem,
  AutoSaveRequest,
  AutoSaveResponse,
  BindTabRequest,
  BindTabResponse,
  CheckTabFileResponse,
  ChooseSaveRequest,
  ClipboardWriteRequest,
  ClipboardReadResponse,
  ContextMenuAnswer,
  ContextMenuRequest,
  FileDroppedResponse,
  FileProblem,
  FileRef,
  KeepProblem,
  OpenTarget,
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
  AppMenuAnswer,
  AppMenuRequest,
  TabMenuAnswer,
  TabMenuRequest,
  SessionUpdate,
} from '../shared/ipc-types';
/** The API the preload script exposes on `window.chalkbond`. Grows as app-shell features land. */
export interface ChalkbondApi {
  clipboardWrite(value: ClipboardWriteRequest): Promise<{ ok: boolean }>;
  clipboardRead(): Promise<ClipboardReadResponse>;
  /** I1: the Open dialog; null when cancelled; `{ focus }` when the file is open in a tab (T17). */
  chooseOpen(): Promise<OpenTarget | null>;
  /** I2: the bytes of a ref main handed out. */
  readFile(ref: FileRef): Promise<ReadFileResponse>;
  /**
   * I3 (F12, SEC14): a dropped file; the preload reads its path (`webUtils.getPathForFile`) and
   * main checks it. A ref to open, the tab that holds the file (`{ ok: true, focus }`, T17), or why
   * not (`unsupported` with an empty name for a JS-made File).
   */
  openDroppedFile(file: File): Promise<FileDroppedResponse>;
  /** C3: the Save dialog for `format`; `suggestedName` is a base name. Null when cancelled. */
  chooseSave(format: ChooseSaveRequest['format'], suggestedName: string): Promise<FileRef | null>;
  /** C4: writes `data` to a writable ref of its kind (atomic, F9). */
  writeFile(ref: FileRef, data: Uint8Array): Promise<WriteFileResponse>;
  /** C5: prints the export SVG to a one-page PDF in a hidden window (PD1). */
  printPdf(request: PrintPdfRequest): Promise<PrintPdfResponse>;
  /** I4: a native question box. */
  ask(request: AskRequest): Promise<AskAnswer>;
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
  /** I9 (M4, R32): the ☰ menu's four submenus as one popup at (x, y) in content CSS px; a command to run or null. */
  showAppMenu(request: AppMenuRequest): Promise<AppMenuAnswer>;
  /** I7: settings, the restored session (SS7) and the launch's file (a ref or `{ focus }`). */
  startup(): Promise<StartupResponse>;
  /** I8: remembers renderer settings (ST1 style, Export choices); main writes settings.json. */
  setSettings(value: Partial<RendererSettings>): Promise<void>;
  /** N1: the window title (W3). */
  updateSession(value: SessionUpdate): void;
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
  /**
   * I12 (T12, T17, AS7, AS9, F6): binds a tab in main. `save-as` is sent before the C4 write; a
   * path open in another tab answers `{ ok: false, openIn }` and nothing changes.
   */
  bindTab(request: BindTabRequest): Promise<BindTabResponse>;
  /** I13 (AS1, AS5): writes a file tab's drawing after the outside-change check; names its tab. */
  autoSave(request: AutoSaveRequest): Promise<AutoSaveResponse>;
  /**
   * I14 (AS5): the outside-change check of a file tab and its written hash; with `wantBytes` a
   * `same` answer also carries the file's bytes (SS11, TB18).
   */
  checkTabFile(tabId: string, wantBytes?: boolean): Promise<CheckTabFileResponse>;
  /** N9 (AS7(a)): the changed bytes the tab loaded become its file, `written` its written hash. */
  acceptOutsideChange(value: AcceptOutsideRequest): void;
  /**
   * N10 (SS11): the record I11 returned for this tab (or its drawing) did not parse; main moves it
   * to `userData/session/damaged/` on the session chain.
   */
  damagedTabRecord(tabId: string): void;
  readonly platform: string;
  logError(message: string): void;
  onMainEvent(callback: (event: MainEvent) => void): () => void;
}

declare global {
  interface Window {
    readonly chalkbond: ChalkbondApi;
  }
}
