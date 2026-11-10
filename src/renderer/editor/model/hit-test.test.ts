import { createNameIndex, structureFromText } from '@core/chem-core';
import {
  addAtom,
  addBond,
  addObject,
  emptyDoc,
  insert,
  type AtomId,
  type Doc,
  type ObjectId as ObjectIdT,
} from '@core/doc-model';
import { render } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import { add, type Point } from './geometry';
import {
  ARROWS_ONLY,
  HIT_ALL,
  hitTest,
  hoverFilter,
  marqueeSelection,
  mergeTarget,
  type Hit,
} from './hit-test';
import { bluToScreen, type Viewport } from './viewport';

const BL = 40;
const ZOOMS = [0.25, 1.5, 8] as const;
const viewport = (zoom: number): Viewport => ({
  zoom,
  pan: { x: 300, y: 200 },
  size: { w: 1200, h: 700 },
});
const screenOf = (v: Viewport, p: Point): Point => bluToScreen(v, p, BL);
const at = (hit: Hit | null): string =>
  hit === null ? 'none' : hit.kind === 'atom' || hit.kind === 'bond' ? hit.id : hit.kind;

const NOW = '2026-01-01T00:00:00.000Z';
const empty = (): Doc => emptyDoc(NOW);

/** Two carbons 10 BLU apart, bonded: a long bond at every zoom. */
function longBond(): { doc: Doc; a: AtomId; b: AtomId } {
  const [d1, a] = addAtom(empty(), { element: 'C', x: 0, y: 0 });
  const [d2, b] = addAtom(d1, { element: 'C', x: 10, y: 0 });
  return { doc: addBond(d2, a, b)[0], a, b };
}

const hit = (doc: Doc, v: Viewport, p: Point, filter = HIT_ALL): Hit | null =>
  hitTest(doc, render(doc), v, p, filter);

describe('H1 atoms and bonds, tolerances in screen px at every zoom', () => {
  for (const zoom of ZOOMS) {
    const v = viewport(zoom);
    const { doc, a, b } = longBond();
    const pa = screenOf(v, { x: 0, y: 0 });
    const pb = screenOf(v, { x: 10, y: 0 });
    const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };

    it(`atom within 10 px hits, 11 px misses (zoom ${zoom})`, () => {
      expect(at(hit(doc, v, add(pa, { x: 0, y: 9.5 })))).toBe(a);
      expect(hit(doc, v, add(pb, { x: 0, y: 11 }))).toBeNull();
      expect(at(hit(doc, v, add(pb, { x: 9.5, y: 0 })))).toBe(b);
    });

    it(`bond at 5 px hits, at 7 px misses (zoom ${zoom})`, () => {
      expect(hit(doc, v, add(mid, { x: 0, y: 5 }))?.kind).toBe('bond');
      expect(hit(doc, v, add(mid, { x: 0, y: 7 }))).toBeNull();
    });

    it(`an atom within 10 px wins over a bond within 6 px (zoom ${zoom})`, () => {
      // 8 px along the bond from the vertex and 4 px off it: both in range.
      const p = add(pa, { x: 8, y: 4 });
      expect(at(hit(doc, v, p))).toBe(a);
    });
  }
});

describe('H1 a labelled atom is hit inside its extents grown 4 px', () => {
  const names = createNameIndex({
    format: 'chalkbond-compounds',
    version: 1,
    source: 'test',
    entries: [{ name: 'ethanol', synonyms: [], smiles: 'CCO', formula: 'C2H6O', mw: 46.07 }],
  });
  const r = structureFromText('ethanol', names);
  if (!r.ok) throw new Error('no ethanol');
  const doc = insert(empty(), r.value.sub, { x: 0, y: 0 })[0];
  const scene = render(doc);
  const oxygen = Object.values(doc.atoms).find((a) => a.element === 'O');
  if (!oxygen) throw new Error('no O');
  const box = scene.extents[`atom:${oxygen.id}`];
  if (!box) throw new Error('O has no extents');

  for (const zoom of [1.5, 8] as const) {
    const v = viewport(zoom);
    const k = zoom * (4 / 3);
    const left = { x: 300 + box.x * k, y: 200 + (box.y + box.h / 2) * k };
    it(`3 px outside the label box hits it, 5 px does not (zoom ${zoom})`, () => {
      // The label's left edge is more than 10 px from the vertex, so only the box can hit.
      const vertex = screenOf(v, oxygen);
      expect(vertex.x - left.x).toBeGreaterThan(14);
      expect(at(hitTest(doc, scene, v, add(left, { x: -3, y: 0 }), HIT_ALL))).toBe(oxygen.id);
      expect(hitTest(doc, scene, v, add(left, { x: -5, y: 0 }), HIT_ALL)).toBeNull();
    });
  }
});

describe('H2 priority and ties', () => {
  it('a straight arrow beats a plus; text beats an arrow', () => {
    const v = viewport(1.5);
    const [d1, plus] = addObject(empty(), { type: 'plus', at: { x: 5, y: 0 } });
    const [d2, arrow] = addObject(d1, {
      type: 'arrow',
      kind: 'forward',
      from: { x: 3, y: 0 },
      to: { x: 7, y: 0 },
    });
    const p = screenOf(v, { x: 5, y: 0 });
    expect(hit(d1, v, p)).toEqual({ kind: 'object', id: plus, type: 'plus' });
    expect(hit(d2, v, p)).toEqual({ kind: 'object', id: arrow, type: 'arrow' });
    const [d3, text] = addObject(d2, {
      type: 'text',
      at: { x: 5, y: 0 },
      runs: [{ text: 'H2O' }],
      align: 'center',
    });
    expect(hit(d3, v, p)).toEqual({ kind: 'object', id: text, type: 'text' });
  });

  it('a strongly bent curved arrow is hit along its drawn (cubic) curve, not a quadratic', () => {
    const v = viewport(1.5);
    // Chord 3 BLU, bend 2.6: the drawn curve's handles are square to the chord. At t = 0.2 it is at
    // (0.312, -2.496); the quadratic with the same bend is at (0.6, -2.496) there, ~22 px away.
    const [doc, curved] = addObject(empty(), {
      type: 'curved-arrow',
      head: 'full',
      from: { kind: 'point', p: { x: 0, y: 0 } },
      to: { kind: 'point', p: { x: 3, y: 0 } },
      bend: 2.6,
    });
    expect(hit(doc, v, screenOf(v, { x: 0.312, y: -2.496 }))).toEqual({
      kind: 'object',
      id: curved,
      type: 'curved-arrow',
    });
    expect(hit(doc, v, screenOf(v, { x: 0.6, y: -2.496 }))).toBeNull();
  });

  it('a curved arrow ranks below a straight one and above a plus', () => {
    const v = viewport(1.5);
    const [d1, plus] = addObject(empty(), { type: 'plus', at: { x: 5, y: -1 } });
    // The curve's midpoint is 1 BLU above the chord midpoint: where the plus is.
    const p = screenOf(v, { x: 5, y: -1 });
    expect(hit(d1, v, p)).toEqual({ kind: 'object', id: plus, type: 'plus' });
    const [d2, curved] = addObject(d1, {
      type: 'curved-arrow',
      head: 'full',
      from: { kind: 'point', p: { x: 3, y: 0 } },
      to: { kind: 'point', p: { x: 7, y: 0 } },
      bend: 0.5,
    });
    expect(hit(d2, v, p)).toEqual({ kind: 'object', id: curved, type: 'curved-arrow' });
    const [d3, arrow] = addObject(d2, {
      type: 'arrow',
      kind: 'forward',
      from: { x: 3, y: -1 },
      to: { x: 7, y: -1 },
    });
    expect(hit(d3, v, p)).toEqual({ kind: 'object', id: arrow, type: 'arrow' });
  });

  it('a bracket ranks below a plus and above a shape', () => {
    const v = viewport(1.5);
    const [d1, shape] = addObject(empty(), {
      type: 'shape',
      shape: 'rect',
      rect: { x: 0, y: -2, w: 10, h: 4 },
      stroke: '#000000',
      fillOpacity: 0.2,
    });
    const p = screenOf(v, { x: 5, y: 0 });
    expect(hit(d1, v, p)).toEqual({ kind: 'object', id: shape, type: 'shape' });
    const [d2, bracket] = addObject(d1, {
      type: 'bracket',
      shape: 'square',
      rect: { x: 1, y: -1, w: 8, h: 2 },
    });
    expect(hit(d2, v, p)).toEqual({ kind: 'object', id: bracket, type: 'bracket' });
    const [d3, plus] = addObject(d2, { type: 'plus', at: { x: 5, y: 0 } });
    expect(hit(d3, v, p)).toEqual({ kind: 'object', id: plus, type: 'plus' });
  });

  it('ties between coincident atoms go to the lower id', () => {
    const v = viewport(1.5);
    const [d1, first] = addAtom(empty(), { element: 'C', x: 2, y: 2 });
    const d2 = addAtom(d1, { element: 'C', x: 2, y: 2 })[0];
    expect(at(hit(d2, v, screenOf(v, { x: 2, y: 2 })))).toBe(first);
  });

  it('within a class the nearest wins, whatever the ids', () => {
    const v = viewport(1.5);
    const [d1] = addAtom(empty(), { element: 'C', x: 1, y: 0 });
    const [d2, near] = addAtom(d1, { element: 'C', x: 1.05, y: 0 });
    // Both are within 10 px of the point; the second is closer although its id is higher.
    expect(at(hit(d2, v, screenOf(v, { x: 1.05, y: 0 })))).toBe(near);
  });
});

describe('hit filters (HV1)', () => {
  const v = viewport(1.5);
  const { doc, a } = longBond();
  const [withArrow, arrow] = addObject(doc, {
    type: 'arrow',
    kind: 'forward',
    from: { x: 1, y: 1 },
    to: { x: 4, y: 1 },
  });
  const onAtom = screenOf(v, { x: 0, y: 0 });
  const onArrow = screenOf(v, { x: 2.5, y: 1 });

  it('the Select filter sees atoms, bonds and objects', () => {
    const f = hoverFilter('select');
    expect(at(hit(withArrow, v, onAtom, f))).toBe(a);
    expect(hit(withArrow, v, onArrow, f)).toEqual({
      kind: 'object',
      id: arrow,
      type: 'arrow',
    });
  });

  it('drawing tools see atoms and bonds only', () => {
    for (const tool of ['bond', 'chain', 'ring', 'atom', 'arrow', 'plus', 'curved'] as const) {
      const f = hoverFilter(tool);
      expect(hit(withArrow, v, onArrow, f)).toBeNull();
      expect(at(hit(withArrow, v, onAtom, f))).toBe(a);
    }
  });

  it('the Arrow tool click filter sees straight arrows only', () => {
    expect(hit(withArrow, v, onArrow, ARROWS_ONLY)).toEqual({
      kind: 'object',
      id: arrow,
      type: 'arrow',
    });
    expect(hit(withArrow, v, onAtom, ARROWS_ONLY)).toBeNull();
  });

  it('Erase sees everything it would erase', () => {
    const f = hoverFilter('erase');
    expect(hit(withArrow, v, onArrow, f)?.kind).toBe('object');
    expect(at(hit(withArrow, v, onAtom, f))).toBe(a);
  });

  it('Text sees texts and condition slots only (HV1, T1)', () => {
    const f = hoverFilter('text');
    expect(hit(withArrow, v, onAtom, f)).toBeNull();
    expect(hit(withArrow, v, onArrow, f)).toMatchObject({ kind: 'slot' });
    const [withText, text] = addObject(withArrow, {
      type: 'text',
      at: { x: 8, y: 3 },
      runs: [{ text: 'abc' }],
      align: 'center',
    });
    expect(hit(withText, v, screenOf(v, { x: 8, y: 3 }), f)).toEqual({
      kind: 'object',
      id: text,
      type: 'text',
    });
  });
});

describe('H3 merge target', () => {
  function pair(): { doc: Doc; moving: AtomId; other: AtomId } {
    const [d1, moving] = addAtom(empty(), { element: 'C', x: 0, y: 0 });
    const [d2, other] = addAtom(d1, { element: 'C', x: 3, y: 0 });
    return { doc: d2, moving, other };
  }

  it('is 12 px at low zoom: 0.3 BLU is only 4 px at 25 %', () => {
    const { doc, moving, other } = pair();
    const v = viewport(0.25);
    const p = screenOf(v, { x: 3, y: 0 });
    expect(mergeTarget(doc, v, add(p, { x: 11.5, y: 0 }), new Set([moving]))).toBe(other);
    expect(mergeTarget(doc, v, add(p, { x: 12.5, y: 0 }), new Set([moving]))).toBeNull();
  });

  it('is 0.3 BLU when that is larger: 128 px at 800 %', () => {
    const { doc, moving, other } = pair();
    const v = viewport(8);
    const p = screenOf(v, { x: 3, y: 0 });
    expect(mergeTarget(doc, v, add(p, { x: 120, y: 0 }), new Set([moving]))).toBe(other);
    expect(mergeTarget(doc, v, add(p, { x: 135, y: 0 }), new Set([moving]))).toBeNull();
  });

  it('excludes the atoms being moved and picks the nearest other atom', () => {
    const { doc, moving, other } = pair();
    const v = viewport(1.5);
    const onMoving = screenOf(v, { x: 0, y: 0 });
    expect(mergeTarget(doc, v, onMoving, new Set([moving]))).toBeNull();
    expect(mergeTarget(doc, v, onMoving, new Set([other]))).toBe(moving);
  });
});

describe('H4 marquee', () => {
  it('takes atoms inside, bonds only with both atoms inside, objects only when whole', () => {
    const [d1, a] = addAtom(empty(), { element: 'C', x: 0, y: 0 });
    const [d2, b] = addAtom(d1, { element: 'C', x: 1, y: 0 });
    const [d3, c] = addAtom(d2, { element: 'C', x: 5, y: 0 });
    const [d4, ab] = addBond(d3, a, b);
    const [d5, bc] = addBond(d4, b, c);
    const [d6, arrow] = addObject(d5, {
      type: 'arrow',
      kind: 'forward',
      from: { x: 0, y: 2 },
      to: { x: 2, y: 2 },
    });
    const [d7, plus] = addObject(d6, { type: 'plus', at: { x: 4, y: 2 } });
    const scene = render(d7);
    const sel = marqueeSelection(d7, scene, { x: -1, y: -1, w: 3.5, h: 4 });
    expect([...sel.atoms].sort()).toEqual([a, b].sort());
    expect([...sel.bonds]).toEqual([ab]);
    expect(sel.bonds.has(bc)).toBe(false);
    expect([...sel.objects]).toEqual([arrow]);
    expect(sel.objects.has(plus)).toBe(false);
    const part = marqueeSelection(d7, scene, { x: -1, y: -1, w: 3.5, h: 2.2 });
    expect(part.objects.size).toBe(0);
  });
});

describe('condition slots (T1)', () => {
  const arrowDoc = (): { doc: Doc; arrow: ObjectIdT } => {
    const [doc, arrow] = addObject(empty(), {
      type: 'arrow',
      kind: 'forward',
      from: { x: 0, y: 0 },
      to: { x: 4, y: 0 },
    });
    return { doc, arrow };
  };
  const slotAt = (doc: Doc, v: Viewport, p: Point): Hit | null =>
    hitTest(doc, render(doc), v, screenOf(v, p), hoverFilter('text'));

  it('shows the slot above for a pointer above the shaft, below for one below', () => {
    const { doc, arrow } = arrowDoc();
    for (const zoom of ZOOMS) {
      const v = viewport(zoom);
      expect(slotAt(doc, v, { x: 2, y: -0.8 })).toEqual({ kind: 'slot', arrow, slot: 'above' });
      expect(slotAt(doc, v, { x: 2, y: 0.8 })).toEqual({ kind: 'slot', arrow, slot: 'below' });
    }
  });

  it('only within 1.0 BLU of the shaft and between its ends', () => {
    const { doc } = arrowDoc();
    const v = viewport(1.5);
    expect(slotAt(doc, v, { x: 2, y: -1.2 })).toBeNull();
    expect(slotAt(doc, v, { x: -0.5, y: -0.3 })).toBeNull();
    expect(slotAt(doc, v, { x: 4.5, y: -0.3 })).toBeNull();
  });

  it('only the Text tool sees slots; a text in the way is hit first', () => {
    const { doc } = arrowDoc();
    const v = viewport(1.5);
    const p = screenOf(v, { x: 2, y: -0.8 });
    expect(hitTest(doc, render(doc), v, p, HIT_ALL)).toBeNull();
    expect(hitTest(doc, render(doc), v, p, ARROWS_ONLY)).toBeNull();
    const [withText, text] = addObject(doc, {
      type: 'text',
      at: { x: 2, y: -0.8 },
      runs: [{ text: 'heat' }],
      align: 'center',
    });
    expect(hitTest(withText, render(withText), v, p, hoverFilter('text'))).toEqual({
      kind: 'object',
      id: text,
      type: 'text',
    });
  });
});
