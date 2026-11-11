export type LogErrorRequest = { message: string };
export type MainEvent =
  | { type: 'command'; command: string }
  | { type: 'open'; ref: { id: string; name: string; kind: 'chalk' | 'png' | 'svg' | 'pdf' } }
  | { type: 'close-requested' }
  | { type: 'flush-recovery' };
export interface IpcRequestMap {
  'clipboard:write': ClipboardWriteRequest;
  'clipboard:read': Record<string, never>;
  'log:error': LogErrorRequest;
  'app:startup': Record<string, never>;
  'session:update': SessionUpdate;
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
