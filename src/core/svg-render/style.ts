// Style presets, override resolution and the derived constants of SPEC-svg-render.md "Style".
// `StyleSettings` itself stays in doc-model; its meaning is defined by the spec.
import type { Color, Doc, Point, StylePreset, StyleSettings } from '../doc-model';

/** Default colour of anything without a `color`. */
export const INK: Color = '#000000';

export const STYLE_PRESETS: Readonly<Record<StylePreset, StyleSettings>> = Object.freeze({
  slides: Object.freeze({
    bondLength: 40,
    lineWidth: 2,
    doubleBondSpacing: 0.18,
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: 24,
  }),
  journal: Object.freeze({
    bondLength: 14.4,
    lineWidth: 0.6,
    doubleBondSpacing: 0.18,
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: 10,
  }),
});

/**
 * How much longer a bond is drawn in structural mode (SPEC-svg-render.md Decision 16): the
 * document is drawn as if every coordinate were multiplied by this, the style unchanged.
 */
export const STRUCTURAL_SCALE = 2;

/** The settings plus every derived length (pt), per the spec table. */
export type ResolvedStyle = Readonly<
  StyleSettings & {
    doubleGap: number;
    boldWidth: number;
    wedgeWide: number;
    hashSpacing: number;
    dashOn: number;
    dashOff: number;
    labelMargin: number;
    wavyAmplitude: number;
    wavyLength: number;
    arrowHeadLength: number;
    arrowHeadHalfWidth: number;
    equilibriumGap: number;
    noGoHalf: number;
    plusArm: number;
    curvedGap: number;
    circleRatio: number;
    bracketSerif: number;
    roundBulge: number;
    curlyDepth: number;
    captionGap: number;
    calloutPad: number;
    cornerGap: number;
    subScale: number;
    subShift: number;
    supShift: number;
    satelliteScale: number;
    satelliteGap: number;
    dotRadius: number;
    pairSeparation: number;
    capHeight: number;
    lineHeight: number;
    /**
     * pt per BLU, the only factor that turns document coordinates into pt: `bondLength` itself
     * when the document is skeletal, `STRUCTURAL_SCALE * bondLength` when `style.formula` is
     * `'structural'`. No other field reads it or the formula.
     */
    ptPerBlu: number;
  }
>;

const RANGES = {
  bondLength: [4, 400],
  lineWidth: [0.05, 20],
  doubleBondSpacing: [0.05, 0.5],
  fontSize: [2, 200],
} as const;

const MAX_FAMILY_LENGTH = 200;

/**
 * Reduces a font-family list to `A-Z a-z 0-9`, space, `,`, `-`, `_` (quotes and every markup or
 * CSS-significant character removed), at most 200 characters, trimmed. `null` when nothing is left.
 */
export function sanitizeFontFamily(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/[^A-Za-z0-9 ,_-]/g, '')
    .slice(0, MAX_FAMILY_LENGTH)
    .trim();
  return cleaned === '' ? null : cleaned;
}

function pickNumber(value: unknown, key: keyof typeof RANGES, fallback: number): number {
  const [min, max] = RANGES[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback;
}

/** Merges the preset and the overrides; an illegal override is ignored, never an error. */
export function resolveStyle(style: Doc['style']): ResolvedStyle {
  const base = Object.hasOwn(STYLE_PRESETS, style.preset)
    ? STYLE_PRESETS[style.preset]
    : STYLE_PRESETS.slides;
  const o: Partial<Record<keyof StyleSettings, unknown>> = style.overrides ?? {};
  const bondLength = pickNumber(o.bondLength, 'bondLength', base.bondLength);
  const lineWidth = pickNumber(o.lineWidth, 'lineWidth', base.lineWidth);
  const doubleBondSpacing = pickNumber(
    o.doubleBondSpacing,
    'doubleBondSpacing',
    base.doubleBondSpacing,
  );
  const fontSize = pickNumber(o.fontSize, 'fontSize', base.fontSize);
  const fontFamily = sanitizeFontFamily(o.fontFamily) ?? base.fontFamily;
  const L = bondLength;
  const fs = fontSize;
  return Object.freeze({
    bondLength,
    lineWidth,
    doubleBondSpacing,
    fontFamily,
    fontSize,
    doubleGap: doubleBondSpacing * L,
    boldWidth: 0.14 * L,
    wedgeWide: 0.14 * L,
    hashSpacing: 0.17 * L,
    dashOn: 0.25 * L,
    dashOff: 0.15 * L,
    labelMargin: 0.11 * L,
    wavyAmplitude: 0.07 * L,
    wavyLength: 0.2 * L,
    arrowHeadLength: 0.22 * L,
    arrowHeadHalfWidth: 0.09 * L,
    equilibriumGap: 0.12 * L,
    noGoHalf: 0.12 * L,
    plusArm: 0.15 * L,
    curvedGap: 0.08 * L,
    circleRatio: 0.65,
    bracketSerif: 0.2 * L,
    roundBulge: 0.12 * L,
    curlyDepth: 0.2 * L,
    captionGap: 0.5 * L,
    calloutPad: 0.2 * fs,
    cornerGap: 0.15 * fs,
    subScale: 0.7,
    subShift: 0.2 * fs,
    supShift: 0.4 * fs,
    satelliteScale: 0.7,
    satelliteGap: 0.1 * fs,
    dotRadius: 0.05 * fs,
    pairSeparation: 0.24 * fs,
    capHeight: 0.716 * fs,
    lineHeight: 1.2 * fs,
    ptPerBlu: style.formula === 'structural' ? STRUCTURAL_SCALE * bondLength : bondLength,
  });
}

/** Document BLU to SVG pt (`ptPerBlu` per BLU). */
export function bluToPt(p: Point, style: ResolvedStyle): Point {
  return { x: p.x * style.ptPerBlu, y: p.y * style.ptPerBlu };
}

/** SVG pt back to document BLU. */
export function ptToBlu(p: Point, style: ResolvedStyle): Point {
  return { x: p.x / style.ptPerBlu, y: p.y / style.ptPerBlu };
}
