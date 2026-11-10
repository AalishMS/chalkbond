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
/** Arial's ascent, em: the top of the box that is safe for every glyph (Greek, accents). */
export const ASCENT_EM = 0.905;
/**
 * Arial Bold's accented capitals (`À`, `Ý` ...) rise to 0.925 em, above the ascent line
 * (found by `e2e/font-calibration.spec.ts`), so bold runs are boxed this high.
 */
export const ASCENT_BOLD_EM = 0.925;
/** The ink-box ascent of a run, em. */
export const inkAscentEm = (bold: boolean): number => (bold ? ASCENT_BOLD_EM : ASCENT_EM);
/**
 * Side-bearing overhang, em: ink boxes grow by this much on each side of a run, because glyphs
 * such as `j` (left, 0.047 em) and `f` (right, 0.042 em bold) are drawn outside their advance
 * box. Measured against real Arial by `e2e/font-calibration.spec.ts`.
 */
export const OVERHANG_EM = 0.05;
/** Invisible in running text; the browser gives it no advance although the font has one. */
const SOFT_HYPHEN = 0xad;
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
  /**
   * Ink box top above this line's baseline, pt: the font's full ascent for every run (shifted by
   * its script), so no glyph, `δ` and its overshoot included, can poke out of it.
   */
  inkAscent: number;
  /** Ink box bottom below this line's baseline, pt: the font's full descent for every run. */
  inkDescent: number;
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
  /** First line's `inkAscent`. */
  inkAscent: number;
  /** Last line's `inkDescent` below the first baseline. */
  inkDescent: number;
  lines: MeasuredLine[];
  notices: UnmeasuredGlyphNotice[];
}

/** Advance of one code point in 1/1000 em, and whether the table covers it. */
export function advanceWidth(cp: number, bold: boolean): { width: number; measured: boolean } {
  if (cp === SOFT_HYPHEN) return { width: 0, measured: true };
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
    inkAscent: 0,
    inkDescent: 0,
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
      line.inkAscent = Math.max(line.inkAscent, inkAscentEm(bold) * size - dy);
      line.inkDescent = Math.max(line.inkDescent, DESCENT_EM * size + dy);
    });
  }

  for (const line of lines) {
    if (line.segments.length === 0) {
      line.ascent = cap;
      line.inkAscent = cap;
    }
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
    inkAscent: first.inkAscent,
    inkDescent: line.baseline + line.inkDescent,
    lines,
    notices: chars === '' ? [] : [{ code: 'unmeasured-glyph', chars }],
  };
}
