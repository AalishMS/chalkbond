// N13 / R53: in structural mode every BLU <-> pt conversion uses `ptPerBlu` (twice the bond length
// in pt), never `bondLength`. A structural document is drawn twice as large; the model stays in BLU.
import { parseSmiles } from '@core/chem-core';
import {
  addAtom,
  addBond,
  addObject,
  insert,
  setStyle,
  type AtomId,
  type Doc,
  type ObjectId,
  type Selection,
} from '@core/doc-model';
import { render, type ItemKey } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION } from '../state/editor-state';
import { drawn, testDoc } from '../state/testing';
import { placeCondition } from './conditions';
import { selectionInk } from './frame';
import { add, type Point } from './geometry';
import { HIT_ALL, hitTest, type Hit } from './hit-test';
import { itemBoxes } from './move';
import { insertPosition } from './placement';
import { snapPlus } from './reaction-ops';
import { messyScheme, tidied } from './tidy-fixtures';
import { bluToScreen, type Viewport } from './viewport';

const structural = (doc: Doc): Doc => setStyle(doc, { formula: 'structural' });
const ZOOMS = [0.25, 1.5, 8] as const;
const viewport = (zoom: number): Viewport => ({
  zoom,
  pan: { x: 300, y: 200 },
  size: { w: 1200, h: 700 },
});

/** Two carbons 10 BLU apart, bonded (long at every zoom), and a long arrow below them. */
function longBond(): { doc: Doc; a: AtomId; b: AtomId; arrow: ObjectId } {
  const [d1, a] = addAtom(testDoc(), { element: 'C', x: 0, y: 0 });
  const [d2, b] = addAtom(d1, { element: 'C', x: 10, y: 0 });
  const [d3] = addBond(d2, a, b);
  const [d4, arrow] = addObject(d3, {
    type: 'arrow',
    kind: 'forward',
    from: { x: 0, y: 5 },
    to: { x: 10, y: 5 },
  });
  return { doc: structural(d4), a, b, arrow };
}

const hit = (doc: Doc, v: Viewport, p: Point): Hit | null =>
  hitTest(doc, render(doc), v, p, HIT_ALL);

describe('structural hit-testing: items are hit where they are drawn (H1)', () => {
  for (const zoom of ZOOMS) {
    const v = viewport(zoom);
    const { doc, arrow } = longBond();
    const ppb = render(doc).style.ptPerBlu;
    const screenOf = (p: Point): Point => bluToScreen(v, p, ppb);
    const pa = screenOf({ x: 0, y: 0 });
    const pb = screenOf({ x: 10, y: 0 });
    const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };

    it(`ptPerBlu is twice the bond length (zoom ${zoom})`, () => {
      expect(ppb).toBe(80);
    });

    it(`bond 5 px from the doubled segment hits, 7 px misses (zoom ${zoom})`, () => {
      expect(hit(doc, v, add(mid, { x: 0, y: 5 }))?.kind).toBe('bond');
      expect(hit(doc, v, add(mid, { x: 0, y: 7 }))).toBeNull();
    });

    it(`an arrow is hit on its drawn shaft, 5 px off yes and 7 px no (zoom ${zoom})`, () => {
      const m = screenOf({ x: 5, y: 5 });
      expect(hit(doc, v, m)).toEqual({ kind: 'object', id: arrow, type: 'arrow' });
      expect(hit(doc, v, add(m, { x: 0, y: 5 }))?.kind).toBe('object');
      expect(hit(doc, v, add(m, { x: 0, y: 7 }))).toBeNull();
    });
  }
});

/** The ink boxes (pt) of the row of `doc`, left to right, texts left out. */
function row(doc: Doc) {
  return itemBoxes(doc, render(doc))
    .filter((i) => i.object === undefined || doc.objects[i.object]?.type !== 'text')
    .map((i) => ({
      kind: i.object === undefined ? 'fragment' : doc.objects[i.object]?.type,
      ...i.box,
    }))
    .sort((p, q) => p.x - q.x);
}

describe('structural ring carbon: H1 10 px around the vertex at 80 pt per BLU', () => {
  for (const zoom of ZOOMS) {
    it(`within 9.5 px hits, 11 px outwards misses (zoom ${zoom})`, () => {
      const parsed = parseSmiles('C1CCCCC1');
      if (!parsed.ok) throw new Error('smiles');
      const doc = structural(insert(testDoc(), parsed.value, { x: 0, y: 0 })[0]);
      const v = viewport(zoom);
      const atoms = Object.values(doc.atoms);
      const cx = atoms.reduce((t, a) => t + a.x, 0) / atoms.length;
      const cy = atoms.reduce((t, a) => t + a.y, 0) / atoms.length;
      const atom = atoms[0]!;
      const vertex = bluToScreen(v, atom, 80);
      const len = Math.hypot(atom.x - cx, atom.y - cy);
      const out = { x: (atom.x - cx) / len, y: (atom.y - cy) / len };
      expect(hit(doc, v, add(vertex, { x: out.x * 9.5, y: out.y * 9.5 }))).toMatchObject({
        kind: 'atom',
        id: atom.id,
      });
      expect(hit(doc, v, add(vertex, { x: out.x * 11, y: out.y * 11 }))).toBeNull();
    });
  }
});

describe('structural Tidy (TR5): gaps are 0.6 BLU and 0.4 BLU in the drawn units', () => {
  for (const preset of ['slides', 'journal'] as const) {
    it(`${preset}: 0.6 BLU between ink boxes (48 pt Slides), 0.4 BLU beside a plus`, () => {
      const doc = structural(setStyle(messyScheme().doc, { preset }));
      const ppb = render(doc).style.ptPerBlu;
      const done = tidied(doc, EMPTY_SELECTION);
      expect(done).not.toBeNull();
      const items = row(done as Doc);
      expect(items.length).toBeGreaterThanOrEqual(7);
      for (let i = 1; i < items.length; i++) {
        const p = items[i - 1]!;
        const q = items[i]!;
        const beside = p.kind === 'plus' || q.kind === 'plus';
        expect((q.x - (p.x + p.w)) / ppb).toBeCloseTo(beside ? 0.4 : 0.6, 6);
      }
      if (preset === 'slides') expect(ppb * 0.6).toBe(48);
    });
  }
});

describe('structural P7: an inserted structure goes 1.0 BLU right of the drawing', () => {
  it('its ink box starts 80 pt (Slides) right of the document ink box', () => {
    const doc = structural(drawn({ name: 'ethanol', x: 0, y: 0 }));
    const scene = render(doc);
    const parsed = parseSmiles('CCO');
    if (!parsed.ok) throw new Error('smiles');
    const at = insertPosition(doc, scene, parsed.value, { x: 0, y: 0 });
    const [after, sel] = insert(doc, parsed.value, at);
    const fresh = itemBoxes(after, render(after)).find((i) =>
      i.atoms.some((x) => sel.atoms.has(x)),
    );
    const right = (scene.bounds?.x ?? 0) + (scene.bounds?.w ?? 0);
    expect((fresh?.box.x ?? 0) - right).toBeCloseTo(80, 6);
  });
});

describe('structural T3: the condition gap is 0.2 x bondLength pt, the style value', () => {
  for (const [preset, gap] of [
    ['slides', 8],
    ['journal', 2.88],
  ] as const) {
    it(`${preset}: ink gap ${gap} pt between a shaft and its text, centred on the midpoint`, () => {
      const [d1, arrow] = addObject(setStyle(structural(testDoc()), { preset }), {
        type: 'arrow',
        kind: 'forward',
        from: { x: 0, y: 0 },
        to: { x: 3, y: 0 },
      });
      const a = d1.objects[arrow];
      if (a?.type !== 'arrow') throw new Error('arrow');
      const place = placeCondition(d1, a, 'above', [{ text: 'H2O' }]);
      expect(place).not.toBeNull();
      const [d2, text] = addObject(d1, {
        type: 'text',
        at: (place as { at: Point }).at,
        runs: [{ text: 'H2O' }],
        align: 'center',
        attachedTo: { arrow, slot: 'above' },
      });
      const scene = render(d2);
      const shaft = scene.extents[`obj:${arrow}` as ItemKey]!;
      const ink = scene.extents[`obj:${text}` as ItemKey]!;
      expect(shaft.y - (ink.y + ink.h)).toBeCloseTo(gap, 6);
      expect(ink.x + ink.w / 2).toBeCloseTo(1.5 * scene.style.ptPerBlu, 6);
    });
  }
});

describe('structural plus snapping and selection ink agree with the render', () => {
  it('snapPlus pulls a plus onto the centre x of a fragment, in the drawn units', () => {
    const doc = structural(drawn({ name: 'ethanol', x: 0, y: 0 }));
    const scene = render(doc);
    const box = itemBoxes(doc, scene)[0]!.box;
    const cx = (box.x + box.w / 2) / scene.style.ptPerBlu;
    const snapped = snapPlus(doc, scene, { x: cx + 0.02, y: 6 }, 2);
    expect(snapped.at.x).toBeCloseTo(cx, 9);
  });

  it('a selected atom contributes its vertex at atom position x ptPerBlu', () => {
    const [d1, a] = addAtom(testDoc(), { element: 'C', x: 3, y: 0 });
    const doc = structural(d1);
    const sel: Selection = { atoms: new Set([a]), bonds: new Set(), objects: new Set() };
    const ink = selectionInk(doc, render(doc), sel);
    expect(ink).not.toBeNull();
    // The vertex is at 3 x 80 pt; the label of the carbon surrounds it.
    expect(ink!.x).toBeLessThanOrEqual(240);
    expect(ink!.x + ink!.w).toBeGreaterThanOrEqual(240);
    expect(ink!.x).toBeGreaterThan(160);
  });
});
