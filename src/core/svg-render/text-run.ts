// Single-line text runs placed at an absolute origin (left edge, baseline). The corner text of a
// bracket uses this; S10's text layout builds multi-line text on the same measurement.
import type { Point, Rect, TextRun } from '../doc-model';
import { unionAll } from './geom';
import { svgText } from './svg-write';
import { INK, type ResolvedStyle } from './style';
import { OVERHANG_EM, measureRuns, type UnmeasuredGlyphNotice } from './text-measure';

export interface PlacedRuns {
  /** One `<text>` element per run, separated by `\n`. */
  readonly svg: string;
  /** The text box: width x (ascent + descent), top = baseline - ascent. */
  readonly box: Rect;
  /** The ink box: width x the font's full ascent and descent (see `MeasuredLine.inkAscent`). */
  readonly ink: Rect;
  readonly notices: UnmeasuredGlyphNotice[];
}

/**
 * Places `runs` on one line with the left edge at `origin.x` and the first baseline at `origin.y`.
 * Line breaks inside a run become spaces. `null` when there is no text.
 */
export function placeRuns(
  runs: readonly TextRun[],
  style: ResolvedStyle,
  origin: Point,
): PlacedRuns | null {
  const flat = runs.map((r) => ({ ...r, text: r.text.replace(/[\r\n]+/g, ' ') }));
  const present = flat.filter((r) => r.text !== '');
  if (present.length === 0) return null;
  const m = measureRuns(present, style);
  const svg = (m.lines[0]?.segments ?? [])
    .map((seg, i) =>
      svgText(
        {
          x: origin.x + seg.x,
          y: origin.y + seg.dy,
          'font-family': style.fontFamily,
          'font-size': seg.fontSize,
          'font-weight': seg.bold ? 'bold' : undefined,
          'font-style': seg.italic ? 'italic' : undefined,
          fill: present[i]?.color ?? INK,
          stroke: 'none',
        },
        seg.text,
      ),
    )
    .join('\n');
  return {
    svg,
    box: { x: origin.x, y: origin.y - m.ascent, w: m.width, h: m.ascent + m.descent },
    ink: unionAll(
      (m.lines[0]?.segments ?? []).map((seg) => ({
        x: origin.x + seg.x - OVERHANG_EM * seg.fontSize,
        y: origin.y - m.inkAscent,
        w: seg.width + 2 * OVERHANG_EM * seg.fontSize,
        h: m.inkAscent + m.inkDescent,
      })),
    ) as Rect,
    notices: m.notices,
  };
}
