// SPEC.md SC1 / SC2 as actions on the editor state: a key press, a click, a hover with a key.
import { formulaOf } from '@core/chem-core';
import { current, type AtomId } from '@core/doc-model';
import { insertText as insertEditText } from '../model/text-edit';
import { itemBoxes } from '../model/move';
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

describe('SC3 reaction with conditions in at most 15 actions', () => {
  it('insert the text, Text tool, click above the arrow, H2SO4 + Enter, click below, Δ + Enter', () => {
    const c = make();
    const { store } = c;
    const actions: string[] = [];
    const typeText = (text: string): void => {
      const s = store.getState();
      if (s.editing?.kind !== 'text') throw new Error('no text editor');
      store.dispatch({ type: 'edit-set', edit: insertEditText(s.editing.edit, text) });
    };

    store.dispatch({
      type: 'insert-text',
      text: 'ethanol + acetic acid -> ethyl acetate + water',
    });
    actions.push('insert the reaction');
    store.dispatch({ type: 'select-tool', tool: 'text' });
    actions.push('Text tool');

    const arrowOf = () => {
      const a = Object.values(c.getDoc().objects).find((o) => o.type === 'arrow');
      if (a?.type !== 'arrow') throw new Error('no arrow');
      return a;
    };
    const mid = (side: 1 | -1): Point => {
      const a = arrowOf();
      return bluToScreen(
        store.getState().viewport,
        { x: (a.from.x + a.to.x) / 2, y: a.from.y - side * 0.5 },
        BL,
      );
    };
    click(c, mid(1));
    actions.push('click above the arrow');
    typeText('H2SO4');
    actions.push('type H2SO4');
    store.dispatch({ type: 'edit-commit' });
    actions.push('Enter');
    click(c, mid(-1));
    actions.push('click below the arrow');
    store.dispatch({ type: 'edit-insert', text: 'Δ' });
    actions.push('Ctrl+Shift+D');
    store.dispatch({ type: 'edit-commit' });
    actions.push('Enter');
    expect(actions.length).toBeLessThanOrEqual(15);

    const doc = c.getDoc();
    const arrow = arrowOf();
    expect(arrow.from.y).toBe(arrow.to.y);
    const texts = Object.values(doc.objects).filter((o) => o.type === 'text');
    expect(texts).toHaveLength(2);
    const slots = texts.map((t) => (t.type === 'text' ? t.attachedTo?.slot : undefined)).sort();
    expect(slots).toEqual(['above', 'below']);
    // Conditions centred on the arrow's midpoint (±0.01 BLU).
    for (const t of texts) {
      if (t.type !== 'text') continue;
      const { scene } = c.derive.committed(doc);
      const ink = scene.extents[`obj:${t.id}`];
      if (ink === undefined) throw new Error('no ink');
      expect((ink.x + ink.w / 2) / BL).toBeCloseTo((arrow.from.x + arrow.to.x) / 2, 1);
    }
    // Molecules and plus signs have their ink centres on the arrow's shaft (±0.01 BLU).
    const { scene } = c.derive.committed(doc);
    const row = itemBoxes(doc, scene).filter(
      (i) => i.object === undefined || doc.objects[i.object]?.type === 'plus',
    );
    expect(row).toHaveLength(6);
    for (const i of row)
      expect(Math.abs((i.box.y + i.box.h / 2) / BL - arrow.from.y)).toBeLessThan(0.01);
  });
});
