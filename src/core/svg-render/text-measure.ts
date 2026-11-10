// Deterministic text measurement from the committed advance-width table (no DOM, no font
// files). SPEC-svg-render.md "Text measurement". Internal: the editor reads text extents from
// `Scene.extents`, not from here.
import type { TextRun } from '../doc-model';
import { ADVANCE_BOLD, ADVANCE_REGULAR, UNITS_PER_EM } from './font-metrics';
import type { ResolvedStyle } from './style';

/** Width (1/1000 em) of any code point the table does not cover: Arial's digit width. */
export const FALLBACK_ADVANCE = 556;
/** Arial's descent, em. Applies only to runs containing a descending glyph. */
export const DESCENT_EM = 0.212;
const DESCENDING = new Set('gjpqyQ,;()[]{}|');

export interface UnmeasuredGlyphNotice {
  code: 'unmeasured-glyph';
  /** Deduplicated, sorted by code point. */
  chars: string;
}

/** One run (or the part of it on one line), positioned absolutely within its line. */
export interface MeasuredSegment {
  text: string;
  /** Left edge from the line start, pt. */
  x: number;
  width: number;
  /** Font size of this segment, pt (scaled for sub/superscripts). */
  fontSize: number;
  /** Baseline offset from the line's baseline, pt; positive is down. */
  dy: number;
  bold: boolean;
  italic: boolean;
  script?: 'sub' | 'sup';
}

export interface MeasuredLine {
  width: number;
  /** Box top above this line's baseline, pt (the baseline itself is always inside the box). */
  ascent: number;
  /** Box bottom below this line's baseline, pt (>= 0). */
  descent: number;
  /** This line's baseline below the first line's baseline, pt. */
  baseline: number;
  segments: MeasuredSegment[];
}

export interface TextMeasure {
  /** Widest line, pt. */
  width: number;
  /** First line's ascent above the first baseline, pt. */
  ascent: number;
  /** Last line's bottom below the first baseline, pt. */
  descent: number;
  lines: MeasuredLine[];
  notices: UnmeasuredGlyphNotice[];
}

/** Advance of one code point in 1/1000 em, and whether the table covers it. */
export function advanceWidth(cp: number, bold: boolean): { width: number; measured: boolean } {
  const width = (bold ? ADVANCE_BOLD : ADVANCE_REGULAR)[cp];
  return width === undefined
    ? { width: FALLBACK_ADVANCE, measured: false }
    : { width, measured: true };
}

/**
 * Measures runs of text at `fontSize` (default: the style's). `\n` inside a run starts a new
 * line (`lineHeight` apart). Sub/superscripts are scaled by `subScale` and shifted by
 * `subShift` / `supShift`, which extend the box. Italic uses the regular widths, bold italic the
 * bold ones; any uncovered code point is 0.556 em and reported in one `unmeasured-glyph` notice.
 */
export function measureRuns(
  runs: readonly TextRun[],
  style: ResolvedStyle,
  fontSize: number = style.fontSize,
): TextMeasure {
  const k = fontSize / style.fontSize;
  const cap = style.capHeight * k;
  const lineHeight = style.lineHeight * k;
  const missing = new Set<number>();

  const newLine = (index: number): MeasuredLine => ({
    width: 0,
    ascent: 0,
    descent: 0,
    baseline: index * lineHeight,
    segments: [],
  });
  let line = newLine(0);
  const lines: MeasuredLine[] = [line];

  for (const run of runs) {
    const bold = run.bold === true;
    const italic = run.italic === true;
    const script = run.script;
    const size = script ? fontSize * style.subScale : fontSize;
    const dy = script === 'sub' ? style.subShift * k : script === 'sup' ? -style.supShift * k : 0;
    run.text.split('\n').forEach((piece, i) => {
      if (i > 0) {
        line = newLine(lines.length);
        lines.push(line);
      }
      if (piece === '') return;
      let units = 0;
      for (const ch of piece) {
        const cp = ch.codePointAt(0) ?? 0;
        const { width, measured } = advanceWidth(cp, bold);
        units += width;
        if (!measured) missing.add(cp);
      }
      const width = (units * size) / UNITS_PER_EM;
      const descends = [...piece].some((ch) => DESCENDING.has(ch));
      line.segments.push({
        text: piece,
        x: line.width,
        width,
        fontSize: size,
        dy,
        bold,
        italic,
        ...(script ? { script } : {}),
      });
      line.width += width;
      line.ascent = Math.max(line.ascent, cap * (size / fontSize) - dy);
      line.descent = Math.max(line.descent, dy + (descends ? DESCENT_EM * size : 0));
    });
  }

  for (const line of lines) {
    if (line.segments.length === 0) line.ascent = cap;
  }
  const first = lines[0] ?? line;
  const chars = [...missing]
    .sort((a, b) => a - b)
    .map((cp) => String.fromCodePoint(cp))
    .join('');
  return {
    width: lines.reduce((max, l) => Math.max(max, l.width), 0),
    ascent: first.ascent,
    descent: line.baseline + line.descent,
    lines,
    notices: chars === '' ? [] : [{ code: 'unmeasured-glyph', chars }],
  };
}
