import {
  addObject,
  emptyDoc,
  type ArrowKind,
  type ArrowObject,
  type Doc,
  type ObjectId,
  type Point,
  type TextObject,
} from '@core/doc-model';
import { render, type ItemKey } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import { aboveNormal, conditionAt, placeCondition, placeConditions, sideOf } from './conditions';
import type { Slot } from './text-ops';

const NOW = '2026-01-01T00:00:00.000Z';
const BL = 40;
const RUNS = [{ text: 'conc. H' }, { text: '2', script: 'sub' as const }, { text: 'SO4' }];

interface Scheme {
  doc: Doc;
  arrow: ObjectId;
  text: ObjectId;
}

/** An arrow and a text attached to it at `slot`, the text first at the wrong place. */
function scheme(
  from: Point,
  to: Point,
  slot: Slot,
  kind: ArrowKind = 'forward',
  runs: TextObject['runs'] = RUNS,
): Scheme {
  const [d1, arrow] = addObject(emptyDoc(NOW), { type: 'arrow', kind, from, to });
  const [doc, text] = addObject(d1, {
    type: 'text',
    at: { x: 9, y: 9 },
    runs,
    align: 'center',
    attachedTo: { arrow, slot },
  });
  return { doc, arrow, text };
}

const inkOf = (doc: Doc, id: ObjectId) => {
  const r = render(doc).extents[`obj:${id}` as ItemKey];
  if (r === undefined) throw new Error('no ink');
  return r;
};

/** `doc` with the attached text at its condition position. */
const placed = (s: Scheme): Doc => placeConditions(s.doc);

describe('T3 condition position', () => {
  it('above a horizontal arrow: ink bottom 0.2 bondLength above the arrow ink top, centred on the midpoint', () => {
    const s = scheme({ x: 1, y: 2 }, { x: 4, y: 2 }, 'above');
    const doc = placed(s);
    const text = inkOf(doc, s.text);
    const arrow = inkOf(doc, s.arrow);
    expect(arrow.y - (text.y + text.h)).toBeCloseTo(0.2 * BL, 2);
    expect(text.x + text.w / 2).toBeCloseTo(2.5 * BL, 2);
  });

  it('below: ink top 0.2 bondLength under the arrow ink bottom', () => {
    const s = scheme({ x: 1, y: 2 }, { x: 4, y: 2 }, 'below', 'forward', [{ text: 'heat' }]);
    const doc = placed(s);
    const text = inkOf(doc, s.text);
    const arrow = inkOf(doc, s.arrow);
    expect(text.y - (arrow.y + arrow.h)).toBeCloseTo(0.2 * BL, 2);
    expect(text.x + text.w / 2).toBeCloseTo(2.5 * BL, 2);
  });

  it('the gap is measured from the highest point of the ink, heads included (equilibrium)', () => {
    const s = scheme({ x: 0, y: 0 }, { x: 3, y: 0 }, 'above', 'equilibrium');
    const doc = placed(s);
    const text = inkOf(doc, s.text);
    const arrow = inkOf(doc, s.arrow);
    expect(arrow.y - (text.y + text.h)).toBeCloseTo(0.2 * BL, 2);
  });

  it('a leftward horizontal arrow still has its "above" above', () => {
    const s = scheme({ x: 4, y: 2 }, { x: 1, y: 2 }, 'above');
    const doc = placed(s);
    expect(inkOf(doc, s.text).y).toBeLessThan(inkOf(doc, s.arrow).y);
  });

  it('a 45 degree arrow: the text sits on the left normal of the travel direction, centred along the shaft', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 3, y: 3 };
    const s = scheme(from, to, 'above');
    const doc = placed(s);
    const text = inkOf(doc, s.text);
    const centre = { x: text.x + text.w / 2, y: text.y + text.h / 2 };
    const mid = { x: 1.5 * BL, y: 1.5 * BL };
    const n = aboveNormal(from, to);
    expect(n.x).toBeCloseTo(Math.SQRT1_2, 9);
    expect(n.y).toBeCloseTo(-Math.SQRT1_2, 9);
    const rel = { x: centre.x - mid.x, y: centre.y - mid.y };
    // No offset along the shaft; positive along the left normal.
    expect(rel.x * Math.SQRT1_2 + rel.y * Math.SQRT1_2).toBeCloseTo(0, 6);
    expect(rel.x * n.x + rel.y * n.y).toBeGreaterThan(0.2 * BL);
    // Clear of the shaft: the text's nearest corner is 0.2 bondLength + the arrow's half
    // thickness beyond the shaft's line.
    const reach = (text.w / 2) * Math.abs(n.x) + (text.h / 2) * Math.abs(n.y);
    expect(rel.x * n.x + rel.y * n.y - reach).toBeGreaterThanOrEqual(0.2 * BL - 1e-6);
  });

  it('below on a tilted arrow is the opposite side, same distance', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 3, y: 3 };
    const up = scheme(from, to, 'above');
    const down = scheme(from, to, 'below');
    const a = inkOf(placed(up), up.text);
    const b = inkOf(placed(down), down.text);
    const mid = { x: 1.5 * BL, y: 1.5 * BL };
    const offset = (r: { x: number; y: number; w: number; h: number }) => ({
      x: r.x + r.w / 2 - mid.x,
      y: r.y + r.h / 2 - mid.y,
    });
    expect(offset(a).x).toBeCloseTo(-offset(b).x, 6);
    expect(offset(a).y).toBeCloseTo(-offset(b).y, 6);
  });

  it('placement is stable: placing a placed text changes nothing', () => {
    const s = scheme({ x: 1, y: 2 }, { x: 4, y: 2 }, 'above');
    const once = placed(s);
    const at = (once.objects[s.text] as TextObject).at;
    const again = conditionAt(once, s.text);
    expect(again?.x).toBeCloseTo(at.x, 9);
    expect(again?.y).toBeCloseTo(at.y, 9);
  });

  it('conditionAt is null for a text that is not attached', () => {
    const [doc, id] = addObject(emptyDoc(NOW), {
      type: 'text',
      at: { x: 0, y: 0 },
      runs: [{ text: 'x' }],
      align: 'left',
    });
    expect(conditionAt(doc, id)).toBeNull();
  });

  it('placeCondition gives the ink box the text will have', () => {
    const arrow = scheme({ x: 0, y: 0 }, { x: 3, y: 0 }, 'above');
    const a = arrow.doc.objects[arrow.arrow] as ArrowObject;
    const p = placeCondition(arrow.doc, a, 'above', RUNS);
    const doc = placed(arrow);
    const ink = inkOf(doc, arrow.text);
    expect(p?.ink.y).toBeCloseTo(ink.y, 6);
    expect(p?.ink.x).toBeCloseTo(ink.x, 6);
    expect(p?.ink.w).toBeCloseTo(ink.w, 6);
  });

  it('sideOf: left of the travel direction is above; screen-up for a horizontal arrow', () => {
    const arrow = { from: { x: 0, y: 0 }, to: { x: 3, y: 0 } };
    expect(sideOf(arrow, { x: 1, y: -1 })).toBe('above');
    expect(sideOf(arrow, { x: 1, y: 1 })).toBe('below');
    const down = { from: { x: 0, y: 0 }, to: { x: 0, y: 3 } };
    expect(sideOf(down, { x: 1, y: 1 })).toBe('above');
    const left = { from: { x: 3, y: 0 }, to: { x: 0, y: 0 } };
    expect(sideOf(left, { x: 1, y: -1 })).toBe('above');
  });

  it('degenerate arrows and empty texts place nothing', () => {
    const s = scheme({ x: 1, y: 1 }, { x: 1, y: 1 }, 'above');
    expect(conditionAt(s.doc, s.text)).toBeNull();
    const t = scheme({ x: 0, y: 0 }, { x: 3, y: 0 }, 'above', 'forward', []);
    expect(conditionAt(t.doc, t.text)).toBeNull();
  });
});
