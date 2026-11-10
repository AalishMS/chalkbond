import { addAtom, addBond, emptyDoc, type AtomId, type Doc } from '@core/doc-model';
import { render } from '@core/svg-render';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { HIT_ALL, hitTest } from './hit-test';
import { bluToScreen, clampZoom, type Viewport } from './viewport';

const BL = 40;
const NOW = '2026-01-01T00:00:00.000Z';

const coordinate = fc.integer({ min: -2000, max: 2000 }).map((n) => n / 100);
const zoomArb = fc.double({ min: 0.25, max: 8, noNaN: true }).map(clampZoom);
const viewportArb = fc
  .tuple(zoomArb, fc.integer({ min: -500, max: 500 }), fc.integer({ min: -500, max: 500 }))
  .map(([zoom, x, y]): Viewport => ({ zoom, pan: { x, y }, size: { w: 1200, h: 700 } }));

/** Isolated carbons at distinct positions (distinct by construction: index-spaced columns). */
function atomsDoc(ys: number[]): { doc: Doc; ids: AtomId[] } {
  let doc = emptyDoc(NOW);
  const ids: AtomId[] = [];
  ys.forEach((y, i) => {
    let id: AtomId;
    [doc, id] = addAtom(doc, { element: 'C', x: i * 0.37, y });
    ids.push(id);
  });
  return { doc, ids };
}

describe("property 5: an atom's own point hits it", () => {
  it('at any zoom and pan, the point of atom i returns atom i', () => {
    fc.assert(
      fc.property(
        fc.array(coordinate, { minLength: 1, maxLength: 12 }),
        viewportArb,
        fc.nat(),
        (ys, v, pick) => {
          const { doc, ids } = atomsDoc(ys);
          const i = pick % ids.length;
          const atom = doc.atoms[ids[i] as AtomId];
          if (!atom) throw new Error('missing atom');
          const hit = hitTest(doc, render(doc), v, bluToScreen(v, atom, BL), HIT_ALL);
          expect(hit).toEqual({ kind: 'atom', id: ids[i] });
        },
      ),
    );
  });

  it('a point 9 px from a skeleton vertex hits it and 11 px misses, at any zoom', () => {
    fc.assert(
      fc.property(
        coordinate,
        coordinate,
        viewportArb,
        fc.integer({ min: 60, max: 120 }),
        fc.boolean(),
        (x, y, v, deg, below) => {
          // A 10 BLU bond: both ends are unlabelled vertices, and a point to the side of the
          // first one (60 to 120 degrees off the bond) is clear of the bond itself.
          const [d1, a] = addAtom(emptyDoc(NOW), { element: 'C', x, y });
          const [d2, b] = addAtom(d1, { element: 'C', x: x + 10, y });
          const doc = addBond(d2, a, b)[0];
          const scene = render(doc);
          const c = bluToScreen(v, { x, y }, BL);
          const r = ((below ? deg : -deg) * Math.PI) / 180;
          const at = (d: number) => ({ x: c.x + d * Math.cos(r), y: c.y + d * Math.sin(r) });
          expect(hitTest(doc, scene, v, at(9), HIT_ALL)).toEqual({ kind: 'atom', id: a });
          expect(hitTest(doc, scene, v, at(11), HIT_ALL)).toBeNull();
        },
      ),
    );
  });
});
