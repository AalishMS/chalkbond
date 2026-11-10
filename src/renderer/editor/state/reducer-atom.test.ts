import { canUndo, current, undo, undoLabel, type Doc } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import type { CanvasEvent } from '../model/canvas-event';
import type { Point } from '../model/geometry';
import { screenToBlu } from '../model/viewport';
import type { EditorState } from './editor-state';
import { reduce, type EditorAction } from './reducer';
import { freshState, testContext } from './testing';

const ctx = testContext();
const run = (s: EditorState, a: EditorAction): EditorState => reduce(s, a, ctx);
const NONE = { shift: false, alt: false, ctrl: false };
const docOf = (s: EditorState): Doc => current(s.history);

const atomTool = (variant: string): EditorState =>
  run(
    run(run(freshState(), { type: 'canvas-resized', size: { w: 1200, h: 700 } }), {
      type: 'select-tool',
      tool: 'atom',
    }),
    { type: 'select-variant', tool: 'atom', variant },
  );
const ev = (s: EditorState, type: 'down' | 'up', screen: Point): EditorAction => ({
  type: 'pointer',
  event: {
    type,
    screen,
    p: screenToBlu(s.viewport, screen, 40),
    button: 0,
    mods: NONE,
  } satisfies CanvasEvent,
});
const click = (s: EditorState, at: Point): EditorState =>
  run(run(s, ev(s, 'down', at)), ev(s, 'up', at));

describe('the Atom tool through the reducer', () => {
  it('a click on empty canvas with N adds a lone atom in one undoable step', () => {
    const s = click(atomTool('N'), { x: 600, y: 400 });
    expect(Object.values(docOf(s).atoms).map((a) => a.element)).toEqual(['N']);
    expect(undoLabel(s.history)).toBe('Add atom');
    expect(canUndo(s.history)).toBe(true);
    expect(Object.keys(docOf({ ...s, history: undo(s.history) }).atoms)).toHaveLength(0);
  });

  it('a mark clicked on empty canvas shows the info notice and changes nothing; a press clears it', () => {
    const s0 = atomTool('plus');
    const s = click(s0, { x: 600, y: 400 });
    expect(s.notice).toMatchObject({ kind: 'info', text: 'Click an atom to add this.' });
    expect(s.history).toBe(s0.history);
    const next = run(s, ev(s, 'down', { x: 100, y: 100 }));
    expect(next.notice).toBeNull();
  });
});
