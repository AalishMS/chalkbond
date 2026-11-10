import { emptyDoc, type ArrowObject, type Doc } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { angleDeg, distance } from '../model/geometry';
import { drawn } from '../state/testing';
import { arrowTool } from './arrow';
import { DRAG_PX } from './tool';
import { at, BOND_PX, click, drag, NOW, rig, screenOf, send, SHIFT, type Rig } from './testing';

const arrowRig = (doc: Doc = emptyDoc(NOW), variant = 'forward'): Rig =>
  rig(arrowTool, doc, variant);
const arrows = (d: Doc): ArrowObject[] =>
  Object.values(d.objects).filter((o): o is ArrowObject => o.type === 'arrow');
const START = screenOf({ x: 2, y: 2 });
const to = (from: { x: number; y: number }, deg: number, px: number) => ({
  x: from.x + px * Math.cos((deg * Math.PI) / 180),
  y: from.y + px * Math.sin((deg * Math.PI) / 180),
});

describe('Arrow drag (R1)', () => {
  it('a 240 px rightward drag is a horizontal arrow of 3 BLU, one Add arrow step', () => {
    const r = arrowRig();
    drag(r, START, { x: START.x + 240, y: START.y });
    expect(r.commits).toHaveLength(1);
    expect(r.commits[0]?.label).toBe('Add arrow');
    const [a] = arrows(r.doc);
    expect(a).toMatchObject({ kind: 'forward', from: { x: 2, y: 2 }, to: { x: 5, y: 2 } });
  });

  it('a drag 10 degrees off horizontal snaps to 15; 20 degrees to 15; 5 degrees to 0', () => {
    for (const [deg, want] of [
      [10, 15],
      [20, 15],
      [5, 0],
      [-40, -45],
    ] as const) {
      const r = arrowRig();
      drag(r, START, to(START, deg, 240));
      const [a] = arrows(r.doc);
      if (!a) throw new Error('no arrow');
      expect(angleDeg(a.from, a.to)).toBeCloseTo(want, 6);
      expect(distance(a.from, a.to)).toBeCloseTo(3, 6);
    }
  });

  it('Shift leaves the angle free', () => {
    const r = arrowRig();
    drag(r, START, to(START, 20, 240), SHIFT);
    const [a] = arrows(r.doc);
    expect(angleDeg(a?.from ?? START, a?.to ?? START)).toBeCloseTo(20, 6);
  });

  it('the option picks the kind', () => {
    for (const [variant, kind] of [
      ['forward', 'forward'],
      ['equilibrium', 'equilibrium'],
      ['resonance', 'resonance'],
      ['nogo', 'no-go'],
    ] as const) {
      const r = arrowRig(emptyDoc(NOW), variant);
      drag(r, START, { x: START.x + 240, y: START.y });
      expect(arrows(r.doc)[0]?.kind).toBe(kind);
    }
  });

  it('the ghost is the arrow and shows while dragging, not before', () => {
    const r = arrowRig();
    send(r, at(START, 'down'));
    expect(r.preview).toBeNull();
    send(r, at({ x: START.x + 2, y: START.y }, 'move'));
    expect(r.preview).toBeNull();
    send(r, at({ x: START.x + 240, y: START.y + 20 }, 'move'));
    const ghost = r.preview;
    expect(ghost).not.toBeNull();
    expect(arrows(ghost?.doc ?? r.doc)).toHaveLength(1);
    expect([...(ghost?.added ?? [])]).toHaveLength(1);
    expect(r.doc.objects).toEqual({});
    send(r, at({ x: START.x + 240, y: START.y + 20 }, 'up'));
    expect(r.preview).toBeNull();
    expect(r.commits).toHaveLength(1);
  });

  it('Escape drops the gesture without a step', () => {
    const r = arrowRig();
    send(r, at(START, 'down'));
    send(r, at({ x: START.x + 240, y: START.y }, 'move'));
    send(r, { type: 'cancel' });
    expect(r.gesture).toBeNull();
    expect(r.preview).toBeNull();
    expect(r.commits).toHaveLength(0);
  });

  it('a right-button press starts nothing', () => {
    const r = arrowRig();
    send(r, at(START, 'down', undefined, 2));
    expect(r.gesture).toBeNull();
  });
});

describe('Arrow click (R1)', () => {
  it('a click makes the default arrow, 2.5 BLU to the right of the point', () => {
    const r = arrowRig();
    click(r, START);
    expect(arrows(r.doc)).toHaveLength(1);
    expect(arrows(r.doc)[0]).toMatchObject({ from: { x: 2, y: 2 }, to: { x: 4.5, y: 2 } });
    expect(r.commits[0]?.label).toBe('Add arrow');
  });

  it('a drag under 0.5 BLU (40 px) counts as a click', () => {
    const r = arrowRig();
    drag(r, START, { x: START.x + BOND_PX * 0.3, y: START.y });
    expect(arrows(r.doc)[0]?.to).toEqual({ x: 4.5, y: 2 });
    expect(DRAG_PX).toBeLessThan(BOND_PX * 0.3);
  });

  it('a click on an existing arrow sets its kind, in one Change arrow step', () => {
    const r = arrowRig(emptyDoc(NOW), 'forward');
    drag(r, START, { x: START.x + 240, y: START.y });
    r.variant = 'equilibrium';
    click(r, { x: START.x + 120, y: START.y });
    expect(arrows(r.doc)).toHaveLength(1);
    expect(arrows(r.doc)[0]?.kind).toBe('equilibrium');
    expect(r.commits).toHaveLength(2);
    expect(r.commits[1]?.label).toBe('Change arrow');
  });

  it('clicking an arrow that is already that kind is no step', () => {
    const r = arrowRig();
    drag(r, START, { x: START.x + 240, y: START.y });
    click(r, { x: START.x + 120, y: START.y });
    expect(r.commits).toHaveLength(1);
    expect(arrows(r.doc)).toHaveLength(1);
  });

  it('arrows and atoms are not confused: a click on a molecule makes the default arrow there', () => {
    const doc = drawn({ name: 'ethanol', x: 2, y: 2 });
    const r = arrowRig(doc);
    click(r, screenOf({ x: 2, y: 2 }));
    expect(arrows(r.doc)).toHaveLength(1);
    expect(Object.keys(r.doc.atoms)).toHaveLength(Object.keys(doc.atoms).length);
  });
});

describe('Arrow hover', () => {
  it('has no hover ghost', () => {
    expect(arrowTool.hover).toBeUndefined();
  });
});
