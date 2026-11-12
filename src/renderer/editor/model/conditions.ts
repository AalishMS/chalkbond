// Where the condition texts of an arrow sit (SPEC-editor.md T3): centred on the arrow's midpoint
// along the shaft, with a gap of 0.2 x bondLength between the ink of the arrow and the ink of the
// text, on the arrow's left side ("above") or the other ("below"). Placed from render `extents`:
// the arrow and the text are drawn alone in a scratch document, the text's ink is measured, and
// the text is shifted by the difference (ink moves with `at`, so one shift is exact).
import {
  addObject,
  emptyDoc,
  updateObject,
  type ArrowObject,
  type Doc,
  type ObjectId,
  type Point,
  type TextRun,
} from '@core/doc-model';
import { render, resolveStyle, type ItemKey } from '@core/svg-render';
import type { Rect } from './geometry';
import type { Slot } from './text-ops';

/** T3: the gap between the arrow's ink and the text's ink, in bond lengths. */
export const CONDITION_GAP = 0.2;

/** The runs of an empty text's stand-in: one line of capitals, for the slot overlay and the new box. */
export const NOMINAL_RUNS: readonly TextRun[] = [{ text: 'H' }];

const SCRATCH_TIME = '2000-01-01T00:00:00.000Z';

/** A plain copy of a (possibly draft) value. */
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * The unit vector pointing to the "above" side of an arrow: screen-up for a horizontal arrow,
 * else the left of its direction of travel (`y` points down).
 */
export function aboveNormal(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0 || Math.abs(dy) < 1e-9) return { x: 0, y: -1 };
  return { x: dy / len, y: -dx / len };
}

/** Which side of the arrow the point `p` (BLU) is on. */
export function sideOf(arrow: Pick<ArrowObject, 'from' | 'to'>, p: Point): Slot {
  const n = aboveNormal(arrow.from, arrow.to);
  const mid = { x: (arrow.from.x + arrow.to.x) / 2, y: (arrow.from.y + arrow.to.y) / 2 };
  return (p.x - mid.x) * n.x + (p.y - mid.y) * n.y >= 0 ? 'above' : 'below';
}

/** A scratch document with only this arrow and, optionally, a text; the ids are returned. */
function scratch(
  doc: Doc,
  arrow: ArrowObject,
  text: { at: Point; runs: readonly TextRun[]; align: 'left' | 'center' | 'right' } | null,
): { doc: Doc; arrow: ObjectId; text: ObjectId | null } {
  let d: Doc = { ...emptyDoc(SCRATCH_TIME), style: copy(doc.style) };
  const [d1, arrowId] = addObject(d, {
    type: 'arrow',
    kind: arrow.kind,
    from: copy(arrow.from),
    to: copy(arrow.to),
  });
  d = d1;
  if (text === null) return { doc: d, arrow: arrowId, text: null };
  const [d2, textId] = addObject(d, {
    type: 'text',
    at: text.at,
    runs: copy(text.runs),
    align: text.align,
  });
  return { doc: d2, arrow: arrowId, text: textId };
}

const rectOf = (scene: ReturnType<typeof render>, id: ObjectId): Rect | undefined =>
  scene.extents[`obj:${id}` as ItemKey];

export interface ConditionPlace {
  /** The `at` of the text, BLU. */
  readonly at: Point;
  /** The text's ink box once placed, pt. */
  readonly ink: Rect;
}

/**
 * T3: where a text with `runs`, centre aligned, goes in `slot` of `arrow` (BLU `at`, and the ink
 * box it will have). Null when the arrow is degenerate or the text draws nothing.
 */
export function placeCondition(
  doc: Doc,
  arrow: ArrowObject,
  slot: Slot,
  runs: readonly TextRun[],
): ConditionPlace | null {
  const style = resolveStyle(doc.style);
  // R54: positions are at ptPerBlu, but the gap and the text's offset from the arrow are the
  // style's (svg-render S2): `at` = midpoint + the pt offset / bondLength.
  const { bondLength: bl, ptPerBlu } = style;
  const dx = arrow.to.x - arrow.from.x;
  const dy = arrow.to.y - arrow.from.y;
  const len = Math.hypot(dx, dy);
  if (!(len > 0)) return null;
  const u = { x: dx / len, y: dy / len };
  const above = aboveNormal(arrow.from, arrow.to);
  const e = slot === 'above' ? above : { x: -above.x, y: -above.y };
  const mid = { x: (arrow.from.x + arrow.to.x) / 2, y: (arrow.from.y + arrow.to.y) / 2 };
  const midPt = { x: mid.x * ptPerBlu, y: mid.y * ptPerBlu };

  // Pass 1: place the text on the midpoint and render the arrow and the text.
  const s = scratch(doc, arrow, { at: mid, runs, align: 'center' });
  if (s.text === null) return null;
  const scene = render(s.doc);
  const arrowInk = rectOf(scene, s.arrow);
  const textInk = rectOf(scene, s.text);
  if (arrowInk === undefined || textInk === undefined) return null;

  // The farthest the arrow's ink reaches towards the text's side, along `e`.
  let reach: number;
  if (Math.abs(e.y) === 1 || Math.abs(e.x) === 1) {
    // Axis aligned: the ink box edge itself.
    const corners: Point[] = [
      { x: arrowInk.x, y: arrowInk.y },
      { x: arrowInk.x + arrowInk.w, y: arrowInk.y },
      { x: arrowInk.x, y: arrowInk.y + arrowInk.h },
      { x: arrowInk.x + arrowInk.w, y: arrowInk.y + arrowInk.h },
    ];
    reach = Math.max(...corners.map((c) => c.x * e.x + c.y * e.y));
  } else {
    // Tilted: the shaft's line plus the half thickness an arrow of this kind has lying flat.
    const flat = scratch(doc, { ...arrow, from: { x: 0, y: 0 }, to: { x: len, y: 0 } }, null);
    const flatInk = rectOf(render(flat.doc), flat.arrow);
    if (flatInk === undefined) return null;
    reach = midPt.x * e.x + midPt.y * e.y + flatInk.h / 2;
  }

  // The text's half extent towards the arrow, and its target centre (pt).
  const toward = (textInk.w / 2) * Math.abs(e.x) + (textInk.h / 2) * Math.abs(e.y);
  const along = midPt.x * u.x + midPt.y * u.y;
  const out = reach + CONDITION_GAP * bl + toward;
  const centre = { x: u.x * along + e.x * out, y: u.y * along + e.y * out };

  // Pass 2: shift by the difference between where the ink is and where it should be.
  const now = { x: textInk.x + textInk.w / 2, y: textInk.y + textInk.h / 2 };
  const at = { x: mid.x + (centre.x - now.x) / bl + 0, y: mid.y + (centre.y - now.y) / bl + 0 };
  if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) return null;
  return {
    at,
    ink: { x: centre.x - textInk.w / 2, y: centre.y - textInk.h / 2, w: textInk.w, h: textInk.h },
  };
}

/** The stored text `id`, attached to an arrow, and that arrow. */
function attachedPair(
  doc: Doc,
  id: ObjectId,
): { arrow: ArrowObject; slot: Slot; runs: readonly TextRun[] } | null {
  const text = doc.objects[id];
  if (text?.type !== 'text' || text.attachedTo === undefined) return null;
  const arrow = doc.objects[text.attachedTo.arrow];
  if (arrow?.type !== 'arrow') return null;
  return { arrow, slot: text.attachedTo.slot, runs: text.runs };
}

/** T3: where the attached text `id` goes, BLU; null when it is not attached to an arrow. */
export function conditionAt(doc: Doc, id: ObjectId): Point | null {
  const pair = attachedPair(doc, id);
  return pair === null ? null : (placeCondition(doc, pair.arrow, pair.slot, pair.runs)?.at ?? null);
}

/**
 * T3: `doc` with every text attached to one of `arrows` (all arrows when omitted) at its
 * condition position. Ids first: inside `transact` the document is a draft the ops change.
 */
export function placeConditions(doc: Doc, arrows?: ReadonlySet<ObjectId>): Doc {
  const ids = Object.values(doc.objects)
    .filter(
      (o) =>
        o.type === 'text' &&
        o.attachedTo !== undefined &&
        (arrows?.has(o.attachedTo.arrow) ?? true),
    )
    .map((o) => o.id);
  let next = doc;
  for (const id of ids) {
    const at = conditionAt(next, id);
    if (at !== null) next = updateObject(next, id, { at });
  }
  return next;
}
