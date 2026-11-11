import { addAtom, addBond, setStyle, type Doc } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import type { Point, Size } from '../model/geometry';
import {
  PX_PER_PT,
  ptToScreen,
  screenToPt,
  ZOOM_MAX,
  ZOOM_MIN,
  type Viewport,
} from '../model/viewport';
import type { EditorState } from './editor-state';
import { reduce, type EditorAction } from './reducer';
import { addEthane, freshState, testContext, testDoc } from './testing';

const SIZE: Size = { w: 1000, h: 600 };
const ctx = testContext();
const run = (state: EditorState, action: EditorAction): EditorState => reduce(state, action, ctx);
const sized = (doc: Doc = testDoc(), size: Size = SIZE): EditorState =>
  run(freshState(doc), { type: 'canvas-resized', size });
const centre = (size: Size): Point => ({ x: size.w / 2, y: size.h / 2 });
const near = (a: Point, b: Point, tol = 1e-6): void => {
  expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(tol);
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(tol);
};
const boundsOf = (doc: Doc) => {
  const bounds = ctx.derive.committed(doc).scene.bounds;
  if (bounds === null) throw new Error('empty scene');
  return bounds;
};
const inkCentre = (doc: Doc): Point => {
  const b = boundsOf(doc);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
};
/** A zig-zag chain of `n` carbons, 1 BLU apart: wide, short. */
const chain = (n: number): Doc => {
  let doc = testDoc();
  let prev: ReturnType<typeof addAtom>[1] | null = null;
  for (let i = 0; i < n; i++) {
    const [d, id] = addAtom(doc, { element: 'C', x: i, y: i % 2 === 0 ? 0 : 0.5 });
    doc = prev === null ? d : addBond(d, prev, id)[0];
    prev = id;
  }
  return doc;
};
const view = (s: EditorState): Viewport => s.viewport;

describe('canvas size and V2', () => {
  it('an empty document opens at 150 % with the origin at the canvas centre', () => {
    const v = view(sized());
    expect(v.zoom).toBe(1.5);
    expect(v.size).toEqual(SIZE);
    near(ptToScreen(v, { x: 0, y: 0 }), centre(SIZE));
  });

  it('a document opens at 150 % with its ink box centred', () => {
    const doc = addEthane(testDoc());
    const v = view(sized(doc));
    expect(v.zoom).toBe(1.5);
    near(ptToScreen(v, inkCentre(doc)), centre(SIZE));
  });

  it('Handout opens at 416.67 % so a bond is still 80 px', () => {
    const doc = setStyle(addEthane(testDoc()), { preset: 'journal' });
    const v = view(sized(doc));
    expect(v.zoom).toBeCloseTo(1.5 * (40 / 14.4), 9);
  });

  it('a document too large for the margin opens zoomed to fit', () => {
    const v = view(sized(chain(30)));
    expect(v.zoom).toBeLessThan(1.5);
    expect(Math.round(v.zoom * 100) / 100).toBe(v.zoom);
  });

  it('later resizes keep the document point under the canvas centre', () => {
    const s = sized(addEthane(testDoc()));
    const before = screenToPt(view(s), centre(SIZE));
    const bigger: Size = { w: 1280, h: 700 };
    const r = run(s, { type: 'canvas-resized', size: bigger });
    expect(view(r).size).toEqual(bigger);
    expect(view(r).zoom).toBe(1.5);
    near(screenToPt(view(r), centre(bigger)), before);
  });

  it('a resize to the same size changes nothing', () => {
    const s = sized();
    expect(run(s, { type: 'canvas-resized', size: SIZE })).toBe(s);
  });

  it('load applies V2 again: default zoom, ink box centred', () => {
    const doc = addEthane(testDoc());
    let s = sized(doc);
    s = run(s, { type: 'zoom-step', dir: 1 });
    s = run(s, { type: 'pan-by', dx: 40, dy: 10 });
    const loaded = run(s, { type: 'load', doc });
    expect(view(loaded).zoom).toBe(1.5);
    near(ptToScreen(view(loaded), inkCentre(doc)), centre(SIZE));
  });
});

describe('V1 zoom steps', () => {
  it('step in goes 150 -> 200 -> 250 about the canvas centre', () => {
    const s = sized(addEthane(testDoc()));
    const fixed = screenToPt(view(s), centre(SIZE));
    const a = run(s, { type: 'zoom-step', dir: 1 });
    expect(view(a).zoom).toBe(2);
    near(screenToPt(view(a), centre(SIZE)), fixed);
    expect(view(run(a, { type: 'zoom-step', dir: 1 })).zoom).toBe(2.5);
  });

  it('step out goes 150 -> 125 -> 100', () => {
    let s = sized();
    s = run(s, { type: 'zoom-step', dir: -1 });
    expect(view(s).zoom).toBe(1.25);
    expect(view(run(s, { type: 'zoom-step', dir: -1 })).zoom).toBe(1);
  });

  it('clamps at 25 % and 800 %', () => {
    let s = sized();
    for (let i = 0; i < 20; i++) s = run(s, { type: 'zoom-step', dir: -1 });
    expect(view(s).zoom).toBe(ZOOM_MIN);
    expect(run(s, { type: 'zoom-step', dir: -1 })).toBe(s);
    for (let i = 0; i < 20; i++) s = run(s, { type: 'zoom-step', dir: 1 });
    expect(view(s).zoom).toBe(ZOOM_MAX);
    expect(run(s, { type: 'zoom-step', dir: 1 })).toBe(s);
  });

  it('Ctrl+wheel zooms continuously about the pointer, which stays fixed', () => {
    const s = sized(addEthane(testDoc()));
    const anchor = { x: 300, y: 200 };
    const fixed = screenToPt(view(s), anchor);
    const up = run(s, { type: 'zoom-wheel', deltaY: -100, anchor });
    expect(view(up).zoom).toBeCloseTo(1.5 * Math.pow(1.0015, 100), 9);
    near(screenToPt(view(up), anchor), fixed);
    const down = run(s, { type: 'zoom-wheel', deltaY: 100, anchor });
    expect(view(down).zoom).toBeLessThan(1.5);
    near(screenToPt(view(down), anchor), fixed);
  });

  it('wheel zoom clamps to the range', () => {
    const s = sized();
    expect(view(run(s, { type: 'zoom-wheel', deltaY: -1e6, anchor: { x: 0, y: 0 } })).zoom).toBe(
      ZOOM_MAX,
    );
    expect(view(run(s, { type: 'zoom-wheel', deltaY: 1e6, anchor: { x: 0, y: 0 } })).zoom).toBe(
      ZOOM_MIN,
    );
  });
});

describe('R49 zoom to 100 % and R13 fit', () => {
  it('reset goes to 100 % (zoom 1) about the canvas centre, not the 150 % default', () => {
    let s = sized(addEthane(testDoc()));
    s = run(s, { type: 'zoom-wheel', deltaY: -300, anchor: { x: 100, y: 100 } });
    const fixed = screenToPt(view(s), centre(SIZE));
    expect(view(s).zoom).not.toBe(1);
    s = run(s, { type: 'zoom-reset' });
    expect(view(s).zoom).toBe(1);
    near(screenToPt(view(s), centre(SIZE)), fixed);
  });

  it('reset on Handout also goes to 100 %; the Handout default stays 416.67 %', () => {
    const doc = setStyle(testDoc(), { preset: 'journal' });
    let s = sized(doc);
    expect(view(s).zoom).toBeCloseTo(1.5 * (40 / 14.4), 9);
    s = run(s, { type: 'zoom-step', dir: -1 });
    expect(view(run(s, { type: 'zoom-reset' })).zoom).toBe(1);
  });

  it('fit on an empty document keeps the default zoom and centres the origin', () => {
    let s = sized();
    s = run(s, { type: 'zoom-step', dir: 1 });
    s = run(s, { type: 'pan-by', dx: 50, dy: 20 });
    s = run(s, { type: 'zoom-fit' });
    expect(view(s).zoom).toBe(1.5);
    near(ptToScreen(view(s), { x: 0, y: 0 }), centre(SIZE));
  });

  it('fit never exceeds the default zoom', () => {
    const doc = addEthane(testDoc());
    const s = run(run(sized(doc), { type: 'zoom-step', dir: -1 }), { type: 'zoom-fit' });
    expect(view(s).zoom).toBe(1.5);
    near(ptToScreen(view(s), inkCentre(doc)), centre(SIZE));
  });

  it('fit shrinks a wide drawing to a whole percent with a 48 px margin, centred', () => {
    const doc = chain(30);
    const s = run(sized(doc, SIZE), { type: 'zoom-fit' });
    const v = view(s);
    expect(v.zoom).toBeLessThan(1.5);
    expect(Math.round(v.zoom * 100) / 100).toBe(v.zoom);
    const b = boundsOf(doc);
    const left = ptToScreen(v, { x: b.x, y: b.y });
    const right = ptToScreen(v, { x: b.x + b.w, y: b.y + b.h });
    expect(left.x).toBeGreaterThanOrEqual(48 - 1e-6);
    expect(SIZE.w - right.x).toBeGreaterThanOrEqual(48 - 1e-6);
    near({ x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 }, centre(SIZE), 1e-6);
    // one percent more would not fit
    const bigger = (v.zoom + 0.01) * PX_PER_PT * b.w + 96;
    expect(bigger).toBeGreaterThan(SIZE.w);
  });
});

describe('V4 pan', () => {
  it('pan-by moves the pan by the delta', () => {
    const s = sized(addEthane(testDoc()));
    const p = run(s, { type: 'pan-by', dx: 100, dy: 50 });
    near(view(p).pan, { x: view(s).pan.x + 100, y: view(s).pan.y + 50 });
  });

  it('keeps at least 64 px of the content on screen', () => {
    const doc = addEthane(testDoc());
    const s = run(sized(doc), { type: 'pan-by', dx: 1e6, dy: 1e6 });
    const b = boundsOf(doc);
    const topLeft = ptToScreen(view(s), { x: b.x, y: b.y });
    expect(topLeft.x).toBeCloseTo(SIZE.w - 64, 6);
    const keepY = Math.min(64, b.h * PX_PER_PT * 1.5);
    expect(topLeft.y).toBeCloseTo(SIZE.h - keepY, 6);
    const back = run(s, { type: 'pan-by', dx: -1e7, dy: -1e7 });
    const bottomRight = ptToScreen(view(back), { x: b.x + b.w, y: b.y + b.h });
    expect(bottomRight.x).toBeCloseTo(64, 6);
    expect(bottomRight.y).toBeCloseTo(keepY, 6);
  });

  it('an empty document pans freely', () => {
    const p = run(sized(), { type: 'pan-by', dx: 1e5, dy: 0 });
    expect(view(p).pan.x).toBe(SIZE.w / 2 + 1e5);
  });

  it('a pan of zero changes nothing', () => {
    const s = sized();
    expect(run(s, { type: 'pan-by', dx: 0, dy: 0 })).toBe(s);
  });
});
