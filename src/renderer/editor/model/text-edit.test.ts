import { describe, expect, it } from 'vitest';
import {
  deleteBackward,
  deleteForward,
  fromStored,
  fromText,
  insertLineBreak,
  insertText,
  moveSelection,
  reconcile,
  redoEdit,
  scriptAtCaret,
  selectAll,
  selectionOf,
  setSelection,
  textOf,
  toggleScript,
  undoEdit,
  type TextEditState,
} from './text-edit';

/** The runs as `text`, `sub(text)` or `sup(text)`, with `*` after an explicit one. */
const show = (s: TextEditState): string =>
  s.runs
    .map((r) => {
      const t = r.script === undefined ? r.text : `${r.script}(${r.text})`;
      return r.explicit === true ? `${t}*` : t;
    })
    .join(' ');

const caret = (s: TextEditState, at: number): TextEditState => setSelection(s, at, at);
const typed = (s: TextEditState, text: string): TextEditState => insertText(s, text);
const FACE = String.fromCodePoint(0x1f600);

describe('fromText and fromStored', () => {
  it('fromText selects everything (label editor)', () => {
    const s = fromText('OH');
    expect(textOf(s)).toBe('OH');
    expect(selectionOf(s)).toEqual({ start: 0, end: 2 });
    expect(show(s)).toBe('OH');
  });

  it('fromStored marks every character explicit and puts the caret at the end', () => {
    const s = fromStored([{ text: 'H' }, { text: '2', script: 'sub' }, { text: 'O' }]);
    expect(show(s)).toBe('H* sub(2)* O*');
    expect(selectionOf(s)).toEqual({ start: 3, end: 3 });
  });

  it('fromStored of nothing is empty text with a caret at 0', () => {
    const s = fromStored([]);
    expect(textOf(s)).toBe('');
    expect(selectionOf(s)).toEqual({ start: 0, end: 0 });
  });
});

describe('insertText', () => {
  it('types at the caret and moves it on', () => {
    const s = typed(typed(caret(fromText(''), 0), 'N'), 'H');
    expect(textOf(s)).toBe('NH');
    expect(selectionOf(s)).toEqual({ start: 2, end: 2 });
  });

  it('replaces the selection', () => {
    expect(textOf(typed(fromText('OH'), 'N'))).toBe('N');
  });

  it('inherits the script and explicit flag of the character before the caret', () => {
    const s0 = fromStored([{ text: 'H' }, { text: '2', script: 'sub' }]);
    expect(show(typed(s0, '3'))).toBe('H* sub(23)*');
  });

  it('at offset 0 inherits from the character after it', () => {
    const s0 = caret(fromStored([{ text: '2', script: 'sub' }]), 0);
    expect(show(typed(s0, '1'))).toBe('sub(12)*');
  });

  it('typing into plain, non-explicit text stays plain and non-explicit', () => {
    expect(show(typed(caret(fromText('ab'), 2), 'c'))).toBe('abc');
  });

  it('typing after a plain run that is followed by a sub run takes the plain one', () => {
    const s0 = caret(fromStored([{ text: 'H' }, { text: '2', script: 'sub' }, { text: 'O' }]), 1);
    expect(show(typed(s0, 'x'))).toBe('Hx* sub(2)* O*');
  });

  it('inserts an astral character whole', () => {
    const s = typed(caret(fromText(''), 0), FACE);
    expect(selectionOf(s)).toEqual({ start: 2, end: 2 });
  });

  it('typing nothing changes nothing', () => {
    const s = fromText('ab');
    expect(typed(s, '')).toBe(s);
  });
});

describe('pending script', () => {
  it('a pending sub on a collapsed caret applies to the next typed character, explicit', () => {
    const s0 = caret(fromText('H'), 1);
    const s1 = toggleScript(s0, 'sub');
    expect(s1.pending).toBe('sub');
    expect(scriptAtCaret(s1)).toBe('sub');
    const s2 = typed(s1, '2');
    expect(show(s2)).toBe('H sub(2)*');
    expect(s2.pending).toBeNull();
  });

  it('toggling the same script again turns it off (plain)', () => {
    const s = toggleScript(toggleScript(caret(fromText('H'), 1), 'sub'), 'sub');
    expect(scriptAtCaret(s)).toBe('plain');
    expect(show(typed(s, 'x'))).toBe('H x*');
  });

  it('inside a sub run the first toggle of sub means plain from here', () => {
    const s0 = caret(fromStored([{ text: 'H' }, { text: '22', script: 'sub' }]), 2);
    expect(scriptAtCaret(s0)).toBe('sub');
    const s1 = toggleScript(s0, 'sub');
    expect(s1.pending).toBe('plain');
    expect(show(typed(s1, 'x'))).toBe('H* sub(2)* x* sub(2)*');
  });

  it('clears when the caret moves', () => {
    const s = toggleScript(caret(fromText('HO'), 1), 'sup');
    expect(caret(s, 2).pending).toBeNull();
  });

  it('survives a selection set that changes nothing', () => {
    const s = toggleScript(caret(fromText('HO'), 1), 'sup');
    expect(caret(s, 1).pending).toBe('sup');
  });
});

describe('toggleScript on a selection', () => {
  it('sets the selected characters to sub and marks them explicit', () => {
    const s = toggleScript(setSelection(fromText('H2O'), 1, 2), 'sub');
    expect(show(s)).toBe('H sub(2)* O');
  });

  it('when every selected character already has the script it goes back to plain, still explicit', () => {
    const s0 = toggleScript(setSelection(fromText('H2O'), 1, 2), 'sub');
    const s1 = toggleScript(setSelection(s0, 1, 2), 'sub');
    expect(show(s1)).toBe('H 2* O');
  });

  it('a mixed selection becomes the script', () => {
    const s0 = toggleScript(setSelection(fromText('H2O'), 1, 2), 'sub');
    const s1 = toggleScript(setSelection(s0, 0, 3), 'sub');
    expect(show(s1)).toBe('sub(H2O)*');
  });

  it('sub then sup replaces the script', () => {
    const s = toggleScript(toggleScript(selectAll(fromText('x2')), 'sub'), 'sup');
    expect(show(s)).toBe('sup(x2)*');
  });

  it('keeps the selection', () => {
    const s = toggleScript(setSelection(fromText('H2O'), 1, 2), 'sub');
    expect(selectionOf(s)).toEqual({ start: 1, end: 2 });
  });
});

describe('deleting', () => {
  it('Backspace removes the character before the caret', () => {
    const s = deleteBackward(caret(fromText('NH2'), 2), 'char');
    expect(textOf(s)).toBe('N2');
    expect(selectionOf(s)).toEqual({ start: 1, end: 1 });
  });

  it('Backspace in the middle of a text keeps both sides', () => {
    expect(textOf(deleteBackward(caret(fromText('COOH'), 2), 'char'))).toBe('COH');
  });

  it('Delete removes the character after the caret', () => {
    expect(textOf(deleteForward(caret(fromText('NH2'), 1), 'char'))).toBe('N2');
  });

  it('at the ends there is nothing to delete and the state is returned as is', () => {
    const s = caret(fromText('NH2'), 0);
    expect(deleteBackward(s, 'char')).toBe(s);
    const e = caret(fromText('NH2'), 3);
    expect(deleteForward(e, 'char')).toBe(e);
  });

  it('with a selection either key deletes it', () => {
    const s = setSelection(fromText('NH2'), 1, 3);
    expect(textOf(deleteBackward(s, 'char'))).toBe('N');
    expect(textOf(deleteForward(s, 'char'))).toBe('N');
  });

  it('removes a surrogate pair whole', () => {
    expect(textOf(deleteBackward(caret(fromText(`a${FACE}b`), 3), 'char'))).toBe('ab');
    expect(textOf(deleteForward(caret(fromText(`a${FACE}b`), 1), 'char'))).toBe('ab');
  });

  it('a word delete goes to the start or end of the word', () => {
    expect(textOf(deleteBackward(caret(fromText('conc. H2SO4'), 11), 'word'))).toBe('conc. ');
    expect(textOf(deleteForward(caret(fromText('conc. H2SO4'), 0), 'word'))).toBe('. H2SO4');
  });

  it('a line delete goes to the start or end of the line', () => {
    expect(textOf(deleteBackward(caret(fromText('ab\ncd'), 4), 'line'))).toBe('ab\nd');
    expect(textOf(deleteForward(caret(fromText('ab\ncd'), 3), 'line'))).toBe('ab\n');
  });

  it('merges runs across a deleted boundary', () => {
    const s0 = fromStored([{ text: 'a' }, { text: 'X', script: 'sub' }, { text: 'b' }]);
    const s = deleteBackward(caret(s0, 2), 'char');
    expect(show(s)).toBe('ab*');
    expect(s.runs).toHaveLength(1);
  });
});

describe('line break', () => {
  it('inserts a newline at the caret', () => {
    const s = insertLineBreak(caret(fromText('ab'), 1));
    expect(textOf(s)).toBe('a\nb');
    expect(selectionOf(s)).toEqual({ start: 2, end: 2 });
  });
});

describe('setSelection and moveSelection', () => {
  it('clamps into the text and never splits a surrogate pair', () => {
    const s = fromText(`a${FACE}b`);
    expect(selectionOf(setSelection(s, -5, 99))).toEqual({ start: 0, end: 4 });
    expect(selectionOf(setSelection(s, 2, 2))).toEqual({ start: 1, end: 1 });
  });

  it('reports a backwards selection with start before end, anchor and focus kept', () => {
    const s = setSelection(fromText('abcd'), 3, 1);
    expect(selectionOf(s)).toEqual({ start: 1, end: 3 });
    expect(s.anchor).toBe(3);
    expect(s.focus).toBe(1);
  });

  it('returns the same state when nothing changes', () => {
    const s = setSelection(fromText('ab'), 0, 2);
    expect(setSelection(s, 0, 2)).toBe(s);
  });

  it('moves by character, extending with the anchor kept', () => {
    const s = moveSelection(caret(fromText('abc'), 1), 'right', false);
    expect(selectionOf(s)).toEqual({ start: 2, end: 2 });
    const e = moveSelection(caret(fromText('abc'), 1), 'right', true);
    expect(e.anchor).toBe(1);
    expect(e.focus).toBe(2);
  });

  it('collapsing a selection with Left goes to its start', () => {
    const s = moveSelection(setSelection(fromText('abc'), 1, 3), 'left', false);
    expect(selectionOf(s)).toEqual({ start: 1, end: 1 });
  });

  it('Home and End go to the line ends', () => {
    expect(selectionOf(moveSelection(caret(fromText('ab\ncd'), 4), 'home', false))).toEqual({
      start: 3,
      end: 3,
    });
    expect(selectionOf(moveSelection(caret(fromText('ab\ncd'), 0), 'end', false))).toEqual({
      start: 2,
      end: 2,
    });
  });

  it('steps over a surrogate pair as one character', () => {
    const s = moveSelection(caret(fromText(FACE), 0), 'right', false);
    expect(selectionOf(s)).toEqual({ start: 2, end: 2 });
  });
});

describe('local undo and redo (R7)', () => {
  it('undo restores the previous runs and selection, redo brings it back', () => {
    const s1 = typed(caret(fromText('NH'), 2), '2');
    expect(textOf(s1)).toBe('NH2');
    const u = undoEdit(s1);
    expect(textOf(u)).toBe('NH');
    expect(selectionOf(u)).toEqual({ start: 2, end: 2 });
    const r = redoEdit(u);
    expect(textOf(r)).toBe('NH2');
    expect(selectionOf(r)).toEqual({ start: 3, end: 3 });
  });

  it('a new edit clears redo', () => {
    const s = typed(undoEdit(typed(caret(fromText('N'), 1), 'H')), 'O');
    expect(redoEdit(s)).toBe(s);
  });

  it('undo with nothing to undo returns the same state', () => {
    const s = fromText('N');
    expect(undoEdit(s)).toBe(s);
    expect(redoEdit(s)).toBe(s);
  });

  it('a selection change alone is not an undo step', () => {
    const s0 = typed(caret(fromText(''), 0), 'a');
    expect(textOf(undoEdit(caret(s0, 0)))).toBe('');
  });

  it('a script toggle is one undo step', () => {
    const s1 = toggleScript(setSelection(fromText('H2O'), 1, 2), 'sub');
    expect(show(undoEdit(s1))).toBe('H2O');
  });

  it('undo clears a pending script', () => {
    const s = undoEdit(typed(toggleScript(caret(fromText('H'), 1), 'sub'), '2'));
    expect(s.pending).toBeNull();
  });
});

describe('reconcile (IME)', () => {
  it('turns the text the DOM now holds into one replacement', () => {
    const s = reconcile(caret(fromText('NH'), 1), 'N日H');
    expect(textOf(s)).toBe('N日H');
    expect(selectionOf(s)).toEqual({ start: 2, end: 2 });
  });

  it('replaces a selection', () => {
    expect(textOf(reconcile(setSelection(fromText('abc'), 1, 2), 'aXc'))).toBe('aXc');
  });

  it('is the same state when the text did not change', () => {
    const s = fromText('abc');
    expect(reconcile(s, 'abc')).toBe(s);
  });

  it('keeps the scripts of the untouched characters', () => {
    const s0 = fromStored([{ text: 'H' }, { text: '2', script: 'sub' }, { text: 'O' }]);
    const s = reconcile(s0, 'H2Oz');
    expect(textOf(s)).toBe('H2Oz');
    expect(s.runs[1]).toMatchObject({ text: '2', script: 'sub' });
  });
});
