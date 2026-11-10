import { createNameIndex } from '@core/chem-core';
import {
  addAtom,
  addBond,
  addObject,
  canUndo,
  current,
  fragments,
  undo,
  undoLabel,
  type AtomId,
  type BondId,
  type Doc,
  type ObjectId,
  type Selection,
} from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import compounds from '../../../../resources/compounds/compounds.json';
import type { CanvasEvent } from '../model/canvas-event';
import { conditionAt } from '../model/conditions';
import { selectionCentre } from '../model/frame';
import type { Point } from '../model/geometry';
import { selectionHandles } from '../model/handles';
import { bluToScreen, ptToScreen, screenToBlu } from '../model/viewport';
import { EMPTY_SELECTION, type EditorState } from './editor-state';
import { hoverAt } from './hover';
import { reduce, type EditorAction } from './reducer';
import { drawn, freshState, testContext, wholeOf } from './testing';

const ctx = { ...testContext(), names: createNameIndex(compounds) };
const run = (s: EditorState, a: EditorAction): EditorState => reduce(s, a, ctx);
const BL = 40;
const NONE = { shift: false, alt: false, ctrl: false };
const SHIFT = { shift: true, alt: false, ctrl: false };

const ready = (doc: Doc, selection: Selection = EMPTY_SELECTION): EditorState => {
  let s = run(freshState(doc), { type: 'canvas-resized', size: { w: 1200, h: 700 } });
  s = run(s, { type: 'select-tool', tool: 'select' });
  return run(s, { type: 'set-selection', selection });
};
const ev = (
  s: EditorState,
  type: 'down' | 'move' | 'up',
  screen: Point,
  mods = NONE,
): EditorAction => ({
  type: 'pointer',
  event: { type, screen, p: screenToBlu(s.viewport, screen, BL), button: 0, mods } as CanvasEvent,
});
const docOf = (s: EditorState): Doc => current(s.history);
const handleAt = (s: EditorState, which: string): Point => {
  const doc = docOf(s);
  const { scene } = ctx.derive.committed(doc);
  const found = selectionHandles(doc, scene, s.viewport, s.selection).find(
    (h) => h.hit.handle === which,
  );
  if (!found) throw new Error(`no ${which} handle`);
  return found.at;
};
const rotated = (p: Point, about: Point, deg: number): Point => {
  const r = (deg * Math.PI) / 180;
  const d = { x: p.x - about.x, y: p.y - about.y };
  return {
    x: about.x + d.x * Math.cos(r) - d.y * Math.sin(r),
    y: about.y + d.x * Math.sin(r) + d.y * Math.cos(r),
  };
};
const centreOnScreen = (s: EditorState): Point => {
  const doc = docOf(s);
  const c = selectionCentre(doc, ctx.derive.committed(doc).scene, s.selection);
  if (!c) throw new Error('no centre');
  return ptToScreen(s.viewport, c);
};

describe('rotate handle (S5)', () => {
  const benzene = (): EditorState => {
    const doc = drawn({ name: 'benzene', x: 0, y: 0 }, { name: 'ethanol', x: 6, y: 0 });
    const ring = fragments(doc).find((f) => f.length === 6) as AtomId[];
    return ready(doc, wholeOf(doc, ring));
  };

  it('a 40 degree drag snaps to 45 degrees; the preview shows it and history is untouched', () => {
    let s = benzene();
    const before = docOf(s);
    const handle = handleAt(s, 'rotate');
    const centre = centreOnScreen(s);
    s = run(s, ev(s, 'down', handle));
    expect(s.gesture?.kind).toBe('select-rotate');
    s = run(s, ev(s, 'move', rotated(handle, centre, 40)));
    expect(canUndo(s.history)).toBe(false);
    expect(docOf(s)).toBe(before);
    const first = [...s.selection.atoms][0] as AtomId;
    const p0 = before.atoms[first] as Point;
    const p1 = s.preview?.doc.atoms[first] as Point;
    const c = screenToBlu(s.viewport, centre, BL);
    const turned = rotated(p0, c, 45);
    expect(p1.x).toBeCloseTo(turned.x, 9);
    expect(p1.y).toBeCloseTo(turned.y, 9);
  });

  it('release commits one "Rotate" step about the frame centre; undo restores', () => {
    let s = benzene();
    const before = docOf(s);
    const handle = handleAt(s, 'rotate');
    const centre = centreOnScreen(s);
    const target = rotated(handle, centre, 90);
    s = run(s, ev(s, 'down', handle));
    s = run(s, ev(s, 'move', target));
    s = run(s, ev(s, 'up', target));
    expect(s.gesture).toBeNull();
    expect(s.preview).toBeNull();
    expect(undoLabel(s.history)).toBe('Rotate');
    expect(s.history.past).toHaveLength(1);
    // A quarter turn about the centre: the ring's centre of atoms stays put.
    const ring = [...s.selection.atoms];
    const mean = (d: Doc): Point => ({
      x: ring.reduce((t, id) => t + (d.atoms[id] as Point).x, 0) / ring.length,
      y: ring.reduce((t, id) => t + (d.atoms[id] as Point).y, 0) / ring.length,
    });
    expect(mean(docOf(s)).x).toBeCloseTo(mean(before).x, 9);
    expect(mean(docOf(s)).y).toBeCloseTo(mean(before).y, 9);
    expect(docOf(s)).not.toEqual(before);
    expect(docOf({ ...s, history: undo(s.history) })).toEqual(before);
    // The selection, and so the frame and handle, follow the rotated ring.
    expect(s.selection.atoms.size).toBe(6);
  });

  it('Shift rotates freely', () => {
    let s = benzene();
    const handle = handleAt(s, 'rotate');
    const centre = centreOnScreen(s);
    s = run(s, ev(s, 'down', handle));
    s = run(s, ev(s, 'move', rotated(handle, centre, 40), SHIFT));
    const first = [...s.selection.atoms][0] as AtomId;
    const p0 = docOf(s).atoms[first] as Point;
    const c = screenToBlu(s.viewport, centre, BL);
    const p1 = s.preview?.doc.atoms[first] as Point;
    expect(p1.x).toBeCloseTo(rotated(p0, c, 40).x, 9);
  });

  it('releasing without turning commits nothing', () => {
    let s = benzene();
    const handle = handleAt(s, 'rotate');
    s = run(s, ev(s, 'down', handle));
    s = run(s, ev(s, 'up', handle));
    expect(canUndo(s.history)).toBe(false);
    expect(s.gesture).toBeNull();
  });

  it('Esc cancels the turn: nothing changes', () => {
    let s = benzene();
    const handle = handleAt(s, 'rotate');
    const centre = centreOnScreen(s);
    s = run(s, ev(s, 'down', handle));
    s = run(s, ev(s, 'move', rotated(handle, centre, 90)));
    s = run(s, { type: 'escape' });
    expect(s.gesture).toBeNull();
    expect(s.preview).toBeNull();
    expect(canUndo(s.history)).toBe(false);
  });

  it('hovering the handle reports it (cursor), and a press there never selects', () => {
    const s = benzene();
    const handle = handleAt(s, 'rotate');
    expect(hoverAt(s, ctx.derive, handle)).toEqual({ kind: 'handle', handle: 'rotate' });
    const pressed = run(s, ev(s, 'down', handle));
    expect(pressed.selection).toBe(s.selection);
    const away = { x: handle.x + 200, y: handle.y };
    expect(hoverAt(s, ctx.derive, away)).toBeNull();
  });
});

describe('Flip', () => {
  const acetic = (): { doc: Doc; all: Selection } => {
    const doc = drawn({ name: 'acetic acid', x: 0, y: 0 });
    return { doc, all: wholeOf(doc, fragments(doc)[0] as AtomId[]) };
  };

  it('Flip horizontal mirrors the selection about the centre of its ink box, one "Flip" step', () => {
    const { doc, all } = acetic();
    let s = ready(doc, all);
    const centre = selectionCentre(doc, ctx.derive.committed(doc).scene, all);
    if (!centre) throw new Error('no centre');
    const cx = centre.x / BL;
    s = run(s, { type: 'flip', axis: 'h' });
    expect(undoLabel(s.history)).toBe('Flip');
    expect(s.history.past).toHaveLength(1);
    for (const atom of Object.values(doc.atoms)) {
      const after = docOf(s).atoms[atom.id];
      expect(after?.x).toBeCloseTo(2 * cx - atom.x, 9);
      expect(after?.y).toBeCloseTo(atom.y, 9);
    }
    expect(s.selection).toBe(all);
  });

  it('Flip vertical mirrors y about the centre', () => {
    const { doc, all } = acetic();
    let s = ready(doc, all);
    const centre = selectionCentre(doc, ctx.derive.committed(doc).scene, all);
    if (!centre) throw new Error('no centre');
    s = run(s, { type: 'flip', axis: 'v' });
    for (const atom of Object.values(doc.atoms)) {
      expect(docOf(s).atoms[atom.id]?.x).toBeCloseTo(atom.x, 9);
      expect(docOf(s).atoms[atom.id]?.y).toBeCloseTo((2 * centre.y) / BL - atom.y, 9);
    }
  });

  it('flipping twice restores the atoms', () => {
    const { doc, all } = acetic();
    let s = ready(doc, all);
    s = run(run(s, { type: 'flip', axis: 'h' }), { type: 'flip', axis: 'h' });
    for (const atom of Object.values(doc.atoms)) {
      expect(docOf(s).atoms[atom.id]?.x).toBeCloseTo(atom.x, 6);
    }
  });

  it('flip negates a selected curved arrow bend', () => {
    const [d1, a] = addAtom(drawn(), { element: 'C', x: 0, y: 0 });
    const [d2, b] = addAtom(d1, { element: 'C', x: 2, y: 0 });
    const [d3] = addBond(d2, a, b);
    const [doc, curve] = addObject(d3, {
      type: 'curved-arrow',
      head: 'full',
      from: { kind: 'atom', atom: a },
      to: { kind: 'atom', atom: b },
      bend: 0.4,
    });
    const s = run(
      ready(doc, { atoms: new Set([a, b]), bonds: new Set(), objects: new Set([curve]) }),
      { type: 'flip', axis: 'h' },
    );
    expect(docOf(s).objects[curve]).toMatchObject({ bend: -0.4 });
  });

  it('with nothing selected it does nothing', () => {
    const s = ready(drawn({ name: 'ethanol', x: 0, y: 0 }));
    expect(run(s, { type: 'flip', axis: 'h' })).toBe(s);
  });
});

describe('arrow end handles (S6)', () => {
  const arrowDoc = (): { doc: Doc; arrow: ObjectId; text: ObjectId } => {
    const [d1, arrow] = addObject(drawn(), {
      type: 'arrow',
      kind: 'forward',
      from: { x: 0, y: 0 },
      to: { x: 4, y: 0 },
    });
    const [doc, text] = addObject(d1, {
      type: 'text',
      at: { x: 2, y: -0.6 },
      runs: [{ text: 'heat' }],
      align: 'center',
      attachedTo: { arrow, slot: 'above' },
    });
    return { doc, arrow, text };
  };
  const only = (arrow: ObjectId): Selection => ({
    atoms: new Set(),
    bonds: new Set(),
    objects: new Set([arrow]),
  });

  it('dragging the end snaps its angle to 15 degrees and commits one "Adjust arrow"', () => {
    const { doc, arrow } = arrowDoc();
    let s = ready(doc, only(arrow));
    const handle = handleAt(s, 'arrow-to');
    s = run(s, ev(s, 'down', handle));
    expect(s.gesture?.kind).toBe('select-arrow');
    // From (0,0) to (4,0): drag to angle 40 degrees at length 3 BLU.
    const rad = (40 * Math.PI) / 180;
    const target = bluToScreen(s.viewport, { x: 3 * Math.cos(rad), y: 3 * Math.sin(rad) }, BL);
    s = run(s, ev(s, 'move', target));
    expect(canUndo(s.history)).toBe(false);
    s = run(s, ev(s, 'up', target));
    expect(undoLabel(s.history)).toBe('Adjust arrow');
    expect(s.history.past).toHaveLength(1);
    const after = docOf(s).objects[arrow];
    if (after?.type !== 'arrow') throw new Error('not an arrow');
    expect(after.from).toEqual({ x: 0, y: 0 });
    expect(after.to.x).toBeCloseTo(3 * Math.cos((45 * Math.PI) / 180), 6);
    expect(after.to.y).toBeCloseTo(3 * Math.sin((45 * Math.PI) / 180), 6);
  });

  it('Shift leaves the angle free', () => {
    const { doc, arrow } = arrowDoc();
    let s = ready(doc, only(arrow));
    s = run(s, ev(s, 'down', handleAt(s, 'arrow-to')));
    const target = bluToScreen(s.viewport, { x: 3, y: 1 }, BL);
    s = run(s, ev(s, 'move', target, SHIFT));
    s = run(s, ev(s, 'up', target, SHIFT));
    const after = docOf(s).objects[arrow];
    if (after?.type !== 'arrow') throw new Error('not an arrow');
    expect(after.to.x).toBeCloseTo(3, 6);
    expect(after.to.y).toBeCloseTo(1, 6);
  });

  it('attached texts are re-placed by T3 in the same commit', () => {
    const { doc, arrow, text } = arrowDoc();
    let s = ready(doc, only(arrow));
    s = run(s, ev(s, 'down', handleAt(s, 'arrow-from')));
    const target = bluToScreen(s.viewport, { x: 0, y: 2 }, BL);
    s = run(s, ev(s, 'move', target, SHIFT));
    s = run(s, ev(s, 'up', target, SHIFT));
    const arrowAfter = docOf(s).objects[arrow];
    const textAfter = docOf(s).objects[text];
    if (arrowAfter?.type !== 'arrow' || textAfter?.type !== 'text') throw new Error('shape');
    // T3 on the arrow as it now is: from (0, 2) to (4, 0), the text on its left normal.
    const want = conditionAt(docOf(s), text);
    expect(textAfter.at.x).toBeCloseTo(want?.x ?? NaN, 9);
    expect(textAfter.at.y).toBeCloseTo(want?.y ?? NaN, 9);
    // It moved off the old place, towards the arrow's new left side (up and to the right).
    expect(textAfter.at.y).toBeLessThan(1 - 0.2);
    expect(s.history.past).toHaveLength(1);
  });
});

describe('curved-arrow handles (S6)', () => {
  const curveDoc = (): { doc: Doc; curve: ObjectId; a: AtomId; bond: BondId } => {
    const [d1, a] = addAtom(drawn(), { element: 'C', x: 0, y: 4 });
    const [d2, b] = addAtom(d1, { element: 'C', x: 2, y: 4 });
    const [d3, bond] = addBond(d2, a, b);
    const [doc, curve] = addObject(d3, {
      type: 'curved-arrow',
      head: 'full',
      from: { kind: 'point', p: { x: 5, y: 0 } },
      to: { kind: 'point', p: { x: 7, y: 0 } },
      bend: 0.3,
    });
    return { doc, curve, a, bond };
  };
  const only = (curve: ObjectId): Selection => ({
    atoms: new Set(),
    bonds: new Set(),
    objects: new Set([curve]),
  });
  const drag = (s: EditorState, handle: string, to: Point): EditorState => {
    let t = run(s, ev(s, 'down', handleAt(s, handle)));
    expect(t.gesture?.kind).toBe('select-curve');
    t = run(t, ev(t, 'move', to));
    return run(t, ev(t, 'up', to));
  };

  it('an end dropped on an atom anchors to the atom', () => {
    const { doc, curve, a } = curveDoc();
    const s0 = ready(doc, only(curve));
    const s = drag(s0, 'curve-to', bluToScreen(s0.viewport, doc.atoms[a] as Point, BL));
    expect(docOf(s).objects[curve]).toMatchObject({ to: { kind: 'atom', atom: a } });
    expect(undoLabel(s.history)).toBe('Adjust arrow');
    expect(s.history.past).toHaveLength(1);
  });

  it('an end dropped on a bond anchors to the bond at t = 0.5', () => {
    const { doc, curve, bond } = curveDoc();
    const s0 = ready(doc, only(curve));
    const s = drag(s0, 'curve-from', bluToScreen(s0.viewport, { x: 1, y: 4 }, BL));
    expect(docOf(s).objects[curve]).toMatchObject({ from: { kind: 'bond', bond, t: 0.5 } });
  });

  it('an end dropped on empty canvas becomes a point', () => {
    const { doc, curve } = curveDoc();
    const s0 = ready(doc, only(curve));
    const s = drag(s0, 'curve-to', bluToScreen(s0.viewport, { x: 8, y: -2 }, BL));
    const after = docOf(s).objects[curve];
    if (after?.type !== 'curved-arrow') throw new Error('shape');
    expect(after.to.kind).toBe('point');
    expect(after.to).toMatchObject({ p: { x: 8, y: -2 } });
  });

  it('the bend handle dragged 0.5 BLU off a chord of 2 BLU gives bend 0.5', () => {
    const { doc, curve } = curveDoc();
    const s0 = ready(doc, only(curve));
    // Chord (5,0)-(7,0); the left normal of a chord running right is up (negative y on screen).
    const s = drag(s0, 'curve-bend', bluToScreen(s0.viewport, { x: 6, y: -0.5 }, BL));
    const after = docOf(s).objects[curve];
    if (after?.type !== 'curved-arrow') throw new Error('shape');
    expect(after.bend).toBeCloseTo(0.5, 9);
    // Below the chord the bend is negative.
    const s2 = drag(s0, 'curve-bend', bluToScreen(s0.viewport, { x: 6, y: 0.5 }, BL));
    const below = docOf(s2).objects[curve];
    if (below?.type !== 'curved-arrow') throw new Error('shape');
    expect(below.bend).toBeCloseTo(-0.5, 9);
  });
});

describe('rotating an arrow places its conditions by T3 (S5)', () => {
  it('the text stays centred on the turned arrow, on its left side, in the same commit', () => {
    const [d1, arrow] = addObject(drawn(), {
      type: 'arrow',
      kind: 'forward',
      from: { x: 0, y: 0 },
      to: { x: 4, y: 0 },
    });
    const [doc, text] = addObject(d1, {
      type: 'text',
      at: { x: 2, y: -0.6 },
      runs: [{ text: 'heat' }],
      align: 'center',
      attachedTo: { arrow, slot: 'above' },
    });
    let s = ready(doc, { atoms: new Set(), bonds: new Set(), objects: new Set([arrow]) });
    const handle = handleAt(s, 'rotate');
    const centre = centreOnScreen(s);
    const target = rotated(handle, centre, 90);
    s = run(s, ev(s, 'down', handle));
    s = run(s, ev(s, 'move', target));
    s = run(s, ev(s, 'up', target));
    expect(undoLabel(s.history)).toBe('Rotate');
    const after = docOf(s);
    const want = conditionAt(after, text);
    const got = (after.objects[text] as { at: Point }).at;
    expect(got.x).toBeCloseTo(want?.x ?? NaN, 9);
    expect(got.y).toBeCloseTo(want?.y ?? NaN, 9);
  });
});
