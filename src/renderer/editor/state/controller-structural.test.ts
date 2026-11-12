// N13 / R53 / U14 at the controller: pointers map through ptPerBlu, viewport defaults keep the
// style's bond length, the preset switch keeps one bond's on-screen length.
import { setStyle, type Doc } from '@core/doc-model';
import { render } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import { bluToScreen, ptToScreen } from '../model/viewport';
import { createEditorController, type EditorController } from './controller';
import { drawn, T0 } from './testing';

const structural = (doc: Doc): Doc => setStyle(doc, { formula: 'structural' });
const make = (doc: Doc): EditorController => {
  const c = createEditorController({ clock: () => T0, logError: () => undefined, doc });
  c.store.dispatch({ type: 'canvas-resized', size: { w: 1200, h: 700 } });
  return c;
};
const ethanol = (): Doc => structural(drawn({ name: 'ethanol', x: 0, y: 0 }));

describe('a pointer at the screen position of a structural atom maps to that atom', () => {
  it('refreshHover finds the atom under the pointer (off by a factor of 2 before N13)', () => {
    const c = make(ethanol());
    const doc = c.getDoc();
    const ppb = render(doc).style.ptPerBlu;
    expect(ppb).toBe(80);
    for (const atom of Object.values(doc.atoms)) {
      c.store.dispatch({ type: 'select-tool', tool: 'select' });
      c.setPointer(bluToScreen(c.store.getState().viewport, atom, ppb));
      c.refreshHover();
      expect(c.store.getState().hover).toMatchObject({ kind: 'atom', id: atom.id });
    }
  });
});

describe('U14: viewport defaults of a structural document are the style values', () => {
  it('opens at 150 % (Slides) and 416.67 % (Handout), as the skeletal document does', () => {
    const slides = make(ethanol());
    expect(slides.store.getState().viewport.zoom).toBe(1.5);
    const handout = make(setStyle(ethanol(), { preset: 'journal' }));
    expect(handout.store.getState().viewport.zoom).toBeCloseTo(1.5 * (40 / 14.4), 9);
  });

  it('the preset switch keeps one bond on screen as long as it was (160 px at Slides)', () => {
    const c = make(ethanol());
    const bond = (): number => {
      const state = c.store.getState();
      const doc = c.getDoc();
      const ppb = render(doc).style.ptPerBlu;
      const [a, b] = Object.values(doc.atoms);
      const p = ptToScreen(state.viewport, { x: a!.x * ppb, y: a!.y * ppb });
      const q = ptToScreen(state.viewport, { x: b!.x * ppb, y: b!.y * ppb });
      return Math.hypot(q.x - p.x, q.y - p.y);
    };
    const before = bond();
    c.store.dispatch({ type: 'set-preset', preset: 'journal' });
    expect(bond()).toBeCloseTo(before, 6);
    expect(before).toBeCloseTo(160, 6);
  });
});

describe('structural flip mirrors about the centre of the drawn ink box', () => {
  it('the midpoint of an atom and its image is the ink centre (pt / ptPerBlu)', () => {
    const c = make(ethanol());
    const before = c.getDoc();
    const scene = render(before);
    const b = scene.bounds!;
    const centreX = (b.x + b.w / 2) / scene.style.ptPerBlu;
    const first = Object.values(before.atoms)[0]!;
    c.run('select-all');
    c.store.dispatch({ type: 'flip', axis: 'h' });
    const after = c.getDoc().atoms[first.id]!;
    expect((first.x + after.x) / 2).toBeCloseTo(centreX, 6);
  });
});
