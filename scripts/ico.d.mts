/** One PNG-compressed image of an ICO file. */
export interface IcoImage {
  readonly size: number;
  readonly bytes: Uint8Array;
}
export interface IcoEntry {
  readonly width: number;
  readonly height: number;
  readonly planes: number;
  readonly bitCount: number;
  readonly size: number;
  readonly offset: number;
}
export function writeIco(images: readonly IcoImage[]): Uint8Array;
export function readIcoDirectory(bytes: Uint8Array): { type: number; entries: IcoEntry[] };
