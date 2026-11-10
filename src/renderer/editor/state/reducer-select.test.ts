import { createNameIndex } from '@core/chem-core';
import {
  canUndo,
  current,
  fragments,
  transformItems,
  translation,
  undoLabel,
  type AtomId,
  type Doc,
} from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import compounds from '../../../../resources/compounds/compounds.json';
import type { CanvasEvent } from '../model/canvas-event';
import type { Point } from '../model/geometry';
import { screenToBlu, bluToScreen } from '../model/viewport';
import { EMPTY_SELECTION, type EditorState } from './editor-state';
import { reduce, type EditorAction } from './reducer';
import { drawn, freshState, labelEditing, testContext, wholeOf } from './testing';

const ctx = { ...testContext(), names: createNameIndex(compounds) };
const run = (s: EditorState, a: EditorAction): EditorState => reduce(s, a, ctx);
const BL = 40;
const NONE = { shift: false, alt: false, ctrl: false };

const doc = (): Doc => drawn({ name: 'benzene', x: 0, y: 0 }, { name: 'ethanol', x: 6, y: 0 });
const ready = (): EditorState => {
  const s = run(freshState(doc()), { type: 'canvas-resized', size: { w: 1200, h: 700 } });
  return run(s, { type: 'select-tool', tool: 'select' });
};
const ev = (
  s: EditorState,
  type: 'down' | 'move' | 'up',
  screen: Point,
  mods = NONE,
  button: 0 | 1 | 2 = 0,
): EditorAction => ({
  type: 'pointer',
  event: {
    type,
    screen,
    p: screenToBlu(s.viewport, screen, BL),
    button,
    mods,
  } satisfies CanvasEvent,
});
const atomPx = (s: EditorState, id: AtomId): Point =>
  bluToScreen(s.viewport, current(s.history).atoms[id] as Point, BL);
const ring = (s: EditorState): AtomId[] =>
  fragments(current(s.history)).find((f) => f.length === 6) as AtomId[];
const ethanol = (s: EditorState): AtomId[] =>
  fragments(current(s.history)).find((f) => f.length === 3) as AtomId[];

function clickAt(s: EditorState, at: Point, mods = NONE): EditorState {
  return run(run(s, ev(s, 'down', at, mods)), ev(s, 'up', at, mods));
}

describe('pointer events with the Select tool', () => {
  it('a click selects the whole fragment, with no history entry', () => {
    let s = ready();
    s = clickAt(s, atomPx(s, ring(s)[0] as AtomId));
    expect(s.selection.atoms.size).toBe(6);
    expect(s.gesture).toBeNull();
    expect(canUndo(s.history)).toBe(false);
  });

  it('the Decision 6 sequence: fragment, one atom, fragment again', () => {
    let s = ready();
    const at = atomPx(s, ring(s)[1] as AtomId);
    s = clickAt(s, at);
    expect(s.selection.atoms.size).toBe(6);
    s = clickAt(s, at);
    expect(s.selection.atoms.size).toBe(1);
    s = clickAt(s, at);
    expect(s.selection.atoms.size).toBe(6);
  });

  it('while the pointer is down the gesture is held and the hover is cleared', () => {
    let s = ready();
    const at = atomPx(s, ring(s)[0] as AtomId);
    s = run(s, { type: 'set-hover', hover: { kind: 'atom', id: ring(s)[0] as AtomId } });
    s = run(s, ev(s, 'down', at));
    expect(s.gesture?.kind).toBe('select-press');
    expect(s.hover).toBeNull();
  });

  it('a marquee drag shows the rectangle without touching the selection or history', () => {
    let s = ready();
    const from = bluToScreen(s.viewport, { x: -2, y: -2 }, BL);
    const to = bluToScreen(s.viewport, { x: 2, y: 2 }, BL);
    s = run(s, ev(s, 'down', from));
    s = run(s, ev(s, 'move', to));
    expect(s.gesture?.kind).toBe('select-marquee');
    expect(s.gesture?.overlay?.marquee).toBeDefined();
    expect(s.selection).toBe(EMPTY_SELECTION);
    expect(canUndo(s.history)).toBe(false);
    s = run(s, ev(s, 'up', to));
    expect(s.selection.atoms.size).toBe(6);
    expect(s.gesture).toBeNull();
  });

  it('a pointer cancel drops the gesture', () => {
    let s = ready();
    s = run(s, ev(s, 'down', atomPx(s, ring(s)[0] as AtomId)));
    s = run(s, { type: 'pointer', event: { type: 'cancel' } });
    expect(s.gesture).toBeNull();
  });

  it('a right button press while a gesture runs cancels it', () => {
    let s = ready();
    const at = atomPx(s, ring(s)[0] as AtomId);
    s = run(s, ev(s, 'down', at));
    s = run(s, ev(s, 'down', at, NONE, 2));
    expect(s.gesture).toBeNull();
  });

  it('a press on the canvas clears the notice (cleared by the next canvas action)', () => {
    let s = ready();
    s = run(s, { type: 'notice-show', kind: 'info', text: 'Inserted ethanol' });
    s = run(s, ev(s, 'down', { x: 50, y: 650 }));
    expect(s.notice).toBeNull();
  });

  it('with another tool active the Select machine does not run', () => {
    let s = run(ready(), { type: 'select-tool', tool: 'text' });
    s = run(s, ev(s, 'down', atomPx(s, ring(s)[0] as AtomId)));
    expect(s.gesture).toBeNull();
  });

  it('is ignored while Space is held (the pointer pans)', () => {
    let s = run(ready(), { type: 'set-space', held: true });
    s = run(s, ev(s, 'down', atomPx(s, ring(s)[0] as AtomId)));
    expect(s.gesture).toBeNull();
  });
});

describe('a drag moves the selection (S2, S3)', () => {
  it('previews never touch history; the release is exactly one "Move" step', () => {
    let s = ready();
    const start = atomPx(s, ring(s)[0] as AtomId);
    const before = current(s.history);
    s = run(s, ev(s, 'down', start));
    for (const [dx, dy] of [
      [30, 20],
      [80, 60],
      [120, 90],
    ] as const) {
      s = run(s, ev(s, 'move', { x: start.x + dx, y: start.y + dy }));
      expect(s.history.past).toHaveLength(0);
      expect(current(s.history)).toBe(before);
      expect(s.preview).not.toBeNull();
    }
    expect(s.gesture?.kind).toBe('select-move');
    s = run(s, ev(s, 'up', { x: start.x + 120, y: start.y + 90 }));
    expect(s.history.past).toHaveLength(1);
    expect(undoLabel(s.history)).toBe('Move');
    expect(s.gesture).toBeNull();
    expect(s.preview).toBeNull();
    // 120 px = 1.5 BLU, 90 px = 1.125 BLU at 150 % (80 px per BLU).
    const a = ring(s)[0] as AtomId;
    const was = before.atoms[a] as Point;
    const now = current(s.history).atoms[a] as Point;
    expect(now.x - was.x).toBeCloseTo(1.5, 9);
    expect(now.y - was.y).toBeCloseTo(1.125, 9);
    expect(s.selection.atoms.size).toBe(6);
  });

  it('a cancelled drag leaves the document and the history as they were', () => {
    let s = ready();
    const start = atomPx(s, ring(s)[0] as AtomId);
    s = run(s, ev(s, 'down', start));
    s = run(s, ev(s, 'move', { x: start.x + 100, y: start.y }));
    s = run(s, { type: 'escape' });
    expect(s.gesture).toBeNull();
    expect(s.preview).toBeNull();
    expect(s.history.past).toHaveLength(0);
  });

  it('undo during a drag drops the gesture and the preview', () => {
    let s = ready();
    const whole = wholeOf(doc(), ring(s));
    s = run(s, {
      type: 'commit',
      label: 'Move',
      recipe: (d) => transformItems(d, whole, translation(0.2, 0)),
    });
    const start = atomPx(s, ring(s)[0] as AtomId);
    s = run(s, ev(s, 'down', start));
    s = run(s, ev(s, 'move', { x: start.x + 100, y: start.y }));
    s = run(s, { type: 'undo' });
    expect(s.gesture).toBeNull();
    expect(s.preview).toBeNull();
  });
});

describe('delete (S8, K1)', () => {
  it('deletes the selection as one undo step labelled "Delete"', () => {
    let s = ready();
    s = run(s, { type: 'set-selection', selection: wholeOf(doc(), ring(s)) });
    s = run(s, { type: 'delete' });
    expect(undoLabel(s.history)).toBe('Delete');
    expect(Object.keys(current(s.history).atoms)).toHaveLength(3);
    expect(s.selection.atoms.size).toBe(0);
    s = run(s, { type: 'undo' });
    expect(Object.keys(current(s.history).atoms)).toHaveLength(9);
  });

  it('applies the orphan rule', () => {
    let s = ready();
    const d = current(s.history);
    const eth = ethanol(s);
    const bond = Object.values(d.bonds).find((b) => eth.includes(b.a1));
    if (!bond) throw new Error('no bond');
    s = run(s, {
      type: 'set-selection',
      selection: { atoms: new Set(), bonds: new Set([bond.id]), objects: new Set() },
    });
    s = run(s, { type: 'delete' });
    // Ethanol lost a bond: the terminal carbon or the O-side pair remains; no bondless carbon.
    const after = current(s.history);
    const bonded = new Set(Object.values(after.bonds).flatMap((b) => [b.a1, b.a2]));
    for (const a of Object.values(after.atoms)) {
      if (a.element === 'C') expect(bonded.has(a.id)).toBe(true);
    }
  });

  it('deletes the hovered item when nothing is selected', () => {
    let s = ready();
    const atom = ethanol(s).find((id) => current(s.history).atoms[id]?.element === 'O') as AtomId;
    s = run(s, { type: 'set-hover', hover: { kind: 'atom', id: atom } });
    s = run(s, { type: 'delete' });
    expect(atom in current(s.history).atoms).toBe(false);
    expect(s.hover).toBeNull();
    expect(undoLabel(s.history)).toBe('Erase');
  });

  it('does nothing with nothing selected or hovered', () => {
    const s = ready();
    expect(run(s, { type: 'delete' })).toBe(s);
  });

  it('does nothing while a gesture runs', () => {
    let s = ready();
    s = run(s, ev(s, 'down', atomPx(s, ring(s)[0] as AtomId)));
    s = run(s, { type: 'set-selection', selection: wholeOf(doc(), ring(s)) });
    const same = run(s, { type: 'delete' });
    expect(canUndo(same.history)).toBe(false);
  });
});

describe('select-all (Ctrl+A)', () => {
  it('switches to Select and selects every item', () => {
    let s = run(ready(), { type: 'select-tool', tool: 'bond' });
    s = run(s, { type: 'select-all' });
    expect(s.tool).toBe('select');
    expect(s.selection.atoms.size).toBe(9);
    expect(s.selection.bonds.size).toBe(8);
  });

  it('an empty document selects nothing but still switches to Select', () => {
    let s = run(freshState(), { type: 'select-tool', tool: 'bond' });
    s = run(s, { type: 'select-all' });
    expect(s.tool).toBe('select');
    expect(s.selection).toBe(EMPTY_SELECTION);
  });
});

describe('Esc ladder (K1)', () => {
  /** Everything an Esc can undo at once. */
  function loaded(): EditorState {
    let s = ready();
    s = run(s, { type: 'select-tool', tool: 'bond' });
    s = run(s, { type: 'select-tool', tool: 'select' });
    s = run(s, { type: 'set-selection', selection: wholeOf(doc(), ring(s)) });
    s = run(s, { type: 'notice-show', kind: 'info', text: 'Something' });
    s = run(s, { type: 'set-editing', editing: labelEditing(ring(s)[0] as AtomId) });
    s = run(s, { type: 'set-gesture', gesture: { kind: 'select-press' } });
    return s;
  }

  it('one step per press: gesture, editor, notice, selection, then the Select tool', () => {
    let s = loaded();
    s = run(s, { type: 'escape' });
    expect(s.gesture).toBeNull();
    expect(s.editing).not.toBeNull();
    s = run(s, { type: 'escape' });
    expect(s.editing).toBeNull();
    expect(s.notice).not.toBeNull();
    s = run(s, { type: 'escape' });
    expect(s.notice).toBeNull();
    expect(s.selection.atoms.size).toBe(6);
    s = run(s, { type: 'escape' });
    expect(s.selection.atoms.size).toBe(0);
    expect(s.tool).toBe('select');
  });

  it('with Select already active and nothing to close, Esc does nothing more', () => {
    const s = ready();
    expect(run(s, { type: 'escape' })).toBe(s);
  });

  it('the last step switches another tool to Select', () => {
    const s = run(ready(), { type: 'select-tool', tool: 'ring' });
    expect(run(s, { type: 'escape' }).tool).toBe('select');
  });

  it('closes an open name dropdown at the editor step', () => {
    let s = ready();
    s = run(s, { type: 'name-text', text: 'eth' });
    expect(s.nameField.open).toBe(true);
    s = run(s, { type: 'set-selection', selection: wholeOf(doc(), ring(s)) });
    s = run(s, { type: 'escape' });
    expect(s.nameField.open).toBe(false);
    expect(s.selection.atoms.size).toBe(6);
  });
});

describe('nudges (K1)', () => {
  const withRing = (): EditorState => {
    const s = ready();
    return run(s, { type: 'set-selection', selection: wholeOf(doc(), ring(s)) });
  };
  const x = (s: EditorState): number => current(s.history).atoms[ring(s)[0] as AtomId]?.x ?? NaN;
  const x0 = (doc().atoms[ring(ready())[0] as AtomId] as Point).x;

  it('moves the selection by the step in BLU, y down', () => {
    let s = run(withRing(), { type: 'nudge', dx: 0.1, dy: 0 });
    expect(x(s) - x0).toBeCloseTo(0.1, 9);
    s = run(s, { type: 'nudge', dx: 0, dy: -1 });
    expect(current(s.history).atoms[ring(s)[0] as AtomId]?.y).toBeCloseTo(
      (doc().atoms[ring(s)[0] as AtomId] as Point).y - 1,
      9,
    );
  });

  it('three nudges are one undo step', () => {
    let s = withRing();
    for (let i = 0; i < 3; i++) s = run(s, { type: 'nudge', dx: 0.1, dy: 0 });
    expect(x(s) - x0).toBeCloseTo(0.3, 9);
    s = run(s, { type: 'undo' });
    expect(canUndo(s.history)).toBe(false);
    expect(x(s)).toBeCloseTo(x0, 9);
  });

  it('a nudge after a move is a second step', () => {
    let s = withRing();
    const sel = s.selection;
    s = run(s, {
      type: 'commit',
      label: 'Move',
      recipe: (d) => transformItems(d, sel, translation(0.5, 0)),
    });
    s = run(s, { type: 'nudge', dx: 0.1, dy: 0 });
    expect(x(s) - x0).toBeCloseTo(0.6, 9);
    s = run(s, { type: 'undo' });
    expect(x(s) - x0).toBeCloseTo(0.5, 9);
    expect(undoLabel(s.history)).toBe('Move');
  });

  it('does nothing without a selection, and not while a gesture runs', () => {
    const s = ready();
    expect(run(s, { type: 'nudge', dx: 0.1, dy: 0 })).toBe(s);
    let g = withRing();
    g = run(g, { type: 'set-gesture', gesture: { kind: 'select-press' } });
    expect(canUndo(run(g, { type: 'nudge', dx: 0.1, dy: 0 }).history)).toBe(false);
  });
});
