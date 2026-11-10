import {
  addAtom,
  addBond,
  addObject,
  fragments,
  type AtomId,
  type Doc,
  type ObjectId,
  type Selection,
} from '@core/doc-model';
import { render } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION } from '../state/editor-state';
import { drawn, wholeOf } from '../state/testing';
import { frameRect, selectionInk } from './frame';
import { handleHit, selectionHandles } from './handles';
import { canvasOverlay } from './overlay';
import { bluToScreen, type Viewport } from './viewport';

const BL = 40;
const v: Viewport = { zoom: 1.5, pan: { x: 300, y: 200 }, size: { w: 1200, h: 700 } };
const sel = (over: Partial<Selection>): Selection => ({ ...EMPTY_SELECTION, ...over });

const benzene = (): { doc: Doc; whole: Selection } => {
  const doc = drawn({ name: 'benzene', x: 0, y: 0 });
  return { doc, whole: wholeOf(doc, fragments(doc)[0] as AtomId[]) };
};

const withArrow = (): { doc: Doc; arrow: ObjectId } => {
  const [doc, arrow] = addObject(drawn(), {
    type: 'arrow',
    kind: 'forward',
    from: { x: 0, y: 0 },
    to: { x: 3, y: 0 },
  });
  return { doc, arrow };
};

/** Two bonded atoms and a curved arrow from the first atom to the second's bond. */
const withCurve = (): { doc: Doc; curve: ObjectId } => {
  const [d1, a] = addAtom(drawn(), { element: 'C', x: 0, y: 0 });
  const [d2, b] = addAtom(d1, { element: 'C', x: 2, y: 0 });
  const [d3] = addBond(d2, a, b);
  const [doc, curve] = addObject(d3, {
    type: 'curved-arrow',
    head: 'full',
    from: { kind: 'point', p: { x: 0, y: 0 } },
    to: { kind: 'point', p: { x: 2, y: 0 } },
    bend: 0.5,
  });
  return { doc, curve };
};

describe('rotate handle (SPEC "Canvas appearance")', () => {
  it('is a circle of diameter 10, 24 px above the frame top centre, on a 1 px stem', () => {
    const { doc, whole } = benzene();
    const scene = render(doc);
    const handles = selectionHandles(doc, scene, v, whole);
    const rotate = handles.find((h) => h.hit.kind === 'handle' && h.hit.handle === 'rotate');
    if (!rotate) throw new Error('no rotate handle');
    const ink = selectionInk(doc, scene, whole);
    if (!ink) throw new Error('no ink');
    const frame = frameRect(v, ink);
    const circle = rotate.shapes.find((s) => s.kind === 'circle');
    expect(circle).toMatchObject({ kind: 'circle', r: 5 });
    if (circle?.kind !== 'circle') throw new Error('no circle');
    expect(circle.c.y).toBe(frame.y - 24);
    expect(Math.abs(circle.c.x - (frame.x + frame.w / 2))).toBeLessThanOrEqual(1);
    const stem = rotate.shapes.find((s) => s.kind === 'line');
    expect(stem).toMatchObject({
      from: { x: circle.c.x, y: frame.y },
      to: { x: circle.c.x, y: frame.y - 19 },
    });
  });

  it('nothing selected: no handles', () => {
    const { doc } = benzene();
    expect(selectionHandles(doc, render(doc), v, EMPTY_SELECTION)).toEqual([]);
  });

  it('its hit area is a circle of diameter 20', () => {
    const { doc, whole } = benzene();
    const scene = render(doc);
    const [rotate] = selectionHandles(doc, scene, v, whole);
    if (!rotate) throw new Error('no handle');
    const { x, y } = rotate.at;
    const hit = { kind: 'handle', handle: 'rotate' };
    expect(handleHit(doc, scene, v, whole, { x: x + 9.5, y })).toEqual(hit);
    expect(handleHit(doc, scene, v, whole, { x, y: y - 9.5 })).toEqual(hit);
    expect(handleHit(doc, scene, v, whole, { x: x + 10.5, y })).toBeNull();
    // The corner of the 20 x 20 box is outside the circle.
    expect(handleHit(doc, scene, v, whole, { x: x + 9, y: y + 9 })).toBeNull();
  });
});

describe('arrow end handles', () => {
  it('a selected arrow has 8 x 8 squares at both ends, hit 16 x 16', () => {
    const { doc, arrow } = withArrow();
    const scene = render(doc);
    const s = sel({ objects: new Set([arrow]) });
    const handles = selectionHandles(doc, scene, v, s);
    const ends = handles.filter((h) => h.hit.kind === 'handle' && h.hit.handle !== 'rotate');
    expect(ends.map((h) => h.hit)).toEqual([
      { kind: 'handle', handle: 'arrow-from', id: arrow },
      { kind: 'handle', handle: 'arrow-to', id: arrow },
    ]);
    const from = bluToScreen(v, { x: 0, y: 0 }, BL);
    const to = bluToScreen(v, { x: 3, y: 0 }, BL);
    expect(ends[0]?.shapes).toEqual([
      { kind: 'box', rect: { x: from.x - 4, y: from.y - 4, w: 8, h: 8 }, radius: 0 },
    ]);
    expect(handleHit(doc, scene, v, s, { x: to.x + 7.5, y: to.y - 7.5 })).toEqual({
      kind: 'handle',
      handle: 'arrow-to',
      id: arrow,
    });
    expect(handleHit(doc, scene, v, s, { x: to.x + 8.5, y: to.y })).toBeNull();
  });

  it('an unselected arrow has no handles', () => {
    const { doc } = withArrow();
    expect(selectionHandles(doc, render(doc), v, EMPTY_SELECTION)).toEqual([]);
  });
});

describe('curved-arrow handles', () => {
  it('ends are circles of diameter 8, the bend handle a 9 x 9 diamond at t = 0.5', () => {
    const { doc, curve } = withCurve();
    const scene = render(doc);
    const s = sel({ objects: new Set([curve]) });
    const handles = selectionHandles(doc, scene, v, s);
    const kinds = handles.flatMap((h) => (h.hit.kind === 'handle' ? [h.hit.handle] : []));
    expect(kinds).toEqual(['rotate', 'curve-from', 'curve-to', 'curve-bend']);
    const from = bluToScreen(v, { x: 0, y: 0 }, BL);
    const to = bluToScreen(v, { x: 2, y: 0 }, BL);
    const [, f, , b] = handles;
    expect(f?.shapes).toEqual([{ kind: 'circle', c: from, r: 4 }]);
    // chord 2 BLU, bend 0.5: the midpoint of the curve is 0.5 BLU off the chord, on the left
    // (up on screen for a chord running right).
    const mid = { x: (from.x + to.x) / 2, y: from.y - 0.5 * (v.zoom * (4 / 3) * BL) };
    expect(b?.shapes).toEqual([{ kind: 'diamond', c: mid, size: 9 }]);
  });
});

describe('priority (H2)', () => {
  it('a handle wins over the atom or arrow under it', () => {
    const { doc, arrow } = withArrow();
    const scene = render(doc);
    const s = sel({ objects: new Set([arrow]) });
    const from = bluToScreen(v, { x: 0, y: 0 }, BL);
    expect(handleHit(doc, scene, v, s, from)?.kind).toBe('handle');
  });
});

describe('canvasOverlay', () => {
  it('draws the handles of the selection last, in one group', () => {
    const { doc, whole } = benzene();
    const groups = canvasOverlay({
      hover: null,
      selection: whole,
      gesture: null,
      preview: null,
      doc,
      scene: render(doc),
      viewport: v,
    });
    expect(groups.map((g) => g.kind)).toEqual(['selection', 'frame', 'handle']);
  });

  it('a translate preview moves the handles with the selection', () => {
    const { doc, whole } = benzene();
    const scene = render(doc);
    const view = {
      hover: null,
      selection: whole,
      gesture: null,
      doc,
      scene,
      viewport: v,
    };
    const rest = canvasOverlay({ ...view, preview: null }).find((g) => g.kind === 'handle');
    const k = v.zoom * (4 / 3);
    const moved = canvasOverlay({
      ...view,
      preview: { doc, added: new Set<string>(), translate: { keys: [], dx: 10, dy: 5 } },
    }).find((g) => g.kind === 'handle');
    const c0 = rest?.shapes.find((s) => s.kind === 'circle');
    const c1 = moved?.shapes.find((s) => s.kind === 'circle');
    if (c0?.kind !== 'circle' || c1?.kind !== 'circle') throw new Error('no circle');
    expect(c1.c.x - c0.c.x).toBeCloseTo(10 * k, 0);
    expect(c1.c.y - c0.c.y).toBeCloseTo(5 * k, 0);
  });
});
