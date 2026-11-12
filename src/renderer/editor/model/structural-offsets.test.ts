// N13 / R54 (svg-render S2, answered B): in structural mode an atom-anchor offset and the offset of
// a condition text from its arrow are drawn at the style's scale (`x bondLength`), not at
// `x ptPerBlu`. On the canvas every item is hit, outlined and dragged where the renderer draws it;
// stored values stay in their own units.
import {
  addAtom,
  addObject,
  resolveAnchor,
  setStyle,
  type Anchor,
  type AtomId,
  type Doc,
  type ObjectId,
  type Selection,
} from '@core/doc-model';
import { render, type ItemKey } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import { testDoc } from '../state/testing';
import { placeCondition } from './conditions';
import type { Point } from './geometry';
import { HIT_ALL, hitTest } from './hit-test';
import { anchorBlu, moveItems } from './structural-offsets';
import { ptToScreen, type Viewport } from './viewport';

const structural = (doc: Doc): Doc => setStyle(doc, { formula: 'structural' });
const viewport: Viewport = { zoom: 1.5, pan: { x: 300, y: 200 }, size: { w: 1200, h: 700 } };
const style = (doc: Doc) => render(doc).style;

function lonePairArrow(formula: boolean): { doc: Doc; arrow: ObjectId; atom: AtomId } {
  const [d1, atom] = addAtom(testDoc(), { element: 'O', x: 2, y: 0 });
  const [d2, other] = addAtom(d1, { element: 'N', x: 6, y: 0 });
  const [d3, arrow] = addObject(d2, {
    type: 'curved-arrow',
    head: 'full',
    from: { kind: 'atom', atom, offset: { x: 0, y: -0.5 } },
    to: { kind: 'atom', atom: other },
    bend: 0.4,
  });
  return { doc: formula ? structural(d3) : d3, arrow, atom };
}

describe('anchorBlu: the BLU point that, times ptPerBlu, is where the anchor is drawn', () => {
  it('is resolveAnchor for a skeletal document, whatever the anchor', () => {
    const { doc, atom } = lonePairArrow(false);
    const anchors: Anchor[] = [
      { kind: 'atom', atom, offset: { x: 0.3, y: -0.2 } },
      { kind: 'atom', atom },
      { kind: 'point', p: { x: 1, y: 2 } },
    ];
    for (const a of anchors) expect(anchorBlu(doc, a, style(doc))).toEqual(resolveAnchor(doc, a));
  });

  it('divides an atom anchor offset by ptPerBlu / bondLength in a structural document', () => {
    const { doc, atom } = lonePairArrow(true);
    const p = anchorBlu(doc, { kind: 'atom', atom, offset: { x: 0.4, y: -0.6 } }, style(doc));
    expect(p.x).toBeCloseTo(2.2, 12);
    expect(p.y).toBeCloseTo(-0.3, 12);
    const q: Anchor = { kind: 'point', p: { x: 1, y: 2 } };
    expect(anchorBlu(doc, q, style(doc))).toEqual({ x: 1, y: 2 });
  });
});

describe('a structural lone-pair arrow is hit at the tail the renderer draws', () => {
  it('its drawn first point is on the arrow; the unscaled offset would be 20 pt away', () => {
    const { doc, arrow } = lonePairArrow(true);
    const scene = render(doc);
    const path = scene.parts.find((p) => p.key === `obj:${arrow}`)!.svg;
    const m = /M(-?[\d.]+) (-?[\d.]+)/.exec(path)!;
    const tail = ptToScreen(viewport, { x: Number(m[1]), y: Number(m[2]) });
    expect(hitTest(doc, scene, viewport, tail, HIT_ALL)).toEqual({
      kind: 'object',
      id: arrow,
      type: 'curved-arrow',
    });
  });
});

/** A horizontal arrow with one condition text, placed by T3, in a document with the given formula. */
function condition(formula: boolean): { doc: Doc; text: ObjectId; arrow: ObjectId } {
  const base = formula ? structural(testDoc()) : testDoc();
  const [d1, arrow] = addObject(base, {
    type: 'arrow',
    kind: 'forward',
    from: { x: 0, y: 0 },
    to: { x: 3, y: 0 },
  });
  const a = d1.objects[arrow];
  if (a?.type !== 'arrow') throw new Error('arrow');
  const at = placeCondition(d1, a, 'above', [{ text: 'H2O' }])!.at;
  const [d2, text] = addObject(d1, {
    type: 'text',
    at,
    runs: [{ text: 'H2O' }],
    align: 'center',
    attachedTo: { arrow, slot: 'above' },
  });
  return { doc: d2, text, arrow };
}

const only = (objects: ObjectId[]): Selection => ({
  atoms: new Set(),
  bonds: new Set(),
  objects: new Set(objects),
});
const inkX = (doc: Doc, id: ObjectId): number => render(doc).extents[`obj:${id}` as ItemKey]!.x;

describe('moveItems: a dragged item follows the pointer where it is drawn', () => {
  for (const formula of [false, true]) {
    const mode = formula ? 'structural' : 'skeletal';
    it(`${mode}: an attached text moved alone by 0.5 BLU moves 0.5 x ptPerBlu pt`, () => {
      const { doc, text } = condition(formula);
      const ppb = style(doc).ptPerBlu;
      const moved = moveItems(doc, only([text]), 0.5, 0);
      expect(inkX(moved, text) - inkX(doc, text)).toBeCloseTo(0.5 * ppb, 9);
    });

    it(`${mode}: a text moves with its arrow by the same drawn distance`, () => {
      const { doc, text, arrow } = condition(formula);
      const ppb = style(doc).ptPerBlu;
      const moved = moveItems(doc, only([arrow]), 0.5, 0);
      expect(inkX(moved, text) - inkX(doc, text)).toBeCloseTo(0.5 * ppb, 9);
    });
  }

  it('moves a free text by the plain translation', () => {
    const [d1, id] = addObject(structural(testDoc()), {
      type: 'text',
      at: { x: 1, y: 1 },
      runs: [{ text: 'free' }],
      align: 'left',
    });
    const moved = moveItems(d1, only([id]), 0.5, 0.25);
    expect((moved.objects[id] as { at: Point }).at).toEqual({ x: 1.5, y: 1.25 });
  });
});
