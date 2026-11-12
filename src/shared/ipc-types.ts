import type { AppCommand, ContextCommand, MenuState } from './menu';

export type LogErrorRequest = { message: string };
export type MainEvent =
  | { type: 'command'; command: AppCommand }
  | { type: 'open'; ref: { id: string; name: string; kind: 'chalk' | 'png' | 'svg' | 'pdf' } }
  | { type: 'close-requested' }
  | { type: 'flush-recovery' };
export interface IpcRequestMap {
  'clipboard:write': ClipboardWriteRequest;
  'clipboard:read': Record<string, never>;
  'file:choose-open': Record<string, never>;
  'file:read': { ref: string };
  'file:dropped': FileDroppedRequest;
  'file:choose-save': ChooseSaveRequest;
  'file:write': { ref: string; data: Uint8Array };
  'pdf:print': PrintPdfRequest;
  'dialog:ask': AskRequest;
  'dialog:file-error': FileErrorRequest;
  'context-menu:show': ContextMenuRequest;
  'tab-menu:show': TabMenuRequest;
  'log:error': LogErrorRequest;
  'app:startup': Record<string, never>;
  'settings:set': Partial<RendererSettings>;
  'session:update': SessionUpdate;
  'session:file': { ref: string | null };
  'app:close-ok': Record<string, never>;
  'recovery:write': WriteRecoveryRequest;
  'recovery:clear': Record<string, never>;
}
export type FileRef = { id: string; name: string; kind: 'chalk' | 'png' | 'svg' | 'pdf' };
export interface RendererSettings {
  newDrawingStyle: 'slides' | 'journal';
  export: { format: 'png' | 'svg' | 'pdf'; pngDpi: 150 | 300 | 600; pngWhite: boolean };
}
export interface StartupResponse {
  settings: RendererSettings;
  recovery: { text: string; name: string } | null;
  open: FileRef | null;
}
export interface SessionUpdate {
  title: string;
  dirty: boolean;
  /** A11: the menu's state; main rebuilds the menu when it changed. */
  menu: MenuState;
}

export interface ClipboardWriteRequest {
  png: Uint8Array;
  svg: string;
  drawing: string | null;
}
export interface ClipboardReadResponse {
  drawing: string | null;
  text: string | null;
  textTooLong: boolean;
  image: boolean;
}

/** I2 read problems; `unsupported` is a drop's (I3) or Open's (I1, shown by main), never I2's. */
export type ReadProblem = 'missing' | 'too-large' | 'unreadable' | 'unsupported';
export type ReadFileResponse =
  { ok: true; bytes: Uint8Array } | { ok: false; problem: Exclude<ReadProblem, 'unsupported'> };
/** I3 (SEC14): sent by the preload only; the one request with a path (R8). */
export interface FileDroppedRequest {
  path: string;
}
/** I3: a ref for the dropped file, or why not (with its base name for the F14 box). */
export type FileDroppedResponse =
  | { ok: true; ref: FileRef }
  | { ok: false; problem: 'unsupported' | 'missing' | 'too-large'; name: string };
/** F14 write problems (C4). */
export type WriteProblem = 'write-denied' | 'disk-full' | 'busy' | 'folder-gone' | 'write-failed';
export type WriteFileResponse = { ok: true } | { ok: false; problem: WriteProblem };
/** C5 (clipboard-export PD1): the unembedded export SVG and its size in pt. */
export interface PrintPdfRequest {
  svg: string;
  widthPt: number;
  heightPt: number;
}
/** C5: the printed PDF (starts with `%PDF-`, at most 64 MiB), or a failure main has logged. */
export type PrintPdfResponse = { ok: true; pdf: Uint8Array } | { ok: false };
/** Every F14 problem (I5). */
export type FileProblem =
  | ReadProblem
  | WriteProblem
  | 'no-drawing'
  | 'newer-version'
  | 'damaged'
  /** AS9: Save as onto a file that is open in another tab. */
  | 'open-in-tab';
/** The auto-save boxes (AS6, AS7): a failed write, `missing`, or a file changed outside. */
export type AutoSaveProblem =
  | WriteProblem
  | 'missing'
  | 'changed-outside'
  /** AS7(c): the changed file does not open, so no tab holds it. */
  | 'changed-outside-unopenable';
/** The "couldn't keep" box (SS6): a session record that could not be written. */
export type KeepProblem = 'disk-full' | 'write-denied' | 'write-failed';
export interface ChooseSaveRequest {
  format: FileRef['kind'];
  /** A base name (no `/` or `\`). */
  suggestedName: string;
}
export type AskRequest = { kind: 'save-changes'; name: string } | { kind: 'recover' };
export type AskAnswer<R extends AskRequest> = R extends { kind: 'recover' }
  ? 'recover' | 'delete'
  : 'save' | 'discard' | 'cancel';
/** I5: `{ problem, name }`, or the auto-save / keep boxes with their `context` (a base name always). */
export type FileErrorRequest =
  | { problem: FileProblem; name: string }
  | { context: 'auto-save'; problem: AutoSaveProblem; name: string }
  | { context: 'keep'; problem: KeepProblem; name: string };

/** I10 (T15): the tab menu's items; only the answer leaves main. */
export interface TabMenuState {
  canReopenTab: boolean;
}
export interface TabMenuRequest {
  /** The tab right-clicked or focused; the renderer acts on it, main only shows the menu. */
  tabId: string;
  state: TabMenuState;
  /** Content CSS px under the tab for a key (M4 style); null: at the cursor. */
  at: { x: number; y: number } | null;
}
export type TabMenuAnswer = 'new-tab' | 'close' | 'reopen' | null;

/** I6 (CM1): which canvas menu, and the menu state when it was asked for. */
export interface ContextMenuRequest {
  onItem: boolean;
  state: MenuState;
}
export type ContextMenuAnswer = ContextCommand | null;

/** N3 (RC1): the committed drawing's text and the session's name for `recovery.json`. */
export interface WriteRecoveryRequest {
  text: string;
  /** A base name (no `/` or `\`). */
  name: string;
}
