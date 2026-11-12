import { MAX_FILE_BYTES, type Doc, type Selection } from '../doc-model';
import { renderSvg, resolveStyle, type SvgDocument } from '../svg-render';
import { drawingPayload, pictureDoc, pictureSelection } from './payload';
export const RASTER_LIMITS = { maxSide: 10000, maxPixels: 50_000_000 } as const;
/**
 * Decision C9: the largest picture carrier (PNG, SVG, PDF file; clipboard PNG and SVG), in bytes.
 * The editable drawing inside stays at MAX_FILE_BYTES (what `parse` accepts).
 */
export const MAX_PICTURE_BYTES = 64 * 1024 * 1024;

/**
 * UTF-8 byte length of `s` as an encoder writes it: a surrogate pair is 4 bytes, a lone surrogate
 * 3 (U+FFFD). Stops counting once past `limit` (then returns some value above it).
 */
export function utf8ByteLength(s: string, limit = Infinity): number {
  let bytes = 0;
  for (let i = 0; i < s.length && bytes <= limit; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

const METADATA_OPEN = '\n<metadata id="chalkbond">';
const METADATA_CLOSE = '</metadata>\n';

/** The SVG without svg-render's `<metadata id="chalkbond">` line: the embed: false output. */
function withoutMetadata(svg: string): string {
  const start = svg.indexOf(METADATA_OPEN);
  if (start < 0) return svg;
  // The escaped content holds no `<`, so the first close tag after the start is its own.
  const end = svg.indexOf(METADATA_CLOSE, start);
  return svg.slice(0, start + 1) + svg.slice(end + METADATA_CLOSE.length);
}

/** R10: the clipboard bitmap's margin on each side, as a fraction of the bond length. */
export const CLIPBOARD_MARGIN = 0.25;

/** R10: the margin of the clipboard bitmap in pt (Slides 10, Handout 3.6). */
export function clipboardBitmapPadding(doc: Doc): number {
  return CLIPBOARD_MARGIN * resolveStyle(doc.style).bondLength;
}

/**
 * The picture SVG. `padding` (pt, default 0 = ink-tight) is used only for the clipboard bitmap's
 * source (R10). With `embed: false` the drawing payload is not computed at all (SC12: the
 * bitmap's second call must not serialise the document again).
 */
export function exportSvg(
  doc: Doc,
  selection: Selection | null,
  opts?: { embed?: boolean; padding?: number },
): SvgDocument {
  return exportSvgWithin(doc, selection, opts, {
    payload: MAX_FILE_BYTES,
    picture: MAX_PICTURE_BYTES,
  });
}

/**
 * `exportSvg` with its limits passed in (tests): one renderSvg; the payload is embedded when it is
 * at most `limits.payload` bytes, and its metadata element is removed again when the SVG would
 * then be over `limits.picture` UTF-8 bytes. A picture over the cap without metadata is returned
 * as it is: the write (C1, C4) refuses it.
 */
export function exportSvgWithin(
  doc: Doc,
  selection: Selection | null,
  opts: { embed?: boolean; padding?: number } | undefined,
  limits: { readonly payload: number; readonly picture: number },
): SvgDocument {
  const wantsEmbed = opts?.embed !== false;
  const payload = wantsEmbed ? drawingPayload(pictureDoc(doc, selection)) : '';
  const embed = wantsEmbed && payload.length <= limits.payload;
  const rendered = renderSvg(doc, {
    ...(selection ? { only: pictureSelection(doc, selection) } : {}),
    padding: opts?.padding ?? 0,
    ...(embed ? { metadata: payload } : {}),
  });
  if (!embed || utf8ByteLength(rendered.svg, limits.picture) <= limits.picture) return rendered;
  return { ...rendered, svg: withoutMetadata(rendered.svg) };
}
export function pngPixelSize(
  widthPt: number,
  heightPt: number,
  dpi: number,
): { width: number; height: number; dpi: number; reduced: boolean } {
  const size = (d: number) => ({
    width: Math.max(1, Math.ceil((widthPt * d) / 72)),
    height: Math.max(1, Math.ceil((heightPt * d) / 72)),
  });
  const fits = (d: number) => {
    const s = size(d);
    return s.width <= 10000 && s.height <= 10000 && s.width * s.height <= 50_000_000;
  };
  if (fits(dpi)) return { ...size(dpi), dpi, reduced: false };
  const upper = Math.min(dpi, 720000 / widthPt, 720000 / heightPt);
  let lo = 0,
    hi = Math.floor(upper);
  while (lo < hi) {
    const mid = lo + Math.ceil((hi - lo) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  if (lo === 0) {
    hi = Math.min(1, upper);
    for (let i = 0; i < 64; i++) {
      const mid: number = lo + (hi - lo) / 2;
      if (mid === lo || mid === hi) break;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
  }
  return { ...size(lo), dpi: lo, reduced: true };
}
export function groupDigits(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
