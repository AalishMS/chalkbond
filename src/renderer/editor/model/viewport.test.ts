import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  bluToScreen,
  clampPan,
  clampZoom,
  defaultZoom,
  fitViewport,
  fitZoom,
  initialViewport,
  ptToScreen,
  PX_PER_PT,
  reveal,
  screenToBlu,
  screenToPt,
  stepViewport,
  stepZoom,
  switchPreset,
  wheelZoom,
  zoomAbout,
  zoomPercent,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEPS,
  type Viewport,
} from './viewport';

const SLIDES = 40;
const JOURNAL = 14.4;
const canvas = { w: 1215, h: 722 };
const vp = (zoom: number, x = 0, y = 0, size = canvas): Viewport => ({
  zoom,
  pan: { x, y },
  size,
});

describe('V1 zoom steps and range', () => {
  it('steps are 25 33 50 67 75 90 100 125 150 200 250 300 400 500 600 800 %', () => {
    expect(ZOOM_STEPS.map((z) => Math.round(z * 100))).toEqual([
      25, 33, 50, 67, 75, 90, 100, 125, 150, 200, 250, 300, 400, 500, 600, 800,
    ]);
    expect(ZOOM_MIN).toBe(0.25);
    expect(ZOOM_MAX).toBe(8);
  });

  it('stepping from 150 % goes to 200 % and 125 %', () => {
    expect(stepZoom(1.5, 1)).toBe(2);
    expect(stepZoom(1.5, -1)).toBe(1.25);
  });

  it('stepping from the Handout default 416.67 % goes to 500 % and 400 %', () => {
    const z = defaultZoom(JOURNAL);
    expect(stepZoom(z, 1)).toBe(5);
    expect(stepZoom(z, -1)).toBe(4);
  });

  it('stepping from a value between steps goes to the neighbouring step', () => {
    expect(stepZoom(1.1, 1)).toBe(1.25);
    expect(stepZoom(1.1, -1)).toBe(1);
  });

  it('clamps at 25 % and 800 %', () => {
    expect(stepZoom(0.25, -1)).toBe(0.25);
    expect(stepZoom(8, 1)).toBe(8);
    expect(stepZoom(0.1, 1)).toBe(0.25);
    expect(stepZoom(20, -1)).toBe(8);
    expect(clampZoom(0.01)).toBe(0.25);
    expect(clampZoom(99)).toBe(8);
    expect(clampZoom(1.7)).toBe(1.7);
  });

  it('the readout is the zoom rounded to a whole percent', () => {
    expect(zoomPercent(1.5)).toBe(150);
    expect(zoomPercent(defaultZoom(JOURNAL))).toBe(417);
    expect(zoomPercent(1.1534)).toBe(115);
  });

  it('wheel zoom: factor 1.0015^(-deltaY), clamped, about the pointer', () => {
    const v = vp(1.5, 10, 20);
    const anchor = { x: 300, y: 200 };
    const up = wheelZoom(v, -100, anchor);
    expect(up.zoom).toBeCloseTo(1.5 * 1.0015 ** 100, 12);
    const before = screenToPt(v, anchor);
    const after = screenToPt(up, anchor);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(wheelZoom(vp(7.9), -1000, anchor).zoom).toBe(8);
    expect(wheelZoom(vp(0.26), 1000, anchor).zoom).toBe(0.25);
  });

  it('buttons and keys step about the canvas centre', () => {
    const v = vp(1.5, 52, 361);
    const centre = { x: canvas.w / 2, y: canvas.h / 2 };
    const next = stepViewport(v, 1);
    expect(next.zoom).toBe(2);
    const before = screenToPt(v, centre);
    const after = screenToPt(next, centre);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(stepViewport(v, -1).zoom).toBe(1.25);
  });
});

describe('R1 and V2 default zoom', () => {
  it('is 1.5 for Slides and 1.5 x 40 / 14.4 for Handout', () => {
    expect(defaultZoom(SLIDES)).toBe(1.5);
    expect(defaultZoom(JOURNAL)).toBeCloseTo((1.5 * 40) / 14.4, 12);
    expect(defaultZoom(JOURNAL)).toBeCloseTo(4.1667, 4);
  });

  it('is clamped to the range', () => {
    expect(defaultZoom(1)).toBe(8);
    expect(defaultZoom(400)).toBe(0.25);
  });

  it('a bond is 80 screen px at the default zoom', () => {
    expect(defaultZoom(SLIDES) * PX_PER_PT * SLIDES).toBeCloseTo(80, 9);
    expect(defaultZoom(JOURNAL) * PX_PER_PT * JOURNAL).toBeCloseTo(80, 9);
  });

  it('an empty document: zoom z0, the origin at the canvas centre', () => {
    const v = initialViewport(null, canvas, SLIDES);
    expect(v.zoom).toBe(1.5);
    expect(ptToScreen(v, { x: 0, y: 0 })).toEqual({ x: canvas.w / 2, y: canvas.h / 2 });
    expect(v.size).toEqual(canvas);
  });

  it('a small document: zoom z0, the ink box centred', () => {
    const b = { x: 20, y: 10, w: 100, h: 60 };
    const v = initialViewport(b, canvas, SLIDES);
    expect(v.zoom).toBe(1.5);
    const c = ptToScreen(v, { x: 70, y: 40 });
    expect(c.x).toBeCloseTo(canvas.w / 2, 9);
    expect(c.y).toBeCloseTo(canvas.h / 2, 9);
  });

  it('a big document: zoom to fit (V3)', () => {
    const b = { x: 0, y: 0, w: 726, h: 300 };
    expect(initialViewport(b, canvas, SLIDES).zoom).toBe(1.15);
  });
});

describe('V3 / R13 fit', () => {
  // A scheme as wide as screen 08's: 726 pt in the 1215 x 722 canvas.
  const scheme = { x: -100, y: -150, w: 726, h: 300 };

  it('the 08 scheme at 1215 x 722 fits at 115 %', () => {
    expect(fitZoom(scheme, canvas, SLIDES)).toBe(1.15);
  });

  it('is the largest whole percent whose ink plus 48 px margins fits', () => {
    const z = fitZoom(scheme, canvas, SLIDES);
    expect(scheme.w * z * PX_PER_PT + 96).toBeLessThanOrEqual(canvas.w);
    expect(scheme.w * (z + 0.01) * PX_PER_PT + 96 > canvas.w).toBe(true);
  });

  it('uses the tighter of width and height', () => {
    const tall = { x: 0, y: 0, w: 100, h: 900 };
    const z = fitZoom(tall, canvas, SLIDES);
    expect(tall.h * z * PX_PER_PT + 96).toBeLessThanOrEqual(canvas.h);
    expect(z).toBeLessThan(1);
  });

  it('never exceeds z0, for either preset', () => {
    const tiny = { x: 0, y: 0, w: 5, h: 5 };
    expect(fitZoom(tiny, canvas, SLIDES)).toBe(1.5);
    expect(fitZoom(tiny, canvas, JOURNAL)).toBeLessThanOrEqual(defaultZoom(JOURNAL));
    expect(fitZoom(tiny, canvas, JOURNAL)).toBe(4.16);
  });

  it('a zero-size ink box (one atom) is capped by z0', () => {
    expect(fitZoom({ x: 3, y: 3, w: 0, h: 0 }, canvas, SLIDES)).toBe(1.5);
  });

  it('nothing to fit is z0', () => {
    expect(fitZoom(null, canvas, SLIDES)).toBe(1.5);
  });

  it('never goes below 25 %, even in a canvas smaller than the margins', () => {
    expect(fitZoom(scheme, { w: 50, h: 50 }, SLIDES)).toBe(0.25);
  });

  it('fitViewport centres the ink box', () => {
    const v = fitViewport(scheme, canvas, SLIDES);
    expect(v.zoom).toBe(1.15);
    const c = ptToScreen(v, { x: 263, y: 0 });
    expect(c.x).toBeCloseTo(canvas.w / 2, 9);
    expect(c.y).toBeCloseTo(canvas.h / 2, 9);
  });

  it('fitViewport of nothing puts the origin at the centre at z0', () => {
    const v = fitViewport(null, canvas, SLIDES);
    expect(v.zoom).toBe(1.5);
    expect(ptToScreen(v, { x: 0, y: 0 })).toEqual({ x: canvas.w / 2, y: canvas.h / 2 });
  });

  it('fit zoom never exceeds z0 (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 3000, noNaN: true }),
        fc.double({ min: 0, max: 3000, noNaN: true }),
        fc.double({ min: 100, max: 3000, noNaN: true }),
        fc.double({ min: 100, max: 3000, noNaN: true }),
        fc.constantFrom(SLIDES, JOURNAL),
        (w, h, cw, ch, bl) => {
          const z = fitZoom({ x: 0, y: 0, w, h }, { w: cw, h: ch }, bl);
          expect(z).toBeLessThanOrEqual(defaultZoom(bl));
          expect(z).toBeGreaterThanOrEqual(ZOOM_MIN);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('coordinates: BLU <-> pt <-> screen', () => {
  it('k = zoom x 4/3', () => {
    expect(PX_PER_PT).toBeCloseTo(4 / 3, 12);
    const v = vp(1.5, 10, 20);
    expect(ptToScreen(v, { x: 30, y: 15 })).toEqual({ x: 10 + 30 * 2, y: 20 + 15 * 2 });
    expect(bluToScreen(v, { x: 1, y: 2 }, SLIDES)).toEqual({ x: 10 + 40 * 2, y: 20 + 80 * 2 });
  });

  it('round trip BLU -> screen -> BLU (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: 0.25, max: 8, noNaN: true }),
        fc.double({ min: -2000, max: 2000, noNaN: true }),
        fc.double({ min: -2000, max: 2000, noNaN: true }),
        fc.constantFrom(SLIDES, JOURNAL),
        (x, y, zoom, px, py, bl) => {
          const v = vp(zoom, px, py);
          const back = screenToBlu(v, bluToScreen(v, { x, y }, bl), bl);
          expect(back.x).toBeCloseTo(x, 6);
          expect(back.y).toBeCloseTo(y, 6);
          const pt = screenToPt(v, ptToScreen(v, { x, y }));
          expect(pt.x).toBeCloseTo(x, 6);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('zoomAbout keeps the point under the anchor still and clamps the zoom', () => {
    const v = vp(1.5, 52, 361);
    const anchor = { x: 640, y: 300 };
    const z = zoomAbout(v, 3, anchor);
    expect(z.zoom).toBe(3);
    const before = screenToPt(v, anchor);
    const after = screenToPt(z, anchor);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(zoomAbout(v, 50, anchor).zoom).toBe(8);
    expect(zoomAbout(v, 0.001, anchor).zoom).toBe(0.25);
  });
});

describe('V4 pan clamp: at least 64 px of the content stays on screen', () => {
  const content = { x: 0, y: 0, w: 400, h: 300 }; // pt; 800 x 600 px at 150 %
  const small = { w: 1000, h: 700 };
  const visible = (v: Viewport): { w: number; h: number } => {
    const left = Math.max(content.x * 2 + v.pan.x, 0);
    const right = Math.min((content.x + content.w) * 2 + v.pan.x, v.size.w);
    const top = Math.max(content.y * 2 + v.pan.y, 0);
    const bottom = Math.min((content.y + content.h) * 2 + v.pan.y, v.size.h);
    return { w: right - left, h: bottom - top };
  };

  it('leaves a pan that keeps the content on screen alone', () => {
    const v = vp(1.5, 100, 50, small);
    expect(clampPan(v, content)).toBe(v);
  });

  it('drags back a pan that took the content off to the right and bottom', () => {
    const v = clampPan(vp(1.5, 5000, 5000, small), content);
    expect(v.pan).toEqual({ x: 1000 - 64, y: 700 - 64 });
    expect(visible(v)).toEqual({ w: 64, h: 64 });
  });

  it('drags back a pan that took the content off to the left and top', () => {
    const v = clampPan(vp(1.5, -5000, -5000, small), content);
    expect(v.pan).toEqual({ x: 64 - 800, y: 64 - 600 });
  });

  it('a content narrower than 64 px must stay fully on screen', () => {
    const dot = { x: 0, y: 0, w: 10, h: 10 };
    const v = clampPan(vp(1.5, 5000, 0, small), dot);
    expect(v.pan.x).toBe(1000 - 20);
  });

  it('with nothing drawn there is nothing to clamp', () => {
    const v = vp(1.5, 99999, 99999);
    expect(clampPan(v, null)).toBe(v);
  });

  it('the clamped pan always keeps 64 px (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -9000, max: 9000, noNaN: true }),
        fc.double({ min: -9000, max: 9000, noNaN: true }),
        (x, y) => {
          const v = clampPan(vp(1.5, x, y, small), content);
          const s = visible(v);
          expect(s.w).toBeGreaterThanOrEqual(64 - 1e-9);
          expect(s.h).toBeGreaterThanOrEqual(64 - 1e-9);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('V5 reveal', () => {
  // zoom 1 -> 4/3 px per pt; the canvas is 1215 x 722, margin 48.
  const v0 = vp(1, 0, 0);
  const px = PX_PER_PT;

  it('an ink box fully visible inside the margin: unchanged', () => {
    const ink = { x: 100 / px, y: 100 / px, w: 200 / px, h: 100 / px };
    expect(reveal(v0, ink, SLIDES)).toBe(v0);
  });

  it('off screen but it fits: the smallest pan that brings it inside the margin', () => {
    const ink = { x: 1300 / px, y: 100 / px, w: 200 / px, h: 100 / px }; // x 1300..1500 px
    const r = reveal(v0, ink, SLIDES);
    expect(r.zoom).toBe(1);
    // Right edge ends at 1215 - 48 = 1167: pan by 1500 - 1167 = 333 to the left.
    expect(r.pan.x).toBeCloseTo(-333, 9);
    expect(r.pan.y).toBe(0);
  });

  it('too close to the top-left margin: pans the other way, per axis', () => {
    const ink = { x: 10 / px, y: 20 / px, w: 200 / px, h: 100 / px };
    const r = reveal(v0, ink, SLIDES);
    expect(r.pan.x).toBeCloseTo(38, 9);
    expect(r.pan.y).toBeCloseTo(28, 9);
  });

  it('only the offending axis moves', () => {
    const ink = { x: 100 / px, y: 700 / px, w: 200 / px, h: 100 / px }; // y 700..800 px
    const r = reveal(v0, ink, SLIDES);
    expect(r.pan.x).toBe(0);
    expect(r.pan.y).toBeCloseTo(-(800 - (722 - 48)), 9);
  });

  it('too big at the current zoom: zoom to min(fit, z0), centred on the ink box', () => {
    const ink = { x: 0, y: 0, w: 900, h: 300 }; // 1200 px wide at zoom 1: no room
    const r = reveal(v0, ink, SLIDES);
    expect(r.zoom).toBe(fitZoom(ink, canvas, SLIDES));
    expect(r.zoom).toBe(0.93);
    const c = ptToScreen(r, { x: 450, y: 150 });
    expect(c.x).toBeCloseTo(canvas.w / 2, 9);
    expect(c.y).toBeCloseTo(canvas.h / 2, 9);
  });

  it('too big, but the fit zoom is not below the current zoom: unchanged', () => {
    const atMin = vp(0.25, 0, 0);
    const ink = { x: 0, y: 0, w: 5000, h: 5000 }; // far too big even at 25 %
    expect(reveal(atMin, ink, SLIDES)).toBe(atMin);
  });

  it('never zooms in', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -3000, max: 3000, noNaN: true }),
        fc.double({ min: -3000, max: 3000, noNaN: true }),
        fc.double({ min: 1, max: 2000, noNaN: true }),
        fc.double({ min: 1, max: 2000, noNaN: true }),
        fc.constantFrom(0.25, 1, 1.5, 4),
        (x, y, w, h, zoom) => {
          const r = reveal(vp(zoom), { x, y, w, h }, SLIDES);
          expect(r.zoom).toBeLessThanOrEqual(zoom);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('V6 preset switch keeps the on-screen bond length', () => {
  it('Slides to Handout: 150 % becomes 416.67 %, the bond stays 80 px', () => {
    const v = vp(1.5, 52, 361);
    const next = switchPreset(v, SLIDES, JOURNAL);
    expect(next.zoom).toBeCloseTo(4.1667, 4);
    expect(next.zoom * PX_PER_PT * JOURNAL).toBeCloseTo(v.zoom * PX_PER_PT * SLIDES, 9);
  });

  it('the drawing point at the canvas centre stays there', () => {
    const v = vp(1.5, 52, 361);
    const centre = { x: canvas.w / 2, y: canvas.h / 2 };
    const next = switchPreset(v, SLIDES, JOURNAL);
    const before = screenToBlu(v, centre, SLIDES);
    const after = screenToBlu(next, centre, JOURNAL);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('is not snapped to steps and is clamped to the range', () => {
    expect(switchPreset(vp(3), SLIDES, JOURNAL).zoom).toBe(8);
    expect(switchPreset(vp(0.3), JOURNAL, SLIDES).zoom).toBe(0.25);
    expect(switchPreset(vp(1.37), SLIDES, 50).zoom).toBeCloseTo((1.37 * 40) / 50, 12);
  });

  it('there and back again restores the view (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.3, max: 1.9, noNaN: true }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        (zoom, x, y) => {
          const v = vp(zoom, x, y);
          const back = switchPreset(switchPreset(v, SLIDES, JOURNAL), JOURNAL, SLIDES);
          expect(back.zoom).toBeCloseTo(v.zoom, 9);
          expect(back.pan.x).toBeCloseTo(v.pan.x, 6);
          expect(back.pan.y).toBeCloseTo(v.pan.y, 6);
        },
      ),
      { numRuns: 100 },
    );
  });
});
