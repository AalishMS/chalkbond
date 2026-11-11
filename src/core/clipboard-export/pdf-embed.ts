// Rule PDF-A (SPEC-clipboard-export.md PDF-A1–PDF-A3, Decision C10). Memory is bounded by the
// parts read, not by the file: the parser works on bytes and decodes only the last 1024 bytes,
// the trailer dictionary and the cross-reference lines, one at a time, to text. It never turns
// the whole PDF or a content stream into a string; only the returned payload becomes one, in
// bounded chunks. Results equal the C12 parser's (a whole-file Latin-1 string matched with
// regular expressions): `ws` is exactly what JavaScript's `\s` matches in Latin-1.
type Reason = 'xref-stream' | 'encrypted' | 'unrecognised';
type Parsed = {
  x: number;
  size: number;
  root: string;
  info: string;
  id: string;
  drawing: number;
  /** The last classic-table offset of object `drawing`, if any. */
  drawingAt: number | undefined;
};

/** Bytes decoded per `String.fromCharCode` call. */
const CHUNK = 8192;
const EMBEDDED_HEAD = ' 0 obj';
const EMBEDDED_DICT = '<< /Type /EmbeddedFile /Subtype /application#2Fx-chalkbond /Length ';

/** JavaScript's `\s` (and `trim`) on a Latin-1 character. */
const ws = (b: number | undefined): boolean =>
  b === 32 || (b !== undefined && b >= 9 && b <= 13) || b === 160;
const digit = (b: number | undefined): boolean => b !== undefined && b >= 48 && b <= 57;
const word = (b: number | undefined): boolean =>
  b !== undefined && (digit(b) || (b >= 65 && b <= 90) || (b >= 97 && b <= 122) || b === 95);

/** `bytes[from, to)` as Latin-1 text, decoded in bounded chunks. */
function latin1(bytes: Uint8Array, from: number, to: number): string {
  const parts: string[] = [];
  for (let i = from; i < to; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, Math.min(to, i + CHUNK))));
  }
  return parts.join('');
}
/** Whether the ASCII `token` is at `at` and ends at or before `end`. */
function at(bytes: Uint8Array, i: number, token: string, end = bytes.length): boolean {
  if (i < 0 || i + token.length > end) return false;
  for (let k = 0; k < token.length; k++) if (bytes[i + k] !== token.charCodeAt(k)) return false;
  return true;
}
/** The first index ≥ `from` where `token` starts, else -1. */
function find(bytes: Uint8Array, token: string, from: number): number {
  const first = token.charCodeAt(0);
  for (let i = Math.max(0, from); i + token.length <= bytes.length; i++) {
    if (bytes[i] === first && at(bytes, i, token)) return i;
  }
  return -1;
}
function skipWs(bytes: Uint8Array, i: number, end = bytes.length): number {
  while (i < end && ws(bytes[i])) i++;
  return i;
}
function skipDigits(bytes: Uint8Array, i: number, end = bytes.length): number {
  while (i < end && digit(bytes[i])) i++;
  return i;
}

/** The old pattern `^\d+\s+\d+\s+obj\s*<<[^]*?\/Type\s*\/XRef\b` at `x`, scanned on bytes. */
function isXrefStream(pdf: Uint8Array, x: number): boolean {
  let i = skipDigits(pdf, x);
  if (i === x) return false;
  let j = skipWs(pdf, i);
  if (j === i) return false;
  i = skipDigits(pdf, j);
  if (i === j) return false;
  j = skipWs(pdf, i);
  if (j === i || !at(pdf, j, 'obj')) return false;
  i = skipWs(pdf, j + 3);
  if (!at(pdf, i, '<<')) return false;
  for (let t = find(pdf, '/Type', i + 2); t >= 0; t = find(pdf, '/Type', t + 1)) {
    const r = skipWs(pdf, t + 5);
    if (at(pdf, r, '/XRef') && !word(pdf[r + 5])) return true;
  }
  return false;
}

/** The old `^xref\s+([^]*?)trailer\s*<<([^]*?)>>\s*startxref`: [trailer at, dict from, dict to]. */
function trailerOf(pdf: Uint8Array, x: number): [number, number, number] | null {
  if (!ws(pdf[x + 4])) return null;
  for (let t = find(pdf, 'trailer', x + 5); t >= 0; t = find(pdf, 'trailer', t + 1)) {
    const open = skipWs(pdf, t + 7);
    if (!at(pdf, open, '<<')) continue;
    // The first `>>` followed by \s*startxref after this `<<`. A later trailer's `<<` is further
    // on, so if there is none here there is none for any later trailer either.
    for (let e = find(pdf, '>>', open + 2); e >= 0; e = find(pdf, '>>', e + 1)) {
      if (at(pdf, skipWs(pdf, e + 2), 'startxref')) return [t, open + 2, e];
    }
    return null;
  }
  return null;
}

/** One cross-reference entry line `^(\d{10}) (\d{5}) ([nf])\s*$`: its offset and kind. */
function entryOf(pdf: Uint8Array, from: number, to: number): [number, boolean] | null {
  if (to - from < 18 || pdf[from + 10] !== 32 || pdf[from + 16] !== 32) return null;
  let offset = 0;
  for (let k = 0; k < 10; k++) {
    const b = pdf[from + k];
    if (!digit(b)) return null;
    offset = offset * 10 + ((b ?? 0) - 48);
  }
  for (let k = 11; k < 16; k++) if (!digit(pdf[from + k])) return null;
  const kind = pdf[from + 17];
  if (kind !== 110 && kind !== 102) return null;
  if (skipWs(pdf, from + 18, to) !== to) return null;
  return [offset, kind === 110];
}

/** A subsection header line `^(\d+)\s+(\d+)$`, decoded only when it can match. */
function headerOf(pdf: Uint8Array, from: number, to: number): [number, number] | null {
  for (let k = from; k < to; k++) if (!digit(pdf[k]) && !ws(pdf[k])) return null;
  const m = /^(\d+)\s+(\d+)$/.exec(latin1(pdf, from, to));
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * The classic table between `from` and `to` (the old `.trim().split(/\r?\n/)`), line by line:
 * the last offset of object `drawing`, null when any line is malformed or an offset is not
 * before `x`.
 */
function tableOf(
  pdf: Uint8Array,
  from: number,
  to: number,
  x: number,
  drawing: number,
): { at: number | undefined } | null {
  let a = from,
    b = to;
  while (a < b && ws(pdf[a])) a++;
  while (b > a && ws(pdf[b - 1])) b--;
  let lines = 1;
  for (let k = a; k < b; k++) if (pdf[k] === 10) lines++;
  let start = a;
  let i = 0;
  /** The next line's [from, to) without its \r?\n. */
  const next = (): [number, number] => {
    let end = start;
    while (end < b && pdf[end] !== 10) end++;
    const line: [number, number] = [start, end < b && pdf[end - 1] === 13 ? end - 1 : end];
    // `end - 1 >= start` holds whenever pdf[end - 1] is \r inside this line.
    if (line[1] < line[0]) line[1] = line[0];
    start = end + 1;
    i++;
    return line;
  };
  let found: number | undefined;
  while (i < lines) {
    const header = headerOf(pdf, ...next());
    if (!header) return null;
    const [first, count] = header;
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(count) || count > lines - i) {
      return null;
    }
    for (let j = 0; j < count; j++) {
      const entry = entryOf(pdf, ...next());
      if (!entry) return null;
      const [offset, inUse] = entry;
      if (inUse) {
        if (offset >= x || offset < 0) return null;
        if (first + j === drawing) found = offset;
      }
    }
  }
  return { at: found };
}

function parse(pdf: Uint8Array): Parsed | Reason {
  const tail = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(
    latin1(pdf, Math.max(0, pdf.length - 1024), pdf.length),
  );
  if (!tail || !at(pdf, 0, '%PDF-')) return 'unrecognised';
  const x = Number(tail[1]);
  if (!Number.isSafeInteger(x) || x < 0 || x >= pdf.length) return 'unrecognised';
  if (!at(pdf, x, 'xref')) return isXrefStream(pdf, x) ? 'xref-stream' : 'unrecognised';
  const trailer = trailerOf(pdf, x);
  if (!trailer) return 'unrecognised';
  const [t, from, to] = trailer;
  const dict = latin1(pdf, from, to);
  if (/\/Encrypt\b/.test(dict)) return 'encrypted';
  const size = Number(/\/Size\s+(\d+)\b/.exec(dict)?.[1]);
  const root = /\/Root\s+(\d+\s+\d+\s+R)\b/.exec(dict)?.[1];
  if (!Number.isSafeInteger(size) || size < 1 || !root) return 'unrecognised';
  const drawing = Number(/\/ChalkbondDrawing\s+(\d+)\s+0\s+R\b/.exec(dict)?.[1] ?? -1);
  const table = tableOf(pdf, x + 5, t, x, drawing);
  if (!table) return 'unrecognised';
  return {
    x,
    size,
    root,
    drawing,
    drawingAt: table.at,
    info: /\/Info\s+(\d+\s+\d+\s+R)\b/.exec(dict)?.[1] ?? '',
    id: /\/ID\s*(\[\s*<[\da-fA-F]*>\s*<[\da-fA-F]*>\s*\])/.exec(dict)?.[1] ?? '',
  };
}

/** Writes the ASCII `text` into `out` at `i`; returns the index after it. */
function put(out: Uint8Array, i: number, text: string): number {
  for (let k = 0; k < text.length; k++) out[i + k] = text.charCodeAt(k);
  return i + text.length;
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
  const head =
    lead + p.size + EMBEDDED_HEAD + '\n' + EMBEDDED_DICT + payload.length + ' >>\nstream\n';
  const end = '\nendstream\nendobj\n';
  const x = offset + head.length - lead.length + payload.length + end.length;
  if (offset > 9999999999) return { ok: false, reason: 'unrecognised' };
  const update =
    end +
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
  // The original bytes, copied once, then the appended update written straight into place.
  const result = new Uint8Array(pdf.length + head.length + payload.length + update.length);
  result.set(pdf);
  put(result, put(result, put(result, pdf.length, head), payload), update);
  return { ok: true, pdf: result };
}

export function readPdfDrawing(pdf: Uint8Array): string | null {
  const p = parse(pdf);
  if (typeof p === 'string' || p.drawingAt === undefined) return null;
  // PDF-A3 between the object's offset and the table (`x`): `n 0 obj`, the direct /Length,
  // `stream`, EOL, the payload, then only `endstream endobj` and whitespace.
  const end = p.x;
  let i = p.drawingAt;
  const number = String(p.drawing) + EMBEDDED_HEAD;
  if (!at(pdf, i, number, end)) return null;
  i = skipWs(pdf, i + number.length, end);
  if (!at(pdf, i, EMBEDDED_DICT, end)) return null;
  i += EMBEDDED_DICT.length;
  const digits = skipDigits(pdf, i, end);
  if (digits === i || !at(pdf, digits, ' >>', end)) return null;
  const length = Number(latin1(pdf, i, digits));
  i = skipWs(pdf, digits + 3, end);
  if (!at(pdf, i, 'stream', end)) return null;
  i += 6;
  if (pdf[i] === 13 && i < end) i++;
  if (!at(pdf, i, '\n', end)) return null;
  const start = i + 1;
  if (!Number.isSafeInteger(length) || length < 0 || length > end - start) return null;
  for (let k = start; k < start + length; k++) {
    const b = pdf[k] ?? 0;
    if (b < 0x20 || b > 0x7e) return null;
  }
  i = start + length;
  if (pdf[i] === 13 && i < end) i++;
  if (!at(pdf, i, '\n', end) || !at(pdf, i + 1, 'endstream', end)) return null;
  const after = i + 10;
  i = skipWs(pdf, after, end);
  if (i === after || !at(pdf, i, 'endobj', end)) return null;
  if (skipWs(pdf, i + 6, end) !== end) return null;
  return latin1(pdf, start, start + length);
}
