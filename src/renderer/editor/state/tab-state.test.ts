// SPEC-editor.md R57: the pure part of the per-tab state seam.
import { bounds, emptyDoc, setStyle } from '@core/doc-model';
import { resolveStyle } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import { defaultZoom } from '../model/viewport';
import { createEditorController, type EditorController } from './controller';
import {
  tabStateCanRedo,
  tabStateCanUndo,
  tabStateDirty,
  tabStateDoc,
  tabStateMarkSaved,
  tabStateView,
} from './tab-state';
import { addEthane, drawn, T0 } from './testing';

const make = (): EditorController => {
  const c = createEditorController({ clock: () => T0, logError: () => undefined });
  c.store.dispatch({ type: 'canvas-resized', size: { w: 1000, h: 600 } });
  return c;
};

const addBond = (c: EditorController): void =>
  c.store.dispatch({ type: 'commit', label: 'Add bond', recipe: addEthane });

describe('tab state predicates', () => {
  it('a new state holds the document, clean, with nothing to undo or redo', () => {
    const doc = drawn({ name: 'ethanol', x: 0, y: 0 });
    const s = make().newState(doc);
    expect(tabStateDoc(s)).toBe(doc);
    expect(tabStateDirty(s)).toBe(false);
    expect(tabStateCanUndo(s)).toBe(false);
    expect(tabStateCanRedo(s)).toBe(false);
  });

  it('follows the history: dirty and undoable after an edit, redoable after its undo', () => {
    const c = make();
    addBond(c);
    const edited = c.snapshotState();
    expect(tabStateDoc(edited)).toBe(c.getDoc());
    expect(tabStateDirty(edited)).toBe(true);
    expect(tabStateCanUndo(edited)).toBe(true);
    expect(tabStateCanRedo(edited)).toBe(false);
    c.run('undo');
    const undone = c.snapshotState();
    expect(tabStateDirty(undone)).toBe(false);
    expect(tabStateCanUndo(undone)).toBe(false);
    expect(tabStateCanRedo(undone)).toBe(true);
  });

  it('the view is the zoom and the BLU point at the canvas centre', () => {
    const c = make();
    c.run('zoom-in');
    c.store.dispatch({ type: 'pan-by', dx: -40, dy: 20 });
    const v = c.store.getState().viewport;
    const ptPerBlu = resolveStyle(c.getDoc().style).ptPerBlu;
    const k = v.zoom * (4 / 3) * ptPerBlu;
    const view = tabStateView(c.snapshotState());
    expect(view.zoom).toBe(v.zoom);
    expect(view.centre.x).toBeCloseTo((500 - v.pan.x) / k, 9);
    expect(view.centre.y).toBeCloseTo((300 - v.pan.y) / k, 9);
  });

  it('a state not yet shown reports the default zoom and the middle of the drawing', () => {
    const doc = setStyle(drawn({ name: 'toluene', x: 3, y: 1 }), { preset: 'journal' });
    const view = tabStateView(make().newState(doc));
    const box = bounds(doc);
    if (box === null) throw new Error('empty drawing');
    expect(view.zoom).toBe(defaultZoom(resolveStyle(doc.style).bondLength));
    expect(view.centre).toEqual({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
    expect(tabStateView(make().newState(emptyDoc(T0))).centre).toEqual({ x: 0, y: 0 });
  });
});

describe('tabStateMarkSaved (app-shell AS3)', () => {
  it('marking the drawing it holds makes it clean', () => {
    const c = make();
    addBond(c);
    const s = c.snapshotState();
    const saved = tabStateMarkSaved(s, tabStateDoc(s));
    expect(tabStateDirty(saved)).toBe(false);
    expect(tabStateDoc(saved)).toBe(tabStateDoc(s));
    expect(tabStateCanUndo(saved)).toBe(true);
  });

  it('marking an older drawing leaves it dirty, and undo back to that drawing is clean', () => {
    const c = make();
    addBond(c);
    const written = c.getDoc();
    addBond(c);
    const s = tabStateMarkSaved(c.snapshotState(), written);
    expect(tabStateDirty(s)).toBe(true);
    c.putState(s);
    expect(c.isDirty()).toBe(true);
    c.run('undo');
    expect(c.isDirty()).toBe(false);
  });

  it('does not change the state it is given', () => {
    const c = make();
    addBond(c);
    const s = c.snapshotState();
    tabStateMarkSaved(s, tabStateDoc(s));
    expect(tabStateDirty(s)).toBe(true);
  });

  it('marking the baseline it already has returns the same state', () => {
    const s = make().newState(emptyDoc(T0));
    expect(tabStateMarkSaved(s, tabStateDoc(s))).toBe(s);
  });
});
