import { perceive } from '@core/chem-core';
import { fragments, type AtomId, type Doc, type Selection } from '@core/doc-model';
import { render } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import type { CanvasEvent } from '../model/canvas-event';
import type { Point } from '../model/geometry';
import { hitTest } from '../model/hit-test';
import { itemBoxes, movedInk } from '../model/move';
import { bluToScreen, screenToBlu, type Viewport } from '../model/viewport';
import { EMPTY_SELECTION, type GestureState, type Preview } from '../state/editor-state';
import { drawn, wholeOf } from '../state/testing';
import { selectTool } from './select';
import type { ToolContext, ToolStep } from './tool';

const BL = 40;
/** 2 px per pt, so 80 px per BLU. */
const viewport: Viewport = { zoom: 1.5, pan: { x: 400, y: 300 }, size: { w: 1200, h: 700 } };
const NONE = { shift: false, alt: false, ctrl: false };
const SHIFT = { shift: true, alt: false, ctrl: false };
const ALT = { shift: false, alt: true, ctrl: false };

const doc = (): Doc => drawn({ name: 'benzene', x: 0, y: 0 }, { name: 'ethanol', x: 6, y: 0 });
const ring = (d: Doc): AtomId[] => fragments(d).find((f) => f.length === 6) as AtomId[];
const eth = (d: Doc): AtomId[] => fragments(d).find((f) => f.length === 3) as AtomId[];
const px = (d: Doc, id: AtomId): Point => bluToScreen(viewport, d.atoms[id] as Point, BL);
const plus = (p: Point, x: number, y: number): Point => ({ x: p.x + x, y: p.y + y });

interface Rig {
  doc: Doc;
  selection: Selection;
  gesture: GestureState | null;
  preview: Preview | null | undefined;
  last: ToolStep | null;
  commits: NonNullable<ToolStep['commit']>[];
}

function rig(d: Doc = doc(), selection: Selection = EMPTY_SELECTION): Rig {
  return { doc: d, selection, gesture: null, preview: null, last: null, commits: [] };
}

function send(r: Rig, ev: CanvasEvent): ToolStep {
  const scene = render(r.doc);
  const ctx: ToolContext = {
    doc: r.doc,
    scene,
    perception: perceive(r.doc),
    selection: r.selection,
    viewport,
    hit: ev.type === 'down' ? hitTest(r.doc, scene, viewport, ev.screen) : null,
  };
  const step = selectTool.step(r.gesture, ev, ctx);
  r.gesture = step.gesture;
  if (step.selection !== undefined) r.selection = step.selection;
  if (step.preview !== undefined) r.preview = step.preview;
  if (step.commit !== undefined) r.commits.push(step.commit);
  r.last = step;
  return step;
}

const at = (screen: Point, type: 'down' | 'move' | 'up', mods = NONE): CanvasEvent => ({
  type,
  p: screenToBlu(viewport, screen, BL),
  screen,
  button: 0,
  mods,
});

/** Press at `from`, move to `to` (modifiers on the moves), leave the pointer down. */
function dragTo(r: Rig, from: Point, to: Point, down = NONE, mods = NONE): void {
  send(r, at(from, 'down', down));
  send(r, at(to, 'move', mods));
}

/** The document after applying a commit's recipe. */
const applied = (d: Doc, c: NonNullable<ToolStep['commit']> | undefined): Doc => {
  if (c === undefined) throw new Error('no commit');
  return c.recipe(d);
};

describe('S2 / S3 moving', () => {
  it('a drag of an unselected fragment selects it (S1), previews a translation, commits once', () => {
    const r = rig();
    const start = px(r.doc, ring(r.doc)[0] as AtomId);
    dragTo(r, start, plus(start, 160, 100));
    expect(r.gesture?.kind).toBe('select-move');
    expect(r.selection.atoms.size).toBe(6);
    // 160 px = 80 pt, 100 px = 50 pt: the whole fragment translates, nothing re-renders.
    expect(r.preview?.translate?.dx).toBeCloseTo(80, 9);
    expect(r.preview?.translate?.dy).toBeCloseTo(50, 9);
    expect(r.preview?.translate?.keys.length).toBeGreaterThan(6);
    expect(r.commits).toHaveLength(0);

    send(r, at(plus(start, 160, 100), 'up'));
    expect(r.commits).toHaveLength(1);
    expect(r.commits[0]?.label).toBe('Move');
    expect(r.gesture).toBeNull();
    expect(r.last?.preview).toBeNull();
    const after = applied(r.doc, r.commits[0]);
    for (const id of ring(r.doc)) {
      const before = r.doc.atoms[id] as Point;
      const now = after.atoms[id] as Point;
      expect(now.x - before.x).toBeCloseTo(2, 9);
      expect(now.y - before.y).toBeCloseTo(1.25, 9);
    }
    for (const id of eth(r.doc)) expect(after.atoms[id]).toEqual(r.doc.atoms[id]);
  });

  it('a drag from an item already selected moves the selection as it is (no narrowing)', () => {
    const d = doc();
    const whole = wholeOf(d, ring(d));
    const r = rig(d, whole);
    const start = px(d, ring(d)[2] as AtomId);
    dragTo(r, start, plus(start, 120, 90));
    expect(r.gesture?.kind).toBe('select-move');
    expect(r.selection).toBe(whole);
  });

  it('a drag of a narrowed atom moves just that atom: a full preview of the changed document', () => {
    const d = doc();
    const atom = ring(d)[0] as AtomId;
    const r = rig(d, { ...EMPTY_SELECTION, atoms: new Set([atom]) });
    const start = px(d, atom);
    dragTo(r, start, plus(start, 40, 30));
    expect(r.preview?.translate).toBeUndefined();
    const moved = r.preview?.doc.atoms[atom] as Point;
    expect(moved.x - (d.atoms[atom] as Point).x).toBeCloseTo(0.5, 9);
    expect(moved.y - (d.atoms[atom] as Point).y).toBeCloseTo(0.375, 9);
    send(r, at(plus(start, 40, 30), 'up'));
    const after = applied(d, r.commits[0]);
    expect(after.atoms[atom]).not.toEqual(d.atoms[atom]);
    expect(after.atoms[ring(d)[1] as AtomId]).toEqual(d.atoms[ring(d)[1] as AtomId]);
  });

  it('Alt+drag from an unselected atom picks that atom and moves it alone', () => {
    const r = rig();
    const atom = ring(r.doc)[0] as AtomId;
    const start = px(r.doc, atom);
    dragTo(r, start, plus(start, 60, 60), ALT);
    expect([...r.selection.atoms]).toEqual([atom]);
    expect(r.selection.bonds.size).toBe(0);
    expect(r.preview?.translate).toBeUndefined();
  });

  it('Shift on the moves constrains to horizontal or vertical', () => {
    const r = rig();
    const start = px(r.doc, ring(r.doc)[0] as AtomId);
    dragTo(r, start, plus(start, 160, 40), NONE, SHIFT);
    expect(r.preview?.translate?.dx).toBeCloseTo(80, 9);
    expect(r.preview?.translate?.dy).toBe(0);
    send(r, at(plus(start, 40, 160), 'move', SHIFT));
    expect(r.preview?.translate?.dx).toBe(0);
    expect(r.preview?.translate?.dy).toBeCloseTo(80, 9);
  });

  it('previews never commit; a cancel drops the gesture and the preview', () => {
    const r = rig();
    const start = px(r.doc, ring(r.doc)[0] as AtomId);
    dragTo(r, start, plus(start, 100, 100));
    send(r, at(plus(start, 120, 100), 'move'));
    expect(r.commits).toHaveLength(0);
    send(r, { type: 'cancel' });
    expect(r.gesture).toBeNull();
    expect(r.last?.preview).toBeNull();
    expect(r.commits).toHaveLength(0);
  });

  it('a drag returned to its start commits nothing', () => {
    const r = rig();
    const start = px(r.doc, ring(r.doc)[0] as AtomId);
    dragTo(r, start, plus(start, 100, 100));
    send(r, at(start, 'move'));
    send(r, at(start, 'up'));
    expect(r.commits).toHaveLength(0);
    expect(r.gesture).toBeNull();
  });
});

describe('S3 snapping with guides', () => {
  /** Centres (pt) of the benzene ink box and of the ethanol ink box. */
  function centres(d: Doc): { ring: Point; eth: Point } {
    const scene = render(d);
    const ringInk = movedInk(d, scene, wholeOf(d, ring(d)));
    const ethBox = itemBoxes(d, scene).find((b) => b.atoms.some((id) => eth(d).includes(id)));
    if (!ringInk || !ethBox) throw new Error('no boxes');
    const c = (b: { x: number; y: number; w: number; h: number }) => ({
      x: b.x + b.w / 2,
      y: b.y + b.h / 2,
    });
    return { ring: c(ringInk), eth: c(ethBox.box) };
  }

  it('snaps the centre y within 6 px, draws a guide, removes it on release', () => {
    const r = rig();
    const c = centres(r.doc);
    const start = px(r.doc, ring(r.doc)[0] as AtomId);
    // 3 px (1.5 pt) short of aligning the centres vertically; x is far from any centre.
    const dyPx = (c.eth.y - c.ring.y) * 2 - 3;
    dragTo(r, start, plus(start, 160, dyPx));
    expect(r.gesture?.overlay?.guides).toEqual([{ axis: 'y', pt: c.eth.y }]);
    expect(r.preview?.translate?.dy).toBeCloseTo(c.eth.y - c.ring.y, 9);
    expect(r.preview?.translate?.dx).toBeCloseTo(80, 9);
    send(r, at(plus(start, 160, dyPx), 'up'));
    expect(r.gesture).toBeNull();
    const after = applied(r.doc, r.commits[0]);
    const a = ring(r.doc)[0] as AtomId;
    const dy = (after.atoms[a] as Point).y - (r.doc.atoms[a] as Point).y;
    expect(dy * BL).toBeCloseTo(c.eth.y - c.ring.y, 9);
  });

  it('does not snap beyond 6 px: no guide', () => {
    const r = rig();
    const c = centres(r.doc);
    const start = px(r.doc, ring(r.doc)[0] as AtomId);
    dragTo(r, start, plus(start, 160, (c.eth.y - c.ring.y) * 2 - 7));
    expect(r.gesture?.overlay?.guides ?? []).toEqual([]);
  });

  it('no modifier disables it (R4)', () => {
    const r = rig();
    const c = centres(r.doc);
    const start = px(r.doc, ring(r.doc)[0] as AtomId);
    dragTo(r, start, plus(start, 160, (c.eth.y - c.ring.y) * 2 - 3), NONE, ALT);
    expect(r.gesture?.overlay?.guides).toHaveLength(1);
  });

  it('with Shift the constrained axis is not snapped', () => {
    const r = rig();
    const c = centres(r.doc);
    const start = px(r.doc, ring(r.doc)[0] as AtomId);
    // Mostly horizontal: y is locked to 0 even though the y centres are near each other.
    dragTo(r, start, plus(start, 240, (c.eth.y - c.ring.y) * 2 - 3), NONE, SHIFT);
    expect(r.preview?.translate?.dy).toBe(0);
  });
});

describe('S4 join atoms', () => {
  it('a single atom released over another atom is "Join atoms" via mergeAtoms', () => {
    const d = doc();
    const atom = ring(d)[0] as AtomId;
    const target = eth(d).find((id) => d.atoms[id]?.element === 'C') as AtomId;
    const r = rig(d, { ...EMPTY_SELECTION, atoms: new Set([atom]) });
    const start = px(d, atom);
    const end = px(d, target);
    dragTo(r, start, plus(end, 3, 2));
    expect(r.preview?.mergeTarget).toBe(target);
    send(r, at(plus(end, 3, 2), 'up'));
    expect(r.commits).toHaveLength(1);
    expect(r.commits[0]?.label).toBe('Join atoms');
    const after = applied(d, r.commits[0]);
    expect(Object.keys(after.atoms)).toHaveLength(Object.keys(d.atoms).length - 1);
    expect(atom in after.atoms).toBe(false);
    expect(target in after.atoms).toBe(true);
  });

  it('away from any atom it is a plain "Move"', () => {
    const d = doc();
    const atom = ring(d)[0] as AtomId;
    const r = rig(d, { ...EMPTY_SELECTION, atoms: new Set([atom]) });
    const start = px(d, atom);
    dragTo(r, start, plus(start, 30, -40));
    expect(r.preview?.mergeTarget).toBeUndefined();
    send(r, at(plus(start, 30, -40), 'up'));
    expect(r.commits[0]?.label).toBe('Move');
  });

  it('a whole fragment never joins', () => {
    const d = doc();
    const atom = ring(d)[0] as AtomId;
    const target = eth(d).find((id) => d.atoms[id]?.element === 'C') as AtomId;
    const r = rig(d, wholeOf(d, ring(d)));
    const start = px(d, atom);
    dragTo(r, start, px(d, target));
    expect(r.preview?.mergeTarget).toBeUndefined();
  });
});
