import { perceive } from '@core/chem-core';
import { fragments, type AtomId, type Doc, type Selection } from '@core/doc-model';
import { render } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import type { CanvasEvent } from '../model/canvas-event';
import type { Point } from '../model/geometry';
import { hitTest } from '../model/hit-test';
import { bluToScreen, screenToBlu, type Viewport } from '../model/viewport';
import { EMPTY_SELECTION, type GestureState, type Preview } from '../state/editor-state';
import { drawn } from '../state/testing';
import { eraseTool } from './erase';
import type { ToolContext, ToolStep } from './tool';

const BL = 40;
const viewport: Viewport = { zoom: 1.5, pan: { x: 400, y: 300 }, size: { w: 1200, h: 700 } };
const NONE = { shift: false, alt: false, ctrl: false };

const butane = (): Doc => drawn({ name: 'butane', x: 0, y: 0 });
const hexane = (): Doc => drawn({ name: 'hexane', x: 0, y: 0 });
const screenOf = (p: Point): Point => bluToScreen(viewport, p, BL);

interface Rig {
  doc: Doc;
  gesture: GestureState | null;
  preview: Preview | null | undefined;
  commits: NonNullable<ToolStep['commit']>[];
}

const rig = (doc: Doc): Rig => ({ doc, gesture: null, preview: null, commits: [] });

function send(r: Rig, ev: CanvasEvent): ToolStep {
  const scene = render(r.doc);
  const ctx: ToolContext = {
    doc: r.doc,
    scene,
    perception: perceive(r.doc),
    selection: EMPTY_SELECTION,
    viewport,
    hit: ev.type === 'down' ? hitTest(r.doc, scene, viewport, ev.screen) : null,
  };
  const step = eraseTool.step(r.gesture, ev, ctx);
  r.gesture = step.gesture;
  if (step.preview !== undefined) r.preview = step.preview;
  if (step.commit !== undefined) r.commits.push(step.commit);
  return step;
}

const at = (screen: Point, type: 'down' | 'move' | 'up', button: 0 | 1 | 2 = 0): CanvasEvent => ({
  type,
  p: screenToBlu(viewport, screen, BL),
  screen,
  button,
  mods: NONE,
});

/** Where the bond with index `n` (in id order) has its middle, on screen. */
const bondMid = (d: Doc, n: number): Point => {
  const bond = Object.values(d.bonds)[n];
  if (!bond) throw new Error('no bond');
  const a = d.atoms[bond.a1] as Point;
  const b = d.atoms[bond.a2] as Point;
  return screenOf({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
};

const applied = (d: Doc, c: NonNullable<ToolStep['commit']> | undefined): Doc => {
  if (c === undefined) throw new Error('no commit');
  return c.recipe(d);
};

describe('E1 click', () => {
  it('a click on a bond of butane erases it, and the carbon left bondless (E2)', () => {
    const r = rig(butane());
    const p = bondMid(r.doc, 0);
    send(r, at(p, 'down'));
    send(r, at(p, 'up'));
    expect(r.commits).toHaveLength(1);
    expect(r.commits[0]?.label).toBe('Erase');
    const after = applied(r.doc, r.commits[0]);
    // The end bond goes: its end carbon had no other bond and goes with it.
    expect(Object.keys(after.bonds)).toHaveLength(2);
    expect(Object.keys(after.atoms)).toHaveLength(3);
    expect(r.gesture).toBeNull();
  });

  it('the middle bond leaves two ethyl halves: no atom is orphaned', () => {
    const r = rig(butane());
    const p = bondMid(r.doc, 1);
    send(r, at(p, 'down'));
    send(r, at(p, 'up'));
    const after = applied(r.doc, r.commits[0]);
    expect(Object.keys(after.bonds)).toHaveLength(2);
    expect(Object.keys(after.atoms)).toHaveLength(4);
    expect(fragments(after)).toHaveLength(2);
  });

  it('a click on an atom erases it with its bonds', () => {
    const r = rig(butane());
    const atom = Object.values(r.doc.atoms)[1];
    if (!atom) throw new Error('no atom');
    const p = screenOf(atom);
    send(r, at(p, 'down'));
    send(r, at(p, 'up'));
    const after = applied(r.doc, r.commits[0]);
    expect(after.atoms[atom.id as AtomId]).toBeUndefined();
    expect(Object.keys(after.bonds)).toHaveLength(1);
  });

  it('the preview of the pressed item is ghosted until release', () => {
    const r = rig(butane());
    const bond = Object.values(r.doc.bonds)[1];
    const step = send(r, at(bondMid(r.doc, 1), 'down'));
    expect(step.preview?.faded).toContain(`bond:${bond?.id}`);
    expect(step.commit).toBeUndefined();
  });

  it('a click on empty canvas, or a press with another button, erases nothing', () => {
    const r = rig(butane());
    send(r, at({ x: 40, y: 650 }, 'down'));
    send(r, at({ x: 40, y: 650 }, 'up'));
    send(r, at(bondMid(r.doc, 0), 'down', 2));
    expect(r.commits).toHaveLength(0);
    expect(r.gesture).toBeNull();
  });
});

describe('E1 drag', () => {
  it('dragging across three bonds is one commit that removes them all', () => {
    const r = rig(hexane());
    send(r, at(bondMid(r.doc, 0), 'down'));
    send(r, at(bondMid(r.doc, 1), 'move'));
    send(r, at(bondMid(r.doc, 2), 'move'));
    expect(r.commits).toHaveLength(0);
    send(r, at(bondMid(r.doc, 2), 'up'));
    expect(r.commits).toHaveLength(1);
    const after = applied(r.doc, r.commits[0]);
    // Hexane has five bonds; three go. The first two atoms lose all bonds and go (E2).
    expect(Object.keys(after.bonds)).toHaveLength(2);
    expect(r.gesture).toBeNull();
  });

  it('ghosts every item the path has crossed, and history is not touched', () => {
    const r = rig(hexane());
    send(r, at(bondMid(r.doc, 0), 'down'));
    const step = send(r, at(bondMid(r.doc, 1), 'move'));
    const [b0, b1, b2] = Object.values(r.doc.bonds);
    expect(step.preview?.faded).toEqual(
      expect.arrayContaining([`bond:${b0?.id}`, `bond:${b1?.id}`]),
    );
    expect(step.preview?.faded).not.toContain(`bond:${b2?.id}`);
    expect(step.commit).toBeUndefined();
    expect(step.preview?.doc).toBe(r.doc);
  });

  it('a jump over a bond between two moves still erases it', () => {
    const r = rig(hexane());
    const a = bondMid(r.doc, 0);
    const c = bondMid(r.doc, 2);
    send(r, at(a, 'down'));
    // One move event from the first bond to the third: the second is crossed on the way.
    send(r, at(c, 'move'));
    send(r, at(c, 'up'));
    const after = applied(r.doc, r.commits[0]);
    expect(Object.keys(after.bonds)).toHaveLength(2);
  });

  it('Esc (cancel) throws the path away: no commit, no preview', () => {
    const r = rig(hexane());
    send(r, at(bondMid(r.doc, 0), 'down'));
    send(r, at(bondMid(r.doc, 1), 'move'));
    const step = send(r, { type: 'cancel' });
    expect(step.gesture).toBeNull();
    expect(step.preview).toBeNull();
    expect(r.commits).toHaveLength(0);
  });

  it('the erase leaves nothing selected', () => {
    const r = rig(hexane());
    send(r, at(bondMid(r.doc, 0), 'down'));
    send(r, at(bondMid(r.doc, 0), 'up'));
    const selection: Selection | 'inserted' | undefined = r.commits[0]?.selection;
    expect(selection).toBe(EMPTY_SELECTION);
  });
});
