// PR1 / V6 at the reducer: the Slides | Handout switch.
import { createNameIndex } from '@core/chem-core';
import { canUndo, current, emptyDoc, redoLabel, undoLabel, type Doc } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import compounds from '../../../../resources/compounds/compounds.json';
import { bluToScreen, ptToScreen, screenToBlu, zoomPercent } from '../model/viewport';
import type { EditorState } from './editor-state';
import { isDirty, reduce, type EditorAction } from './reducer';
import { freshState, testContext } from './testing';

const ctx = { ...testContext(), names: createNameIndex(compounds) };
const run = (s: EditorState, a: EditorAction): EditorState => reduce(s, a, ctx);
const sized = (doc?: Doc): EditorState =>
  run(freshState(doc), { type: 'canvas-resized', size: { w: 1280, h: 722 } });
const docOf = (s: EditorState): Doc => current(s.history);
const ester = (): EditorState =>
  run(sized(), { type: 'insert-text', text: 'ethanol + acetic acid -> ethyl acetate + water' });
const bondLength = (s: EditorState): number =>
  ctx.derive.committed(docOf(s)).scene.style.bondLength;

describe('set-preset (PR1, V6)', () => {
  it('switches the document to the journal preset in one step labelled "Switch to Handout style"', () => {
    const s = run(sized(), { type: 'set-preset', preset: 'journal' });
    expect(docOf(s).style.preset).toBe('journal');
    expect(s.history.past).toHaveLength(1);
    expect(undoLabel(s.history)).toBe('Switch to Handout style');
    expect(bondLength(s)).toBeCloseTo(14.4, 9);
  });

  it('keeps the on-screen bond length: zoom 150 % becomes 416.67 %, readout 417 %', () => {
    const before = sized();
    expect(before.viewport.zoom).toBe(1.5);
    const s = run(before, { type: 'set-preset', preset: 'journal' });
    expect(s.viewport.zoom).toBeCloseTo(1.5 * (40 / 14.4), 9);
    expect(zoomPercent(s.viewport.zoom)).toBe(417);
    const px = (state: EditorState): number =>
      bluToScreen(state.viewport, { x: 1, y: 0 }, bondLength(state)).x -
      bluToScreen(state.viewport, { x: 0, y: 0 }, bondLength(state)).x;
    expect(px(before)).toBeCloseTo(80, 9);
    expect(px(s)).toBeCloseTo(80, 9);
  });

  it('keeps the document point under the canvas centre where it was', () => {
    const before = ester();
    const centre = { x: 640, y: 361 };
    const was = screenToBlu(before.viewport, centre, 40);
    const s = run(before, { type: 'set-preset', preset: 'journal' });
    const now = screenToBlu(s.viewport, centre, 14.4);
    expect(now.x).toBeCloseTo(was.x, 9);
    expect(now.y).toBeCloseTo(was.y, 9);
  });

  it('leaves every atom where it is on screen (within 1 px; here exactly)', () => {
    const before = ester();
    const s = run(before, { type: 'set-preset', preset: 'journal' });
    for (const a of Object.values(docOf(before).atoms)) {
      const p = bluToScreen(before.viewport, a, 40);
      const q = bluToScreen(s.viewport, a, 14.4);
      expect(Math.abs(p.x - q.x)).toBeLessThan(1e-6);
      expect(Math.abs(p.y - q.y)).toBeLessThan(1e-6);
    }
  });

  it('switching back restores the starting zoom and pan', () => {
    const before = ester();
    const s = run(run(before, { type: 'set-preset', preset: 'journal' }), {
      type: 'set-preset',
      preset: 'slides',
    });
    expect(undoLabel(s.history)).toBe('Switch to Slides style');
    expect(s.viewport.zoom).toBeCloseTo(before.viewport.zoom, 9);
    expect(s.viewport.pan.x).toBeCloseTo(before.viewport.pan.x, 6);
    expect(s.viewport.pan.y).toBeCloseTo(before.viewport.pan.y, 6);
    expect(docOf(s).style.preset).toBe('slides');
  });

  it('records nothing for the preset the document already has', () => {
    const s = sized();
    expect(run(s, { type: 'set-preset', preset: 'slides' })).toBe(s);
    const h = run(s, { type: 'set-preset', preset: 'journal' });
    expect(run(h, { type: 'set-preset', preset: 'journal' })).toBe(h);
  });

  it('undo flips the preset back and the switch follows; the zoom stays (not part of history)', () => {
    const s = run(sized(), { type: 'set-preset', preset: 'journal' });
    const zoom = s.viewport.zoom;
    const u = run(s, { type: 'undo' });
    expect(docOf(u).style.preset).toBe('slides');
    expect(u.viewport.zoom).toBe(zoom);
    expect(canUndo(u.history)).toBe(false);
    expect(redoLabel(u.history)).toBe('Switch to Handout style');
    const r = run(u, { type: 'redo' });
    expect(docOf(r).style.preset).toBe('journal');
  });

  it('makes the document dirty, and clean again after undo', () => {
    const s = run(sized(), { type: 'set-preset', preset: 'journal' });
    expect(isDirty(s)).toBe(true);
    expect(isDirty(run(s, { type: 'undo' }))).toBe(false);
  });

  it('keeps the selection and the tool', () => {
    const before = ester();
    const s = run(before, { type: 'set-preset', preset: 'journal' });
    expect(s.selection).toEqual(before.selection);
    expect(s.tool).toBe(before.tool);
  });

  it('does nothing while an editor is open', () => {
    const open = run(run(sized(), { type: 'select-tool', tool: 'text' }), {
      type: 'open-text',
      target: { kind: 'new', fresh: { at: { x: 0, y: 0 }, align: 'left' } },
    });
    expect(open.editing).not.toBeNull();
    expect(run(open, { type: 'set-preset', preset: 'journal' })).toBe(open);
  });

  it('a loaded journal document opens at the Handout default zoom', () => {
    const journal: Doc = {
      ...emptyDoc('2026-01-01T00:00:00.000Z'),
      style: { preset: 'journal', overrides: {} },
    };
    const s = run(sized(), { type: 'load', doc: journal });
    expect(docOf(s).style.preset).toBe('journal');
    expect(zoomPercent(s.viewport.zoom)).toBe(417);
    expect(ptToScreen(s.viewport, { x: 0, y: 0 })).toEqual({ x: 640, y: 361 });
  });
});
