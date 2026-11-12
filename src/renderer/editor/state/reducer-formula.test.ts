// R51, C7, R53 U13 at the reducer: the formula switch is one commit on the whole document, keeps
// the selection and the tool, and keeps the zoom and the drawing's centre on screen.
import { current, setStyle, undoLabel, type Doc } from '@core/doc-model';
import { ringAtoms } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import { overlayGroups } from '../model/overlay';
import { messyScheme } from '../model/tidy-fixtures';
import { fitZoom, ptToScreen, type Viewport } from '../model/viewport';
import type { EditorState } from './editor-state';
import { TIDY_HINT } from './formula';
import { isDirty, reduce, type EditorAction } from './reducer';
import { drawn, freshState, testContext, testDoc, wholeOf } from './testing';

const ctx = testContext();
const run = (s: EditorState, a: EditorAction): EditorState => reduce(s, a, ctx);
const docOf = (s: EditorState): Doc => current(s.history);
const SIZE = { w: 1280, h: 722 };
const sized = (doc: Doc): EditorState =>
  run(freshState(doc), { type: 'canvas-resized', size: SIZE });
const toggle = (s: EditorState): EditorState => run(s, { type: 'toggle-formula' });
const ethanol = (): EditorState => sized(drawn({ name: 'ethanol', x: 0, y: 0 }));
/** Three molecules in a row: fits at 150 % in skeletal mode, not in structural mode. */
const row = (): EditorState =>
  sized(
    drawn(
      { name: 'ethanol', x: 0, y: 0 },
      { name: 'acetic acid', x: 4, y: 0 },
      { name: 'ethyl acetate', x: 8, y: 0 },
    ),
  );
const bounds = (s: EditorState) => ctx.derive.committed(docOf(s)).scene.bounds;
const centreOnScreen = (s: EditorState) => {
  const b = bounds(s);
  if (b === null) throw new Error('empty');
  return ptToScreen(s.viewport, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
};
const near = (a: { x: number; y: number }, b: { x: number; y: number }, tol: number): void => {
  expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(tol);
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(tol);
};

describe('toggle-formula (R51, C7)', () => {
  it('one commit "Show structural formula", one undo step; atoms and bonds untouched', () => {
    const before = ethanol();
    const s = toggle(before);
    expect(docOf(s).style.formula).toBe('structural');
    expect(s.history.past).toHaveLength(before.history.past.length + 1);
    expect(undoLabel(s.history)).toBe('Show structural formula');
    expect(docOf(s).atoms).toEqual(docOf(before).atoms);
    expect(docOf(s).bonds).toEqual(docOf(before).bonds);
  });

  it('structural goes back with "Show skeletal formula", and the document equals the start', () => {
    const before = ethanol();
    const back = toggle(toggle(before));
    expect(undoLabel(back.history)).toBe('Show skeletal formula');
    expect(docOf(back)).toEqual(docOf(before));
    expect(docOf(back).style.formula).toBeUndefined();
  });

  it('undo restores the document; redo switches again', () => {
    const before = ethanol();
    const undone = run(toggle(before), { type: 'undo' });
    expect(docOf(undone)).toEqual(docOf(before));
    expect(docOf(run(undone, { type: 'redo' })).style.formula).toBe('structural');
  });

  it('after saving, two switches leave the drawing clean', () => {
    const saved = run(ethanol(), { type: 'mark-saved' });
    expect(isDirty(saved)).toBe(false);
    expect(isDirty(toggle(saved))).toBe(true);
    expect(isDirty(toggle(toggle(saved)))).toBe(false);
  });

  it('keeps the selection and the tool', () => {
    const start = ethanol();
    const doc = docOf(start);
    const selected = run(
      { ...start, tool: 'atom' },
      { type: 'set-selection', selection: wholeOf(doc, Object.keys(doc.atoms) as never) },
    );
    const s = toggle(selected);
    expect(s.tool).toBe('atom');
    expect(s.selection).toEqual(selected.selection);
  });

  it('works on the whole document whatever is selected', () => {
    const start = sized(drawn({ name: 'ethanol', x: 0, y: 0 }, { name: 'toluene', x: 5, y: 0 }));
    const first = Object.keys(docOf(start).atoms)[0] as never;
    const sel = run(start, { type: 'set-selection', selection: wholeOf(docOf(start), [first]) });
    expect(docOf(toggle(sel)).style.formula).toBe('structural');
  });

  it('an empty skeletal document: nothing happens', () => {
    const s = sized(testDoc());
    expect(toggle(s)).toBe(s);
  });

  it('with an editor open or a gesture running nothing happens', () => {
    const s = ethanol();
    const editing = run(s, { type: 'open-label', atom: Object.keys(docOf(s).atoms)[0] as never });
    expect(toggle(editing)).toBe(editing);
    const gesture = { ...s, gesture: { kind: 'test' } } as EditorState;
    expect(toggle(gesture)).toBe(gesture);
  });
});

describe('U13: the view on a switch (R53)', () => {
  it('keeps the zoom and the ink-box centre at the same screen point; a drawing that fits is only recentred', () => {
    const before = ethanol();
    const s = toggle(before);
    expect(s.viewport.zoom).toBe(before.viewport.zoom);
    near(centreOnScreen(s), centreOnScreen(before), 0.5);
    expect(s.viewport.size).toEqual(before.viewport.size);
  });

  it('the bonds double on screen and the zoom does not change', () => {
    const before = ethanol();
    const s = toggle(before);
    const dist = (st: EditorState): number => {
      const sc = ctx.derive.committed(docOf(st)).scene;
      const [a, b] = Object.values(docOf(st).atoms);
      const p = ptToScreen(st.viewport, {
        x: a!.x * sc.style.ptPerBlu,
        y: a!.y * sc.style.ptPerBlu,
      });
      const q = ptToScreen(st.viewport, {
        x: b!.x * sc.style.ptPerBlu,
        y: b!.y * sc.style.ptPerBlu,
      });
      return Math.hypot(q.x - p.x, q.y - p.y);
    };
    expect(dist(s)).toBeCloseTo(2 * dist(before), 6);
  });

  it('a drawing near the edge that still fits is panned the least that shows it (V5)', () => {
    const before = ethanol();
    const shifted: EditorState = {
      ...before,
      viewport: {
        ...before.viewport,
        pan: { x: before.viewport.pan.x + 520, y: before.viewport.pan.y },
      },
    };
    const s = toggle(shifted);
    expect(s.viewport.zoom).toBe(shifted.viewport.zoom);
    const b = bounds(s);
    if (b === null) throw new Error('empty');
    const right = ptToScreen(s.viewport, { x: b.x + b.w, y: b.y }).x;
    expect(right).toBeLessThanOrEqual(SIZE.w - 48 + 1e-6);
  });

  it('a drawing that no longer fits zooms out to min(fit, z0), never in', () => {
    const before = row();
    expect(before.viewport.zoom).toBe(1.5);
    const s = toggle(before);
    const b = bounds(s);
    const expected = fitZoom(b, SIZE, 40);
    expect(expected).toBeLessThan(1.5);
    expect(s.viewport.zoom).toBe(expected);
    const back = toggle(s);
    expect(back.viewport.zoom).toBe(expected);
  });

  it('undo and redo of a switch do the same', () => {
    const before = ethanol();
    const switched = toggle(before);
    const undone = run(switched, { type: 'undo' });
    expect(undone.viewport.zoom).toBe(before.viewport.zoom);
    near(centreOnScreen(undone), centreOnScreen(switched), 0.5);
    const redone = run(undone, { type: 'redo' });
    expect(redone.viewport.zoom).toBe(switched.viewport.zoom);
    near(centreOnScreen(redone), centreOnScreen(undone), 0.5);
    const wide = row();
    const w1 = run(toggle(wide), { type: 'undo' });
    expect(w1.viewport.zoom).toBe(toggle(wide).viewport.zoom);
  });

  it('skeletal to structural to skeletal ends at the starting zoom and place when nothing zoomed out', () => {
    const before = ethanol();
    const back = toggle(toggle(before));
    expect(back.viewport.zoom).toBe(before.viewport.zoom);
    const pan = (v: Viewport) => v.pan;
    near(pan(back.viewport), pan(before.viewport), 1e-6);
  });

  it('the preset switch is unchanged (R38): it still keeps one bond as long on screen', () => {
    const s = run(toggle(ethanol()), { type: 'set-preset', preset: 'journal' });
    expect(s.viewport.zoom).toBeCloseTo(1.5 * (40 / 14.4), 9);
  });
});

describe('a switch of an empty structural document', () => {
  it('goes back to skeletal and leaves the viewport alone', () => {
    const start = sized(setStyle(testDoc(), { formula: 'structural' }));
    const s = toggle(start);
    expect(docOf(s).style.formula).toBeUndefined();
    expect(s.viewport).toEqual(start.viewport);
  });
});

describe('hover in structural mode (HV4, R52, R53)', () => {
  const structuralOf = (name: string): EditorState => {
    const s = sized(setStyle(drawn({ name, x: 0, y: 0 }), { formula: 'structural' }));
    return run(s, { type: 'select-tool', tool: 'bond' });
  };
  const hoverAt = (s: EditorState, id: string): EditorState => {
    const doc = docOf(s);
    const ppb = ctx.derive.committed(doc).scene.style.ptPerBlu;
    const atom = doc.atoms[id as never]!;
    const screen = ptToScreen(s.viewport, { x: atom.x * ppb, y: atom.y * ppb });
    return run(s, {
      type: 'hover-move',
      event: {
        type: 'move',
        screen,
        p: { x: atom.x, y: atom.y },
        button: 0,
        mods: { shift: false, alt: false, ctrl: false },
      },
    });
  };

  it('a chain carbon is hovered with the label box and the Bond tool shows no ghost', () => {
    const s = structuralOf('ethanol');
    const doc = docOf(s);
    const carbon = Object.values(doc.atoms).find((a) => a.element === 'C')!;
    const h = hoverAt(s, carbon.id);
    expect(h.hover).toMatchObject({ kind: 'atom', id: carbon.id });
    expect(h.preview).toBeNull();
    const scene = ctx.derive.committed(doc).scene;
    const groups = overlayGroups(h.hover as never, doc, scene, h.viewport);
    expect(groups.map((g) => g.kind)).toEqual(['hover-label']);
  });

  it('a ring carbon of toluene keeps its ghost and its skeleton-vertex circle', () => {
    const s = structuralOf('toluene');
    const doc = docOf(s);
    const rings = ringAtoms(doc);
    const carbon = Object.values(doc.atoms).find((a) => rings.has(a.id))!;
    const h = hoverAt(s, carbon.id);
    expect(h.hover).toMatchObject({ kind: 'atom', id: carbon.id });
    expect(h.preview).not.toBeNull();
    const scene = ctx.derive.committed(doc).scene;
    const groups = overlayGroups(h.hover as never, doc, scene, h.viewport);
    expect(groups.map((g) => g.kind)).toEqual(['hover']);
  });
});

describe('U16: the hint to tidy after a switch to structural (R55)', () => {
  const HINT = 'Press Tidy reaction to make room for the written carbons.';
  const scheme = (): EditorState => sized(messyScheme().doc);

  it('skeletal to structural with an arrow: the info notice, and nothing else moves', () => {
    const before = scheme();
    const s = toggle(before);
    expect(s.notice).toMatchObject({ kind: 'info', text: HINT });
    expect(TIDY_HINT).toBe(HINT);
    expect(docOf(s).atoms).toEqual(docOf(before).atoms);
    expect(docOf(s).objects).toEqual(docOf(before).objects);
    expect(s.history.past).toHaveLength(before.history.past.length + 1);
  });

  it('a second notice replaces it with a higher id (the existing notice rules)', () => {
    const s = toggle(scheme());
    const next = run(s, { type: 'notice-show', kind: 'info', text: 'Other' });
    expect(next.notice?.text).toBe('Other');
    expect(next.notice?.id).toBeGreaterThan(s.notice?.id ?? 0);
  });

  it('no notice without an arrow', () => {
    expect(toggle(ethanol()).notice).toBeNull();
  });

  it('no notice on switching back to skeletal, even with an arrow', () => {
    const structural = toggle(scheme());
    const back = toggle(run(structural, { type: 'notice-clear' }));
    expect(docOf(back).style.formula).toBeUndefined();
    expect(back.notice).toBeNull();
  });

  it('no notice on undo or redo of a switch', () => {
    const switched = toggle(scheme());
    const cleared = run(switched, { type: 'notice-clear' });
    expect(run(cleared, { type: 'undo' }).notice).toBeNull();
    const undone = run(switched, { type: 'undo' });
    expect(undone.notice).toBeNull();
    expect(run(undone, { type: 'redo' }).notice).toBeNull();
  });

  it('no notice when the switch does nothing (empty document, editor open)', () => {
    const empty = sized(testDoc());
    expect(toggle(empty).notice).toBeNull();
    const s = scheme();
    const editing = run(s, { type: 'open-label', atom: Object.keys(docOf(s).atoms)[0] as never });
    expect(toggle(editing).notice).toBeNull();
  });
});
