import { canUndo, current, undoLabel, type Doc, type TextObject } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { insertText, selectionOf, setSelection, textOf } from '../model/text-edit';
import { bluToScreen } from '../model/viewport';
import type { EditorState } from './editor-state';
import { reduce, type EditorAction } from './reducer';
import { freshState, testContext } from './testing';

const ctx = testContext();
const run = (s: EditorState, a: EditorAction): EditorState => reduce(s, a, ctx);
const docOf = (s: EditorState): Doc => current(s.history);
const texts = (s: EditorState): TextObject[] =>
  Object.values(docOf(s).objects).filter((o): o is TextObject => o.type === 'text');

const textTool = (): EditorState => {
  let s = run(freshState(), { type: 'canvas-resized', size: { w: 1200, h: 700 } });
  s = run(s, { type: 'select-tool', tool: 'text' });
  return s;
};

const screenOf = (s: EditorState, x: number, y: number) => bluToScreen(s.viewport, { x, y }, 40);

/** A click of the Text tool at BLU (x, y): press and release. */
function click(s: EditorState, x: number, y: number): EditorState {
  const screen = screenOf(s, x, y);
  const ev = (type: 'down' | 'up') =>
    ({
      type,
      p: { x, y },
      screen,
      button: 0,
      mods: { shift: false, alt: false, ctrl: false },
    }) as const;
  return run(run(s, { type: 'pointer', event: ev('down') }), { type: 'pointer', event: ev('up') });
}

const typeInto = (s: EditorState, text: string): EditorState => {
  if (s.editing?.kind !== 'text') throw new Error('no text editor');
  return run(s, { type: 'edit-set', edit: insertText(s.editing.edit, text) });
};

const modelText = (s: EditorState): string => (s.editing === null ? '' : textOf(s.editing.edit));
const firstAt = (s: EditorState): { x: number; y: number } => texts(s)[0]?.at ?? { x: 0, y: 0 };

describe('Text tool in the reducer (T1, T2)', () => {
  it('a click opens the editor on a new text and leaves the document alone', () => {
    const s = click(textTool(), 2, 1);
    expect(s.editing).toMatchObject({ kind: 'text', target: { kind: 'new' }, bold: false });
    expect(texts(s)).toHaveLength(0);
    expect(canUndo(s.history)).toBe(false);
  });

  it('Enter commits "Add text" in one step; H2SO4 is finished with subscripts', () => {
    let s = typeInto(click(textTool(), 2, 1), 'H2SO4');
    s = run(s, { type: 'edit-commit' });
    expect(s.editing).toBeNull();
    expect(texts(s)).toHaveLength(1);
    expect(texts(s)[0]?.runs.map((r) => r.script)).toEqual([undefined, 'sub', undefined, 'sub']);
    expect(undoLabel(s.history)).toBe('Add text');
  });

  it('an empty text is never created', () => {
    const s = run(click(textTool(), 2, 1), { type: 'edit-commit' });
    expect(texts(s)).toHaveLength(0);
    expect(canUndo(s.history)).toBe(false);
  });

  it('Esc cancels: nothing is added', () => {
    const s = run(typeInto(click(textTool(), 2, 1), 'abc'), { type: 'edit-cancel' });
    expect(s.editing).toBeNull();
    expect(texts(s)).toHaveLength(0);
  });

  it('a click on an existing text opens it with its formatted runs; unchanged is no step', () => {
    let s = run(typeInto(click(textTool(), 2, 1), 'H2O'), { type: 'edit-commit' });
    const before = s.history;
    s = click(s, firstAt(s).x + 0.1, firstAt(s).y);
    expect(s.editing).toMatchObject({ kind: 'text', target: { kind: 'existing' } });
    expect(modelText(s)).toBe('H2O');
    s = run(s, { type: 'edit-commit' });
    expect(s.history).toBe(before);
  });

  it('editing an existing text is one "Edit text" step', () => {
    let s = run(typeInto(click(textTool(), 2, 1), 'heat'), { type: 'edit-commit' });
    s = click(s, firstAt(s).x + 0.1, firstAt(s).y);
    s = run(typeInto(s, ' 5'), { type: 'edit-commit' });
    expect(
      texts(s)[0]
        ?.runs.map((r) => r.text)
        .join(''),
    ).toBe('heat 5');
    expect(undoLabel(s.history)).toBe('Edit text');
  });

  it('emptying an existing text deletes it', () => {
    let s = run(typeInto(click(textTool(), 2, 1), 'x'), { type: 'edit-commit' });
    s = click(s, firstAt(s).x + 0.05, firstAt(s).y);
    if (s.editing?.kind !== 'text') throw new Error('not open');
    s = run(s, { type: 'edit-set', edit: setSelection(s.editing.edit, 0, 1) });
    if (s.editing?.kind !== 'text') throw new Error('not open');
    expect(selectionOf(s.editing.edit)).toEqual({ start: 0, end: 1 });
    s = run(s, { type: 'edit-set', edit: { ...s.editing.edit, runs: [], anchor: 0, focus: 0 } });
    s = run(s, { type: 'edit-commit' });
    expect(texts(s)).toHaveLength(0);
  });

  it('Select double-click on a text opens the editor', () => {
    let s = run(typeInto(click(textTool(), 2, 1), 'abc'), { type: 'edit-commit' });
    s = run(s, { type: 'select-tool', tool: 'select' });
    const at = firstAt(s);
    const screen = screenOf(s, at.x + 0.1, at.y);
    s = run(s, { type: 'pointer', event: { type: 'dblclick', p: at, screen } });
    expect(s.editing).toMatchObject({ kind: 'text', target: { kind: 'existing' } });
  });

  it('Undo does nothing while editing', () => {
    let s = run(typeInto(click(textTool(), 2, 1), 'abc'), { type: 'edit-commit' });
    s = click(s, firstAt(s).x + 0.1, firstAt(s).y);
    expect(run(s, { type: 'undo' })).toBe(s);
  });
});

describe('text options (T5)', () => {
  const open = (): EditorState => typeInto(click(textTool(), 2, 1), 'H2SO4');

  it('x2 on a selection toggles the sub and makes it explicit', () => {
    let s = open();
    if (s.editing?.kind !== 'text') throw new Error('not open');
    s = run(s, { type: 'edit-set', edit: setSelection(s.editing.edit, 4, 5) });
    s = run(s, { type: 'edit-script', script: 'sub' });
    expect(s.editing?.edit.runs.at(-1)).toMatchObject({ script: 'sub', explicit: true });
    s = run(s, { type: 'edit-script', script: 'sub' });
    expect(s.editing?.edit.runs.at(-1)).toEqual({ text: '4', explicit: true });
  });

  it('B and I toggle for the whole object and are committed on every run', () => {
    let s = open();
    s = run(run(s, { type: 'edit-style', flag: 'bold' }), { type: 'edit-style', flag: 'italic' });
    expect(s.editing).toMatchObject({ bold: true, italic: true });
    s = run(s, { type: 'edit-commit' });
    expect(texts(s)[0]?.runs.every((r) => r.bold === true && r.italic === true)).toBe(true);
    s = click(s, firstAt(s).x + 0.1, firstAt(s).y);
    s = run(s, { type: 'edit-style', flag: 'bold' });
    expect(s.editing).toMatchObject({ bold: false, italic: true });
  });

  it('an insert button puts plain text at the caret', () => {
    let s = run(open(), { type: 'edit-insert', text: 'Δ' });
    expect(modelText(s)).toBe('H2SO4Δ');
    s = run(s, { type: 'edit-commit' });
    expect(
      texts(s)[0]
        ?.runs.map((r) => r.text)
        .join(''),
    ).toBe('H2SO4Δ');
  });

  it('the options do nothing without a text editor', () => {
    const s = textTool();
    expect(run(s, { type: 'edit-script', script: 'sub' })).toBe(s);
    expect(run(s, { type: 'edit-style', flag: 'bold' })).toBe(s);
    expect(run(s, { type: 'edit-insert', text: 'Δ' })).toBe(s);
  });
});
