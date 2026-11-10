// Multi-line text layout (SPEC-svg-render.md "Objects", `text`): every run is its own `<text>` at
// an absolute x, y computed from the measurement table, so no renderer's inline layout is relied
// on. Used by the text, caption and callout objects. (`text-run.ts` is the single-line variant
// the bracket corner uses.)
import type { Point, Rect, TextRun } from '../doc-model';
import type { Drawn } from './draw';
import { rectUnion, unionAll } from './geom';
import { svgText } from './svg-write';
import { INK, type ResolvedStyle } from './style';
import { measureRuns, type UnmeasuredGlyphNotice } from './text-measure';

export type TextAlign = 'left' | 'center' | 'right';

/** Size of a measured block: widest line, first line's ascent, last line's bottom below the first baseline. */
export interface TextSize {
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
}

export interface PlacedText extends Drawn {
  /** The block's text box: widest line x (first ascent + last descent); contains `ink`. */
  readonly box: Rect;
  readonly notices: UnmeasuredGlyphNotice[];
}

/**
 * Lays `runs` out as lines (`\n` inside a run starts one). `place` receives the measured block and
 * returns the x that every line is aligned on and the first line's baseline y. `null` when there
 * is no text. `ink` is the union of the lines' boxes (no entry for blank lines).
 */
export function layoutText(
  runs: readonly TextRun[],
  style: ResolvedStyle,
  align: TextAlign,
  place: (size: TextSize) => Point,
): PlacedText | null {
  const present = runs.filter((r) => r.text !== '');
  if (present.length === 0) return null;
  const m = measureRuns(present, style);
  const anchor = place({ width: m.width, ascent: m.ascent, descent: m.descent });

  // Segments come out in run order, line by line: one colour per non-empty piece of each run.
  const colors = present.flatMap((run) =>
    run.text
      .split('\n')
      .filter((piece) => piece !== '')
      .map(() => run.color ?? INK),
  );

  const svg: string[] = [];
  const lineInk: Rect[] = [];
  const spans: Rect[] = [];
  let next = 0;
  for (const line of m.lines) {
    const x0 = anchor.x - (align === 'left' ? 0 : align === 'center' ? line.width / 2 : line.width);
    const baseline = anchor.y + line.baseline;
    for (const seg of line.segments) {
      svg.push(
        svgText(
          {
            x: x0 + seg.x,
            y: baseline + seg.dy,
            'font-family': style.fontFamily,
            'font-size': seg.fontSize,
            'font-weight': seg.bold ? 'bold' : undefined,
            'font-style': seg.italic ? 'italic' : undefined,
            fill: colors[next++] ?? INK,
            stroke: 'none',
          },
          seg.text,
        ),
      );
    }
    spans.push({ x: x0, y: anchor.y - m.ascent, w: line.width, h: 0 });
    if (line.segments.length > 0) {
      lineInk.push({
        x: x0,
        y: baseline - line.ascent,
        w: line.width,
        h: line.ascent + line.descent,
      });
    }
  }
  const ink = unionAll(lineInk);
  if (!ink) return null; // only line breaks
  const across = unionAll(spans) as Rect;
  return {
    svg: svg.join('\n'),
    ink,
    box: rectUnion(ink, {
      x: across.x,
      y: anchor.y - m.ascent,
      w: across.w,
      h: m.ascent + m.descent,
    }),
    notices: m.notices,
  };
}

/** The text with the first line's cap-height box vertically centred on `at.y`, aligned on `at.x`. */
export function layoutTextAt(
  runs: readonly TextRun[],
  style: ResolvedStyle,
  align: TextAlign,
  at: Point,
): PlacedText | null {
  return layoutText(runs, style, align, () => ({ x: at.x, y: at.y + style.capHeight / 2 }));
}
