import { canUndo, current, undoLabel, type Doc, type ObjectId } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { messyScheme } from '../model/tidy-fixtures';
import { fitZoom, ptToScreen } from '../model/viewport';
import { createEditorController } from './controller';
import { EMPTY_SELECTION, type EditorState } from './editor-state';
import { reduce, type EditorAction } from './reducer';
import { TIDY_NOTHING } from './structure-commands';
import { drawn, freshState, T0, testContext } from './testing';

const ctx = testContext();
const run = (s: EditorState, a: EditorAction): EditorState => reduce(s, a, ctx);
const docOf = (s: EditorState): Doc => current(s.history);
const ready = (doc: Doc, size = { w: 1280, h: 740 }): EditorState =>
  run(freshState(doc), { type: 'canvas-resized', size });

describe('Tidy reaction in the editor (TR1-TR6, V5)', () => {
  it('is one "Tidy reaction" undo step and undo restores the messy layout exactly', () => {
    const { doc } = messyScheme();
    const s = ready(doc);
    const done = run(s, { type: 'tidy' });
    expect(undoLabel(done.history)).toBe('Tidy reaction');
    expect(done.history.past).toHaveLength(1);
    expect(docOf(done)).not.toEqual(doc);
    const back = run(done, { type: 'undo' });
    expect(JSON.stringify(docOf(back).atoms)).toBe(JSON.stringify(doc.atoms));
    expect(JSON.stringify(docOf(back).objects)).toBe(JSON.stringify(doc.objects));
  });

  it('without an arrow it says so and records no step', () => {
    const s = ready(drawn({ name: 'ethanol', x: 0, y: 0 }));
    const done = run(s, { type: 'tidy' });
    expect(done.notice?.text).toBe(TIDY_NOTHING);
    expect(done.notice?.text).toBe('Nothing to tidy: draw an arrow between the molecules first.');
    expect(canUndo(done.history)).toBe(false);
  });

  it('a tidy scheme tidied again changes nothing and records no step', () => {
    const once = run(ready(messyScheme().doc), { type: 'tidy' });
    const twice = run(once, { type: 'tidy' });
    expect(twice.history.past).toHaveLength(1);
  });

  it('V5: a scheme wider than the view zooms out to fit, never above the current zoom', () => {
    const { doc } = messyScheme();
    const small = { w: 500, h: 400 };
    const s = run(ready(doc, small), { type: 'zoom-reset' });
    const done = run(s, { type: 'tidy' });
    expect(done.viewport.zoom).toBeLessThan(s.viewport.zoom);
    expect(done.viewport.zoom).toBeLessThanOrEqual(s.viewport.zoom);
    // The drawing's ink is inside the canvas.
    const { scene } = ctx.derive.committed(docOf(done));
    const b = scene.bounds;
    if (b === null) throw new Error('no bounds');
    const a = ptToScreen(done.viewport, { x: b.x, y: b.y });
    const c = ptToScreen(done.viewport, { x: b.x + b.w, y: b.y + b.h });
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(c.x).toBeLessThanOrEqual(small.w);
    expect(fitZoom(b, small, scene.style.bondLength)).toBeLessThanOrEqual(s.viewport.zoom);
  });

  it('works on the selection only, and never while an editor or a gesture is open', () => {
    const { doc, arrow } = messyScheme();
    let s = ready(doc);
    s = {
      ...s,
      selection: { ...EMPTY_SELECTION, objects: new Set<ObjectId>([arrow]) },
    };
    const done = run(s, { type: 'tidy' });
    expect(undoLabel(done.history)).toBe('Tidy reaction');
    const open = run(ready(doc), {
      type: 'open-text',
      target: { kind: 'new', fresh: { at: { x: 0, y: 0 }, align: 'left' } },
    });
    expect(run(open, { type: 'tidy' })).toBe(open);
  });
});

describe('the tidy command (Ctrl+Shift+T)', () => {
  it('runs from the host and the keyboard command, and says so when there is no arrow', () => {
    const c = createEditorController({
      clock: () => T0,
      logError: () => undefined,
      doc: messyScheme().doc,
    });
    expect(c.canRun('tidy-reaction')).toBe(true);
    c.run('tidy-reaction');
    expect(c.undoLabel()).toBe('Tidy reaction');
    const none = createEditorController({
      clock: () => T0,
      logError: () => undefined,
      doc: drawn({ name: 'ethanol', x: 0, y: 0 }),
    });
    none.run('tidy-reaction');
    expect(none.store.getState().notice?.text).toContain('Nothing to tidy');
    expect(none.undoLabel()).toBeUndefined();
  });
});
