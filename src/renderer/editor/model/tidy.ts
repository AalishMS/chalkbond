// Tidy reaction (SPEC-editor.md TR1-TR6): lays the molecules, plus signs, arrows and free texts of
// the scope out as one reaction line. `planTidy` measures the document (render `extents`) and
// returns the plan as plain data; `applyTidy` carries it out with the draft-aware doc-model ops,
// so the same plan makes the ghost-free commit inside `transact`. Idempotent: the plan of a
// tidied document moves nothing.
import {
  translation,
  transformItems,
  updateObject,
  type ArrowObject,
  type AtomId,
  type Doc,
  type ObjectId,
  type Point,
  type Selection,
  type TextObject,
} from '@core/doc-model';
import { render, type ItemKey, type Scene } from '@core/svg-render';
import { conditionAt, sideOf } from './conditions';
import { distToSegment, type Rect } from './geometry';
import { itemBoxes } from './move';
import { expandSelection, isEmptySelection } from './selection';
import type { Slot } from './text-ops';

/** TR3: the shortest arrow, in BLU. */
export const TIDY_MIN_ARROW = 2.5;
/** TR3: the room an arrow keeps beyond its widest condition text, in BLU. */
export const TIDY_ARROW_PAD = 0.6;
/** TR3: a free text whose centre is this close to a shaft (BLU) becomes its condition. */
export const TIDY_ATTACH_REACH = 1.0;
/** TR1: with no selection, the band around the arrows' midpoints, in BLU. */
export const TIDY_BAND = 1.5;
/** Changes smaller than this (BLU) are float noise: a tidied document plans nothing. */
export const TIDY_EPS = 1e-9;

/** TR5: the gap between neighbours, and next to a plus sign, in BLU. */
export const TIDY_GAP = 0.6;
export const TIDY_PLUS_GAP = 0.4;

/** What TR1-TR6 decided; applied by `applyTidy`. All positions are BLU. */
export interface TidyPlan {
  /** Arrows made horizontal: their new ends. */
  readonly arrows: readonly { id: ObjectId; from: Point; to: Point }[];
  /** Free texts that became conditions. */
  readonly attach: readonly { id: ObjectId; arrow: ObjectId; slot: Slot }[];
  /** Items moved, by the translation of their ink box. */
  readonly moves: readonly {
    atoms: readonly AtomId[];
    objects: readonly ObjectId[];
    dx: number;
    dy: number;
  }[];
  /** The condition texts' places by T3, once everything else is where it goes. */
  readonly conditions: readonly { id: ObjectId; at: Point }[];
}

type RowItem =
  | { readonly kind: 'fragment'; readonly atoms: readonly AtomId[]; readonly ink: Rect }
  | { readonly kind: 'arrow' | 'plus' | 'text'; readonly id: ObjectId; readonly ink: Rect };

const inkBlu = (r: Rect, bl: number): Rect => ({
  x: r.x / bl,
  y: r.y / bl,
  w: r.w / bl,
  h: r.h / bl,
});
const centreY = (r: Rect): number => r.y + r.h / 2;
const centreX = (r: Rect): number => r.x + r.w / 2;

const objectInk = (scene: Scene, id: ObjectId): Rect | undefined =>
  scene.extents[`obj:${id}` as ItemKey];

/** TR1: the scope's arrows, or null when there are none. */
function arrowsIn(doc: Doc, sel: Selection): ArrowObject[] {
  const { objects } = expandSelection(doc, sel);
  return Object.values(doc.objects).filter(
    (o): o is ArrowObject => o.type === 'arrow' && (isEmptySelection(sel) || objects.has(o.id)),
  );
}

/** TR3: the arrow a free text `t` (BLU centre) belongs to as a condition, and which slot. */
function conditionFor(
  arrows: readonly ArrowObject[],
  centre: Point,
): { arrow: ObjectId; slot: Slot } | null {
  let best: { arrow: ObjectId; slot: Slot; d: number } | null = null;
  for (const a of arrows) {
    const sx = a.to.x - a.from.x;
    const sy = a.to.y - a.from.y;
    const len2 = sx * sx + sy * sy;
    if (len2 === 0) continue;
    const t = ((centre.x - a.from.x) * sx + (centre.y - a.from.y) * sy) / len2;
    if (t < 0 || t > 1) continue;
    const d = distToSegment(centre, a.from, a.to);
    if (d <= TIDY_ATTACH_REACH && (best === null || d < best.d)) {
      best = { arrow: a.id, slot: sideOf(a, centre), d };
    }
  }
  return best === null ? null : { arrow: best.arrow, slot: best.slot };
}

/** `doc` with the arrows horizontal at their new lengths and the texts attached (TR3). */
function arranged(doc: Doc, plan: Pick<TidyPlan, 'arrows' | 'attach'>): Doc {
  let next = doc;
  for (const a of plan.arrows) next = updateObject(next, a.id, { from: a.from, to: a.to });
  for (const t of plan.attach) {
    next = updateObject(next, t.id, {
      attachedTo: { arrow: t.arrow, slot: t.slot },
      align: 'center',
    });
  }
  return next;
}

/**
 * TR1-TR6 as a plan, or null when the scope has no arrow ("Nothing to tidy"). `sel` is the
 * selection (empty: everything near the arrows).
 */
export function planTidy(doc: Doc, sel: Selection): TidyPlan | null {
  const arrows = arrowsIn(doc, sel);
  if (arrows.length === 0) return null;
  const scene0 = render(doc);
  const bl = scene0.style.bondLength;
  const whole = isEmptySelection(sel);
  const expanded = expandSelection(doc, sel);
  const arrowIds = new Set(arrows.map((a) => a.id));

  // TR1 band: the arrows' shaft midpoints, 1.5 BLU either way.
  const mids = arrows.map((a) => (a.from.y + a.to.y) / 2);
  const lo = Math.min(...mids) - TIDY_BAND;
  const hi = Math.max(...mids) + TIDY_BAND;
  const inBand = (ink: Rect | undefined): boolean => {
    if (ink === undefined) return false;
    const b = inkBlu(ink, bl);
    return b.y + b.h >= lo && b.y <= hi;
  };

  // TR3: conditions already attached to these arrows, and free texts that become conditions.
  const taken = new Set<string>();
  const conditionTexts = new Set<ObjectId>();
  for (const o of Object.values(doc.objects)) {
    if (o.type === 'text' && o.attachedTo !== undefined && arrowIds.has(o.attachedTo.arrow)) {
      conditionTexts.add(o.id);
      taken.add(`${o.attachedTo.arrow}:${o.attachedTo.slot}`);
    }
  }
  const attach: { id: ObjectId; arrow: ObjectId; slot: Slot }[] = [];
  for (const o of Object.values(doc.objects)) {
    if (o.type !== 'text' || o.attachedTo !== undefined) continue;
    if (!(whole ? inBand(objectInk(scene0, o.id)) : expanded.objects.has(o.id))) continue;
    const ink = objectInk(scene0, o.id);
    if (ink === undefined) continue;
    const b = inkBlu(ink, bl);
    const found = conditionFor(arrows, { x: centreX(b), y: centreY(b) });
    if (found === null || taken.has(`${found.arrow}:${found.slot}`)) continue;
    taken.add(`${found.arrow}:${found.slot}`);
    attach.push({ id: o.id, arrow: found.arrow, slot: found.slot });
    conditionTexts.add(o.id);
  }

  // TR3: horizontal arrows, keeping their sense, long enough for their widest condition.
  const widest = new Map<ObjectId, number>();
  for (const id of conditionTexts) {
    const text = doc.objects[id] as TextObject;
    const arrow = text.attachedTo?.arrow ?? attach.find((t) => t.id === id)?.arrow;
    const ink = objectInk(scene0, id);
    if (arrow === undefined || ink === undefined) continue;
    widest.set(arrow, Math.max(widest.get(arrow) ?? 0, ink.w / bl));
  }
  const plannedArrows = arrows.map((a) => {
    const length = Math.max(TIDY_MIN_ARROW, (widest.get(a.id) ?? 0) + TIDY_ARROW_PAD);
    const sense = a.to.x >= a.from.x ? 1 : -1;
    const mid = { x: (a.from.x + a.to.x) / 2, y: (a.from.y + a.to.y) / 2 };
    return {
      id: a.id,
      from: { x: mid.x - (sense * length) / 2 + 0, y: mid.y + 0 },
      to: { x: mid.x + (sense * length) / 2 + 0, y: mid.y + 0 },
    };
  });
  // An arrow that is already there is not touched (a second tidy plans nothing).
  const changedArrows = plannedArrows.filter((a) => {
    const old = doc.objects[a.id] as ArrowObject;
    return (
      Math.abs(old.from.x - a.from.x) > TIDY_EPS ||
      Math.abs(old.from.y - a.from.y) > TIDY_EPS ||
      Math.abs(old.to.x - a.to.x) > TIDY_EPS ||
      Math.abs(old.to.y - a.to.y) > TIDY_EPS
    );
  });
  const arrangedDoc = arranged(doc, { arrows: changedArrows, attach });
  const scene1 = render(arrangedDoc);

  // The row: fragments, arrows, plus signs and free texts of the scope, by ink box.
  const row: RowItem[] = [];
  for (const item of itemBoxes(arrangedDoc, scene1)) {
    const ink = inkBlu(item.box, bl);
    if (item.object === undefined) {
      const inScope = whole ? inBand(item.box) : item.atoms.some((id) => expanded.atoms.has(id));
      if (inScope) row.push({ kind: 'fragment', atoms: item.atoms, ink });
      continue;
    }
    const obj = arrangedDoc.objects[item.object];
    if (obj === undefined) continue;
    if (obj.type === 'arrow' && arrowIds.has(obj.id)) {
      row.push({ kind: 'arrow', id: obj.id, ink });
    } else if (obj.type === 'plus' || (obj.type === 'text' && obj.attachedTo === undefined)) {
      const inScope = whole ? inBand(item.box) : expanded.objects.has(obj.id);
      if (inScope) row.push({ kind: obj.type, id: obj.id, ink });
    }
  }

  // TR2: left to right. TR4: the baseline is the first item's centre line (an arrow's shaft).
  row.sort((a, b) => centreX(a.ink) - centreX(b.ink));
  const shaftY = (id: ObjectId): number => plannedArrows.find((a) => a.id === id)?.from.y ?? 0;
  const lineOf = (item: RowItem): number =>
    item.kind === 'arrow' ? shaftY(item.id) : centreY(item.ink);
  const first = row[0];
  const baseline = first === undefined ? 0 : lineOf(first);

  // TR5: 0.6 BLU between neighbours, 0.4 either side of a plus; the first item stays.
  const moves: TidyPlan['moves'][number][] = [];
  let right = first === undefined ? 0 : first.ink.x + first.ink.w;
  row.forEach((item, i) => {
    if (i === 0) return;
    const prev = row[i - 1] as RowItem;
    const gap = prev.kind === 'plus' || item.kind === 'plus' ? TIDY_PLUS_GAP : TIDY_GAP;
    const dx = right + gap - item.ink.x;
    const dy = baseline - lineOf(item);
    right += gap + item.ink.w;
    if (Math.abs(dx) <= TIDY_EPS && Math.abs(dy) <= TIDY_EPS) return;
    moves.push(
      item.kind === 'fragment'
        ? { atoms: item.atoms, objects: [], dx, dy }
        : { atoms: [], objects: [item.id], dx, dy },
    );
  });

  // TR6: the conditions go where T3 puts them, with everything else in place.
  const base: Pick<TidyPlan, 'arrows' | 'attach' | 'moves'> = {
    arrows: changedArrows,
    attach,
    moves,
  };
  const placed = moved(arranged(doc, base), base.moves);
  const conditions: TidyPlan['conditions'][number][] = [];
  for (const id of conditionTexts) {
    const at = conditionAt(placed, id);
    const old = (doc.objects[id] as TextObject).at;
    if (at !== null && (Math.abs(at.x - old.x) > TIDY_EPS || Math.abs(at.y - old.y) > TIDY_EPS)) {
      conditions.push({ id, at });
    }
  }
  return { ...base, conditions };
}

/** `doc` with each planned item translated; bonds travel with their atoms. */
function moved(doc: Doc, moves: TidyPlan['moves']): Doc {
  let next = doc;
  for (const m of moves) {
    const atoms = new Set(m.atoms);
    const bonds = Object.values(next.bonds)
      .filter((b) => atoms.has(b.a1) && atoms.has(b.a2))
      .map((b) => b.id);
    const sel: Selection = { atoms, bonds: new Set(bonds), objects: new Set(m.objects) };
    next = transformItems(next, sel, translation(m.dx, m.dy));
  }
  return next;
}

/** TR1-TR6 carried out. Works on a draft inside `transact` as on a plain document. */
export function applyTidy(doc: Doc, plan: TidyPlan): Doc {
  let next = moved(arranged(doc, plan), plan.moves);
  for (const c of plan.conditions) next = updateObject(next, c.id, { at: c.at });
  return next;
}
