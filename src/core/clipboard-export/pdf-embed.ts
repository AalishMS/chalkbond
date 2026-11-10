type Reason = 'xref-stream' | 'encrypted' | 'unrecognised';
type Parsed = {
  x: number;
  size: number;
  root: string;
  info: string;
  id: string;
  drawing: number;
  entries: Map<number, number>;
  text: string;
};
function ascii(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return text;
}
function parse(pdf: Uint8Array): Parsed | Reason {
  const text = ascii(pdf);
  const tail = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text.slice(-1024));
  if (!tail || !text.startsWith('%PDF-')) return 'unrecognised';
  const x = Number(tail[1]);
  if (!Number.isSafeInteger(x) || x < 0 || x >= pdf.length) return 'unrecognised';
  const section = text.slice(x);
  if (!section.startsWith('xref')) {
    return /^\d+\s+\d+\s+obj\s*<<[^]*?\/Type\s*\/XRef\b/.test(section)
      ? 'xref-stream'
      : 'unrecognised';
  }
  const trailer = /^xref\s+([^]*?)trailer\s*<<([^]*?)>>\s*startxref/.exec(section);
  if (!trailer) return 'unrecognised';
  const dict = trailer[2] ?? '';
  if (/\/Encrypt\b/.test(dict)) return 'encrypted';
  const size = Number(/\/Size\s+(\d+)\b/.exec(dict)?.[1]);
  const root = /\/Root\s+(\d+\s+\d+\s+R)\b/.exec(dict)?.[1];
  if (!Number.isSafeInteger(size) || size < 1 || !root) return 'unrecognised';
  const entries = new Map<number, number>();
  const lines = (trailer[1] ?? '').trim().split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const header = /^(\d+)\s+(\d+)$/.exec(lines[i++] ?? '');
    if (!header) return 'unrecognised';
    const first = Number(header[1]),
      count = Number(header[2]);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(count) || count > lines.length - i)
      return 'unrecognised';
    for (let j = 0; j < count; j++) {
      const entry = /^(\d{10}) (\d{5}) ([nf])\s*$/.exec(lines[i++] ?? '');
      if (!entry) return 'unrecognised';
      const offset = Number(entry[1]);
      if (entry[3] === 'n') {
        if (offset >= x || offset < 0) return 'unrecognised';
        entries.set(first + j, offset);
      }
    }
  }
  return {
    x,
    size,
    root,
    text,
    entries,
    info: /\/Info\s+(\d+\s+\d+\s+R)\b/.exec(dict)?.[1] ?? '',
    id: /\/ID\s*(\[\s*<[\da-fA-F]*>\s*<[\da-fA-F]*>\s*\])/.exec(dict)?.[1] ?? '',
    drawing: Number(/\/ChalkbondDrawing\s+(\d+)\s+0\s+R\b/.exec(dict)?.[1] ?? -1),
  };
}
export function withPdfDrawing(
  pdf: Uint8Array,
  payload: string,
): { ok: true; pdf: Uint8Array } | { ok: false; reason: Reason } {
  const p = parse(pdf);
  if (typeof p === 'string') return { ok: false, reason: p };
  if (!/^[\x20-\x7e]*$/.test(payload)) return { ok: false, reason: 'unrecognised' };
  const lead = pdf.length > 0 && pdf[pdf.length - 1] === 10 ? '' : '\n';
  const offset = pdf.length + lead.length;
  const object =
    p.size +
    ' 0 obj\n<< /Type /EmbeddedFile /Subtype /application#2Fx-chalkbond /Length ' +
    payload.length +
    ' >>\nstream\n' +
    payload +
    '\nendstream\nendobj\n';
  const x = offset + object.length;
  if (offset > 9999999999) return { ok: false, reason: 'unrecognised' };
  const update =
    lead +
    object +
    'xref\n' +
    p.size +
    ' 1\n' +
    String(offset).padStart(10, '0') +
    ' 00000 n \ntrailer\n<< /Size ' +
    (p.size + 1) +
    ' /Root ' +
    p.root +
    (p.info ? ' /Info ' + p.info : '') +
    (p.id ? ' /ID ' + p.id : '') +
    ' /Prev ' +
    p.x +
    ' /ChalkbondDrawing ' +
    p.size +
    ' 0 R >>\nstartxref\n' +
    x +
    '\n%%EOF\n';
  const result = new Uint8Array(pdf.length + update.length);
  result.set(pdf);
  for (let i = 0; i < update.length; i++) result[pdf.length + i] = update.charCodeAt(i);
  return { ok: true, pdf: result };
}
export function readPdfDrawing(pdf: Uint8Array): string | null {
  const p = parse(pdf);
  if (typeof p === 'string') return null;
  const offset = p.entries.get(p.drawing);
  if (offset === undefined) return null;
  const object = p.text.slice(offset, p.x);
  const header = new RegExp(
    '^' +
      p.drawing +
      ' 0 obj\\s*<< /Type /EmbeddedFile /Subtype /application#2Fx-chalkbond /Length (\\d+) >>\\s*stream\\r?\\n',
  ).exec(object);
  if (!header) return null;
  const length = Number(header[1]);
  const start = header[0].length;
  if (!Number.isSafeInteger(length) || length < 0 || length > object.length - start) return null;
  const payload = object.slice(start, start + length);
  if (
    !/^\r?\nendstream\s+endobj\s*$/.test(object.slice(start + length)) ||
    !/^[\x20-\x7e]*$/.test(payload)
  )
    return null;
  return payload;
}
