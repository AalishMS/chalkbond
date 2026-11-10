import { emptyDoc, type Doc, type PlusObject } from '@core/doc-model';
import { render } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import { itemBoxes } from '../model/move';
import { drawn } from '../state/testing';
import { plusTool } from './plus';
import { at, BL, click, NOW, rig, screenOf, send, type Rig } from './testing';

const plusRig = (doc: Doc = emptyDoc(NOW)): Rig => rig(plusTool, doc);
const pluses = (d: Doc): PlusObject[] =>
  Object.values(d.objects).filter((o): o is PlusObject => o.type === 'plus');

describe('Plus tool (R2)', () => {
  it('a click puts a plus centred on the point, one Add plus step', () => {
    const r = plusRig();
    click(r, screenOf({ x: 3, y: 2 }));
    expect(pluses(r.doc)).toHaveLength(1);
    expect(pluses(r.doc)[0]?.at.x).toBeCloseTo(3, 9);
    expect(pluses(r.doc)[0]?.at.y).toBeCloseTo(2, 9);
    expect(r.commits).toHaveLength(1);
    expect(r.commits[0]?.label).toBe('Add plus');
  });

  it('the plus is drawn centred on the click', () => {
    const r = plusRig();
    click(r, screenOf({ x: 3, y: 2 }));
    const id = pluses(r.doc)[0]?.id;
    const ink = render(r.doc).extents[`obj:${id}` as never] as {
      x: number;
      y: number;
      w: number;
      h: number;
    };
    expect(ink.x + ink.w / 2).toBeCloseTo(3 * BL, 6);
    expect(ink.y + ink.h / 2).toBeCloseTo(2 * BL, 6);
  });

  it("snaps to a molecule's centre y within 6 px and shows a guide", () => {
    const doc = drawn({ name: 'ethanol', x: 0, y: 0 });
    const box = itemBoxes(doc, render(doc))[0]?.box;
    if (!box) throw new Error('no box');
    const centreY = box.y + box.h / 2;
    const r = plusRig(doc);
    // 4 px above the centre line, far to the right of the molecule.
    const p = screenOf({ x: 8, y: centreY / BL });
    send(r, at({ x: p.x, y: p.y - 4 }, 'down'));
    expect(r.gesture?.overlay?.guides).toEqual([{ axis: 'y', pt: centreY }]);
    send(r, at({ x: p.x, y: p.y - 4 }, 'up'));
    expect(pluses(r.doc)[0]?.at.y).toBeCloseTo(centreY / BL, 6);
    expect(pluses(r.doc)[0]?.at.x).toBeCloseTo(8, 6);
  });

  it('does not snap beyond 6 px', () => {
    const doc = drawn({ name: 'ethanol', x: 0, y: 0 });
    const r = plusRig(doc);
    const p = screenOf({ x: 8, y: 0.8 });
    click(r, p);
    expect(pluses(r.doc)[0]?.at.y).toBeCloseTo(0.8, 6);
  });

  it('the ghost follows the pointer while the button is down and is gone after', () => {
    const r = plusRig();
    send(r, at(screenOf({ x: 3, y: 2 }), 'down'));
    expect(r.preview).not.toBeNull();
    expect(pluses(r.preview?.doc ?? r.doc)).toHaveLength(1);
    expect(r.doc.objects).toEqual({});
    send(r, at(screenOf({ x: 3, y: 2 }), 'up'));
    expect(r.preview).toBeNull();
  });

  it('Escape cancels without a step', () => {
    const r = plusRig();
    send(r, at(screenOf({ x: 3, y: 2 }), 'down'));
    send(r, { type: 'cancel' });
    expect(r.commits).toHaveLength(0);
    expect(r.gesture).toBeNull();
  });
});
