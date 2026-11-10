// SPEC.md SC1 / SC2 as actions on the editor state: a key press, a click, a hover with a key.
import { formulaOf } from '@core/chem-core';
import { current, type AtomId } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import type { CanvasEvent, MoveEvent } from '../model/canvas-event';
import { formulaText } from '../model/formula';
import type { Point } from '../model/geometry';
import { hoverKeys, type KeyInfo } from '../model/keymap';
import { bluToScreen, screenToBlu } from '../model/viewport';
import { createEditorController, type EditorController } from './controller';
import { T0, testDoc } from './testing';

const BL = 40;
const NONE = { shift: false, alt: false, ctrl: false };

const make = (): EditorController => {
  const c = createEditorController({ clock: () => T0, logError: () => undefined, doc: testDoc() });
  c.store.dispatch({ type: 'canvas-resized', size: { w: 1200, h: 700 } });
  return c;
};

const ev = (c: EditorController, type: 'down' | 'move' | 'up', screen: Point): CanvasEvent => ({
  type,
  p: screenToBlu(c.store.getState().viewport, screen, BL),
  screen,
  button: 0,
  mods: NONE,
});

/** One user action each: a key, a click, a hover then a key. */
const press = (c: EditorController, key: string): void => {
  const info: KeyInfo = { key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
  const s = c.store.getState();
  const action = hoverKeys(info, s.hover, s.tool);
  if (action === null) throw new Error(`no action for ${key}`);
  c.store.dispatch(action);
};
const click = (c: EditorController, at: Point): void => {
  c.store.dispatch({ type: 'pointer', event: ev(c, 'down', at) });
  c.store.dispatch({ type: 'pointer', event: ev(c, 'up', at) });
};
const hover = (c: EditorController, at: Point): void =>
  c.store.dispatch({ type: 'hover-move', event: ev(c, 'move', at) as MoveEvent });

const formulaOfDoc = (c: EditorController): string => {
  const doc = c.getDoc();
  return formulaText(formulaOf(doc, Object.keys(doc.atoms) as AtomId[]));
};

describe('SC1 benzene by one Ring click', () => {
  it('Ring, one click on the canvas: C6H6 in one undo step', () => {
    const c = make();
    c.store.dispatch({ type: 'select-tool', tool: 'ring' });
    click(c, { x: 640, y: 400 });
    expect(formulaOfDoc(c)).toBe('C6H6 · 78.11 g/mol');
    expect(c.store.getState().history.past).toHaveLength(1);
  });

  it('naphthalene by two clicks: a second benzene on a bond of the first', () => {
    const c = make();
    c.store.dispatch({ type: 'select-tool', tool: 'ring' });
    click(c, { x: 640, y: 400 });
    const doc = c.getDoc();
    const bond = Object.values(doc.bonds)[0];
    const [a, b] = [doc.atoms[bond?.a1 as AtomId], doc.atoms[bond?.a2 as AtomId]] as [Point, Point];
    const vp = c.store.getState().viewport;
    click(c, bluToScreen(vp, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, BL));
    expect(formulaOfDoc(c)).toBe('C10H8 · 128.17 g/mol');
    expect(c.store.getState().history.past).toHaveLength(2);
  });
});

describe('SC2 toluene in 3 actions', () => {
  it('press R, click the canvas, hover a ring atom and press 1: C7H8', () => {
    const c = make();
    const actions: string[] = [];
    press(c, 'r');
    actions.push('R');
    expect(c.store.getState().tool).toBe('ring');
    click(c, { x: 640, y: 400 });
    actions.push('click');
    const doc = current(c.store.getState().history);
    const first = Object.values(doc.atoms)[0] as { x: number; y: number };
    hover(c, bluToScreen(c.store.getState().viewport, first, BL));
    press(c, '1');
    actions.push('hover + 1');
    expect(actions).toHaveLength(3);
    expect(formulaOfDoc(c)).toBe('C7H8 · 92.14 g/mol');
  });
});
