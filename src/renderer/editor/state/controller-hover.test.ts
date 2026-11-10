import { describe, expect, it } from 'vitest';
import { bluToScreen } from '../model/viewport';
import { createEditorController, type EditorController } from './controller';
import { drawn, T0 } from './testing';

const BL = 40;

const make = (): EditorController => {
  const c = createEditorController({
    clock: () => T0,
    logError: () => undefined,
    doc: drawn({ name: 'ethanol', x: 0, y: 0 }),
  });
  c.store.dispatch({ type: 'canvas-resized', size: { w: 1200, h: 700 } });
  return c;
};

const firstAtomPx = (c: EditorController) => {
  const atom = Object.values(c.getDoc().atoms)[0] as { x: number; y: number };
  return bluToScreen(c.store.getState().viewport, atom, BL);
};

describe('refreshHover: what rests under the pointer is hovered again after a key', () => {
  it('after a tool key the atom under the resting pointer is hovered, so hover keys work at once', () => {
    const c = make();
    c.setPointer(firstAtomPx(c));
    expect(c.store.getState().hover).toBeNull();
    c.store.dispatch({ type: 'select-tool', tool: 'select' });
    c.refreshHover();
    expect(c.store.getState().hover).toMatchObject({ kind: 'atom' });
  });

  it('with the Bond tool the ghost of the next bond shows too', () => {
    const c = make();
    const at = firstAtomPx(c);
    c.store.dispatch({ type: 'select-tool', tool: 'bond' });
    c.setPointer(at);
    c.refreshHover();
    expect(c.store.getState().hover).toMatchObject({ kind: 'atom' });
    expect(c.store.getState().preview?.hovering).toBe(true);
  });

  it('does nothing with the pointer off the canvas or while a gesture runs', () => {
    const c = make();
    c.refreshHover();
    expect(c.store.getState().hover).toBeNull();
    c.setPointer(firstAtomPx(c));
    c.store.dispatch({ type: 'set-gesture', gesture: { kind: 'bond-press' } });
    c.refreshHover();
    expect(c.store.getState().hover).toBeNull();
  });
});
