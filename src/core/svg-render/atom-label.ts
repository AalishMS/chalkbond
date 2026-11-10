// Atom labels (SPEC-svg-render.md "Atoms and labels"): which atoms are labelled, the label text
// with its H part, isotope, charge and subscripts, which side it reads towards, the anchor and
// text boxes, the positioned `<text>` markup and the box bonds are clipped against.
// Chemistry stays in chem-core: the H count comes in as `AtomInfo.implicitH`.
import type { Atom, Point, Rect, TextRun } from '../doc-model';
import { growRect, normalize, rectUnion } from './geom';
import { labelDisplay } from './label-display';
import { svgText } from './svg-write';
import type { ResolvedStyle } from './style';
import { INK } from './style';
import { measureRuns, type UnmeasuredGlyphNotice } from './text-measure';

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

/** Builds the label of a labelled atom. */
export function buildAtomLabel(input: AtomLabelInput, style: ResolvedStyle): AtomLabel {
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

  let symbolBefore: TextRun[] = [];
  let anchor: TextRun[];
  let symbolAfter: TextRun[] = [];
  if (hasLabel) {
    const display = labelDisplay(label);
    if (!display) {
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
  const chargeRuns: TextRun[] =
    atom.charge === 0
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

  const svg = segments
    .map((seg) =>
      svgText(
        {
          x: originX + seg.x,
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

  return {
    runs,
    text: runs.map((r) => r.text).join(''),
    svg,
    anchorBox: {
      x: originX + anchorStart,
      y: position.y - style.capHeight / 2,
      w: anchorEnd - anchorStart,
      h: style.capHeight,
    },
    textBox: {
      x: originX,
      y: baseline - measure.ascent,
      w: measure.width,
      h: measure.ascent + measure.descent,
    },
    notices: measure.notices,
  };
}

/**
 * The box a bond leaving the atom along `direction` is clipped against: the anchor box, first
 * extended over the label text on the bond's side (so a bond leaving up-right on `NH2` does not
 * cross the `H2`), then grown by `labelMargin`. No halo and no clip path: geometry only.
 */
export function bondClipBox(label: AtomLabel, direction: Point, style: ResolvedStyle): Rect {
  const { anchorBox: a, textBox: t } = label;
  const u = normalize(direction);
  let box = a;
  if (u && Math.abs(u.x) > SIDE_DEAD_ZONE) {
    const side: Rect =
      u.x > 0
        ? { x: a.x + a.w, y: t.y, w: Math.max(0, t.x + t.w - a.x - a.w), h: t.h }
        : { x: t.x, y: t.y, w: Math.max(0, a.x - t.x), h: t.h };
    if (side.w > 0) box = rectUnion(a, side);
  }
  return growRect(box, style.labelMargin);
}
