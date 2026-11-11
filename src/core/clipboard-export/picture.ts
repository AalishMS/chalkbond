import { MAX_FILE_BYTES, type Doc, type Selection } from '../doc-model';
import { renderSvg, type SvgDocument } from '../svg-render';
import { drawingPayload, pictureDoc, pictureSelection } from './payload';
export const RASTER_LIMITS = { maxSide: 10000, maxPixels: 50_000_000 } as const;
export function exportSvg(
  doc: Doc,
  selection: Selection | null,
  opts?: { embed?: boolean },
): SvgDocument {
  const payload = drawingPayload(pictureDoc(doc, selection));
  return renderSvg(doc, {
    ...(selection ? { only: pictureSelection(doc, selection) } : {}),
    padding: 0,
    ...(opts?.embed !== false && payload.length <= MAX_FILE_BYTES ? { metadata: payload } : {}),
  });
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
