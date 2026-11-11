import { MAX_FILE_BYTES } from '../doc-model';
import { readPngDrawing } from './png-chunks';
import { readSvgDrawing } from './svg-embed';
import { readPdfDrawing } from './pdf-embed';
import { MAX_PICTURE_BYTES } from './picture';
export type DrawingFileKind = 'chalk' | 'png' | 'svg' | 'pdf';
export function fileKindOf(name: string): DrawingFileKind | null {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return name.includes('.') && (ext === 'chalk' || ext === 'png' || ext === 'svg' || ext === 'pdf')
    ? ext
    : null;
}
export function extractDrawing(
  kind: DrawingFileKind,
  bytes: Uint8Array,
  decodeUtf8: (b: Uint8Array) => string | null,
): { ok: true; text: string } | { ok: false; problem: 'no-drawing' | 'damaged' | 'too-large' } {
  // Decision C9: a .chalk is the drawing itself (20 MiB); a picture carrier may be up to 64 MiB.
  // The text found inside is still checked by parse's 20 MiB rule in the caller.
  if (bytes.length > (kind === 'chalk' ? MAX_FILE_BYTES : MAX_PICTURE_BYTES))
    return { ok: false, problem: 'too-large' };
  try {
    let text: string | null;
    switch (kind) {
      case 'chalk':
      case 'svg': {
        const decoded = decodeUtf8(bytes);
        if (decoded === null) return { ok: false, problem: 'damaged' };
        text = kind === 'chalk' ? decoded.replace(/^\ufeff/, '') : readSvgDrawing(decoded);
        break;
      }
      case 'png':
        if (![137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n))
          return { ok: false, problem: 'damaged' };
        text = readPngDrawing(bytes);
        break;
      case 'pdf':
        if (![37, 80, 68, 70, 45].every((n, i) => bytes[i] === n))
          return { ok: false, problem: 'damaged' };
        text = readPdfDrawing(bytes);
        break;
    }
    return text === null ? { ok: false, problem: 'no-drawing' } : { ok: true, text };
  } catch {
    return { ok: false, problem: 'damaged' };
  }
}
