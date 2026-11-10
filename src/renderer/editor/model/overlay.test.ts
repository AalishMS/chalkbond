import { createNameIndex, structureFromText } from '@core/chem-core';
import {
  addAtom,
  addBond,
  addObject,
  emptyDoc,
  insert,
  type AtomId,
  type BondId,
  type Doc,
  type ObjectId,
} from '@core/doc-model';
import { curveControls, render } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import type { Hit } from './hit-test';
import {
  atomDrawsLabel,
  COUNT_BADGE_H,
  countBadge,
  overlayGroups,
  type OverlayShape,
} from './overlay';
import { bluToScreen, ptToScreen, type Viewport } from './viewport';

const BL = 40;
const NOW = '2026-01-01T00:00:00.000Z';
const v: Viewport = { zoom: 1.5, pan: { x: 200, y: 100 }, size: { w: 1200, h: 700 } };
const shapesOf = (hit: Hit | null, doc: Doc): readonly OverlayShape[] =>
  overlayGroups(hit, doc, render(doc), v).flatMap((g) => g.shapes);

function chainDoc(): { doc: Doc; a: AtomId; b: AtomId; bond: BondId } {
  const [d1, a] = addAtom(emptyDoc(NOW), { element: 'C', x: 0, y: 0 });
  const [d2, b] = addAtom(d1, { element: 'C', x: 1, y: 0 });
  const [doc, bond] = addBond(d2, a, b);
  return { doc, a, b, bond };
}

describe('hover shapes (Canvas appearance)', () => {
  it('has no group without a hover, or for a hit whose item is gone', () => {
    const { doc } = chainDoc();
    expect(overlayGroups(null, doc, render(doc), v)).toEqual([]);
    expect(shapesOf({ kind: 'atom', id: 'a99' as AtomId }, doc)).toEqual([]);
    expect(shapesOf({ kind: 'bond', id: 'b99' as BondId }, doc)).toEqual([]);
    expect(shapesOf({ kind: 'object', id: 'o99' as ObjectId, type: 'plus' }, doc)).toEqual([]);
  });

  it('one hover group', () => {
    const { doc, a } = chainDoc();
    const groups = overlayGroups({ kind: 'atom', id: a }, doc, render(doc), v);
    expect(groups.map((g) => g.kind)).toEqual(['hover']);
  });

  it('a skeleton vertex gets a circle of diameter 18 on the atom', () => {
    const { doc, a } = chainDoc();
    expect(shapesOf({ kind: 'atom', id: a }, doc)).toEqual([
      { kind: 'circle', c: bluToScreen(v, { x: 0, y: 0 }, BL), r: 9 },
    ]);
  });

  it('a labelled atom gets its extents box grown 2 px, radius 4, in the light hover-label group', () => {
    const names = createNameIndex({
      format: 'chalkbond-compounds',
      version: 1,
      source: 'test',
      entries: [{ name: 'ethanol', synonyms: [], smiles: 'CCO', formula: 'C2H6O', mw: 46.07 }],
    });
    const r = structureFromText('ethanol', names);
    if (!r.ok) throw new Error('no ethanol');
    const doc = insert(emptyDoc(NOW), r.value.sub, { x: 0, y: 0 })[0];
    const oxygen = Object.values(doc.atoms).find((x) => x.element === 'O');
    if (!oxygen) throw new Error('no O');
    const ink = render(doc).extents[`atom:${oxygen.id}`];
    if (!ink) throw new Error('no extents');
    const a = ptToScreen(v, { x: ink.x, y: ink.y });
    const b = ptToScreen(v, { x: ink.x + ink.w, y: ink.y + ink.h });
    const groups = overlayGroups({ kind: 'atom', id: oxygen.id }, doc, render(doc), v);
    expect(groups.map((g) => g.kind)).toEqual(['hover-label']);
    expect(groups[0]?.shapes).toEqual([
      {
        kind: 'box',
        rect: { x: a.x - 2, y: a.y - 2, w: b.x - a.x + 4, h: b.y - a.y + 4 },
        radius: 4,
      },
    ]);
    expect(atomDrawsLabel(render(doc), oxygen.id)).toBe(true);
  });

  it('a skeleton vertex does not draw a label', () => {
    const { doc, a } = chainDoc();
    expect(atomDrawsLabel(render(doc), a)).toBe(false);
  });

  it('a bond gets an 8 px band between its atoms', () => {
    const { doc, bond } = chainDoc();
    expect(shapesOf({ kind: 'bond', id: bond }, doc)).toEqual([
      {
        kind: 'band',
        from: bluToScreen(v, { x: 0, y: 0 }, BL),
        to: bluToScreen(v, { x: 1, y: 0 }, BL),
        width: 8,
      },
    ]);
  });

  it('a straight arrow gets an 8 px band along its path', () => {
    const [doc, id] = addObject(emptyDoc(NOW), {
      type: 'arrow',
      kind: 'forward',
      from: { x: 1, y: 1 },
      to: { x: 4, y: 1 },
    });
    expect(shapesOf({ kind: 'object', id, type: 'arrow' }, doc)).toEqual([
      {
        kind: 'band',
        from: bluToScreen(v, { x: 1, y: 1 }, BL),
        to: bluToScreen(v, { x: 4, y: 1 }, BL),
        width: 8,
      },
    ]);
  });

  it('a curved arrow gets a band along its drawn curve (svg-render curveControls)', () => {
    for (const bend of [0.5, 2.6]) {
      const [doc, id] = addObject(emptyDoc(NOW), {
        type: 'curved-arrow',
        head: 'full',
        from: { kind: 'point', p: { x: 0, y: 0 } },
        to: { kind: 'point', p: { x: 2, y: 0 } },
        bend,
      });
      const [shape] = shapesOf({ kind: 'object', id, type: 'curved-arrow' }, doc);
      expect(shape).toMatchObject({ kind: 'band', width: 8 });
      const from = bluToScreen(v, { x: 0, y: 0 }, BL);
      const to = bluToScreen(v, { x: 2, y: 0 }, BL);
      const [, c1, c2] = curveControls(from, to, bend);
      const controls = shape?.kind === 'band' ? shape.controls : undefined;
      expect(controls?.[0].x).toBeCloseTo(c1.x, 6);
      expect(controls?.[0].y).toBeCloseTo(c1.y, 6);
      expect(controls?.[1].x).toBeCloseTo(c2.x, 6);
      expect(controls?.[1].y).toBeCloseTo(c2.y, 6);
      // Travelling east, a positive bend bulges up: the handles are above the chord.
      expect(c1.y).toBeLessThan(from.y);
    }
  });

  it('a plus or a text gets its extents grown 3 px, radius 4', () => {
    const [d1, plus] = addObject(emptyDoc(NOW), { type: 'plus', at: { x: 2, y: 2 } });
    const [d2, text] = addObject(d1, {
      type: 'text',
      at: { x: 5, y: 5 },
      runs: [{ text: 'H2O' }],
      align: 'center',
    });
    const scene = render(d2);
    for (const [id, type] of [
      [plus, 'plus'],
      [text, 'text'],
    ] as const) {
      const ink = scene.extents[`obj:${id}`];
      if (!ink) throw new Error('no extents');
      const a = ptToScreen(v, { x: ink.x, y: ink.y });
      const b = ptToScreen(v, { x: ink.x + ink.w, y: ink.y + ink.h });
      expect(shapesOf({ kind: 'object', id, type }, d2)).toEqual([
        {
          kind: 'box',
          rect: { x: a.x - 3, y: a.y - 3, w: b.x - a.x + 6, h: b.y - a.y + 6 },
          radius: 4,
        },
      ]);
    }
  });
});

describe('chain count badge (R31)', () => {
  const canvas = { w: 800, h: 600 };

  it('puts its top left 14 px right of and below the pointer, 20 px high, 12 px of padding wide', () => {
    const b = countBadge({ x: 100, y: 200 }, '5', canvas);
    expect(b.rect).toEqual({ x: 114, y: 214, w: 19, h: COUNT_BADGE_H });
    expect(COUNT_BADGE_H).toBe(20);
    expect(b.text).toBe('5');
    expect(countBadge({ x: 100, y: 200 }, '12', canvas).rect.w).toBe(26);
  });

  it('flips to the left of the pointer when it would cross the right edge', () => {
    const r = countBadge({ x: 790, y: 200 }, '5', canvas).rect;
    expect(r.x).toBe(790 - 14 - 19);
    expect(r.y).toBe(214);
  });

  it('flips above the pointer when it would cross the bottom edge', () => {
    const r = countBadge({ x: 100, y: 590 }, '5', canvas).rect;
    expect(r.y).toBe(590 - 14 - 20);
    expect(r.x).toBe(114);
  });

  it('stays inside the canvas in both flips and when the canvas is tiny', () => {
    const r = countBadge({ x: 799, y: 599 }, '20', canvas).rect;
    expect(r.x + r.w).toBeLessThanOrEqual(800);
    expect(r.y + r.h).toBeLessThanOrEqual(600);
    const t = countBadge({ x: 5, y: 5 }, '20', { w: 10, h: 10 }).rect;
    expect(t.x).toBeGreaterThanOrEqual(0);
    expect(t.y).toBeGreaterThanOrEqual(0);
  });
});

describe('condition slot (T1)', () => {
  const arrow = (): { doc: Doc; id: ObjectId } => {
    const [doc, id] = addObject(emptyDoc(NOW), {
      type: 'arrow',
      kind: 'forward',
      from: { x: 0, y: 0 },
      to: { x: 4, y: 0 },
    });
    return { doc, id };
  };

  it('is a dashed rounded box 2 BLU wide above (or below) the shaft, in its own group', () => {
    const { doc, id } = arrow();
    const scene = render(doc);
    const k = v.zoom * (4 / 3);
    const above = overlayGroups({ kind: 'slot', arrow: id, slot: 'above' }, doc, scene, v);
    expect(above.map((g) => g.kind)).toEqual(['slot']);
    const shape = above[0]?.shapes[0];
    if (shape?.kind !== 'box') throw new Error('not a box');
    expect(shape.rect.w).toBeCloseTo(2 * BL * k, 6);
    expect(shape.rect.h).toBeCloseTo(scene.style.capHeight * k + 8, 6);
    const shaft = bluToScreen(v, { x: 2, y: 0 }, BL);
    expect(shape.rect.x + shape.rect.w / 2).toBeCloseTo(shaft.x, 3);
    expect(shape.rect.y + shape.rect.h).toBeLessThan(shaft.y);
    const below = overlayGroups({ kind: 'slot', arrow: id, slot: 'below' }, doc, scene, v);
    const lower = below[0]?.shapes[0];
    if (lower?.kind !== 'box') throw new Error('not a box');
    expect(lower.rect.y).toBeGreaterThan(shaft.y);
  });

  it('nothing for an arrow that is gone', () => {
    const { doc } = arrow();
    expect(
      overlayGroups({ kind: 'slot', arrow: 'o99' as ObjectId, slot: 'above' }, doc, render(doc), v),
    ).toEqual([]);
  });
});
