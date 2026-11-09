/** The API the preload script exposes on `window.chalkbond`. Grows as app-shell features land. */
export interface ChalkbondApi {
  readonly platform: string;
}

declare global {
  interface Window {
    readonly chalkbond: ChalkbondApi;
  }
}
