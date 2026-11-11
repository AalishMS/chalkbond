import {
  MAX_PICTURE_BYTES,
  pngPixelSize,
  readSvgDrawing,
  withPictureChunks,
} from '@core/clipboard-export';
import type { SvgDocument } from '@core/svg-render';

/**
 * R1's chunks with Decision C9's cap: `withPictureChunks` as usual; when the result is over `cap`
 * with a payload, it is rebuilt from `png` without the payload (pHYs kept). A PNG over the cap
 * even then is returned as it is: the write (C1, C4) refuses it. Callers that need to know whether
 * the drawing is inside read it back with `readPngDrawing` (the export flow's N-E3).
 */
export function withPictureChunksCapped(
  png: Uint8Array,
  opts: { dpi: number; payload: string | null },
  cap: number = MAX_PICTURE_BYTES,
): Uint8Array {
  const full = withPictureChunks(png, opts);
  if (opts.payload === null || full.length <= cap) return full;
  return withPictureChunks(png, { dpi: opts.dpi, payload: null });
}

const PNG_DATA_URL = 'data:image/png;base64,';
/** Base64 characters per `atob` call (a multiple of 4): 48 KiB of bytes at a time. */
const BASE64_CHUNK = 65536;

/**
 * Decision C11: the bytes of the canvas's `toDataURL('image/png')`. Only a PNG base64 data URL is
 * accepted; its decoded size is worked out from the length (and padding) before any `atob` and
 * must be at most `cap`; the text is decoded in chunks of at most 64 KiB of base64. Anything else
 * throws, and rasterise's callers show their existing failure (N-C6, the write-failed box).
 */
export function pngFromDataUrl(url: string, cap: number = MAX_PICTURE_BYTES): Uint8Array {
  if (!url.startsWith(PNG_DATA_URL)) throw new Error('PNG encoding failed');
  const start = PNG_DATA_URL.length;
  const chars = url.length - start;
  if (chars === 0 || chars % 4 !== 0) throw new Error('PNG encoding failed');
  const padding = url.endsWith('==') ? 2 : url.endsWith('=') ? 1 : 0;
  const size = (chars / 4) * 3 - padding;
  if (size > cap) throw new Error('PNG over the picture limit');
  const out = new Uint8Array(size);
  let w = 0;
  for (let i = start; i < url.length; i += BASE64_CHUNK) {
    const bytes = atob(url.slice(i, Math.min(url.length, i + BASE64_CHUNK)));
    if (w + bytes.length > size) throw new Error('PNG encoding failed');
    for (let k = 0; k < bytes.length; k++) out[w + k] = bytes.charCodeAt(k);
    w += bytes.length;
  }
  if (w !== size) throw new Error('PNG encoding failed');
  return out;
}

export async function rasterise(svg: SvgDocument, dpi: number, white: boolean) {
  const size = pngPixelSize(svg.width, svg.height, dpi);
  const text = svg.svg.replace(/<svg\b[^>]*>/, (root) =>
    root
      .replace(/\bwidth="[^"]*"/, `width="${size.width}px"`)
      .replace(/\bheight="[^"]*"/, `height="${size.height}px"`),
  );
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    if (white) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size.width, size.height);
    }
    ctx.drawImage(image, 0, 0);
    // C11: toDataURL encodes now; toBlob waited for an idle task (about 1 s in the app).
    const png = pngFromDataUrl(canvas.toDataURL('image/png'));
    return {
      png: withPictureChunksCapped(png, {
        dpi: size.dpi,
        payload: readSvgDrawing(svg.svg),
      }),
      dpi: size.dpi,
      reduced: size.reduced,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
