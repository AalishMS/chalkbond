import { addObject, emptyDoc, type Doc, type ObjectId, type TextObject } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { fromStored, fromText, insertText, setSelection, textOf, toggleScript } from './text-edit';
import { openText, textCommit, textStyleOf, type TextTarget } from './text-ops';

const NOW = '2026-01-01T00:00:00.000Z';
const fresh: TextTarget = { kind: 'new', fresh: { at: { x: 1, y: 2 }, align: 'left' } };

const withText = (runs: TextObject['runs']): [Doc, ObjectId] =>
  addObject(emptyDoc(NOW), { type: 'text', at: { x: 0, y: 0 }, runs, align: 'left' });

const texts = (doc: Doc): TextObject[] =>
  Object.values(doc.objects).filter((o): o is TextObject => o.type === 'text');

const typed = (s: string) => insertText(fromText(''), s);
const plain = { bold: false, italic: false };

describe('openText', () => {
  it('a new text is empty with the caret in it', () => {
    const o = openText(emptyDoc(NOW), fresh);
    expect(o && textOf(o.edit)).toBe('');
    expect(o?.bold).toBe(false);
  });

  it('a stored text loads with every character explicit and its bold and italic', () => {
    const [doc, id] = withText([{ text: 'H2O', bold: true }]);
    const o = openText(doc, { kind: 'existing', object: id });
    expect(o?.edit.runs.every((r) => r.explicit === true)).toBe(true);
    expect(o).toMatchObject({ bold: true, italic: false });
  });

  it('null for an object that is gone', () => {
    expect(openText(emptyDoc(NOW), { kind: 'existing', object: 'o9' as ObjectId })).toBeNull();
  });
});

describe('textStyleOf', () => {
  it('is bold only when every run is', () => {
    expect(textStyleOf([{ text: 'a', bold: true }, { text: 'b' }]).bold).toBe(false);
    expect(textStyleOf([{ text: 'a', italic: true }]).italic).toBe(true);
    expect(textStyleOf([])).toEqual({ bold: false, italic: false });
  });
});

describe('textCommit', () => {
  it('H2SO4 in a new text: runs H, sub 2, SO, sub 4, labelled "Add text"', () => {
    const doc = emptyDoc(NOW);
    const c = textCommit(doc, fresh, typed('H2SO4'), plain);
    expect(c?.label).toBe('Add text');
    const [t] = texts(c?.recipe(doc) ?? doc);
    expect(t?.runs).toEqual([
      { text: 'H' },
      { text: '2', script: 'sub' },
      { text: 'SO' },
      { text: '4', script: 'sub' },
    ]);
    expect(t?.at).toEqual({ x: 1, y: 2 });
    expect(t?.align).toBe('left');
  });

  it('bold and italic apply to every run', () => {
    const doc = emptyDoc(NOW);
    const c = textCommit(doc, fresh, typed('H2'), { bold: true, italic: true });
    const [t] = texts(c?.recipe(doc) ?? doc);
    expect(t?.runs.every((r) => r.bold === true && r.italic === true)).toBe(true);
  });

  it('an attachment is kept', () => {
    const [withArrow, arrow] = addObject(emptyDoc(NOW), {
      type: 'arrow',
      kind: 'forward',
      from: { x: 0, y: 0 },
      to: { x: 2, y: 0 },
    });
    const target: TextTarget = {
      kind: 'new',
      fresh: { at: { x: 1, y: -1 }, align: 'center', attachedTo: { arrow, slot: 'above' } },
    };
    const c = textCommit(withArrow, target, typed('heat'), plain);
    const [t] = texts(c?.recipe(withArrow) ?? withArrow);
    expect(t?.attachedTo).toEqual({ arrow, slot: 'above' });
    expect(t?.align).toBe('center');
  });

  it('empty or blank new text: no step', () => {
    const doc = emptyDoc(NOW);
    expect(textCommit(doc, fresh, fromText(''), plain)).toBeNull();
    expect(textCommit(doc, fresh, typed('  '), plain)).toBeNull();
  });

  it('a stored text opened and committed unchanged: no step', () => {
    const [doc, id] = withText([{ text: 'H' }, { text: '2', script: 'sub' }]);
    const target: TextTarget = { kind: 'existing', object: id };
    expect(textCommit(doc, target, fromStored(texts(doc)[0]?.runs ?? []), plain)).toBeNull();
  });

  it('a stored text emptied is deleted in one "Edit text" step', () => {
    const [doc, id] = withText([{ text: 'abc' }]);
    const target: TextTarget = { kind: 'existing', object: id };
    const emptied = { ...fromText(''), runs: [] };
    const c = textCommit(doc, target, emptied, plain);
    expect(c?.label).toBe('Edit text');
    expect(texts(c?.recipe(doc) ?? doc)).toHaveLength(0);
  });

  it('editing stored text changes only its runs', () => {
    const [doc, id] = withText([{ text: 'CO' }, { text: '2', script: 'sub' }]);
    const target: TextTarget = { kind: 'existing', object: id };
    const edit = insertText(fromStored([{ text: 'CO' }, { text: '2', script: 'sub' }]), 'H2');
    const c = textCommit(doc, target, edit, plain);
    expect(c?.label).toBe('Edit text');
    const [t] = texts(c?.recipe(doc) ?? doc);
    expect(t?.at).toEqual({ x: 0, y: 0 });
    expect(t?.runs.map((r) => r.text).join('')).toBe('CO2H2');
  });

  it('x2 on a selection is explicit: a plain 2 stays plain after finishing', () => {
    let s = typed('CO2');
    s = toggleScript(setSelection(s, 2, 3), 'sub');
    s = toggleScript(setSelection(s, 2, 3), 'sub');
    const doc = emptyDoc(NOW);
    const [t] = texts(textCommit(doc, fresh, s, plain)?.recipe(doc) ?? doc);
    expect(t?.runs).toEqual([{ text: 'CO2' }]);
  });
});
