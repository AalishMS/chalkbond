import type { MainEvent } from '../shared/ipc-types';
/** The API the preload script exposes on `window.chalkbond`. Grows as app-shell features land. */
export interface ChalkbondApi {
  readonly platform: string;
  logError(message: string): void;
  onMainEvent(callback: (event: MainEvent) => void): () => void;
}

declare global {
  interface Window {
    readonly chalkbond: ChalkbondApi;
  }
}
