export class PngError extends Error {}
const signature = [137, 80, 78, 71, 13, 10, 26, 10];
const ascii = (b: Uint8Array): string => Array.from(b, (c) => String.fromCharCode(c)).join('');
const bytes = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));
export function crc32(b: Uint8Array): number {
  let crc = 0xffffffff;
  for (const v of b) {
    crc ^= v;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunks(png: Uint8Array): { type: string; data: Uint8Array; raw: Uint8Array }[] {
  if (!signature.every((v, i) => png[i] === v)) throw new PngError('signature');
  const result = [];
  let pos = 8;
  while (pos < png.length) {
    if (pos + 12 > png.length) throw new PngError('length');
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const len = view.getUint32(pos);
    const end = pos + 12 + len;
    if (end > png.length) throw new PngError('length');
    const type = ascii(png.slice(pos + 4, pos + 8));
    if (crc32(png.slice(pos + 4, end - 4)) !== view.getUint32(end - 4)) throw new PngError('crc');
    result.push({ type, data: png.slice(pos + 8, end - 4), raw: png.slice(pos, end) });
    pos = end;
    if (type === 'IEND') {
      if (len !== 0 || pos !== png.length) throw new PngError('IEND');
      break;
    }
  }
  if (result[0]?.type !== 'IHDR' || result[0].data.length !== 13 || result.at(-1)?.type !== 'IEND')
    throw new PngError('structure');
  return result;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const b = new Uint8Array(data.length + 12);
  const v = new DataView(b.buffer);
  v.setUint32(0, data.length);
  b.set(bytes(type), 4);
  b.set(data, 8);
  v.setUint32(b.length - 4, crc32(b.slice(4, -4)));
  return b;
}
export function withPictureChunks(
  png: Uint8Array,
  opts: { dpi: number; payload: string | null },
): Uint8Array {
  const list = chunks(png).filter(
    (c) => c.type !== 'pHYs' && !(c.type === 'tEXt' && ascii(c.data).startsWith('chalkbond\0')),
  );
  const phys = new Uint8Array(9);
  const v = new DataView(phys.buffer);
  v.setUint32(0, Math.round(opts.dpi / 0.0254));
  v.setUint32(4, Math.round(opts.dpi / 0.0254));
  phys[8] = 1;
  const extra = [chunk('pHYs', phys)];
  if (opts.payload !== null) extra.push(chunk('tEXt', bytes('chalkbond\0' + opts.payload)));
  const parts = [
    Uint8Array.from(signature),
    ...list.flatMap((c, i) => (i === 0 ? [c.raw, ...extra] : [c.raw])),
  ];
  const output = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of parts) {
    output.set(b, at);
    at += b.length;
  }
  return output;
}
export function readPngDrawing(png: Uint8Array): string | null {
  try {
    const c = chunks(png).find((c) => c.type === 'tEXt' && ascii(c.data).startsWith('chalkbond\0'));
    return c ? ascii(c.data.slice(10)) : null;
  } catch {
    return null;
  }
}
