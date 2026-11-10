export type LogErrorRequest = { message: string };
export type MainEvent =
  | { type: 'command'; command: string }
  | { type: 'open'; ref: { id: string; name: string; kind: 'chalk' | 'png' | 'svg' | 'pdf' } }
  | { type: 'close-requested' }
  | { type: 'flush-recovery' };
export interface IpcRequestMap {
  'log:error': LogErrorRequest;
}
