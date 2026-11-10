// The text-like objects (SPEC-svg-render.md "Objects"): free text, a caption under a structure and
// a callout with a leader line. Pure geometry in pt; the caller converts from BLU, resolves the
// targets and anchors, and checks that every coordinate is finite.
import type { Point, Rect, TextRun } from '../doc-model';
import { clipRange, type CurveEnd } from './curved-arrow';
import { pathD, strokeEl, type Drawn } from './draw';
import { dist, growRect, lerp, rectFromPoints, rectUnion } from './geom';
import { INK, type ResolvedStyle } from './style';
import { layoutText, layoutTextAt, type PlacedText, type TextAlign } from './text-layout';

/** A `text` object: the runs aligned on `at.x`, the first line vertically centred on `at.y`. */
export function layoutTextObject(
  runs: readonly TextRun[],
  align: TextAlign,
  at: Point,
  style: ResolvedStyle,
): PlacedText | null {
  return layoutTextAt(runs, style, align, at);
}

/**
 * A `caption`: every line centred horizontally on `target` (the union of the target atoms' ink
 * boxes), the top edge of the text box `captionGap` below it.
 */
export function layoutCaption(
  runs: readonly TextRun[],
  target: Rect,
  style: ResolvedStyle,
): PlacedText | null {
  return layoutText(runs, style, 'center', (size) => ({
    x: target.x + target.w / 2,
    y: target.y + target.h + style.captionGap + size.ascent,
  }));
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * A `callout`: the text box centred on `at`, and a leader line (no head) from the point of the
 * box grown by `calloutPad` that is nearest to the anchor, to the anchor, cut out of the anchor's
 * clip box. No leader when the anchor is inside the grown box or the cut leaves no length.
 */
export function layoutCallout(
  runs: readonly TextRun[],
  at: Point,
  anchor: CurveEnd,
  style: ResolvedStyle,
): Drawn | null {
  const text = layoutText(runs, style, 'center', (size) => ({
    x: at.x,
    y: at.y + (size.ascent - size.descent) / 2,
  }));
  if (!text) return null;
  const grown = growRect(text.box, style.calloutPad);
  const from: Point = {
    x: clamp(anchor.point.x, grown.x, grown.x + grown.w),
    y: clamp(anchor.point.y, grown.y, grown.y + grown.h),
  };
  const range = clipRange((t) => lerp(from, anchor.point, t), null, anchor.clip);
  const ends = range
    ? ([lerp(from, anchor.point, range[0]), lerp(from, anchor.point, range[1])] as const)
    : null;
  if (!ends || !(dist(ends[0], ends[1]) > 1e-9)) {
    return { svg: text.svg, ink: text.ink, notices: text.notices };
  }
  const leader = rectFromPoints(ends) as Rect;
  return {
    svg: [text.svg, strokeEl(pathD(ends, ['M']), INK, style)].join('\n'),
    ink: rectUnion(text.ink, growRect(leader, style.lineWidth / 2)),
    notices: text.notices,
  };
}
