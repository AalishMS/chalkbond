import { canUndo, current, undo, undoLabel, type AtomId, type Doc } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import type { CanvasEvent, MoveEvent } from '../model/canvas-event';
import type { Point } from '../model/geometry';
import { bluToScreen, screenToBlu } from '../model/viewport';
import type { EditorState } from './editor-state';
import { reduce, type EditorAction } from './reducer';
import { emptyStateVisible } from './empty-doc';
import { freshState, testContext } from './testing';

const ctx = testContext();
const run = (s: EditorState, a: EditorAction): EditorState => reduce(s, a, ctx);
const BL = 40;
const NONE = { shift: false, alt: false, ctrl: false };

/** Bond tool, empty document, 1200 x 700 canvas. */
const ready = (): EditorState =>
  run(freshState(), { type: 'canvas-resized', size: { w: 1200, h: 700 } });
const docOf = (s: EditorState): Doc => current(s.history);

const at = (s: EditorState, type: 'down' | 'move' | 'up', screen: Point): CanvasEvent => ({
  type,
  screen,
  p: screenToBlu(s.viewport, screen, BL),
  button: 0,
  mods: NONE,
});
const pointer = (s: EditorState, type: 'down' | 'move' | 'up', screen: Point): EditorAction => ({
  type: 'pointer',
  event: at(s, type, screen),
});
const hover = (s: EditorState, screen: Point): EditorAction => ({
  type: 'hover-move',
  event: at(s, 'move', screen) as MoveEvent,
});
const click = (s: EditorState, screen: Point): EditorState =>
  run(run(s, pointer(s, 'down', screen)), pointer(s, 'up', screen));
const atomPx = (s: EditorState, id: AtomId): Point =>
  bluToScreen(s.viewport, docOf(s).atoms[id] as Point, BL);

describe('the Bond tool through the reducer', () => {
  it('is the tool at launch (Decision 5)', () => {
    expect(ready().tool).toBe('bond');
  });

  it('a click is one "Add bond" undo step; undo restores exactly the previous document', () => {
    const s0 = ready();
    const s = click(s0, { x: 500, y: 300 });
    expect(Object.keys(docOf(s).atoms)).toHaveLength(2);
    expect(s.history.past).toHaveLength(1);
    expect(undoLabel(s.history)).toBe('Add bond');
    expect(docOf({ ...s, history: undo(s.history) })).toEqual(docOf(s0));
  });

  it('three clicks are three undo steps (empty, end atom, end atom)', () => {
    let s = click(ready(), { x: 500, y: 300 });
    s = click(s, atomPx(s, Object.keys(docOf(s).atoms)[1] as AtomId));
    s = click(s, atomPx(s, Object.keys(docOf(s).atoms)[2] as AtomId));
    expect(Object.keys(docOf(s).atoms)).toHaveLength(4);
    expect(s.history.past).toHaveLength(3);
  });

  it('a drag is previewed, then one commit on release', () => {
    let s = ready();
    s = run(s, pointer(s, 'down', { x: 500, y: 300 }));
    expect(s.gesture?.kind).toBe('bond-press');
    s = run(s, pointer(s, 'move', { x: 560, y: 250 }));
    expect(s.gesture?.kind).toBe('bond-drag');
    expect(s.preview).not.toBeNull();
    expect(canUndo(s.history)).toBe(false);
    s = run(s, pointer(s, 'up', { x: 560, y: 250 }));
    // The drag's ghost is gone; what remains is the hover ghost of whatever the pointer rests on.
    expect(s.preview === null || s.preview.hovering === true).toBe(true);
    expect(s.gesture).toBeNull();
    expect(s.history.past).toHaveLength(1);
  });

  it('Esc during a drag commits nothing and leaves no preview', () => {
    let s = ready();
    s = run(s, pointer(s, 'down', { x: 500, y: 300 }));
    s = run(s, pointer(s, 'move', { x: 560, y: 250 }));
    s = run(s, { type: 'escape' });
    expect(s.gesture).toBeNull();
    expect(s.preview).toBeNull();
    expect(s.history.past).toHaveLength(0);
    expect(Object.keys(docOf(s).atoms)).toHaveLength(0);
  });

  it('a right-button cancel event drops the gesture and the ghost', () => {
    let s = ready();
    s = run(s, pointer(s, 'down', { x: 500, y: 300 }));
    s = run(s, pointer(s, 'move', { x: 560, y: 250 }));
    s = run(s, { type: 'pointer', event: { type: 'cancel' } });
    expect(s.gesture).toBeNull();
    expect(s.preview).toBeNull();
  });
});

describe('the empty state until the first press (R30 as amended)', () => {
  it('stays through pointer moves, goes at the first press, returns after Esc', () => {
    let s = ready();
    s = run(s, hover(s, { x: 600, y: 350 }));
    expect(emptyStateVisible(docOf(s), s.gesture, s.preview)).toBe(true);
    s = run(s, pointer(s, 'down', { x: 600, y: 350 }));
    expect(emptyStateVisible(docOf(s), s.gesture, s.preview)).toBe(false);
    s = run(s, { type: 'escape' });
    expect(s.gesture).toBeNull();
    expect(emptyStateVisible(docOf(s), s.gesture, s.preview)).toBe(true);
  });

  it('comes back after undo empties the document', () => {
    let s = click(ready(), { x: 600, y: 350 });
    expect(emptyStateVisible(docOf(s), s.gesture, s.preview)).toBe(false);
    s = run(s, { type: 'undo' });
    s = run(s, hover(s, { x: 700, y: 350 }));
    expect(emptyStateVisible(docOf(s), s.gesture, s.preview)).toBe(true);
  });
});

describe('hover ghost (B6)', () => {
  it('on an empty document there is no ghost for any tool (R30 as amended)', () => {
    const s0 = ready();
    for (const tool of ['bond', 'ring', 'chain', 'atom'] as const) {
      const t = run(s0, { type: 'select-tool', tool });
      const s = run(t, hover(t, { x: 600, y: 350 }));
      expect(s.preview).toBeNull();
      expect(s.hover).toBeNull();
    }
  });

  it('moving over empty canvas shows the ghost of the two-atom bond, marked as a hover preview', () => {
    const s0 = click(ready(), { x: 400, y: 300 });
    const s = run(s0, hover(s0, { x: 900, y: 500 }));
    expect(s.hover).toBeNull();
    expect(s.preview?.hovering).toBe(true);
    expect(s.preview?.added.size).toBe(3);
    expect(canUndo(s.history)).toBe(true);
    expect(s.history.past).toHaveLength(1);
  });

  it('over an atom: the hover is stored and the ghost is the sprouted bond', () => {
    let s = click(ready(), { x: 600, y: 350 });
    const end = Object.keys(docOf(s).atoms)[1] as AtomId;
    s = run(s, hover(s, atomPx(s, end)));
    expect(s.hover).toEqual({ kind: 'atom', id: end });
    expect([...(s.preview?.added ?? [])].sort()).toEqual(['atom:a4', 'bond:b5']);
  });

  it('a press removes the ghost; the pointer leaving removes it too', () => {
    const s0 = click(ready(), { x: 400, y: 300 });
    let s = run(s0, hover(s0, { x: 900, y: 500 }));
    const left = run(s, { type: 'set-hover', hover: null });
    expect(left.preview).toBeNull();
    s = run(s, pointer(s, 'down', { x: 900, y: 500 }));
    expect(s.preview).toBeNull();
  });

  it('Esc does not spend a press on the ghost: it goes on to the next step of the ladder', () => {
    const s0 = click(ready(), { x: 400, y: 300 });
    const s = run(s0, hover(s0, { x: 900, y: 500 }));
    expect(s.preview?.hovering).toBe(true);
    // Bond is active, nothing selected: Esc switches to Select (the ladder's last step).
    expect(run(s, { type: 'escape' }).tool).toBe('select');
  });

  it('after a click the atom under the pointer is hovered at once, with its ghost', () => {
    const s = click(ready(), { x: 600, y: 350 });
    expect(s.hover).toMatchObject({ kind: 'atom' });
    expect(s.preview?.hovering).toBe(true);
  });

  it('tools without a ghost show none and drop one when the tool changes', () => {
    const s0 = click(ready(), { x: 400, y: 300 });
    const s = run(s0, hover(s0, { x: 900, y: 500 }));
    expect(s.preview).not.toBeNull();
    const erase = run(s, { type: 'select-tool', tool: 'erase' });
    expect(erase.preview).toBeNull();
    expect(run(erase, hover(erase, { x: 900, y: 500 }))).toBe(erase);
  });
});

describe('the options bar choice reaches the tool', () => {
  it('Double draws a double bond', () => {
    let s = run(ready(), { type: 'select-variant', tool: 'bond', variant: 'double' });
    s = click(s, { x: 600, y: 350 });
    expect(Object.values(docOf(s).bonds)[0]?.order).toBe(2);
  });
});
