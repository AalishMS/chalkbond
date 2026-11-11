// A pure ICO writer and directory reader (SPEC-app-shell.md IC3): a 6-byte ICONDIR (reserved 0,
// type 1, count), one 16-byte entry per image (width and height bytes, 0 meaning 256; 32 bits per
// pixel; byte size; offset) and the PNG-compressed images back to back (Windows Vista and later).
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const HEADER = 6;
const ENTRY = 16;

/** @param {readonly { size: number, bytes: Uint8Array }[]} images */
export function writeIco(images) {
  if (images.length === 0) throw new Error('an icon needs at least one image');
  for (const { size, bytes } of images) {
    if (!Number.isInteger(size) || size < 1 || size > 256) throw new Error(`bad size ${size}`);
    if (!SIGNATURE.every((b, i) => bytes[i] === b)) throw new Error(`entry ${size} is not a PNG`);
  }
  const total = images.reduce((n, image) => n + image.bytes.length, HEADER + ENTRY * images.length);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, images.length, true);
  let offset = HEADER + ENTRY * images.length;
  images.forEach(({ size, bytes }, i) => {
    const at = HEADER + ENTRY * i;
    out[at] = size === 256 ? 0 : size;
    out[at + 1] = size === 256 ? 0 : size;
    out[at + 2] = 0; // no palette
    out[at + 3] = 0;
    view.setUint16(at + 4, 1, true); // planes
    view.setUint16(at + 6, 32, true); // bits per pixel
    view.setUint32(at + 8, bytes.length, true);
    view.setUint32(at + 12, offset, true);
    out.set(bytes, offset);
    offset += bytes.length;
  });
  return out;
}

/** @param {Uint8Array} bytes */
export function readIcoDirectory(bytes) {
  if (bytes.length < HEADER) throw new Error('too short for an icon');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1) {
    throw new Error('not an icon file');
  }
  const count = view.getUint16(4, true);
  if (bytes.length < HEADER + ENTRY * count) throw new Error('icon directory cut short');
  const entries = [];
  for (let i = 0; i < count; i++) {
    const at = HEADER + ENTRY * i;
    const entry = {
      width: bytes[at] === 0 ? 256 : bytes[at],
      height: bytes[at + 1] === 0 ? 256 : bytes[at + 1],
      planes: view.getUint16(at + 4, true),
      bitCount: view.getUint16(at + 6, true),
      size: view.getUint32(at + 8, true),
      offset: view.getUint32(at + 12, true),
    };
    if (entry.offset + entry.size > bytes.length) throw new Error('icon image cut short');
    entries.push(entry);
  }
  return { type: 1, entries };
}
