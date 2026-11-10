import type { MainEvent, StartupResponse, SessionUpdate } from '../shared/ipc-types';
/** The API the preload script exposes on `window.chalkbond`. Grows as app-shell features land. */
export interface ChalkbondApi {
  startup(): Promise<StartupResponse>;
  updateSession(value: SessionUpdate): void;
  readonly platform: string;
  logError(message: string): void;
  onMainEvent(callback: (event: MainEvent) => void): () => void;
}

declare global {
  interface Window {
    readonly chalkbond: ChalkbondApi;
  }
}
