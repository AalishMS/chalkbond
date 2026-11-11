import type { AppCommand, MenuState } from './menu';

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
  'file:choose-save': ChooseSaveRequest;
  'file:write': { ref: string; data: Uint8Array };
  'pdf:print': PrintPdfRequest;
  'dialog:ask': AskRequest;
  'dialog:file-error': FileErrorRequest;
  'log:error': LogErrorRequest;
  'app:startup': Record<string, never>;
  'settings:set': Partial<RendererSettings>;
  'session:update': SessionUpdate;
  'session:file': { ref: string | null };
  'app:close-ok': Record<string, never>;
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
export type FileProblem = ReadProblem | WriteProblem | 'no-drawing' | 'newer-version' | 'damaged';
export interface ChooseSaveRequest {
  format: FileRef['kind'];
  /** A base name (no `/` or `\`). */
  suggestedName: string;
}
export type AskRequest = { kind: 'save-changes'; name: string } | { kind: 'recover' };
export type AskAnswer<R extends AskRequest> = R extends { kind: 'recover' }
  ? 'recover' | 'delete'
  : 'save' | 'discard' | 'cancel';
export interface FileErrorRequest {
  problem: FileProblem;
  /** A base name (no `/` or `\`). */
  name: string;
}
