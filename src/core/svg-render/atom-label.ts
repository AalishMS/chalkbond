// Atom labels (SPEC-svg-render.md "Atoms and labels"): which atoms are labelled, the label text
// with its H part, isotope, charge and subscripts, which side it reads towards, the anchor and
// text boxes, the positioned `<text>` markup and the box bonds are clipped against.
// Chemistry stays in chem-core: the H count comes in as `AtomInfo.implicitH`.
import type { Atom, Point, Rect, TextRun } from '../doc-model';
import { growRect, normalize, segmentBoxInterval, unionAll } from './geom';
import { labelDisplay } from './label-display';
import { svgText } from './svg-write';
import type { ResolvedStyle } from './style';
import { INK } from './style';
import {
  DESCENT_EM,
  inkAscentEm,
  OVERHANG_EM,
  measureRuns,
  type UnmeasuredGlyphNotice,
} from './text-measure';

/** Neighbours within this much of straight up/down (|sx| <= 0.1) leave the order unchanged. */
const SIDE_DEAD_ZONE = 0.1;
const MINUS = '−';

export interface AtomLabelInput {
  readonly atom: Atom;
  /** `AtomInfo.implicitH`: 0 for labelled atoms. */
  readonly implicitH: number;
  /** Vectors from the atom to each of its neighbours (any length; zero vectors are ignored). */
  readonly neighbors: readonly Point[];
  /** The atom's position, pt. Must be finite (the caller skips an atom otherwise). */
  readonly position: Point;
  /**
   * Pt the formal-charge superscript is moved to the right (a lone pair or radical dot sits
   * between the symbol and the charge). Default 0.
   */
  readonly chargeShift?: number;
}

export interface AtomLabel {
  /** The runs in reading order. */
  readonly runs: readonly TextRun[];
  /** The runs as plain text. */
  readonly text: string;
  /** One `<text>` element per run, separated by `\n`. */
  readonly svg: string;
  /** The attachment glyph(s), `capHeight` tall, centred on the atom. */
  readonly anchorBox: Rect;
  /** Every glyph run, sub/superscripts included. */
  readonly textBox: Rect;
  /**
   * The element symbol's own glyphs, `capHeight` tall: lone pairs and radical dots sit round
   * this box. It is the anchor box, except for a typed label with no reversed form whose text
   * holds the element symbol (`HO` for oxygen: just the `O`).
   */
  readonly symbolBox: Rect;
  /**
   * The ink box: every glyph run in the font's full ascent/descent box (see
   * `MeasuredLine.inkAscent`), so nothing the browser draws, `δ` overshoot included, leaves it.
   * This is what extents use.
   */
  readonly inkBox: Rect;
  /**
   * Cap-height boxes of the label's glyphs other than the symbol and the formal charge (the H or
   * count part, isotope, `R1`-style tails): where a satellite must not sit.
   */
  readonly obstacles: readonly Rect[];
  /** Which sides of the symbol carry such text (satellite slots there are blocked). */
  readonly hPart: { readonly left: boolean; readonly right: boolean };
  /** Cap-height box of the formal-charge superscript, `null` without one. */
  readonly chargeBox: Rect | null;
  /**
   * The formal charge is not in the text: a bond leaves within 45 degrees of NE, where the
   * superscript would stand, so `layoutSatellites` places the sign as a satellite instead.
   */
  readonly chargeSatellite: boolean;
  readonly notices: UnmeasuredGlyphNotice[];
}

/** Labelled: not a plain skeleton carbon (any heteroatom, label, isotope, explicit H, no bonds). */
export function isLabelled(atom: Atom, bondCount: number): boolean {
  return (
    atom.element !== 'C' ||
    (atom.label !== undefined && atom.label !== '') ||
    atom.isotope !== undefined ||
    atom.explicitH !== undefined ||
    bondCount === 0
  );
}

/** Digits are subscripts; consecutive characters of the same kind form one run. */
function scriptedRuns(s: string): TextRun[] {
  const runs: TextRun[] = [];
  for (const piece of s.match(/\d+|\D+/g) ?? []) {
    runs.push(/^\d/.test(piece) ? { text: piece, script: 'sub' } : { text: piece });
  }
  return runs;
}

function hRuns(n: number): TextRun[] {
  return n > 0
    ? [{ text: 'H' }, ...(n > 1 ? [{ text: String(n), script: 'sub' as const }] : [])]
    : [];
}

/** Bare atoms read as formulas: H first for halogens and for O, S, Se with two or more H. */
function bareHydrogenFirst(element: string, n: number): boolean {
  return ['F', 'Cl', 'Br', 'I'].includes(element) || (['O', 'S', 'Se'].includes(element) && n >= 2);
}

/** Runs restricted to the characters `[from, to)` of their joined text. */
function sliceRuns(runs: readonly TextRun[], from: number, to: number): TextRun[] {
  const out: TextRun[] = [];
  let at = 0;
  for (const run of runs) {
    const a = Math.max(from - at, 0);
    const b = Math.min(to - at, run.text.length);
    if (b > a) out.push({ ...run, text: run.text.slice(a, b) });
    at += run.text.length;
  }
  return out;
}

/**
 * The element symbol's glyphs inside a typed label with no reversed form (`HO`, `H2N`-like
 * text): the first occurrence of the symbol not followed by a lower-case letter, located by the
 * measured width of the text before it. Anything else keeps the anchor box.
 */
function typedSymbolBox(
  anchor: readonly TextRun[],
  anchorBox: Rect,
  element: string,
  typed: boolean,
  style: ResolvedStyle,
): Rect {
  if (!typed) return anchorBox;
  const text = anchor.map((r) => r.text).join('');
  let at = text.indexOf(element);
  while (at >= 0 && /[a-z]/.test(text[at + element.length] ?? '')) {
    at = text.indexOf(element, at + 1);
  }
  if (at < 0 || text.length === element.length) return anchorBox;
  const before = measureRuns(sliceRuns(anchor, 0, at), style).width;
  const symbol = measureRuns(sliceRuns(anchor, at, at + element.length), style).width;
  return { ...anchorBox, x: anchorBox.x + before, w: symbol };
}

/** A ray this long from the atom reaches past any label part. */
const FAR = 1e6;

/**
 * Builds the label of a labelled atom. The formal charge stands in the text unless a bond's line
 * genuinely crosses the superscript's glyph box (nitro `O-` with the nitrogen up-right): then the
 * sign is left out and becomes a satellite.
 */
export function buildAtomLabel(input: AtomLabelInput, style: ResolvedStyle): AtomLabel {
  const label = buildLabel(input, style, false);
  const box = label.chargeBox;
  if (!box) return label;
  const { x, y } = input.position;
  const crossed = input.neighbors.some((v) => {
    const u = normalize(v);
    return u !== null && segmentBoxInterval({ x, y }, { x: x + u.x * FAR, y: y + u.y * FAR }, box);
  });
  return crossed ? buildLabel(input, style, true) : label;
}

function buildLabel(
  input: AtomLabelInput,
  style: ResolvedStyle,
  chargeAsSatellite: boolean,
): AtomLabel {
  const { atom, position } = input;
  const dirs = input.neighbors.flatMap((v) => normalize(v) ?? []);
  const bonded = input.neighbors.length > 0;
  const sx = dirs.reduce((sum, u) => sum + u.x, 0);
  const label = atom.label === undefined ? undefined : atom.label.replace(/[\r\n]+/g, ' ');
  const hasLabel = label !== undefined && label !== '';

  // Symbol: the label as typed (or reversed), else the element; hydrogen isotopes are D and T.
  let isotopeRuns: TextRun[] =
    atom.isotope === undefined ? [] : [{ text: String(atom.isotope), script: 'sup' }];
  let symbol = atom.element;
  if (!hasLabel && atom.element === 'H' && (atom.isotope === 2 || atom.isotope === 3)) {
    symbol = atom.isotope === 2 ? 'D' : 'T';
    isotopeRuns = [];
  }

  let typedLabel = false;
  let symbolBefore: TextRun[] = [];
  let anchor: TextRun[];
  let symbolAfter: TextRun[] = [];
  if (hasLabel) {
    const display = labelDisplay(label);
    if (!display) {
      typedLabel = true;
      anchor = scriptedRuns(label);
    } else if (bonded && sx > SIDE_DEAD_ZONE) {
      const cut = display.reversed.length - display.attach.length;
      symbolBefore = scriptedRuns(display.reversed.slice(0, cut));
      anchor = scriptedRuns(display.attach);
    } else {
      anchor = scriptedRuns(display.attach);
      symbolAfter = scriptedRuns(label.slice(display.attach.length));
    }
  } else {
    anchor = scriptedRuns(symbol);
  }

  // H part: only for non-label atoms.
  const n =
    !hasLabel && Number.isFinite(input.implicitH) ? Math.max(0, Math.floor(input.implicitH)) : 0;
  const hBefore = bonded ? sx > SIDE_DEAD_ZONE : bareHydrogenFirst(atom.element, n);
  const chargeSatellite = atom.charge !== 0 && chargeAsSatellite;
  const chargeRuns: TextRun[] =
    atom.charge === 0 || chargeSatellite
      ? []
      : [
          {
            text: `${Math.abs(atom.charge) > 1 ? String(Math.abs(atom.charge)) : ''}${atom.charge > 0 ? '+' : MINUS}`,
            script: 'sup',
          },
        ];

  const before = [...(hBefore ? hRuns(n) : []), ...isotopeRuns, ...symbolBefore];
  const after = [...symbolAfter, ...(hBefore ? [] : hRuns(n)), ...chargeRuns];
  const runs = [...before, ...anchor, ...after];
  const anchorFrom = before.length;
  const anchorTo = anchorFrom + anchor.length;

  const measure = measureRuns(runs, style);
  const segments = measure.lines[0]?.segments ?? [];
  const first = segments[anchorFrom];
  const last = segments[anchorTo - 1];
  const anchorStart = first ? first.x : 0;
  const anchorEnd = last ? last.x + last.width : measure.width;
  const originX = position.x - (anchorStart + anchorEnd) / 2;
  const baseline = position.y + style.capHeight / 2;
  const fill = atom.color ?? INK;

  const shift = input.chargeShift ?? 0;
  const chargeAt = chargeRuns.length > 0 ? runs.length - 1 : -1;
  /** Left edge of a segment, the charge moved by `chargeShift`. */
  const segX = (seg: (typeof segments)[number], i: number): number =>
    originX + seg.x + (i === chargeAt ? shift : 0);

  const svg = segments
    .map((seg, i) =>
      svgText(
        {
          x: segX(seg, i),
          y: baseline + seg.dy,
          'font-family': style.fontFamily,
          'font-size': seg.fontSize,
          'font-weight': seg.bold ? 'bold' : undefined,
          'font-style': seg.italic ? 'italic' : undefined,
          fill,
          stroke: 'none',
        },
        seg.text,
      ),
    )
    .join('\n');

  const anchorBox: Rect = {
    x: originX + anchorStart,
    y: position.y - style.capHeight / 2,
    w: anchorEnd - anchorStart,
    h: style.capHeight,
  };
  const symbolBox = typedSymbolBox(anchor, anchorBox, atom.element, typedLabel, style);

  // Cap-height box of each segment; the part of one that overlaps the symbol (a typed `HO`) is
  // cut away, leaving what lies beside it.
  const capBox = (seg: (typeof segments)[number], i: number): Rect => {
    const h = style.capHeight * (seg.fontSize / style.fontSize);
    return { x: segX(seg, i), y: baseline + seg.dy - h, w: seg.width, h };
  };
  const obstacles: Rect[] = [];
  segments.forEach((seg, i) => {
    if (i === chargeAt) return;
    const b = capBox(seg, i);
    const overlapsSymbol = b.x < symbolBox.x + symbolBox.w && symbolBox.x < b.x + b.w;
    if (!overlapsSymbol || b.y + b.h <= symbolBox.y || symbolBox.y + symbolBox.h <= b.y) {
      obstacles.push(b);
      return;
    }
    if (b.x < symbolBox.x) obstacles.push({ ...b, w: symbolBox.x - b.x });
    const right = symbolBox.x + symbolBox.w;
    if (b.x + b.w > right) obstacles.push({ ...b, x: right, w: b.x + b.w - right });
  });
  const centre = symbolBox.x + symbolBox.w / 2;
  const inkBox = unionAll(
    segments.map((seg, i) => ({
      x: segX(seg, i) - OVERHANG_EM * seg.fontSize,
      y: baseline + seg.dy - inkAscentEm(seg.bold) * seg.fontSize,
      w: seg.width + 2 * OVERHANG_EM * seg.fontSize,
      h: (inkAscentEm(seg.bold) + DESCENT_EM) * seg.fontSize,
    })),
  ) as Rect;
  const chargeSeg = segments[chargeAt];
  return {
    runs,
    text: runs.map((r) => r.text).join(''),
    svg,
    anchorBox,
    symbolBox,
    inkBox,
    obstacles,
    hPart: {
      left: obstacles.some((o) => o.x + o.w / 2 < centre),
      right: obstacles.some((o) => o.x + o.w / 2 > centre),
    },
    chargeBox: chargeSeg ? capBox(chargeSeg, chargeAt) : null,
    chargeSatellite,
    textBox: {
      x: originX,
      y: baseline - measure.ascent,
      w: measure.width + shift,
      h: measure.ascent + measure.descent,
    },
    notices: measure.notices,
  };
}

/**
 * The boxes a bond is clipped against, each grown by `labelMargin`: the anchor box and,
 * separately, every other part of the label (H, counts and subscripts, isotope, formal charge).
 * A bond ends at the farthest exit among the boxes its line actually intersects, so one passing
 * under a superscript or over a subscript is not shortened by it. No halo and no clip path:
 * geometry only.
 */
export function bondClipBoxes(label: AtomLabel, style: ResolvedStyle): readonly Rect[] {
  const parts = label.chargeBox ? [...label.obstacles, label.chargeBox] : label.obstacles;
  return [label.anchorBox, ...parts].map((b) => growRect(b, style.labelMargin));
}
