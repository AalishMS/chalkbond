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
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('PNG encoding failed'))),
        'image/png',
      );
    });
    return {
      png: withPictureChunksCapped(new Uint8Array(await blob.arrayBuffer()), {
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
