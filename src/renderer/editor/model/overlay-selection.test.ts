import {
  addObject,
  fragments,
  type AtomId,
  type BondId,
  type Doc,
  type Selection,
} from '@core/doc-model';
import { render } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION } from '../state/editor-state';
import { drawn, wholeOf } from '../state/testing';
import {
  canvasOverlay,
  selectionGroups,
  SELECT_BAND,
  type OverlayGroup,
  type OverlayShape,
} from './overlay';
import { bluToScreen, ptToScreen, type Viewport } from './viewport';

const BL = 40;
const v: Viewport = { zoom: 1.5, pan: { x: 300, y: 200 }, size: { w: 1200, h: 700 } };
const only = (
  kind: OverlayGroup['kind'],
  groups: readonly OverlayGroup[],
): readonly OverlayShape[] => groups.find((g) => g.kind === kind)?.shapes ?? [];
const sel = (over: Partial<Selection>): Selection => ({ ...EMPTY_SELECTION, ...over });

const doc2 = (): Doc => drawn({ name: 'benzene', x: 0, y: 0 }, { name: 'ethanol', x: 6, y: 0 });
const ringAtoms = (doc: Doc): AtomId[] => fragments(doc).find((f) => f.length === 6) as AtomId[];
const at = (doc: Doc, id: AtomId) => {
  const atom = doc.atoms[id];
  if (!atom) throw new Error('no atom');
  return atom;
};

describe('selection overlay (screen 03)', () => {
  it('benzene fully selected: 6 bands of 12 px and no circle, in one selection group', () => {
    const doc = doc2();
    const groups = selectionGroups(wholeOf(doc, ringAtoms(doc)), doc, render(doc), v);
    const shapes = only('selection', groups);
    expect(shapes.filter((s) => s.kind === 'band')).toHaveLength(6);
    expect(shapes.filter((s) => s.kind === 'circle')).toHaveLength(0);
    expect(shapes.every((s) => s.kind !== 'band' || s.width === SELECT_BAND)).toBe(true);
    expect(SELECT_BAND).toBe(12);
    expect(groups.map((g) => g.kind)).toEqual(['selection', 'frame']);
  });

  it('a band runs between the two atoms of its bond', () => {
    const doc = doc2();
    const [bond] = Object.values(doc.bonds);
    if (!bond) throw new Error('no bond');
    const shapes = only(
      'selection',
      selectionGroups(sel({ bonds: new Set([bond.id]) }), doc, render(doc), v),
    );
    expect(shapes).toEqual([
      {
        kind: 'band',
        from: bluToScreen(v, at(doc, bond.a1), BL),
        to: bluToScreen(v, at(doc, bond.a2), BL),
        width: 12,
      },
    ]);
  });

  it('a narrowed atom is one circle of radius 12 on the atom', () => {
    const doc = doc2();
    const atom = ringAtoms(doc)[0] as AtomId;
    const shapes = only(
      'selection',
      selectionGroups(sel({ atoms: new Set([atom]) }), doc, render(doc), v),
    );
    expect(shapes).toEqual([{ kind: 'circle', c: bluToScreen(v, at(doc, atom), BL), r: 12 }]);
  });

  it('a selected atom whose selected bond covers it has no circle', () => {
    const doc = doc2();
    const [bond] = Object.values(doc.bonds);
    if (!bond) throw new Error('no bond');
    const s = sel({ atoms: new Set([bond.a1]), bonds: new Set([bond.id]) });
    const shapes = only('selection', selectionGroups(s, doc, render(doc), v));
    expect(shapes.filter((x) => x.kind === 'circle')).toHaveLength(0);
    expect(shapes.filter((x) => x.kind === 'band')).toHaveLength(1);
  });

  it('a selected label atom gets its extents box grown 3 px, radius 4 (screen 03b)', () => {
    const doc = doc2();
    const oxygen = Object.values(doc.atoms).find((a) => a.element === 'O');
    if (!oxygen) throw new Error('no O');
    const scene = render(doc);
    const ink = scene.extents[`atom:${oxygen.id}`];
    if (!ink) throw new Error('no extents');
    const a = ptToScreen(v, { x: ink.x, y: ink.y });
    const b = ptToScreen(v, { x: ink.x + ink.w, y: ink.y + ink.h });
    const shapes = only(
      'selection',
      selectionGroups(sel({ atoms: new Set([oxygen.id]) }), doc, scene, v),
    );
    expect(shapes).toEqual([
      {
        kind: 'box',
        rect: { x: a.x - 3, y: a.y - 3, w: b.x - a.x + 6, h: b.y - a.y + 6 },
        radius: 4,
      },
    ]);
  });

  it('objects: arrows get a 12 px band, others an extents box grown 4 px', () => {
    const [d1, arrow] = addObject(drawn(), {
      type: 'arrow',
      kind: 'forward',
      from: { x: 0, y: 0 },
      to: { x: 3, y: 0 },
    });
    const [doc, plus] = addObject(d1, { type: 'plus', at: { x: 5, y: 0 } });
    const scene = render(doc);
    const shapes = only(
      'selection',
      selectionGroups(sel({ objects: new Set([arrow, plus]) }), doc, scene, v),
    );
    expect(shapes.filter((s) => s.kind === 'band')).toEqual([
      {
        kind: 'band',
        from: bluToScreen(v, { x: 0, y: 0 }, BL),
        to: bluToScreen(v, { x: 3, y: 0 }, BL),
        width: 12,
      },
    ]);
    const ink = scene.extents[`obj:${plus}`];
    if (!ink) throw new Error('no extents');
    const a = ptToScreen(v, { x: ink.x, y: ink.y });
    const box = shapes.find((s) => s.kind === 'box');
    expect(box).toMatchObject({ radius: 4, rect: { x: a.x - 4 } });
  });

  it('nothing selected: no groups', () => {
    const doc = doc2();
    expect(selectionGroups(EMPTY_SELECTION, doc, render(doc), v)).toEqual([]);
  });

  it('an offset moves every shape (the drag fast path)', () => {
    const doc = doc2();
    const s = wholeOf(doc, ringAtoms(doc));
    const scene = render(doc);
    const base = selectionGroups(s, doc, scene, v);
    const moved = selectionGroups(s, doc, scene, v, { x: 10, y: -5 });
    const f0 = only('frame', base)[0];
    const f1 = only('frame', moved)[0];
    if (f0?.kind !== 'box' || f1?.kind !== 'box') throw new Error('no frame');
    expect(f1.rect.x - f0.rect.x).toBeCloseTo(10, 9);
    expect(f1.rect.y - f0.rect.y).toBeCloseTo(-5, 9);
    const b0 = only('selection', base)[0];
    const b1 = only('selection', moved)[0];
    if (b0?.kind !== 'band' || b1?.kind !== 'band') throw new Error('no band');
    expect(b1.from.x - b0.from.x).toBeCloseTo(10, 9);
  });
});

describe('selection frame', () => {
  it('is the union of the selected ink and vertices grown 8 px, on half pixels', () => {
    const doc = doc2();
    const scene = render(doc);
    const atoms = ringAtoms(doc);
    const frame = only('frame', selectionGroups(wholeOf(doc, atoms), doc, scene, v))[0];
    if (frame?.kind !== 'box') throw new Error('no frame');
    const xs = atoms.map((id) => bluToScreen(v, at(doc, id), BL).x);
    const ys = atoms.map((id) => bluToScreen(v, at(doc, id), BL).y);
    // The ink (bond strokes) reaches past the vertices, then 8 px more, within half a pixel.
    expect(frame.rect.x).toBeLessThanOrEqual(Math.min(...xs) - 8 + 0.5);
    expect(frame.rect.x).toBeGreaterThan(Math.min(...xs) - 8 - 4);
    expect(frame.rect.y).toBeLessThanOrEqual(Math.min(...ys) - 8 + 0.5);
    expect(frame.rect.x + frame.rect.w).toBeGreaterThanOrEqual(Math.max(...xs) + 8 - 0.5);
    expect(frame.rect.y + frame.rect.h).toBeGreaterThanOrEqual(Math.max(...ys) + 8 - 0.5);
    expect(frame.rect.x % 1).toBeCloseTo(0.5, 9);
    expect(frame.rect.y % 1).toBeCloseTo(0.5, 9);
    expect(frame.radius).toBe(0);
  });

  it('one narrowed atom: its vertex grown 8 px', () => {
    const doc = doc2();
    const atom = ringAtoms(doc)[0] as AtomId;
    const frame = only(
      'frame',
      selectionGroups(sel({ atoms: new Set([atom]) }), doc, render(doc), v),
    )[0];
    if (frame?.kind !== 'box') throw new Error('no frame');
    expect(frame.rect.w).toBeCloseTo(16, 0);
    expect(frame.rect.h).toBeCloseTo(16, 0);
  });

  it('a narrowed bond frames both of its atoms', () => {
    const doc = doc2();
    const [bond] = Object.values(doc.bonds);
    if (!bond) throw new Error('no bond');
    const frame = only(
      'frame',
      selectionGroups(sel({ bonds: new Set([bond.id]) }), doc, render(doc), v),
    )[0];
    if (frame?.kind !== 'box') throw new Error('no frame');
    const a = bluToScreen(v, at(doc, bond.a1), BL);
    const b = bluToScreen(v, at(doc, bond.a2), BL);
    expect(frame.rect.w).toBeGreaterThanOrEqual(Math.abs(a.x - b.x) + 15);
  });
});

describe('canvasOverlay: marquee, guides, merge', () => {
  const doc = doc2();
  const scene = render(doc);
  const view = {
    hover: null,
    selection: EMPTY_SELECTION,
    gesture: null,
    preview: null,
    doc,
    scene,
    viewport: v,
  } as const;

  it('draws nothing when idle', () => {
    expect(canvasOverlay(view)).toEqual([]);
  });

  it('a marquee is one filled box with square corners between its two corners', () => {
    const groups = canvasOverlay({
      ...view,
      gesture: {
        kind: 'select-marquee',
        overlay: { marquee: { from: { x: 0, y: 0 }, to: { x: 2, y: 1 } } },
      },
    });
    expect(only('marquee', groups)[0]).toEqual({
      kind: 'box',
      rect: { x: v.pan.x, y: v.pan.y, w: 2 * BL * 2, h: 1 * BL * 2 },
      radius: 0,
    });
  });

  it('a marquee dragged up and left has the same box', () => {
    const groups = canvasOverlay({
      ...view,
      gesture: {
        kind: 'select-marquee',
        overlay: { marquee: { from: { x: 2, y: 1 }, to: { x: 0, y: 0 } } },
      },
    });
    expect(only('marquee', groups)[0]).toMatchObject({ rect: { x: v.pan.x, y: v.pan.y } });
  });

  it('a snapping guide is a vertical or horizontal line across the canvas', () => {
    const groups = canvasOverlay({
      ...view,
      gesture: {
        kind: 'select-move',
        overlay: {
          guides: [
            { axis: 'x', pt: 100 },
            { axis: 'y', pt: 50 },
          ],
        },
      },
    });
    const x = ptToScreen(v, { x: 100, y: 0 }).x;
    const y = ptToScreen(v, { x: 0, y: 50 }).y;
    expect(only('guide', groups)).toEqual([
      { kind: 'line', from: { x, y: 0 }, to: { x, y: v.size.h } },
      { kind: 'line', from: { x: 0, y }, to: { x: v.size.w, y } },
    ]);
  });

  it('a merge target gets a circle of radius 9 in the merge group', () => {
    const atom = ringAtoms(doc)[0] as AtomId;
    const groups = canvasOverlay({
      ...view,
      preview: { doc, added: new Set(), mergeTarget: atom },
    });
    expect(only('merge', groups)).toEqual([
      { kind: 'circle', c: bluToScreen(v, at(doc, atom), BL), r: 9 },
    ]);
  });

  it('a label atom as merge target gets its box', () => {
    const oxygen = Object.values(doc.atoms).find((a) => a.element === 'O');
    if (!oxygen) throw new Error('no O');
    const groups = canvasOverlay({
      ...view,
      preview: { doc, added: new Set(), mergeTarget: oxygen.id },
    });
    expect(only('merge', groups)[0]?.kind).toBe('box');
  });

  it('the hover group is kept, and ordered after the selection', () => {
    const bond = Object.keys(doc.bonds)[0] as BondId;
    const groups = canvasOverlay({
      ...view,
      hover: { kind: 'bond', id: bond },
      selection: wholeOf(doc, ringAtoms(doc)),
    });
    expect(groups.map((g) => g.kind)).toEqual(['selection', 'frame', 'hover', 'handle']);
  });

  it('a chain gesture draws its carbon count as one badge by the pointer, last of all', () => {
    const at = { x: 321.5, y: 210 };
    const groups = canvasOverlay({
      ...view,
      gesture: { kind: 'chain-drag', overlay: { count: { at, n: 7 } } },
    });
    expect(groups.at(-1)?.kind).toBe('count');
    const [badge] = only('count', groups);
    expect(badge).toMatchObject({ kind: 'badge', text: '7' });
    expect((badge as { rect: { x: number; y: number } }).rect).toMatchObject({
      x: at.x + 14,
      y: at.y + 14,
    });
  });

  it('while a translate preview runs the selection shapes follow it', () => {
    const s = wholeOf(doc, ringAtoms(doc));
    const still = canvasOverlay({ ...view, selection: s });
    const dxPt = 30;
    const moving = canvasOverlay({
      ...view,
      selection: s,
      preview: { doc, added: new Set(), translate: { keys: [], dx: dxPt, dy: 0 } },
    });
    const f0 = only('frame', still)[0];
    const f1 = only('frame', moving)[0];
    if (f0?.kind !== 'box' || f1?.kind !== 'box') throw new Error('no frame');
    expect(f1.rect.x - f0.rect.x).toBeCloseTo(dxPt * v.zoom * (4 / 3), 9);
  });
});
